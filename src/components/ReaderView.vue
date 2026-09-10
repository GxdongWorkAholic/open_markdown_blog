<script setup>
import { ref, computed } from 'vue'
import {
  activeRel, activeWs, prefs, goHome, readerScrollTo,
  vwsById, wsById, relDir, hsize,
} from '../store/useStore'
import { mdToHtml, esc, assetUrl } from '../markdown/mdToHtml'
import { unlocked } from '../access/useAccessGate'

const tocHidden = ref(!!prefs.tocDefaultHidden)

const vws = computed(() => vwsById(activeWs.value))
const wsMeta = computed(() => wsById(activeWs.value))
const doc = computed(() => (vws.value && vws.value.files && vws.value.files[activeRel.value]) || null)
const name = computed(() => (activeRel.value || '').split('/').pop())
const docDir = computed(() => relDir(activeRel.value || ''))

const rendered = computed(() => {
  if (!doc.value) return { html: '', headings: [] }
  return mdToHtml(doc.value.text || '', docDir.value, vws.value)
})

const bodyHtml = computed(() => {
  if (!doc.value) {
    return '<div class="trunc-note">该文档未被收录进当前快照。原型内置的是已生成时的目录快照，新增/修改的磁盘文件需接入本地目录服务后才会出现。' +
      '<span class="mono">' + esc(activeRel.value || '') + '</span></div>'
  }
  let h = rendered.value.html
  if (doc.value.gallery && doc.value.gallery.length) {
    let gal = '<div style="margin-top:34px;border-top:1px solid var(--border);padding-top:20px;"><p class="gallery-note">文中图片摘录 · DEMO</p>'
    doc.value.gallery.forEach(g => {
      gal += '<figure style="margin:14px 0;"><img class="md-img" src="' + assetUrl(g.u) + '" alt="' + esc(g.alt || '') + '" loading="lazy"><figcaption>' + esc(g.alt || '') + '</figcaption></figure>'
    })
    h += gal + '</div>'
  }
  if (doc.value.truncated) {
    h += '<div class="trunc-note">全文较长，上方为该文档正文节选（保留前 ' + doc.value.kept + ' 字）。接入本地目录服务后即可阅读完整内容。' +
      '<span class="mono">完整约 ' + (doc.value.fullChars || doc.value.chars || '--') + ' 字</span></div>'
  }
  return h
})

const tocItems = computed(() => rendered.value.headings.map(hd => ({
  lvl: Math.max(1, Math.min(3, hd.lvl)),
  text: hd.text,
  id: hd.id,
})))

const docMeta = computed(() => {
  const ws = wsMeta.value
  return (ws ? ws.root : '') + ' · ' + hsize(doc.value ? doc.value.size : 0) + (doc.value ? ' · 约 ' + (doc.value.chars || '--') + ' 字' : '')
})

function toggleToc() { tocHidden.value = !tocHidden.value }
</script>

<template>
  <section>
    <div class="reader-top">
      <div class="container reader-top-in">
        <button class="reader-back" @click="goHome">
          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 5l-7 7 7 7"/></svg>
          返回博客
        </button>
        <div style="min-width:0;text-align:center;">
          <div class="docname">{{ name }}</div>
          <div class="docmeta">{{ docMeta }}</div>
        </div>
        <div class="reader-acts">
          <button class="btn btn-ghost" @click="toggleToc">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>
            {{ tocHidden ? '显示目录' : '收起目录' }}
          </button>
          <RouterLink v-if="unlocked" class="btn btn-ghost" to="/settings" aria-label="打开设置">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/></svg>
          </RouterLink>
        </div>
      </div>
    </div>

    <div class="container">
      <div class="reader-layout" :class="{ 'toc-hidden': tocHidden }">
        <aside class="toc-pane">
          <div class="toc-head">
            <span class="t">本页目录</span>
            <button @click="tocHidden = true">收起</button>
          </div>
          <nav class="toc-list">
            <template v-if="tocItems.length">
              <a
                v-for="hd in tocItems"
                :key="hd.id"
                class="toc-anchor"
                :class="'l' + (hd.lvl > 1 ? 2 : 1)"
                :href="'#' + hd.id"
                @click.prevent="readerScrollTo(hd.id)"
              >{{ hd.text }}</a>
            </template>
            <span v-else class="toc-empty">本文无小节标题</span>
          </nav>
        </aside>

        <article class="article">
          <header class="doc-head">
            <h1>{{ name }}</h1>
            <p class="pathline">{{ activeRel }}</p>
          </header>
          <div class="md-body" :style="{ fontSize: prefs.readerSize + 'px' }" v-html="bodyHtml"></div>
          <div class="readfoot">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zm0 0a2 2 0 0 1 2-2h13"/></svg>
            本页为工作区快照内容，图片按 md 相对路径解析。
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
