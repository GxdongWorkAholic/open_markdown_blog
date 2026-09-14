package com.gxdong.blog.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.gxdong.blog.common.ApiException;
import com.gxdong.blog.config.RequireKey;
import com.gxdong.blog.model.AppConfig;
import com.gxdong.blog.service.ConfigService;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 设置读写。前端每次切换文件夹、打开文档都会 POST 一次（persist() 的三个调用点），
 * 所以这三个端点都在热路径上，不要在这里做重活。
 */
@RestController
public class ConfigController {

    private final ConfigService configService;

    public ConfigController(ConfigService configService) {
        this.configService = configService;
    }

    @GetMapping("/api/config")
    public AppConfig get() {
        return configService.get();
    }

    /** 写设置需要密钥 —— 旧 Node 服务这三个端点都是裸奔的。 */
    @PostMapping("/api/config")
    @RequireKey
    public Map<String, Object> save(@RequestBody(required = false) JsonNode body) {
        // 空 body 在旧服务里等价于 JSON.parse('') 抛错，所以同样返回 400
        if (body == null || body.isMissingNode()) {
            throw ApiException.badRequest("配置 JSON 解析失败");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("config", configService.save(body));
        return out;
    }

    @PostMapping("/api/config/reset")
    @RequireKey
    public Map<String, Object> reset() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("config", configService.reset());
        return out;
    }

    /**
     * 请求体不是合法 JSON 时的文案。
     * 刻意写在 Controller 内（局部 advice 优先于全局），因为 /api/auth/key 的同类
     * 失败文案是「JSON 解析失败」，两者不一样，不能共用一个全局处理器。
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> onBadJson(HttpMessageNotReadableException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "配置 JSON 解析失败");
        return ResponseEntity.badRequest().body(body);
    }
}
