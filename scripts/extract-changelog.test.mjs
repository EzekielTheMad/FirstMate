import { describe, it, expect } from 'vitest'
import { extractSection } from './extract-changelog.mjs'

const SAMPLE = `# Changelog

All notable changes.

## [0.1.3] - 2026-07-12

### Added
- In-app updater with changelog.

### Changed
- Hardened the Windows installer.

## [0.1.2] - 2026-07-10

### Fixed
- Packaged crash from ES module scope.
`

describe('extractSection', () => {
  it('extracts a middle version section without its heading', () => {
    expect(extractSection(SAMPLE, '0.1.3')).toBe(
      '### Added\n- In-app updater with changelog.\n\n### Changed\n- Hardened the Windows installer.'
    )
  })

  it('extracts the final version section (runs to end of file)', () => {
    expect(extractSection(SAMPLE, '0.1.2')).toBe(
      '### Fixed\n- Packaged crash from ES module scope.'
    )
  })

  it('returns empty string for an unknown version', () => {
    expect(extractSection(SAMPLE, '9.9.9')).toBe('')
  })
})
