import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  AppSettings,
  DEFAULT_SETTINGS,
  PublicSettings,
  AdvisorProvider,
  ExplorationState,
  CombatSnapshot,
  AdvisorHistoryEntry
} from '@shared/types'
import { isAdvisorReady, resolveAdvisorProvider } from '@shared/advisor-settings'
import { normalizeExplorationState } from '@shared/exploration'

/**
 * Small JSON-file persistence layer living in the Electron userData dir.
 * Secrets (Anthropic key, SSO refresh token) are encrypted with safeStorage
 * when the OS supports it, and base64-obfuscated as a fallback.
 */

function dataDir(): string {
  const dir = join(app.getPath('userData'), 'firstmate')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function filePath(name: string): string {
  return join(dataDir(), name)
}

function readJson<T>(name: string, fallback: T): T {
  try {
    const p = filePath(name)
    if (!existsSync(p)) return fallback
    const parsed = JSON.parse(readFileSync(p, 'utf-8'))
    // Array-shaped stores (e.g. advisor history) must not be object-merged —
    // spreading two arrays with `{...a, ...b}` yields a plain object, not an array.
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T
    return { ...fallback, ...parsed }
  } catch {
    return fallback
  }
}

function writeJson(name: string, value: unknown): void {
  writeFileSync(filePath(name), JSON.stringify(value, null, 2), 'utf-8')
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(plaintext).toString('base64')
    }
  } catch {
    /* fall through to obfuscation */
  }
  return 'b64:' + Buffer.from(plaintext, 'utf-8').toString('base64')
}

export function decryptSecret(stored: string): string {
  if (!stored) return ''
  try {
    if (stored.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    }
    if (stored.startsWith('b64:')) {
      return Buffer.from(stored.slice(4), 'base64').toString('utf-8')
    }
  } catch {
    return ''
  }
  return ''
}

// ---- Settings --------------------------------------------------------------

interface StoredSettings
  extends Omit<
    AppSettings,
    | 'advisorProvider'
    | 'anthropicApiKey'
    | 'openaiApiKey'
    | 'hermesApiKey'
    | 'compatibleApiKey'
    | 'mcpApiKey'
  > {
  /** Optional so settings written before provider selection existed can be migrated. */
  advisorProvider?: AdvisorProvider
  anthropicApiKeyEnc: string
  openaiApiKeyEnc: string
  hermesApiKeyEnc: string
  compatibleApiKeyEnc: string
  mcpApiKeyEnc: string
}

const SETTINGS_FILE = 'settings.json'

