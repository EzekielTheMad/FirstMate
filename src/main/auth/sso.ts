import { createHash, randomBytes } from 'crypto'
import { shell, BrowserWindow } from 'electron'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { AuthState, CharacterIdentity } from '@shared/types'
import { ALL_SCOPES } from '@shared/scopes'
import { getSettings, getRefreshToken, saveRefreshToken, clearRefreshToken } from '../store'

const AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize/'
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token'
const SSO_METADATA_URL = 'https://login.eveonline.com/.well-known/oauth-authorization-server'
const FALLBACK_JWKS_URI = 'https://login.eveonline.com/oauth/jwks'
// EVE has published the token issuer in a few forms over time — accept any.
const KNOWN_ISSUERS = [
  'login.eveonline.com',
  'https://login.eveonline.com',
  'https://login.eveonline.com/'
]

interface Tokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

let tokens: Tokens | null = null
let identity: CharacterIdentity | null = null
let listeners: Array<(s: AuthState) => void> = []
let loginInFlight = false

/** In-flight PKCE login awaiting the deep-link callback. */
interface PendingLogin {
  state: string
  codeVerifier: string
  clientId: string
  resolve: (s: AuthState) => void
  timeout: NodeJS.Timeout
}
let pending: PendingLogin | null = null

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---- Access-token verification (EVE SSO JWT) -------------------------------

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let issuers: string[] = KNOWN_ISSUERS

/**
 * Build (once) the remote JWKS used to verify SSO tokens, discovering the
 * jwks_uri and issuer from EVE's SSO metadata as EVE recommends, and falling
 * back to the well-known values if the metadata is unreachable. `jose` caches
 * the fetched keys internally.
 */
async function getJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
  if (jwks) return jwks
  let jwksUri = FALLBACK_JWKS_URI
  try {
    const res = await fetch(SSO_METADATA_URL, { headers: { Accept: 'application/json' } })
    if (res.ok) {
      const meta = (await res.json()) as { jwks_uri?: string; issuer?: string }
      if (meta.jwks_uri) jwksUri = meta.jwks_uri
      if (meta.issuer) issuers = [meta.issuer, ...KNOWN_ISSUERS]
    }
  } catch {
    /* fall back to the well-known jwks_uri + issuers */
  }
  jwks = createRemoteJWKSet(new URL(jwksUri))
  return jwks
}

/**
 * Verify an EVE SSO access token per EVE's guidance: validate the signature
 * against the SSO JWKS, plus the issuer, the audience (our client id), and
 * expiry. Returns the validated claims; throws if verification fails.
 */
async function verifyAccessToken(accessToken: string, clientId: string): Promise<JWTPayload> {
  const keySet = await getJwks()
  const { payload } = await jwtVerify(accessToken, keySet, {
    issuer: issuers,
    audience: clientId
  })
  return payload
}

async function identityFromAccessToken(
  accessToken: string,
  clientId: string
): Promise<CharacterIdentity> {
  const claims = await verifyAccessToken(accessToken, clientId)
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
 * Begin an interactive PKCE login. Opens the system browser to the EVE SSO
 * consent page; the redirect comes back via the app's custom URL scheme and is
 * delivered to `handleCallbackUrl` (wired up in the main process). Resolves once
 * the callback is processed (or on timeout / error).
 */
export async function login(): Promise<AuthState> {
  const settings = getSettings()
  if (!settings.ssoClientId) {
    return { status: 'error', error: 'No SSO Client ID set. Add it in Settings first.' }
  }

  // Cancel any previous in-flight attempt.
  if (pending) {
    clearTimeout(pending.timeout)
    const stale = pending
    pending = null
    stale.resolve({ status: 'error', error: 'Login superseded by a new attempt.' })
  }

  loginInFlight = true
  emit({ status: 'logging-in' })

  const codeVerifier = base64url(randomBytes(32))
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())
  const state = base64url(randomBytes(16))
  const scheme = settings.callbackScheme || 'eveauth-firstmate'
  const redirectUri = `${scheme}://callback`

  const authorizeUrl = new URL(AUTHORIZE_URL)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('client_id', settings.ssoClientId)
  authorizeUrl.searchParams.set('scope', ALL_SCOPES.join(' '))
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('state', state)

  return new Promise<AuthState>((resolve) => {
    const timeout = setTimeout(
      () => {
        if (pending) {
          pending = null
          loginInFlight = false
          const s: AuthState = { status: 'error', error: 'Login timed out. Please try again.' }
          emit(s)
          resolve(s)
        }
      },
      3 * 60 * 1000
    )
    pending = { state, codeVerifier, clientId: settings.ssoClientId, resolve, timeout }
    shell.openExternal(authorizeUrl.toString())
  })
}

/**
 * Process a captured deep-link callback URL (e.g. `eveauth-firstmate://callback?code=…&state=…`).
 * Called by the main process from the protocol/second-instance/open-url handlers.
 */
export async function handleCallbackUrl(url: string): Promise<void> {
  if (!pending) return
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (!/\/?callback/i.test(parsed.host + parsed.pathname)) return

  const p = pending
  clearTimeout(p.timeout)
  pending = null
  loginInFlight = false

  const code = parsed.searchParams.get('code')
  const returnedState = parsed.searchParams.get('state')
  const err = parsed.searchParams.get('error')

  try {
    if (err) throw new Error(`SSO error: ${err}`)
    if (returnedState !== p.state) throw new Error('State mismatch — possible CSRF, aborting.')
    if (!code) throw new Error('No authorization code returned.')

    const newTokens = await exchangeToken({
      grant_type: 'authorization_code',
      code,
      client_id: p.clientId,
      code_verifier: p.codeVerifier
    })

    tokens = newTokens
    identity = await identityFromAccessToken(newTokens.accessToken, p.clientId)
    saveRefreshToken(newTokens.refreshToken)

    const s: AuthState = { status: 'logged-in', identity }
    emit(s)
    BrowserWindow.getAllWindows()[0]?.focus()
    p.resolve(s)
  } catch (e) {
    const s: AuthState = { status: 'error', error: String(e) }
    emit(s)
    p.resolve(s)
  }
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

/** Attempt to restore a session from a stored refresh token (called on startup). */
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
  identity = await identityFromAccessToken(newTokens.accessToken, settings.ssoClientId)
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
