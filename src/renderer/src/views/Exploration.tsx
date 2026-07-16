import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { genId } from '../lib/hooks'
import { Panel, Loader, EmptyState, ErrorBox } from '../components/ui'
import {
  createSystem,
  formatShortDuration,
  getEolWindow,
  updateWormholeStatus
} from '../lib/exploration'
import type {
  ExplorationState,
  WormholeSystem,
  WormholeSignature
} from '@shared/types'

const SIG_GROUPS: WormholeSignature['group'][] = [
  'wormhole',
  'relic',
  'data',
  'gas',
  'combat',
  'unknown'
]
const WH_STATUS: NonNullable<WormholeSignature['status']>[] = [
  'fresh',
  'stable',
  'reduced',
  'critical',
  'eol'
]

const GROUP_CHIP: Record<WormholeSignature['group'], string> = {
  wormhole: 'purple',
  relic: 'amber',
  data: 'accent',
  gas: 'green',
  combat: 'red',
  unknown: ''
}

export function Exploration(): JSX.Element {
  const [state, setState] = useState<ExplorationState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [addingSystem, setAddingSystem] = useState(false)
  const [systemName, setSystemName] = useState('')
  const [systemClass, setSystemClass] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  function load(): void {
    setLoadError('')
    window.firstmate.exploration
      .get()
      .then(setState)
      .catch((error) => setLoadError(error instanceof Error ? error.message : String(error)))
  }

  function persist(next: ExplorationState): void {
    setState(next)
    setSaveError('')
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => window.firstmate.exploration.save(next))
      .catch((error) => setSaveError(error instanceof Error ? error.message : String(error)))
  }

  if (loadError) return <ErrorBox message={`Could not load the local chain: ${loadError}`} onRetry={load} />
  if (!state) return <Loader label="Loading chain…" />

  const active = state.systems.find((s) => s.id === state.activeSystemId) ?? state.systems[0]

  function addSystem(event: FormEvent): void {
    event.preventDefault()
    if (!state) return
    const name = systemName.trim()
    if (!name) return
    const sys: WormholeSystem = {
      ...createSystem(name, genId()),
      systemClass: systemClass.trim() || undefined
    }
    persist({ systems: [...state.systems, sys], activeSystemId: sys.id })
    setSystemName('')
    setSystemClass('')
    setAddingSystem(false)
  }

  function updateSystem(id: string, patch: Partial<WormholeSystem>): void {
    if (!state) return
    persist({
      ...state,
      systems: state.systems.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s
      )
    })
  }

  function removeSystem(id: string): void {
    if (!state) return
    const systems = state.systems.filter((s) => s.id !== id)
    persist({ systems, activeSystemId: systems[0]?.id })
    setPendingDeleteId(null)
  }

  function addSignature(): void {
    if (!active) return
    const sig: WormholeSignature = {
      id: genId(),
      sigId: '',
      group: 'unknown',
      name: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    updateSystem(active.id, { signatures: [...active.signatures, sig] })
  }

  function updateSignature(sigId: string, patch: Partial<WormholeSignature>): void {
    if (!active) return
    updateSystem(active.id, {
      signatures: active.signatures.map((s) =>
        s.id === sigId ? { ...s, ...patch, updatedAt: Date.now() } : s
      )
    })
  }

  function changeSignatureGroup(sig: WormholeSignature, group: WormholeSignature['group']): void {
    updateSignature(sig.id, {
      group,
      status: group === 'wormhole' ? (sig.status ?? 'fresh') : undefined,
      eolMarkedAt: group === 'wormhole' ? sig.eolMarkedAt : undefined
    })
  }

  function changeWormholeStatus(
    sig: WormholeSignature,
    status: NonNullable<WormholeSignature['status']>
  ): void {
    if (!active) return
    updateSystem(active.id, {
      signatures: active.signatures.map((item) =>
        item.id === sig.id ? updateWormholeStatus(item, status) : item
      )
    })
  }

  function removeSignature(sigId: string): void {
    if (!active) return
    updateSystem(active.id, { signatures: active.signatures.filter((s) => s.id !== sigId) })
  }

  return (
    <>
      <Panel
        title="Chain"
        actions={
          <button className="btn sm" onClick={() => setAddingSystem((open) => !open)}>
            {addingSystem ? 'Cancel' : '+ System'}
          </button>
        }
      >
        {addingSystem && (
          <form onSubmit={addSystem} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="field-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="field-label" htmlFor="new-system-name">
                  System name or J-code
                </label>
                <input
                  id="new-system-name"
                  className="field"
                  autoFocus
                  placeholder="J123456 or Jita"
                  value={systemName}
                  onChange={(event) => setSystemName(event.target.value)}
                />
              </div>
              <div className="field-group" style={{ width: 150, marginBottom: 0 }}>
                <label className="field-label" htmlFor="new-system-class">
                  Class
                </label>
                <input
                  id="new-system-class"
                  className="field"
                  placeholder="C3, HS, LS…"
                  value={systemClass}
                  onChange={(event) => setSystemClass(event.target.value)}
                />
              </div>
              <button className="btn primary" type="submit" disabled={!systemName.trim()}>
                Add
              </button>
            </div>
          </form>
        )}

        {state.systems.length === 0 ? (
          <EmptyState title="No systems tracked">
            Add the system you are in, then log its scanned signatures. Wormhole connections are
            not exposed by ESI, so this chain is tracked locally.
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {state.systems.map((s) => (
              <button
                key={s.id}
                className={`btn sm ${s.id === active?.id ? 'primary' : ''}`}
                onClick={() => persist({ ...state, activeSystemId: s.id })}
              >
                {s.name}
                {s.systemClass ? ` · ${s.systemClass}` : ''}{' '}
                <span className="faint">({s.signatures.length})</span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {saveError && <ErrorBox message={`Could not save the local chain: ${saveError}`} />}

      {active && (
        <Panel
          title={`Signatures · ${active.name}`}
          actions={
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm" onClick={addSignature}>
                + Sig
              </button>
              <button
                className="btn sm danger"
                onClick={() => setPendingDeleteId(active.id)}
              >
                Del
              </button>
            </div>
          }
        >
          {pendingDeleteId === active.id && (
            <div
              className="row"
              style={{ marginBottom: 14, padding: 10, border: '1px solid var(--red)' }}
            >
              <span className="grow">
                Delete {active.name} and all {active.signatures.length} signatures?
              </span>
              <button className="btn sm" onClick={() => setPendingDeleteId(null)}>
                Cancel
              </button>
              <button className="btn sm danger" onClick={() => removeSystem(active.id)}>
                Delete system
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div className="field-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="field-label">System name</label>
              <input
                className="field"
                value={active.name}
                onChange={(event) => updateSystem(active.id, { name: event.target.value })}
              />
            </div>
            <div className="field-group" style={{ width: 180, marginBottom: 0 }}>
              <label className="field-label">System class</label>
              <input
                className="field"
                placeholder="C1–C6, HS, LS, NS…"
                value={active.systemClass ?? ''}
                onChange={(event) =>
                  updateSystem(active.id, { systemClass: event.target.value || undefined })
                }
              />
            </div>
          </div>

          {active.signatures.length === 0 ? (
            <EmptyState title="No signatures yet">
              Paste a signature ID from your in-game scanner and classify it.
            </EmptyState>
          ) : (
            <div className="scroll-list" style={{ maxHeight: 420 }}>
              {active.signatures.map((sig) => (
                <div
                  key={sig.id}
                  style={{
                    border: '1px solid var(--border-soft)',
                    borderRadius: 6,
                    padding: 10,
                    marginBottom: 8,
                    background: 'var(--bg-elevated)'
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      className="field"
                      style={{ maxWidth: 110 }}
                      placeholder="ABC-123"
                      value={sig.sigId}
                      onChange={(e) => updateSignature(sig.id, { sigId: e.target.value })}
                    />
                    <select
                      className="field"
                      value={sig.group}
                      onChange={(event) =>
                        changeSignatureGroup(
                          sig,
                          event.target.value as WormholeSignature['group']
                        )
                      }
                    >
                      {SIG_GROUPS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <button className="btn sm danger" onClick={() => removeSignature(sig.id)}>
                      ✕
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      className="field"
                      placeholder={sig.group === 'wormhole' ? 'Destination (C3, HS, K162…)' : 'Name'}
                      value={sig.group === 'wormhole' ? (sig.destination ?? '') : sig.name}
                      onChange={(e) =>
                        updateSignature(
                          sig.id,
                          sig.group === 'wormhole'
                            ? { destination: e.target.value }
                            : { name: e.target.value }
                        )
                      }
                    />
                    {sig.group === 'wormhole' && (
                      <select
                        className="field"
                        style={{ maxWidth: 120 }}
                        value={sig.status ?? 'fresh'}
                        onChange={(event) =>
                          changeWormholeStatus(
                            sig,
                            event.target.value as NonNullable<WormholeSignature['status']>
                          )
                        }
                      >
                        {WH_STATUS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`chip ${GROUP_CHIP[sig.group]}`}>{sig.group}</span>
                    {sig.group === 'wormhole' && sig.status && (
                      <span
                        className={`chip ${
                          sig.status === 'critical' || sig.status === 'eol'
                            ? 'red'
                            : sig.status === 'reduced'
                              ? 'amber'
                              : 'green'
                        }`}
                      >
                        {sig.status}
                      </span>
                    )}
                    {(() => {
                      const eol = getEolWindow(sig, now)
                      if (!eol) return null
                      return (
                        <span className="faint" style={{ fontSize: 11 }}>
                          EOL {formatShortDuration(eol.elapsedMs)} ago ·{' '}
                          {eol.windowPassed
                            ? '4h window passed'
                            : `≤ ${formatShortDuration(eol.remainingMs)} window`}
                        </span>
                      )
                    })()}
                    <input
                      className="field"
                      style={{ flex: 1 }}
                      placeholder="Notes"
                      value={sig.notes ?? ''}
                      onChange={(e) => updateSignature(sig.id, { notes: e.target.value })}
                    />
                  </div>
                  {sig.status === 'eol' && (
                    <div className="hint" style={{ marginTop: 6 }}>
                      EOL holes may collapse at any time. The four-hour display is a conservative
                      upper-bound planning window, not a guaranteed expiry time.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </>
  )
}
