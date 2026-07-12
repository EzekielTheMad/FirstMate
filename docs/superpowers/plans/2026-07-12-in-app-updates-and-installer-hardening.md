# In-App Updates & Installer Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give FirstMate an in-app, changelog-gated updater and make new installers reliably replace old versions, then cut a clean v0.1.3.

**Architecture:** A main-process `updater.ts` wraps `electron-updater` (auto-download off) and broadcasts an update-state machine over IPC, mirroring the existing auth pattern. The renderer shows a shell-level banner and a Settings → Updates panel (both auth-independent). Release notes come from an in-repo `CHANGELOG.md`, extracted by a small tested Node script and set as the GitHub Release body. NSIS config is locked to a single per-user location so installs deterministically replace prior versions.

**Tech Stack:** Electron 33, electron-vite, electron-builder (NSIS), electron-updater, React 18 + TypeScript, vitest (new, for one pure function), GitHub Actions.

**Key facts (verified against the repo):**
- Main process **bundles** dependencies inline (no `externalizeDepsPlugin`); electron-builder ships only `out/**` + `package.json`. Add `electron-updater` as a normal dependency and let it bundle — do **not** add an externalize plugin (it would break the current packaging).
- `electron-updater` only runs in a packaged app; dev is guarded by `app.isPackaged`.
- The release workflow already runs `electron-builder --publish always` (GitHub provider), which generates and uploads `latest.yml` + `app-update.yml` — the metadata the updater needs.
- Existing patterns to mirror: `onAuthChange`/listener registry in `src/main/auth/sso.ts`, the `auth:changed` broadcast in `src/main/ipc.ts`, the `auth` bridge in `src/preload/index.ts`, and the `auth.onChange` wiring in `src/renderer/src/App.tsx`.

---

## File Structure

- **Create** `scripts/extract-changelog.mjs` — pure `extractSection(md, version)` + CLI. Runs in CI.
- **Create** `scripts/extract-changelog.test.mjs` — vitest unit tests for the extractor.
- **Create** `CHANGELOG.md` — Keep-a-Changelog history, source of release notes.
- **Create** `src/main/updater.ts` — electron-updater wrapper + state machine + listener registry.
- **Create** `build/installer.nsh` — NSIS include that removes a legacy install before installing.
- **Modify** `src/shared/types.ts` — add `UpdateStatus`, `UpdateState`, and `FirstMateApi.updates`.
- **Modify** `src/main/ipc.ts` — updates IPC handlers + broadcast.
- **Modify** `src/main/index.ts` — call `initUpdater()` on ready.
- **Modify** `src/preload/index.ts` — expose the `updates` bridge.
- **Modify** `src/renderer/src/lib/hooks.ts` — add `useUpdates()`.
- **Modify** `src/renderer/src/App.tsx` — shell-level update banner.
- **Modify** `src/renderer/src/views/Settings.tsx` — Updates panel.
- **Modify** `electron-builder.yml` — lock install location + reference `installer.nsh`.
- **Modify** `.github/workflows/release.yml` — set release body from CHANGELOG on tag.
- **Modify** `package.json` — add deps, `test` script, bump to 0.1.3.

---

## Task 1: Add tooling (electron-updater + vitest + test script)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add dependencies and test script**

Edit `package.json`:
- Add to `"dependencies"`: `"electron-updater": "^6.6.2"` (keep `@anthropic-ai/sdk` as-is).
- Add to `"devDependencies"`: `"vitest": "^2.1.9"`.
- Add to `"scripts"`: `"test": "vitest run"`.

Resulting `dependencies` block:

```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.111.0",
  "electron-updater": "^6.6.2"
}
```

Add the script line next to the others:

```json
"test": "vitest run",
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: exits 0; `electron-updater` and `vitest` appear under `node_modules`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add electron-updater and vitest"
```

---

## Task 2: CHANGELOG extractor script (TDD)

**Files:**
- Create: `scripts/extract-changelog.mjs`
- Test: `scripts/extract-changelog.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/extract-changelog.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/extract-changelog.test.mjs`
Expected: FAIL — cannot resolve `./extract-changelog.mjs` / `extractSection` is not a function.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/extract-changelog.mjs`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/extract-changelog.test.mjs`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-changelog.mjs scripts/extract-changelog.test.mjs
git commit -m "feat: add tested CHANGELOG section extractor"
```

---

## Task 3: Seed CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create the changelog**

Create `CHANGELOG.md`:

```markdown
# Changelog

