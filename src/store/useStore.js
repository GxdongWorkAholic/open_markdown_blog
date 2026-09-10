// 全局状态 —— 设置持久化到服务端（data/config.json）；工作区路径由目录服务实时扫描
import { reactive, ref } from 'vue'

export const DOC_EXTS = ['md', 'markdown', 'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf']
export const TYPE_LABEL = {
  md: 'Markdown', pdf: 'PDF', txt: '纯文本', doc: 'Word', docx: 'Word',
  xls: 'Excel', xlsx: 'Excel', ppt: 'PPT', pptx: 'PPT', rtf: 'RTF'
}
const coll = new Intl.Collator('zh')

// 前端兜底（真正默认值由服务端 DEFAULT_CONFIG 提供，加载后覆盖）
const FALLBACK_PREFS = {
  bg: 'default', bgUrl: '', veil: 0.5, poem: [], speed: 'mid',
  poemSize: 46, tocDefaultHidden: false, readerSize: 17
}

export const prefs = reactive({ ...FALLBACK_PREFS })
export const workspaces = ref([])      // 默认工作区为空，由用户在设置页新增
export const activeWs = ref(null)
export const activePath = ref(null)
export const lastOpened = ref(null)
export const q = ref('')
export const view = ref('home')     // 'home' | 'reader'
export const activeRel = ref(null)  // 当前打开的文档 rel 路径

// 实时数据（来自目录服务）
export const tree = ref([])
export const loading = ref(false)
export const error = ref('')
export const docText = ref('')
export const docLoading = ref(false)
export const docError = ref('')

// ─────────── API 地址 ───────────
export function apiWs(root) { return '/api/ws?root=' + encodeURIComponent(root) }
export function apiDoc(root, rel) { return '/api/doc?root=' + encodeURIComponent(root) + '&rel=' + encodeURIComponent(rel) }
export function apiImg(root, rel) { return '/api/img?root=' + encodeURIComponent(root) + '&rel=' + encodeURIComponent(rel) }

// ─────────── API：设置持久化 ───────────
export async function fetchConfig() {
  const res = await fetch('/api/config')
  if (!res.ok) throw new Error('读取设置失败')
  return res.json()
}
export function saveConfig(cfg) {
  return fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  })
}
export async function resetConfig() {
  const res = await fetch('/api/config/reset', { method: 'POST' })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || '恢复默认失败')
  return data.config
}
// 上传图片到服务端默认图片目录（data/uploads/），返回 { name, url }
export async function uploadImage(file) {
  const res = await fetch('/api/upload?name=' + encodeURIComponent(file.name || 'upload.png'), {
    method: 'POST',
    body: file,
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || '上传失败')
  return { name: data.name, url: data.url }
}
// 已上传图片列表（最新在前）
export async function fetchUploads() {
  try {
    const res = await fetch('/api/uploads')
    const data = await res.json()
    return Array.isArray(data.files) ? data.files : []
  } catch {
    return []
  }
}
// 删除已上传的图片（连同服务端文件一起删除）
export async function deleteUpload(name) {
  const res = await fetch('/api/uploads/' + encodeURIComponent(name), { method: 'DELETE' })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || '删除失败')
  return true
}

// ─────────── 工具函数 ───────────
export function hsize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}
export function fmtDate(s) {
  if (!s) return ''
  return String(s).replace('T', ' ').slice(0, 16)
}
export function extOf(name) {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}
export function relDir(rel) {
  const i = rel.lastIndexOf('/')
  return i === -1 ? '' : rel.slice(0, i)
}
export function flatSort(arr) {
  return arr.slice().sort((a, b) => {
    const ad = !!a.d, bd = !!b.d
    if (ad !== bd) return ad ? -1 : 1
    return coll.compare(a.n, b.n)
  })
}
export function nodeCount(node) {
  if (!node.d) return 1
  let n = 0
  node.d.forEach(c => { n += nodeCount(c) })
  return n
}
export function wsById(id) {
  return workspaces.value.find(w => w.id === id) || null
}
export function findNode(list, path) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].p === path) return list[i]
    if (list[i].d) { const r = findNode(list[i].d, path); if (r) return r }
  }
  return null
}
export function folderOpenSet(sel) {
  const set = {}
  const t = tree.value
  if (!sel) {
    t.forEach(n => { if (n.d) set[n.p] = 1 })
    return set
  }
  const parts = sel.split('/')
  let cur = ''
  for (let i = 0; i < parts.length; i++) {
    cur = cur ? cur + '/' + parts[i] : parts[i]
    set[cur] = 1
  }
  t.forEach(n => {
    if (n.d && n.d.length && !n.d.some(c => !c.d)) set[n.p] = 1
  })
  return set
}
export function visibleFiles(path, query) {
  const list = []
  const top = tree.value
  let nodes
  if (!path) nodes = top
  else {
    const found = findNode(top, path)
    nodes = found && found.d ? found.d : []
  }
  const ql = query.toLowerCase()
  nodes.forEach(n => {
    if (n.d) { if (!ql || n.n.toLowerCase().indexOf(ql) >= 0) list.push({ kind: 'dir', n }) }
    else if (!ql || n.n.toLowerCase().indexOf(ql) >= 0) list.push({ kind: 'file', n })
  })
  return list.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return coll.compare(a.n.n, b.n.n)
  })
}
export function crumbsFor(path) {
  if (!path) return []
  return path.split('/')
}

