import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { releaseAssetNames, releaseNotes, writeChecksums } from './prepare-release.mjs'

const roots = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const changelog = '## [1.2.3] - 2026-10-08\n\n### Fixed\n- Test release.\n'

describe('release prerequisites', () => {
  it('rejects a tag/package version mismatch', () => {
    expect(() => releaseNotes({ version: '1.2.3', event: 'push', tag: 'v1.2.4', changelog })).toThrow('must match')
  })
  it('requires version-specific release notes before publishing', () => {
    expect(() => releaseNotes({ version: '1.2.4', event: 'push', tag: 'v1.2.4', changelog })).toThrow('Missing release notes')
  })
  it('adds honest unsigned-installer and checksum limitations to matching release notes', () => {
    const notes = releaseNotes({ version: '1.2.3', event: 'push', tag: 'v1.2.3', changelog })
    expect(notes).toContain('Test release.')
    expect(notes).toContain('currently unsigned')
    expect(notes).toContain('does not verify the publisher')
  })
  it('permits artifact-only manual builds on non-tag refs', () => {
    expect(releaseNotes({ version: '1.2.3', event: 'workflow_dispatch', tag: 'main', changelog })).toContain('Test release.')
  })
  it('requires installer, blockmap, and channel metadata in the checksum manifest', () => {
    const directory = mkdtempSync(join(tmpdir(), 'firstmate-release-test-'))
    roots.push(directory)
    expect(() => writeChecksums(directory, '1.2.3')).toThrow()
    const names = releaseAssetNames('1.2.3')
    names.forEach(name => writeFileSync(join(directory, name), `test asset ${name}`))
    expect(writeChecksums(directory, '1.2.3')).toEqual(names)
    const manifest = readFileSync(join(directory, 'SHA256SUMS.txt'), 'utf8')
    for (const name of names) {
      expect(manifest).toContain(`${createHash('sha256').update(`test asset ${name}`).digest('hex')}  ${name}\n`)
    }
  })
  it('rejects unsafe version strings in filenames', () => {
    expect(() => releaseAssetNames('../untrusted')).toThrow('Unsupported release version')
  })
})
