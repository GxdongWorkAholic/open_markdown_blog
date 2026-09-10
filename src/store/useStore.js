// 全局状态 —— 实时读取：工作区路径指向本地目录，由 server/index.mjs 扫描并提供正文/图片
import { reactive, ref } from 'vue'

const LS = 'shijian.blog.v1'

export const DOC_EXTS = ['md', 'markdown', 'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf']
export const TYPE_LABEL = {
  md: 'Markdown', pdf: 'PDF', txt: '纯文本', doc: 'Word', docx: 'Word',
  xls: 'Excel', xlsx: 'Excel', ppt: 'PPT', pptx: 'PPT', rtf: 'RTF'
}
const coll = new Intl.Collator('zh')

// 公共默认外观（游客与解锁用户均可见；key 仅门禁「外观与设置」按钮与设置页）
const DEFAULTS = {
  bg: 'ridge', bgData: '', veil: 0.5,
  poem: ['问渠那得清如许', '为有源头活水来', '千淘万漉虽辛苦', '吹尽狂沙始到金', '不积跬步，无以至千里', '不积小流，无以成江海'],
  speed: 'mid', poemSize: 46, tocDefaultHidden: false, readerSize: 17
}
// 默认工作区（路径可在设置页改成真实路径，由目录服务实时读取）
const DEFAULT_WS = [
  { id: 'mymajor', name: 'mymajor', os: 'win', root: 'E:\\mymicrosoft\\download\\temp\\mymajor', desc: 'Java 后端学习库 · java-doc' },
  { id: 'mymdrecord', name: 'mymdrecord', os: 'win', root: 'E:\\mymicrosoft\\download\\temp\\mymdrecord', desc: '随手记录 · 分类笔记库' },
]

export const prefs = reactive({ ...DEFAULTS })
export const workspaces = ref([])
export const activeWs = ref(null)
export const activePath = ref(null)
export const lastOpened = ref(null)
export const q = ref('')
export const view = ref('home')     // 'home' | 'reader'
export const activeRel = ref(null)  // 当前打开的文档 rel 路径

// 实时数据（来自目录服务）
export const tree = ref([])          // 当前工作区目录树
export const loading = ref(false)    // 扫描中
export const error = ref('')         // 扫描错误信息
export const docText = ref('')       // 当前文档正文
export const docLoading = ref(false)
export const docError = ref('')

// ─────────── 目录服务 API 地址 ───────────
export function apiWs(root) { return '/api/ws?root=' + encodeURIComponent(root) }
export function apiDoc(root, rel) { return '/api/doc?root=' + encodeURIComponent(root) + '&rel=' + encodeURIComponent(rel) }
export function apiImg(root, rel) { return '/api/img?root=' + encodeURIComponent(root) + '&rel=' + encodeURIComponent(rel) }

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

// ─────────── 持久化 ───────────
function loadRaw() {
  try { return JSON.parse(localStorage.getItem(LS) || 'null') } catch { return null }
}
export function persist() {
  try {
    localStorage.setItem(LS, JSON.stringify({
      prefs: { ...prefs }, workspaces: workspaces.value,
      activeWs: activeWs.value, activePath: activePath.value, lastOpened: lastOpened.value
    }))
  } catch { /* 隐私模式等场景忽略 */ }
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

export function resetAll() {
  try { localStorage.removeItem(LS) } catch { /* ignore */ }
}

// ─────────── 初始化 ───────────
export function initStore() {
  const state = loadRaw()

  const defaults = { ...DEFAULTS }
  const savedPrefs = (state && state.prefs && typeof state.prefs === 'object') ? state.prefs : {}
  for (const k in defaults) {
    if (savedPrefs[k] != null) prefs[k] = savedPrefs[k]
    else if (state && state[k] != null) prefs[k] = state[k]
    else prefs[k] = defaults[k]
  }

  const savedWs = (state && state.workspaces) || null
  workspaces.value = reactive(
    (savedWs && savedWs.length)
      ? JSON.parse(JSON.stringify(savedWs))
      : JSON.parse(JSON.stringify(DEFAULT_WS))
  )

  let keep = null
  const want = state && state.activeWs
  for (const w of workspaces.value) if (w.id === want) { keep = w.id; break }
  activeWs.value = keep || (workspaces.value.length ? workspaces.value[0].id : null)

  activePath.value = (state && state.activePath) || null
  lastOpened.value = (state && state.lastOpened) || null
  view.value = 'home'
  activeRel.value = null

  loadTree()
}
