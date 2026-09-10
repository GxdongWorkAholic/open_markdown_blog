// 方案 B 加密门禁 —— 运行时解密
// 用 URL 里的 ?key=<token> 派生 AES-256-GCM 密钥，解密 src/secure/config.enc.json。
// token 只在内存中保留（accessToken），绝不写入 localStorage/sessionStorage。
import { ref } from 'vue'
import payload from '../secure/config.enc.json'

const enc = new TextEncoder()
const dec = new TextDecoder()

export const unlocked = ref(false)       // 是否已解锁（正确 key）
export const accessToken = ref('')       // 内存中的原始 token（供「另开预览」链接复用）

function b64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveAesKey(token, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(token), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations: 210000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
}

async function tryDecrypt(token) {
  const key = await deriveAesKey(token, payload.salt)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.ct))
  return JSON.parse(dec.decode(pt))
}

export async function initAccessGate() {
  const url = new URL(location.href)
  const key = (url.searchParams.get('key') || '').trim()
  if (key) {
    // 无论成败都抹掉 key，避免留在地址栏 / Referer / 历史记录
    url.searchParams.delete('key')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
  if (!key) return
  try {
    await tryDecrypt(key)   // 解密成功即证明 key 正确（方案 B 门禁）
    unlocked.value = true
    accessToken.value = key
  } catch {
    unlocked.value = false
  }
}
