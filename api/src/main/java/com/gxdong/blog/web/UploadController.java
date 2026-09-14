package com.gxdong.blog.web;

import com.gxdong.blog.common.Mime;
import com.gxdong.blog.config.RequireKey;
import com.gxdong.blog.service.UploadService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 上传图片的增删查。
 *
 * <p>两个端点用 {@code /api/uploads/{*rest}} 而不是 {@code /{name}}：
 * 旧服务对路径取的是 {@code path.basename()}，也就是 {@code /api/uploads/a/b.png} 会去取
 * {@code b.png}。用单段模板的话这种请求会 404，行为就不一致了。
 */
@RestController
public class UploadController {

    private static final String PREFIX = "/api/uploads/";

    private final UploadService uploads;

    public UploadController(UploadService uploads) {
        this.uploads = uploads;
    }

    /** 原始 body（**不是** multipart）—— 前端是 fetch(url, { body: file })，改不得。 */
    @PostMapping("/api/upload")
    @RequireKey
    public Map<String, Object> upload(@RequestParam(required = false) String name,
                                      @RequestBody(required = false) byte[] body) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.putAll(uploads.save(name, body));
        return out;
    }

    /** 列表。任何情况下都返回 200 + files 数组（拿不到就是空列表）。 */
    @GetMapping("/api/uploads")
    public Map<String, Object> list() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("files", uploads.list());
        return out;
    }

    /**
     * 取图片字节。错误是**纯文本** —— 这个 URL 是被 {@code <img src>} 请求的，
     * 前端 fetchJSON 不参与，返回 JSON 反而看不出问题。
     */
    @GetMapping("/api/uploads/{*rest}")
    public ResponseEntity<byte[]> get(HttpServletRequest request) {
        byte[] bytes = uploads.bytes(nameFrom(request));
        if (bytes == null) {
            return plainText(404, "not found");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(Mime.ofName(nameFrom(request))))
                .contentLength(bytes.length)
                // 文件名含时间戳+随机串，内容不变 → 长缓存，与旧服务一致
                .header("Cache-Control", "public, max-age=31536000, immutable")
                .body(bytes);
    }

    @DeleteMapping("/api/uploads/{*rest}")
    @RequireKey
    public Map<String, Object> delete(HttpServletRequest request) {
        uploads.delete(nameFrom(request));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    /** 取 URI 里 /api/uploads/ 之后那段，解码后取 basename（等价于旧服务的 path.basename）。 */
    private static String nameFrom(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (uri == null || !uri.startsWith(PREFIX)) {
            return "";
        }
        String rest = uri.substring(PREFIX.length());
        try {
            // 先把字面 + 保护起来再解码，避免它被当成空格
            rest = URLDecoder.decode(rest.replace("+", "%2B"), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return "";
        }
        int slash = rest.lastIndexOf('/');
        return slash >= 0 ? rest.substring(slash + 1) : rest;
    }

    private static ResponseEntity<byte[]> plainText(int status, String message) {
        return ResponseEntity.status(status)
                .contentType(new MediaType("text", "plain", StandardCharsets.UTF_8))
                .body(message.getBytes(StandardCharsets.UTF_8));
    }
}
