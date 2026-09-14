// Phase 2 验收：/api/config 三个端点
// 断言依据全部来自旧 Node 服务的实现（vue3/server/index.mjs 的 readConfig / apiConfigSave / apiConfigReset）
const BASE = process.argv[2] || 'http://127.0.0.1:8082'

let pass = 0, fail = 0
function check(label, cond, extra) {
  if (cond) { pass++; console.log(`PASS  ${label}`) }
  else { fail++; console.log(`FAIL  ${label}${extra ? '  → ' + extra : ''}`) }
}
async function get() {
  const r = await fetch(BASE + '/api/config')
  return { status: r.status, body: await r.json() }
}
const KEY = 'ihateblog'   // 写接口需要密钥（改造后 POST /api/config 不再是裸奔的）
async function post(path, raw, headers = { 'Content-Type': 'application/json', 'X-Access-Key': KEY }) {
  const r = await fetch(BASE + path, { method: 'POST', headers, body: raw })
  const text = await r.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text }
  return { status: r.status, body, text }
}

const DEFAULT_POEM = ['问渠那得清如许', '为有源头活水来', '千淘万漉虽辛苦', '吹尽狂沙始到金', '不积跬步，无以至千里', '不积小流，无以成江海']

// ── 1. 初始 GET：出厂默认 ────────────────────────────────────────────────
{
  const { status, body } = await get()
  check('GET 返回 200', status === 200, 'status=' + status)
  check('prefs.veil = 0.5（数字未被改写成 5.0E-1）', body.prefs.veil === 0.5, JSON.stringify(body.prefs.veil))
  check('prefs.poem 是 6 句且全角逗号保留', Array.isArray(body.prefs.poem) && body.prefs.poem.length === 6
    && body.prefs.poem[4] === DEFAULT_POEM[4], JSON.stringify(body.prefs.poem))
  check('prefs.bg = default / speed = mid / readerSize = 17',
    body.prefs.bg === 'default' && body.prefs.speed === 'mid' && body.prefs.readerSize === 17)
  check('prefs.icpUrl 默认值', body.prefs.icpUrl === 'https://beian.miit.gov.cn')
  check('workspaces 为空数组', Array.isArray(body.workspaces) && body.workspaces.length === 0,
    JSON.stringify(body.workspaces))
  check('activeWs / activePath 为 null', body.activeWs === null && body.activePath === null,
    `${body.activeWs} / ${body.activePath}`)
  check('顶层键就是那 4 个', JSON.stringify(Object.keys(body)) === '["prefs","workspaces","activeWs","activePath"]',
    JSON.stringify(Object.keys(body)))
}

// ── 2. POST 保存：未知字段与未知 prefs 键必须原样往返 ──────────────────────
const payload = {
  prefs: { veil: 0.35, bg: 'custom', bgUrl: '/api/uploads/x.jpg', 未来新增的键: '要保留' },
  workspaces: [
    { id: 'mymajor', name: 'mymajor', os: 'linux', root: '/data/ws/mymajor', desc: 'Java 学习库' },
    { id: 'mymdrecord', name: 'mymdrecord', os: 'linux', root: '/data/ws/mymdrecord', desc: '分类笔记库' },
  ],
  activeWs: 'mymajor',
  activePath: 'java-doc/01-java基础',
}
{
  const r = await post('/api/config', JSON.stringify(payload))
  check('POST 返回 200 且 ok:true', r.status === 200 && r.body.ok === true, `${r.status} ${r.text.slice(0, 120)}`)
  check('POST 回显的 config.prefs.veil = 0.35', r.body?.config?.prefs?.veil === 0.35)
  check('POST 回显保留了未知 prefs 键', r.body?.config?.prefs?.['未来新增的键'] === '要保留',
    JSON.stringify(r.body?.config?.prefs))
  check('POST 回显的 workspaces 保留了 desc', r.body?.config?.workspaces?.[0]?.desc === 'Java 学习库',
    JSON.stringify(r.body?.config?.workspaces?.[0]))
  check('默认键被合并补齐（poem 仍在）', Array.isArray(r.body?.config?.prefs?.poem) && r.body.config.prefs.poem.length === 6)
}

// ── 3. 再 GET：确认真的落库了 ───────────────────────────────────────────
{
  const { body } = await get()
  check('落库后 workspaces 有 2 条', body.workspaces.length === 2, JSON.stringify(body.workspaces))
  check('工作区键顺序 id→name→os→root→desc',
    JSON.stringify(Object.keys(body.workspaces[0])) === '["id","name","os","root","desc"]',
    JSON.stringify(Object.keys(body.workspaces[0])))
  check('工作区数组顺序按 sort_no 保持', body.workspaces[0].id === 'mymajor' && body.workspaces[1].id === 'mymdrecord')
  check('activeWs / activePath 落库', body.activeWs === 'mymajor' && body.activePath === 'java-doc/01-java基础',
    `${body.activeWs} / ${body.activePath}`)
  check('desc 未经服务端改动', body.workspaces[1].desc === '分类笔记库')
}

// ── 4. 归一化：workspaces 不是数组 → []；activeWs 空串 → null ──────────────
{
  const r = await post('/api/config', JSON.stringify({ prefs: {}, workspaces: 'not-an-array', activeWs: '', activePath: '' }))
  check('workspaces 非数组 → []', Array.isArray(r.body?.config?.workspaces) && r.body.config.workspaces.length === 0,
    JSON.stringify(r.body?.config?.workspaces))
  check('activeWs 空串 → null', r.body?.config?.activeWs === null, JSON.stringify(r.body?.config?.activeWs))
}

// ── 5. reset：清空工作区 + prefs 回默认 ─────────────────────────────────
{
  await post('/api/config', JSON.stringify(payload))
  const r = await post('/api/config/reset', null, { 'X-Access-Key': KEY })
  check('reset 返回 200 且 ok:true', r.status === 200 && r.body.ok === true, `${r.status} ${r.text.slice(0, 120)}`)
  check('reset 后 workspaces 清空（默认值就是 []）', r.body?.config?.workspaces?.length === 0)
  check('reset 后 prefs 回默认（veil 0.5）', r.body?.config?.prefs?.veil === 0.5)
  check('reset 后未知 prefs 键消失', r.body?.config?.prefs?.['未来新增的键'] === undefined)
  const { body } = await get()
  check('reset 后再 GET 仍是默认', body.prefs.veil === 0.5 && body.workspaces.length === 0)
}

// ── 6. 错误路径 ─────────────────────────────────────────────────────────
{
  const r = await post('/api/config', '{ this is not json')
  check('坏 JSON → 400「配置 JSON 解析失败」',
    r.status === 400 && r.body?.error === '配置 JSON 解析失败', `${r.status} ${r.text.slice(0, 120)}`)
}
{
  const r = await post('/api/config', '')
  check('空 body → 400「配置 JSON 解析失败」',
    r.status === 400 && r.body?.error === '配置 JSON 解析失败', `${r.status} ${r.text.slice(0, 120)}`)
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'SOME FAILED'}  (${pass} passed, ${fail} failed)`)
process.exitCode = fail === 0 ? 0 : 1
