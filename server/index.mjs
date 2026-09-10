// 本地目录服务 + 设置持久化。
// - 扫描指定路径、读取文档/图片（浏览器无法读本地磁盘，故由本服务代读）
// - 设置持久化到 data/config.json；上传图片存 data/uploads/
// 运行：node server/index.mjs  （PORT 环境变量可改端口，默认 8787）
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const DATA_DIR = path.join(ROOT, 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')  // 图片上传的默认路径
const PORT = Number(process.env.PORT || 8787)

const DOC_EXTS = new Set(['md', 'markdown', 'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf'])
const IMG_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', '.idea', '.vscode'])

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
}

// 默认设置（默认工作区为空，由用户在设置页新增真实路径）
const DEFAULT_CONFIG = {
  prefs: {
    bg: 'default', bgUrl: '', veil: 0.5,
    poem: ['问渠那得清如许', '为有源头活水来', '千淘万漉虽辛苦', '吹尽狂沙始到金', '不积跬步，无以至千里', '不积小流，无以成江海'],
    speed: 'mid', poemSize: 46, tocDefaultHidden: false, readerSize: 17,
  },
  workspaces: [],
  activeWs: null,
  activePath: null,
}

function extOf(name) { const i = name.lastIndexOf('.'); return i === -1 ? '' : name.slice(i + 1).toLowerCase() }
function pad(n) { return String(n).padStart(2, '0') }
function fmtMt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function readDirSafe(p) { try { return fs.readdirSync(p, { withFileTypes: true }) } catch { return null } }

// ─────────── 设置持久化 ───────────
function readConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    return {
      prefs: { ...DEFAULT_CONFIG.prefs, ...(cfg.prefs || {}) },
      workspaces: Array.isArray(cfg.workspaces) ? cfg.workspaces : [],
      activeWs: cfg.activeWs || null,
      activePath: cfg.activePath || null,
    }
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  }
}
function writeConfig(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8')
}

// ─────────── 访问密钥门禁（方案 B：只存密文，密钥不落盘） ───────────
// 前端用 ?key= 派生密钥去解密密文，解得开即解锁。服务端从不保存密钥本身。
const DEFAULT_KEY = 'ihateblog'   // 默认访问密钥（请在设置页修改）
const KEY_RE = /^[A-Za-z0-9]{8,256}$/
const SECURE_FILE = path.join(DATA_DIR, 'secure.json')
const PBKDF2_ITER = 210000
const SECURE_MARKER = 'open-markdown-blog:granted'

// 用访问密钥加密「门禁标记」→ { salt, iv, ct }。密钥本身不保存。
function encryptMarker(token) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = pbkdf2Sync(token, salt, PBKDF2_ITER, 32, 'sha256')
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(SECURE_MARKER, 'utf8'), cipher.final()])
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: Buffer.concat([ct, cipher.getAuthTag()]).toString('base64'),
  }
}

function readSecure() {
  try { return JSON.parse(fs.readFileSync(SECURE_FILE, 'utf8')) } catch { return null }
}
function writeSecure(obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(SECURE_FILE, JSON.stringify(obj), 'utf8')
}
// 首次运行（或密文丢失）时用默认密钥生成
function ensureSecure() {
  let s = readSecure()
  if (!s || !s.salt || !s.iv || !s.ct) {
    s = encryptMarker(DEFAULT_KEY)
    writeSecure(s)
  }
  return s
}

// ─────────── 目录扫描 ───────────
// 递归扫描，构建 { n, p, d?, size?, mt?, ext? }（只含文档；只保留含文档的目录）
function collectDir(abs, rel) {
  const entries = readDirSafe(abs)
  if (!entries) return []
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  const out = []
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
    const p = rel ? rel + '/' + e.name : e.name
    const full = path.join(abs, e.name)
    if (e.isDirectory()) {
      const children = collectDir(full, p)
      if (children.length) out.push({ n: e.name, p, d: children })
    } else if (e.isFile()) {
      const ext = extOf(e.name)
      if (!DOC_EXTS.has(ext)) continue // 只展示文档，图片等资源不进目录树
      let st
      try { st = fs.statSync(full) } catch { continue }
      out.push({ n: e.name, p, size: st.size, mt: fmtMt(st.mtime), ext })
    }
  }
  return out
}

