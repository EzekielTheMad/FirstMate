import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DATA_PATH, UPDATE_BRANCH, prepareUpdate, readBuild, updateLinks } from './prepare-exploration-update.mjs'

const roots = []
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'
const data = buildNumber => JSON.stringify({ source: { buildNumber }, systems: [], wormholeTypes: [] }) + '\n'
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'firstmate-update-test-'))
  roots.push(root)
  const remote = join(root, 'remote.git')
  const cwd = join(root, 'checkout')
  const artifact = join(root, 'exploration-static.json')
  mkdirSync(cwd)
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '--bare', '--initial-branch=main', remote)
  git('init', '--initial-branch=main')
  git('config', 'user.name', 'Test maintainer')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'core.autocrlf', 'false')
  mkdirSync(dirname(join(cwd, DATA_PATH)), { recursive: true })
  writeFileSync(join(cwd, DATA_PATH), data(1))
  writeFileSync(join(cwd, 'app.txt'), 'trusted base\n')
  git('add', '.')
  git('commit', '-m', 'Initial fixture')
  git('remote', 'add', 'origin', remote)
  git('push', 'origin', 'main')
  writeFileSync(artifact, data(2))
  const options = { cwd, artifact, base: 'main', baseSha: git('rev-parse', 'HEAD'), latestBuild: '2' }
  return { root, remote, cwd, artifact, git, options }
}

function updateCommit(f, { author = BOT_EMAIL, extraFile = false } = {}) {
  f.git('checkout', '-B', UPDATE_BRANCH)
  writeFileSync(join(f.cwd, DATA_PATH), data(2))
  if (extraFile) writeFileSync(join(f.cwd, 'handwritten.txt'), 'Do not overwrite this work\n')
  f.git('add', '.')
  f.git('-c', `user.email=${author}`, 'commit', '-m', 'Existing branch update')
  f.git('push', 'origin', UPDATE_BRANCH)
  f.git('checkout', 'main')
}

describe('validated exploration branch publishing', () => {
  it('creates only the reserved data branch and verifies its remote SHA', () => {
    const f = fixture()
    const result = prepareUpdate(f.options)
    expect(result).toMatchObject({ changed: true, reused: false })
    expect(f.git('ls-remote', '--heads', 'origin', `refs/heads/${UPDATE_BRANCH}`)).toContain(result.sha)
    expect(f.git('diff', '--name-only', f.options.baseSha, result.sha)).toBe(DATA_PATH)
    expect(f.git('show', `${result.sha}:${DATA_PATH}`)).toBe(data(2).trim())
  })

  it('does nothing when generated data matches the default branch', () => {
    const f = fixture()
    writeFileSync(f.artifact, data(1))
    expect(prepareUpdate({ ...f.options, latestBuild: '1' })).toEqual({ changed: false })
    expect(f.git('ls-remote', '--heads', 'origin', `refs/heads/${UPDATE_BRANCH}`)).toBe('')
  })

  it('reuses an existing matching bot branch without a duplicate commit', () => {
    const f = fixture()
    updateCommit(f)
    const expected = f.git('rev-parse', UPDATE_BRANCH)
    expect(prepareUpdate(f.options)).toEqual({ changed: true, reused: true, sha: expected })
    expect(prepareUpdate(f.options).sha).toBe(expected)
  })

  it('refreshes an older bot update to newer validated data', () => {
    const f = fixture()
    updateCommit(f)
    writeFileSync(f.artifact, data(3))
    const result = prepareUpdate({ ...f.options, latestBuild: '3' })
    expect(result.reused).toBe(false)
    expect(f.git('show', `${result.sha}:${DATA_PATH}`)).toBe(data(3).trim())
  })

  it.each([
    { author: 'maintainer@example.invalid', extraFile: false },
    { author: BOT_EMAIL, extraFile: true }
  ])('refuses to overwrite non-automation work (%j)', options => {
    const f = fixture()
    updateCommit(f, options)
    const previous = f.git('rev-parse', UPDATE_BRANCH)
    expect(() => prepareUpdate(f.options)).toThrow('non-automation changes')
    expect(f.git('ls-remote', '--heads', 'origin', `refs/heads/${UPDATE_BRANCH}`)).toContain(previous)
  })

  it('refuses to publish against a default branch that moved after validation', () => {
    const f = fixture()
    writeFileSync(join(f.cwd, 'app.txt'), 'changed base\n')
    f.git('commit', '-am', 'Default branch advanced')
    f.git('push', 'origin', 'main')
    expect(() => prepareUpdate(f.options)).toThrow('default branch changed after validation')
  })

  it('refuses a stale or malformed SDE artifact before changing Git state', () => {
    const f = fixture()
    expect(() => prepareUpdate({ ...f.options, latestBuild: '3' })).toThrow('does not match')
    writeFileSync(f.artifact, data('2\nmalicious-output=true'))
    expect(() => prepareUpdate(f.options)).toThrow('Invalid SDE build number')
    expect(f.git('rev-parse', 'HEAD')).toBe(f.options.baseSha)
  })

  it.skipIf(process.platform === 'win32')('rejects concurrent creation with an explicit empty-ref lease', () => {
    const f = fixture()
    // Called after inspection when the publisher creates its local update branch.
    // Simulate another actor creating the remote branch before the push.
    const hook = join(f.cwd, '.git/hooks/post-checkout')
    writeFileSync(hook, `#!/bin/sh\nif [ "$(git branch --show-current)" = "${UPDATE_BRANCH}" ]; then\n  git --git-dir='${f.remote}' update-ref 'refs/heads/${UPDATE_BRANCH}' '${f.options.baseSha}'\nfi\n`)
    chmodSync(hook, 0o755)
    expect(() => prepareUpdate(f.options)).toThrow()
    expect(f.git('ls-remote', '--heads', 'origin', `refs/heads/${UPDATE_BRANCH}`)).toContain(f.options.baseSha)
  })
})

describe('SDE workflow inputs and review links', () => {
  it.each([undefined, null, 0, -1, 1.5, '123', '1\nchanged=true', Number.MAX_SAFE_INTEGER + 1])('rejects invalid build %j', buildNumber => {
    expect(() => readBuild({ source: { buildNumber } })).toThrow('Invalid SDE build number')
  })
  it('accepts a safe positive build number', () => expect(readBuild({ source: { buildNumber: 3586130 } })).toBe('3586130'))
  it('encodes slash-containing base and branch names in compare links', () => {
    const links = updateLinks('https://github.com', 'EzekielTheMad/FirstMate', 'claude/eve-online-desktop-app-nacu7i')
    expect(links.compare).toBe('https://github.com/EzekielTheMad/FirstMate/compare/claude%2Feve-online-desktop-app-nacu7i...automation%2Fupdate-eve-exploration-data?expand=1')
    expect(links.branch.endsWith('/tree/automation%2Fupdate-eve-exploration-data')).toBe(true)
  })
})
