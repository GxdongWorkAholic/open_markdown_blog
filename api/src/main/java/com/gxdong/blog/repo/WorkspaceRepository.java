package com.gxdong.blog.repo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * workspace 表的读写。
 *
 * <p>为什么工作区要成行、而不是像 prefs 那样整坨存 JSON：服务端每个
 * `/api/ws|doc|img` 请求都要按 id 反查 root_path，这是「客户端不能指定任意绝对路径」
 * 这条安全边界的落点。
 *
 * <p>{@code extra_json} 保存 id/name/os/root 之外的**所有**字段（当前是 desc，
 * 将来前端加什么都能原样往返）。读出时按 id, name, os, root, ...extra 的顺序重建，
 * 与旧 config.json 里的键顺序一致。
 */
@Repository
public class WorkspaceRepository {

    /** 服务端认识的字段；其余一律进 extra_json。 */
    private static final List<String> KNOWN = List.of("id", "name", "os", "root");

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public WorkspaceRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public List<ObjectNode> findAll() {
        return jdbc.query("""
                SELECT id, name, os, root_path, extra_json FROM workspace ORDER BY sort_no ASC
                """, (rs, i) -> toNode(rs.getString("id"), rs.getString("name"),
                rs.getString("os"), rs.getString("root_path"), rs.getString("extra_json")));
    }

    /** 按 id 反查 root；工作区不存在时返回 empty。 */
    public Optional<String> findRoot(String id) {
        if (id == null || id.isEmpty()) {
            return Optional.empty();
        }
        List<String> roots = jdbc.query("SELECT root_path FROM workspace WHERE id = ?",
                (rs, i) -> rs.getString("root_path"), id);
        return roots.isEmpty() ? Optional.empty() : Optional.of(roots.get(0));
    }

    public long count() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM workspace", Long.class);
        return n == null ? 0L : n;
    }

    /**
     * 整表替换。前端每次 POST /api/config 都会发全量数组，所以这里就是
     * 一个事务里的「清空 + 按数组下标重写 sort_no」，与旧服务把整个数组写进
     * config.json 的语义等价。
     */
    @Transactional
    public void replaceAll(JsonNode array) {
        jdbc.update("DELETE FROM workspace");
        if (array == null || !array.isArray() || array.isEmpty()) {
            return;
        }
        Timestamp now = Timestamp.valueOf(LocalDateTime.now());
        int i = 0;
        for (JsonNode n : array) {
            if (!n.isObject()) {
                continue;
            }
            ObjectNode o = (ObjectNode) n;
            String id = text(o, "id", null);
            if (id == null || id.isEmpty()) {
                // 与前端 SettingsView 生成 id 的规则一致，回写后前端下次就固化了
                id = "u-" + Long.toString(System.currentTimeMillis(), 36);
            }
            jdbc.update("""
                    INSERT INTO workspace (id, sort_no, name, os, root_path, extra_json, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    id, i++, text(o, "name", ""), text(o, "os", "win"),
                    text(o, "root", ""), extraJson(o), now);
        }
    }

    private String extraJson(ObjectNode o) {
        ObjectNode extra = o.deepCopy();
        extra.remove(KNOWN);
        return extra.isEmpty() ? null : extra.toString();
    }

    private ObjectNode toNode(String id, String name, String os, String rootPath, String extraJson) {
        ObjectNode node = mapper.createObjectNode();
        node.put("id", id);
        node.put("name", name);
        node.put("os", os);
        node.put("root", rootPath);
        if (extraJson != null && !extraJson.isBlank()) {
            try {
                JsonNode extra = mapper.readTree(extraJson);
                if (extra != null && extra.isObject()) {
                    Iterator<Map.Entry<String, JsonNode>> it = extra.fields();
                    while (it.hasNext()) {
                        Map.Entry<String, JsonNode> e = it.next();
                        node.set(e.getKey(), e.getValue());
                    }
                }
            } catch (Exception ignore) {
                // extra 坏掉不该让整个配置读不出来
            }
        }
        return node;
    }

    private static String text(ObjectNode o, String field, String fallback) {
        JsonNode v = o.get(field);
        if (v == null || v.isNull()) {
            return fallback;
        }
        return v.isTextual() ? v.asText() : v.asText(fallback);
    }
}
