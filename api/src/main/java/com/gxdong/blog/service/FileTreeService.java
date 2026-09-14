package com.gxdong.blog.service;

import com.gxdong.blog.common.ApiException;
import com.gxdong.blog.model.TreeNode;
import com.gxdong.blog.repo.WorkspaceRepository;
import com.ibm.icu.text.Collator;
import com.ibm.icu.text.RuleBasedCollator;
import com.ibm.icu.util.ULocale;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 目录扫描与路径解析。
 *
 * <p><b>安全边界的落点</b>：客户端只说「哪个工作区（id）+ 工作区内哪个相对路径」，
 * **绝对路径完全由服务端从库里查**。旧 Node 服务收的是客户端传来的 {@code root=} 绝对路径，
 * 于是 {@code /api/doc?root=/etc&rel=hosts.txt} 就能读进程有权限的任何文件 —— 这个洞在这里被堵死。
 * 另外还多加了一层 {@code toRealPath()} 校验，堵住「工作区内一个指向 /etc 的 symlink」这种逃逸。
 */
@Service
public class FileTreeService {

    /** 与旧服务逐字一致。 */
    private static final Set<String> DOC_EXTS = Set.of(
            "md", "markdown", "pdf", "txt", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "rtf");

    private static final Set<String> SKIP_DIRS = Set.of(
            "node_modules", ".git", ".svn", ".hg", "dist", ".idea", ".vscode");

    /** 旧服务：`${y}-${m}-${d} ${hh}:${mm}` 本地时间，无秒、无时区、无 T。 */
    private static final DateTimeFormatter MT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final WorkspaceRepository wsRepo;

    /**
     * 中文排序。旧服务用的是 ICU 的 {@code localeCompare(name, 'zh')}，
     * 这里用同一个 ICU 库（icu4j）并显式对齐 ECMAScript 的默认选项。
     *
     * <p>这三项都必须显式设 —— ICU4J 的 RuleBasedCollator 默认值与 ECMAScript
     * 的 {@code Intl.Collator} 默认值不一样，实测（23 个中英数字混排样例）：
     * <pre>
     *   setStrength(TERTIARY)              // 对应 sensitivity: 'variant'
     *   setAlternateHandlingShifted(false) // 对应 ignorePunctuation: false，即标点参与比较
     *   setNumericCollation(false)         // 对应 numeric: false，即 "10" 排在 "2" 前面
     * </pre>
     * 只有这一组组合能与 Node 逐位一致；换成 shifted=true 连第一个位置都会不同。
     *
     * <p>JDK 自带的 {@link java.text.Collator} 做不到：它不应用 CLDR 的 zh 的
     * {@code [reorder Hani]}（汉字提前），而且默认把标点当可忽略元素。
     *
     * <p>RuleBasedCollator 不是线程安全的，所以放 ThreadLocal。
     */
    private final ThreadLocal<RuleBasedCollator> collator = ThreadLocal.withInitial(() -> {
        RuleBasedCollator c = (RuleBasedCollator) Collator.getInstance(ULocale.SIMPLIFIED_CHINESE);
        c.setStrength(Collator.TERTIARY);
        c.setAlternateHandlingShifted(false);
        c.setNumericCollation(false);
        return c;
    });

    public FileTreeService(WorkspaceRepository wsRepo) {
        this.wsRepo = wsRepo;
    }

    // ─────────── 路径解析（安全边界）───────────

    /** 按工作区 id 反查根目录，并校验它确实存在且是目录。 */
    public Path resolveRoot(String wsId) {
        if (wsId == null || wsId.isBlank()) {
            throw ApiException.badRequest("缺少 ws 参数");
        }
        String rootPath = wsRepo.findRoot(wsId)
                .orElseThrow(() -> ApiException.notFound("工作区不存在：" + wsId));
        Path base = Path.of(rootPath).toAbsolutePath().normalize();
        if (!Files.exists(base)) {
            throw ApiException.notFound("路径不存在：" + base);
        }
        if (!Files.isDirectory(base)) {
            throw ApiException.badRequest("不是目录：" + base);
        }
        return base;
    }

