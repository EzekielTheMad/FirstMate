import type { ExplorationState, FirstMateApi, PublicSettings, UpdateState } from '@shared/types'

const now = Date.now()
let exploration: ExplorationState = {
  schemaVersion: 3,
  activeMapId: 'map-demo',
  showSiteGuidance: true,
  helpDismissed: true,
  maps: [{
    id: 'map-demo',
    name: 'Maurasi expedition',
    rootSystemId: 'maurasi',
    activeSystemId: 'j100724',
    createdAt: now - 3_600_000,
    updatedAt: now,
    systems: [
      { id: 'maurasi', solarSystemId: 30000144, name: 'Maurasi', systemClass: 'HS', signatures: [{ id: 'sig-1', sigId: 'ABC-123', group: 'wormhole', name: 'Unstable Wormhole', wormholeType: 'R943', life: 'over-day', mass: 'stable', destinationSystemId: 'j152801', createdAt: now, updatedAt: now }], createdAt: now, updatedAt: now },
      { id: 'j152801', name: 'J152801', systemClass: 'C2', effect: 'Wolf-Rayet', signatures: [{ id: 'sig-2', sigId: 'DEF-456', group: 'wormhole', name: 'Unstable Wormhole', wormholeType: 'O477', life: 'under-day', mass: 'reduced', destinationSystemId: 'j151045', createdAt: now, updatedAt: now }], createdAt: now, updatedAt: now },
      { id: 'j151045', name: 'J151045', systemClass: 'C3', signatures: [{ id: 'sig-3', sigId: 'GHI-789', group: 'wormhole', name: 'Unstable Wormhole', wormholeType: 'X877', life: 'under-4h', mass: 'critical', destinationSystemId: 'j100724', createdAt: now, updatedAt: now }, { id: 'sig-4', sigId: 'JKL-012', group: 'wormhole', name: 'Unstable Wormhole', destinationSystemId: 'laic', createdAt: now, updatedAt: now }], createdAt: now, updatedAt: now },
      { id: 'j100724', name: 'J100724', systemClass: 'C5', effect: 'Pulsar', signatures: [{ id: 'sig-5', sigId: 'MNO-345', group: 'relic', name: 'Forgotten Core Data Field', createdAt: now, updatedAt: now }], createdAt: now, updatedAt: now },
      { id: 'laic', solarSystemId: 30045328, name: 'Laic', systemClass: 'HS', signatures: [], createdAt: now, updatedAt: now }
    ]
  }, {
    id: 'map-home',
    name: 'Home static',
    systems: [],
    createdAt: now - 86_400_000,
    updatedAt: now - 86_400_000
  }]
}

const noChange = (): (() => void) => () => undefined
const publicSettings = { autoRefreshSeconds: 0, advisorReady: false, advisorProvider: 'disabled' } as PublicSettings
const updates: UpdateState = { status: 'idle', currentVersion: '0.1.19' }

export function installFirstMateMock(): void {
  window.firstmate = {
    auth: {
      getState: async () => ({ status: 'logged-out' }),
      login: async () => ({ status: 'logged-out' }),
      logout: async () => ({ status: 'logged-out' }),
      onChange: noChange
    },
    settings: { get: async () => publicSettings },
    updates: { getState: async () => updates, onChange: noChange },
    exploration: {
      get: async () => exploration,
      save: async (state: ExplorationState) => {
        exploration = state
        return state
      }
    },
    esi: {
      explorationContext: async () => ({ ok: true, data: { solarSystemId: 31000750, solarSystemName: 'J100724', observedAt: Date.now() } })
    }
  } as unknown as FirstMateApi
}
