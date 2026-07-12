/**
 * Shared types used across the main process, preload bridge, and renderer.
 */

export interface AppSettings {
  /** EVE developer application Client ID (register at developers.eveonline.com). */
  ssoClientId: string
  /**
   * Custom URL scheme used for the SSO callback. EVE's developer portal only
   * accepts https or a custom scheme starting with "eveauth" (lower-case
   * letters, digits, +, ., or -). The redirect URI is `${scheme}://callback`.
   */
  callbackScheme: string
  /** Anthropic API key for the AI Advisor (kept encrypted at rest). */
  anthropicApiKey: string
  /** Anthropic model id for the AI Advisor. */
  advisorModel: string
  /** UI theme accent. */
  accent: string
  /** Whether the window should be frameless/compact (portrait-monitor friendly). */
  compactMode: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  // Shipped Client ID so friends can just install and log in — no EVE developer
  // registration needed. This is a PKCE (public) client, so the Client ID is
  // not a secret. Override it in Settings to use your own EVE application.
  ssoClientId: 'b830c7783f08444d9b12465296aa219d',
  callbackScheme: 'eveauth-firstmate',
  anthropicApiKey: '',
  advisorModel: 'claude-opus-4-8',
  accent: '#38bdf8',
  compactMode: false
}

/** Redacted view of settings sent to the renderer (never exposes secrets). */
export interface PublicSettings {
  ssoClientId: string
  callbackScheme: string
  advisorModel: string
  accent: string
  compactMode: boolean
  /** True if an Anthropic key is stored, without revealing it. */
  hasAnthropicKey: boolean
}

export interface CharacterIdentity {
  characterId: number
  characterName: string
  /** Scopes granted at login. */
  scopes: string[]
  /** Token expiry (epoch ms). */
  expiresAt: number
  portrait?: string
}

export interface AuthState {
  status: 'logged-out' | 'logging-in' | 'logged-in' | 'error'
  identity?: CharacterIdentity
  error?: string
}

export interface EsiResult<T> {
  ok: boolean
  data?: T
  error?: string
  /** True when the failure was due to missing/insufficient scopes. */
  scopeError?: boolean
}

// ---- Domain shapes (subset of ESI, plus derived fields) --------------------

export interface DashboardData {
  identity: CharacterIdentity
  online: boolean
  walletBalance: number
  location: {
    solarSystemId: number
    solarSystemName?: string
    regionName?: string
    security?: number
    stationOrStructure?: string
  }
  ship: {
    typeId: number
    typeName?: string
    name?: string
  }
  skillPoints: number
  skillQueueCount: number
  nextSkill?: {
    name?: string
    finishesAt?: string
    level: number
  }
}

export interface WalletJournalEntry {
  id: number
  date: string
  refType: string
  amount: number
  balance?: number
  description: string
}

export interface MarketOrder {
  orderId: number
  typeId: number
  typeName?: string
  isBuyOrder: boolean
  price: number
  volumeRemain: number
  volumeTotal: number
  regionId: number
  issued: string
}

export interface EconomyData {
  walletBalance: number
  journal: WalletJournalEntry[]
  orders: MarketOrder[]
}

export interface MiningLedgerEntry {
  date: string
  solarSystemId: number
  solarSystemName?: string
  typeId: number
  typeName?: string
  quantity: number
  /** Estimated ISK value (Jita sell reference, best-effort). */
  estimatedValue?: number
}

export interface MiningData {
  entries: MiningLedgerEntry[]
  totalQuantity: number
  totalEstimatedValue: number
}

/** A wormhole/exploration chain is local-only — ESI does not expose connections. */
export interface WormholeSignature {
  id: string
  /** In-game signature identifier, e.g. "ABC-123". */
  sigId: string
  /** cosmic signature group: wormhole, relic, data, gas, combat. */
  group: 'wormhole' | 'relic' | 'data' | 'gas' | 'combat' | 'unknown'
  name: string
  /** For wormholes: destination class / type, e.g. "C3", "HS", "K162". */
  destination?: string
  /** For wormholes: mass/life status. */
  status?: 'stable' | 'reduced' | 'critical' | 'eol' | 'fresh'
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface WormholeSystem {
  id: string
  /** Solar system name or J-code, entered by the player. */
  name: string
  /** e.g. "C3", "HS", "LS", "NS". */
  systemClass?: string
  signatures: WormholeSignature[]
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface ExplorationState {
  systems: WormholeSystem[]
  activeSystemId?: string
}

export interface CombatSnapshot {
  /** Locally tracked fittings / targets / notes (ESI has no live combat feed). */
  notes: string
  fits: CombatFit[]
}

export interface CombatFit {
  id: string
  name: string
  shipType: string
  role: string
  eft?: string
  notes?: string
  createdAt: number
}

export interface AdvisorGoal {
  goal: string
  focus?: string
}

export interface AdvisorResponse {
  ok: boolean
  advice?: string
  error?: string
}

// ---- IPC bridge surface ----------------------------------------------------

export interface FirstMateApi {
  settings: {
    get: () => Promise<PublicSettings>
    update: (patch: Partial<AppSettings>) => Promise<PublicSettings>
  }
  auth: {
    login: () => Promise<AuthState>
    logout: () => Promise<AuthState>
    getState: () => Promise<AuthState>
    onChange: (cb: (state: AuthState) => void) => () => void
  }
  esi: {
    dashboard: () => Promise<EsiResult<DashboardData>>
    economy: () => Promise<EsiResult<EconomyData>>
    mining: () => Promise<EsiResult<MiningData>>
  }
  exploration: {
    get: () => Promise<ExplorationState>
    save: (state: ExplorationState) => Promise<ExplorationState>
  }
  combat: {
    get: () => Promise<CombatSnapshot>
    save: (snapshot: CombatSnapshot) => Promise<CombatSnapshot>
  }
  advisor: {
    ask: (goal: AdvisorGoal) => Promise<AdvisorResponse>
  }
  window: {
    setCompact: (compact: boolean) => Promise<void>
  }
}
