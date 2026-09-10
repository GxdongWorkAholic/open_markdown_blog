import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // 开发时把 /api 代理到本地目录服务（node server/index.mjs，默认 8787）
      '/api': 'http://localhost:8787',
    },
  },
})
