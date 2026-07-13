import { useMemo, useState } from 'react'
import { useAsync } from '../lib/hooks'
import { isk, num } from '../lib/format'
import { Panel, Stat, Loader, ErrorBox, EmptyState, UpdatedAgo } from '../components/ui'
import type { EsiResult, FittedItem, ShipInfo, ShipSlot, ShipsData } from '@shared/types'

const SLOT_ORDER: ShipSlot[] = [
  'High',
  'Mid',
  'Low',
  'Rig',
  'Subsystem',
  'Drones',
  'Fighters',
  'Cargo',
  'Hold',
  'Other'
]

export function Ships({ autoRefreshMs }: { autoRefreshMs?: number }): JSX.Element {
  const { loading, data, error, reload, lastUpdatedAt } = useAsync<EsiResult<ShipsData>>(
    () => window.firstmate.esi.ships(),
    [],
    autoRefreshMs
  )

  if (loading) return <Loader label="Surveying the hangar…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load ships data.'} onRetry={reload} />
  }

  const s = data.data

  return (
    <>
      <Panel
        title="Ships"
        actions={
          <>
            <UpdatedAgo at={lastUpdatedAt} />
            <button className="btn sm" onClick={reload}>
              ↻
            </button>
          </>
        }
      >
        <div className="grid-2">
          <Stat
            label="Total Value"
            value={isk(s.totalValue, true)}
            sub="hull + fittings, current market price"
            tone="amber"
          />
          <Stat label="Ships" value={num(s.ships.length)} sub="docked, stored, and active" />
        </div>
      </Panel>

      <Panel title="Hangar">
        {s.ships.length === 0 ? (
          <EmptyState title="No ships found">
            Ships you own — docked, stored, or currently flown — will appear here with their
            fittings and cargo.
          </EmptyState>
        ) : (
          <ShipsList ships={s.ships} />
        )}
      </Panel>
    </>
  )
}

function ShipsList({ ships }: { ships: ShipInfo[] }): JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? ships.filter(
          (s) =>
            (s.name ?? '').toLowerCase().includes(q) ||
            (s.typeName ?? '').toLowerCase().includes(q) ||
            String(s.typeId).includes(q)
        )
      : ships.slice()
    filtered.sort((a, b) => b.value - a.value)
    return filtered
  }, [ships, query])

  function toggle(itemId: number): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  return (
    <>
      <div className="row" style={{ border: 'none', paddingBottom: 10, gap: 8 }}>
        <input
          className="field"
          placeholder="Search ships…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No matching ships">Try a different search term.</EmptyState>
      ) : (
        <div className="scroll-list" style={{ maxHeight: 520 }}>
          {visible.map((s) => (
            <ShipRow key={s.itemId} ship={s} isOpen={expanded.has(s.itemId)} onToggle={toggle} />
          ))}
        </div>
      )}
    </>
  )
}

function ShipRow({
  ship: s,
  isOpen,
  onToggle
}: {
  ship: ShipInfo
  isOpen: boolean
  onToggle: (itemId: number) => void
}): JSX.Element {
  const groups = useMemo(() => {
    const bySlot = new Map<ShipSlot, FittedItem[]>()
    for (const f of s.fittings) {
      const arr = bySlot.get(f.slot) ?? []
      arr.push(f)
      bySlot.set(f.slot, arr)
    }
    return SLOT_ORDER.filter((slot) => bySlot.has(slot)).map((slot) => ({
      slot,
      items: bySlot.get(slot)!
    }))
  }, [s.fittings])

  return (
    <div>
      <div className="row" style={{ cursor: 'pointer' }} onClick={() => onToggle(s.itemId)}>
        <span className="grow" style={{ minWidth: 0 }}>
          <div className="truncate">
            {s.name ?? s.typeName ?? 'Ship'}
            {s.isActive && (
              <span className="chip green" style={{ marginLeft: 8 }}>
                Active
              </span>
            )}
          </div>
          <div className="faint" style={{ fontSize: 11 }}>
            {s.typeName ?? s.typeId} · {s.locationName ?? `Location ${s.locationId}`}
          </div>
        </span>
        <span className="mono" style={{ minWidth: 92, textAlign: 'right' }}>
          {isk(s.value, true)}
        </span>
        <span className="dim" style={{ width: 12, textAlign: 'center' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </div>
      {isOpen && (
        <div style={{ padding: '2px 4px 12px 16px' }}>
          {groups.length === 0 ? (
            <div className="dim" style={{ fontSize: 11.5, padding: '4px 0' }}>
              Empty hull
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.slot} style={{ marginBottom: 6 }}>
                <div className="slot-bar">
                  {g.slot}
                  <span className="slot-bar-count">{g.items.length}</span>
                </div>
                {g.items.map((f, i) => (
                  <div
                    key={`${f.typeId}-${i}`}
                    className="row"
                    style={{ border: 'none', padding: '3px 0', fontSize: 11.5 }}
                  >
                    <span className="grow dim truncate">{f.typeName ?? f.typeId}</span>
                    <span className="mono dim">×{num(f.quantity)}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
