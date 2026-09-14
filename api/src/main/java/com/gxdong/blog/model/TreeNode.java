package com.gxdong.blog.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * 目录树节点。
 *
 * <p>字段声明顺序即 JSON 输出顺序，且靠 {@code NON_NULL} 让空字段整条消失，
 * 于是两个变体的形状与旧 Node 服务逐字一致：
 * <pre>
 *   目录 → {"n":..,"p":..,"d":[..]}
 *   文件 → {"n":..,"p":..,"size":..,"mt":..,"ext":..}
 * </pre>
 * 注意文件节点**没有** {@code d} 键（而不是 {@code d:null}）。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class TreeNode {

    /** basename */
    private final String n;
    /** 相对扫描根、以 / 连接的路径，不带前导斜杠 */
    private final String p;
    /** 子节点；目录才有。永远非空（空目录在收集阶段就被丢掉了） */
    private final List<TreeNode> d;
    /** 字节数；文件才有 */
    private final Long size;
    /** 本地时间 YYYY-MM-DD HH:mm；文件才有 */
    private final String mt;
    /** 小写、不带点；文件才有 */
    private final String ext;

    private TreeNode(String n, String p, List<TreeNode> d, Long size, String mt, String ext) {
        this.n = n;
        this.p = p;
        this.d = d;
        this.size = size;
        this.mt = mt;
        this.ext = ext;
    }

    public static TreeNode dir(String n, String p, List<TreeNode> children) {
        return new TreeNode(n, p, children, null, null, null);
    }

    public static TreeNode file(String n, String p, long size, String mt, String ext) {
        return new TreeNode(n, p, null, size, mt, ext);
    }

    public String getN() { return n; }
    public String getP() { return p; }
    public List<TreeNode> getD() { return d; }
    public Long getSize() { return size; }
    public String getMt() { return mt; }
    public String getExt() { return ext; }
}
