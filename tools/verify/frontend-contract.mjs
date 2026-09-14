// 按前端真实会发的请求逐个回放，断言它读取的每个字段都在。
// 这不是对拍，而是「前端的契约预期」—— 取代无法自动化的人工点测。
const BASE = process.argv[2] || 'http://127.0.0.1:8090'
const KEY = 'ihateblog'

let pass = 0, fail = 0
function check(label, cond, extra) {
  if (cond) { pass++; console.log(`PASS  ${label}`) }
  else { fail++; console.log(`FAIL  ${label}${extra ? '  → ' + extra : ''}`) }
}
async function call(method, path, { key, json, body } = {}) {
  const headers = {}
  if (key) headers['X-Access-Key'] = key
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const r = await fetch(BASE + path, { method, headers, body: json !== undefined ? json : body })
  const buf = Buffer.from(await r.arrayBuffer())
  const ct = r.headers.get('content-type') || ''
  let parsed = null
  if (ct.includes('json')) { try { parsed = JSON.parse(buf.toString('utf8')) } catch { parsed = buf.toString('utf8') } }
  return { status: r.status, ct, buf, parsed, headers: r.headers }
}

// ── 1. initStore：fetchConfig → applyConfig ───────────────────────────
let wsId = null
{
  const r = await call('GET', '/api/config')
  check('GET /api/config 前端读得动（200 + 4 个顶层键）',
    r.status === 200 && 'prefs' in r.parsed && 'workspaces' in r.parsed && 'activeWs' in r.parsed && 'activePath' in r.parsed,
    `${r.status} ${JSON.stringify(Object.keys(r.parsed || {}))}`)
  const ws = r.parsed.workspaces || []
  check('工作区带 id / name / os / root（前端靠 id 调 API）',
    ws.length > 0 && ['id', 'name', 'os', 'root'].every(k => ws[0][k] !== undefined),
    JSON.stringify(ws[0]))
  check('prefs 里前端会用到的键都在',
    ['bg', 'bgUrl', 'veil', 'poem', 'speed', 'poemSize', 'tocDefaultHidden', 'readerSize', 'icpOn', 'icpText', 'icpUrl']
      .every(k => k in r.parsed.prefs),
    JSON.stringify(Object.keys(r.parsed.prefs || {})))
  wsId = (ws.find(w => w.id === r.parsed.activeWs) || ws[0] || {}).id
}

// ── 2. loadTree：apiWs(ws.id) → data.tree ─────────────────────────────
let firstDoc = null, firstImg = null, firstPdf = null
{
  const r = await call('GET', `/api/ws?ws=${encodeURIComponent(wsId)}`)
  check('GET /api/ws?ws= 返回 {root, tree}', r.status === 200 && typeof r.parsed.root === 'string' && Array.isArray(r.parsed.tree),
    `${r.status}`)
  const dirs = [], files = []
  ;(function walk(list) {
    for (const n of list || []) { if (n.d) { dirs.push(n); walk(n.d) } else files.push(n) }
  })(r.parsed.tree)
  check('目录节点形状 {n,p,d}（前端 TreeNode/ShelfBrowser 依赖）',
    dirs.length > 0 && dirs.every(n => typeof n.n === 'string' && typeof n.p === 'string' && Array.isArray(n.d)),
    JSON.stringify(dirs[0] || {}).slice(0, 120))
  check('文件节点形状 {n,p,size,mt,ext}',
    files.length > 0 && files.every(n => typeof n.n === 'string' && typeof n.p === 'string' &&
      typeof n.size === 'number' && typeof n.mt === 'string' && typeof n.ext === 'string'),
    JSON.stringify(files[0] || {}).slice(0, 140))
  check('mt 是 YYYY-MM-DD HH:mm（前端 fmtDate 直接展示）',
    files.length > 0 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(files[0].mt), files[0] && files[0].mt)
  firstDoc = (files.find(f => f.ext === 'md') || {}).p
  firstPdf = (files.find(f => f.ext === 'pdf') || {}).p
  check('树里能找到 md 与 pdf', !!firstDoc && !!firstPdf, `md=${firstDoc} pdf=${firstPdf}`)
  check('图片不进目录树（只收文档类扩展名，与旧服务一致）',
    !files.some(f => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(f.ext)),
    JSON.stringify(files.filter(f => f.ext === 'png').slice(0, 2)))
}

// ── 3. openDoc：apiDoc(ws.id, rel) → data.text ────────────────────────
{
  const r = await call('GET', `/api/doc?ws=${encodeURIComponent(wsId)}&rel=${encodeURIComponent(firstDoc)}`)
  check('GET /api/doc 返回 {text,size,mt} 且 text 非空',
    r.status === 200 && typeof r.parsed.text === 'string' && r.parsed.text.length > 0 &&
    typeof r.parsed.size === 'number' && typeof r.parsed.mt === 'string',
    `${r.status} text 长度 ${(r.parsed.text || '').length}`)
  const b = await call('GET', `/api/doc?ws=${encodeURIComponent(wsId)}&rel=${encodeURIComponent(firstPdf)}`)
  check('二进制文档（pdf）返回 binary:true 且 text 为空（前端据此不渲染正文）',
    b.status === 200 && b.parsed.binary === true && b.parsed.text === '', `${b.status} ${JSON.stringify(b.parsed).slice(0, 100)}`)
}

