# vue3 —— 前端

Vue 3 + Vite 的单页应用。**完整文档在仓库根的 `README.md`**，这里只列前端自己的事。

```bash
npm install
npm run dev        # → http://127.0.0.1:5173，/api 代理到 127.0.0.1:8090（Spring 后端）
npm run build      # → dist/
```

要指到别的后端（换个端口起的 Spring，或者别的机器上的实例）：

```bash
API_TARGET=http://127.0.0.1:9000 npm run dev
```

## 目录

| 路径 | 作用 |
|------|------|
| `src/store/http.js` | 统一请求层：`API_BASE`、`X-Access-Key` 请求头、错误分类（down / http / auth / empty / badjson） |
| `src/store/useStore.js` | 全局状态与所有 API 调用 |
| `src/access/useAccessGate.js` | 门禁：`?key=` → `POST /api/auth/verify`，密钥只留内存 |
| `src/markdown/mdToHtml.js` | markdown 渲染；图片地址按「工作区 id + 相对路径」拼 |
| `src/components/` | 首页 HeroPoem、目录树 ShelfBrowser/TreeNode、阅读器 ReaderView |
| `src/views/` | HomeView、SettingsView |

## 两处容易被改坏的地方

1. **`vite.config.js` 里代理的 keep-alive agent 不能删。** Vite 内置的 http-proxy 在未指定 agent 时
   会强制对上游发 `Connection: close`，而 Node 24 + Windows 下这条路径有约 25–30% 概率变成
   `read ECONNRESET`，代理随即回「HTTP 500 + 空 body」，前端就会抛
   `JSON.parse: unexpected end of data`。现象是「首屏偶发报错、刷新一下又好了」。
2. **`prefs.bgUrl` 存的是裸文件名，不是 `/api/uploads/x.jpg`。** 存相对路径的话，
   一旦前端与后端不在同一个源就裂了。历史值在 `applyConfig` 里自动归一化。
