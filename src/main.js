import { createApp } from 'vue'
import { initAccessGate } from './access/useAccessGate'
import { initTheme } from './composables/useTheme'
import App from './App.vue'
import { router } from './router'
import './styles/main.css'

// 先按北京时间定主题（不持久化），避免首屏闪烁
initTheme()

// 再校验 ?key=（方案 B 解密），最后挂载应用（避免顶层 await，兼容更多构建目标）
initAccessGate().then((mount) => {
  if (mount === false) return   // key 错误，正在重定向到干净地址，不挂载
  createApp(App).use(router).mount('#app')
})