// ─────────── 持久化到服务端 ───────────
export function persist() {
  saveConfig({
    prefs: { ...prefs },
    workspaces: workspaces.value,
    activeWs: activeWs.value,
    activePath: activePath.value,
  }).catch(() => { /* 服务不可用等场景忽略 */ })
}

// ─────────── 动作 ───────────
export async function loadTree() {
  const ws = wsById(activeWs.value)
  tree.value = []
  if (!ws) return
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiWs(ws.root))
    const data = await res.json()
    tree.value = data.tree || []
    if (data.error) error.value = data.error
  } catch (e) {
    error.value = '无法读取路径 ' + (ws.root || '') + '：' + (e.message || e)
  } finally {
    loading.value = false
  }
}

export function setActiveWs(id) {
  if (id === activeWs.value) return
  activeWs.value = id
  activePath.value = null
  q.value = ''
  persist()
  loadTree()
}

export function openFolder(p) {
  activePath.value = p
  q.value = ''
  persist()
}

export async function openDoc(rel) {
  const ws = wsById(activeWs.value)
  activePath.value = relDir(rel)
  lastOpened.value = { ws: activeWs.value, rel }
  activeRel.value = rel
  persist()
  view.value = 'reader'
  window.scrollTo(0, 0)

  docLoading.value = true
  docError.value = ''
  docText.value = ''
  if (ws) {
    try {
      const res = await fetch(apiDoc(ws.root, rel))
      const data = await res.json()
      docText.value = data.text || ''
      if (data.error) docError.value = data.error
    } catch (e) {
      docError.value = '读取失败：' + (e.message || e)
    }
  }
  docLoading.value = false
}

export function goHome() {
  view.value = 'home'
  window.scrollTo(0, 0)
}

export function readerScrollTo(id) {
  const el = document.getElementById(id)
  if (!el) return
  const y = el.getBoundingClientRect().top + window.pageYOffset - 84
  window.scrollTo(0, Math.max(0, y))
}

// ─────────── 初始化 / 恢复默认 ───────────
function applyConfig(cfg) {
  for (const k in FALLBACK_PREFS) {
    prefs[k] = (cfg.prefs && cfg.prefs[k] != null) ? cfg.prefs[k] : FALLBACK_PREFS[k]
  }
  // 归一化历史值（旧 'ridge'/'night' → 'default'）
  if (prefs.bg !== 'custom' && prefs.bg !== 'default') prefs.bg = 'default'
  workspaces.value = reactive(
    Array.isArray(cfg.workspaces) ? JSON.parse(JSON.stringify(cfg.workspaces)) : []
  )
  const want = cfg.activeWs
  const keep = workspaces.value.some(w => w.id === want)
    ? want
    : (workspaces.value.length ? workspaces.value[0].id : null)
  activeWs.value = keep
  activePath.value = (keep && keep === want) ? (cfg.activePath || null) : null
  lastOpened.value = null
  view.value = 'home'
  activeRel.value = null
}

export async function initStore() {
  let cfg = null
  try { cfg = await fetchConfig() } catch { /* 服务不可用则用兜底 */ }
  applyConfig(cfg || { prefs: {}, workspaces: [] })
  loadTree()
}

export async function resetAll() {
  const cfg = await resetConfig().catch(() => null)
  if (cfg) applyConfig(cfg)
  loadTree()
}
