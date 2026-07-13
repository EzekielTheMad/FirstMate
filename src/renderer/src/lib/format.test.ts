import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './format'

describe('renderMarkdown', () => {
  it('renders headings, bold, and paragraphs', () => {
    expect(renderMarkdown('### Fixed')).toBe('<h3>Fixed</h3>')
    expect(renderMarkdown('**bold**')).toBe('<p><strong>bold</strong></p>')
  })

  it('joins a soft-wrapped (hard-newline) bullet into one list item', () => {
    const md = '- **Industry** now shows only your\n  active jobs'
    expect(renderMarkdown(md)).toBe(
      '<ul>\n<li><strong>Industry</strong> now shows only your active jobs</li>\n</ul>'
    )
  })

  it('keeps separate bullets separate', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>')
  })

  it('escapes HTML so release notes / advice cannot inject markup', () => {
    const out = renderMarkdown('<script>alert(1)</script>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).not.toContain('<script>')
  })
})
