// 全局状态 —— 设置持久化到服务端（H2 数据库）；工作区路径由目录服务实时扫描
import { reactive, ref } from 'vue'
import { fetchJSON, MSG_DOWN, API_BASE } from './http'
import { toast } from '../composables/useToast'

export const DOC_EXTS = ['md', 'markdown', 'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf']
export const TYPE_LABEL = {
  md: 'Markdown', pdf: 'PDF', txt: '纯文本', doc: 'Word', docx: 'Word',
  xls: 'Excel', xlsx: 'Excel', ppt: 'PPT', pptx: 'PPT', rtf: 'RTF'
}
const coll = new Intl.Collator('zh')

// 页脚备案信息的默认跳转地址（展示名留空则不展示，见 SiteFooter.vue）
export const DEFAULT_ICP_URL = 'https://beian.miit.gov.cn'

// 前端兜底（真正默认值由服务端 DEFAULT_CONFIG 提供，加载后覆盖）
const FALLBACK_PREFS = {
  bg: 'default', bgUrl: '', veil: 0.5, poem: [], speed: 'mid',
  poemSize: 46, tocDefaultHidden: false, readerSize: 17,
  icpOn: false, icpText: '', icpUrl: DEFAULT_ICP_URL
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
// 设置未能从服务端加载（服务未启动等），当前用的是兜底默认值 —— 用于提示别重复新增工作区
export const configError = ref('')

// ─────────── API 地址 ───────────
// 位置参数是**工作区 id**，不是绝对路径 —— 绝对路径由后端从库里查，
// 客户端无法指定任意目录（旧实现 ?root=<绝对路径> 能读服务器上任何文件）。
export function apiWs(wsId) { return '/api/ws?ws=' + encodeURIComponent(wsId) }
export function apiDoc(wsId, rel) {
  return '/api/doc?ws=' + encodeURIComponent(wsId) + '&rel=' + encodeURIComponent(rel)
}
// 上传图片的访问地址（可直接用在 <img src> 与 CSS url() 里）。
// prefs.bgUrl 存的是**裸文件名**，这样无论同源还是跨源部署都能正确拼出 URL
// （历史值 /api/uploads/x.jpg 由 applyConfig 归一化）。
export function uploadUrl(name) {
  return API_BASE + '/api/uploads/' + encodeURIComponent(name)
}

// ─────────── API：设置持久化 ───────────
export async function fetchConfig() {
  return fetchJSON('/api/config')
}
export function saveConfig(cfg) {
  return fetchJSON('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  })
}
export async function resetConfig() {
  const data = await fetchJSON('/api/config/reset', { method: 'POST' })
  if (!data.ok) throw new Error(data.error || '恢复默认失败')
  return data.config
}
// 上传图片到服务端的图片目录（app.img-dir，默认 <仓库>/file/img），返回 { name, url }
export async function uploadImage(file) {
  const data = await fetchJSON('/api/upload?name=' + encodeURIComponent(file.name || 'upload.png'), {
    method: 'POST',
    body: file,
  })
  if (!data.ok) throw new Error(data.error || '上传失败')
  return { name: data.name, url: data.url }
}
// 已上传图片列表（最新在前）
export async function fetchUploads() {
  try {
    const data = await fetchJSON('/api/uploads')
    return Array.isArray(data.files) ? data.files : []
  } catch {
    return []
  }
}
// 删除已上传的图片（连同服务端文件一起删除）
export async function deleteUpload(name) {
  const data = await fetchJSON('/api/uploads/' + encodeURIComponent(name), { method: 'DELETE' })
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
let lastSaveFailAt = 0   // 服务一直不可用时，避免每次拖动滑块都弹一次
export function persist() {
  return saveConfig({
    prefs: { ...prefs },
    workspaces: workspaces.value,
    activeWs: activeWs.value,
    activePath: activePath.value,
  }).catch(e => {
    const now = Date.now()
    if (now - lastSaveFailAt < 4000) return
    lastSaveFailAt = now
    if (e && e.kind === 'auth') {
      // 密钥失效：http.js 已经把失败回调（lock）调过了，这里只解释一句
      toast('设置未保存：访问密钥已失效，请用 ?key= 重新解锁')
      return
    }
    // 以前这里静默吞掉，而各调用点紧接着就 toast「已保存」——服务挂了也显示已保存，要出声
    toast('设置未保存到服务端：' + ((e && e.message) || MSG_DOWN))
  })
}

// ─────────── 动作 ───────────
export async function loadTree() {
  const ws = wsById(activeWs.value)
  tree.value = []
  if (!ws) return
  loading.value = true
  error.value = ''
  try {
    const data = await fetchJSON(apiWs(ws.id))
    tree.value = data.tree || []
    if (data.error) error.value = data.error
  } catch (e) {
    // 服务端自己的文案（「工作区不存在：x」/「路径不存在：/x」）直接用；
    // 其余（服务不可达 / 空响应 / 非 JSON / 密钥失效）补上「无法读取工作区 …：」前缀
    error.value = (e && e.serverText)
      ? e.serverText
      : '无法读取工作区 ' + (ws.name || '') + '：' + ((e && e.message) || e)
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
      const data = await fetchJSON(apiDoc(ws.id, rel))
      docText.value = data.text || ''
      if (data.error) docError.value = data.error
    } catch (e) {
      docError.value = (e && e.serverText)
        ? e.serverText
        : '读取失败：' + ((e && e.message) || e)
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
  // bgUrl 一律只留裸文件名：历史值是 '/api/uploads/x.jpg'，新值直接是 'x.jpg'。
  // 这样无论同源还是跨源部署都能正确拼 URL，也不需要迁移库里的历史配置。
  prefs.bgUrl = String(prefs.bgUrl || '').split('/').pop() || ''
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
  configError.value = ''
  // 服务不可用则用兜底默认值；但要说清楚，否则用户会以为工作区没配置过而重复新增
  try { cfg = await fetchConfig() } catch (e) { configError.value = '读取设置失败：' + ((e && e.message) || MSG_DOWN) }
  applyConfig(cfg || { prefs: {}, workspaces: [] })
  loadTree()
}

// 恢复默认设置；失败时返回 false（调用方据此别再报「已恢复默认」）
export async function resetAll() {
  let cfg = null
  try {
    cfg = await resetConfig()
  } catch (e) {
    toast('恢复默认失败：' + ((e && e.message) || MSG_DOWN))
    return false
  }
  applyConfig(cfg)
  loadTree()
  return true
}
