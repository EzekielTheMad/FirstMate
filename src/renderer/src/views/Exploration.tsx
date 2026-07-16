import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { ExplorationState, WormholeSignature, WormholeSystem } from '@shared/types'
import {
  buildChainRows,
  createSystem,
  formatShortDuration,
  LIFE_LABELS,
  LIFE_OPTIONS,
  MASS_LABELS,
  MASS_OPTIONS,
  parseScannerResults,
  upsertScannerRows
} from '../lib/exploration'
import { genId } from '../lib/hooks'
import { EmptyState, ErrorBox, Loader, Panel } from '../components/ui'
import { Tooltip } from '../components/Tooltip'

const SIG_GROUPS: WormholeSignature['group'][] = [
  'wormhole',
  'relic',
  'data',
  'gas',
  'combat',
  'unknown'
]

const GROUP_CHIP: Record<WormholeSignature['group'], string> = {
  wormhole: 'purple',
  relic: 'amber',
  data: 'accent',
  gas: 'green',
  combat: 'red',
  unknown: ''
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function utcInput(timestamp?: number): string {
  if (!timestamp) return ''
  return new Date(timestamp).toISOString().slice(0, 16)
}

function parseUtcInput(value: string): number | undefined {
  const parsed = Date.parse(`${value}Z`)
  return Number.isFinite(parsed) ? parsed : undefined
}

function eveTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(timestamp)
}

function lifeTone(life?: WormholeSignature['life']): string {
  if (life === 'expired' || life === 'under-1h') return 'red'
  if (life === 'under-4h' || life === 'under-day') return 'amber'
  if (life === 'over-day') return 'green'
  return ''
}

function massTone(mass?: WormholeSignature['mass']): string {
  if (mass === 'critical') return 'red'
  if (mass === 'reduced') return 'amber'
  if (mass === 'stable') return 'green'
  return ''
}

