import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '@shared/types'

const { autoUpdater } = electronUpdater

const REPO = 'EzekielTheMad/FirstMate'

let state: UpdateState = { status: 'idle', currentVersion: app.getVersion() }
let listeners: Array<(s: UpdateState) => void> = []
let wired = false
/** True while the silent launch-time check is in flight; its errors are swallowed. */
let suppressNextError = false

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
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FirstMate' },
      signal: AbortSignal.timeout(8000)
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
  autoUpdater.on('update-available', (info) => {
    suppressNextError = false
    // Surface availability immediately; fill in release notes without blocking so a
    // slow/stalled GitHub fetch can never wedge the state machine in 'checking'.
    set({ status: 'available', newVersion: info.version, releaseNotes: undefined })
    // Prefer the GitHub release's raw markdown body — the renderer renders
    // markdown. electron-updater's info.releaseNotes is pre-rendered HTML, which
    // the markdown renderer would escape and show as literal tags. Fall back to
    // info.releaseNotes only if the API body isn't available and it looks like
    // plain text (no HTML tags).
    void fetchReleaseNotes(info.version).then((notes) => {
      if (state.newVersion !== info.version) return
      const fallback =
        typeof info.releaseNotes === 'string' && !/<[a-z][\s\S]*>/i.test(info.releaseNotes)
          ? info.releaseNotes.trim()
          : undefined
      const md = notes ?? fallback
      if (md) set({ releaseNotes: md })
    })
  })
  autoUpdater.on('update-not-available', () => {
    suppressNextError = false
    set({ status: 'up-to-date', newVersion: undefined, releaseNotes: undefined })
  })
  autoUpdater.on('download-progress', (p) =>
    set({ status: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    set({ status: 'downloaded', newVersion: info.version, percent: 100 })
  )
  autoUpdater.on('error', (err) => {
    // Swallow the silent launch check's error so an offline start doesn't surface
    // a spurious "couldn't check for updates" the user never triggered.
    if (suppressNextError) {
      suppressNextError = false
      if (state.status === 'checking') set({ status: 'idle', error: undefined })
      return
    }
    set({ status: 'error', error: err?.message ?? String(err) })
  })
}

/** Called once on app ready. No-op (silent) in dev. */
export function initUpdater(): void {
  if (!updaterEnabled()) return
  wire()
  if (process.env.FIRSTMATE_DEV_UPDATE) autoUpdater.forceDevUpdateConfig = true
  suppressNextError = true
  void autoUpdater.checkForUpdates().catch(() => {
    // Silent launch check — any error is handled (swallowed) by the 'error' listener.
  })
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!updaterEnabled()) {
    set({ status: 'error', error: 'Updates are only available in the installed app.' })
    return state
  }
  wire()
  if (process.env.FIRSTMATE_DEV_UPDATE) autoUpdater.forceDevUpdateConfig = true
  suppressNextError = false
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
  suppressNextError = false
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
