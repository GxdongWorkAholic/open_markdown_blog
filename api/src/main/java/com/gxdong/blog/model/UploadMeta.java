package com.gxdong.blog.model;

import java.time.LocalDateTime;

/** 上传图片的元数据（图片字节本身是 app.img-dir 下的磁盘文件，不进数据库）。 */
public record UploadMeta(String name, long size, LocalDateTime uploadedAt) {
}
