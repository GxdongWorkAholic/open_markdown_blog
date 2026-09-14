package com.gxdong.blog.service;

import com.gxdong.blog.common.ApiException;
import com.gxdong.blog.config.AppProperties;
import com.gxdong.blog.model.Credential;
import com.gxdong.blog.repo.CredentialRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 服务端访问密钥校验。
 *
 * <p><b>为什么老用户的密钥能直接继续用</b>：旧的「方案 B」密文本身就是一个校验器 ——
 * 用密钥派生出的 AES 密钥去解密一个已知明文标记，解得开即说明密钥正确。
 * 把它从浏览器搬到服务端，语义完全不变，只是判断方换了个地方。
 *
 * <p><b>一次性升级</b>：用户第一次用正确密钥通过校验后，算出一个加盐哈希落库，
 * 并把旧密文置空。之后即便库文件泄漏，攻击者面对的也只是「盐 + 21 万次 PBKDF2 的产出」，
 * 而不再是「已知明文的密文」。
 *
 * <p><b>密钥永不落盘</b>：库里存的只有随机盐和派生值，没有密钥本身。
 */
@Service
public class AuthService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private static final String DEFAULT_KEY = "ihateblog";
    private static final String MARKER = "open-markdown-blog:granted";
    private static final int PBKDF2_ITER = 210_000;
    private static final int KEY_LEN_BYTES = 32;
    private static final int SALT_BYTES = 16;
    private static final int IV_BYTES = 12;

    /** 与旧服务逐字一致，注意中间的连接号是全角 U+2013。 */
    private static final String KEY_RULE_MSG = "密钥需为 8–256 位大小写字母或数字";
    private static final Pattern KEY_RE = Pattern.compile("^[A-Za-z0-9]{8,256}$");

    private final CredentialRepository repo;
    private final AppProperties props;
    private final SecureRandom random = new SecureRandom();

    /**
     * 验签结果缓存：SHA-256(密钥) → 通过时间。
     * 每次写设置都跑一遍 21 万次 PBKDF2 太贵（一次改遮罩滑块就要验一次），所以缓存住。
     * 存的是密钥的哈希而不是密钥本身，且只活在这个进程的内存里。
     */
    private final Map<String, Long> verified = Collections.synchronizedMap(
            new LinkedHashMap<>(64, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                    return size() > 32;
                }
            });
    private static final long VERIFIED_TTL_MS = 10 * 60_000L;

    public AuthService(CredentialRepository repo, AppProperties props) {
        this.repo = repo;
        this.props = props;
    }

    /**
     * 凭据的兜底创建：库里一条凭据都没有时（首次启动），用默认密钥建一个。
     * 跑在 ApplicationRunner 阶段，此时 schema 一定已经初始化完。
     */
    @Override
    public void run(ApplicationArguments args) {
        ensureCredential(props.isAuthResetToDefault());
    }

    private void ensureCredential(boolean force) {
        if (force) {
            log.warn("[blog-api] 凭据已按 --app.auth.reset-to-default=true 重置为默认密钥 {}", DEFAULT_KEY);
            repo.delete();
        } else if (repo.exists()) {
            return;
        }
        repo.save(newHashCredential(DEFAULT_KEY));
        verified.clear();
    }

    /** 校验一个密钥是否正确。 */
    public boolean isKeyValid(String key) {
        if (key == null || key.isEmpty() || key.length() > 256) {
            return false;
        }
        String fp = sha256B64(key);
        Long at = verified.get(fp);
        long now = System.currentTimeMillis();
        if (at != null && now - at < VERIFIED_TTL_MS) {
            return true;
        }
        if (!verifySlow(key)) {
            verified.remove(fp);
            return false;
        }
        verified.put(fp, now);
        return true;
    }

    private boolean verifySlow(String key) {
        Credential c = repo.load().orElse(null);
        if (c == null) {
            return false;
        }

        if (c.hasHash()) {
            byte[] got = pbkdf2(key, b64d(c.hashSaltB64()), c.hashIterations(), KEY_LEN_BYTES);
            return MessageDigest.isEqual(got, b64d(c.hashB64()));
        }

        if (c.hasLegacyCipher()) {
            try {
                byte[] dk = pbkdf2(key, b64d(c.saltB64()), c.iterations(), KEY_LEN_BYTES);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(dk, "AES"),
                        new GCMParameterSpec(128, b64d(c.ivB64())));
                // 旧服务的 ct = 密文 ‖ 16 字节 authTag，Java 的 doFinal 正好接受这个布局
                String plain = new String(cipher.doFinal(b64d(c.ctB64())), StandardCharsets.UTF_8);
                if (plain.indexOf("granted") < 0) {
                    return false;
                }
                upgradeToHash(key);
                return true;
            } catch (Exception e) {
                return false;   // 含 AEADBadTagException：密钥不对
            }
        }
        return false;
    }

    /** 兼容期 → 常态：算加盐哈希落库，并把旧密文清掉。 */
    private void upgradeToHash(String key) {
        try {
            repo.save(newHashCredential(key));
            log.info("[blog-api] 凭据已一次性升级为哈希校验（旧密文已清除）");
        } catch (Exception e) {
            log.warn("[blog-api] 凭据升级失败，下次验钥会重试：{}", e.getMessage());
        }
    }

    /** 改密钥。需要当前密钥已经通过校验（由 @RequireKey 保证）。 */
    public void changeKey(String newKey) {
        String key = newKey == null ? "" : newKey.trim();
        if (!KEY_RE.matcher(key).matches()) {
            throw ApiException.badRequest(KEY_RULE_MSG);
        }
        repo.save(newHashCredential(key));
        verified.clear();   // 旧密钥的缓存立刻失效
        log.info("[blog-api] 访问密钥已更新（服务端只保存加盐哈希，密钥本身未落盘）");
    }

    private Credential newHashCredential(String key) {
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        byte[] hash = pbkdf2(key, salt, PBKDF2_ITER, KEY_LEN_BYTES);
        return new Credential(Credential.ALGO_HASH, PBKDF2_ITER,
                b64(salt), null, null,
                b64(salt), b64(hash), PBKDF2_ITER);
    }

    private static byte[] pbkdf2(String key, byte[] salt, int iterations, int len) {
        try {
            SecretKeyFactory f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            // 密钥字符集被 KEY_RE 限制为 [A-Za-z0-9]，UTF-8 / ASCII / Latin-1 结果相同，
            // 所以与 Node 的 pbkdf2Sync(token, salt, N, len, 'sha256') 不存在编码歧义。
            return f.generateSecret(new PBEKeySpec(key.toCharArray(), salt, iterations, len * 8)).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException("PBKDF2 派生失败：" + e.getMessage(), e);
        }
    }

    private static String sha256B64(String s) {
        try {
            return b64(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String b64(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
    }

    private static byte[] b64d(String s) {
        return Base64.getDecoder().decode(s);
    }
}
