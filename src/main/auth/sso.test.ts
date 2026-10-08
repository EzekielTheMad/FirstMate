import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  getSettings: vi.fn(() => ({ ssoClientId: 'synthetic-client', callbackScheme: 'eveauth-firstmate' })),
  getRefreshToken: vi.fn(), saveRefreshToken: vi.fn(), clearRefreshToken: vi.fn(), requireSecureStorage: vi.fn()
}))
const openExternal = vi.hoisted(() => vi.fn())
vi.mock('../store', () => store)
vi.mock('electron', () => ({ shell: { openExternal }, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: vi.fn(async () => ({ payload: { sub: 'CHARACTER:EVE:12345', name: 'Synthetic Pilot', exp: 9999999999 } }))
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  store.requireSecureStorage.mockReset()
  store.saveRefreshToken.mockReset()
  store.getRefreshToken.mockReturnValue('synthetic-refresh-token')
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-rotated-token', expires_in: 1200 })
  })))
})

describe('credential failures during EVE sign-in', () => {
  it('rejects login before opening a browser when secure storage is unavailable', async () => {
    store.requireSecureStorage.mockImplementation(() => { throw new Error('Secure credential storage is unavailable') })
    const { login } = await import('./sso')
    expect(await login()).toEqual({ status: 'error', error: 'Secure credential storage is unavailable' })
    expect(openExternal).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not rotate or delete the stored token if secure storage becomes unavailable', async () => {
    store.requireSecureStorage.mockImplementation(() => { throw new Error('Synthetic locked keychain') })
    const { restoreSession } = await import('./sso')
    expect(await restoreSession()).toEqual({ status: 'logged-out' })
    expect(fetch).not.toHaveBeenCalled()
    expect(store.clearRefreshToken).not.toHaveBeenCalled()
  })

  it('preserves the stored token after a transient network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Synthetic network failure'))
    const { restoreSession } = await import('./sso')
    expect(await restoreSession()).toEqual({ status: 'logged-out' })
    expect(store.clearRefreshToken).not.toHaveBeenCalled()
  })

  it('does not claim login succeeded or erase the old token when persistence fails', async () => {
    store.saveRefreshToken.mockImplementation(() => { throw new Error('Synthetic storage failure') })
    const { restoreSession, getAuthState } = await import('./sso')
    expect(await restoreSession()).toEqual({ status: 'logged-out' })
    expect(getAuthState()).toEqual({ status: 'logged-out' })
    expect(store.clearRefreshToken).not.toHaveBeenCalled()
  })

  it('restores a session after saving the rotated token and only clears on explicit logout', async () => {
    const { restoreSession, logout } = await import('./sso')
    expect(await restoreSession()).toMatchObject({ status: 'logged-in', identity: { characterName: 'Synthetic Pilot' } })
    expect(store.saveRefreshToken).toHaveBeenCalledWith('synthetic-rotated-token')
    expect(store.clearRefreshToken).not.toHaveBeenCalled()
    logout()
    expect(store.clearRefreshToken).toHaveBeenCalledOnce()
  })
})
