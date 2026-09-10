# open markdown blog

把本地 markdown 目录变成**可浏览的知识博客**：全屏打字诗首页 + 工作区分区 + 目录树 + 阅读器 + 设置页。
Vue 3 + Vite 单页应用，配一个 Node 目录服务（实时扫描你指定的本机目录），并带 **URL key 加密门禁**（方案 B）。

> 原型在 `ui_protype/`（纯静态单文件），本仓库是它的 Vue 实现。

## 特性

- **实时读本地目录** —— 浏览器读不了磁盘，由本地 Node 服务代读：目录树 / md 正文 / 引用图片全部按真实文件走，无快照、无同步步骤。
- **URL key 门禁（方案 B）** —— 密钥经 PBKDF2 派生 AES-256-GCM 去解密门禁密文；**密钥本身从不落盘**，不是明文/哈希比较。
- **游客模式** —— 没带 key 也能正常浏览博客，只是不显示「外观与设置」入口。
- **设置持久化** —— 外观、诗句、工作区、上传图片都存服务端 `data/`，换浏览器 / 清缓存都不丢。
- **深色模式** —— 首页右上角一键切换；按**北京时间**默认（6–18 点白天，其余深色）；不持久化。
- **图片上传 / 删除** —— 上传自动重命名为 `年月日时分秒-16位随机串.扩展名`，存在 `data/uploads/`。
- **工作区拖拽排序** —— 卡片式管理，SortableJS 平滑重排 + 抬起拖影，鼠标与触屏都支持。
- **移动端适配** —— 桌面布局不变，小屏单独优化。

## 架构

```
浏览器（Vue SPA）
   │  目录：GET  /api/ws?root=<路径>      扫描目录树（只列文档）
   │        GET  /api/doc?root=&rel=      读取文档正文
   │        GET  /api/img?root=&rel=      读取 md 引用的图片
   │  设置：GET|POST /api/config          读写设置（data/config.json）
   │        POST /api/config/reset        恢复默认
   │  上传：POST /api/upload?name=x.png   上传图片 → data/uploads/
   │        GET  /api/uploads             已上传图片列表（最新在前）
   │        DELETE /api/uploads/<名>      删除图片（连文件一起删）
   │  门禁：GET  /api/secure              取门禁密文（前端用 ?key= 解密）
   │        POST /api/key                 修改访问密钥（用新密钥重新加密密文）
   ▼
server/index.mjs  （Node 服务，同时托管构建后的 dist/）
```

浏览器无法枚举/读取本地磁盘（安全限制），所以必须经这个本地服务。

## 页面与路由

- `/` —— 首页：全屏打字诗 + 工作区分区 + 目录树 + 文件检索 + 阅读器（阅读器是首页内部视图）。
- `/settings` —— 设置页：背景（预设 / 上传图库）/ 诗句 / 工作区 / 阅读偏好 / 访问密钥。

## 运行

```bash
npm install
```

**生产（单命令：构建 + 起服务）**

```bash
npm start                # → http://localhost:8787/
```

**开发（两个终端，Vite 已把 /api 代理到 8787）**

```bash
npm run api              # 终端 1：目录服务 8787
npm run dev              # 终端 2：Vite 5173
```

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `PORT` | `8787` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址；**反代部署时设 `127.0.0.1`**，只暴露给 Caddy |

访问示例：

```
http://localhost:8787/                    # 游客态
http://localhost:8787/?key=ihateblog      # 解锁（默认密钥）
```

## 使用：设置工作区

解锁后进设置页 →「工作区管理」→ 新增/编辑工作区，填**本机真实目录**，返回首页即可浏览。

- 只扫描**文档类文件**：`md / markdown / pdf / txt / doc / docx / xls / xlsx / ppt / pptx / rtf`。
- 不含文档的目录（如纯图片目录）不进目录树；md 正文里的图片按相对路径**实时加载**。
- 工作区顺序可用左侧握把**拖拽调整**，会自动保存。

## 设置与数据

所有运行时数据都在 **`data/`**（已 `gitignore`，不入库）：

| 文件 | 内容 | 明文？ |
|------|------|--------|
| `data/config.json` | 工作区路径 + 外观偏好（背景 / 诗句 / 字号 / 遮罩…） | 明文 |
| `data/secure.json` | 门禁密文 `{v,salt,iv,ct}` | 密文 |
| `data/uploads/` | 上传的图片 | 原图 |

- **删除 `data/` 即回到出厂默认**（0 工作区 + 密钥 `ihateblog`）。
- **备份 / 迁移**：把整个 `data/` 拷到新机器即可，**同一个访问密钥照常解锁**。
  但请注意：**访问密钥本身不落盘**，程序里存不下来，只能自己记住。

## 访问门禁（方案 B）

