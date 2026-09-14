import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import http from 'node:http'

// 开发时 /api 代理到后端（Spring Boot，仓库根的 start-dev.bat 把它起在 8090）。
// 要指到别的后端：API_TARGET=http://127.0.0.1:9000 npm run dev
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:8090'

export default defineConfig({
  plugins: [vue()],
  server: {
    // 固定 IPv4，消除 localhost 在 Node 18+ 上的双栈歧义（否则 127.0.0.1:5173 打不开）
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: API_TARGET,
        // 必须给一个真实的 keep-alive agent。Vite 内置的 http-proxy 里写的是：
        //   outgoing.agent = options.agent || false
        //   if (!outgoing.agent) { outgoing.headers.connection = 'close' }
        // 也就是说 agent 为假值（默认就是）时，会强制对上游发 Connection: close，
        // 而本机 Node 24 + Windows 下这条路径有约 25–30% 的概率变成 RST（read ECONNRESET），
        // 代理随即回一个「HTTP 500 + 空 body」，前端 res.json() 就会抛
        //   JSON.parse: unexpected end of data —— 表现为「刷新一下又好了」。
        //
        // timeout 同样不能省：后端（Tomcat）默认 20s 就关掉空闲连接，而代理池会一直
        // 攥着不放，复用那条已死的连接同样是 RST。这里让客户端 30s 主动丢弃空闲连接，
        // 与后端的 60s（application.yml 的 keep-alive-timeout）错开，两边谁都不会用旧连接。
        agent: new http.Agent({ keepAlive: true, timeout: 30_000 }),
      },
    },
  },
})
