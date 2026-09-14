<script setup>
import { onMounted } from 'vue'
import { initStore } from './store/useStore'
import { toast } from './composables/useToast'
import { gateNotice } from './access/useAccessGate'
import ToastHost from './components/ToastHost.vue'

// 博客对所有人（含游客）可浏览；key 仅门禁「外观与设置」按钮与设置页。
// 状态在任何情况下都需要初始化（游客也要看博客）。
initStore()

// 门禁在挂载前就已跑完（见 main.js），那时 Toast 还没渲染，所以等挂载后再提示
onMounted(() => { if (gateNotice.value) toast(gateNotice.value) })
</script>

<template>
  <RouterView />
  <ToastHost />
</template>