- **默认密钥 `ihateblog`** —— 首次运行自动生成密文；**请到设置页改成自己的**。
- **无 key / 错误 key** → 游客：博客正常浏览，但**不显示「外观与设置」按钮**，也进不了设置页（错误 key 会**重定向**到不含 key 的干净地址）。
- **正确 key**（`?key=<密钥>`）→ 解锁：出现设置按钮，可进设置页。
- 设置页「访问密钥」可**修改密钥**：**8–256 位，仅大小写字母与数字**。

原理：密钥经 PBKDF2（SHA-256，210000 次）派生 AES-256-GCM 密钥去解密密文，**解得开才算解锁**（非明文比较）。
服务端只在 `data/secure.json` 保存密文，**不保存密钥本身**；修改密钥时用新密钥重新加密。

> 忘记密钥：删除 `data/secure.json` 后重启服务 → 恢复默认 `ihateblog`，再重新设一个。

## 部署到服务器（Caddy 反代 + HTTPS）

> ⚠️ **线上必须走 HTTPS**：门禁校验用浏览器的 Web Crypto（`crypto.subtle`），它只在**安全上下文**（`https://` 或 `localhost`）可用。用纯 HTTP 访问线上域名，**永远解不开锁**。

### 1. 拉代码并构建

```bash
git clone <你的仓库> /opt/open-markdown-blog
cd /opt/open-markdown-blog
npm install
npm run build                 # 产出 dist/
```

### 2. 确认只监听本机

```bash
HOST=127.0.0.1 PORT=8787 node server/index.mjs
```

### 3. 交给 systemd 常驻

`/etc/systemd/system/open-markdown-blog.service`：

```ini
[Unit]
Description=open markdown blog
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/open-markdown-blog
Environment=HOST=127.0.0.1
Environment=PORT=8787
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=3
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now open-markdown-blog
sudo systemctl status open-markdown-blog
```

> `ExecStart` 的 node 路径用 `which node` 确认。若是 nvm / volta 装的 node，systemd 读不到你的 shell 环境，
> 必须写**绝对路径**（例如 `/home/you/.volta/bin/node`）。

### 4. 安装 Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### 5. 写 Caddyfile

`/etc/caddy/Caddyfile`：

```
blog.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:8787
}
```

```bash
sudo systemctl reload caddy
```

Caddy 会**自动申请并续期** Let's Encrypt 证书 —— 前提：域名已解析到本机、80 / 443 已放行。

### 6. 验证

```
https://blog.example.com/                  # 游客态：能读博客，无设置按钮
https://blog.example.com/?key=<你的密钥>   # 解锁：出现设置按钮
```

首次进设置页 →「工作区管理」填**服务器上**的真实目录 → 保存即生效。

### 常见变体

| 场景 | 做法 |
|------|------|
| 没有公网域名（纯展示） | Caddyfile 写 `:80 { reverse_proxy 127.0.0.1:8787 }`；**无 HTTPS → 门禁不可用** |
| 内网自签证书 | `blog.lan { tls internal; reverse_proxy 127.0.0.1:8787 }`，客户端需信任 Caddy 根证书 |
| 想限制上传大小 | 在站点块里加 `request_body { max_size 20MB }` |
| Docker 部署 | 容器入口跑 `node server/index.mjs`，把 `data/` 与要浏览的目录都**挂卷**进去 |

> 目录服务读的是**服务器上**的路径 —— 设置页里填的必须是服务器上真实存在的目录（Windows 本地那套路径在服务器上无效）。

## 目录结构

```
server/index.mjs              # Node 服务：目录扫描 + 设置持久化 + 图片上传 + 门禁密文 + 托管 dist
src/access/useAccessGate.js   # 方案 B 运行时解密（Web Crypto）+ 修改密钥
src/composables/useTheme.js   # 深色/白天主题（按北京时间默认，不持久化）
src/store/useStore.js         # 全局状态 + 服务端设置读写 + 实时目录读取
src/markdown/mdToHtml.js      # Markdown 渲染器（图片经 /api/img）
src/components/               # HeroPoem / ShelfBrowser / TreeNode / ReaderView / ToastHost
src/views/                    # HomeView / SettingsView
src/styles/main.css           # 全部样式（含深色主题与移动端适配）
public/assets/default.jpg     # 首页默认背景图
ui_protype/                   # 原始静态原型（设计参照，不参与构建）
data/                         # 运行时数据（config.json + secure.json + uploads/），已 gitignore
```

## 说明

- `ui_protype/` 只是设计参照；原型里内嵌的 `#od-vfs` 快照**已不再使用**。
- 设置接口在本机服务上**未做鉴权**（同机能访问）；`?key=` 门禁是**前端 UI 门禁**，不是服务端鉴权。
  真要保护内容，请用 Caddy 的 `basic_auth` / Cloudflare Access 之类的**服务端**手段。
- 目录服务默认只读：不会写入你设置的工作区目录，写入只发生在 `data/`。
