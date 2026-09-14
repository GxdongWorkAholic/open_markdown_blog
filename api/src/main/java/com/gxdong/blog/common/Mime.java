package com.gxdong.blog.common;

import java.util.Locale;
import java.util.Map;

/**
 * 扩展名 → Content-Type。与旧 Node 服务的 MIME 表逐字一致。
 *
 * <p>注意表里**没有** pdf / md / txt / map —— 这些一律回落到 application/octet-stream。
 * 这是旧服务的行为，刻意不改：pdf 走 /api/doc 时本来就只返回 binary:true 不传字节。
 */
public final class Mime {

    private static final Map<String, String> TABLE = Map.ofEntries(
            Map.entry("html", "text/html; charset=utf-8"),
            Map.entry("js", "text/javascript; charset=utf-8"),
            Map.entry("css", "text/css; charset=utf-8"),
            Map.entry("json", "application/json; charset=utf-8"),
            Map.entry("svg", "image/svg+xml"),
            Map.entry("png", "image/png"),
            Map.entry("jpg", "image/jpeg"),
            Map.entry("jpeg", "image/jpeg"),
            Map.entry("gif", "image/gif"),
            Map.entry("webp", "image/webp"),
            Map.entry("ico", "image/x-icon"),
            Map.entry("woff", "font/woff"),
            Map.entry("woff2", "font/woff2"));

    private Mime() {
    }

    public static String ofExt(String ext) {
        if (ext == null) {
            return "application/octet-stream";
        }
        return TABLE.getOrDefault(ext.toLowerCase(Locale.ROOT), "application/octet-stream");
    }

    /** 从文件名取扩展名后再查表。 */
    public static String ofName(String name) {
        int i = name == null ? -1 : name.lastIndexOf('.');
        return ofExt(i < 0 ? "" : name.substring(i + 1));
    }
}
