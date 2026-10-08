import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractSection } from '../extract-changelog.mjs'

export function releaseNotes({ version, event, tag, changelog }) {
  if (event === 'push' && tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} must match package.json version v${version}`)
  }
  const notes = extractSection(changelog, version)
  if (!notes) throw new Error(`Missing release notes for ${version} in CHANGELOG.md`)
  return `${notes}\n\n### Installer verification\n\nThe Windows installer is currently unsigned. SHA256SUMS.txt can detect changed downloads, but does not verify the publisher's identity or replace a code signature.\n`
}

export function releaseAssetNames(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Unsupported release version')
  const installer = `FirstMate-${version}-setup.exe`
  const channel = version.split('-')[1]?.split('.')[0] || 'latest'
  return [installer, `${installer}.blockmap`, `${channel}.yml`]
}

export function writeChecksums(directory, version) {
  const files = releaseAssetNames(version)
  // Missing installers, differential-update blockmaps or update metadata are fatal.
  const hashes = files.map(file => `${createHash('sha256').update(readFileSync(resolve(directory, file))).digest('hex')}  ${file}`)
  writeFileSync(resolve(directory, 'SHA256SUMS.txt'), `${hashes.join('\n')}\n`)
  return files
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version
  if (process.argv[2] === 'notes') {
    process.stdout.write(releaseNotes({
      version, event: process.env.GITHUB_EVENT_NAME, tag: process.env.GITHUB_REF_NAME,
      changelog: readFileSync('CHANGELOG.md', 'utf8')
    }))
  } else if (process.argv[2] === 'checksums') {
    const files = writeChecksums('dist', version)
    if (process.argv[3]) {
      mkdirSync(process.argv[3], { recursive: true })
      for (const file of [...files, 'SHA256SUMS.txt']) {
        copyFileSync(resolve('dist', file), resolve(process.argv[3], file))
      }
    }
  } else {
    throw new Error('Usage: node scripts/ci/prepare-release.mjs notes|checksums')
  }
}
