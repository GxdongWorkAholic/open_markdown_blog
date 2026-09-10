<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Sortable from 'sortablejs'
import { prefs, workspaces, persist, resetAll, uploadImage, fetchUploads, deleteUpload } from '../store/useStore'
import { toast } from '../composables/useToast'
import { accessToken, changeKey } from '../access/useAccessGate'

const BASE = import.meta.env.BASE_URL || '/'
const bgThumbUrl = BASE + 'assets/default.jpg'

const presets = [
  { v: 'default', n: 'default' },
]
const speeds = [
  { v: 'slow', label: '慢', color: 'oklch(60% 0.06 200)' },
  { v: 'mid', label: '中', color: 'oklch(60% 0.06 150)' },
  { v: 'fast', label: '快', color: 'oklch(60% 0.09 90)' },
]

const poemText = ref((Array.isArray(prefs.poem) ? prefs.poem : []).join('\n'))

const newWsName = ref('')
const newWsOs = ref('win')
const newWsPath = ref('')

const previewUrl = computed(() => {
  const q = accessToken.value ? '?key=' + encodeURIComponent(accessToken.value) : ''
  return BASE + q
})

// ── 背景 ──
const uploads = ref([])      // 已上传图片列表
const selected = ref(null)   // 当前选中的背景（待「确定」应用）

const bgOptions = computed(() => {
  const opts = presets.map(p => ({
    key: 'preset:' + p.v, type: 'preset', v: p.v, n: p.n, thumb: bgThumbUrl,
  }))
  uploads.value.forEach(u => {
    opts.push({ key: 'upload:' + u.name, type: 'upload', n: u.name, url: u.url, thumb: u.url })
  })
  return opts
})

function isApplied(o) {
  if (o.type === 'preset') return prefs.bg === o.v
  return prefs.bg === 'custom' && prefs.bgUrl === o.url
}
function isSelected(o) {
  if (!selected.value) return isApplied(o)
  if (o.type !== selected.value.type) return false
  return o.type === 'preset' ? o.v === selected.value.v : o.url === selected.value.url
}
function choose(o) {
  selected.value = o.type === 'preset' ? { type: 'preset', v: o.v } : { type: 'upload', url: o.url }
}
function applyBg() {
  if (!selected.value) { toast('请先选择一张背景图'); return }
  if (selected.value.type === 'preset') { prefs.bg = selected.value.v; prefs.bgUrl = '' }
  else { prefs.bg = 'custom'; prefs.bgUrl = selected.value.url }
  persist()
  toast('背景已更换')
}
async function loadUploads() { uploads.value = await fetchUploads() }

async function onUpload(e) {
  const f = e.target.files && e.target.files[0]
  if (!f) return
  try {
    const up = await uploadImage(f)
    await loadUploads()
    selected.value = { type: 'upload', url: up.url } // 自动选中新上传的
    toast('已上传，点「确定更换背景」生效')
  } catch (err) {
    toast(err.message || '上传失败')
  }
  e.target.value = '' // 允许重复选择同一文件
}
function clearBg() {
  selected.value = { type: 'preset', v: 'default' }
  prefs.bg = 'default'; prefs.bgUrl = ''
  persist(); toast('已回到默认背景')
}
async function removeUpload(o) {
  if (!confirm('删除这张图片？服务端的文件也会一并删除。')) return
  try {
    await deleteUpload(o.name)
    if (prefs.bg === 'custom' && prefs.bgUrl === o.url) {
      prefs.bg = 'default'; prefs.bgUrl = ''; persist()
    }
    if (isSelected(o)) selected.value = { type: 'preset', v: 'default' }
    await loadUploads()
    toast('已删除')
  } catch (e) {
    toast(e.message || '删除失败')
  }
}
function saveVeil() { persist(); toast('遮罩强度已保存') }

// ── 访问密钥 ──
const newKey = ref('')
const keyError = ref('')
const KEY_RE = /^[A-Za-z0-9]{8,256}$/

