package com.gxdong.blog.service;

import com.gxdong.blog.common.ApiException;
import com.gxdong.blog.config.AppProperties;
import com.gxdong.blog.model.UploadMeta;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 上传图片的存储：**磁盘文件**，不是数据库里的 BLOB。
 *
 * <p>目录由 {@code app.img-dir} 指定，与 {@code app.data-dir} 是**两个平级目录**：
 * <pre>
 *   本地开发   &lt;仓库&gt;/file/img
 *   云端部署   /srv/open-markdown-blog/file/img
 * </pre>
 *
 * <p>文件名就是前端存的 {@code prefs.bgUrl}（裸文件名），对外 URL 仍然是
 * {@code /api/uploads/<名>} —— 所以换存储方式前端一行不用改。
 *
 * <p>目录在构造时（Bean 创建阶段）就建好并验可写，用的是与数据目录同一套检查，
 * 失败即启动失败并打印中文指引。
 */
@Component
public class UploadStore {

    /** 与 UploadService 的 IMG_EXTS 一致；列表时只认这些扩展名。 */
    private static final List<String> IMG_EXTS = List.of("png", "jpg", "jpeg", "gif", "webp", "svg");

    private final Path dir;

    public UploadStore(AppProperties props) {
        String raw = props.getImgDir();
        Path d = (raw == null || raw.isBlank())
                ? Path.of(System.getProperty("user.home"), ".open-markdown-blog", "img")
                : Path.of(raw);
        this.dir = DataDirService.ensureWritableDir(d, props.isDataCheck(),
                "图片目录", "--app.img-dir=/别的/可写/目录");
    }

    public Path dir() {
        return dir;
    }

    /** 按文件名倒序 —— 文件名以 yyyyMMddHHmmss 开头，所以倒序就是「最新在前」。 */
    public List<UploadMeta> listNewestFirst() {
        List<UploadMeta> out = new ArrayList<>();
        try (var ds = Files.newDirectoryStream(dir)) {
            for (Path p : ds) {
                String name = p.getFileName().toString();
                if (!isImage(name)) {
                    continue;
                }
                try {
                    BasicFileAttributes a = Files.readAttributes(p, BasicFileAttributes.class);
                    if (!a.isRegularFile()) {
                        continue;
                    }
                    out.add(new UploadMeta(name, a.size(),
                            LocalDateTime.ofInstant(a.lastModifiedTime().toInstant(), ZoneId.systemDefault())));
                } catch (IOException ignore) {
                    // 单个文件读不到就跳过，不影响整个列表
                }
            }
        } catch (IOException e) {
            return List.of();   // 目录读不到 → 当空列表，与旧行为一致
        }
        out.sort(Comparator.comparing(UploadMeta::name).reversed());
        return out;
    }

    public void save(String name, byte[] bytes) {
        try {
            Files.write(resolve(name), bytes);
        } catch (IOException e) {
            throw ApiException.serverError("保存失败：" + e.getMessage());
        }
    }

    /** 取字节；不存在或读不到返回 null（调用方据此回 404）。 */
    public byte[] bytes(String name) {
        try {
            return Files.readAllBytes(resolve(name));
        } catch (IOException e) {
            return null;
        }
    }

    /** 返回是否真的删掉了一个文件（用来区分 404）。 */
    public boolean delete(String name) {
        try {
            return Files.deleteIfExists(resolve(name));
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * 把文件名解析到图片目录内。落到目录外一律拒绝 ——
     * 存储换成文件系统之后，这一层是必须的（以前用 BLOB 时名字只是个键）。
     */
    private Path resolve(String name) {
        if (name == null || name.isBlank()) {
            throw ApiException.badRequest("非法路径");
        }
        Path p = dir.resolve(name).normalize();
        if (p.equals(dir) || !p.startsWith(dir)) {
            throw ApiException.badRequest("非法路径");
        }
        return p;
    }

    private static boolean isImage(String name) {
        int i = name.lastIndexOf('.');
        if (i < 0) {
            return false;
        }
        return IMG_EXTS.contains(name.substring(i + 1).toLowerCase(java.util.Locale.ROOT));
    }
}
