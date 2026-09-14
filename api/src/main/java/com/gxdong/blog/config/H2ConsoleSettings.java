package com.gxdong.blog.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * 把本应用的 JDBC 连接串预填进 H2 的 Web 控制台。
 *
 * <p><b>为什么需要这个</b>：控制台的登录框预填的是 H2 自己的默认值 {@code jdbc:h2:~/test}
 * （展开成 {@code C:/Users/<你>/test}）。用户若没替换就点 Connect，会得到
 * <pre>Database "C:/Users/xxx/test" not found, either pre-create it or allow remote
 * database creation (not recommended in secure environments) [90149-232]</pre>
 * 而 Spring Boot 没法替它预填 —— 本应用的 DataSource 是手写的，Boot 那套「自动预填」用不上。
 *
 * <p>但 H2 自己会把控制台里保存过的连接设置持久化在 {@code ~/.h2.server.properties}，
 * 其中内置的「Generic H2 (Embedded)」是第 21 号条目。所以这里直接替它把那条改成本应用的
 * 连接串 —— 等价于用户在控制台里点了一次 Save，只是每次启动都会校正一遍。
 *
 * <p>只在 {@code spring.h2.console.enabled=true} 时调用（本地开发脚本才开），
 * 而且内容已经一致就不写文件、不碰 mtime。
 */
public final class H2ConsoleSettings {

    /** H2 内置「Generic H2 (Embedded)」的序号；控制台登录框默认选中的就是它。 */
    private static final String ENTRY_PREFIX = "21=";
    private static final String SETTING_NAME = "Generic H2 (Embedded)";
    private static final String DRIVER = "org.h2.Driver";
    private static final String USER = "sa";

    private H2ConsoleSettings() {
    }

    /** 返回 null 表示没变化（或没写成），否则返回一句可打印的中文说明。 */
    public static String ensurePrefilled(String jdbcUrl) {
        Path file = Path.of(System.getProperty("user.home"), ".h2.server.properties");
        String entry = ENTRY_PREFIX + SETTING_NAME + "|" + DRIVER + "|" + escape(jdbcUrl) + "|" + USER;
        try {
            if (Files.isRegularFile(file)) {
                List<String> lines = new ArrayList<>(Files.readAllLines(file, StandardCharsets.UTF_8));
                List<String> out = new ArrayList<>(lines);
                int hit = -1;
                for (int i = 0; i < out.size(); i++) {
                    String l = out.get(i);
                    if (l.startsWith(ENTRY_PREFIX) || l.contains(SETTING_NAME + "|")) {
                        hit = i;
                        break;
                    }
                }
                if (hit >= 0) {
                    if (out.get(hit).equals(entry)) {
                        return null;   // 已经是对的，不写文件
                    }
                    out.set(hit, entry);
                } else {
                    out.add(entry);
                }
                Files.write(file, out, StandardCharsets.UTF_8);
            } else {
                Files.write(file, List.of("#H2 Server Properties", entry), StandardCharsets.UTF_8);
            }
            return "[blog-api] 已把连接串预填进 H2 控制台（打开后直接点 Connect 即可）";
        } catch (IOException e) {
            // 写不进去也不该影响启动：手动把连接串粘进去照样能用
            return "[blog-api] 未能预填 H2 控制台设置（" + e.getMessage() + "），请手动粘贴连接串";
        }
    }

    /** H2 的属性文件里 : 和 = 要转义。 */
    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace(":", "\\:").replace("=", "\\=");
    }
}
