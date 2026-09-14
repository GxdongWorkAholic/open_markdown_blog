package com.gxdong.blog.repo;

import com.gxdong.blog.model.Credential;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/** access_credential 单行表（id 恒为 1）。明文密钥从不写入这里。 */
@Repository
public class CredentialRepository {

    private static final int ROW_ID = 1;

    private final JdbcTemplate jdbc;

    public CredentialRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Credential> load() {
        List<Credential> rows = jdbc.query("""
                SELECT algo, iterations, salt_b64, iv_b64, ct_b64, hash_salt_b64, hash_b64, hash_iterations
                FROM access_credential WHERE id = ?
                """, (rs, i) -> new Credential(
                rs.getString("algo"),
                rs.getInt("iterations"),
                rs.getString("salt_b64"),
                rs.getString("iv_b64"),
                rs.getString("ct_b64"),
                rs.getString("hash_salt_b64"),
                rs.getString("hash_b64"),
                (Integer) rs.getObject("hash_iterations")), ROW_ID);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public boolean exists() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM access_credential WHERE id = ?", Long.class, ROW_ID);
        return n != null && n > 0;
    }

    public void save(Credential c) {
        jdbc.update("""
                MERGE INTO access_credential
                  (id, algo, iterations, salt_b64, iv_b64, ct_b64,
                   hash_salt_b64, hash_b64, hash_iterations, updated_at)
                KEY (id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                ROW_ID, c.algo(), c.iterations(), c.saltB64(), c.ivB64(), c.ctB64(),
                c.hashSaltB64(), c.hashB64(), c.hashIterations(),
                Timestamp.valueOf(LocalDateTime.now()));
    }

    /** 一次性升级：把旧密文清掉，只留 hash。 */
    public void clearLegacyCipher() {
        jdbc.update("UPDATE access_credential SET iv_b64 = NULL, ct_b64 = NULL, updated_at = ? WHERE id = ?",
                Timestamp.valueOf(LocalDateTime.now()), ROW_ID);
    }

    /** 忘记密钥时的恢复路径：整行删掉，下次启动会用默认密钥重建。 */
    public void delete() {
        jdbc.update("DELETE FROM access_credential WHERE id = ?", ROW_ID);
    }
}
