# open markdown blog · UI 原型

一个纯前端、可离线打开的中文"本地知识博客"原型：全屏打字诗首页 + 文档浏览/阅读器 + 独立设置页。数据来自本地两个工作区目录的快照，已随包本地化。

## 目录结构

```
ui_protype/
├─ workspace-blog.html   # 博客主页面（自包含单文件，约 2.2 MB）
├─ settings.html         # 独立设置页
├─ assets/
│  └─ bg-poem-ridge.jpg  # 首页背景图（预设 · 晨雾）
└─ img/
   ├─ mymajor/           # 工作区 1 引用的 md 图片
   └─ mymdrecord/        # 工作区 2 引用的 md 图片
```

两个页面通过相对路径互相链接，图片也全部走相对路径，用浏览器直接打开即可，无需服务器。

## 页面与功能

### 1. 首页（打字诗）

- 全屏背景图 + 居中衬线大字，逐字录入一行、整行停顿后抹除，再播放下一行，循环往复。
- 可配置诗句多行、字号、播放速度，以及背景遮罩强度（保证文字可读）。
- 顶部右侧为设置入口；底部固定一枚向下箭头，下拉进入博客正文区。

### 2. 博客文章区

- 右上角分区切换器，在多个工作区之间切换（当前为 `mymajor`、`mymdrecord`）。
- 左侧为目录树，按真实目录层级展开；右侧为文件列表，支持按文件名检索。
- 列表涵盖 markdown、pdf 及其他常见文档格式；点击可打开阅读。
- 目录树只展示文档本身，md 正文里引用的图片不进目录，但在正文中按相对路径正确渲染。

### 3. 阅读器

- 顶部返回按钮、目录折叠开关；右侧为当前文档的「本页目录」，可一键收起。
- 正文区渲染 markdown 内容；打开文档时可按设置决定目录是否默认收起。

### 4. 设置页（settings.html）

- 背景：预设缩略图选择、本地上传背景图、一键恢复预设、遮罩强度滑块。
- 诗句：多行textarea、字号、打字速度。
- 工作区：新增/编辑/删除，标注 Windows / Linux 系统与本地绝对路径；路径以等宽字体展示。
- 阅读偏好：打开文档时目录是否默认收起、正文字号。
- 顶部「恢复默认」，底部保存提示与轻量 toast。

## 数据与持久化

- 两个页面共用同一存储键 `shijian.blog.v1`（localStorage）。
- 设置页只写入外观/诗句/工作区偏好，并**回写**主站的 `activeWs / activePath / lastOpened` 字段，避免覆盖阅读进度。
- 主站启动时用已保存的工作区元数据合并内置快照，只改元数据、保留图片映射。

## 内容来源

- `mymajor`：Java 学习库（`java-doc`，16 个主题章节，104 篇 md，目录树另含 16 个 pdf/doc 等）。
- `mymdrecord`：分类记录笔记库，19 篇 md，含截图资源。
- 共 123 篇 md 正文快照内嵌，37 张 md 相对引用图本地化到 `img/`（原始来源：`E:\mymicrosoft\download\temp`）。

## 本地运行

直接用浏览器打开 `workspace-blog.html` 即可；`settings.html` 从主站顶栏进入，或在地址栏直接打开。

## 已知限制

- 目录扫描与图片抽取是在构建阶段完成的（离线快照）。前端**无法**在浏览器里枚举本地任意目录，所以设置页新增工作区时只记录路径与元数据；要真正读取其内容，需由构建脚本重新扫描生成。
- 为控制单文件体积，个别超长文档在正文中做了截断演示。

## 待实现：URL key 访问校验（纯前端）

需求：链接带上 `?key=<约 256 位随机串>` 才展示外观与设置，且 key 不希望明文存在前端。

### 结论

纯前端不可能真正"藏住秘密"——凡送到浏览器的都能被查看。按目标分两级：

