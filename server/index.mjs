// 本地目录服务：扫描指定路径、读取文档/图片，并托管构建后的前端。
// 浏览器无法读取本地磁盘，因此由本服务在服务器端按「工作区 root 路径」实时扫描与读取。
// 运行：node server/index.mjs  （PORT 环境变量可改端口，默认 8787）
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')
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

function extOf(name) { const i = name.lastIndexOf('.'); return i === -1 ? '' : name.slice(i + 1).toLowerCase() }

function pad(n) { return String(n).padStart(2, '0') }
function fmtMt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function readDirSafe(p) { try { return fs.readdirSync(p, { withFileTypes: true }) } catch { return null } }

// 递归扫描目录，构建与原型一致的树结构：{ n, p, d?, size?, mt?, ext? }（只含文档，不含图片；
// 只保留含文档的目录，纯图片/空目录不进树）
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

// ─────────── API ───────────
function apiWs(url, res) {
  const root = url.searchParams.get('root') || ''
  if (!root) return sendJSON(res, 400, { error: '缺少 root 参数' })
  const abs = path.resolve(root)
  if (!fs.existsSync(abs)) return sendJSON(res, 404, { error: '路径不存在：' + abs, tree: [] })
  if (!fs.statSync(abs).isDirectory()) return sendJSON(res, 400, { error: '不是目录：' + abs, tree: [] })
  const tree = collectDir(abs, '')
  sendJSON(res, 200, { root: abs, tree })
}

function apiDoc(url, res) {
  const root = url.searchParams.get('root') || ''
  const rel = url.searchParams.get('rel') || ''
  const target = safeJoin(root, rel)
  if (!target) return sendJSON(res, 400, { error: '非法路径' })
  let st
  try { st = fs.statSync(target) } catch { return sendJSON(res, 404, { error: '文件不存在：' + rel, text: '' }) }
  if (!st.isFile()) return sendJSON(res, 400, { error: '不是文件：' + rel, text: '' })
  const ext = extOf(rel)
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
    const text = fs.readFileSync(target, 'utf8')
    return sendJSON(res, 200, { text, size: st.size, mt: fmtMt(st.mtime) })
  }
  // 其它文档类型（pdf/doc 等）无法在浏览器内直接预览，返回占位说明
  sendJSON(res, 200, { text: '', size: st.size, mt: fmtMt(st.mtime), binary: true })
}

function apiImg(url, res) {
  const root = url.searchParams.get('root') || ''
  const rel = url.searchParams.get('rel') || ''
  const target = safeJoin(root, rel)
  if (!target) return sendText(res, 400, '非法路径')
  let buf
  try { buf = fs.readFileSync(target) } catch { return sendText(res, 404, 'not found') }
  const mime = MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': buf.length })
  res.end(buf)
}

// ─────────── 静态文件 ───────────
function serveStatic(pathname, res) {
  let file = pathname === '/' ? '/index.html' : pathname
  const target = path.join(DIST, file)
  if (!target.startsWith(DIST)) return sendText(res, 403, 'forbidden')
  let buf
  try { buf = fs.readFileSync(target) } catch {
    // SPA fallback：未匹配到的路径回退到 index.html
    try { buf = fs.readFileSync(path.join(DIST, 'index.html')) }
    catch { return sendText(res, 404, 'dist 不存在，请先 npm run build') }
  }
  const mime = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': buf.length })
  res.end(buf)
}

const server = http.createServer((req, res) => {
  let url
  try { url = new URL(req.url, 'http://localhost') } catch { return sendText(res, 400, 'bad request') }
  const pathname = decodeURIComponent(url.pathname)
  if (pathname === '/api/ws') return apiWs(url, res)
  if (pathname === '/api/doc') return apiDoc(url, res)
  if (pathname === '/api/img') return apiImg(url, res)
  serveStatic(pathname, res)
})

server.listen(PORT, () => {
  console.log(`[dir-server] http://localhost:${PORT}/`)
  console.log(`[dir-server] API: /api/ws?root=<路径>  /api/doc?root=&rel=  /api/img?root=&rel=`)
  console.log(`[dir-server] 托管静态文件: ${DIST}`)
})
