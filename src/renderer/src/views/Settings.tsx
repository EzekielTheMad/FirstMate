import { useEffect, useState } from 'react'
import { Panel } from '../components/ui'
import { renderMarkdown } from '../lib/format'
import { useUpdates } from '../lib/hooks'
import type {
  AdvisorConnectionResult,
  AdvisorProvider,
  PublicSettings
} from '@shared/types'

const PROVIDERS: Array<{ id: AdvisorProvider; label: string }> = [
  { id: 'disabled', label: 'Disabled (default)' },
  { id: 'hermes', label: 'Hermes Agent' },
  { id: 'anthropic', label: 'Anthropic API' },
  { id: 'openai', label: 'OpenAI API' },
  { id: 'compatible', label: 'Custom / OpenAI-compatible' }
]

const PROVIDER_DEFAULTS: Record<AdvisorProvider, { model: string; baseUrl: string }> = {
  disabled: { model: '', baseUrl: '' },
  anthropic: { model: 'claude-opus-4-8', baseUrl: '' },
  openai: { model: 'gpt-5.4', baseUrl: '' },
  hermes: { model: 'hermes-agent', baseUrl: 'http://127.0.0.1:8642/v1' },
  compatible: { model: 'local-model', baseUrl: 'http://127.0.0.1:1234/v1' }
}

const MODEL_PRESETS: Record<AdvisorProvider, string[]> = {
  disabled: [],
  anthropic: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'],
  openai: ['gpt-5.6', 'gpt-5.4', 'gpt-5.4-mini'],
  hermes: ['hermes-agent'],
  compatible: []
}

const ZOOM_STEPS = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5]

const REFRESH_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 300, label: '5m' }
]

