package com.gxdong.blog.config;

import com.gxdong.blog.service.AuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.util.Set;

/**
 * 访问密钥校验。刻意不用 Spring Security：
 * 整个授权模型就是一个布尔值（没有用户、角色、会话），上 Security 要写 60 行 filter
 * 去复现这 40 行拦截器，还得多关掉一堆默认行为（CSRF、随机密码、默认 401 页）。
 *
 * <p>密钥走请求头 {@code X-Access-Key} 而不是 Cookie/Session：
 * 请求头在「同源」与「跨源」两种部署形态下行为完全一致，天然免疫 CSRF
 * （浏览器不会自动携带），而且能直接用 curl 测。
 *
 * <p>唯一的例外是 {@code <img src>} 带不了自定义头。所以默认读接口是公开的
 * （「博客对所有人可浏览」是既定产品决策）；打开 {@code app.auth.protect-reads}
 * 后改为要求密钥，此时同时接受 {@code omb_key} Cookie 让图片还能显示。
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    /** 与前端约定的 Cookie 名，只在 protect-reads 打开时才可能被下发。 */
    public static final String KEY_COOKIE = "omb_key";

    private static final Set<String> READ_PATHS = Set.of("/api/ws", "/api/doc", "/api/img");

    private final AuthService authService;
    private final AppProperties props;

    public AuthInterceptor(AuthService authService, AppProperties props) {
        this.authService = authService;
        this.props = props;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws IOException {
        if (!(handler instanceof HandlerMethod method)) {
            return true;   // 静态资源等，不拦
        }

        boolean needKey = method.hasMethodAnnotation(RequireKey.class)
                || (props.isAuthProtectReads() && isReadPath(request));
        if (!needKey) {
            return true;
        }

        String key = request.getHeader("X-Access-Key");
        if (key == null || key.isBlank()) {
            key = readCookie(request);
        }
        if (authService.isKeyValid(key)) {
            return true;
        }

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"ok\":false,\"error\":\"访问密钥不正确\"}");
        return false;
    }

    /** protect-reads 打开时要保护的范围：目录树 / 正文 / 图片 / 上传图。 */
    private static boolean isReadPath(HttpServletRequest request) {
        String path = request.getRequestURI();
        return READ_PATHS.contains(path) || path.startsWith("/api/uploads");
    }

    /** 读取 omb_key Cookie。public 是给 AuthController 复用，避免同样的逻辑写两份。 */
    public static String readCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie c : cookies) {
            if (KEY_COOKIE.equals(c.getName())) {
                return c.getValue();
            }
        }
        return null;
    }
}
