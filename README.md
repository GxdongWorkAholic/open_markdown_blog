# open markdown blog · Vue 版

将 `ui_protype/` 里的纯前端原型（打字诗首页 + 文档阅读器 + 设置页）移植为 **Vue 3 + Vite + vue-router** 单页应用，并落地 README「待实现」的 **URL key 访问校验（方案 B · 加密门禁）**。

## 页面与路由

- `/` —— 首页：全屏打字诗 + 工作区分区 + 目录树 + 文件检索 + 阅读器（阅读器为首页内部视图）。
- `/settings` —— 设置页：背景 / 诗句 / 工作区 / 阅读偏好。
- 两个页面共用 localStorage 键 `shijian.blog.v1`（与原版一致）。

## 访问门禁（方案 B）

链接携带 `?key=<256 位随机串>` 才会解锁：

- **无 key 或错误 key** → 展示锁定页，不渲染外观、右上角设置按钮与设置页（错误 key 视同无 key）。
- **正确 key** → 解锁整站：展示打字诗首页/阅读器外观、顶部「外观与设置」按钮、可进入设置页。

实现：key 经 PBKDF2（SHA-256，210000 次迭代）派生 AES-256-GCM 密钥，构建期把「外观/设置」默认值加密成密文 `src/secure/config.enc.json`。前端只保存 `{salt, iv, ct}`，key 本体绝不落盘；运行时解密失败即锁定。key 仅存于内存（`accessToken`），不写入 localStorage/sessionStorage。

> Web Crypto 需要安全上下文（https 或 localhost）。

## 运行

```bash
npm install
npm run dev        # 开发：http://localhost:5173/
npm run build      # 构建到 dist/
npm run preview    # 预览构建产物
```

访问示例：

```
http://localhost:5173/                              # 锁定
http://localhost:5173/?key=<访问密钥>               # 解锁
```

## 重新生成密文 / 轮换 key

1. 生成新 token（约 256 位）：`openssl rand -base64 192 | tr '+/' '-_' | tr -d '=\n'`（长度按需）。
2. 加密默认值：

   ```bash
   ACCESS_TOKEN=<新token> npm run encrypt
   ```

3. 重新 `npm run build`。旧链接随即失效。

token 本体不进仓库（`.gitignore` 已忽略 `.env.local`）；只有生成的密文入库。可参考 `.env.example`。

## 目录结构

```
scripts/encrypt-config.mjs    # 构建期加密脚本（Node crypto）
public/assets/…  public/img/… # 背景图与 md 引用图片（自 ui_protype 拷贝）
src/access/useAccessGate.js   # 方案 B 运行时解密（Web Crypto）
src/secure/config.enc.json    # 密文 {salt, iv, ct}
src/data/vfs.json             # 从原型 #od-vfs 抽取的工作区快照
src/store/useStore.js         # 全局响应式状态 + localStorage 持久化
src/markdown/mdToHtml.js      # 手写 Markdown 渲染器（自原型移植）
src/components/  src/views/   # 组件与路由页面
```

## 说明

- 文章内容快照（`vfs.json`）为公开博客正文，保持明文；被加密的是「外观/设置」默认值（诗句、背景、字号、遮罩、工作区元数据）。
- 目录扫描与图片抽取在构建阶段完成（离线快照），浏览器无法实时枚举磁盘目录；设置页新增工作区仅登记路径与元数据。
- `ui_protype/` 目录保留为设计参照，未改动。