function validateKey(k) {
  if (!k) return '请输入密钥'
  if (k.length < 8) return '密钥至少 8 位'
  if (k.length > 256) return '密钥最多 256 位'
  if (!/^[A-Za-z0-9]+$/.test(k)) return '只能包含大小写字母与数字'
  return ''
}

async function saveKey() {
  const k = newKey.value.trim()
  const err = validateKey(k)
  keyError.value = err
  if (err) { toast(err); return }
  try {
    await changeKey(k)     // 服务端用新密钥重新加密门禁密文
    newKey.value = ''
    keyError.value = ''
    toast('访问密钥已更新')
  } catch (e) {
    toast(e.message || '保存失败')
  }
}

onMounted(async () => {
  await loadUploads()
  selected.value = (prefs.bg === 'custom' && prefs.bgUrl)
    ? { type: 'upload', url: prefs.bgUrl }
    : { type: 'preset', v: 'default' }
  initSortable()
})
onBeforeUnmount(() => { if (sortable) { sortable.destroy(); sortable = null } })

// ── 诗句 ──
function savePoem() {
  prefs.poem = poemText.value.split('\n').map(s => s.trim()).filter(Boolean)
  persist(); toast('诗句已保存')
}
function savePoemSize() { persist(); toast('字号已保存') }
function setSpeed(v) { prefs.speed = v; persist(); toast('打字速度已保存') }

// ── 阅读器 ──
function toggleTocDefault() { prefs.tocDefaultHidden = !prefs.tocDefaultHidden; persist() }
function saveReaderSize() { persist(); toast('正文字号已保存') }

// ── 工作区拖拽排序（SortableJS：平滑重排动画 + 自定义拖影） ──
const wsList = ref(null)
let sortable = null

function initSortable() {
  if (!wsList.value || sortable) return
  sortable = Sortable.create(wsList.value, {
    handle: '.ws-grip',
    animation: 240,
    easing: 'cubic-bezier(.2, 0, .2, 1)',
    forceFallback: true,      // 自定义拖影，动效可控；触摸屏也可拖
    fallbackClass: 'ws-fallback',
    ghostClass: 'ws-ghost',
    chosenClass: 'ws-chosen',
    onEnd(evt) {
      const { oldIndex, newIndex } = evt
      if (oldIndex === newIndex) return
      const arr = workspaces.value
      const [item] = arr.splice(oldIndex, 1)
      arr.splice(newIndex, 0, item)
      persist()
      toast('已调整工作区顺序')
    },
  })
}

function onWsField(ws, field, e) {
  const el = e.target
  const val = el.value
  if (field === 'name' && !val.trim()) { toast('名称不能为空'); el.value = ws.name; return }
  if (field === 'root' && !val.trim()) { toast('请填写路径'); el.value = ws.root || ''; return }
  ws[field] = field === 'os' ? val : val.trim()
  persist(); toast('已保存')
}
function delWs(idx) {
  const ws = workspaces.value[idx]
  if (!confirm('删除工作区“' + ws.name + '”？其设置将从本机移除，博客分区中将不再显示它。')) return
  workspaces.value.splice(idx, 1)
  persist(); toast('已删除')
}
function addWs() {
  const name = newWsName.value.trim()
  const path = newWsPath.value.trim()
  if (!name || !path) { toast('请填写名称与路径'); return }
  const os = newWsOs.value
  const id = 'u-' + Date.now().toString(36)
  workspaces.value.push({ id, name, root: path, os, desc: '由设置新增' })
  newWsName.value = ''
  newWsPath.value = ''
  persist(); toast('已新增工作区')
}

async function doResetAll() {
  if (!confirm('恢复默认？将清空自定义工作区与外观设置。')) return
  await resetAll()   // 服务端重置为 DEFAULT_CONFIG 并回填
  poemText.value = (Array.isArray(prefs.poem) ? prefs.poem : []).join('\n')
  toast('已恢复默认')
}
</script>

