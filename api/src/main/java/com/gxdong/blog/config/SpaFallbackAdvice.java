package com.gxdong.blog.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 静态文件没找到时的兜底。
 *
 * <p><b>非 /api 的路径</b> → 转发给 {@code /index.html}。Vue Router 用的是 history 模式，
 * 直接访问 {@code /settings} 这类前端路由时磁盘上并没有这个文件，得让前端自己接。
 * 这与旧 Node 服务、以及 nginx 的 {@code try_files $uri $uri/ /index.html} 是同一个行为。
 *
 * <p><b>/api/ 的路径</b> → 保持 JSON 的 404，绝不返回 index.html ——
 * 否则前端的 fetchJSON 会拿到一坨 HTML 再解析失败，报出看不懂的错（这正是本项目一开始踩过的坑）。
 *
 * <p>刻意用 {@code @ControllerAdvice} 而不是 {@code @RestControllerAdvice}：
 * 后者会把返回的字符串当成响应体写出去，而这里需要它被当成视图名（{@code forward:}）。
 */
@ControllerAdvice
public class SpaFallbackAdvice {

    private final AppProperties props;

    public SpaFallbackAdvice(AppProperties props) {
        this.props = props;
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public Object onResourceMissing(HttpServletRequest request) {
        String uri = request.getRequestURI();

        if (uri != null && (uri.equals("/api") || uri.startsWith("/api/"))) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("error", "接口不存在：" + uri);
            return ResponseEntity.status(404).contentType(MediaType.APPLICATION_JSON).body(body);
        }

        // 没开静态托管就维持原样（404），别凭空造出一个 forward
        if (SpaStaticConfig.resolveStaticDir(props) == null) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("error", "not found");
            return ResponseEntity.status(404).contentType(MediaType.APPLICATION_JSON).body(body);
        }

        return "forward:/index.html";
    }
}
