// 空闲后复用连接是否还会 RST —— 就是「隔一阵子第一次打开偶发报错」那个 bug 的回归测试。
// 通过 Vite 代理打后端，每轮之间刻意空闲不同时长。
const BASE = process.argv[2] || 'http://127.0.0.1:5173'
const gaps = [0, 5000, 22000, 45000, 70000]
let bad = 0, total = 0
for (const gap of gaps) {
  if (gap) { console.log(`  （空闲 ${gap / 1000}s…）`); await new Promise(r => setTimeout(r, gap)) }
  const t0 = Date.now()
  const r = await fetch(BASE + '/api/config')
  const text = await r.text()
  total++
  const ok = r.status === 200 && text.includes('"prefs"')
  if (!ok) { bad++; console.log(`  FAIL 空闲 ${gap / 1000}s 后 → HTTP ${r.status}  body=${JSON.stringify(text.slice(0, 60))}`) }
  else console.log(`  PASS 空闲 ${String(gap / 1000).padStart(2)}s 后 → HTTP 200  ${text.length} 字节  ${Date.now() - t0}ms`)
}
console.log(`\n${bad === 0 ? 'ALL PASS' : 'SOME FAILED'}  (${total - bad}/${total})`)
process.exitCode = bad === 0 ? 0 : 1
