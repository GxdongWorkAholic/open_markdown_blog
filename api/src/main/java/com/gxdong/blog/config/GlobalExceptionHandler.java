package com.gxdong.blog.config;

import com.gxdong.blog.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 统一把异常翻成 {"error":"中文文案"}。
 *
 * <p>刻意不写 {@code @ExceptionHandler(Exception.class)} 兜底：那会把 Spring 自己的
 * 404/405（NoResourceFoundException 等）也吞成 500，反而掩盖问题。
 * 未预期的异常保持 Spring Boot 的默认行为，便于排障。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", e.getMessage());
        return ResponseEntity.status(e.getStatus()).body(body);
    }

    /** 文件读写等 IO 失败：对外的文案沿用旧 Node 服务的说法，细节只进日志。 */
    @ExceptionHandler(java.io.IOException.class)
    public ResponseEntity<Map<String, Object>> handleIo(java.io.IOException e) {
        log.warn("IO 失败", e);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "节点操作失败：" + e.getMessage());
        return ResponseEntity.status(500).body(body);
    }
}
