<script setup>
import { ref, computed } from 'vue'
import { prefs, workspaces, persist, resetAll, initStore } from '../store/useStore'
import { toast } from '../composables/useToast'
import { accessToken } from '../access/useAccessGate'

const BASE = import.meta.env.BASE_URL || '/'
const bgThumbUrl = BASE + 'assets/bg-poem-ridge.jpg'

const presets = [
  { v: 'ridge', n: '晨雾 · 山色', style: '' },
  { v: 'night', n: '墨夜 · 山色', style: 'saturate(.5) brightness(.5)' },
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
function selectBg(p) { prefs.bg = p.v; prefs.bgData = ''; persist(); toast('背景已保存') }
function onUpload(e) {
  const f = e.target.files && e.target.files[0]
  if (!f) return
  const rd = new FileReader()
  rd.onload = () => { prefs.bgData = rd.result; prefs.bg = 'custom'; persist(); toast('背景已更新（保存于本机）') }
  rd.readAsDataURL(f)
}
function clearBg() { prefs.bg = 'ridge'; prefs.bgData = ''; persist(); toast('已回到预设背景') }
function saveVeil() { persist(); toast('遮罩强度已保存') }

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

// ── 工作区 ──
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
  workspaces.value.push({ id, name, root: path, os, desc: '由设置新增 · 待接入本地目录服务', virtual: true })
  newWsName.value = ''
  newWsPath.value = ''
  persist(); toast('已新增工作区')
}

function doResetAll() {
  if (!confirm('恢复默认？将清空自定义工作区与外观设置。')) return
  resetAll()      // 清空 localStorage
  initStore()     // 用仍在内存中的解密默认值就地重建
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
            <button v-for="p in presets" :key="p.v" type="button" class="preset" :class="{ on: prefs.bg === p.v }" @click="selectBg(p)">
              <span class="thumb" :style="{ backgroundImage: `url(${bgThumbUrl})`, filter: p.style || 'none' }"></span>
              <span class="lbl">{{ p.n }}</span>
            </button>
          </div>
          <div class="row2">
            <label class="btn btn-secondary" style="cursor:pointer;justify-content:center;background:transparent;">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 16V4m0 0L7 9m5-5l5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
              上传自定义图片
              <input type="file" accept="image/*" hidden @change="onUpload" />
            </label>
            <button class="btn btn-ghost" style="border:1px dashed var(--border);" @click="clearBg">清除自定义，回到预设</button>
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
          <div v-if="!workspaces.length" class="empty">还没有工作区，请在下方新增。</div>
          <div v-for="(ws, idx) in workspaces" :key="ws.id" class="ws-row">
            <svg class="ws-grip icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 8h16M4 16h16"/></svg>
            <div class="ws-main">
              <div class="ws-name">
                {{ ws.name }}
                <span class="os-badge" :class="ws.os === 'linux' ? 'linux' : 'win'"><span class="dot"></span>{{ ws.os === 'linux' ? 'LINUX' : 'WIN' }}</span>
                <span v-if="!ws.virtual" class="tag">示例</span>
              </div>
              <div class="ws-path">{{ ws.root }}</div>
              <div class="ws-desc">{{ ws.desc || (ws.virtual ? '登记路径的工作区，待接入本地目录服务。' : '内置目录快照，博客中可完整阅读。') }}</div>
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
          <div class="inline-tip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
            <span>每个工作区对应本机一个目录：标注其系统环境（Windows / Linux）并填入真实路径。浏览器无法直接枚举磁盘目录，因此博客页面内置了两个工作区的目录与正文快照（标注「示例」）；删除某个工作区后，博客右上角的分区中就不再显示它。接入带目录服务的本地服务器后，即可实时读取任意路径。</span>
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
            所有改动自动保存在本机浏览器，返回博客后立即生效。
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
