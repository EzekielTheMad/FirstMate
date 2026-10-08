import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const state = vi.hoisted(() => ({ directory: '', failWrite: false, failRename: false }))
const storage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(),
  getSelectedStorageBackend: vi.fn(),
  encryptString: vi.fn(),
  decryptString: vi.fn()
}))
vi.mock('electron', () => ({ app: { getPath: () => state.directory }, safeStorage: storage }))
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (state.failWrite) throw new Error('Synthetic write failure')
      return actual.writeFileSync(...args)
    },
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (state.failRename) throw new Error('Synthetic replace failure')
      return actual.renameSync(...args)
    }
  }
})

import {
  clearRefreshToken, decryptSecret, encryptSecret, getRefreshToken, getSettings,
  isSecureStorageAvailable, saveRefreshToken, saveSettings, toPublicSettings
} from './store'

const originalPlatform = process.platform
const fields = ['anthropicApiKey', 'openaiApiKey', 'hermesApiKey', 'compatibleApiKey', 'mcpApiKey'] as const
const legacy = (value: string): string => 'b64:' + Buffer.from(value).toString('base64')
function fixture(name: string, value: unknown): string {
  // Ensure the temporary application-data directory exists without real user data.
  getSettings()
  const path = join(state.directory, 'firstmate', name)
  writeFileSync(path, JSON.stringify(value))
  return path
}
function read(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(state.directory, 'firstmate', name), 'utf8'))
}

beforeEach(() => {
  state.directory = mkdtempSync(join(tmpdir(), 'firstmate-store-test-'))
  state.failWrite = false
  state.failRename = false
  Object.defineProperty(process, 'platform', { value: 'linux' })
  storage.isEncryptionAvailable.mockReset().mockReturnValue(true)
  storage.getSelectedStorageBackend.mockReset().mockReturnValue('gnome_libsecret')
  storage.encryptString.mockReset().mockImplementation((value: string) => Buffer.from(`test-cipher:${value}`))
  storage.decryptString.mockReset().mockImplementation((value: Buffer) => {
    const text = value.toString()
    if (!text.startsWith('test-cipher:')) throw new Error('Synthetic decryption failure')
    return text.slice('test-cipher:'.length)
  })
  getSettings()
  getRefreshToken()
})
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform })
  rmSync(state.directory, { recursive: true, force: true })
})

describe('OS-backed credential storage', () => {
  it('encrypts and verifies new secrets without a Base64 fallback', () => {
    const encrypted = encryptSecret('synthetic-provider-key')
    expect(encrypted.startsWith('enc:')).toBe(true)
    expect(decryptSecret(encrypted)).toBe('synthetic-provider-key')
    expect(encryptSecret('')).toBe('')
  })

  it.each(['basic_text', 'unknown'])('rejects the insecure Linux %s backend', (backend) => {
    storage.getSelectedStorageBackend.mockReturnValue(backend)
    expect(isSecureStorageAvailable()).toBe(false)
    expect(() => encryptSecret('synthetic-provider-key')).toThrow('Secure credential storage is unavailable')
    expect(storage.encryptString).not.toHaveBeenCalled()
  })

  it('checks availability on Windows without calling the Linux-only API', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    storage.getSelectedStorageBackend.mockClear()
    expect(isSecureStorageAvailable()).toBe(true)
    expect(storage.getSelectedStorageBackend).not.toHaveBeenCalled()
    storage.isEncryptionAvailable.mockReturnValue(false)
    expect(isSecureStorageAvailable()).toBe(false)
  })

  it('fails closed if encryption fails or cannot be verified, without leaking platform errors', () => {
    storage.encryptString.mockImplementation(() => { throw new Error('sensitive platform error') })
    expect(() => encryptSecret('synthetic-provider-key')).toThrow('OS credential encryption failed')
    storage.encryptString.mockReturnValue(Buffer.from('unreadable'))
    expect(() => encryptSecret('synthetic-provider-key')).toThrow('OS credential encryption failed')
  })

  it('does not decrypt existing ciphertext while the keychain is unavailable', () => {
    const encrypted = encryptSecret('synthetic-provider-key')
    storage.decryptString.mockClear()
    storage.isEncryptionAvailable.mockReturnValue(false)
    expect(decryptSecret(encrypted)).toBe('')
    expect(storage.decryptString).not.toHaveBeenCalled()
  })

  it('does not return legacy plaintext through the decryption helper', () => {
    expect(decryptSecret(legacy('synthetic-provider-key'))).toBe('')
  })
})

