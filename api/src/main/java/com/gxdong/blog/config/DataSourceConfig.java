package com.gxdong.blog.config;

import com.gxdong.blog.service.DataDirService;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.nio.file.Path;

/**
 * 手写 DataSource，而不是在 application.yml 里写 {@code spring.datasource.url}。
 *
 * <p>原因有三个：
 * <ol>
 *   <li>URL 依赖数据目录，而数据目录要在建好目录 + 验可写之后才能确定。yml 里的占位符
 *       在 Bean 之前就被解析完了，Java 侧没机会插进去做检查。</li>
 *   <li>Windows 上 {@code Path.toString()} 给的是反斜杠，塞进 H2 的连接串会被当转义符，
 *       报连接串解析失败。必须在拼 URL 时转成正斜杠。</li>
 *   <li>AUTO_SERVER 是可选的，且开启时要顺带限制 H2 的监听地址（见下）。</li>
 * </ol>
 *
 * <p>提供这个 Bean 之后，Spring Boot 的 DataSource 自动配置（含内嵌内存库）就不会再生效。
 */
@Configuration
public class DataSourceConfig {

    private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);

    @Bean
    public DataSource dataSource(DataDirService dataDir, AppProperties props) {
        Path base = dataDir.ensureWritable();   // 建目录 + 可写自检，失败即启动失败
        // 库文件直接放在 data-dir 下。刻意不再套一层 db/ —— 各环境配的 data-dir 本身
        // 已经是「…/file/db/h2」这种专放数据库的路径，再套一层会变成 file/db/h2/db/blog.mv.db。
        Path db = base.resolve("blog");

        StringBuilder url = new StringBuilder("jdbc:h2:file:")
                .append(DataDirService.slash(db))
                .append(";DB_CLOSE_DELAY=-1");

        if (props.isDbAutoServer()) {
            // AUTO_SERVER 让 DBeaver 之类工具能在应用运行时同时打开库文件（排障用）。
            // 但它会让 H2 额外起一个 TCP 监听，且默认绑 0.0.0.0 —— 实测确认过，
            // 配合 sa/空口令就等于把库暴露给同网段。所以强制收到回环。
            System.setProperty("h2.bindAddress", "127.0.0.1");
            url.append(";AUTO_SERVER=TRUE");
            log.info("[blog-api] H2 AUTO_SERVER 已开启，监听地址已强制为 127.0.0.1（仅本机工具可连）");
        }

        // sa + 空口令：H2 的口令只防「能读到库文件的人」，而能读到该文件的人已经拿到了
        // prefs（非机密）、门禁校验值（无密钥不可用）和公开图片。加口令只会带来「换机器打不开库」的运维坑。
        // 真正的安全边界是：库文件所在目录的访问权 + 上面那个不监听端口的默认值。
        DataSource ds = DataSourceBuilder.create()
                .type(HikariDataSource.class)
                .driverClassName("org.h2.Driver")
                .url(url.toString())
                .username("sa")
                .password("")
                .build();
        return ds;
    }

    /**
     * 把「应用真正使用的连接串」发布成一个 Bean。
     *
     * <p>为什么不能等用到时从连接元数据里取：{@code getMetaData().getURL()} 返回的是**不带参数**的
     * 基础 URL，而应用实际是用带 {@code ;DB_CLOSE_DELAY=-1} 的串打开的。H2 会认为这是两个不同的库，
     * 于是 H2 控制台里粘基础 URL 会撞文件锁（"Database may be already in use"）而连不上。
     * 把完整的串直接给出去，控制台用同一个串就能复用已打开的库。
     */
    @Bean
    public DbInfo dbInfo(DataSource dataSource) {
        return new DbInfo(dataSource);
    }

    /** 只为了让启动横幅拿到完整 JDBC URL；顺带能在别处复用。 */
    public record DbInfo(DataSource dataSource) {
        public String url() {
            return ((HikariDataSource) dataSource).getJdbcUrl();
        }
    }
}
