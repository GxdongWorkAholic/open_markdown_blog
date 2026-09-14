package com.gxdong.blog.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * app.* 配置绑定。
 * 属性名一律扁平化（data-dir / static-dir / auth-protect-reads …），避免嵌套类。
 */
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    /** 唯一需要可写的目录。默认 ${user.home}/.open-markdown-blog，按操作系统自动不同。 */
    private String dataDir;

    /**
     * 上传图片的存放目录（磁盘文件，不是数据库 BLOB）。
     *
     * <p>与 {@link #dataDir} 是**两个平级目录**，不是一个套一个：
     * 本地开发是 <仓库>/file/db/h2 与 <仓库>/file/img，服务器上是
     * /srv/open-markdown-blog/file/db/h2 与 .../file/img。
     *
     * <p>文件名就是前端存的 {@code prefs.bgUrl}（裸文件名），对外 URL 仍是 /api/uploads/<名>。
     */
    private String imgDir;

    /** 启动时真写一个探针文件验证目录可写；false 仅用于只读排障。 */
    private boolean dataCheck = true;

    /** 上传大小上限，默认 20MB。 */
    private long uploadMaxBytes = 20L * 1024 * 1024;

    /**
     * 前端构建产物（{@code dist/}）的目录。**留空 = 不托管静态文件**（默认）。
     *
     * <p>指到 dist 目录之后，这个 jar 就自带静态托管 + SPA history fallback ——
     * 一个进程一个端口就是全站，服务器上只要一个 JRE。{@code tools/pkg/run.sh}
     * 就是这么用的（指到 {@code ../../www/lastest}）。
     *
     * <p>例：{@code --app.static-dir=./dist} 或 {@code APP_STATIC_DIR=/opt/blog/dist}
     */
    private String staticDir = "";

    /** true = 连 /api/ws|doc|img 也要密钥（博客变私有）。默认 false，游客可浏览。 */
    private boolean authProtectReads;

    /** 忘记密钥时的恢复开关：启动时把凭据重置为默认密钥。只认启动参数/环境变量，绝不做成 HTTP 接口。 */
    private boolean authResetToDefault;

    /** 逗号分隔的允许来源；空 = 不启用 CORS（同源部署，前端 nginx 反代 /api）。 */
    private String corsAllowedOrigins = "";

    /**
     * 是否让 H2 开 AUTO_SERVER（允许 DBeaver 之类工具在应用运行时同时打开库文件）。
     *
     * <p><b>默认关闭，这是个安全默认值</b>：AUTO_SERVER 会让 H2 额外起一个 TCP 监听，
     * 而默认绑定是 0.0.0.0（实测）—— 加上库用户是 sa / 空口令，
     * 等于把配置、工作区和门禁校验值暴露给同网段。
     * 打开时会强制 {@code h2.bindAddress=127.0.0.1}，只对本机工具开放。
     *
     * <p>关掉之后仍然可以用 DBeaver 看库 —— 先停掉应用，再以文件模式打开它。
     */
    private boolean dbAutoServer = false;

    public String getDataDir() { return dataDir; }
    public void setDataDir(String dataDir) { this.dataDir = dataDir; }

    public String getImgDir() { return imgDir; }
    public void setImgDir(String imgDir) { this.imgDir = imgDir; }

    public boolean isDataCheck() { return dataCheck; }
    public void setDataCheck(boolean dataCheck) { this.dataCheck = dataCheck; }

    public long getUploadMaxBytes() { return uploadMaxBytes; }
    public void setUploadMaxBytes(long uploadMaxBytes) { this.uploadMaxBytes = uploadMaxBytes; }

    public String getStaticDir() { return staticDir; }
    public void setStaticDir(String staticDir) { this.staticDir = staticDir; }

    public boolean isAuthProtectReads() { return authProtectReads; }
    public void setAuthProtectReads(boolean authProtectReads) { this.authProtectReads = authProtectReads; }

    public boolean isAuthResetToDefault() { return authResetToDefault; }
    public void setAuthResetToDefault(boolean authResetToDefault) { this.authResetToDefault = authResetToDefault; }

    public String getCorsAllowedOrigins() { return corsAllowedOrigins; }
    public void setCorsAllowedOrigins(String corsAllowedOrigins) { this.corsAllowedOrigins = corsAllowedOrigins; }

    public boolean isDbAutoServer() { return dbAutoServer; }
    public void setDbAutoServer(boolean dbAutoServer) { this.dbAutoServer = dbAutoServer; }
}
