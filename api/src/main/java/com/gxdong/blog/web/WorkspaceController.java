package com.gxdong.blog.web;

import com.gxdong.blog.common.ApiException;
import com.gxdong.blog.common.Mime;
import com.gxdong.blog.model.TreeNode;
import com.gxdong.blog.service.FileTreeService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 目录树、正文、图片。
 *
 * <p>三个端点的**错误响应形状各不相同**，这是刻意保留旧服务的行为：
 * <ul>
 *   <li>{@code /api/ws} → JSON {@code {error, tree:[]}}（前端会读 data.error 显示在目录树位置）</li>
 *   <li>{@code /api/doc} → JSON {@code {error, text:""}}</li>
 *   <li>{@code /api/img} → **纯文本**，因为它是被 {@code <img src>} 请求的，前端 fetchJSON 根本不参与</li>
 * </ul>
 * 所以这三个方法不用 ApiException 统一抛，而是各自显式构造响应。
 */
@RestController
public class WorkspaceController {

    private final FileTreeService treeService;

    public WorkspaceController(FileTreeService treeService) {
        this.treeService = treeService;
    }

    /** 目录树。参数是工作区 id，不是绝对路径。 */
    @GetMapping("/api/ws")
    public ResponseEntity<Map<String, Object>> ws(@RequestParam(required = false) String ws) {
        Path base;
        try {
            base = treeService.resolveRoot(ws);
        } catch (ApiException e) {
            return ResponseEntity.status(e.getStatus()).body(wsError(e.getMessage()));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("root", base.toString());
        body.put("tree", treeService.collectDir(base, ""));
        return ResponseEntity.ok(body);
    }

    /** 读正文。文本类返回 {text,size,mt}；其余返回 {text:"",size,mt,binary:true}（不传字节）。 */
    @GetMapping("/api/doc")
    public ResponseEntity<Map<String, Object>> doc(@RequestParam(required = false) String ws,
                                                   @RequestParam(required = false) String rel) {
        String r = rel == null ? "" : rel;
        Path target;
        try {
            Path base = treeService.resolveRoot(ws);
            target = treeService.resolveInside(base, r);
        } catch (ApiException e) {
            return ResponseEntity.status(e.getStatus()).body(docError(e.getMessage()));
        }

        BasicFileAttributes attrs;
        try {
            attrs = Files.readAttributes(target, BasicFileAttributes.class);
        } catch (IOException e) {
            return ResponseEntity.status(404).body(docError("文件不存在：" + r));
        }
        if (!attrs.isRegularFile()) {
            return ResponseEntity.status(400).body(docError("不是文件：" + r));
        }

        String ext = FileTreeService.extOf(r);
        Map<String, Object> body = new LinkedHashMap<>();
        if (FileTreeService.isTextExt(ext)) {
            String text;
            try {
                // 刻意不用 Files.readString：遇到非法 UTF-8 会抛 MalformedInputException（→500），
                // 而旧服务的 readFileSync(p,'utf8') 是替换成 U+FFFD 后正常返回 200。
                text = new String(Files.readAllBytes(target), StandardCharsets.UTF_8);
            } catch (IOException e) {
                return ResponseEntity.status(500).body(docError("读取失败：" + e.getMessage()));
            }
            body.put("text", text);
        } else {
            body.put("text", "");
        }
        body.put("size", attrs.size());
        body.put("mt", FileTreeService.fmtMt(attrs.lastModifiedTime().toInstant()));
        if (!FileTreeService.isTextExt(ext)) {
            body.put("binary", true);   // 文本分支**没有**这个键，与旧服务一致
        }
        return ResponseEntity.ok(body);
    }

    /** 读图片/静态资源，原始字节。错误是纯文本。 */
    @GetMapping("/api/img")
    public ResponseEntity<byte[]> img(@RequestParam(required = false) String ws,
                                      @RequestParam(required = false) String rel) {
        Path target;
        try {
            Path base = treeService.resolveRoot(ws);
            target = treeService.resolveInside(base, rel);
        } catch (ApiException e) {
            return text(400, "非法路径");
        }
        byte[] bytes;
        try {
            bytes = Files.readAllBytes(target);
        } catch (IOException e) {
            return text(404, "not found");
        }
        String mime = Mime.ofName(target.getFileName().toString());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .contentLength(bytes.length)
                .cacheControl(CacheControl.noCache())
                .body(bytes);
    }

    private static Map<String, Object> wsError(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", message);
        body.put("tree", List.of());
        return body;
    }

    private static Map<String, Object> docError(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", message);
        body.put("text", "");
        return body;
    }

    private static ResponseEntity<byte[]> text(int status, String message) {
        return ResponseEntity.status(status)
                .contentType(new MediaType("text", "plain", StandardCharsets.UTF_8))
                .body(message.getBytes(StandardCharsets.UTF_8));
    }
}
