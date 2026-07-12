import { useState } from 'react'
import { useAsync } from '../lib/hooks'
import { isk, num } from '../lib/format'
import { Panel, Stat, Loader, ErrorBox, EmptyState, UpdatedAgo } from '../components/ui'
import { Tooltip } from '../components/Tooltip'
import { oreComposition } from '@shared/data/ore-minerals'
import type { EsiResult, MaterialsData } from '@shared/types'

export function Materials({ autoRefreshMs }: { autoRefreshMs?: number }): JSX.Element {
  const { loading, data, error, reload, lastUpdatedAt } = useAsync<EsiResult<MaterialsData>>(
    () => window.firstmate.esi.materials(),
    [],
    autoRefreshMs
  )
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  if (loading) return <Loader label="Appraising hangar contents…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load materials data.'} onRetry={reload} />
  }

  const m = data.data

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
          <Stat
            label="Raw Value"
            value={isk(m.totalRawValue, true)}
            sub="current market price"
            tone="amber"
          />
          <Stat
            label="Refined Value"
            value={isk(m.totalRefinedValue, true)}
            sub="if reprocessed"
            tone="accent"
          />
        </div>
      </Panel>

      <Panel title={`Holdings (${m.holdings.length})`}>
        {m.holdings.length === 0 ? (
          <EmptyState title="No material holdings">
            Ore, ice, and minerals held across your hangars will appear here.
          </EmptyState>
        ) : (
          <div className="scroll-list" style={{ maxHeight: 480 }}>
            {m.holdings.map((h) => {
              const comp = oreComposition(h.typeId)
              const expandable = h.locations.length > 0
              const isOpen = expanded.has(h.typeId)
              const nameEl = <span className="truncate">{h.typeName ?? h.typeId}</span>

              return (
                <div key={h.typeId}>
                  <div
                    className="row"
                    style={expandable ? { cursor: 'pointer' } : undefined}
                    onClick={expandable ? () => toggle(h.typeId) : undefined}
                  >
                    <span className="grow" style={{ minWidth: 0 }}>
                      {comp ? (
                        <Tooltip
                          content={
                            <>
                              Reprocesses to:{' '}
                              {comp.map((c) => `${c.name} ×${num(c.qty)}`).join(', ')}
                            </>
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
                      {isk(h.rawValue, true)}
                    </span>
                    <span
                      className="mono"
                      style={{ minWidth: 92, textAlign: 'right', color: 'var(--accent)' }}
                    >
                      {isk(h.refinedValue, true)}
                    </span>
                    {expandable && (
                      <span className="dim" style={{ width: 12, textAlign: 'center' }}>
                        {isOpen ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                  {isOpen && expandable && (
                    <div style={{ padding: '2px 4px 8px 16px' }}>
                      {h.locations.map((loc) => (
                        <div
                          key={loc.locationId}
                          className="row"
                          style={{ border: 'none', padding: '4px 0', fontSize: 11.5 }}
                        >
                          <span className="grow dim truncate">
                            {loc.locationName ?? loc.locationId}
                          </span>
                          <span className="mono dim">{num(loc.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </>
  )
}