describe('legacy migration and preservation', () => {
  it('migrates every provider/MCP field and preserves ordinary and unknown settings', () => {
    fixture('settings.json', {
      ...Object.fromEntries(fields.map((field) => [`${field}Enc`, legacy(`synthetic-${field}`)])),
      zoomFactor: 1.25, futureSetting: { keep: true }
    })
    const settings = getSettings()
    for (const field of fields) {
      expect(settings[field]).toBe(`synthetic-${field}`)
      expect(read('settings.json')[`${field}Enc`]).toMatch(/^enc:/)
    }
    expect(settings.advisorProvider).toBe('anthropic')
    expect(read('settings.json')).toMatchObject({ zoomFactor: 1.25, futureSetting: { keep: true } })
    expect(toPublicSettings(settings).secretStorageWarning).toBeUndefined()
  })

  it('migrates a legacy refresh token only after secure encryption is available', () => {
    const tokenPath = fixture('token.json', { refreshTokenEnc: legacy('synthetic-refresh-token'), futureField: 7 })
    const original = readFileSync(tokenPath, 'utf8')
    storage.isEncryptionAvailable.mockReturnValue(false)
    expect(getRefreshToken()).toBe('')
    expect(readFileSync(tokenPath, 'utf8')).toBe(original)
    storage.isEncryptionAvailable.mockReturnValue(true)
    expect(getRefreshToken()).toBe('synthetic-refresh-token')
    expect(read('token.json')).toMatchObject({ refreshTokenEnc: expect.stringMatching(/^enc:/), futureField: 7 })
  })

  it('preserves all opaque secrets when changing unrelated settings with a locked keychain', () => {
    const values = Object.fromEntries(fields.map((field) => [`${field}Enc`, legacy(`synthetic-${field}`)]))
    fixture('settings.json', values)
    storage.isEncryptionAvailable.mockReturnValue(false)
    expect(getSettings().anthropicApiKey).toBe('')
    expect(getSettings().advisorProvider).toBe('anthropic')
    saveSettings({ zoomFactor: 1.5 })
    expect(read('settings.json')).toMatchObject({ ...values, zoomFactor: 1.5 })
    expect(toPublicSettings(getSettings()).secretStorageWarning).toContain('Secure credential storage is unavailable')
    expect(storage.encryptString).not.toHaveBeenCalled()
  })

  it('rejects new secrets before changing any settings if secure storage is unavailable', () => {
    const path = fixture('settings.json', { zoomFactor: 1, openaiApiKeyEnc: legacy('synthetic-existing-key') })
    const original = readFileSync(path, 'utf8')
    storage.isEncryptionAvailable.mockReturnValue(false)
    expect(() => saveSettings({ zoomFactor: 1.5, openaiApiKey: 'synthetic-new-key' })).toThrow('Secure credential storage is unavailable')
    expect(readFileSync(path, 'utf8')).toBe(original)
  })

  it('never overwrites unreadable ciphertext during unrelated settings edits', () => {
    fixture('settings.json', { openaiApiKeyEnc: 'enc:unreadable-record' })
    saveSettings({ zoomFactor: 1.5 })
    expect(read('settings.json').openaiApiKeyEnc).toBe('enc:unreadable-record')
    expect(toPublicSettings(getSettings()).secretStorageWarning).toContain('original records are preserved')
  })

  it('does not partially migrate when another record is invalid', () => {
    const path = fixture('settings.json', { anthropicApiKeyEnc: legacy('synthetic-key'), openaiApiKeyEnc: 'b64:!!!' })
    const original = readFileSync(path, 'utf8')
    expect(getSettings().anthropicApiKey).toBe('')
    expect(readFileSync(path, 'utf8')).toBe(original)
  })

  it.each(['failWrite', 'failRename'] as const)('preserves original data if migration hits %s', (failure) => {
    const path = fixture('settings.json', { anthropicApiKeyEnc: legacy('synthetic-key') })
    const original = readFileSync(path, 'utf8')
    state[failure] = true
    expect(getSettings().anthropicApiKey).toBe('')
    expect(readFileSync(path, 'utf8')).toBe(original)
    expect(readdirSync(join(state.directory, 'firstmate'))).toEqual(['settings.json'])
  })

  it('does not overwrite a malformed settings file', () => {
    const path = fixture('settings.json', {})
    writeFileSync(path, '{incomplete-json')
    expect(() => saveSettings({ zoomFactor: 1.5 })).toThrow('original file was left unchanged')
    expect(readFileSync(path, 'utf8')).toBe('{incomplete-json')
    expect(toPublicSettings(getSettings()).secretStorageWarning).toContain('original records are preserved')
  })

  it('warns without changing a malformed token file', () => {
    const path = fixture('token.json', {})
    writeFileSync(path, '{incomplete-json')
    expect(getRefreshToken()).toBe('')
    expect(readFileSync(path, 'utf8')).toBe('{incomplete-json')
    expect(toPublicSettings(getSettings()).secretStorageWarning).toContain('original records are preserved')
  })

  it('preserves a previous refresh token after a failed save and permits explicit logout while locked', () => {
    saveRefreshToken('synthetic-refresh-token')
    const original = read('token.json')
    storage.isEncryptionAvailable.mockReturnValue(false)
    expect(() => saveRefreshToken('synthetic-new-refresh-token')).toThrow('Secure credential storage is unavailable')
    expect(read('token.json')).toEqual(original)
    clearRefreshToken()
    expect(read('token.json').refreshTokenEnc).toBe('')
  })
})
