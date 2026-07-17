import { contextBridge, ipcRenderer } from 'electron'
import type {
  FirstMateApi,
  AppSettings,
  ExplorationState,
  CombatSnapshot,
  AdvisorGoal,
  AuthState,
  UpdateState
} from '@shared/types'

const api: FirstMateApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch)
  },
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getState: () => ipcRenderer.invoke('auth:getState'),
    onChange: (cb: (state: AuthState) => void) => {
      const listener = (_e: unknown, state: AuthState): void => cb(state)
      ipcRenderer.on('auth:changed', listener)
      return () => ipcRenderer.removeListener('auth:changed', listener)
    }
  },
  esi: {
    dashboard: () => ipcRenderer.invoke('esi:dashboard'),
    explorationContext: () => ipcRenderer.invoke('esi:explorationContext'),
    economy: () => ipcRenderer.invoke('esi:economy'),
    mining: () => ipcRenderer.invoke('esi:mining'),
    assets: () => ipcRenderer.invoke('esi:assets'),
    materials: () => ipcRenderer.invoke('esi:materials'),
    ships: () => ipcRenderer.invoke('esi:ships'),
    industry: () => ipcRenderer.invoke('esi:industry'),
    clones: () => ipcRenderer.invoke('esi:clones')
  },
  exploration: {
    get: () => ipcRenderer.invoke('exploration:get'),
    save: (state: ExplorationState) => ipcRenderer.invoke('exploration:save', state)
  },
  combat: {
    get: () => ipcRenderer.invoke('combat:get'),
    save: (snapshot: CombatSnapshot) => ipcRenderer.invoke('combat:save', snapshot)
  },
  advisor: {
    ask: (goal: AdvisorGoal) => ipcRenderer.invoke('advisor:ask', goal),
    testConnection: () => ipcRenderer.invoke('advisor:testConnection'),
    getHistory: () => ipcRenderer.invoke('advisor:getHistory'),
    deleteHistory: (id: string) => ipcRenderer.invoke('advisor:deleteHistory', id),
    clearHistory: () => ipcRenderer.invoke('advisor:clearHistory')
  },
  mcp: {
    getStatus: () => ipcRenderer.invoke('mcp:getStatus'),
    listAssetLocations: () => ipcRenderer.invoke('mcp:listAssetLocations')
  },
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
  window: {
    setZoom: (factor: number) => ipcRenderer.invoke('window:setZoom', factor)
  }
}

contextBridge.exposeInMainWorld('firstmate', api)
