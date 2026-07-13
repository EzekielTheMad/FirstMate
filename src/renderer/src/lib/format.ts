export function isk(n: number, compact = false): string {
  if (compact) {
    const abs = Math.abs(n)
    if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}b`
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}m`
    if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`
    return String(Math.round(n))
  }
  return Math.round(n).toLocaleString('en-US')
}

export function num(n: number): string {
  return n.toLocaleString('en-US')
}

export function shortDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function relativeTime(iso?: string | number): string {
  if (iso === undefined) return '—'
  const d = new Date(iso).getTime()
  if (isNaN(d)) return String(iso)
  const diff = d - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  const hours = Math.round(mins / 60)
  const days = Math.round(hours / 24)
  let label: string
  if (mins < 60) label = `${mins}m`
  else if (hours < 48) label = `${hours}h`
  else label = `${days}d`
  return diff >= 0 ? `in ${label}` : `${label} ago`
}

export function securityColor(sec?: number): string {
  if (sec === undefined) return 'var(--text-dim)'
  if (sec >= 0.5) return 'var(--green)'
  if (sec > 0.0) return 'var(--amber)'
  return 'var(--red)'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(s: string): string {
  // Order matters: escape first, then apply markup on the escaped text.
  let out = escapeHtml(s)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  return out
}

/**
 * Minimal, safe markdown → HTML for advisor output. Escapes all HTML first,
 * then applies a small subset (headings, lists, bold, code, hr).
 */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let listType: 'ul' | 'ol' | null = null
  // The current open block being accumulated, so soft-wrapped (hard-newline)
  // markdown joins into one list item / paragraph instead of breaking apart.
  let block: { kind: 'li' | 'p'; text: string } | null = null

  const flush = (): void => {
    if (!block) return
    html.push(block.kind === 'li' ? `<li>${inline(block.text)}</li>` : `<p>${inline(block.text)}</p>`)
    block = null
  }
  const closeList = (): void => {
    flush()
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()
    if (!trimmed) {
      closeList()
      continue
    }
    if (/^---+$/.test(trimmed)) {
      closeList()
      html.push('<hr/>')
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      closeList()
      html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
      continue
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      flush()
      if (listType !== 'ol') {
        closeList()
        html.push('<ol>')
        listType = 'ol'
      }
      block = { kind: 'li', text: ol[1] }
      continue
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      flush()
      if (listType !== 'ul') {
        closeList()
        html.push('<ul>')
        listType = 'ul'
      }
      block = { kind: 'li', text: ul[1] }
      continue
    }
    // Continuation line: append to the open block (list item or paragraph).
    if (block) block.text += ' ' + trimmed
    else block = { kind: 'p', text: trimmed }
  }
  closeList()
  return html.join('\n')
}
