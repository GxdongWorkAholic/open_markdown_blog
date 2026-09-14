// Phase 4 验收：服务端鉴权
const BASE = process.argv[2] || 'http://127.0.0.1:8084'
const REAL_KEY = 'ihateblog'        // 用户当前的真实密钥（spike 已验证）

let pass = 0, fail = 0
function check(label, cond, extra) {
  if (cond) { pass++; console.log(`PASS  ${label}`) }
  else { fail++; console.log(`FAIL  ${label}${extra ? '  → ' + extra : ''}`) }
}
async function call(method, path, { key, body, json } = {}) {
  const headers = {}
  if (key) headers['X-Access-Key'] = key
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const r = await fetch(BASE + path, { method, headers, body: json !== undefined ? json : body })
  const text = await r.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return { status: r.status, body: parsed, text }
}

// ── 1. status：只回答「要不要解锁」，绝不吐密文 ──────────────────────────
{
  const r = await call('GET', '/api/auth/status')
  check('GET /api/auth/status → 200 且 required:true', r.status === 200 && r.body?.required === true,
    `${r.status} ${r.text}`)
  const raw = JSON.stringify(r.body)
  check('响应体里不含 salt / iv / ct（旧 /api/secure 的洞已堵）',
    !raw.includes('salt') && !raw.includes('"iv"') && !raw.includes('"ct"'), raw)
}

// ── 2. 用真实密钥验 → 200 ──────────────────────────────────────────────
{
  const r = await call('POST', '/api/auth/verify', { key: REAL_KEY })
  check('用真实密钥 verify → 200 {"ok":true}', r.status === 200 && r.body?.ok === true,
    `${r.status} ${r.text}`)
}
// ── 3. 错密钥 → 401 ───────────────────────────────────────────────────
{
  const r = await call('POST', '/api/auth/verify', { key: 'wrongkey12345' })
  check('错密钥 verify → 401 且文案与旧服务一致',
    r.status === 401 && r.body?.ok === false && r.body?.error === '访问密钥不正确', `${r.status} ${r.text}`)
}
{
  const r = await call('POST', '/api/auth/verify')
  check('不带密钥 verify → 401', r.status === 401, `${r.status} ${r.text}`)
}

// ── 4. 写接口的鉴权（旧 Node 服务这几个是完全裸奔的）──────────────────
const cfgBody = JSON.stringify({ prefs: { veil: 0.4 }, workspaces: [], activeWs: null, activePath: null })
{
  const r = await call('POST', '/api/config', { json: cfgBody })
  check('不带密钥 POST /api/config → 401（旧实现是 200）', r.status === 401, `${r.status} ${r.text}`)
}
{
  const r = await call('POST', '/api/config', { key: 'wrongkey12345', json: cfgBody })
  check('错密钥 POST /api/config → 401', r.status === 401, `${r.status} ${r.text}`)
}
{
  const r = await call('POST', '/api/config', { key: REAL_KEY, json: cfgBody })
  check('正确密钥 POST /api/config → 200', r.status === 200 && r.body?.ok === true, `${r.status} ${r.text}`)
}
{
  const r = await call('POST', '/api/config/reset', {})
  check('不带密钥 POST /api/config/reset → 401', r.status === 401, `${r.status} ${r.text}`)
}
{
  const r = await call('GET', '/api/config')
  check('GET /api/config 仍公开（游客要渲染首页）', r.status === 200, `${r.status}`)
}

// ── 5. 改密钥：旧实现没有任何鉴权，这里必须有 ─────────────────────────────
{
  const r = await call('POST', '/api/auth/key', { json: JSON.stringify({ key: 'testkey12345' }) })
  check('不带密钥改密钥 → 401（旧实现是 200，这是有意的破坏性变更）', r.status === 401, `${r.status} ${r.text}`)
}
{
  const r = await call('POST', '/api/auth/key', { key: REAL_KEY, json: JSON.stringify({ key: 'short' }) })
  const EN_DASH_MSG = '密钥需为 8–256 位大小写字母或数字'
  check('新密钥不合规 → 400 且文案逐字一致（含全角连接号 U+2013）',
    r.status === 400 && r.body?.error === EN_DASH_MSG, `${r.status} ${JSON.stringify(r.body?.error)}`)
}
{
  const r = await call('POST', '/api/auth/key', { key: REAL_KEY, json: '{ not json' })
  check('改密钥传坏 JSON → 400「JSON 解析失败」（与 /api/config 的文案不同）',
    r.status === 400 && r.body?.error === 'JSON 解析失败', `${r.status} ${r.text}`)
}

// ── 6. 真的改掉再改回来（必须还原成用户的真实密钥）──────────────────────
const NEW_KEY = 'TmpTest20260913'
{
  const r = await call('POST', '/api/auth/key', { key: REAL_KEY, json: JSON.stringify({ key: NEW_KEY }) })
  check(`改密钥为 ${NEW_KEY} → 200`, r.status === 200 && r.body?.ok === true, `${r.status} ${r.text}`)
  check('旧密钥立刻失效 → 401', (await call('POST', '/api/auth/verify', { key: REAL_KEY })).status === 401)
  check('新密钥可用 → 200', (await call('POST', '/api/auth/verify', { key: NEW_KEY })).status === 200)
}
{
  const r = await call('POST', '/api/auth/key', { key: NEW_KEY, json: JSON.stringify({ key: REAL_KEY }) })
  check('改回用户的真实密钥 → 200', r.status === 200, `${r.status} ${r.text}`)
  check('真实密钥恢复可用 → 200', (await call('POST', '/api/auth/verify', { key: REAL_KEY })).status === 200)
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'SOME FAILED'}  (${pass} passed, ${fail} failed)`)
process.exitCode = fail === 0 ? 0 : 1
