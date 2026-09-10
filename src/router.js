import { createRouter, createWebHistory } from 'vue-router'
import { unlocked } from './access/useAccessGate'
import HomeView from './views/HomeView.vue'
import SettingsView from './views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})

// 门禁守卫：未解锁时只允许留在首页（首页由 App.vue 展示锁定页），其它路由一律回退到首页
router.beforeEach((to) => {
  if (to.path !== '/' && !unlocked.value) return { path: '/' }
  return true
})