// 安全检查：把 rel 解析到 root 之内，防止 ../ 越界
function safeJoin(root, rel) {
  const base = path.resolve(root)
  const target = path.resolve(base, rel || '')
  if (target !== base && !target.startsWith(base + path.sep)) return null
  return target
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}
function sendText(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(text)
}
function readBody(req) {
  return new Promise(resolve => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => resolve(Buffer.alloc(0)))
  })
}
function sendFile(res, target, mime, cache) {
  let buf
  try { buf = fs.readFileSync(target) } catch { return sendText(res, 404, 'not found') }
  res.writeHead(200, {
    'Content-Type': mime || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': cache || 'no-cache',
  })
  res.end(buf)
}

// ─────────── API：目录 ───────────
function apiWs(url, res) {
  const root = url.searchParams.get('root') || ''
  if (!root) return sendJSON(res, 400, { error: '缺少 root 参数', tree: [] })
  const abs = path.resolve(root)
  if (!fs.existsSync(abs)) return sendJSON(res, 404, { error: '路径不存在：' + abs, tree: [] })
  if (!fs.statSync(abs).isDirectory()) return sendJSON(res, 400, { error: '不是目录：' + abs, tree: [] })
  sendJSON(res, 200, { root: abs, tree: collectDir(abs, '') })
}

function apiDoc(url, res) {
  const root = url.searchParams.get('root') || ''
  const rel = url.searchParams.get('rel') || ''
  const target = safeJoin(root, rel)
  if (!target) return sendJSON(res, 400, { error: '非法路径', text: '' })
  let st
  try { st = fs.statSync(target) } catch { return sendJSON(res, 404, { error: '文件不存在：' + rel, text: '' }) }
  if (!st.isFile()) return sendJSON(res, 400, { error: '不是文件：' + rel, text: '' })
  const ext = extOf(rel)
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
    return sendJSON(res, 200, { text: fs.readFileSync(target, 'utf8'), size: st.size, mt: fmtMt(st.mtime) })
  }
  sendJSON(res, 200, { text: '', size: st.size, mt: fmtMt(st.mtime), binary: true })
}

function apiImg(url, res) {
  const target = safeJoin(url.searchParams.get('root') || '', url.searchParams.get('rel') || '')
  if (!target) return sendText(res, 400, '非法路径')
  sendFile(res, target, MIME[path.extname(target).toLowerCase()])
}

// ─────────── API：设置持久化 + 图片上传 ───────────
function apiConfigGet(res) { sendJSON(res, 200, readConfig()) }

async function apiConfigSave(req, res) {
  const buf = await readBody(req)
  let cfg
  try { cfg = JSON.parse(buf.toString('utf8')) } catch { return sendJSON(res, 400, { error: '配置 JSON 解析失败' }) }
  const safe = {
    prefs: { ...DEFAULT_CONFIG.prefs, ...(cfg.prefs || {}) },
    workspaces: Array.isArray(cfg.workspaces) ? cfg.workspaces : [],
    activeWs: cfg.activeWs || null,
    activePath: cfg.activePath || null,
  }
  try { writeConfig(safe) } catch (e) { return sendJSON(res, 500, { error: '写入失败：' + e.message }) }
  sendJSON(res, 200, { ok: true, config: safe })
}

function apiConfigReset(res) {
  const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  try { writeConfig(cfg) } catch (e) { return sendJSON(res, 500, { error: '写入失败：' + e.message }) }
  sendJSON(res, 200, { ok: true, config: cfg })
}

// 修改访问密钥：用新密钥重新加密门禁密文（密钥本身不保存）
async function apiSetKey(req, res) {
  const buf = await readBody(req)
  let body
  try { body = JSON.parse(buf.toString('utf8')) } catch { return sendJSON(res, 400, { error: 'JSON 解析失败' }) }
  const key = String(body.key || '').trim()
  if (!KEY_RE.test(key)) return sendJSON(res, 400, { error: '密钥需为 8–256 位大小写字母或数字' })
  try {
    writeSecure(encryptMarker(key))
    sendJSON(res, 200, { ok: true })
  } catch (e) {
    sendJSON(res, 500, { error: '保存失败：' + e.message })
  }
}

// 上传文件名：年月日时分秒-16位随机串.扩展名
function uploadStamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
function randStr(n) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(n)
  let s = ''
  for (let i = 0; i < n; i++) s += chars[bytes[i] % chars.length]
  return s
}

