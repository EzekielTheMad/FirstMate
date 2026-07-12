import { createHash, randomBytes } from 'crypto'
import { createServer, Server } from 'http'
import { shell, BrowserWindow } from 'electron'
import { AuthState, CharacterIdentity } from '@shared/types'
import { ALL_SCOPES } from '@shared/scopes'
import { getSettings, getRefreshToken, saveRefreshToken, clearRefreshToken } from '../store'

const AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize/'
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token'

interface Tokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

let tokens: Tokens | null = null
let identity: CharacterIdentity | null = null
let listeners: Array<(s: AuthState) => void> = []
let loginInFlight = false

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeJwt(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length < 2) throw new Error('Malformed token')
  const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  return JSON.parse(payload)
}

function identityFromAccessToken(accessToken: string): CharacterIdentity {
  const claims = decodeJwt(accessToken)
  const sub = String(claims.sub ?? '') // "CHARACTER:EVE:12345"
  const characterId = Number(sub.split(':').pop())
  const rawScopes = claims.scp
  const scopes = Array.isArray(rawScopes)
    ? (rawScopes as string[])
    : typeof rawScopes === 'string'
      ? rawScopes.split(' ')
      : []
  return {
    characterId,
    characterName: String(claims.name ?? 'Unknown Capsuleer'),
    scopes,
    expiresAt: Number(claims.exp ?? 0) * 1000,
    portrait: `https://images.evetech.net/characters/${characterId}/portrait?size=128`
  }
}

function emit(state: AuthState): void {
  for (const cb of listeners) {
    try {
      cb(state)
    } catch {
      /* ignore listener errors */
    }
  }
}

export function onAuthChange(cb: (s: AuthState) => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export function getAuthState(): AuthState {
  if (loginInFlight) return { status: 'logging-in' }
  if (tokens && identity) return { status: 'logged-in', identity }
  return { status: 'logged-out' }
}

async function exchangeToken(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: 'login.eveonline.com',
      Accept: 'application/json'
    },
    body: new URLSearchParams(body).toString()
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Token endpoint returned ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000
  }
}

/**
 * Run the interactive PKCE login: spin up a loopback server, open the system
 * browser to the EVE SSO consent page, capture the callback, exchange the code.
 */
export async function login(): Promise<AuthState> {
  const settings = getSettings()
  if (!settings.ssoClientId) {
    return { status: 'error', error: 'No SSO Client ID set. Add it in Settings first.' }
  }

  loginInFlight = true
  emit({ status: 'logging-in' })

  const codeVerifier = base64url(randomBytes(32))
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())
  const state = base64url(randomBytes(16))
  const redirectUri = `http://localhost:${settings.callbackPort}/callback`

  const authorizeUrl = new URL(AUTHORIZE_URL)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('client_id', settings.ssoClientId)
  authorizeUrl.searchParams.set('scope', ALL_SCOPES.join(' '))
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('state', state)

  return new Promise<AuthState>((resolve) => {
    let server: Server | null = null
    const timeout = setTimeout(() => {
      cleanup()
      const s: AuthState = { status: 'error', error: 'Login timed out. Please try again.' }
      loginInFlight = false
      emit(s)
      resolve(s)
    }, 3 * 60 * 1000)

    function cleanup(): void {
      clearTimeout(timeout)
      if (server) {
        server.close()
        server = null
      }
    }

    server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', redirectUri)
        if (url.pathname !== '/callback') {
          res.writeHead(404)
          res.end('Not found')
          return
        }
        const returnedState = url.searchParams.get('state')
        const code = url.searchParams.get('code')
        const err = url.searchParams.get('error')

        if (err) throw new Error(`SSO error: ${err}`)
        if (returnedState !== state) throw new Error('State mismatch — possible CSRF, aborting.')
        if (!code) throw new Error('No authorization code returned.')

        const newTokens = await exchangeToken({
          grant_type: 'authorization_code',
          code,
          client_id: settings.ssoClientId,
          code_verifier: codeVerifier
        })

        tokens = newTokens
        identity = identityFromAccessToken(newTokens.accessToken)
        saveRefreshToken(newTokens.refreshToken)

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(SUCCESS_PAGE)
        cleanup()
        loginInFlight = false
        const s: AuthState = { status: 'logged-in', identity }
        emit(s)
        BrowserWindow.getAllWindows()[0]?.focus()
        resolve(s)
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(errorPage(String(e)))
        cleanup()
        loginInFlight = false
        const s: AuthState = { status: 'error', error: String(e) }
        emit(s)
        resolve(s)
      }
    })

    server.on('error', (e) => {
      cleanup()
      loginInFlight = false
      const s: AuthState = {
        status: 'error',
        error: `Could not open loopback server on port ${settings.callbackPort}: ${e.message}`
      }
      emit(s)
      resolve(s)
    })

    server.listen(settings.callbackPort, '127.0.0.1', () => {
      shell.openExternal(authorizeUrl.toString())
    })
  })
}

export function logout(): AuthState {
  tokens = null
  identity = null
  clearRefreshToken()
  clearAuthCaches?.()
  const s: AuthState = { status: 'logged-out' }
  emit(s)
  return s
}

/** Optional hook the ESI client sets to flush its cache on logout. */
let clearAuthCaches: (() => void) | undefined
export function setClearAuthCaches(fn: () => void): void {
  clearAuthCaches = fn
}

/**
 * Attempt to restore a session from a stored refresh token (called on startup).
 */
export async function restoreSession(): Promise<AuthState> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return { status: 'logged-out' }
  try {
    await refreshAccessToken(refreshToken)
    return getAuthState()
  } catch {
    clearRefreshToken()
    return { status: 'logged-out' }
  }
}

async function refreshAccessToken(refreshToken: string): Promise<void> {
  const settings = getSettings()
  const newTokens = await exchangeToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: settings.ssoClientId
  })
  tokens = newTokens
  identity = identityFromAccessToken(newTokens.accessToken)
  saveRefreshToken(newTokens.refreshToken)
}

/**
 * Return a valid access token, refreshing if it is within 60s of expiry.
 * Throws if there is no session.
 */
export async function getValidAccessToken(): Promise<string> {
  if (!tokens) {
    const stored = getRefreshToken()
    if (!stored) throw new Error('Not logged in.')
    await refreshAccessToken(stored)
  }
  if (tokens && tokens.expiresAt - Date.now() < 60_000) {
    await refreshAccessToken(tokens.refreshToken)
  }
  if (!tokens) throw new Error('Not logged in.')
  return tokens.accessToken
}

export function getIdentity(): CharacterIdentity | null {
  return identity
}

const SUCCESS_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>FirstMate</title>
<style>body{background:#0b1220;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;
height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}
.card{max-width:420px;padding:32px}h1{color:#38bdf8;font-weight:600}
p{color:#94a3b8}</style></head><body><div class="card">
<h1>Authenticated ✓</h1><p>FirstMate is now connected to your character.<br>
You can close this tab and return to the app.</p></div></body></html>`

function errorPage(message: string): string {
  const safe = message.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] || c)
  return `<!doctype html><html><head><meta charset="utf-8"><title>FirstMate</title>
<style>body{background:#0b1220;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;
height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}
.card{max-width:480px;padding:32px}h1{color:#f87171;font-weight:600}
code{color:#94a3b8;font-size:12px;word-break:break-word}</style></head><body><div class="card">
<h1>Login failed</h1><p><code>${safe}</code></p></div></body></html>`
}
