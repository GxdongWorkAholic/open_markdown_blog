// 方案 B 加密门禁 —— 构建期加密脚本
// 用 ?key=<ACCESS_TOKEN> 派生 AES-256-GCM 密钥，把「外观/设置」明文加密为密文。
// 运行：ACCESS_TOKEN=<token> node scripts/encrypt-config.mjs
// 产出：src/secure/config.enc.json  { salt, iv, ct }（base64），token 本体绝不落盘。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// 1) 读取 token：优先 process.env.ACCESS_TOKEN，其次根目录 .env.local
function loadToken() {
  if (process.env.ACCESS_TOKEN && process.env.ACCESS_TOKEN.trim()) {
    return process.env.ACCESS_TOKEN.trim()
  }
  const envFile = join(root, '.env.local')
  if (existsSync(envFile)) {
    const text = readFileSync(envFile, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*ACCESS_TOKEN\s*=\s*(.+?)\s*$/)
      if (m) return m[1].trim()
    }
  }
  return ''
}

const token = loadToken()
if (!token) {
  console.error('[encrypt-config] 缺少 ACCESS_TOKEN。请设置环境变量或写入 .env.local（见 .env.example）。')
  process.exit(1)
}

// 2) 待加密的「外观/设置」默认值（与原型的 DEFAULTS / DEFAULT_WS 一致）
const DEFAULTS = {
  bg: 'ridge', bgData: '', veil: 0.5,
  poem: [
    '问渠那得清如许', '为有源头活水来', '千淘万漉虽辛苦', '吹尽狂沙始到金',
    '不积跬步，无以至千里', '不积小流，无以成江海'
  ],
  speed: 'mid', poemSize: 46, tocDefaultHidden: false, readerSize: 17
}
const DEFAULT_WS = [
  { id: 'mymajor', name: 'mymajor', os: 'win', root: 'E:\\mymicrosoft\\download\\temp\\mymajor', desc: 'Java 后端学习库 · java-doc，含 16 个主题章节' },
  { id: 'mymdrecord', name: 'mymdrecord', os: 'win', root: 'E:\\mymicrosoft\\download\\temp\\mymdrecord', desc: '随手记录 · 分类笔记库，含参考图资源' }
]
const payload = JSON.stringify({ prefs: DEFAULTS, workspaces: DEFAULT_WS })

// 3) PBKDF2 派生密钥 + AES-256-GCM 加密
const salt = randomBytes(16)
const iv = randomBytes(12)
const key = pbkdf2Sync(token, salt, 210000, 32, 'sha256')
const cipher = createCipheriv('aes-256-gcm', key, iv)
const ct = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
const tag = cipher.getAuthTag()
// Web Crypto 的 AES-GCM 密文自带 tag（ciphertext || tag）
const ctWithTag = Buffer.concat([ct, tag])

const out = {
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  ct: ctWithTag.toString('base64')
}

const target = join(root, 'src', 'secure', 'config.enc.json')
writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log('[encrypt-config] 已生成', target)
console.log('[encrypt-config] 密文', out.ct.length, '字符；token 未写入任何文件。')
