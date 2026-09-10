# open markdown blog · Vue 版（实时读取本地目录）

将 `ui_protype/` 里的原型移植为 **Vue 3 + Vite + vue-router** 单页应用，并落地「URL key 访问校验（方案 B · 加密门禁）」。

本版**不内置快照**：由本地服务实时扫描你设置的工作区路径，读取目录树、md 正文与引用图片；**设置（外观 / 诗句 / 工作区 / 上传图片）持久化到服务端**，换浏览器或清缓存都不丢。

## 架构

```
浏览器（Vue SPA）
   │  目录：/api/ws?root=<路径>   扫描目录树（仅文档）
   │        /api/doc?root=&rel=   读取文档正文
   │        /api/img?root=&rel=   读取 md 引用的图片
   │  设置：GET|POST /api/config  读写设置（持久化到 data/config.json）
   │        POST /api/config/reset 恢复默认
   │  上传：POST /api/upload?name=x.png  上传图片（存 data/uploads/，自动重命名为
   │                                      「年月日时分秒-16位随机串.扩展名」）
   │        GET  /api/uploads           已上传图片列表（最新在前）
   ▼
server/index.mjs  （Node 本地服务，同时托管构建后的 dist/）
```

浏览器无法直接枚举/读取本地磁盘（安全限制），因此必须通过这个本地服务。

## 页面与路由

- `/` —— 首页：全屏打字诗 + 工作区分区 + 目录树 + 文件检索 + 阅读器。
- `/settings` —— 设置页：背景（预设 / **上传图片**）/ 诗句 / **工作区路径** / 阅读偏好。
- 所有设置保存在服务端 `data/config.json`；上传的图片存在 `data/uploads/`。

## 设置持久化

| 项 | 存哪 |
|----|------|
| 外观（背景、遮罩、字号） | `data/config.json` → `prefs` |
| 诗句内容、打字速度 | 同上 |
| 工作区（名称 / 系统 / 路径） | `data/config.json` → `workspaces`（**默认留空**，自行新增） |
| 上传的背景图片 | 文件存 `data/uploads/`，命名为 `年月日时分秒-16位随机串.扩展名`；路径记在 `prefs.bgUrl` |
| 上次所在工作区 / 目录 | `activeWs` / `activePath` |

`data/` 已在 `.gitignore` 中排除（属于本机运行时数据）。删除 `data/` 即回到出厂默认。

## 访问门禁（方案 B）

- **无 key 或错误 key** → 游客：博客正常浏览，但不显示「外观与设置」按钮，也进不了设置页。
- **正确 key**（`?key=<256 位随机串>`）→ 解锁：显示设置按钮，可进入设置页。

key 经 PBKDF2（SHA-256，210000 次）派生 AES-256-GCM 密钥，构建期把默认「外观/设置」加密成 `src/secure/config.enc.json`；key 本体不落盘，仅存内存。

## 运行

```bash
npm install

# 方式一：生产（单命令：构建 + 起服务）
npm start            # http://localhost:8787/

# 方式二：开发（两个终端）
npm run api          # 终端 1：目录服务 http://localhost:8787
npm run dev          # 终端 2：Vite http://localhost:5173（已代理 /api）
```

访问示例：

```
http://localhost:8787/                              # 游客
http://localhost:8787/?key=<访问密钥>               # 解锁（可进设置页）
```

## 使用：设置真实路径

进入设置页（需 key）→「工作区管理」→ 新增/编辑工作区，填入本机真实的 md 目录，返回首页即可浏览。

> 目录服务只扫描**文档类文件**（md / markdown / pdf / txt / doc / docx / xls / xlsx / ppt / pptx / rtf）；不含文档的目录（如纯图片目录）不进目录树。md 正文里的图片按相对路径实时加载。

## 重新生成密文 / 轮换 key

```bash
ACCESS_TOKEN=<新token> npm run encrypt   # 生成 src/secure/config.enc.json
npm run build
```

## 目录结构

```
server/index.mjs              # 本地服务：目录扫描 + 设置持久化 + 图片上传 + 托管 dist
scripts/encrypt-config.mjs    # 构建期加密脚本（Node crypto）
src/access/useAccessGate.js   # 方案 B 运行时解密（Web Crypto）
src/secure/config.enc.json    # 密文 {salt, iv, ct}
src/store/useStore.js         # 全局状态 + 服务端设置读写 + 实时目录读取
src/markdown/mdToHtml.js      # Markdown 渲染器（图片经 /api/img）
src/components/  src/views/   # 组件与路由页面
public/assets/                # 首页背景图（预设）
data/                         # 运行时数据（config.json + uploads/），已 gitignore
```

## 说明

- `ui_protype/` 保留为设计参照；原型里内嵌的 `#od-vfs` 快照已不再使用。
- 本地服务默认端口 8787（环境变量 `PORT` 可改）。
- 设置接口在本地服务上未做鉴权（同机可访问）；「外观与设置」的 key 门禁是前端 UI 门禁，非服务端鉴权。
