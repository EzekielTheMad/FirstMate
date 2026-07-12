import { readFileSync } from 'node:fs'

/**
 * Extract the body of one version's section from a Keep-a-Changelog document.
 * Matches headings like `## [0.1.3] - 2026-07-12` or `## 0.1.3`. Returns the
 * text between that heading and the next `## ` heading (or EOF), trimmed.
 * Returns '' if the version is not found.
 */
export function extractSection(markdown, version) {
  const lines = markdown.split(/\r?\n/)
  const headingRe = /^##\s+\[?v?([0-9][^\]\s]*)\]?/
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headingRe)
    if (!m) continue
    if (m[1] === version) {
      start = i + 1
    } else if (start >= 0) {
      end = i
      break
    }
  }
  if (start < 0) return ''
  return lines.slice(start, end).join('\n').trim()
}

// CLI: `node scripts/extract-changelog.mjs <version> [changelogPath]`
// Prints the section to stdout. Exits 1 if the section is empty.
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/extract-changelog.mjs')
if (invokedDirectly) {
  const version = process.argv[2]
  const path = process.argv[3] || 'CHANGELOG.md'
  if (!version) {
    console.error('Usage: node scripts/extract-changelog.mjs <version> [changelogPath]')
    process.exit(2)
  }
  const md = readFileSync(path, 'utf-8')
  const section = extractSection(md, version)
  if (!section) {
    console.error(`No changelog section found for version ${version} in ${path}`)
    process.exit(1)
  }
  process.stdout.write(section + '\n')
}
