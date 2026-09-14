package com.gxdong.blog.service;

import com.gxdong.blog.common.ApiException;
import com.gxdong.blog.config.AppProperties;
import com.gxdong.blog.model.UploadMeta;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 上传图片。字节写到磁盘（{@link UploadStore}），不再进数据库 BLOB。
 *
 * <p>好处：图片能用任何工具直接看、备份就是拷目录；库文件也不会被图片撑大。
 * 代价：多一个需要可写的目录（{@code app.img-dir}），启动时会做与数据目录同样的可写自检。
 *
 * <p>文件名规则与旧 Node 服务一致：{@code 年月日时分秒-16位随机串.扩展名}，
 * 所以文件名天然带时间戳、按名字倒序就是最新在前。
 */
@Service
public class UploadService {

    /** 与旧服务 IMG_EXTS 一致；错误文案里的顺序也照搬（Set 的插入顺序）。 */
    private static final List<String> IMG_EXTS = List.of("png", "jpg", "jpeg", "gif", "webp", "svg");
    private static final Set<String> IMG_SET = Set.copyOf(IMG_EXTS);

    private static final String RAND_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final int RAND_LEN = 16;
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final DateTimeFormatter MT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final UploadStore store;
    private final AppProperties props;
    private final SecureRandom random = new SecureRandom();

    public UploadService(UploadStore store, AppProperties props) {
        this.store = store;
        this.props = props;
    }

    /** 保存。返回 {name, url}，与旧服务一致。 */
    public Map<String, Object> save(String nameFromQuery, byte[] bytes) {
        String raw = (nameFromQuery == null || nameFromQuery.isBlank()) ? "upload.png" : nameFromQuery;
        String extWithDot = extWithDot(raw);
        // 注意去掉那个点再比对 —— 旧服务是 ext.slice(1)，集合里存的是不带点的 "png"/"jpg"。
        String ext = extWithDot.substring(1);
        if (!IMG_SET.contains(ext)) {
            throw ApiException.badRequest("只支持图片：" + String.join("/", IMG_EXTS));
        }
        if (bytes == null || bytes.length == 0) {
            throw ApiException.badRequest("空文件");
        }
        long max = props.getUploadMaxBytes();
        if (max > 0 && bytes.length > max) {
            throw new ApiException(413, "文件超过 " + (max / 1024 / 1024) + "MB 上限");
        }

        String fileName = LocalDateTime.now().format(STAMP) + "-" + randStr() + extWithDot;
        store.save(fileName, bytes);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", fileName);
        out.put("url", urlOf(fileName));
        return out;
    }

    /** 列表，最新在前。任何异常都不外抛 —— 目录读不到时返回空列表。 */
    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (UploadMeta m : store.listNewestFirst()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", m.name());
            item.put("url", urlOf(m.name()));
            item.put("size", m.size());
            item.put("mt", m.uploadedAt().format(MT));
            out.add(item);
        }
        return out;
    }

    /** 存的是文件名，所以先按 basename 归一化，等价于旧服务的 path.basename。 */
    public static String safeName(String name) {
        if (name == null || name.isBlank()) {
            throw ApiException.badRequest("非法路径");
        }
        Path p;
        try {
            p = Paths.get(name);
        } catch (Exception e) {
            throw ApiException.badRequest("非法路径");
        }
        Path base = p.getFileName();
        if (base == null) {
            throw ApiException.badRequest("非法路径");
        }
        return base.toString();
    }

    public byte[] bytes(String name) {
        return store.bytes(safeName(name));
    }

    public void delete(String name) {
        String safe = safeName(name);
        if (!store.delete(safe)) {
            throw ApiException.notFound("删除失败：" + safe + " 不存在");
        }
    }

    public String urlOf(String name) {
        return "/api/uploads/" + name;
    }

    private String randStr() {
        StringBuilder sb = new StringBuilder(RAND_LEN);
        for (int i = 0; i < RAND_LEN; i++) {
            sb.append(RAND_CHARS.charAt(random.nextInt(RAND_CHARS.length())));
        }
        return sb.toString();
    }

    /** 取小写扩展名（带点）。没有点则回落 .png —— 与旧服务的 path.extname(x) || '.png' 一致。 */
    private static String extWithDot(String name) {
        int i = name.lastIndexOf('.');
        if (i < 1) {
            return ".png";
        }
        return name.substring(i).toLowerCase(Locale.ROOT);
    }
}
