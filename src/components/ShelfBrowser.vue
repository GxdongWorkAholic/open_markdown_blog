<script setup>
import { computed } from 'vue'
import TreeNode from './TreeNode.vue'
import {
  workspaces, activeWs, activePath, q, tree, loading, error,
  setActiveWs, openFolder, openDoc,
  wsById, folderOpenSet, visibleFiles, crumbsFor,
  nodeCount, TYPE_LABEL, hsize, fmtDate, extOf,
} from '../store/useStore'

const wsMeta = computed(() => wsById(activeWs.value))
const treeNodes = computed(() => tree.value)
const openSet = computed(() => folderOpenSet(activePath.value))
const items = computed(() => visibleFiles(activePath.value, q.value))

const crumbs = computed(() => {
  const ws = wsMeta.value
  const list = [{ label: ws ? ws.name : 'root', path: '' }]
  let cur = ''
  crumbsFor(activePath.value).forEach(p => {
    cur = cur ? cur + '/' + p : p
    list.push({ label: p, path: cur })
  })
  return list
})

const listCount = computed(() => items.value.length + ' 项' + (q.value ? '（含搜索）' : ''))
const emptyMsg = computed(() => {
  if (loading.value) return '正在扫描目录…'
  if (error.value) return error.value
  if (items.value.length) return ''
  if (q.value) return `没有匹配“${q.value}”的文档。`
  return '该目录下没有文档。'
})

function fileMeta(n) {
  let sub = ''
  if (n.size) sub += hsize(n.size)
  if (n.mt) sub += (sub ? ' · ' : '') + fmtDate(n.mt)
  return sub
}
function typeLabel(n) {
  const ext = extOf(n.n)
  return TYPE_LABEL[ext] || ext || '文件'
}
function isMdFile(n) {
  const ext = extOf(n.n)
  return ext === 'md' || ext === 'markdown'
}
function dirCount(n) {
  return n.files != null ? n.files : nodeCount(n)
}
</script>

<template>
  <section class="shelf">
    <div class="container">
      <div class="shelf-head">
        <div>
          <p class="eyebrow">BLOG · 博客</p>
          <h2 class="shelf-title">博客文章</h2>
          <p class="shelf-sub">一个工作区一个分区。右上角切换分区，在目录中浏览并点开阅读。</p>
        </div>
        <div class="seg" role="tablist" aria-label="工作区分区">
          <button
            v-for="ws in workspaces"
            :key="ws.id"
            type="button"
            role="tab"
            :aria-selected="ws.id === activeWs"
            :class="{ on: ws.id === activeWs }"
            @click="setActiveWs(ws.id)"
          >
            <span class="dot" :style="{ background: ws.os === 'linux' ? 'oklch(65% 0.16 110)' : 'oklch(62% 0.14 225)' }"></span>
            <span>{{ ws.name }}</span>
          </button>
        </div>
      </div>

      <div v-if="workspaces.length" class="browser">
        <aside class="tree-pane">
          <div class="tree-pane-title">目录结构</div>
          <div class="tree-path">{{ wsMeta ? wsMeta.root : '' }}</div>
          <div v-if="loading" class="empty" style="padding:24px 10px;">正在扫描目录…</div>
          <div v-else-if="error" class="empty" style="padding:24px 10px;">{{ error }}</div>
          <div v-else-if="treeNodes.length">
            <TreeNode
              v-for="n in treeNodes"
              :key="n.p"
              :node="n"
              :open-set="openSet"
              :selected-path="activePath || ''"
              @open="openFolder"
              @select="openDoc"
            />
          </div>
          <div v-else class="empty" style="padding:24px 10px;">该目录下没有文档。</div>
        </aside>

        <div class="list-pane">
          <div class="crumbs">
            <template v-for="(c, i) in crumbs" :key="c.path">
              <span v-if="i > 0" class="sep">/</span>
              <button @click="openFolder(c.path)">{{ c.label }}</button>
            </template>
          </div>
          <div class="list-tools">
            <div class="searchbox">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              <input v-model="q" type="search" placeholder="搜索文件名…" aria-label="搜索文件名" />
            </div>
            <span class="list-count">{{ listCount }}</span>
          </div>

          <div class="frows">
            <div v-if="emptyMsg" class="empty" style="padding:70px 20px;">{{ emptyMsg }}</div>
            <template v-for="it in items" :key="(it.n.p || it.n.n)">
              <button v-if="it.kind === 'dir'" type="button" class="frow folder-row" @click="openFolder(it.n.p)">
                <span class="fico" style="background:var(--fg-soft);color:var(--muted);">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                </span>
                <span class="nmcol"><span class="fname">{{ it.n.n }}</span><span class="fmeta"><span>{{ it.n.desc || '' }}</span></span></span>
                <span class="tag">{{ dirCount(it.n) }} 文档</span>
                <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
              </button>
              <button v-else type="button" class="frow" @click="openDoc(it.n.p)">
                <span class="fico" :class="{ md: isMdFile(it.n) }">
                  <svg v-if="isMdFile(it.n)" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/></svg>
                  <svg v-else width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>
                </span>
                <span class="nmcol"><span class="fname">{{ it.n.n }}</span><span class="fmeta">{{ fileMeta(it.n) }}</span></span>
                <span class="tag">{{ typeLabel(it.n) }}</span>
                <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
              </button>
            </template>
          </div>
        </div>
      </div>
      <div v-else class="empty" style="margin-top:var(--gap-lg);border:1px dashed var(--border);border-radius:16px;padding:60px 24px;">
        还没有工作区。请点右上角「外观与设置」进入设置页，在「工作区管理」中新增一个本机目录（需访问密钥）。
      </div>

      <div class="snapshot-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
        <span>工作区指向本机目录，由本地目录服务实时扫描：目录树仅展示文档（md / pdf 等），md 正文里引用的图片按相对路径实时加载。到设置页修改工作区路径后，返回首页即可浏览对应目录。</span>
      </div>
    </div>
  </section>
</template>