    /** 把工作区内的相对路径解析成绝对路径，越界一律拒绝。 */
    public Path resolveInside(Path base, String rel) {
        String r = rel == null ? "" : rel;
        if (r.indexOf('\0') >= 0) {
            throw ApiException.badRequest("非法路径");
        }
        Path target;
        try {
            // 绝对路径的 rel 会让 resolve 丢掉 base —— 正是我们要拒绝的情况
            Path relPath = Path.of(r);
            if (relPath.isAbsolute()) {
                throw ApiException.badRequest("非法路径");
            }
            target = base.resolve(relPath).normalize();
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.badRequest("非法路径");
        }
        if (!target.equals(base) && !target.startsWith(base)) {
            throw ApiException.badRequest("非法路径");
        }
        // 再对真实路径校验一次：工作区内一个指向 /etc 的符号链接能绕过上面的前缀检查
        if (Files.exists(target)) {
            try {
                Path real = target.toRealPath();
                Path realBase = base.toRealPath();
                if (!real.equals(realBase) && !real.startsWith(realBase)) {
                    throw ApiException.badRequest("非法路径");
                }
            } catch (IOException e) {
                throw ApiException.badRequest("非法路径");
            }
        }
        return target;
    }

    // ─────────── 目录扫描 ───────────

    /**
     * 递归收集文档。与旧服务 collectDir 的规则逐条对应：
     * 跳过以 . 开头与 SKIP_DIRS 里的项、只收 DOC_EXTS 里的文件、
     * **不含任何文档的目录整条丢弃**、符号链接一律丢弃、读不到的目录静默消失。
     */
    public List<TreeNode> collectDir(Path abs, String rel) {
        List<Path> entries = readDirSafe(abs);
        if (entries == null) {
            return List.of();
        }
        entries.sort(Comparator.comparing(p -> p.getFileName().toString(), collator.get()));

        List<TreeNode> out = new ArrayList<>();
        for (Path e : entries) {
            String name = e.getFileName().toString();
            if (name.startsWith(".") || SKIP_DIRS.contains(name)) {
                continue;
            }
            String p = rel.isEmpty() ? name : rel + "/" + name;

            // 符号链接直接丢：Node 的 Dirent.isDirectory()/isFile() 对 symlink 都是 false，
            // 两边行为一致，同时也避免了链接成环导致的无限递归。
            if (Files.isSymbolicLink(e)) {
                continue;
            }
            if (Files.isDirectory(e, LinkOption.NOFOLLOW_LINKS)) {
                List<TreeNode> children = collectDir(e, p);
                if (!children.isEmpty()) {
                    out.add(TreeNode.dir(name, p, children));
                }
            } else if (Files.isRegularFile(e, LinkOption.NOFOLLOW_LINKS)) {
                String ext = extOf(name);
                if (!DOC_EXTS.contains(ext)) {
                    continue;
                }
                try {
                    BasicFileAttributes a = Files.readAttributes(e, BasicFileAttributes.class);
                    out.add(TreeNode.file(name, p, a.size(), fmtMt(a.lastModifiedTime().toInstant()), ext));
                } catch (IOException ignore) {
                    // 单个文件 stat 失败就跳过它，不影响整棵树
                }
            }
        }
        return out;
    }

    private List<Path> readDirSafe(Path dir) {
        List<Path> out = new ArrayList<>();
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir)) {
            for (Path p : ds) {
                out.add(p);
            }
        } catch (IOException e) {
            return null;   // 权限不足 / 不存在 → 整棵子树消失，与旧服务一致
        }
        return out;
    }

    /** 本地时间 YYYY-MM-DD HH:mm。服务器上必须设对 TZ（run.sh 的 APP_TZ），否则与旧服务对不上。 */
    public static String fmtMt(Instant instant) {
        return MT_FMT.format(instant.atZone(ZoneId.systemDefault()));
    }

    /** 扩展名：最后一个点之后、小写；没有点则为空串。 */
    public static String extOf(String name) {
        int i = name.lastIndexOf('.');
        return i < 0 ? "" : name.substring(i + 1).toLowerCase(Locale.ROOT);
    }

    /** 正文可读的扩展名（其余走 binary 分支）。与旧服务 apiDoc 的判断一致。 */
    public static boolean isTextExt(String ext) {
        return "md".equals(ext) || "markdown".equals(ext) || "txt".equals(ext);
    }
}
