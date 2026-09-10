// Markdown 渲染器 —— 从原型 workspace-blog.html 的 mdToHtml/inlineMd/resolveImg 逐行移植
// 输出 HTML 字符串，供 v-html 使用；行为与原版一致。

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function uid(rel) {
  return 'h-' + rel.replace(/[^\w一-龥]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'sec'
}

// 把快照里的图片相对 URL（如 ./img/...）规范为以 BASE 开头的绝对路径，
// 避免在 /settings 等子路由下相对解析错位。
export function assetUrl(u) {
  if (!u) return ''
  if (/^(https?:|data:)/.test(u)) return u
  return (import.meta.env.BASE_URL || '/') + String(u).replace(/^\.\//, '')
}

// 规范化 md 正文里图片的相对引用路径（处理 ../ 与 .），返回快照 images 映射的 key。
function resolveImg(rel, docDir) {
  if (/^(https?:|data:)/.test(rel)) return null
  const joined = (docDir ? docDir + '/' : '') + rel
  const parts = []
  const segs = joined.split('/')
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (!s || s === '.') continue
    if (s === '..') { parts.pop(); continue }
    parts.push(s)
  }
  return parts.join('/')
}

function inlineMd(txt, docDir, ws) {
  let s = esc(txt)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (m, alt, url) {
    const imgRel = resolveImg(url, docDir)
    const img = (imgRel && ws && ws.images && ws.images[imgRel]) || null
    if (img) {
      return '<figure><img class="md-img" src="' + assetUrl(img.u) + '" alt="' + esc(alt || '') + '" loading="lazy"><figcaption>' + esc(alt || '') + '</figcaption></figure>'
    }
    return '<figure><img class="missing" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="图片缺失">' +
      '<figcaption>[' + esc(alt || imgRel || url) + ' · 图片未随包收录]</figcaption></figure>'
  })
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (m, t, u) {
    if (t && /^(https?:|mailto:|#)/.test(u)) return '<a href="' + esc(u) + '" target="_blank" rel="noreferrer">' + t + '</a>'
    return '<a href="#">' + t + '</a>'
  })
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return s
}

export function mdToHtml(md, docDir, ws) {
  const headings = []
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  const out = []
  let inCode = false
  let codeBuf = []
  let para = []
  let inTable = false
  let tableRows = []
  let listType = null
  const hcount = {}

  function flushPara() {
    if (para.length) { out.push('<p>' + inlineMd(para.join(' '), docDir, ws) + '</p>'); para = [] }
  }
  function flushTable() {
    if (!tableRows.length) return
    const head = tableRows.shift()
    let html = '<div style="overflow:auto;"><table><thead><tr>' +
      head.split('|').filter(c => c.trim() !== '').map(c => '<th>' + inlineMd(c.trim(), docDir, ws) + '</th>').join('') +
      '</tr></thead><tbody>'
    tableRows.forEach(r => {
      html += '<tr>' + r.split('|').filter(c => c.trim() !== '').map(c => '<td>' + inlineMd(c.trim(), docDir, ws) + '</td>').join('') + '</tr>'
    })
    html += '</tbody></table></div>'
    out.push(html); tableRows = []; inTable = false
  }

  for (i = 0; i < lines.length; i++) {
    const ln = lines[i]
    const isFence = /^```/.test(ln.trim())
    if (isFence) {
      flushPara(); flushTable()
      if (!inCode) {
        inCode = true
        codeBuf = [ln.replace(/^```\s*/, '').trim() ? '// ' + ln.replace(/^```\s*/, '').trim() : '']
      } else {
        inCode = false
        out.push('<pre><code>' + esc(codeBuf.join('\n')) + '\n</code></pre>')
      }
      continue
    }
    if (inCode) { codeBuf.push(ln); continue }

    const trim = ln.trim()
    if (trim === '') { flushPara(); flushTable(); listType = null; continue }

    let m
    if ((m = /^(#{1,6})\s+(.*)$/.exec(trim))) {
      flushPara(); flushTable()
      const lvl = m[1].length
      const txt = m[2].trim()
      const key = txt.toLowerCase()
      const n = hcount[key] = (hcount[key] || 0) + 1
      const id = uid(docDir + '|' + txt + (n > 1 ? '-' + n : ''))
      headings.push({ lvl, text: txt, id })
      out.push('<h' + lvl + ' id="' + id + '">' + inlineMd(txt, docDir, ws) + '</h' + lvl + '>')
      continue
    }
    if (/^\|/.test(trim) && /\|$/.test(trim)) {
      flushPara()
      if (!inTable) {
        inTable = true; tableRows = []; listType = null
        const isSep = /^\|?[\s:|-]+\|?$/.test(trim) && /\|-|:--|--:/.test(trim)
        if (isSep) { continue }
        tableRows.push(trim)
      } else {
        if (/^\|[\s:|-]+\|?$/.test(trim) && !trim.replace(/[\s|:]/g, '')) { continue }
        tableRows.push(trim)
      }
      continue
    }
    if (/^\s*---+/.test(ln) && trim !== '---') { flushPara(); flushTable(); continue }
    if (trim === '---' && !para.length && !tableRows.length) { continue }
    if (/^&gt;\s?/.test(trim) || /^>\s?/.test(trim)) {
      flushPara(); flushTable()
      const qs = []
      while (i < lines.length && /^>/.test(lines[i].trim())) { qs.push(lines[i].trim().replace(/^>\s?/, '')); i++ }
      i--
      out.push('<blockquote>' + inlineMd(qs.join(' '), docDir, ws) + '</blockquote>')
      continue
    }
    if ((m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(ln)) && m[3].length) {
      flushPara(); flushTable()
      const ordered = /\d+\./.test(m[2])
      const tag = ordered ? 'ol' : 'ul'
      if (listType !== tag) { if (listType) out.push('</' + listType + '>'); out.push('<' + tag + '>'); listType = tag }
      out.push('<li>' + inlineMd(m[3], docDir, ws) + '</li>')
      continue
    }
    if (listType && !/^\s*([-*+]|\d+\.)\s+/.test(ln)) { out.push('</' + listType + '>'); listType = null }
    para.push(ln)
  }
  flushPara(); flushTable()
  if (listType) out.push('</' + listType + '>')
  if (inCode) { out.push('<pre><code>' + esc(codeBuf.join('\n')) + '\n</code></pre>') }
  return { html: out.join('\n'), headings }
}
