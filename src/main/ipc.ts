import { ipcMain, BrowserWindow } from 'electron'
import {
  AppSettings,
  AdvisorGoal,
  ExplorationState,
  CombatSnapshot,
  AuthState,
  UpdateState
} from '@shared/types'
import {
  getSettings,
  saveSettings,
  toPublicSettings,
  getExploration,
  saveExploration,
  getCombat,
  saveCombat,
  getAdvisorHistory,
  deleteAdvisorHistory,
  clearAdvisorHistory
} from './store'
import { login, logout, getAuthState, onAuthChange } from './auth/sso'
import {
  fetchDashboard,
  fetchExplorationContext,
  fetchEconomy,
  fetchMining,
  fetchAssets,
  fetchMaterials,
  fetchShips,
  fetchIndustryJobs,
  fetchClones
} from './esi/client'
import { askAdvisor } from './ai/advisor'
import { testAdvisorConnection } from './ai/providers'
import { configureMcpServer, getMcpServerStatus } from './mcp/server'
import { listAssetLocations } from './mcp/tools'
import { registerProtocol } from './protocol'
import {
  getUpdateState,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  onUpdateChange
} from './updater'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // Settings
  ipcMain.handle('settings:get', () => toPublicSettings(getSettings()))
  ipcMain.handle('settings:update', async (_e, patch: Partial<AppSettings>) => {
    const saved = saveSettings(patch)
    // If the SSO callback scheme changed, re-register the OS protocol handler.
    if (patch.callbackScheme) registerProtocol(saved.callbackScheme)
    if (
      patch.mcpEnabled !== undefined ||
      patch.mcpAllowLan !== undefined ||
      patch.mcpPort !== undefined ||
      patch.mcpApiKey !== undefined
    ) {
      await configureMcpServer(saved)
    }
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
  ipcMain.handle('esi:explorationContext', () => fetchExplorationContext())
  ipcMain.handle('esi:economy', () => fetchEconomy())
  ipcMain.handle('esi:mining', () => fetchMining())
  ipcMain.handle('esi:assets', () => fetchAssets())
  ipcMain.handle('esi:materials', () => fetchMaterials())
  ipcMain.handle('esi:ships', () => fetchShips())
  ipcMain.handle('esi:industry', () => fetchIndustryJobs())
  ipcMain.handle('esi:clones', () => fetchClones())

  // Exploration (local)
  ipcMain.handle('exploration:get', () => getExploration())
  ipcMain.handle('exploration:save', (_e, state: ExplorationState) => saveExploration(state))

  // Combat (local)
  ipcMain.handle('combat:get', () => getCombat())
  ipcMain.handle('combat:save', (_e, snapshot: CombatSnapshot) => saveCombat(snapshot))

  // Advisor
  ipcMain.handle('advisor:ask', (_e, goal: AdvisorGoal) => askAdvisor(goal))
  ipcMain.handle('advisor:testConnection', () => testAdvisorConnection(getSettings()))
  ipcMain.handle('advisor:getHistory', () => getAdvisorHistory())
  ipcMain.handle('advisor:deleteHistory', (_e, id: string) => deleteAdvisorHistory(id))
  ipcMain.handle('advisor:clearHistory', () => clearAdvisorHistory())

  // Read-only MCP bridge used by Hermes/Discord.
  ipcMain.handle('mcp:getStatus', () => getMcpServerStatus())
  ipcMain.handle('mcp:listAssetLocations', () => listAssetLocations())

  // Updates (auth-independent)
  ipcMain.handle('updates:getState', () => getUpdateState())
  ipcMain.handle('updates:check', () => checkForUpdates())
  ipcMain.handle('updates:download', () => downloadUpdate())
  ipcMain.handle('updates:install', () => installUpdate())

  onUpdateChange((state: UpdateState) => {
    getWindow()?.webContents.send('updates:changed', state)
  })

  // Window
  ipcMain.handle('window:setZoom', (_e, factor: number) => {
    saveSettings({ zoomFactor: factor })
    getWindow()?.webContents.setZoomFactor(factor)
  })
}
