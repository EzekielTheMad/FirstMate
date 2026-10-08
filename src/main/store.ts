import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
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
 * Secrets require OS-backed safeStorage. Legacy Base64 records are migrated
 * only after encryption succeeds; unavailable or unreadable records are preserved.
 */

function dataDir(): string {
  const dir = join(app.getPath('userData'), 'firstmate')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function filePath(name: string): string {
  return join(dataDir(), name)
}

function readJson<T>(name: string, fallback: T, strict = false): T {
  try {
    const p = filePath(name)
    if (!existsSync(p)) return fallback
    const parsed = JSON.parse(readFileSync(p, 'utf-8'))
    if (strict && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
      throw new Error('Invalid secret store')
    }
    // Array-shaped stores (e.g. advisor history) must not be object-merged —
    // spreading two arrays with `{...a, ...b}` yields a plain object, not an array.
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T
    return { ...fallback, ...parsed }
  } catch {
    if (strict) throw new Error('Saved credentials could not be read. The original file was left unchanged.')
    return fallback
  }
}

function writeJson(name: string, value: unknown): void {
  const destination = filePath(name)
  const temporary = `${destination}.${randomUUID()}.tmp`
  try {
    // Same-directory replacement avoids truncating the old store if a write fails.
    writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf-8', mode: 0o600, flag: 'wx', flush: true })
    renameSync(temporary, destination)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

const STORAGE_UNAVAILABLE = 'Secure credential storage is unavailable. Unlock your OS keychain or configure a supported secret store, then restart FirstMate. Existing credentials are preserved; new credentials cannot be saved.'
const STORAGE_UNREADABLE = 'Some saved credentials could not be opened or upgraded. The original records are preserved. Restore access to the original OS keychain before replacing credentials.'
const secretWarnings = new Map<string, string>()

export class SecretStorageError extends Error {
  constructor(message = STORAGE_UNAVAILABLE) {
    super(message)
    this.name = 'SecretStorageError'
  }
}

export function isSecureStorageAvailable(): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false
    // Electron's Linux basic_text backend uses a hardcoded password, not a keyring.
    if (process.platform === 'linux') {
      const backend = safeStorage.getSelectedStorageBackend()
      return backend !== 'basic_text' && backend !== 'unknown'
    }
    return true
  } catch {
    return false
  }
}

export function requireSecureStorage(): void {
  if (!isSecureStorageAvailable()) throw new SecretStorageError()
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  requireSecureStorage()
  try {
    const encrypted = safeStorage.encryptString(plaintext)
    // Never replace an older record unless the new ciphertext can be read back.
    if (safeStorage.decryptString(encrypted) !== plaintext) throw new Error('Verification failed')
    return 'enc:' + encrypted.toString('base64')
  } catch {
    // Do not include platform errors, inputs, or ciphertext in logs/IPC errors.
    throw new SecretStorageError('OS credential encryption failed. Existing credentials were left unchanged.')
  }
}

export function decryptSecret(stored: string): string {
  if (!stored || !isSecureStorageAvailable()) return ''
  try {
    if (stored.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    }
  } catch {
    // A read failure must never become an empty value written back over the original.
  }
  return ''
}

function migrateSecrets<T extends object>(name: string, raw: T, fields: Array<keyof T>): T {
  secretWarnings.delete(name)
  if (!isSecureStorageAvailable()) return raw
  const next = { ...raw }
  let changed = false
  try {
    for (const field of fields) {
      const stored = raw[field]
      if (!stored) continue
      if (typeof stored !== 'string') throw new Error('Invalid credential record')
      if (stored.startsWith('b64:')) {
        const encoded = stored.slice(4)
        const plaintext = Buffer.from(encoded, 'base64').toString('utf-8')
        if (!plaintext || Buffer.from(plaintext, 'utf-8').toString('base64') !== encoded) {
          throw new Error('Invalid legacy credential record')
        }
        next[field] = encryptSecret(plaintext) as T[keyof T]
        changed = true
      } else if (!stored.startsWith('enc:') || !decryptSecret(stored)) {
        throw new Error('Unreadable credential record')
      }
    }
    if (changed) writeJson(name, next)
    return next
  } catch {
    secretWarnings.set(name, STORAGE_UNREADABLE)
    return raw
  }
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
const SECRET_FIELDS = ['anthropicApiKey', 'openaiApiKey', 'hermesApiKey', 'compatibleApiKey', 'mcpApiKey'] as const

function readStoredSettings(strict = false): StoredSettings {
  return readJson<StoredSettings>(SETTINGS_FILE, {
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
  }, strict)
}

export function getSettings(): AppSettings {
  let raw: StoredSettings
  try {
    raw = migrateSecrets(SETTINGS_FILE, readStoredSettings(true), SECRET_FIELDS.map((field) => `${field}Enc` as const))
  } catch {
    secretWarnings.set(SETTINGS_FILE, STORAGE_UNREADABLE)
    raw = readStoredSettings()
  }
  const anthropicApiKey = decryptSecret(raw.anthropicApiKeyEnc)
  return {
    ssoClientId: raw.ssoClientId,
    callbackScheme: raw.callbackScheme || DEFAULT_SETTINGS.callbackScheme,
    // Old releases only stored an Anthropic key/model. Keep those users enabled
    // while leaving genuinely new installations disabled by default.
    advisorProvider: resolveAdvisorProvider(raw.advisorProvider, Boolean(raw.anthropicApiKeyEnc)),
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
  // Read strictly before any migration/write so malformed stores cannot be replaced.
  readStoredSettings(true)
  const current = getSettings()
  const raw = readStoredSettings(true)
  const merged: AppSettings = { ...current, ...patch }
  const stored: StoredSettings = {
    ...raw,
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
    autoRefreshSeconds: merged.autoRefreshSeconds
  }
  for (const field of SECRET_FIELDS) {
    // Unrelated settings edits preserve opaque credentials byte-for-byte, even
    // when the keychain is locked or a record cannot be decrypted.
    if (patch[field] !== undefined) stored[`${field}Enc`] = encryptSecret(patch[field])
  }
  writeJson(SETTINGS_FILE, stored)
  return getSettings()
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
    advisorReady: isAdvisorReady(s),
    secretStorageWarning: !isSecureStorageAvailable()
      ? STORAGE_UNAVAILABLE
      : [...secretWarnings.values()][0]
  }
}

// ---- Refresh token ---------------------------------------------------------

const TOKEN_FILE = 'token.json'

export function saveRefreshToken(token: string): void {
  writeJson(TOKEN_FILE, { refreshTokenEnc: encryptSecret(token) })
  secretWarnings.delete(TOKEN_FILE)
}

export function getRefreshToken(): string {
  try {
    const raw = migrateSecrets(TOKEN_FILE, readJson<{ refreshTokenEnc: string }>(TOKEN_FILE, { refreshTokenEnc: '' }, true), ['refreshTokenEnc'])
    return decryptSecret(raw.refreshTokenEnc)
  } catch {
    secretWarnings.set(TOKEN_FILE, STORAGE_UNREADABLE)
    return ''
  }
}

export function clearRefreshToken(): void {
  writeJson(TOKEN_FILE, { refreshTokenEnc: '' })
  secretWarnings.delete(TOKEN_FILE)
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
