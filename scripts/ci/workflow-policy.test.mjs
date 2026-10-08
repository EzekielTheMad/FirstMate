import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const workflow = name => readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8')

describe('workflow security boundaries', () => {
  it('pins every external GitHub action to a complete commit SHA', () => {
    const directory = new URL('../../.github/workflows/', import.meta.url)
    for (const name of readdirSync(directory).filter(name => name.endsWith('.yml'))) {
      const text = readFileSync(new URL(name, directory), 'utf8')
      for (const [, action] of text.matchAll(/\buses:\s*(\S+)/g)) {
        if (action.startsWith('./')) continue
        expect(action, `${name}: ${action}`).toMatch(/^actions\/[\w-]+@[a-f0-9]{40}$/)
      }
    }
  })

  it('never publishes from the manual release build, including a dispatch on a tag', () => {
    const release = workflow('release')
    const [build, publish] = release.split('\n  publish:\n')
    expect(build).toContain('electron-builder --win --publish never')
    expect(build).not.toContain('contents: write')
    expect(build).not.toContain('GH_TOKEN:')
    expect(release).not.toContain('--publish always')
    expect(publish).toContain("if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')")
    expect(publish).toContain('needs: windows')
    expect(publish).not.toMatch(/npm (?:ci|install|run)/)
  })

  it('requires release scanning, typechecking, and tests before packaging', () => {
    const release = workflow('release')
    expect(release).toContain('uses: ./.github/workflows/secret-scan.yml')
    expect(release).toContain('needs: secrets')
    const packaging = release.indexOf('electron-builder --win')
    for (const command of ['npm run typecheck', 'npm test', 'npm run build', 'prepare-release.mjs notes']) {
      expect(release.indexOf(command)).toBeGreaterThan(0)
      expect(release.indexOf(command)).toBeLessThan(packaging)
    }
    expect(release).toContain('sha256sum --check SHA256SUMS.txt')
    expect(release).toContain('if-no-files-found: error')
  })

  it('exposes the update branch without attempting Actions-forbidden PR creation', () => {
    const update = workflow('update-exploration-static-data')
    const [validate, publish] = update.split('\n  publish-branch:\n')
    expect(update).not.toContain('pull-requests: write')
    expect(update).not.toContain('gh pr')
    expect(validate).not.toContain('contents: write')
    expect(validate).toContain('ref: ${{ github.event.repository.default_branch }}')
    expect(validate).toContain('npm run typecheck')
    expect(validate).toContain('npm test')
    expect(publish).toContain('contents: write')
    expect(publish).not.toMatch(/npm (?:ci|install|run)/)
    expect(publish).toContain('ref: ${{ needs.validate.outputs.base_sha }}')
  })

  it('keeps secret scanning read-only and separate from fork code with write credentials', () => {
    const scan = workflow('secret-scan')
    expect(scan).toContain('contents: read')
    expect(scan).not.toContain(': write')
    expect(scan).not.toContain('pull_request_target')
    expect(scan).not.toMatch(/\$\{\{[^}]*secrets\./)
    expect(scan).toContain('fetch-depth: 0')
    expect(scan).toContain('persist-credentials: false')
    const installer = readFileSync(new URL('./scan-secrets.sh', import.meta.url), 'utf8')
    expect(installer).toContain('sha256sum --check --status')
    expect(installer).toContain('git --no-banner --redact --log-opts=--all')
  })
})
