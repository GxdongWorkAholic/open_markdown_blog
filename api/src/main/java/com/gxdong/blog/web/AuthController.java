package com.gxdong.blog.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.gxdong.blog.common.ApiException;
import com.gxdong.blog.config.AuthInterceptor;
import com.gxdong.blog.config.RequireKey;
import com.gxdong.blog.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 访问密钥的校验与修改。
 *
 * <p>取代了旧服务的 {@code GET /api/secure}（把密文发给匿名客户端让前端自己解密）
 * 与 {@code POST /api/key}（旧实现**完全没有鉴权**，任何人都能改密钥）。
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final AttemptLimiter limiter = new AttemptLimiter();

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /** 客户端用它判断是否需要解锁。刻意不返回任何密文。 */
    @GetMapping("/status")
    public Map<String, Object> status() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("required", true);
        body.put("v", 1);
        return body;
    }

    /** 校验密钥。客户端带 X-Access-Key 请求，解得开 200，否则 401。 */
    @PostMapping("/verify")
    public ResponseEntity<Map<String, Object>> verify(
            @RequestHeader(value = "X-Access-Key", required = false) String key,
            HttpServletRequest request) {

        if (key == null || key.isBlank()) {
            key = AuthInterceptor.readCookie(request);
        }

        String ip = clientIp(request);
        if (limiter.tooMany(ip)) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("error", "尝试过于频繁，请稍后再试");
            return ResponseEntity.status(429).body(body);
        }

        // 21 万次 PBKDF2 本身已是天然节流器（约 5–10 次/秒/核），限速只是再加一层
        if (authService.isKeyValid(key)) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", true);
            return ResponseEntity.ok(body);
        }

        limiter.recordFailure(ip);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("error", "访问密钥不正确");
        return ResponseEntity.status(401).body(body);
    }

    /** 改密钥。需要当前密钥已通过校验（@RequireKey）。 */
    @PostMapping("/key")
    @RequireKey
    public Map<String, Object> changeKey(@RequestBody(required = false) JsonNode body) {
        if (body == null || body.isMissingNode()) {
            throw ApiException.badRequest("JSON 解析失败");
        }
        authService.changeKey(body.path("key").asText(null));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    /**
     * 与 /api/config 的同名处理器刻意分开：那边说的是「配置 JSON 解析失败」，
     * 这边说「JSON 解析失败」，两个文案不同，不能共用。
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> onBadJson(HttpMessageNotReadableException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "JSON 解析失败");
        return ResponseEntity.badRequest().body(body);
    }

    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return (comma > 0 ? xff.substring(0, comma) : xff).trim();
        }
        return request.getRemoteAddr();
    }

    /** 每 IP 5 分钟内最多 20 次失败尝试。内存实现，重启即清零 —— 够用且无状态。 */
    private static final class AttemptLimiter {

        private static final int MAX_FAILURES = 20;
        private static final long WINDOW_MS = 5 * 60_000L;
        /** 兜底：来源 IP 过多时整体清空，避免 map 无限增长。 */
        private static final int MAX_ENTRIES = 10_000;

        private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

        boolean tooMany(String ip) {
            Deque<Long> d = hits.get(ip);
            if (d == null) {
                return false;
            }
            synchronized (d) {
                prune(d);
                return d.size() >= MAX_FAILURES;
            }
        }

        void recordFailure(String ip) {
            if (hits.size() > MAX_ENTRIES) {
                hits.clear();
            }
            Deque<Long> d = hits.computeIfAbsent(ip, k -> new ArrayDeque<>());
            synchronized (d) {
                prune(d);
                d.addLast(System.currentTimeMillis());
            }
        }

        private static void prune(Deque<Long> d) {
            long cutoff = System.currentTimeMillis() - WINDOW_MS;
            while (!d.isEmpty() && d.peekFirst() < cutoff) {
                d.pollFirst();
            }
        }
    }
}