async function apiUpload(url, req, res) {
  const raw = url.searchParams.get('name') || 'upload.png'
  const ext = path.extname(raw).toLowerCase() || '.png'
  if (!IMG_EXTS.has(ext.slice(1))) return sendJSON(res, 400, { error: '只支持图片：' + [...IMG_EXTS].join('/') })
  const buf = await readBody(req)
  if (!buf.length) return sendJSON(res, 400, { error: '空文件' })
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    const fname = uploadStamp() + '-' + randStr(16) + ext
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf)
    sendJSON(res, 200, { ok: true, name: fname, url: '/api/uploads/' + fname })
  } catch (e) {
    sendJSON(res, 500, { error: '保存失败：' + e.message })
  }
}

// 已上传图片列表（文件名以时间戳开头，倒序 = 最新在前）
function apiUploadsList(res) {
  let entries = []
  try { entries = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true }) } catch { entries = [] }
  const files = entries
    .filter(e => e.isFile() && IMG_EXTS.has(extOf(e.name)))
    .map(e => {
      let st
      try { st = fs.statSync(path.join(UPLOAD_DIR, e.name)) } catch { return null }
      return { name: e.name, url: '/api/uploads/' + e.name, size: st.size, mt: fmtMt(st.mtime) }
    })
    .filter(Boolean)
    .sort((a, b) => b.name.localeCompare(a.name))
  sendJSON(res, 200, { files })
}

// 删除已上传的图片文件
function apiUploadDelete(target, res) {
  if (!path.resolve(target).startsWith(path.resolve(UPLOAD_DIR))) {
    return sendJSON(res, 400, { error: '非法路径' })
  }
  try {
    fs.unlinkSync(target)
    sendJSON(res, 200, { ok: true })
  } catch (e) {
    sendJSON(res, 404, { error: '删除失败：' + e.message })
  }
}

// ─────────── 静态文件 ───────────
function serveStatic(pathname, res) {
  const file = pathname === '/' ? '/index.html' : pathname
  const target = path.join(DIST, file)
  if (!target.startsWith(DIST)) return sendText(res, 403, 'forbidden')
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    return sendFile(res, target, MIME[path.extname(target).toLowerCase()])
  }
  // SPA fallback
  const idx = path.join(DIST, 'index.html')
  if (!fs.existsSync(idx)) return sendText(res, 404, 'dist 不存在，请先 npm run build')
  sendFile(res, idx, MIME['.html'])
}

const server = http.createServer(async (req, res) => {
  let url
  try { url = new URL(req.url, 'http://localhost') } catch { return sendText(res, 400, 'bad request') }
  const pathname = decodeURIComponent(url.pathname)
  const method = req.method || 'GET'

  if (pathname === '/api/secure') return sendJSON(res, 200, ensureSecure())
  if (pathname === '/api/key' && method === 'POST') return apiSetKey(req, res)
  if (pathname === '/api/config') {
    if (method === 'POST') return apiConfigSave(req, res)
    return apiConfigGet(res)
  }
  if (pathname === '/api/config/reset' && method === 'POST') return apiConfigReset(res)
  if (pathname === '/api/upload' && method === 'POST') return apiUpload(url, req, res)
  if (pathname === '/api/uploads') return apiUploadsList(res)
  if (pathname.startsWith('/api/uploads/')) {
    const name = path.basename(pathname) // 防目录穿越
    const target = path.join(UPLOAD_DIR, name)
    if (method === 'DELETE') return apiUploadDelete(target, res)
    // 文件名含时间戳+随机串，内容不变 → 长缓存（利于缩略图复用）
    return sendFile(res, target, MIME[path.extname(name).toLowerCase()], 'public, max-age=31536000, immutable')
  }
  if (pathname === '/api/ws') return apiWs(url, res)
  if (pathname === '/api/doc') return apiDoc(url, res)
  if (pathname === '/api/img') return apiImg(url, res)

  serveStatic(pathname, res)
})

server.listen(PORT, () => {
  console.log(`[dir-server] http://localhost:${PORT}/`)
  console.log(`[dir-server] 目录: /api/ws /api/doc /api/img`)
  console.log(`[dir-server] 设置: GET|POST /api/config, POST /api/config/reset`)
  console.log(`[dir-server] 上传: POST /api/upload?name=x.png  ->  ${UPLOAD_DIR}`)
  console.log(`[dir-server] 门禁: GET /api/secure, POST /api/key（默认密钥 ${DEFAULT_KEY}，可在设置页修改）`)
  console.log(`[dir-server] 托管静态文件: ${DIST}`)
})
