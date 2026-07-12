import { useEffect, useState } from 'react'
import { genId } from '../lib/hooks'
import { Panel, Loader, EmptyState } from '../components/ui'
import type { CombatSnapshot, CombatFit } from '@shared/types'

export function Combat(): JSX.Element {
  const [snap, setSnap] = useState<CombatSnapshot | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    window.firstmate.combat.get().then(setSnap)
  }, [])

  function persist(next: CombatSnapshot): void {
    setSnap(next)
    window.firstmate.combat.save(next)
  }

  if (!snap) return <Loader label="Loading loadouts…" />

  function addFit(): void {
    if (!snap) return
    const fit: CombatFit = {
      id: genId(),
      name: 'New Fit',
      shipType: '',
      role: '',
      createdAt: Date.now()
    }
    persist({ ...snap, fits: [fit, ...snap.fits] })
    setEditing(fit.id)
  }

  function updateFit(id: string, patch: Partial<CombatFit>): void {
    if (!snap) return
    persist({ ...snap, fits: snap.fits.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  }

  function removeFit(id: string): void {
    if (!snap) return
    if (!confirm('Delete this fit?')) return
    persist({ ...snap, fits: snap.fits.filter((f) => f.id !== id) })
    if (editing === id) setEditing(null)
  }

  return (
    <>
      <Panel title="Combat Notes">
        <textarea
          className="field"
          style={{ minHeight: 90 }}
          placeholder="Tactics, target priorities, gate camps to avoid, fleet doctrine…"
          value={snap.notes}
          onChange={(e) => persist({ ...snap, notes: e.target.value })}
        />
      </Panel>

      <Panel
        title={`Fittings (${snap.fits.length})`}
        actions={
          <button className="btn sm" onClick={addFit}>
            + Fit
          </button>
        }
      >
        {snap.fits.length === 0 ? (
          <EmptyState title="No fits saved">
            Store ship loadouts (paste EFT/pyfa text) and their combat role for quick reference.
          </EmptyState>
        ) : (
          <div className="scroll-list" style={{ maxHeight: 460 }}>
            {snap.fits.map((f) => (
              <div
                key={f.id}
                style={{
                  border: '1px solid var(--border-soft)',
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 8,
                  background: 'var(--bg-elevated)'
                }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <input
                    className="field"
                    placeholder="Fit name"
                    value={f.name}
                    onChange={(e) => updateFit(f.id, { name: e.target.value })}
                  />
                  <button
                    className="btn sm"
                    onClick={() => setEditing(editing === f.id ? null : f.id)}
                  >
                    {editing === f.id ? '▲' : '▼'}
                  </button>
                  <button className="btn sm danger" onClick={() => removeFit(f.id)}>
                    ✕
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: editing === f.id ? 6 : 0 }}>
                  <input
                    className="field"
                    placeholder="Ship / hull"
                    value={f.shipType}
                    onChange={(e) => updateFit(f.id, { shipType: e.target.value })}
                  />
                  <input
                    className="field"
                    placeholder="Role (tackle, DPS, logi…)"
                    value={f.role}
                    onChange={(e) => updateFit(f.id, { role: e.target.value })}
                  />
                </div>
                {editing === f.id && (
                  <>
                    <textarea
                      className="field"
                      style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
                      placeholder="Paste EFT / pyfa fit text here…"
                      value={f.eft ?? ''}
                      onChange={(e) => updateFit(f.id, { eft: e.target.value })}
                    />
                    <input
                      className="field"
                      style={{ marginTop: 6 }}
                      placeholder="Notes"
                      value={f.notes ?? ''}
                      onChange={(e) => updateFit(f.id, { notes: e.target.value })}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}
