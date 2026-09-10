<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { prefs } from '../store/useStore'
import { unlocked } from '../access/useAccessGate'

const emit = defineEmits(['scroll'])

const SPEED_MS = { slow: 150, mid: 96, fast: 58 }

const line = ref('')
const source = ref('')
let running = false
let token = 0

function poemLines() {
  return (Array.isArray(prefs.poem) ? prefs.poem : []).map(s => String(s).trim()).filter(Boolean)
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function poemLoop() {
  const t = ++token
  while (running && t === token) {
    const ls = poemLines()
    if (!ls.length) { line.value = ''; await sleep(1200); continue }
    const delay = SPEED_MS[prefs.speed] || 96
    for (let i = 0; i < ls.length && running; i++) {
      const text = ls[i]
      line.value = ''
      for (let c = 0; c < text.length; c++) {
        if (!running || t !== token) return
        line.value = text.slice(0, c + 1)
        await sleep(delay)
      }
      await sleep(780)
      for (let c = text.length - 1; c >= 0; c--) {
        if (!running || t !== token) return
        line.value = text.slice(0, c)
        await sleep(Math.max(14, Math.round(delay / 4)))
      }
      await sleep(420)
    }
    source.value = ''
    await sleep(1600)
  }
}

onMounted(() => { running = true; poemLoop() })
onBeforeUnmount(() => { running = false; ++token })

const heroBg = computed(() => {
  if (prefs.bg === 'custom' && prefs.bgData) {
    return { backgroundImage: `url(${prefs.bgData})`, filter: '' }
  }
  const url = (import.meta.env.BASE_URL || '/') + 'assets/bg-poem-ridge.jpg'
  return prefs.bg === 'night'
    ? { backgroundImage: `url(${url})`, filter: 'saturate(0.55) brightness(0.62)' }
    : { backgroundImage: `url(${url})`, filter: '' }
})
</script>

<template>
  <div id="hero" :style="{ ...heroBg, '--veil': prefs.veil }">
    <div class="hero-top">
      <span class="brand"><span class="brand-mark">open markdown blog</span></span>
      <RouterLink v-if="unlocked" class="hero-act" to="/settings" aria-label="外观与设置">
        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/></svg>
        外观与设置
      </RouterLink>
    </div>

    <div class="poem-wrap">
      <p class="poem-kicker">今日一诗 · 逐字落墨</p>
      <div id="poem-stage" :style="{ fontSize: prefs.poemSize + 'px' }" aria-label="打字诗句"><span id="poem-line">{{ line }}</span></div>
      <p id="poem-source">{{ source }}</p>
    </div>

    <button class="scroll-cue" @click="emit('scroll')" aria-label="向下进入博文列表">
      <span>下拉 · 进入博文</span>
      <span class="ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v15m0 0l-6-6m6 6l6-6"/></svg></span>
    </button>
  </div>
</template>
