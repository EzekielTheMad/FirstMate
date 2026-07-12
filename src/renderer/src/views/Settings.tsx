import { useEffect, useState } from 'react'
import { Panel } from '../components/ui'
import { renderMarkdown } from '../lib/format'
import { useUpdates } from '../lib/hooks'
import type { PublicSettings } from '@shared/types'

const MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (most capable)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (balanced)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest)' }
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
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(settings.advisorModel)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setClientId(settings.ssoClientId)
    setScheme(settings.callbackScheme)
    setModel(settings.advisorModel)
  }, [settings])

  // Enforce EVE's scheme rules: start with "eveauth", then lower-case letters,
  // digits, +, ., or - — ending with a letter or digit.
  function sanitizeScheme(v: string): string {
    let s = v.toLowerCase().replace(/[^a-z0-9.+-]/g, '')
    if (!s.startsWith('eveauth')) s = 'eveauth-' + s.replace(/^eveauth-?/, '')
    return s.replace(/[.+-]+$/, '')
  }

  async function save(): Promise<void> {
    const cleanScheme = sanitizeScheme(scheme) || 'eveauth-firstmate'
    const patch: Record<string, unknown> = {
      ssoClientId: clientId.trim(),
      callbackScheme: cleanScheme,
      advisorModel: model
    }
    if (apiKey.trim()) patch.anthropicApiKey = apiKey.trim()
    const next = await window.firstmate.settings.update(patch)
    onSaved(next)
    setScheme(next.callbackScheme)
    setApiKey('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const redirectUri = `${sanitizeScheme(scheme) || 'eveauth-firstmate'}://callback`

  return (
    <>
      <UpdatesPanel />
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
          <label className="field-label">
            Anthropic API key {settings.hasAnthropicKey && <span className="chip green">stored</span>}
          </label>
          <input
            className="field"
            type="password"
            placeholder={settings.hasAnthropicKey ? '•••••••• (leave blank to keep)' : 'sk-ant-…'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Advisor model</label>
          <select className="field" value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="hint">
          Your key is stored locally and encrypted at rest with the OS keystore when available. Get
          one at{' '}
          <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">
            console.anthropic.com
          </a>
          .
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
