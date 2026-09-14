package com.gxdong.blog;

import com.gxdong.blog.config.AppProperties;
import com.gxdong.blog.config.DataSourceConfig;
import com.gxdong.blog.config.H2ConsoleSettings;
import com.gxdong.blog.config.LogDir;
import com.gxdong.blog.config.SpaStaticConfig;
import com.gxdong.blog.repo.WorkspaceRepository;
import com.gxdong.blog.service.DataDirService;
import com.gxdong.blog.service.UploadStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;

import java.nio.file.Path;
import java.util.Set;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class BlogApplication {

    private static final Set<String> LOOPBACK = Set.of("127.0.0.1", "localhost", "::1");

    private static final Logger log = LoggerFactory.getLogger(BlogApplication.class);

    public static void main(String[] args) {
        // 必须排在 run() 前面：logback 是在 run() 内部初始化的，
        // 之后再设 app.log.dir 对它已经没有任何意义（见 LogDir 的类注释）。
        LogDir.applySystemProperty();
        SpringApplication.run(BlogApplication.class, args);
    }

    /**
     * 中文启动横幅。放在 ApplicationRunner 里，所以一定是在数据库初始化之后才打印。
     *
     * <p>走 logger 而不是 {@code System.out.println}：设了 {@code logging.file.name} 之后，
     * 日志是「控制台 + 文件」两份，用 println 的话这几行只进控制台 ——
     * 而它们在服务器上恰恰是最该留档的（数据目录、图片目录、库文件路径、监听地址）。
     * 用 logger 后，{@code nohup … &} 把终端丢掉也还能在 api.log 里翻到。
     */
    @Bean
    ApplicationRunner startupBanner(Environment env, DataDirService dataDir,
                                    AppProperties props, WorkspaceRepository wsRepo,
                                    DataSourceConfig.DbInfo dbInfo, UploadStore uploadStore) {
        return args -> {
            Path base = dataDir.ensureWritable();
            String addr = env.getProperty("server.address", "127.0.0.1");
            String port = env.getProperty("server.port", "8090");
            String shown = "0.0.0.0".equals(addr) ? "localhost" : addr;
            String origin = "http://" + shown + ":" + port;

            log.info("已启动：{}/", origin);
            log.info("数据目录：{}", base);
            // 日志文件在 <jar目录>/logs/<日期>/api.log。服务器上要 tail 的时候
            // 不用猜是哪个目录 —— 括号里说明它是怎么定下来的。
            log.info("日志目录：{}（{}）", env.getProperty(LogDir.PROPERTY, "logs"), LogDir.origin());
            log.info("H2：{}.mv.db", base.resolve("blog"));
            log.info("图片目录：{}（上传的图片，磁盘文件不是 BLOB）", uploadStore.dir());
            log.info("工作区：{} 个", wsRepo.count());
            log.info("门禁：服务端校验，读接口{}",
                    props.isAuthProtectReads() ? "也需密钥（私有博客）" : "公开（游客可浏览）");
            log.info("健康检查：{}/api/health", origin);

            // 配了 app.static-dir 的话，打开浏览器直接是前端首页（否则只有 /api/*，前端得另外托管）
            java.nio.file.Path staticDir = SpaStaticConfig.resolveStaticDir(props);
            if (staticDir != null) {
                log.info("静态托管：{}", DataDirService.slash(staticDir));
                log.info("  前端由本服务一并提供，直接开 {}/ 就是首页", origin);
            } else if (props.getStaticDir() != null && !props.getStaticDir().isBlank()) {
                log.info("⚠️  app.static-dir 不是有效目录，静态托管已关闭：{}", props.getStaticDir());
            }

            // H2 的 Web 控制台。默认关闭，本地开发脚本（start-dev.bat）会打开它。
            // 它只监听回环，且 H2 控制台自身默认也只允许本机访问；
            // 但它同时是「能执行任意 SQL」的入口，所以对外的环境请保持关闭。
            if (Boolean.parseBoolean(env.getProperty("spring.h2.console.enabled", "false"))) {
                String consolePath = env.getProperty("spring.h2.console.path", "/h2-console");
                log.info("H2 控制台：{}{}", origin, consolePath);
                // 替用户把连接串预填好，省掉「框里默认是 jdbc:h2:~/test，粘错就报 90149」这一步
                String note = H2ConsoleSettings.ensurePrefilled(dbInfo.url());
                if (note != null) {
                    log.info(note);
                }
                log.info("  打开后直接点 Connect 即可（用户 sa，口令留空）");
                log.info("  若仍需手动填，连接串是：{}", dbInfo.url());
                if (!LOOPBACK.contains(addr)) {
                    log.info("  ⚠️  H2 控制台能执行任意 SQL，而当前监听在 {} —— 请勿在对外环境开启它。", addr);
                }
            }

            if (!LOOPBACK.contains(addr)) {
                log.info("⚠️  正在监听 {}（不是本机回环）——"
                        + "请确认它没有直接暴露到公网。对外正常应该经同机的 Caddy（或 nginx）反代进来。", addr);
            }
        };
    }
}
