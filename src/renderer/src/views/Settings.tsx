import { useEffect, useState } from 'react'
import { Panel } from '../components/ui'
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
  const [port, setPort] = useState(settings.callbackPort)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(settings.advisorModel)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setClientId(settings.ssoClientId)
    setPort(settings.callbackPort)
    setModel(settings.advisorModel)
  }, [settings])

  async function save(): Promise<void> {
    const patch: Record<string, unknown> = {
      ssoClientId: clientId.trim(),
      callbackPort: Number(port) || 24123,
      advisorModel: model
    }
    if (apiKey.trim()) patch.anthropicApiKey = apiKey.trim()
    const next = await window.firstmate.settings.update(patch)
    onSaved(next)
    setApiKey('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const redirectUri = `http://localhost:${port}/callback`

  return (
    <>
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
          <label className="field-label">Callback port</label>
          <input
            className="field"
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
        </div>
        <div className="hint">
          Register a free application at{' '}
          <a href="https://developers.eveonline.com" target="_blank" rel="noreferrer">
            developers.eveonline.com
          </a>
          . Choose <strong>Authentication Only</strong> is not enough — pick{' '}
          <strong>Authentication &amp; API Access</strong>, request the scopes you want, and set the
          callback URL to exactly:
          <br />
          <code>{redirectUri}</code>
          <br />
          Then paste the Client ID above. FirstMate uses PKCE, so no secret key is needed.
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
