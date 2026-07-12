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

export function relativeTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso).getTime()
  if (isNaN(d)) return iso
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

  const closeList = (): void => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      closeList()
      continue
    }
    if (/^---+$/.test(line.trim())) {
      closeList()
      html.push('<hr/>')
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      closeList()
      const level = h[1].length
      html.push(`<h${level}>${inline(h[2])}</h${level}>`)
      continue
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (listType !== 'ol') {
        closeList()
        html.push('<ol>')
        listType = 'ol'
      }
      html.push(`<li>${inline(ol[1])}</li>`)
      continue
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (listType !== 'ul') {
        closeList()
        html.push('<ul>')
        listType = 'ul'
      }
      html.push(`<li>${inline(ul[1])}</li>`)
      continue
    }
    closeList()
    html.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  return html.join('\n')
}
