import { useEffect, useState } from 'react'
import { genId } from '../lib/hooks'
import { Panel, Loader, EmptyState } from '../components/ui'
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

  useEffect(() => {
    window.firstmate.exploration.get().then(setState)
  }, [])

  function persist(next: ExplorationState): void {
    setState(next)
    window.firstmate.exploration.save(next)
  }

  if (!state) return <Loader label="Loading chain…" />

  const active = state.systems.find((s) => s.id === state.activeSystemId) ?? state.systems[0]

  function addSystem(): void {
    if (!state) return
    const name = prompt('System name or J-code (e.g. J123456, Jita):')?.trim()
    if (!name) return
    const sys: WormholeSystem = {
      id: genId(),
      name,
      signatures: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    persist({ systems: [...state.systems, sys], activeSystemId: sys.id })
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
    if (!confirm('Delete this system and all its signatures?')) return
    const systems = state.systems.filter((s) => s.id !== id)
    persist({ systems, activeSystemId: systems[0]?.id })
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

  function removeSignature(sigId: string): void {
    if (!active) return
    updateSystem(active.id, { signatures: active.signatures.filter((s) => s.id !== sigId) })
  }

  return (
    <>
      <Panel
        title="Chain"
        actions={
          <button className="btn sm" onClick={addSystem}>
            + System
          </button>
        }
      >
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

      {active && (
        <Panel
          title={`Signatures · ${active.name}`}
          actions={
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm" onClick={addSignature}>
                + Sig
              </button>
              <button className="btn sm danger" onClick={() => removeSystem(active.id)}>
                Del
              </button>
            </div>
          }
        >
          <div className="field-group" style={{ marginBottom: 14 }}>
            <input
              className="field"
              placeholder="System class (C1–C6, HS, LS, NS, WH…)"
              value={active.systemClass ?? ''}
              onChange={(e) => updateSystem(active.id, { systemClass: e.target.value })}
            />
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
                      onChange={(e) =>
                        updateSignature(sig.id, {
                          group: e.target.value as WormholeSignature['group']
                        })
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
                        onChange={(e) =>
                          updateSignature(sig.id, {
                            status: e.target.value as WormholeSignature['status']
                          })
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
                    <input
                      className="field"
                      style={{ flex: 1 }}
                      placeholder="Notes"
                      value={sig.notes ?? ''}
                      onChange={(e) => updateSignature(sig.id, { notes: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </>
  )
}