export function Exploration(): JSX.Element {
  const [state, setState] = useState<ExplorationState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<number>()
  const [addingSystem, setAddingSystem] = useState(false)
  const [systemName, setSystemName] = useState('')
  const [systemClass, setSystemClass] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [scannerText, setScannerText] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingSigDeleteId, setPendingSigDeleteId] = useState<string | null>(null)
  const [creatingDestinationFor, setCreatingDestinationFor] = useState<string | null>(null)
  const [destinationName, setDestinationName] = useState('')
  const [destinationClass, setDestinationClass] = useState('')
  const [now, setNow] = useState(Date.now())
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const saveRevision = useRef(0)
  const latestState = useRef<ExplorationState | null>(null)

  useEffect(() => load(), [])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  function load(): void {
    setLoadError('')
    window.firstmate.exploration
      .get()
      .then((loaded) => {
        setState(loaded)
        latestState.current = loaded
        setShowHelp(loaded.systems.length === 0 || !loaded.helpDismissed)
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : String(error)))
  }

  function persist(next: ExplorationState): void {
    const revision = ++saveRevision.current
    latestState.current = next
    setState(next)
    setSaveState('saving')
    setSaveError('')
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => window.firstmate.exploration.save(next))
      .then(() => {
        if (revision === saveRevision.current) {
          setSaveState('saved')
          setSavedAt(Date.now())
        }
      })
      .catch((error) => {
        if (revision === saveRevision.current) {
          setSaveState('error')
          setSaveError(error instanceof Error ? error.message : String(error))
        }
      })
  }

  function retrySave(): void {
    if (latestState.current) persist(latestState.current)
  }

  if (loadError) return <ErrorBox message={`Could not load the local chain: ${loadError}`} onRetry={load} />
  if (!state) return <Loader label="Loading chain…" />
  const currentState: ExplorationState = state

  const active = currentState.systems.find((system) => system.id === currentState.activeSystemId) ?? currentState.systems[0]
  const activeSignatures = active?.signatures.filter((signature) => !signature.closedAt) ?? []
  const closedSignatures = active?.signatures.filter((signature) => signature.closedAt) ?? []
  const chainRows = buildChainRows(currentState)
  const parsedScan = parseScannerResults(scannerText)

  function addSystem(event: FormEvent): void {
    event.preventDefault()
    const name = systemName.trim()
    if (!name) return
    const system = { ...createSystem(name, genId()), systemClass: systemClass.trim() || undefined }
    persist({
      ...currentState,
      systems: [...currentState.systems, system],
      activeSystemId: system.id,
      rootSystemId: currentState.rootSystemId ?? system.id
    })
    setSystemName('')
    setSystemClass('')
    setAddingSystem(false)
  }

  function updateSystem(id: string, patch: Partial<WormholeSystem>): void {
    persist({
      ...currentState,
      systems: currentState.systems.map((system) =>
        system.id === id ? { ...system, ...patch, updatedAt: Date.now() } : system
      )
    })
  }

  function removeSystem(id: string): void {
    const systems = currentState.systems
      .filter((system) => system.id !== id)
      .map((system) => ({
        ...system,
        signatures: system.signatures.map((signature) =>
          signature.destinationSystemId === id
            ? { ...signature, destinationSystemId: undefined, updatedAt: Date.now() }
            : signature
        )
      }))
    persist({
      ...currentState,
      systems,
      activeSystemId: currentState.activeSystemId === id ? systems[0]?.id : currentState.activeSystemId,
      rootSystemId: currentState.rootSystemId === id ? systems[0]?.id : currentState.rootSystemId
    })
    setPendingDeleteId(null)
  }

  function addSignature(): void {
    if (!active) return
    const signature: WormholeSignature = {
      id: genId(),
      sigId: '',
      group: 'unknown',
      name: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    updateSystem(active.id, { signatures: [...active.signatures, signature] })
  }

  function updateSignature(id: string, patch: Partial<WormholeSignature>): void {
    if (!active) return
    updateSystem(active.id, {
      signatures: active.signatures.map((signature) =>
        signature.id === id ? { ...signature, ...patch, updatedAt: Date.now() } : signature
      )
    })
  }

  function changeGroup(signature: WormholeSignature, group: WormholeSignature['group']): void {
    updateSignature(signature.id, {
      group,
      life: group === 'wormhole' ? (signature.life ?? 'unknown') : undefined,
      mass: group === 'wormhole' ? (signature.mass ?? 'unknown') : undefined,
      lifeObservedAt: group === 'wormhole' ? signature.lifeObservedAt : undefined,
      destinationSystemId: group === 'wormhole' ? signature.destinationSystemId : undefined
    })
  }

  function changeLife(signature: WormholeSignature, life: NonNullable<WormholeSignature['life']>): void {
    updateSignature(signature.id, {
      life,
      lifeObservedAt: life === 'unknown' ? undefined : Date.now()
    })
  }

  function removeSignature(id: string): void {
    if (!active) return
    updateSystem(active.id, { signatures: active.signatures.filter((signature) => signature.id !== id) })
    setPendingSigDeleteId(null)
  }

  function importScanner(): void {
    if (!active || parsedScan.rows.length === 0) return
    const result = upsertScannerRows(active, parsedScan.rows, genId)
    persist({
      ...currentState,
      systems: currentState.systems.map((system) => (system.id === active.id ? result.system : system))
    })
    setImportMessage(`${result.added} added · ${result.updated} refreshed${parsedScan.skipped ? ` · ${parsedScan.skipped} skipped` : ''}`)
    setScannerText('')
  }

  function createDestination(signature: WormholeSignature, open: boolean): void {
    const name = destinationName.trim()
    if (!active || !name) return
    const destination = {
      ...createSystem(name, genId()),
      systemClass: destinationClass.trim() || undefined
    }
    const updatedActive = {
      ...active,
      signatures: active.signatures.map((item) =>
        item.id === signature.id
          ? { ...item, destinationSystemId: destination.id, updatedAt: Date.now() }
          : item
      ),
      updatedAt: Date.now()
    }
    persist({
      ...currentState,
      systems: [...currentState.systems.map((system) => (system.id === active.id ? updatedActive : system)), destination],
      activeSystemId: open ? destination.id : active.id
    })
    setCreatingDestinationFor(null)
    setDestinationName('')
    setDestinationClass('')
  }

  function toggleHelp(): void {
    const open = !showHelp
    setShowHelp(open)
    if (!open && !currentState.helpDismissed) persist({ ...currentState, helpDismissed: true })
  }

  function archiveSystem(system: WormholeSystem): void {
    const archivedAt = system.archivedAt ? undefined : Date.now()
    const systems = currentState.systems.map((item) =>
      item.id === system.id ? { ...item, archivedAt, updatedAt: Date.now() } : item
    )
    const nextActive = archivedAt
      ? systems.find((item) => !item.archivedAt && item.id !== system.id)?.id
      : system.id
    persist({
      ...currentState,
      systems,
      activeSystemId: nextActive ?? system.id,
      rootSystemId: archivedAt && currentState.rootSystemId === system.id
        ? systems.find((item) => !item.archivedAt)?.id
        : currentState.rootSystemId
    })
  }

  return (
    <div className="explore-page">
      <Panel
        title="Explore"
        actions={
          <div className="explore-toolbar-actions">
            <span className={`save-indicator ${saveState}`}>
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && `Saved ${savedAt ? eveTime(savedAt) : ''}`}
              {saveState === 'error' && 'Save failed'}
              {saveState === 'idle' && 'Local'}
            </span>
            <button className="btn sm" onClick={() => setShowImport((open) => !open)} disabled={!active}>
              Import scan
            </button>
            <button className="btn sm" onClick={() => setAddingSystem((open) => !open)}>
              {addingSystem ? 'Cancel' : '+ System'}
            </button>
            <button className="btn sm icon-btn" aria-label="How to use Explore" onClick={toggleHelp}>?</button>
          </div>
        }
      >
        {showHelp && (
          <div className="explore-help">
            <strong>How Explore works</strong>
            <ol>
              <li>Add your current system.</li>
              <li>Paste Probe Scanner rows or add signatures manually.</li>
              <li>On a wormhole, create or link its destination to build the chain.</li>
              <li>Update Life and Mass as you observe them; close the connection when it disappears.</li>
            </ol>
            <div className="hint">
              The chain is saved only on this computer. ESI does not provide scanned signatures or wormhole connections.
            </div>
          </div>
        )}

        {addingSystem && (
          <form className="explore-form-grid" onSubmit={addSystem}>
            <div className="field-group">
              <label className="field-label" htmlFor="new-system-name">System name or J-code</label>
              <input id="new-system-name" className="field" autoFocus placeholder="J123456 or Jita" value={systemName} onChange={(event) => setSystemName(event.target.value)} />
            </div>
            <div className="field-group compact-field">
              <label className="field-label" htmlFor="new-system-class">
                <Tooltip content="Use C1–C6, HS, LS, NS, Thera, or your own shorthand.">Class</Tooltip>
              </label>
              <input id="new-system-class" className="field" placeholder="C3, HS, LS…" value={systemClass} onChange={(event) => setSystemClass(event.target.value)} />
            </div>
            <button className="btn primary form-submit" type="submit" disabled={!systemName.trim()}>Add system</button>
          </form>
        )}

        {showImport && active && (
          <div className="scanner-import">
            <label className="field-label" htmlFor="scanner-paste">Paste Probe Scanner results for {active.name}</label>
            <textarea id="scanner-paste" className="field" autoFocus placeholder={'ABC-123\tCosmic Signature\tWormhole\tUnstable Wormhole…'} value={scannerText} onChange={(event) => setScannerText(event.target.value)} />
            <div className="scanner-preview">
              {scannerText && parsedScan.rows.length === 0 ? 'No probe-scanner rows found.' : `${parsedScan.rows.length} signature${parsedScan.rows.length === 1 ? '' : 's'} found${parsedScan.skipped ? ` · ${parsedScan.skipped} skipped` : ''}`}
            </div>
            <div className="actions">
              <button className="btn primary sm" disabled={parsedScan.rows.length === 0} onClick={importScanner}>Import signatures</button>
              <button className="btn sm" onClick={() => setShowImport(false)}>Done</button>
            </div>
            {importMessage && <div className="hint">Last import: {importMessage}</div>}
          </div>
        )}

        {saveError && <ErrorBox message={`Could not save the local chain: ${saveError}`} onRetry={retrySave} />}

        {state.systems.length === 0 ? (
          <EmptyState title="Start your chain">Add the system you are in, then import your scan results.</EmptyState>
        ) : (
          <div className="chain-map" aria-label="Wormhole chain map">
            <div className="chain-map-heading">Chain map</div>
            {chainRows.map((row, index) => (
              <div key={`${row.system.id}-${index}`} className="chain-row" style={{ '--chain-depth': row.depth } as CSSProperties}>
                {row.via && (
                  <div className="chain-edge">
                    <span>↳ {row.via.sigId || 'Unscanned'}</span>
                    {row.via.wormholeType && <span className="chip purple">{row.via.wormholeType}</span>}
                    <span className={`chip ${lifeTone(row.via.life)}`}>{LIFE_LABELS[row.via.life ?? 'unknown']}</span>
                    <span className={`chip ${massTone(row.via.mass)}`}>{MASS_LABELS[row.via.mass ?? 'unknown']}</span>
                  </div>
                )}
                <button className={`chain-system ${row.system.id === active?.id ? 'active' : ''}`} onClick={() => persist({ ...state, activeSystemId: row.system.id })}>
                  <span><strong>{row.system.name}</strong>{row.system.systemClass ? ` · ${row.system.systemClass}` : ''}</span>
                  <span className="faint">{row.cycle ? '↩ linked above' : `${row.system.signatures.filter((signature) => !signature.closedAt).length} sigs`}</span>
                </button>
                {!row.cycle && row.system.signatures.filter((signature) => signature.group === 'wormhole' && !signature.closedAt && !signature.destinationSystemId).map((signature) => (
                  <button key={signature.id} className="chain-unlinked" onClick={() => persist({ ...state, activeSystemId: row.system.id })}>
                    ↳ {signature.sigId || 'Unscanned'} · Unknown destination · Link
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {active && (
        <Panel
          title={`System · ${active.name}`}
          actions={
            <div className="actions">
              <button className="btn sm" onClick={() => persist({ ...state, rootSystemId: active.id })}>Set root</button>
              <button className="btn sm" onClick={addSignature}>+ Signature</button>
              <button className="btn sm" onClick={() => archiveSystem(active)}>Archive</button>
              <button className="btn sm danger" onClick={() => setPendingDeleteId(active.id)}>Delete…</button>
            </div>
          }
        >
          {pendingDeleteId === active.id && (
            <div className="confirm-box">
              <span>Delete {active.name}, its signatures, and unlink every route to it?</span>
              <div className="actions">
                <button className="btn sm" onClick={() => setPendingDeleteId(null)}>Cancel</button>
                <button className="btn sm danger" onClick={() => removeSystem(active.id)}>Delete system</button>
              </div>
            </div>
          )}

          <div className="system-fields">
            <div className="field-group">
              <label className="field-label">System name</label>
              <input className="field" value={active.name} onChange={(event) => updateSystem(active.id, { name: event.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label"><Tooltip content="Use C1–C6, HS, LS, NS, Thera, or your own shorthand.">System class</Tooltip></label>
              <input className="field" placeholder="C1–C6, HS, LS, NS…" value={active.systemClass ?? ''} onChange={(event) => updateSystem(active.id, { systemClass: event.target.value || undefined })} />
            </div>
          </div>

          {activeSignatures.length === 0 ? (
            <EmptyState title="No active signatures">Import your Probe Scanner results or add one manually.</EmptyState>
          ) : (
            <div className="signature-list">
              {activeSignatures.map((signature) => (
                <details className="signature-card" key={signature.id} open={signature.group === 'wormhole'}>
                  <summary>
                    <span className="signature-title">{signature.sigId || 'New signature'}</span>
                    <span className={`chip ${GROUP_CHIP[signature.group]}`}>{signature.group}</span>
                    {signature.group === 'wormhole' && <span className={`chip ${lifeTone(signature.life)}`}>{LIFE_LABELS[signature.life ?? 'unknown']}</span>}
                    {signature.group === 'wormhole' && <span className={`chip ${massTone(signature.mass)}`}>{MASS_LABELS[signature.mass ?? 'unknown']}</span>}
                  </summary>
                  <div className="signature-body">
                    <div className="signature-base-fields">
                      <div className="field-group"><label className="field-label">Signature ID</label><input className="field" placeholder="ABC-123" value={signature.sigId} onChange={(event) => updateSignature(signature.id, { sigId: event.target.value.toUpperCase() })} /></div>
                      <div className="field-group"><label className="field-label">Group</label><select className="field" value={signature.group} onChange={(event) => changeGroup(signature, event.target.value as WormholeSignature['group'])}>{SIG_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}</select></div>
                    </div>

                    {signature.group === 'wormhole' ? (
                      <>
                        <div className="wormhole-grid">
                          <div className="field-group">
                            <label className="field-label"><Tooltip content="K162 is the generic exit-side code. Entrance codes such as H296 describe the connection.">Wormhole type</Tooltip></label>
                            <input className="field" placeholder="K162, H296…" value={signature.wormholeType ?? ''} onChange={(event) => updateSignature(signature.id, { wormholeType: event.target.value.toUpperCase() || undefined })} />
                          </div>
                          <div className="field-group">
                            <label className="field-label">Destination</label>
                            <select className="field" value={signature.destinationSystemId ?? ''} onChange={(event) => updateSignature(signature.id, { destinationSystemId: event.target.value || undefined })}>
                              <option value="">Unknown / unlinked</option>
                              {state.systems.filter((system) => system.id !== active.id && !system.archivedAt).map((system) => <option key={system.id} value={system.id}>{system.name}{system.systemClass ? ` · ${system.systemClass}` : ''}</option>)}
                            </select>
                          </div>
                        </div>

                        {creatingDestinationFor === signature.id ? (
                          <div className="destination-create">
                            <input className="field" autoFocus placeholder="Destination name / J-code" value={destinationName} onChange={(event) => setDestinationName(event.target.value)} />
                            <input className="field" placeholder="Class (C3, HS…)" value={destinationClass} onChange={(event) => setDestinationClass(event.target.value)} />
                            <div className="actions"><button className="btn primary sm" disabled={!destinationName.trim()} onClick={() => createDestination(signature, true)}>Create & open</button><button className="btn sm" onClick={() => createDestination(signature, false)} disabled={!destinationName.trim()}>Create</button><button className="btn sm" onClick={() => setCreatingDestinationFor(null)}>Cancel</button></div>
                          </div>
                        ) : (
                          <button className="btn sm" onClick={() => { setCreatingDestinationFor(signature.id); setDestinationName(''); setDestinationClass('') }}>+ Create destination system</button>
                        )}

                        <div className="life-mass-grid">
                          <div className="field-group">
                            <label className="field-label"><Tooltip content="Reliable lifetime is observed in game. It is not a guaranteed collapse countdown.">Life</Tooltip></label>
                            <select className="field" value={signature.life ?? 'unknown'} onChange={(event) => changeLife(signature, event.target.value as NonNullable<WormholeSignature['life']>)}>{LIFE_OPTIONS.map((life) => <option key={life} value={life}>{LIFE_LABELS[life]}</option>)}</select>
                          </div>
                          <div className="field-group">
                            <label className="field-label"><Tooltip content="Mass is independent of lifetime: stable >50%, reduced <50%, critical <10%.">Mass</Tooltip></label>
                            <select className="field" value={signature.mass ?? 'unknown'} onChange={(event) => updateSignature(signature.id, { mass: event.target.value as NonNullable<WormholeSignature['mass']> })}>{MASS_OPTIONS.map((mass) => <option key={mass} value={mass}>{MASS_LABELS[mass]}</option>)}</select>
                          </div>
                        </div>

                        <div className="observation-row">
                          <button className="btn sm" onClick={() => updateSignature(signature.id, { life: 'under-4h', lifeObservedAt: Date.now() })}>Mark &lt;4h now</button>
                          {signature.lifeObservedAt && <span className="hint">Observed {eveTime(signature.lifeObservedAt)} EVE · {formatShortDuration(now - signature.lifeObservedAt)} ago · recheck in game</span>}
                        </div>
                        {signature.life !== 'unknown' && (
                          <div className="field-group timestamp-field"><label className="field-label">Observed at (EVE / UTC)</label><input className="field" type="datetime-local" value={utcInput(signature.lifeObservedAt)} onChange={(event) => updateSignature(signature.id, { lifeObservedAt: parseUtcInput(event.target.value) })} /></div>
                        )}
                      </>
                    ) : (
                      <div className="field-group"><label className="field-label">Site name</label><input className="field" value={signature.name} onChange={(event) => updateSignature(signature.id, { name: event.target.value })} /></div>
                    )}

                    <div className="field-group"><label className="field-label">Notes</label><textarea className="field compact-textarea" value={signature.notes ?? ''} onChange={(event) => updateSignature(signature.id, { notes: event.target.value })} /></div>
                    <div className="signature-actions">
                      {signature.group === 'wormhole' && <button className="btn sm" onClick={() => updateSignature(signature.id, { closedAt: Date.now() })}>Close connection</button>}
                      {pendingSigDeleteId === signature.id ? <><span className="hint">Delete permanently?</span><button className="btn sm danger" onClick={() => removeSignature(signature.id)}>Yes, delete</button><button className="btn sm" onClick={() => setPendingSigDeleteId(null)}>Cancel</button></> : <button className="btn sm danger" onClick={() => setPendingSigDeleteId(signature.id)}>Delete signature…</button>}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}

          {closedSignatures.length > 0 && (
            <details className="closed-section">
              <summary>Closed connections ({closedSignatures.length})</summary>
              {closedSignatures.map((signature) => <div className="closed-row" key={signature.id}><span>{signature.sigId || 'Unscanned'}{signature.closedAt ? ` · closed ${eveTime(signature.closedAt)} EVE` : ''}</span><button className="btn sm" onClick={() => updateSignature(signature.id, { closedAt: undefined })}>Restore</button></div>)}
            </details>
          )}

          {state.systems.some((system) => system.archivedAt) && (
            <details className="closed-section">
              <summary>Archived systems ({state.systems.filter((system) => system.archivedAt).length})</summary>
              {state.systems.filter((system) => system.archivedAt).map((system) => <div className="closed-row" key={system.id}><span>{system.name}{system.systemClass ? ` · ${system.systemClass}` : ''}</span><button className="btn sm" onClick={() => archiveSystem(system)}>Restore & open</button></div>)}
            </details>
          )}
        </Panel>
      )}
    </div>
  )
}