All notable changes to FirstMate are documented here. This file is the source
of the release notes shown in the app's updater.

## [0.1.3] - 2026-07-12

### Added
- In-app updates: FirstMate checks for a new version on launch and can download
  and install it from **Settings → Updates**, after showing you the changelog.
- A dismissible banner appears when an update is available.

### Changed
- Hardened the Windows installer so installing a new version always removes the
  previous one (no more coexisting installs).

## [0.1.2] - 2026-07-10

### Fixed
- Packaged app crashed on launch (`__dirname is not defined in ES module scope`);
  the main and preload processes are now built as CommonJS.

## [0.1.1] - 2026-07-09

### Fixed
- Packaged app opened no visible window; the renderer is now served over a custom
  `app://` scheme.

## [0.1.0] - 2026-07-08

### Added
- First release: EVE SSO login (PKCE), Dashboard, Economy, Mining, Exploration,
  Combat, and the AI Advisor.
```

- [ ] **Step 2: Verify the extractor reads it**

Run: `node scripts/extract-changelog.mjs 0.1.3`
Expected: prints the "### Added … ### Changed …" body of the 0.1.3 section (no heading line), exit 0.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG with history through 0.1.3"
```

---

## Task 4: Update-state types and API surface

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add the update types**

In `src/shared/types.ts`, add above the `// ---- IPC bridge surface` section:

```ts
// ---- Updates ---------------------------------------------------------------

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  /** Version currently running. */
  currentVersion: string
  /** Version available/being installed, when known. */
  newVersion?: string
  /** Markdown release notes for `newVersion`, when known. */
  releaseNotes?: string
  /** Download progress 0–100, when downloading. */
  percent?: number
  /** Human-readable error, when status is 'error'. */
  error?: string
}
```

- [ ] **Step 2: Add the `updates` surface to `FirstMateApi`**

In the `FirstMateApi` interface, add after the `advisor` block and before `window`:

```ts
  updates: {
    getState: () => Promise<UpdateState>
    check: () => Promise<UpdateState>
    download: () => Promise<UpdateState>
    install: () => Promise<void>
    onChange: (cb: (state: UpdateState) => void) => () => void
  }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no consumers yet).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add UpdateState types and updates API surface"
```

---

## Task 5: Updater backend (`src/main/updater.ts`)

**Files:**
- Create: `src/main/updater.ts`

- [ ] **Step 1: Write the updater module**

Create `src/main/updater.ts`:

