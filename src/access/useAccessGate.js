// 方案 B 加密门禁 —— 运行时解密（密文由服务端提供，支持在设置页修改密钥）
// 前端用 ?key= 经 PBKDF2 派生 AES-256-GCM 密钥解密密文；解不开即未解锁。
// 密钥只在内存中保留（accessToken），绝不落盘、也不写入 localStorage/sessionStorage。
import { ref } from 'vue'

const enc = new TextEncoder()
const dec = new TextDecoder()

export const unlocked = ref(false)   // 是否已解锁（正确 key）
export const accessToken = ref('')   // 内存中的原始密钥（供「另开预览」链接复用）

function b64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function fetchSecure() {
  const res = await fetch('/api/secure')
  if (!res.ok) throw new Error('获取门禁密文失败')
  return res.json()
}

async function deriveAesKey(token, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(token), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations: 210000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
}

async function tryDecrypt(token, payload) {
  const key = await deriveAesKey(token, payload.salt)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.ct))
  return dec.decode(pt)
}

// 去掉 key 后的干净地址：路径/查询/哈希全部取自当前 location，不写死主机、端口或部署路径
function cleanUrl() {
  const url = new URL(location.href)
  url.searchParams.delete('key')
  return (url.pathname || '/') + url.search + url.hash
}

// 返回值：是否需要挂载应用（false = 正在重定向，别挂载）
export async function initAccessGate() {
  const url = new URL(location.href)
  const key = (url.searchParams.get('key') || '').trim()
  if (!key) return true

  let ok = false
  try {
    const payload = await fetchSecure()
    const text = await tryDecrypt(key, payload)
    ok = text.indexOf('granted') !== -1
  } catch {
    ok = false
  }

  if (ok) {
    // 正确：抹掉地址栏里的 key，留在当前页解锁
    unlocked.value = true
    accessToken.value = key
    history.replaceState(null, '', cleanUrl())
    return true
  }

  // 错误/无效：重定向到不含 key 的干净地址（相对当前站点，随部署环境自动适配）
  unlocked.value = false
  accessToken.value = ''
  location.replace(cleanUrl())
  return false
}

// 修改访问密钥：服务端用新密钥重新加密门禁密文（密钥本身不保存）
export async function changeKey(key) {
  const res = await fetch('/api/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || '保存失败')
  accessToken.value = key   // 当前会话继续有效，「另开预览」链接也用新密钥
  return true
}