export function Settings({
  settings,
  onSaved
}: {
  settings: PublicSettings
  onSaved: (s: PublicSettings) => void
}): JSX.Element {
  const [clientId, setClientId] = useState(settings.ssoClientId)
  const [scheme, setScheme] = useState(settings.callbackScheme)
  const [provider, setProvider] = useState<AdvisorProvider>(settings.advisorProvider)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(settings.advisorModel)
  const [baseUrl, setBaseUrl] = useState(settings.advisorBaseUrl)
  const [sessionKey, setSessionKey] = useState(settings.advisorSessionKey)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connection, setConnection] = useState<AdvisorConnectionResult | null>(null)

  useEffect(() => {
    setClientId(settings.ssoClientId)
    setScheme(settings.callbackScheme)
    setProvider(settings.advisorProvider)
    setModel(settings.advisorModel)
    setBaseUrl(settings.advisorBaseUrl)
    setSessionKey(settings.advisorSessionKey)
  }, [settings])

  // Enforce EVE's scheme rules: start with "eveauth", then lower-case letters,
  // digits, +, ., or - — ending with a letter or digit.
  function sanitizeScheme(v: string): string {
    let s = v.toLowerCase().replace(/[^a-z0-9.+-]/g, '')
    if (!s.startsWith('eveauth')) s = 'eveauth-' + s.replace(/^eveauth-?/, '')
    return s.replace(/[.+-]+$/, '')
  }

  async function persist(showSaved = true): Promise<PublicSettings> {
    const cleanScheme = sanitizeScheme(scheme) || 'eveauth-firstmate'
    const patch: Record<string, unknown> = {
      ssoClientId: clientId.trim(),
      callbackScheme: cleanScheme,
      advisorProvider: provider,
      advisorModel: model.trim(),
      advisorBaseUrl: baseUrl.trim(),
      advisorSessionKey: sessionKey.trim() || 'firstmate'
    }
    if (apiKey.trim()) {
      if (provider === 'anthropic') patch.anthropicApiKey = apiKey.trim()
      if (provider === 'openai') patch.openaiApiKey = apiKey.trim()
      if (provider === 'hermes') patch.hermesApiKey = apiKey.trim()
      if (provider === 'compatible') patch.compatibleApiKey = apiKey.trim()
    }
    const next = await window.firstmate.settings.update(patch)
    onSaved(next)
    setScheme(next.callbackScheme)
    setApiKey('')
    if (showSaved) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    }
    return next
  }

  async function save(): Promise<void> {
    await persist()
  }

  function changeProvider(next: AdvisorProvider): void {
    setProvider(next)
    setModel(PROVIDER_DEFAULTS[next].model)
    setBaseUrl(PROVIDER_DEFAULTS[next].baseUrl)
    setApiKey('')
    setConnection(null)
  }

  async function testConnection(): Promise<void> {
    if (testing || provider === 'disabled') return
    setTesting(true)
    setConnection(null)
    try {
      await persist(false)
      setConnection(await window.firstmate.advisor.testConnection())
    } catch (error) {
      setConnection({ ok: false, message: (error as Error).message || String(error) })
    } finally {
      setTesting(false)
    }
  }

  const hasStoredKey =
    (provider === 'anthropic' && settings.hasAnthropicKey) ||
    (provider === 'openai' && settings.hasOpenAIKey) ||
    (provider === 'hermes' && settings.hasHermesKey) ||
    (provider === 'compatible' && settings.hasCompatibleKey)

  const keyLabel =
    provider === 'hermes'
      ? 'Hermes bearer key'
      : provider === 'compatible'
        ? 'Endpoint API key (optional)'
        : `${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key`

  const redirectUri = `${sanitizeScheme(scheme) || 'eveauth-firstmate'}://callback`

  async function setZoom(factor: number): Promise<void> {
    await window.firstmate.window.setZoom(factor)
    const next = await window.firstmate.settings.get()
    onSaved(next)
  }

  async function setAutoRefresh(seconds: number): Promise<void> {
    const next = await window.firstmate.settings.update({ autoRefreshSeconds: seconds })
    onSaved(next)
  }

  return (
    <>
      <UpdatesPanel />

      <Panel title="Display">
        <div className="field-group">
          <label className="field-label">Text size</label>
          <div className="actions">
            {ZOOM_STEPS.map((z) => (
              <button
                key={z}
                className={`btn sm ${Math.abs(settings.zoomFactor - z) < 0.001 ? 'primary' : ''}`}
                onClick={() => setZoom(z)}
              >
                {Math.round(z * 100)}%
              </button>
            ))}
          </div>
          <div className="hint">Also bound to Ctrl+= / Ctrl+- / Ctrl+0 in the app window.</div>
        </div>
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label className="field-label">Auto-refresh (Dashboard &amp; Economy)</label>
          <div className="actions">
            {REFRESH_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`btn sm ${settings.autoRefreshSeconds === o.value ? 'primary' : ''}`}
                onClick={() => setAutoRefresh(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="EVE SSO">
        <div className="field-group">
          <label className="field-label">Client ID</label>
          <input
            className="field"
            placeholder="Paste your EVE application Client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Callback scheme</label>
          <input
            className="field"
            placeholder="eveauth-firstmate"
            value={scheme}
            onChange={(e) => setScheme(e.target.value)}
            onBlur={() => setScheme(sanitizeScheme(scheme))}
          />
        </div>
        <div className="hint">
          Register a free application at{' '}
          <a href="https://developers.eveonline.com" target="_blank" rel="noreferrer">
            developers.eveonline.com
          </a>
          . Connection type <strong>Authentication &amp; API Access</strong>, request the scopes you
          want, and set the <strong>Callback URL</strong> to exactly:
          <br />
          <code>{redirectUri}</code>
          <br />
          EVE only accepts a custom scheme starting with <code>eveauth</code> (or an https URL), so
          FirstMate registers this as a desktop protocol and captures the redirect. Then paste the
          Client ID above. PKCE is used, so no secret key is needed.
        </div>
      </Panel>

      <Panel title="AI Advisor">
        <div className="field-group">
          <label className="field-label">Provider</label>
          <select
            className="field"
            value={provider}
            onChange={(e) => changeProvider(e.target.value as AdvisorProvider)}
          >
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {provider !== 'disabled' && (
          <>
            {(provider === 'hermes' || provider === 'compatible') && (
              <div className="field-group">
                <label className="field-label">Server URL</label>
                <input
                  className="field"
                  placeholder={PROVIDER_DEFAULTS[provider].baseUrl}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
                <div className="hint">
                  Include the API prefix, usually <code>/v1</code>. Use HTTPS for remote servers.
                </div>
              </div>
            )}

            <div className="field-group">
              <label className="field-label">
                {keyLabel} {hasStoredKey && <span className="chip green">stored</span>}
              </label>
              <input
                className="field"
                type="password"
                placeholder={hasStoredKey ? '•••••••• (leave blank to keep)' : 'Enter access key'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label className="field-label">Advisor model</label>
              <input
                className="field"
                list="advisor-model-presets"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <datalist id="advisor-model-presets">
                {MODEL_PRESETS[provider].map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>

            {provider === 'hermes' && (
              <div className="field-group">
                <label className="field-label">Hermes session scope</label>
                <input
                  className="field"
                  placeholder="firstmate"
                  value={sessionKey}
                  onChange={(e) => setSessionKey(e.target.value)}
                />
                <div className="hint">
                  Keeps FirstMate memory separate from unrelated Hermes conversations.
                </div>
              </div>
            )}

            <div className="actions">
              <button className="btn sm" onClick={testConnection} disabled={testing}>
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              {connection && (
                <span className={`chip ${connection.ok ? 'green' : ''}`}>{connection.message}</span>
              )}
            </div>
          </>
        )}

        <div className="hint" style={{ marginTop: 10 }}>
          AI is optional. FirstMate never switches providers or falls back to a paid API unless you
          configure it. Access keys are encrypted with the OS keystore when available.
        </div>
      </Panel>

      <div className="actions">
        <button className="btn primary" onClick={save}>
          {saved ? 'Saved ✓' : 'Save settings'}
        </button>
      </div>

      <div className="hint" style={{ marginTop: 16 }}>
        FirstMate v0.1 — an unofficial EVE Online companion. Not affiliated with CCP Games. All API
        access is read-only.
      </div>
    </>
  )
}

function UpdatesPanel(): JSX.Element {
  const state = useUpdates()

  async function check(): Promise<void> {
    await window.firstmate.updates.check()
  }
  async function download(): Promise<void> {
    await window.firstmate.updates.download()
  }
  function install(): void {
    window.firstmate.updates.install()
  }

  const status = state?.status ?? 'idle'
  const version = state?.currentVersion ?? '—'

  return (
    <Panel
      title="Updates"
      actions={
        <button className="btn sm" onClick={check} disabled={status === 'checking'}>
          {status === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
      }
    >
      <div className="row">
        <span className="dim">Current version</span>
        <span className="grow" />
        <span className="mono">v{version}</span>
      </div>

      {status === 'up-to-date' && (
        <div className="hint" style={{ marginTop: 8 }}>
          You’re on the latest version.
        </div>
      )}

      {status === 'error' && state?.error && (
        <div className="hint" style={{ marginTop: 8 }}>
          Couldn’t check for updates: {state.error}
        </div>
      )}

      {(status === 'available' || status === 'downloading' || status === 'downloaded') &&
        state?.newVersion && (
          <div style={{ marginTop: 12 }}>
            <div className="row">
              <strong>Version {state.newVersion} available</strong>
              <span className="grow" />
              <span className="chip accent">new</span>
            </div>

            {state.releaseNotes ? (
              <div
                className="md"
                style={{ marginTop: 8 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(state.releaseNotes) }}
              />
            ) : (
              <div className="hint" style={{ marginTop: 8 }}>
                Release notes unavailable.
              </div>
            )}

            <div className="actions" style={{ marginTop: 12 }}>
              {status === 'available' && (
                <button className="btn primary" onClick={download}>
                  Download &amp; install
                </button>
              )}
              {status === 'downloading' && (
                <button className="btn primary" disabled>
                  Downloading… {state.percent ?? 0}%
                </button>
              )}
              {status === 'downloaded' && (
                <button className="btn primary" onClick={install}>
                  Restart &amp; install
                </button>
              )}
            </div>
          </div>
        )}
    </Panel>
  )
}