1. **只做界面门禁**（没有 key 就不显示外观/设置）：前端只存 key 的哈希，明文不落盘 → 见方案 A。
2. **内容本身保密**（连源码都看不到）：用 key 派生密钥把内容加密，正确 key 才能解密 → 见方案 B。

两者可叠加：先用 A 判门，再用 B 解密受保护的配置/内容。

### 方案 A：哈希门禁

- 生成 256 位随机 token：`crypto.getRandomValues(new Uint8Array(32))`，转 base64url。
- 前端只保存 token 的 PBKDF2/SHA-256 派生值（配合每部署独立的 salt）。
- 加载时读取 `?key=`，用 Web Crypto 计算派生值并做常量时间比较。
- 校验后立即 `history.replaceState` 抹掉 URL 参数，只把 `unlocked` 布尔值放内存/sessionStorage，绝不保存 token。

```js
// useAccessGate.js
import { ref } from 'vue'

const STORED = '<base64url 的派生哈希>'   // 只存哈希
const SALT   = '<每部署一份随机 salt>'

const enc = new TextEncoder()
const toHex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')

async function derive(token) {
  const base = await crypto.subtle.importKey('raw', enc.encode(token), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: 210000, hash: 'SHA-256' },
    base, 256)
  return toHex(bits)
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export const unlocked = ref(false)

export async function initAccessGate() {
  const url = new URL(location.href)
  const key = url.searchParams.get('key')
  if (key) {
    const ok = safeEqual(await derive(key), STORED)
    url.searchParams.delete('key')                       // 无论成败都抹掉
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    if (ok) { unlocked.value = true; sessionStorage.setItem('unlocked', '1') }
  } else if (sessionStorage.getItem('unlocked') === '1') {
    unlocked.value = true
  }
}
```

```vue
<template>
  <AppShell v-if="unlocked" />
  <LockedLanding v-else />
</template>
```

```js
// main.js
import { createApp } from 'vue'
import { initAccessGate } from './access/useAccessGate'
import App from './App.vue'

await initAccessGate()          // 顶层 await（或 .then）
createApp(App).mount('#app')
```

- 路由守卫：`router.beforeEach(to => { if (!unlocked.value && to.meta.secure) return false })`
- Web Crypto 需要安全上下文（https 或 localhost）。
- 注意：`v-if` 只是 UI 隐藏。如果"外观/设置"里含真正敏感的数据，页面源码中仍是明文，必须走方案 B。

### 方案 B：加密门禁（最强纯前端方案）

用同一个 URL key 经 PBKDF2 派生 AES-GCM 密钥，构建时把敏感负载（外观、设置，甚至整篇内容）加密成密文写进应用。前端只保存**密文 + salt + iv**，密钥从不落盘——这才是"key 不在前端存"的正解。

```js
async function deriveAesKey(token, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(token), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 210000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
}

// payload = { salt, iv, ct }（iv/ct 为 base64）
async function decrypt(token, payload) {
  const key = await deriveAesKey(token, payload.salt)
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(payload.iv) }, key, b64(payload.ct))
  return new TextDecoder().decode(pt)
}
```

- 构建脚本：`openssl rand -base64 32` 生成 token，用 Node `crypto` 加密 `appearance.json` 等，密文放 `public/secure/`。
- 运行时 `fetch` 密文后解密；解密失败即视为无 key，展示默认外观。

### 威胁与加固

- Referer 泄露：加 `<meta name="referrer" content="no-referrer">`，校验后立即 `replaceState`。
- 历史 / 截图 / 分享泄露：可改用 **URL fragment**（`#key=` 不发送到服务器、不进 Referer），纯静态托管下更安全。
- XSS：配置 CSP，令牌只在内存；切勿写入 localStorage（持久明文）。
- 服务端强隔离：Cloudflare Access / Netlify 密码保护 / Vercel Password Protection / HTTP Basic Auth。纯静态前端没有服务端，做不到服务端鉴权，哈希或加密是唯一兜底。
- Vite 场景：把**哈希值**放进 `.env`（如 `VITE_ACCESS_HASH`），token 本体不进仓库；加密方案则把密文放 `public/`。