export function getSettings(): AppSettings {
  const raw = readJson<StoredSettings>(SETTINGS_FILE, {
    ssoClientId: DEFAULT_SETTINGS.ssoClientId,
    callbackScheme: DEFAULT_SETTINGS.callbackScheme,
    advisorModel: DEFAULT_SETTINGS.advisorModel,
    advisorBaseUrl: DEFAULT_SETTINGS.advisorBaseUrl,
    advisorSessionKey: DEFAULT_SETTINGS.advisorSessionKey,
    mcpEnabled: DEFAULT_SETTINGS.mcpEnabled,
    mcpAllowLan: DEFAULT_SETTINGS.mcpAllowLan,
    mcpPort: DEFAULT_SETTINGS.mcpPort,
    mcpHomeLocationId: DEFAULT_SETTINGS.mcpHomeLocationId,
    zoomFactor: DEFAULT_SETTINGS.zoomFactor,
    autoRefreshSeconds: DEFAULT_SETTINGS.autoRefreshSeconds,
    anthropicApiKeyEnc: '',
    openaiApiKeyEnc: '',
    hermesApiKeyEnc: '',
    compatibleApiKeyEnc: '',
    mcpApiKeyEnc: ''
  })
  const anthropicApiKey = decryptSecret(raw.anthropicApiKeyEnc)
  return {
    ssoClientId: raw.ssoClientId,
    callbackScheme: raw.callbackScheme || DEFAULT_SETTINGS.callbackScheme,
    // Old releases only stored an Anthropic key/model. Keep those users enabled
    // while leaving genuinely new installations disabled by default.
    advisorProvider: resolveAdvisorProvider(raw.advisorProvider, Boolean(anthropicApiKey)),
    anthropicApiKey,
    openaiApiKey: decryptSecret(raw.openaiApiKeyEnc),
    hermesApiKey: decryptSecret(raw.hermesApiKeyEnc),
    compatibleApiKey: decryptSecret(raw.compatibleApiKeyEnc),
    advisorModel: raw.advisorModel || DEFAULT_SETTINGS.advisorModel,
    advisorBaseUrl: raw.advisorBaseUrl || '',
    advisorSessionKey: raw.advisorSessionKey || DEFAULT_SETTINGS.advisorSessionKey,
    mcpEnabled: raw.mcpEnabled ?? DEFAULT_SETTINGS.mcpEnabled,
    mcpAllowLan: raw.mcpAllowLan ?? DEFAULT_SETTINGS.mcpAllowLan,
    mcpPort: raw.mcpPort ?? DEFAULT_SETTINGS.mcpPort,
    mcpApiKey: decryptSecret(raw.mcpApiKeyEnc),
    mcpHomeLocationId: raw.mcpHomeLocationId ?? DEFAULT_SETTINGS.mcpHomeLocationId,
    zoomFactor: raw.zoomFactor ?? DEFAULT_SETTINGS.zoomFactor,
    autoRefreshSeconds: raw.autoRefreshSeconds ?? DEFAULT_SETTINGS.autoRefreshSeconds
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const merged: AppSettings = { ...current, ...patch }
  const stored: StoredSettings = {
    ssoClientId: merged.ssoClientId,
    callbackScheme: merged.callbackScheme,
    advisorProvider: merged.advisorProvider,
    advisorModel: merged.advisorModel,
    advisorBaseUrl: merged.advisorBaseUrl,
    advisorSessionKey: merged.advisorSessionKey,
    mcpEnabled: merged.mcpEnabled,
    mcpAllowLan: merged.mcpAllowLan,
    mcpPort: merged.mcpPort,
    mcpHomeLocationId: merged.mcpHomeLocationId,
    zoomFactor: merged.zoomFactor,
    autoRefreshSeconds: merged.autoRefreshSeconds,
    anthropicApiKeyEnc: encryptSecret(merged.anthropicApiKey),
    openaiApiKeyEnc: encryptSecret(merged.openaiApiKey),
    hermesApiKeyEnc: encryptSecret(merged.hermesApiKey),
    compatibleApiKeyEnc: encryptSecret(merged.compatibleApiKey),
    mcpApiKeyEnc: encryptSecret(merged.mcpApiKey)
  }
  writeJson(SETTINGS_FILE, stored)
  return merged
}

export function toPublicSettings(s: AppSettings): PublicSettings {
  return {
    ssoClientId: s.ssoClientId,
    callbackScheme: s.callbackScheme,
    advisorProvider: s.advisorProvider,
    advisorModel: s.advisorModel,
    advisorBaseUrl: s.advisorBaseUrl,
    advisorSessionKey: s.advisorSessionKey,
    mcpEnabled: s.mcpEnabled,
    mcpAllowLan: s.mcpAllowLan,
    mcpPort: s.mcpPort,
    mcpHomeLocationId: s.mcpHomeLocationId,
    zoomFactor: s.zoomFactor,
    autoRefreshSeconds: s.autoRefreshSeconds,
    hasAnthropicKey: Boolean(s.anthropicApiKey),
    hasOpenAIKey: Boolean(s.openaiApiKey),
    hasHermesKey: Boolean(s.hermesApiKey),
    hasCompatibleKey: Boolean(s.compatibleApiKey),
    hasMcpKey: Boolean(s.mcpApiKey),
    advisorReady: isAdvisorReady(s)
  }
}

// ---- Refresh token ---------------------------------------------------------

const TOKEN_FILE = 'token.json'

export function saveRefreshToken(token: string): void {
  writeJson(TOKEN_FILE, { refreshTokenEnc: encryptSecret(token) })
}

export function getRefreshToken(): string {
  const raw = readJson<{ refreshTokenEnc: string }>(TOKEN_FILE, { refreshTokenEnc: '' })
  return decryptSecret(raw.refreshTokenEnc)
}

export function clearRefreshToken(): void {
  writeJson(TOKEN_FILE, { refreshTokenEnc: '' })
}

// ---- Local domain data (exploration, combat) -------------------------------

const EXPLORATION_FILE = 'exploration.json'
const COMBAT_FILE = 'combat.json'

export function getExploration(): ExplorationState {
  return normalizeExplorationState(readJson<unknown>(EXPLORATION_FILE, { systems: [] }))
}

export function saveExploration(state: ExplorationState): ExplorationState {
  const normalized = normalizeExplorationState(state)
  writeJson(EXPLORATION_FILE, normalized)
  return normalized
}

export function getCombat(): CombatSnapshot {
  return readJson<CombatSnapshot>(COMBAT_FILE, { notes: '', fits: [] })
}

export function saveCombat(snapshot: CombatSnapshot): CombatSnapshot {
  writeJson(COMBAT_FILE, snapshot)
  return snapshot
}

// ---- Advisor history --------------------------------------------------------

const ADVISOR_HISTORY_FILE = 'advisor-history.json'
const ADVISOR_HISTORY_LIMIT = 50

export function getAdvisorHistory(): AdvisorHistoryEntry[] {
  return readJson<AdvisorHistoryEntry[]>(ADVISOR_HISTORY_FILE, [])
}

export function addAdvisorHistory(entry: AdvisorHistoryEntry): AdvisorHistoryEntry[] {
  const next = [entry, ...getAdvisorHistory()].slice(0, ADVISOR_HISTORY_LIMIT)
  writeJson(ADVISOR_HISTORY_FILE, next)
  return next
}

export function deleteAdvisorHistory(id: string): AdvisorHistoryEntry[] {
  const next = getAdvisorHistory().filter((e) => e.id !== id)
  writeJson(ADVISOR_HISTORY_FILE, next)
  return next
}

export function clearAdvisorHistory(): AdvisorHistoryEntry[] {
  writeJson(ADVISOR_HISTORY_FILE, [])
  return []
}
