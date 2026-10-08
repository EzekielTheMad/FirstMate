import { execFileSync } from 'node:child_process'
import { appendFileSync, copyFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DATA_PATH = 'src/shared/data/exploration-static.json'
export const UPDATE_BRANCH = 'automation/update-eve-exploration-data'
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'

export function readBuild(data) {
  const build = data?.source?.buildNumber
  if (!Number.isSafeInteger(build) || build <= 0) throw new Error('Invalid SDE build number')
  return String(build)
}

export function updateLinks(server, repository, base) {
  const repo = `${server}/${repository}`
  const comparison = `${encodeURIComponent(base)}...${encodeURIComponent(UPDATE_BRANCH)}`
  return {
    branch: `${repo}/tree/${encodeURIComponent(UPDATE_BRANCH)}`,
    compare: `${repo}/compare/${comparison}?expand=1`
  }
}

/** Publish only the previously validated data file. All Git calls use argument arrays. */
export function prepareUpdate({ cwd = process.cwd(), artifact, base, baseSha, latestBuild, remote = 'origin' }) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('check-ref-format', `refs/heads/${base}`)
  if (!/^[a-f0-9]{40}$/.test(baseSha)) throw new Error('Invalid validated base SHA')
  const generated = readFileSync(artifact, 'utf8')
  if (readBuild(JSON.parse(generated)) !== latestBuild) throw new Error('Downloaded SDE does not match the checked build')
  if (git('status', '--porcelain')) throw new Error('Publishing requires a clean checkout')

  git('fetch', '--no-tags', remote, `+refs/heads/${base}:refs/remotes/${remote}/${base}`)
  if (git('rev-parse', `refs/remotes/${remote}/${base}`) !== baseSha) {
    throw new Error('The default branch changed after validation. Rerun the workflow before publishing.')
  }
  git('checkout', '--detach', baseSha)
  if (generated === readFileSync(resolve(cwd, DATA_PATH), 'utf8')) return { changed: false }

  const branchRef = `refs/heads/${UPDATE_BRANCH}`
  // Network/auth failures are real failures, never mistaken for a missing branch.
  const listing = git('ls-remote', '--heads', remote, branchRef)
  const previous = listing ? listing.split(/\s+/)[0] : ''
  if (previous) {
    git('fetch', '--no-tags', remote, `+${branchRef}:refs/remotes/${remote}/${UPDATE_BRANCH}`)
    if (git('rev-parse', `refs/remotes/${remote}/${UPDATE_BRANCH}`) !== previous) {
      throw new Error('The update branch changed during inspection. Rerun the workflow.')
    }
    const common = git('merge-base', baseSha, previous)
    const paths = git('diff', '--name-only', common, previous).split('\n').filter(Boolean)
    const authors = git('log', '--format=%ae', `${common}..${previous}`).split('\n').filter(Boolean)
    if (paths.some(path => path !== DATA_PATH) || authors.some(author => author !== BOT_EMAIL)) {
      throw new Error('The reserved update branch contains non-automation changes. Review it manually; it was not overwritten.')
    }
    // Reuse the exact validated tree rather than creating duplicate commits on reruns.
    if (git('diff', '--name-only', baseSha, previous, '--', '.', `:(exclude)${DATA_PATH}`) === '' &&
        git('show', `${previous}:${DATA_PATH}`) === generated.trim()) {
      return { changed: true, reused: true, sha: previous }
    }
  }

  git('checkout', '-B', UPDATE_BRANCH, baseSha)
  copyFileSync(artifact, resolve(cwd, DATA_PATH))
  git('add', '--', DATA_PATH)
  git('-c', 'user.name=github-actions[bot]', '-c', `user.email=${BOT_EMAIL}`,
    'commit', '-m', `chore: update EVE exploration data to build ${latestBuild}`)
  const sha = git('rev-parse', 'HEAD')
  // The explicit lease protects against any changes since inspection, including creation races.
  git('push', `--force-with-lease=${branchRef}:${previous}`, remote, `HEAD:${branchRef}`)
  if (git('ls-remote', '--heads', remote, branchRef).split(/\s+/)[0] !== sha) {
    throw new Error('Could not verify the remote update branch after pushing')
  }
  return { changed: true, reused: false, sha }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = prepareUpdate({
    artifact: process.env.UPDATE_ARTIFACT,
    base: process.env.BASE_BRANCH,
    baseSha: process.env.VALIDATED_BASE_SHA,
    latestBuild: process.env.LATEST_BUILD
  })
  const links = updateLinks(process.env.GITHUB_SERVER_URL, process.env.GITHUB_REPOSITORY, process.env.BASE_BRANCH)
  const summary = result.changed
    ? `## EVE data update ready for review\n\n${result.reused ? 'Reused' : 'Pushed'} the validated [update branch](${links.branch}) at \`${result.sha}\`.\n\nType checking and the full test suite passed against base \`${process.env.VALIDATED_BASE_SHA}\`.\n\n[Compare changes and open a pull request](${links.compare}). If an open PR is already shown, review that PR instead. Choose **Create draft pull request** after reviewing the diff.\n\nNo pull request was created or edited by this workflow. Repository policy disables Actions-created PRs; no extra token or permission is needed.\n`
    : '## No exploration data changes\n\nThe generated file matches the default branch. No update branch was changed.\n'
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
}
