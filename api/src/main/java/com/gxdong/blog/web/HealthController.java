package com.gxdong.blog.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 健康检查。刻意不上 spring-boot-starter-actuator ——
 * 那会多一个依赖、多一批需要自己关掉的暴露端点，而这里只需要一个布尔值。
 * 反代的存活探测、以及部署后的自检都打这个接口。
 */
@RestController
public class HealthController {

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("version", "1.0.0");
        return body;
    }
}
