// 主题（深色 / 白天）—— 不持久化：每次加载按北京时间决定，仅内存保存，刷新即重算
import { ref } from 'vue'

export const theme = ref('light') // 'light' | 'dark'

// 北京时间（UTC+8）的小时数
function beijingHour() {
  try {
    const s = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false,
    }).format(new Date())
    return Number(s) % 24
  } catch {
    return new Date().getHours()
  }
}

function apply() {
  const el = document.documentElement
  el.setAttribute('data-theme', theme.value)
  el.style.colorScheme = theme.value
}

// 6:00–18:00（北京时间）为白天模式，其余时间为深色模式
export function initTheme() {
  const h = beijingHour()
  theme.value = (h >= 6 && h < 18) ? 'light' : 'dark'
  apply()
}

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  apply()
}
