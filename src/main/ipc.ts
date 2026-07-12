import { ipcMain, BrowserWindow } from 'electron'
import { AppSettings, AdvisorGoal, ExplorationState, CombatSnapshot, AuthState } from '@shared/types'
import {
  getSettings,
  saveSettings,
  toPublicSettings,
  getExploration,
  saveExploration,
  getCombat,
  saveCombat
} from './store'
import { login, logout, getAuthState, onAuthChange } from './auth/sso'
import { fetchDashboard, fetchEconomy, fetchMining } from './esi/client'
import { askAdvisor } from './ai/advisor'
import { registerProtocol } from './protocol'
import {
  getUpdateState,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  onUpdateChange
} from './updater'
import type { UpdateState } from '@shared/types'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // Settings
  ipcMain.handle('settings:get', () => toPublicSettings(getSettings()))
  ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => {
    const saved = saveSettings(patch)
    // If the SSO callback scheme changed, re-register the OS protocol handler.
    if (patch.callbackScheme) registerProtocol(saved.callbackScheme)
    return toPublicSettings(saved)
  })

  // Auth
  ipcMain.handle('auth:login', () => login())
  ipcMain.handle('auth:logout', () => logout())
  ipcMain.handle('auth:getState', () => getAuthState())

  // Broadcast auth changes to the renderer
  onAuthChange((state: AuthState) => {
    getWindow()?.webContents.send('auth:changed', state)
  })

  // ESI
  ipcMain.handle('esi:dashboard', () => fetchDashboard())
  ipcMain.handle('esi:economy', () => fetchEconomy())
  ipcMain.handle('esi:mining', () => fetchMining())

  // Exploration (local)
  ipcMain.handle('exploration:get', () => getExploration())
  ipcMain.handle('exploration:save', (_e, state: ExplorationState) => saveExploration(state))

  // Combat (local)
  ipcMain.handle('combat:get', () => getCombat())
  ipcMain.handle('combat:save', (_e, snapshot: CombatSnapshot) => saveCombat(snapshot))

  // Advisor
  ipcMain.handle('advisor:ask', (_e, goal: AdvisorGoal) => askAdvisor(goal))

  // Updates (auth-independent)
  ipcMain.handle('updates:getState', () => getUpdateState())
  ipcMain.handle('updates:check', () => checkForUpdates())
  ipcMain.handle('updates:download', () => downloadUpdate())
  ipcMain.handle('updates:install', () => installUpdate())

  onUpdateChange((state: UpdateState) => {
    getWindow()?.webContents.send('updates:changed', state)
  })

  // Window
  ipcMain.handle('window:setCompact', (_e, compact: boolean) => {
    const win = getWindow()
    if (win) win.setResizable(!compact ? true : true) // keep resizable; hook reserved for future
  })
}
