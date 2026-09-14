import { createApp } from 'vue'
import { initAccessGate, lock } from './access/useAccessGate'
import { setAuthFailureHandler } from './store/http'
import { initTheme } from './composables/useTheme'
import App from './App.vue'
import { router } from './router'
import './styles/main.css'

// 先按北京时间定主题（不持久化），避免首屏闪烁
initTheme()

// 写接口返回 401（密钥失效）时自动回落到游客态，避免界面上留着「已解锁」的假象
setAuthFailureHandler(lock)

// 再校验 ?key=（服务端校验），最后挂载应用（避免顶层 await，兼容更多构建目标）
initAccessGate().then((mount) => {
  if (mount === false) return   // key 错误，正在重定向到干净地址，不挂载
  createApp(App).use(router).mount('#app')
})
