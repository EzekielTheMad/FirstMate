import { useMemo, useState } from 'react'
import { useAsync } from '../lib/hooks'
import { isk, num } from '../lib/format'
import { Panel, Stat, Loader, ErrorBox, EmptyState, UpdatedAgo } from '../components/ui'
import { Tooltip } from '../components/Tooltip'
import { oreComposition } from '@shared/data/ore-minerals'
import type { AssetHolding, AssetsData, EsiResult } from '@shared/types'

type SortKey = 'value' | 'quantity' | 'name'

export function Assets({ autoRefreshMs }: { autoRefreshMs?: number }): JSX.Element {
  const { loading, data, error, reload, lastUpdatedAt } = useAsync<EsiResult<AssetsData>>(
    () => window.firstmate.esi.assets(),
    [],
    autoRefreshMs
  )
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('value')

  const holdings = data?.ok ? (data.data?.holdings ?? []) : []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? holdings.filter(
          (h) =>
            (h.typeName ?? '').toLowerCase().includes(q) || String(h.typeId).includes(q)
        )
      : holdings.slice()

    filtered.sort((a, b) => {
      switch (sort) {
        case 'quantity':
          return b.quantity - a.quantity
        case 'name':
          return (a.typeName ?? String(a.typeId)).localeCompare(b.typeName ?? String(b.typeId))
        case 'value':
        default:
          return b.value - a.value
      }
    })
    return filtered
  }, [holdings, query, sort])

  if (loading) return <Loader label="Appraising hangar contents…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load assets data.'} onRetry={reload} />
  }

  const a = data.data

  function toggle(typeId: number): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(typeId)) next.delete(typeId)
      else next.add(typeId)
      return next
    })
  }

  return (
    <>
      <Panel
        title="Assets"
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
          <Stat label="Total Value" value={isk(a.totalValue, true)} sub="current market price" tone="amber" />
          <Stat label="Item Types" value={num(a.itemTypeCount)} sub="distinct types held" />
        </div>
      </Panel>

      <Panel title={`Holdings (${visible.length}${visible.length !== a.holdings.length ? ` / ${a.holdings.length}` : ''})`}>
        {a.holdings.length === 0 ? (
          <EmptyState title="No assets found">
            Everything held across your hangars, ships, and containers will appear here.
          </EmptyState>
        ) : (
          <>
            <div className="row" style={{ border: 'none', paddingBottom: 10, gap: 8 }}>
              <input
                className="field"
                placeholder="Search items…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ flex: 1 }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                {(
                  [
                    ['value', 'Value'],
                    ['quantity', 'Qty'],
                    ['name', 'Name']
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    className={`btn sm${sort === key ? ' primary' : ''}`}
                    onClick={() => setSort(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState title="No matching items">Try a different search term.</EmptyState>
            ) : (
              <div className="scroll-list" style={{ maxHeight: 440 }}>
                {visible.map((h) => (
                  <AssetRow key={h.typeId} holding={h} isOpen={expanded.has(h.typeId)} onToggle={toggle} />
                ))}
              </div>
            )}
          </>
        )}
      </Panel>
    </>
  )
}

function AssetRow({
  holding: h,
  isOpen,
  onToggle
}: {
  holding: AssetHolding
  isOpen: boolean
  onToggle: (typeId: number) => void
}): JSX.Element {
  const comp = h.isOre ? oreComposition(h.typeId) : null
  const expandable = h.locations.length > 0
  const nameEl = <span className="truncate">{h.typeName ?? h.typeId}</span>

  return (
    <div>
      <div
        className="row"
        style={expandable ? { cursor: 'pointer' } : undefined}
        onClick={expandable ? () => onToggle(h.typeId) : undefined}
      >
        <span className="grow" style={{ minWidth: 0 }}>
          {comp ? (
            <Tooltip
              content={
                <>Reprocesses to: {comp.map((c) => `${c.name} ×${num(c.qty)}`).join(', ')}</>
              }
            >
              {nameEl}
            </Tooltip>
          ) : (
            nameEl
          )}
        </span>
        <span className="mono dim" style={{ minWidth: 76, textAlign: 'right' }}>
          {num(h.quantity)}
        </span>
        <span className="mono" style={{ minWidth: 92, textAlign: 'right' }}>
          {isk(h.value, true)}
        </span>
        {h.isOre && (
          <span className="mono" style={{ minWidth: 92, textAlign: 'right', color: 'var(--accent)' }}>
            {isk(h.refinedValue, true)}
          </span>
        )}
        {expandable && (
          <span className="dim" style={{ width: 12, textAlign: 'center' }}>
            {isOpen ? '▲' : '▼'}
          </span>
        )}
      </div>
      {isOpen && expandable && (
        <div style={{ padding: '2px 4px 8px 16px' }}>
          {h.locations.map((loc) => (
            <div key={loc.locationId} className="row" style={{ border: 'none', padding: '4px 0', fontSize: 11.5 }}>
              <span className="grow dim truncate">{loc.locationName ?? `Location ${loc.locationId}`}</span>
              <span className="mono dim">{num(loc.quantity)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
