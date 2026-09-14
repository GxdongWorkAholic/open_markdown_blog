package com.gxdong.blog.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;
    private final AppProperties props;

    public WebMvcConfig(AuthInterceptor authInterceptor, AppProperties props) {
        this.authInterceptor = authInterceptor;
        this.props = props;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor).addPathPatterns("/api/**");
    }

    /**
     * 默认不启用 CORS —— 部署时由同机的 Caddy（或 nginx）把 /api 反代到本服务，天然同源。
     * 只有真的把前端放到别的源（比如 CDN）时才需要设 app.cors-allowed-origins。
     *
     * <p>注意：跨源部署下 {@code <img src>} 带不了 X-Access-Key，所以一旦同时打开
     * protect-reads，正文里的图片会失效。同源部署没有这个问题。
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        String origins = props.getCorsAllowedOrigins();
        if (origins == null || origins.isBlank()) {
            return;
        }
        String[] list = origins.split(",");
        for (int i = 0; i < list.length; i++) {
            list[i] = list[i].trim();
        }
        registry.addMapping("/api/**")
                .allowedOrigins(list)
                .allowedMethods("GET", "POST", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "X-Access-Key")
                .maxAge(3600);
    }
}
