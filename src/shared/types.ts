/**
 * Shared types used across the main process, preload bridge, and renderer.
 */

export type AdvisorProvider = 'disabled' | 'anthropic' | 'openai' | 'hermes' | 'compatible'

export interface AppSettings {
  /** EVE developer application Client ID (register at developers.eveonline.com). */
  ssoClientId: string
  /**
   * Custom URL scheme used for the SSO callback. EVE's developer portal only
   * accepts https or a custom scheme starting with "eveauth" (lower-case
   * letters, digits, +, ., or -). The redirect URI is `${scheme}://callback`.
   */
  callbackScheme: string
  /** Selected AI Advisor backend. AI is optional and disabled by default. */
  advisorProvider: AdvisorProvider
  /** Anthropic API key for the AI Advisor (kept encrypted at rest). */
  anthropicApiKey: string
  /** OpenAI API key for the AI Advisor (kept encrypted at rest). */
  openaiApiKey: string
  /** Hermes API bearer key (kept encrypted at rest). */
  hermesApiKey: string
  /** API key for a custom OpenAI-compatible endpoint (kept encrypted at rest). */
  compatibleApiKey: string
  /** Model id used by the selected AI Advisor provider. */
  advisorModel: string
  /** Base URL for Hermes or a custom OpenAI-compatible endpoint. */
  advisorBaseUrl: string
  /** Stable Hermes memory/session scope for FirstMate requests. */
  advisorSessionKey: string
  /** Enables the read-only MCP data server used by Hermes and other agents. */
  mcpEnabled: boolean
  /** Bind on all interfaces instead of localhost; required for Docker/LAN clients. */
  mcpAllowLan: boolean
  /** TCP port for the FirstMate MCP server. */
  mcpPort: number
  /** Bearer secret accepted by the FirstMate MCP server (encrypted at rest). */
  mcpApiKey: string
  /** Explicit asset-location id treated as the player's operating home base. */
  mcpHomeLocationId: string
  /** Renderer zoom factor (1.0 = 100%). */
  zoomFactor: number
  /** Auto-refresh interval in seconds for data views. 0 = off. */
  autoRefreshSeconds: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  // Shipped Client ID so friends can just install and log in — no EVE developer
  // registration needed. This is a PKCE (public) client, so the Client ID is
  // not a secret. Override it in Settings to use your own EVE application.
  ssoClientId: 'b830c7783f08444d9b12465296aa219d',
  callbackScheme: 'eveauth-firstmate',
  advisorProvider: 'disabled',
  anthropicApiKey: '',
  openaiApiKey: '',
  hermesApiKey: '',
  compatibleApiKey: '',
  advisorModel: 'claude-opus-4-8',
  advisorBaseUrl: '',
  advisorSessionKey: 'firstmate',
  mcpEnabled: false,
  mcpAllowLan: false,
  mcpPort: 8643,
  mcpApiKey: '',
  mcpHomeLocationId: '',
  zoomFactor: 1,
  autoRefreshSeconds: 0
}

