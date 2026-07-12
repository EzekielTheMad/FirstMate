import { contextBridge, ipcRenderer } from 'electron'
import type {
  FirstMateApi,
  AppSettings,
  ExplorationState,
  CombatSnapshot,
  AdvisorGoal,
  AuthState
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
    economy: () => ipcRenderer.invoke('esi:economy'),
    mining: () => ipcRenderer.invoke('esi:mining')
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
    ask: (goal: AdvisorGoal) => ipcRenderer.invoke('advisor:ask', goal)
  },
  window: {
    setCompact: (compact: boolean) => ipcRenderer.invoke('window:setCompact', compact)
  }
}

contextBridge.exposeInMainWorld('firstmate', api)