```ts
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '@shared/types'

const { autoUpdater } = electronUpdater

const REPO = 'EzekielTheMad/FirstMate'

let state: UpdateState = { status: 'idle', currentVersion: app.getVersion() }
let listeners: Array<(s: UpdateState) => void> = []
let wired = false

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  for (const cb of listeners) {
    try {
      cb(state)
    } catch {
      /* ignore listener errors */
    }
  }
}

export function onUpdateChange(cb: (s: UpdateState) => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export function getUpdateState(): UpdateState {
  return state
}

/** True when the updater can run (packaged app, or dev override for testing). */
function updaterEnabled(): boolean {
  return app.isPackaged || Boolean(process.env.FIRSTMATE_DEV_UPDATE)
}

/** Best-effort fetch of a release's markdown body from the GitHub API. */
async function fetchReleaseNotes(version: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FirstMate' }
    })
    if (!res.ok) return undefined
    const json = (await res.json()) as { body?: string }
    const body = json.body?.trim()
    return body ? body : undefined
  } catch {
    return undefined
  }
}

function wire(): void {
  if (wired) return
  wired = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: undefined }))
  autoUpdater.on('update-available', async (info) => {
    const inline =
      typeof info.releaseNotes === 'string' && info.releaseNotes.trim()
        ? info.releaseNotes.trim()
        : undefined
    const notes = inline ?? (await fetchReleaseNotes(info.version))
    set({ status: 'available', newVersion: info.version, releaseNotes: notes })
  })
  autoUpdater.on('update-not-available', () =>
    set({ status: 'up-to-date', newVersion: undefined, releaseNotes: undefined })
  )
  autoUpdater.on('download-progress', (p) =>
    set({ status: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    set({ status: 'downloaded', newVersion: info.version, percent: 100 })
  )
  autoUpdater.on('error', (err) =>
    set({ status: 'error', error: err?.message ?? String(err) })
  )
}

/** Called once on app ready. No-op (silent) in dev. */
export function initUpdater(): void {
  if (!updaterEnabled()) return
  wire()
  if (process.env.FIRSTMATE_DEV_UPDATE) autoUpdater.forceDevUpdateConfig = true
  void autoUpdater.checkForUpdates().catch((e) =>
    set({ status: 'error', error: (e as Error).message })
  )
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!updaterEnabled()) {
    set({ status: 'error', error: 'Updates are only available in the installed app.' })
    return state
  }
  wire()
  if (process.env.FIRSTMATE_DEV_UPDATE) autoUpdater.forceDevUpdateConfig = true
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    set({ status: 'error', error: (e as Error).message })
  }
  return state
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!updaterEnabled()) return state
  wire()
  try {
    set({ status: 'downloading', percent: 0, error: undefined })
    await autoUpdater.downloadUpdate()
  } catch (e) {
    set({ status: 'error', error: (e as Error).message })
  }
  return state
}

export function installUpdate(): void {
  if (!updaterEnabled()) return
  // Quit and run the downloaded installer. isSilent=false shows the NSIS UI;
  // isForceRunAfter=true relaunches FirstMate afterward.
  autoUpdater.quitAndInstall(false, true)
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If `electron-updater`'s types complain about the default-import destructure, the `import electronUpdater from 'electron-updater'` + `const { autoUpdater } = electronUpdater` form shown above is the CJS-safe pattern — keep it.)

- [ ] **Step 3: Commit**

```bash
git add src/main/updater.ts
git commit -m "feat: add electron-updater backend with update-state machine"
```

---

## Task 6: Wire updater IPC + launch check

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add IPC handlers and broadcast**

In `src/main/ipc.ts`, add to the imports:

```ts
import {
  getUpdateState,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  onUpdateChange
} from './updater'
import type { UpdateState } from '@shared/types'
```

Then inside `registerIpc`, after the Advisor handler and before the Window handler, add:

```ts
  // Updates (auth-independent)
  ipcMain.handle('updates:getState', () => getUpdateState())
  ipcMain.handle('updates:check', () => checkForUpdates())
  ipcMain.handle('updates:download', () => downloadUpdate())
  ipcMain.handle('updates:install', () => installUpdate())

  onUpdateChange((state: UpdateState) => {
    getWindow()?.webContents.send('updates:changed', state)
  })
