package com.gxdong.blog.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/** app_config 单行表（id 恒为 1）的读写。 */
@Repository
public class ConfigRepository {

    private static final int ROW_ID = 1;

    private final JdbcTemplate jdbc;

    public ConfigRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 原始行。没有记录时返回 empty（对应旧服务里 config.json 不存在的情况）。 */
    public Optional<Row> load() {
        List<Row> rows = jdbc.query(
                "SELECT prefs_json, active_ws, active_path FROM app_config WHERE id = ?",
                (rs, i) -> new Row(rs.getString("prefs_json"), rs.getString("active_ws"), rs.getString("active_path")),
                ROW_ID);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** 整行 upsert。H2 的 MERGE ... KEY 语义正好是「按主键存在则更新，否则插入」。 */
    public void save(String prefsJson, String activeWs, String activePath) {
        jdbc.update("""
                MERGE INTO app_config (id, prefs_json, active_ws, active_path, updated_at)
                KEY (id) VALUES (?, ?, ?, ?, ?)
                """,
                ROW_ID, prefsJson, activeWs, activePath, Timestamp.valueOf(LocalDateTime.now()));
    }

    public record Row(String prefsJson, String activeWs, String activePath) {
    }
}
