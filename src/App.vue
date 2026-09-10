<script setup>
import { initStore } from './store/useStore'
import ToastHost from './components/ToastHost.vue'

// 博客对所有人（含游客）可浏览；key 仅门禁「外观与设置」按钮与设置页。
// 状态在任何情况下都需要初始化（游客也要看博客）。
initStore()
</script>

<template>
  <RouterView />
  <ToastHost />
</template>