```

- [ ] **Step 2: Initialize the updater on ready**

In `src/main/index.ts`, add to the imports near the other `./` imports:

```ts
import { initUpdater } from './updater'
```

Inside the `app.whenReady().then(async () => { ... })` block, after `await restoreSession()` (in its try/catch is fine; place it right after the `try { await restoreSession() } catch {}` block):

```ts
    initUpdater()
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS; `out/main/index.js` rebuilds without errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts src/main/index.ts
git commit -m "feat: wire updater IPC handlers and launch-time check"
```

---

## Task 7: Preload bridge for updates

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the `updates` bridge**

In `src/preload/index.ts`, add `UpdateState` to the type import:

```ts
import type {
  FirstMateApi,
  AppSettings,
  ExplorationState,
  CombatSnapshot,
  AdvisorGoal,
  AuthState,
  UpdateState
} from '@shared/types'
```

Add the `updates` object to the `api` literal, after `advisor` and before `window`:

```ts
  updates: {
    getState: () => ipcRenderer.invoke('updates:getState'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    onChange: (cb: (state: UpdateState) => void) => {
      const listener = (_e: unknown, state: UpdateState): void => cb(state)
      ipcRenderer.on('updates:changed', listener)
      return () => ipcRenderer.removeListener('updates:changed', listener)
    }
  },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose updates bridge in preload"
```

---

## Task 8: `useUpdates` hook

**Files:**
- Modify: `src/renderer/src/lib/hooks.ts`

- [ ] **Step 1: Add the hook**

In `src/renderer/src/lib/hooks.ts`, add these imports at the top (merge with the existing React import line):

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdateState } from '@shared/types'
```

Append at the end of the file:

```ts
/** Subscribe to update-state changes from the main process. */
export function useUpdates(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    window.firstmate.updates.getState().then(setState)
    const off = window.firstmate.updates.onChange(setState)
    return off
  }, [])
  return state
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/hooks.ts
git commit -m "feat: add useUpdates renderer hook"
```

---

## Task 9: Settings → Updates panel

**Files:**
- Modify: `src/renderer/src/views/Settings.tsx`

- [ ] **Step 1: Import the hook, markdown renderer, and update helpers**

In `src/renderer/src/views/Settings.tsx`, update the imports at the top:

```ts
import { useEffect, useState } from 'react'
import { Panel } from '../components/ui'
import { renderMarkdown } from '../lib/format'
import { useUpdates } from '../lib/hooks'
import type { PublicSettings } from '@shared/types'
```

- [ ] **Step 2: Add an `UpdatesPanel` component**

Add this component at the bottom of `src/renderer/src/views/Settings.tsx` (after the `Settings` function):

```tsx
function UpdatesPanel(): JSX.Element {
  const state = useUpdates()

  async function check(): Promise<void> {
    await window.firstmate.updates.check()
  }
  async function download(): Promise<void> {
    await window.firstmate.updates.download()
  }
  function install(): void {
    window.firstmate.updates.install()
  }

  const status = state?.status ?? 'idle'
  const version = state?.currentVersion ?? '—'

  return (
    <Panel
      title="Updates"
      actions={
        <button className="btn sm" onClick={check} disabled={status === 'checking'}>
          {status === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
      }
    >
      <div className="row">
        <span className="dim">Current version</span>
        <span className="grow" />
        <span className="mono">v{version}</span>
      </div>

      {status === 'up-to-date' && (
        <div className="hint" style={{ marginTop: 8 }}>
          You’re on the latest version.
        </div>
      )}

      {status === 'error' && state?.error && (
        <div className="hint" style={{ marginTop: 8 }}>
          Couldn’t check for updates: {state.error}
        </div>
      )}

      {(status === 'available' || status === 'downloading' || status === 'downloaded') &&
        state?.newVersion && (
          <div style={{ marginTop: 12 }}>
            <div className="row">
              <strong>Version {state.newVersion} available</strong>
              <span className="grow" />
              <span className="chip accent">new</span>
            </div>

            {state.releaseNotes ? (
              <div
                className="md"
                style={{ marginTop: 8 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(state.releaseNotes) }}
              />
            ) : (
              <div className="hint" style={{ marginTop: 8 }}>
                Release notes unavailable.
              </div>
            )}

            <div className="actions" style={{ marginTop: 12 }}>
              {status === 'available' && (
                <button className="btn primary" onClick={download}>
                  Download &amp; install
                </button>
              )}
              {status === 'downloading' && (
                <button className="btn primary" disabled>
                  Downloading… {state.percent ?? 0}%
                </button>
              )}
              {status === 'downloaded' && (
                <button className="btn primary" onClick={install}>
                  Restart &amp; install
                </button>
              )}
            </div>
          </div>
        )}
    </Panel>
  )
}
```

- [ ] **Step 3: Render `UpdatesPanel` inside `Settings`**

In the `Settings` component's returned JSX, add `<UpdatesPanel />` as the first element right after the opening `<>` (above the `EVE SSO` panel):

```tsx
  return (
    <>
      <UpdatesPanel />
      <Panel title="EVE SSO">
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/Settings.tsx
git commit -m "feat: add Updates panel with changelog to Settings"
```

---

## Task 10: Shell-level update banner

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Import the hook**

In `src/renderer/src/App.tsx`, update the imports:

```ts
import { useEffect, useState } from 'react'
import type { AuthState, PublicSettings } from '@shared/types'
import { useUpdates } from './lib/hooks'
```

- [ ] **Step 2: Read update state and render the banner**

Inside `App`, after the existing `const [tab, setTab] = useState<TabId>('dashboard')` line, add:

```ts
  const updates = useUpdates()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const updateReady =
    !bannerDismissed &&
    (updates?.status === 'available' || updates?.status === 'downloaded') &&
    Boolean(updates?.newVersion)
```

Then, in the returned JSX, add the banner immediately after the opening `<div className="app">` and before `<div className="topbar">`:

```tsx
      {updateReady && (
        <div
          className="update-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            background: 'var(--accent-soft, rgba(56,189,248,0.15))',
            borderBottom: '1px solid var(--border-soft)',
            fontSize: 13
          }}
        >
          <span>
            FirstMate <strong>v{updates?.newVersion}</strong> is available.
          </span>
          <span className="grow" style={{ flex: 1 }} />
          <button className="btn sm primary" onClick={() => setTab('settings')}>
            View &amp; install
          </button>
          <button
            className="btn sm"
            aria-label="Dismiss"
            onClick={() => setBannerDismissed(true)}
          >
            ✕
          </button>
        </div>
      )}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 4: Manual smoke (dev, no real update)**

Run: `npm run dev`
Expected: app launches as before; **no** banner (dev has no update); Settings → Updates shows "Current version v0.1.2" (pre-bump) and, on "Check for updates", the message "Updates are only available in the installed app." Close the app when done.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: add dismissible update banner to app shell"
```

---

## Task 11: Harden the NSIS installer

**Files:**
- Modify: `electron-builder.yml`
- Create: `build/installer.nsh`

- [ ] **Step 1: Lock the install location and reference the include**

In `electron-builder.yml`, change the `nsis` block to:

```yaml
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: false
  createDesktopShortcut: true
  createStartMenuShortcut: true
  include: build/installer.nsh
```

(Only `allowToChangeInstallationDirectory` changes from `true` to `false`, plus the new `include` line. Leave `appId: com.firstmate.app` untouched — it must stay stable.)

- [ ] **Step 2: Create the NSIS include**

Create `build/installer.nsh`:

```nsis
; Remove any previously-installed FirstMate before installing this version.
; electron-builder already replaces a same-scope per-user install; this also
; clears a legacy per-machine install (older builds landed in Program Files).
!macro customInit
  ; UNINSTALL_APP_KEY is only the GUID key name (see app-builder-lib NsisTarget.js);
  ; the actual uninstall entry lives under the standard Uninstall path, exactly as
  ; electron-builder's own multiUser.nsh composes it.
  ClearErrors
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "QuietUninstallString"
  ${ifNot} $0 == ""
    DetailPrint "Removing a previous FirstMate installation (per-machine)..."
    ExecWait '$0'
  ${endif}
!macroend
```

- [ ] **Step 3: Build the installer locally**

Run: `npm run package:dir`
Expected: exits 0; produces `dist/win-unpacked/FirstMate.exe`. (`package:dir` skips the full NSIS packaging but validates the build + electron-builder config parse. If `include`/`${UNINSTALL_APP_KEY}` is rejected, it surfaces here.)

Then run the full installer build to validate NSIS compiles the include:

Run: `npm run package`
Expected: exits 0; produces `dist/FirstMate-<version>-setup.exe`. NSIS compiles `installer.nsh` without error.

> **Local-build note (this machine):** the full `npm run package` cannot run on a
> non-admin Windows account without Developer Mode — electron-builder fails while
> extracting `winCodeSign` (`Cannot create symbolic link: A required privilege is
> not held`). This is pre-existing and unrelated to our change; the NSIS include is
> compiled for real by CI on `windows-latest` at tag time. Locally, validate with
> `npm run typecheck && npm run build` and a YAML parse of `electron-builder.yml`.
>
> **Registry key:** `${UNINSTALL_APP_KEY}` is only the GUID key *name*, not a full
> path (confirmed in `app-builder-lib/out/targets/nsis/NsisTarget.js` and its own
> `templates/nsis/multiUser.nsh`, which composes
> `"Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"`).
> The `ReadRegStr` above uses that full path.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml build/installer.nsh
git commit -m "build: harden NSIS to always remove the previous install"
```

---

## Task 12: Release workflow sets notes from CHANGELOG

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add a release-notes step after the publish step**

In `.github/workflows/release.yml`, after the "Build installer (and publish on tag)" step and before "Upload installer artifact", add:

```yaml
      - name: Set release notes from CHANGELOG (tag builds only)
        if: startsWith(github.ref, 'refs/tags/v')
        shell: bash
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          node scripts/extract-changelog.mjs "$VERSION" > RELEASE_NOTES.md
          gh release edit "$GITHUB_REF_NAME" --notes-file RELEASE_NOTES.md
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Rationale: the publish step (`electron-builder --publish always`) has already created the GitHub Release for the tag; this step overwrites its body with the exact CHANGELOG section, which `electron-updater` then surfaces to the app.

- [ ] **Step 2: Sanity-check the extractor command locally**

Run: `node scripts/extract-changelog.mjs 0.1.3 CHANGELOG.md`
Expected: prints the 0.1.3 section body, exit 0 (this is the same command the workflow runs).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: set GitHub Release notes from CHANGELOG on tag"
```

---

## Task 13: Bump to 0.1.3 and final verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "0.1.2"` to `"version": "0.1.3"`.

- [ ] **Step 2: Full verification**

Run: `npm run typecheck && npm run build && npm test`
Expected: typecheck PASS, build PASS, vitest PASS (extractor tests green).

- [ ] **Step 3: Confirm the version shows in the app**

Run: `npm run dev`
Expected: Settings → Updates shows "Current version **v0.1.3**". Close the app.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.1.3"
```

---

## Task 14: Manual packaged update test (pre-release gate)

No code changes — this validates the end-to-end updater before cutting the real release. Do this once the branch is built.

**Files:** none.

- [ ] **Step 1: Build the current (0.1.3) installer and install it**

Run: `npm run package`
Then install `dist/FirstMate-0.1.3-setup.exe`. Launch it once and confirm Settings → Updates shows v0.1.3 and "You’re on the latest version" is **not** shown yet (no feed configured locally).

- [ ] **Step 2: Stage a fake newer release locally**

- Temporarily bump `package.json` to `0.1.4`, run `npm run package` again to produce `dist/latest.yml`, `dist/FirstMate-0.1.4-setup.exe`, and the blockmap.
- Copy those three files into a local folder and serve it: `npx --yes http-server ./that-folder -p 8080`.
- Create `dev-app-update.yml` at the installed app's resources path (or set the app to read it) pointing at `http://localhost:8080`:

```yaml
provider: generic
url: http://localhost:8080
```

- Launch the installed 0.1.3 app with `FIRSTMATE_DEV_UPDATE=1` so `forceDevUpdateConfig` is used.

- [ ] **Step 2 note (release-notes source):** the generic/local feed does not exercise the GitHub release-notes fetch. Confirm the changelog render path separately by checking that `updates.releaseNotes` is populated from a real GitHub release, OR by temporarily hardcoding a `releaseNotes` string in `latest.yml`. The real end-to-end release-notes delivery is verified on the first live tag (Step 4).

- [ ] **Step 3: Walk the flow**

Expected in the installed 0.1.3 app:
1. Banner appears: "FirstMate v0.1.4 is available".
2. Settings → Updates shows the changelog (or the "Release notes unavailable" fallback for the generic feed).
3. "Download & install" shows progress, then "Restart & install".
4. Clicking it relaunches into v0.1.4.

Revert `package.json` back to `0.1.3` and delete `dev-app-update.yml` afterward.

- [ ] **Step 4: Live release (when ready — separate, user-triggered)**

Tag and push `v0.1.3`; the workflow builds, publishes, and sets the release body from CHANGELOG. Then confirm a real update is offered to an installed older version, with the changelog rendered from the GitHub release body. (This step is the user's call — it publishes publicly.)

---

## Self-Review Notes

- **Spec coverage:** A (Tasks 11) · B (Task 5) · C (Tasks 4, 6, 7) · D (Tasks 8, 9, 10) · E (Tasks 2, 3, 12) · F (Tasks 1, 13, 14). Auth-independence: Updates panel lives in the un-gated Settings tab; banner is rendered in the app shell outside `needsAuth` (Tasks 9, 10). ✅
- **Type consistency:** `UpdateState`/`UpdateStatus` defined in Task 4 are used identically in `updater.ts` (Task 5), IPC (Task 6), preload (Task 7), hook (Task 8), and UI (Tasks 9–10). Method names `getState/check/download/install/onChange` match across API, preload, and IPC channel names `updates:getState|check|download|install|changed`. ✅
- **No placeholders:** every code step includes complete code; the only manual steps (installer build, packaged update test, live release) are inherently non-unit-testable and include exact commands + expected results. ✅
- **Known risk:** GitHub release-notes delivery to `info.releaseNotes` is provider-dependent; `updater.ts` already falls back to fetching the release body via the GitHub API, so the changelog renders regardless. Verified live at Task 14 Step 4.
