// 统一的 JSON 请求层：把「服务未启动 / 空响应 / 非 JSON / 密钥失效」翻译成可读文案。
//
// 背景：开发时 Vite 把 /api 代理到后端；后端没起来时代理会回一个 500 且 body 为空，
// 直接 res.json() 会把解析器原文（JSON.parse: unexpected end of data）抛给用户。
// 所以这里一律先取 text() 再自己 JSON.parse，绝不让解析器的错误外泄。
//
// 失败一律抛出带 kind 的 Error：
//   kind='down'    网络层失败，或非 2xx 却拿不到服务端文案（空 body / 网关状态码）
//   kind='http'    非 2xx，且服务端给了可读文案（serverText 即服务端原文）
//   kind='auth'    401：密钥不对或已失效
//   kind='empty'   2xx 但 body 为空
//   kind='badjson' 2xx 但 body 不是 JSON
// 另外附带 status / serverText / body（body 仅供排障，界面一般不展示）
export const MSG_DOWN = '本地服务未启动或未响应'

// 反代连不上后端时的网关状态码
const GATEWAY = new Set([502, 503, 504])

/**
 * 后端地址前缀。默认为空 = 同源：
 * 部署时由同机的 Caddy（或 nginx）把 /api 反代到后端，所以默认不用配。
 * 只有真把前端放到另一个源（CDN）时才需要在构建时设 VITE_API_BASE。
 */
export const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')

// 访问密钥只留在内存里：不落 localStorage / sessionStorage / Cookie，
// 刷新页面后用地址栏里的 ?key= 重新验一次。与改造前的约定一致。
let authKey = ''
let authFailureHandler = null

export function setAuthKey(k) {
  authKey = k || ''
}

/** 注册「密钥失效」的回调（由 useAccessGate 注册成 lock()）。 */
export function setAuthFailureHandler(cb) {
  authFailureHandler = cb || null
}

function httpError(kind, message, extra) {
  const e = new Error(message)
  e.kind = kind
  if (extra) {
    e.status = extra.status
    e.serverText = extra.serverText
    e.body = extra.body
  }
  return e
}

function withBase(url) {
  return /^https?:/i.test(url) ? url : API_BASE + url
}

export async function fetchJSON(url, options) {
  const opts = { ...options }
  if (authKey) {
    // 合并而非覆盖：调用方自己的 Content-Type 等不能被丢掉。
    // 注意上传走的是原始 body（fetch(url,{body:file})），这里加个头不影响它。
    opts.headers = { ...(opts.headers || {}), 'X-Access-Key': authKey }
  }

  let res
  try {
    res = await fetch(withBase(url), opts)
  } catch {
    // fetch 只在网络层失败时 reject：端口不通 / 服务没起来 / 被代理挡下
    throw httpError('down', MSG_DOWN)
  }

  let text = ''
  try {
    text = await res.text()
  } catch {
    throw httpError('down', MSG_DOWN)   // 响应体读到一半连接断了
  }
  const body = text.trim()

  let data = null
  if (body) { try { data = JSON.parse(body) } catch { data = null } }

  if (res.status === 401) {
    const msg = (data && typeof data.error === 'string' && data.error) ? data.error : '访问密钥不正确'
    if (authFailureHandler) authFailureHandler()
    throw httpError('auth', msg, { status: 401, serverText: msg, body: text })
  }

  if (!res.ok) {
    const msg = (data && typeof data.error === 'string' && data.error) ? data.error : ''
    // 服务端自己的文案优先，且它通常已含绝对路径
    if (msg) throw httpError('http', msg, { status: res.status, serverText: msg, body: text })
    // 拿不到服务端文案：本服务所有错误响应都带 JSON body，所以这说明请求没到 API 服务
    // （开发时代理回的空 500、或反代回的空 502/504）
    if (!body || GATEWAY.has(res.status)) throw httpError('down', MSG_DOWN, { status: res.status })
    throw httpError('http', '请求失败（HTTP ' + res.status + '）', { status: res.status, body: text })
  }

  if (!body) throw httpError('empty', '服务返回了空响应', { status: res.status })
  if (data === null) throw httpError('badjson', '服务返回的不是 JSON 数据', { status: res.status, body: text })
  return data
}
