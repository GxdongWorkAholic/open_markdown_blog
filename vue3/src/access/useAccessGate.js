// 访问门禁 —— 改造后是**服务端校验**：客户端把密钥放进 X-Access-Key 请求头，后端判定。
//
// 与旧实现的差别：以前是服务端把门禁密文发给匿名客户端，由浏览器用 Web Crypto 解密来判断。
// 现在密钥从不离开客户端去做「可离线暴力破解的密文比对」，而且不再依赖 crypto.subtle，
// 于是「必须 HTTPS 或 localhost 才能解锁」这条限制也一并消失（HTTP + 局域网 IP 现在可用）。
//
// 密钥只在内存中保留（accessToken / http.js 里的 authKey），绝不落盘。
import { ref } from 'vue'
import { fetchJSON, setAuthKey } from '../store/http'

export const unlocked = ref(false)   // 是否已解锁（正确 key）
export const accessToken = ref('')   // 内存中的原始密钥（供「另开预览」链接复用）
// 门禁因服务不可达而未能校验：提示用，不影响 unlocked（仍为 false）
export const gateNotice = ref('')

// 去掉 key 后的干净地址：路径/查询/哈希全部取自当前 location，不写死主机、端口或部署路径
function cleanUrl() {
  const url = new URL(location.href)
  url.searchParams.delete('key')
  return (url.pathname || '/') + url.search + url.hash
}

/** 锁上：清掉内存里的密钥。写接口返回 401 时会自动调它（见 main.js 的注册）。 */
export function lock() {
  unlocked.value = false
  accessToken.value = ''
  setAuthKey('')
}

// 返回值：是否需要挂载应用（false = 正在重定向，别挂载）
export async function initAccessGate() {
  const url = new URL(location.href)
  const key = (url.searchParams.get('key') || '').trim()
  if (!key) return true

  try {
    await fetchJSON('/api/auth/verify', { method: 'POST', headers: { 'X-Access-Key': key } })
  } catch (e) {
    if (e && e.kind === 'auth') {
      // 密钥不对：抹掉地址栏里的 key，回到游客态（不挂载，正在跳转）
      lock()
      location.replace(cleanUrl())
      return false
    }
    // 后端不可达 ≠ 密钥错误：不能静默重定向，那会把 ?key= 抹掉，
    // 服务恢复后连正确密钥也进不去。保留地址栏，挂载并提示。
    gateNotice.value = '无法校验访问密钥：' + ((e && e.message) || '服务未响应')
    return true
  }

  // 正确：抹掉地址栏里的 key，留在当前页解锁
  unlocked.value = true
  accessToken.value = key
  setAuthKey(key)
  history.replaceState(null, '', cleanUrl())
  return true
}

/** 修改访问密钥：后端用新密钥重算校验值（密钥本身不落盘）。需要当前密钥已通过校验。 */
export async function changeKey(key) {
  const data = await fetchJSON('/api/auth/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })
  if (!data.ok) throw new Error(data.error || '保存失败')
  accessToken.value = key   // 当前会话继续有效，「另开预览」链接也用新密钥
  setAuthKey(key)
  return true
}
