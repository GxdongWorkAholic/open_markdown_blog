package com.gxdong.blog.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.gxdong.blog.model.AppConfig;
import com.gxdong.blog.repo.ConfigRepository;
import com.gxdong.blog.repo.WorkspaceRepository;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;

/**
 * 站点配置的读写。合并语义严格照搬旧 Node 服务的 readConfig / apiConfigSave：
 * prefs 与默认值做**顶层浅合并**（存的那份覆盖默认值，且存的那份里的未知键保留）。
 */
@Service
public class ConfigService {

    private final ObjectMapper mapper;
    private final ConfigRepository configRepo;
    private final WorkspaceRepository wsRepo;

    /** default-prefs.json 的解析结果，进程内只读，可安全共享（用前一律 deepCopy）。 */
    private final ObjectNode defaults;

    public ConfigService(ObjectMapper mapper, ConfigRepository configRepo, WorkspaceRepository wsRepo) {
        this.mapper = mapper;
        this.configRepo = configRepo;
        this.wsRepo = wsRepo;
        this.defaults = loadDefaults();
    }

    /** GET /api/config：默认值 ⊕ 已存值，工作区成行读出。 */
    public AppConfig get() {
        ObjectNode prefs = defaults.deepCopy();
        String activeWs = null;
        String activePath = null;

        var row = configRepo.load();
        if (row.isPresent()) {
            JsonNode stored = parseQuietly(row.get().prefsJson());
            // setAll 是顶层浅覆盖，正是 JS 的 {...defaults, ...stored}
            if (stored != null && stored.isObject()) {
                prefs.setAll((ObjectNode) stored);
            }
            activeWs = row.get().activeWs();
            activePath = row.get().activePath();
        }

        AppConfig cfg = new AppConfig();
        cfg.setPrefs(prefs);
        cfg.setWorkspaces(wsRepo.findAll());
        cfg.setActiveWs(activeWs);
        cfg.setActivePath(activePath);
        return cfg;
    }

    /** POST /api/config：请求体是任意 JSON，按旧服务的规则归一化后落库，并回显归一化结果。 */
    public AppConfig save(JsonNode body) {
        ObjectNode prefs = defaults.deepCopy();
        if (body != null) {
            JsonNode given = body.path("prefs");
            if (given.isObject()) {
                prefs.setAll((ObjectNode) given);
            }
        }

        JsonNode ws = body == null ? null : body.path("workspaces");
        wsRepo.replaceAll(ws != null && ws.isArray() ? ws : mapper.createArrayNode());

        configRepo.save(prefs.toString(),
                textOrNull(body == null ? null : body.path("activeWs")),
                textOrNull(body == null ? null : body.path("activePath")));

        return get();
    }

    /** POST /api/config/reset：清空工作区，prefs 回到出厂默认。 */
    public AppConfig reset() {
        wsRepo.replaceAll(mapper.createArrayNode());
        configRepo.save(defaults.deepCopy().toString(), null, null);
        return get();
    }

    private ObjectNode loadDefaults() {
        try (InputStream in = new ClassPathResource("default-prefs.json").getInputStream()) {
            JsonNode n = mapper.readTree(in);
            if (!n.isObject()) {
                throw new IllegalStateException("default-prefs.json 顶层必须是对象");
            }
            return (ObjectNode) n;
        } catch (IOException e) {
            throw new IllegalStateException("读取 default-prefs.json 失败：" + e.getMessage(), e);
        }
    }

    private JsonNode parseQuietly(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            return null;   // 存坏了就当没有，回落到默认值，与旧服务的 catch 一致
        }
    }

    /** 对应 JS 的 `value || null`：空串与缺失都归为 null。 */
    private static String textOrNull(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) {
            return null;
        }
        if (n.isTextual()) {
            String s = n.asText();
            return s.isEmpty() ? null : s;
        }
        return null;
    }
}
