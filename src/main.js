import { createApp } from 'vue'
import { initAccessGate } from './access/useAccessGate'
import App from './App.vue'
import { router } from './router'
import './styles/main.css'

// 先校验 ?key=（方案 B 解密），再挂载应用（避免顶层 await，兼容更多构建目标）
initAccessGate().then(() => {
  createApp(App).use(router).mount('#app')
})
