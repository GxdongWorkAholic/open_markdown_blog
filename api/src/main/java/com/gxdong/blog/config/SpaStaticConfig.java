package com.gxdong.blog.config;

import com.gxdong.blog.service.DataDirService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 可选：由后端顺带托管前端构建产物（{@code dist/}）。
 *
 * <p>默认关闭 —— 留空的 {@code app.static-dir} 就意味着「静态文件不归我管」，这里什么都不做。
 * 一旦配了 {@code app.static-dir}，这个 jar 就自带静态托管：
 * 一个进程一个端口就是全站，服务器上只要一个 JRE。
 *
 * <p>缺失文件的兜底（SPA history fallback）在 {@link SpaFallbackAdvice}，
 * 因为那需要捕获异常、而这个类只负责注册资源处理器。
 */
@Configuration
public class SpaStaticConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(SpaStaticConfig.class);

    private final AppProperties props;

    public SpaStaticConfig(AppProperties props) {
        this.props = props;
    }

    /** 配了 app.static-dir 且目录存在时才算开启。 */
    public static Path resolveStaticDir(AppProperties props) {
        String raw = props.getStaticDir();
        if (raw == null || raw.isBlank()) {
            return null;
        }
        Path dir = Path.of(raw).toAbsolutePath().normalize();
        return Files.isDirectory(dir) ? dir : null;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path dir = resolveStaticDir(props);
        if (dir == null) {
            if (props.getStaticDir() != null && !props.getStaticDir().isBlank()) {
                log.warn("[blog-api] app.static-dir 指向的不是一个目录，静态托管已关闭：{}", props.getStaticDir());
            }
            return;
        }
        // 映射到 /**，但 /api/** 有自己的 @RequestMapping，控制器优先级更高，不会被这里截走。
        // toUri().toString() 会给出 file:///E:/... 这种形式，正斜杠与盘符都由它处理，比手工拼字符串可靠。
        registry.addResourceHandler("/**")
                .addResourceLocations(dir.toUri().toString())
                // 交给浏览器每次带 If-Modified-Since 回源（Spring 会回 304），
                // 免得 index.html 被缓存住、发新版本后用户看到的还是旧的。
                .setCacheControl(CacheControl.noCache());
        log.info("[blog-api] 静态托管已开启：{}", DataDirService.slash(dir));
    }
}
