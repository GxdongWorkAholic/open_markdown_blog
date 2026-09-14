package com.gxdong.blog.service;

import com.gxdong.blog.config.AppProperties;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 数据目录（H2 库文件所在）的解析与可写自检。
 *
 * <p>之所以要在建 Bean 的时候就检查，是因为 {@code spring.sql.init} 会立刻建数据库连接，
 * 等到 ApplicationRunner 再报错已经太晚、现象也难看。
 *
 * <p>上传图片的目录（{@code app.img-dir}）用同一个 {@link #ensureWritableDir} 做检查，
 * 见 UploadStore —— 那是另一个平级目录，不是一个套一个。
 */
@Service
public class DataDirService {

    private final AppProperties props;
    private volatile Path base;
    private final Object lock = new Object();

    public DataDirService(AppProperties props) {
        this.props = props;
    }

    /** 解析数据目录；首次调用时建目录并真写一个探针文件验可写。失败直接抛异常（启动失败）。 */
    public Path ensureWritable() {
        Path cached = base;
        if (cached != null) {
            return cached;
        }
        synchronized (lock) {
            if (base == null) {
                String raw = props.getDataDir();
                Path dir = (raw == null || raw.isBlank())
                        ? Path.of(System.getProperty("user.home"), ".open-markdown-blog")
                        : Path.of(raw);
                base = ensureWritableDir(dir, props.isDataCheck(), "数据目录", "--app.data-dir=/别的/可写/目录");
            }
            return base;
        }
    }

    /**
     * 建目录 + 可写自检，两个需要可写的目录（数据、图片）共用。
     *
     * @param check 为 false 则只规范化路径、不做检查（{@code app.data-check=false}，排障用）
     */
    public static Path ensureWritableDir(Path dir, boolean check, String label, String flagHint) {
        Path abs = dir.toAbsolutePath().normalize();
        if (!check) {
            return abs;
        }
        try {
            Files.createDirectories(abs);
            // 真写一次，而不是 Files.isWritable() —— 后者在「只读挂载 + root 用户」下会撒谎
            Path probe = Files.createTempFile(abs, ".write-probe", ".tmp");
            Files.writeString(probe, "ok", StandardCharsets.UTF_8);
            Files.delete(probe);
        } catch (IOException | SecurityException e) {
            throw new IllegalStateException("""
                    %s 不可写：%s
                      当前用户：%s
                      原因：%s

                    怎么办：
                      1) 建好目录并把属主改成当前用户（服务器上就是跑 run.sh 的那个用户）
                           sudo mkdir -p %s && sudo chown -R $(id -un) %s
                      2) 或换个可写目录：
                           %s
                    确实要跳过自检（不推荐，配置会存不住）：--app.data-check=false
                    """.formatted(label, abs, System.getProperty("user.name"), e.getMessage(),
                    abs, abs, flagHint));
        }
        return abs;
    }

    /** H2 的 JDBC URL 里不能出现反斜杠（会被当转义符），所以统一转成正斜杠。 */
    public static String slash(Path p) {
        return p.toString().replace('\\', '/');
    }
}
