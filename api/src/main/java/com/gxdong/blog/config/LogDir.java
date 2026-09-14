package com.gxdong.blog.config;

import org.springframework.boot.system.ApplicationHome;

import java.io.File;
import java.nio.file.Path;

/**
 * 日志目录：**运行中的 jar 所在目录**下的 {@code logs/}。
 *
 * <p>为什么不用「当前工作目录」：CWD 取决于「谁在哪敲的 java -jar」——
 * 从别的目录启动、被 systemd 拉起、被 IDE 拉起，都会变（这正是
 * application-dev.yml 那两条相对路径要专门写一段注释盯着的原因）。
 * jar 自己的位置则是确定的：开发机上是 api/build/libs/，服务器上是 api/lastest/，
 * 两边规则一模一样，不用各配一遍。
 *
 * <p>必须在 {@link org.springframework.boot.SpringApplication#run} **之前**把结果写进系统属性
 * {@code app.log.dir}：logback 是在 run() 内部初始化的，晚于那一刻写进去它对 logback
 * 已经没有任何意义。{@code logback-spring.xml} 用 &lt;springProperty&gt; 读这个属性。
 *
 * <p>覆盖优先级：{@code -Dapp.log.dir=…} &gt; 环境变量 {@code APP_LOG_DIR} &gt; 自动推导。
 */
public final class LogDir {

    /** 系统属性名。logback-spring.xml 与前缀都是这个名字。 */
    public static final String PROPERTY = "app.log.dir";

    private static final String ENV = "APP_LOG_DIR";

    /** 目录是怎么定下来的。只用于启动横幅里那句括号说明，省得用户去猜。 */
    private static String origin = "未初始化";

    private LogDir() {
    }

    /**
     * 算出日志目录并写进系统属性。**幂等**：调用方已经用 {@code -Dapp.log.dir} 指定就不覆盖。
     *
     * <p>调用点是 {@code BlogApplication.main()} 的第一行，必须在
     * {@code SpringApplication.run(...)} 之前 —— 见类注释。
     */
    public static void applySystemProperty() {
        String preset = System.getProperty(PROPERTY);
        if (preset != null && !preset.isBlank()) {
            origin = "-D" + PROPERTY;
            return;
        }

        String env = System.getenv(ENV);
        if (env != null && !env.isBlank()) {
            origin = ENV;
            System.setProperty(PROPERTY, normalized(Path.of(env)));
            return;
        }

        Path jarDir = jarDirectory();
        if (jarDir != null) {
            origin = "jar 所在目录";
            System.setProperty(PROPERTY, jarDir.resolve("logs").toString());
            return;
        }

        // 没找到 jar（bootRun / IDE 走的是 build/classes/java/main）。退回当前目录，
        // 并且留着这句说明 —— 否则「日志怎么跑到别处去了」只能靠猜。
        origin = "user.dir（没找到 jar）";
        System.setProperty(PROPERTY,
                Path.of(System.getProperty("user.dir", ".")).toAbsolutePath().normalize()
                        .resolve("logs").toString());
    }

    /** 目录是怎么定下来的；只该在 {@link #applySystemProperty()} 之后读。 */
    public static String origin() {
        return origin;
    }

    /**
     * 本类所在 jar 的父目录。
     *
     * <p>不是「从 jar 里跑」的时候返回 null：{@code gradlew bootRun} 与 IDE 里跑的都是
     * build/classes/java/main 这个**目录**，没有「jar 同目录」可言。
     *
     * <p>用 Spring Boot 的 ApplicationHome，而不是自己拿
     * {@code getProtectionDomain().getCodeSource()} 去 {@code Path.of(uri)}：
     * 可执行 jar 启动时那个 URL 的 scheme 是 {@code jar} 而不是 {@code file}
     * （形如 {@code jar:file:….jar!/BOOT-INF/classes!/}），会直接抛
     * IllegalArgumentException —— 实测踩过，表现是日志静默跑到启动目录去了。
     * ApplicationHome 正是为剥这层嵌套而写的。
     */
    private static Path jarDirectory() {
        try {
            File source = new ApplicationHome(LogDir.class).getSource();
            if (source != null && source.isFile()) {
                File parent = source.getParentFile();
                if (parent != null) {
                    return parent.toPath().toAbsolutePath().normalize();
                }
            }
        } catch (RuntimeException e) {
            // 交给调用方退回 user.dir
        }
        return null;
    }

    private static String normalized(Path path) {
        return path.toAbsolutePath().normalize().toString();
    }
}
