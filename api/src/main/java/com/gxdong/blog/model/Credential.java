package com.gxdong.blog.model;

/**
 * 访问凭据。明文密钥永不落盘 —— 这里任何字段都不是密钥本身。
 *
 * <p>两套并存，由「兼容期 → 升级后」过渡：
 * <ul>
 *   <li>{@code hashB64} 非空 = 已升级态。存的是 {@code Base64(PBKDF2(key, hashSalt, N, 32))}，
 *       校验时用定长比较。即使库文件泄漏，攻击者面对的是「盐 + 21 万次 PBKDF2 的产出」。</li>
 *   <li>{@code ctB64} 非空 = 兼容期。存的是从旧 {@code secure.json} 迁移过来的密文
 *       （密文 ‖ 16 字节 GCM tag）。用户首次用正确密钥通过校验后，算出 hash 落库并把这两个字段置空。</li>
 * </ul>
 */
public record Credential(
        String algo,
        int iterations,
        String saltB64,
        String ivB64,
        String ctB64,
        String hashSaltB64,
        String hashB64,
        Integer hashIterations) {

    public static final String ALGO_GCM = "PBKDF2-SHA256/AES-GCM";
    public static final String ALGO_HASH = "PBKDF2-SHA256";

    /** 已升级成 hash 校验（不再依赖旧密文）。 */
    public boolean hasHash() {
        return hashB64 != null && !hashB64.isBlank() && hashSaltB64 != null && hashIterations != null;
    }

    /** 还能用旧密文校验。 */
    public boolean hasLegacyCipher() {
        return ctB64 != null && !ctB64.isBlank() && ivB64 != null && saltB64 != null;
    }
}
