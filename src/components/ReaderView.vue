<script setup>
import { ref, computed } from 'vue'
import {
  activeRel, activeWs, prefs, goHome, readerScrollTo,
  wsById, relDir, docText, docLoading, docError,
} from '../store/useStore'
import { mdToHtml } from '../markdown/mdToHtml'
import { unlocked } from '../access/useAccessGate'

const tocHidden = ref(!!prefs.tocDefaultHidden)

const wsMeta = computed(() => wsById(activeWs.value))
const name = computed(() => (activeRel.value || '').split('/').pop())
const docDir = computed(() => relDir(activeRel.value || ''))

const rendered = computed(() => {
  if (!docText.value) return { html: '', headings: [] }
  return mdToHtml(docText.value, docDir.value, wsMeta.value ? wsMeta.value.root : '')
})

const tocItems = computed(() => rendered.value.headings.map(hd => ({
  lvl: Math.max(1, Math.min(3, hd.lvl)),
  text: hd.text,
  id: hd.id,
})))

const docMeta = computed(() => (wsMeta.value ? wsMeta.value.root : ''))

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
          <div v-if="docLoading" class="empty" style="padding:60px 0;">正在加载文档…</div>
          <div v-else-if="docError" class="trunc-note">{{ docError }}</div>
          <div v-else class="md-body" :style="{ fontSize: prefs.readerSize + 'px' }" v-html="rendered.html"></div>
          <div class="readfoot">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zm0 0a2 2 0 0 1 2-2h13"/></svg>
            本页内容由本地目录服务按工作区路径实时读取。
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
