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