// ── 4. md 正文里的图片：/api/img ──────────────────────────────────────
// 图片不在目录树里，前端是从 md 正文的 ![...](../images/x.png) 解析出来的，
// 所以这里也照那条路径走：读一篇含图引用的 md → 按 docDir 归一化 → 请求 /api/img。
let imgRel = null, imgDocDir = null
{
  const mdFiles = []
  ;(function walk(list) {
    for (const n of list || []) { if (n.d) walk(n.d); else if (n.ext === 'md') mdFiles.push(n.p) }
  })((await call('GET', `/api/ws?ws=${encodeURIComponent(wsId)}`)).parsed.tree)

  for (const p of mdFiles) {
    const d = await call('GET', `/api/doc?ws=${encodeURIComponent(wsId)}&rel=${encodeURIComponent(p)}`)
    const m = /!\[[^\]]*\]\((?!https?:|data:)([^)\s]+)/.exec(d.parsed.text || '')
    if (!m) continue
    // 与前端 resolveImg 相同的归一化（处理 ../ 与 .）
    imgDocDir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
    const segs = ((imgDocDir ? imgDocDir + '/' : '') + m[1]).split('/')
    const parts = []
    for (const s of segs) { if (!s || s === '.') continue; if (s === '..') { parts.pop(); continue } parts.push(s) }
    imgRel = parts.join('/')
    break
  }
  check('在 md 正文里找到本地图片引用并归一化', !!imgRel, `rel=${imgRel}`)

  if (imgRel) {
    const r = await call('GET', `/api/img?ws=${encodeURIComponent(wsId)}&rel=${encodeURIComponent(imgRel)}`)
    check('GET /api/img 返回原始字节 + image/* Content-Type',
      r.status === 200 && r.buf.length > 0 && /^image\//.test(r.headers.get('content-type') || ''),
      `${r.status} ${r.headers.get('content-type')} ${r.buf.length}B  rel=${imgRel}`)
  }
}

// ── 5. 门禁：status → verify ─────────────────────────────────────────
{
  const s = await call('GET', '/api/auth/status')
  check('GET /api/auth/status → {required:true}', s.status === 200 && s.parsed.required === true)
  const v = await call('POST', '/api/auth/verify', { key: KEY })
  check('POST /api/auth/verify 带正确密钥 → {ok:true}', v.status === 200 && v.parsed.ok === true)
  const bad = await call('POST', '/api/auth/verify', { key: 'definitelywrong123' })
  check('错密钥 → 401 且带 error 文案（前端据此判断 kind=auth 并重定向）',
    bad.status === 401 && typeof bad.parsed.error === 'string', `${bad.status} ${JSON.stringify(bad.parsed)}`)
  const nokey = await call('POST', '/api/config', { json: '{"prefs":{}}' })
  check('不带密钥写设置 → 401（前端 persist 会识别为密钥失效）', nokey.status === 401)
}

// ── 6. persist：POST /api/config → data.ok ───────────────────────────
{
  const cur = (await call('GET', '/api/config')).parsed
  const r = await call('POST', '/api/config', {
    key: KEY,
    json: JSON.stringify({ prefs: cur.prefs, workspaces: cur.workspaces, activeWs: cur.activeWs, activePath: cur.activePath }),
  })
  check('POST /api/config 带密钥 → {ok:true,config}', r.status === 200 && r.parsed.ok === true && !!r.parsed.config,
    `${r.status}`)
  check('回显的 config 结构完整（前端 applyConfig 会整体覆盖）',
    ['prefs', 'workspaces', 'activeWs', 'activePath'].every(k => k in r.parsed.config))
}

// ── 7. 上传图库 ──────────────────────────────────────────────────────
let madeName = null
{
  const l = await call('GET', '/api/uploads')
  check('GET /api/uploads → {files:[{name,url,size,mt}]}',
    l.status === 200 && Array.isArray(l.parsed.files) &&
    l.parsed.files.every(f => ['name', 'url', 'size', 'mt'].every(k => k in f)),
    `${l.status} ${JSON.stringify(l.parsed.files?.[0] || [])}`)

  const up = await call('POST', '/api/upload?name=contract.png', {
    key: KEY, body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]),
  })
  check('POST /api/upload → {ok,name,url}（前端取 name 与 url）',
    up.status === 200 && up.parsed.ok === true && typeof up.parsed.name === 'string' &&
    up.parsed.url === '/api/uploads/' + up.parsed.name,
    `${up.status} ${JSON.stringify(up.parsed)}`)
  madeName = up.parsed.name

  const g = await call('GET', '/api/uploads/' + encodeURIComponent(madeName))
  check('取回上传的图 → 200 字节', g.status === 200 && g.buf.length === 11, `${g.status} ${g.buf.length}B`)

  const d = await call('DELETE', '/api/uploads/' + encodeURIComponent(madeName), { key: KEY })
  check('DELETE → {ok:true}', d.status === 200 && d.parsed.ok === true, `${d.status} ${JSON.stringify(d.parsed)}`)
}

// ── 8. 改密钥接口的形状（用同一个密钥，等价于空操作）────────────────────
{
  const r = await call('POST', '/api/auth/key', { key: KEY, json: JSON.stringify({ key: KEY }) })
  check('POST /api/auth/key → {ok:true}', r.status === 200 && r.parsed.ok === true, `${r.status} ${JSON.stringify(r.parsed)}`)
  const check2 = await call('POST', '/api/auth/verify', { key: KEY })
  check('改密钥后（同一密钥）仍可解锁', check2.status === 200)
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'SOME FAILED'}  (${pass} passed, ${fail} failed)`)
process.exitCode = fail === 0 ? 0 : 1