<template>
  <div class="page-settings">
    <header class="reader-top">
      <div class="container reader-top-in">
        <RouterLink class="reader-back" to="/">
          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 5l-7 7 7 7"/></svg>
          返回博客
        </RouterLink>
        <div style="min-width:0;text-align:center;"><span class="docname">设置</span></div>
        <div class="reader-acts">
          <a :href="previewUrl" target="_blank" rel="noreferrer">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></svg>
            另开博客预览
          </a>
        </div>
      </div>
    </header>

    <div class="container settings">
      <div class="settings-head">
        <div>
          <p class="eyebrow">SETTINGS · 设置</p>
          <h1>外观 · 文字 · 工作区</h1>
        </div>
        <button class="btn btn-secondary" @click="doResetAll">恢复默认</button>
      </div>

      <div class="cards">
        <section class="panel">
          <div class="panel-title"><h2>首页背景图</h2><span>HERO BACKDROP</span></div>
          <div class="bg-presets">
            <div
              v-for="o in bgOptions"
              :key="o.key"
              class="preset"
              :class="{ sel: isSelected(o), on: isApplied(o) }"
              role="button"
              tabindex="0"
              :title="o.n"
              @click="choose(o)"
              @keydown.enter.prevent="choose(o)"
            >
              <span class="thumb"><img :src="o.thumb" :alt="o.n" loading="lazy" decoding="async" /></span>
              <span class="lbl"><span class="nm">{{ o.n }}</span></span>
              <button
                v-if="o.type === 'upload'"
                type="button"
                class="del"
                title="删除这张图片"
                @click.stop="removeUpload(o)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
            <label class="btn btn-secondary" style="cursor:pointer;background:transparent;">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 16V4m0 0L7 9m5-5l5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
              上传自定义图片
              <input type="file" accept="image/*" hidden @change="onUpload" />
            </label>
            <button class="btn btn-primary" @click="applyBg">确定更换背景</button>
            <button class="btn btn-ghost" style="border:1px dashed var(--border);" @click="clearBg">恢复预设背景</button>
          </div>
          <div class="save-hint">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 13l4 4L19 7"/></svg>
            点选背景图后按「确定更换背景」生效；带 ✓ 的是当前使用中的。上传的图片存于服务端 data/uploads/。
          </div>
          <div class="range-row field" style="margin-top:16px;">
            <label style="flex:none;">文字层遮罩强度</label>
            <input type="range" v-model.number="prefs.veil" min="0" max="1" step="0.05" @change="saveVeil" />
            <output>{{ Math.round(prefs.veil * 100) }}%</output>
          </div>
        </section>

        <section class="panel">
          <div class="panel-title"><h2>诗页文字</h2><span>POEM TYPE</span></div>
          <div class="field">
            <label for="poem-lines">诗句内容（每行一句，将逐字打出后抹去，循环播放）</label>
            <textarea id="poem-lines" class="textarea" v-model="poemText" spellcheck="false" @change="savePoem"></textarea>
          </div>
          <div class="row2">
            <div class="field">
              <label>字号</label>
              <div class="range-row">
                <input type="range" v-model.number="prefs.poemSize" min="26" max="72" step="1" @change="savePoemSize" />
                <output>{{ prefs.poemSize }}px</output>
              </div>
            </div>
            <div class="field">
              <label>打字速度</label>
              <div class="chip-group">
                <button v-for="s in speeds" :key="s.v" type="button" class="chip" :class="{ on: prefs.speed === s.v }" @click="setSpeed(s.v)">
                  <span class="sw" :style="{ background: s.color }"></span>{{ s.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-title"><h2>工作区管理</h2><span>WORKSPACES · WIN / LINUX</span></div>
          <div ref="wsList" class="ws-list">
            <div v-for="(ws, idx) in workspaces" :key="ws.id" class="ws-row">
              <span class="ws-grip" title="按住拖拽排序">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 8h16M4 16h16"/></svg>
              </span>
              <div class="ws-main">
                <div class="ws-name">
                  {{ ws.name }}
                  <span class="os-badge" :class="ws.os === 'linux' ? 'linux' : 'win'"><span class="dot"></span>{{ ws.os === 'linux' ? 'LINUX' : 'WIN' }}</span>
                </div>
                <div class="ws-path">{{ ws.root }}</div>
                <div class="ws-desc">{{ ws.desc || '' }}</div>
              </div>
              <div class="ws-edit">
                <input class="input" :value="ws.name" aria-label="名称" @change="onWsField(ws, 'name', $event)" />
                <select class="input" :value="ws.os" aria-label="系统" @change="onWsField(ws, 'os', $event)">
                  <option value="win">Windows</option>
                  <option value="linux">Linux</option>
                </select>
                <input class="input path" :value="ws.root" placeholder="绝对路径" aria-label="路径" @change="onWsField(ws, 'root', $event)" />
              </div>
              <button class="btn btn-ghost ws-del" aria-label="删除" @click="delWs(idx)">
                <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>删除
              </button>
            </div>
          </div>
          <div v-if="!workspaces.length" class="empty">还没有工作区，请在下方新增。</div>
          <div class="inline-tip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
            <span>每个工作区对应本机一个目录：标注其系统环境（Windows / Linux）并填入真实路径。由本地目录服务（node server/index.mjs）实时扫描该路径，读取目录树、md 正文与引用图片。删除某个工作区后，博客右上角的分区中就不再显示它。</span>
          </div>
          <div class="add-row">
            <input class="input" v-model="newWsName" placeholder="工作区名称，如 mynotes" aria-label="工作区名称" />
            <select class="input" v-model="newWsOs" aria-label="系统环境">
              <option value="win">Windows</option>
              <option value="linux">Linux</option>
            </select>
            <input class="input" v-model="newWsPath" placeholder="绝对路径，如 E:\notes  或 /home/me/notes" aria-label="绝对路径" style="font-family:var(--font-mono);font-size:13px;" />
            <button class="btn btn-primary" @click="addWs">新增工作区</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-title"><h2>阅读器</h2><span>READER</span></div>
          <div class="chip-group">
            <button type="button" class="chip" :class="{ on: prefs.tocDefaultHidden }" @click="toggleTocDefault">打开文档时默认收起「本页目录」</button>
          </div>
          <div class="field" style="margin-top:18px;">
            <label for="reader-size">正文字号</label>
            <div class="range-row">
              <input id="reader-size" type="range" v-model.number="prefs.readerSize" min="14" max="22" step="1" @change="saveReaderSize" />
              <output>{{ prefs.readerSize }}px</output>
            </div>
          </div>
          <div class="save-hint">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 13l4 4L19 7"/></svg>
            所有改动自动保存到本地服务端（data/config.json），返回博客后立即生效。
          </div>
        </section>

        <section class="panel">
          <div class="panel-title"><h2>访问密钥</h2><span>ACCESS KEY</span></div>
          <div class="field">
            <label for="access-key">修改访问密钥（8–256 位，仅大小写字母与数字）</label>
            <input
              id="access-key"
              class="input mono"
              v-model="newKey"
              :maxlength="256"
              autocomplete="off"
              spellcheck="false"
              placeholder="输入新的访问密钥"
            />
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
            <button class="btn btn-primary" @click="saveKey">保存密钥</button>
            <span v-if="keyError" class="mono" style="color:var(--accent);font-size:12.5px;">{{ keyError }}</span>
          </div>
          <div class="save-hint">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 13l4 4L19 7"/></svg>
            修改后请用新密钥访问：<span class="mono">?key=&lt;新密钥&gt;</span>。密钥不以明文保存 —— 服务端只存加密后的门禁密文。
          </div>
        </section>
      </div>
    </div>

    <footer class="pagefoot">
      <div class="container inner">
        <span>open markdown blog — 设置页</span>
        <span class="mono" style="font-size:12px;">workspace-blog + settings · 同一份本地设置</span>
      </div>
    </footer>
  </div>
</template>