/** Redacted view of settings sent to the renderer (never exposes secrets). */
export interface PublicSettings {
  ssoClientId: string
  callbackScheme: string
  advisorProvider: AdvisorProvider
  advisorModel: string
  advisorBaseUrl: string
  advisorSessionKey: string
  mcpEnabled: boolean
  mcpAllowLan: boolean
  mcpPort: number
  mcpHomeLocationId: string
  zoomFactor: number
  autoRefreshSeconds: number
  /** True if an Anthropic key is stored, without revealing it. */
  hasAnthropicKey: boolean
  /** True if an OpenAI key is stored, without revealing it. */
  hasOpenAIKey: boolean
  /** True if a Hermes bearer key is stored, without revealing it. */
  hasHermesKey: boolean
  /** True if a custom endpoint key is stored, without revealing it. */
  hasCompatibleKey: boolean
  /** True if a FirstMate MCP bearer key is stored, without revealing it. */
  hasMcpKey: boolean
  /** True when the selected provider has enough configuration to be used. */
  advisorReady: boolean
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

export interface SkillQueueEntry {
  name?: string
  level: number
  finishesAt?: string
}

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
  skillQueue: SkillQueueEntry[]
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

export interface AssetLocationQty {
  locationId: number
  locationName?: string
  quantity: number
}

export interface AssetHolding {
  typeId: number
  typeName?: string
  quantity: number
  /** Estimated market value (average price × quantity). */
  value: number
  /** True if this type is in the ore-minerals table (has a reprocessing breakdown). */
  isOre: boolean
  /** Estimated value if reprocessed into minerals (0 if not a tabled ore). */
  refinedValue: number
  locations: AssetLocationQty[]
}

export interface AssetsData {
  holdings: AssetHolding[]
  totalValue: number
  itemTypeCount: number
  /** Gear + Materials + Ships breakdown (Assets view only; omitted for Materials). */
  netWorth?: { gear: number; materials: number; ships: number; total: number }
}

export type ShipSlot =
  | 'High'
  | 'Mid'
  | 'Low'
  | 'Rig'
  | 'Subsystem'
  | 'Drones'
  | 'Fighters'
  | 'Cargo'
  | 'Hold'
  | 'Other'

export interface FittedItem {
  typeId: number
  typeName?: string
  quantity: number
  slot: ShipSlot
}

export interface ShipInfo {
  itemId: number
  typeId: number
  typeName?: string
  /** Custom (player-given) ship name, if any — falls back to `typeName` in the UI. */
  name?: string
  isActive: boolean
  locationId: number
  locationName?: string
  /** Hull price + the market value of everything fitted/stowed aboard. */
  value: number
  fittings: FittedItem[]
}

export interface ShipsData {
  ships: ShipInfo[]
  totalValue: number
}

export interface IndustryJob {
  jobId: number
  activity: string
  productName?: string
  blueprintName?: string
  status: string
  startDate: string
  endDate: string
  locationName?: string
  locationId: number
  runs: number
}

export interface IndustryData {
  jobs: IndustryJob[]
}

export interface ImplantInfo {
  typeId: number
  typeName?: string
}

export interface JumpClone {
  locationId: number
  locationName?: string
  implants: ImplantInfo[]
}

export interface ClonesData {
  activeImplants: ImplantInfo[]
  jumpClones: JumpClone[]
  homeLocationName?: string
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
  /** Legacy combined status, retained only so older local data can be migrated. */
  status?: 'stable' | 'reduced' | 'critical' | 'eol' | 'fresh'
  /** Reliable lifetime state observed in game. */
  life?: 'unknown' | 'over-day' | 'under-day' | 'under-4h' | 'under-1h' | 'expired'
  /** Independent remaining-mass state observed in game. */
  mass?: 'unknown' | 'stable' | 'reduced' | 'critical'
  /** Epoch ms when the current lifetime state was observed. */
  lifeObservedAt?: number
  /** Legacy EOL timestamp, retained only for migration. */
  eolMarkedAt?: number
  /** Wormhole code observed on this side, e.g. H296 or K162. */
  wormholeType?: string
  /** A real, navigable connection to another tracked system. */
  destinationSystemId?: string
  /** Closed connections remain in local history and can be restored. */
  closedAt?: number
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface WormholeSystem {
  id: string
  /** Solar system name or J-code, entered by the player. */
  name: string
  /** Canonical EVE solar-system id when matched to official data. */
  solarSystemId?: number
  /** e.g. "C3", "HS", "LS", "NS". */
  systemClass?: string
  /** Wormhole environmental effect from the official SDE, when present. */
  effect?: string
  signatures: WormholeSignature[]
  notes?: string
  createdAt: number
  updatedAt: number
  archivedAt?: number
}

export interface ExplorationState {
  schemaVersion?: 2
  systems: WormholeSystem[]
  activeSystemId?: string
  rootSystemId?: string
  helpDismissed?: boolean
}

export interface ExplorationContext {
  solarSystemId: number
  solarSystemName?: string
  security?: number
  observedAt: number
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

export interface AdvisorConnectionResult {
  ok: boolean
  message: string
}

export interface McpServerStatus {
  enabled: boolean
  running: boolean
  host: string
  port: number
  endpoint: string
  error?: string
}

export interface McpAssetLocation {
  locationId: number
  locationName?: string
  itemTypeCount: number
  totalQuantity: number
  estimatedValue: number
  hasGear: boolean
  hasMaterials: boolean
  hasShips: boolean
}

export interface AdvisorHistoryEntry {
  id: string
  goal: string
  focus?: string
  advice: string
  createdAt: number
  snapshot: {
    isk: number
    skillPoints: number
    locationName?: string
    shipName?: string
  }
}

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
    explorationContext: () => Promise<EsiResult<ExplorationContext>>
    economy: () => Promise<EsiResult<EconomyData>>
    mining: () => Promise<EsiResult<MiningData>>
    assets: () => Promise<EsiResult<AssetsData>>
    materials: () => Promise<EsiResult<AssetsData>>
    ships: () => Promise<EsiResult<ShipsData>>
    industry: () => Promise<EsiResult<IndustryData>>
    clones: () => Promise<EsiResult<ClonesData>>
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
    testConnection: () => Promise<AdvisorConnectionResult>
    getHistory: () => Promise<AdvisorHistoryEntry[]>
    deleteHistory: (id: string) => Promise<AdvisorHistoryEntry[]>
    clearHistory: () => Promise<AdvisorHistoryEntry[]>
  }
  mcp: {
    getStatus: () => Promise<McpServerStatus>
    listAssetLocations: () => Promise<McpAssetLocation[]>
  }
  updates: {
    getState: () => Promise<UpdateState>
    check: () => Promise<UpdateState>
    download: () => Promise<UpdateState>
    install: () => Promise<void>
    onChange: (cb: (state: UpdateState) => void) => () => void
  }
  window: {
    setZoom: (factor: number) => Promise<void>
  }
}
