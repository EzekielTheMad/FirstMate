import { useMemo, useState } from 'react'
import { isk, num } from '../lib/format'
import { EmptyState } from './ui'
import { Tooltip } from './Tooltip'
import { oreComposition } from '@shared/data/ore-minerals'
import type { AssetHolding } from '@shared/types'

type SortKey = 'value' | 'quantity' | 'name'
type GroupMode = 'type' | 'location'

/**
 * Search + sort + scrollable rows for a list of asset holdings, shared by the
 * Assets (gear) and Materials (ore/minerals/ice) views. Supports grouping
 * either by item type (default — each holding is a row, expandable to its
 * per-location breakdown) or by location (each location is a section,
 * expandable to the items held there).
 */
export function HoldingsList({ holdings }: { holdings: AssetHolding[] }): JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('value')
  const [group, setGroup] = useState<GroupMode>('type')
  const [collapsedLocations, setCollapsedLocations] = useState<Set<number>>(new Set())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q
      ? holdings.filter(
          (h) => (h.typeName ?? '').toLowerCase().includes(q) || String(h.typeId).includes(q)
        )
      : holdings.slice()
  }, [holdings, query])

  const sortHoldings = useMemo(() => sorterFor(sort), [sort])

  const visible = useMemo(() => {
    const list = filtered.slice()
    list.sort(sortHoldings)
    return list
  }, [filtered, sortHoldings])

  const locationGroups = useMemo(() => {
    if (group !== 'location') return []
    const map = new Map<number, LocationGroup>()
    for (const h of filtered) {
      const perUnit = h.quantity ? h.value / h.quantity : 0
      for (const loc of h.locations) {
        let g = map.get(loc.locationId)
        if (!g) {
          g = { locationId: loc.locationId, locationName: loc.locationName, items: [], totalValue: 0 }
          map.set(loc.locationId, g)
        }
        const value = perUnit * loc.quantity
        g.items.push({ holding: h, quantity: loc.quantity, value })
        g.totalValue += value
      }
    }
    const groups = [...map.values()]
    groups.sort((a, b) => b.totalValue - a.totalValue)
    for (const g of groups) {
      g.items.sort((a, b) => sortLocationItems(a, b, sort))
    }
    return groups
  }, [filtered, group, sort])

  function toggle(typeId: number): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(typeId)) next.delete(typeId)
      else next.add(typeId)
      return next
    })
  }

  function toggleLocation(locationId: number): void {
    setCollapsedLocations((prev) => {
      const next = new Set(prev)
      if (next.has(locationId)) next.delete(locationId)
      else next.add(locationId)
      return next
    })
  }

  const isEmpty = group === 'location' ? locationGroups.length === 0 : visible.length === 0

  return (
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
              ['type', 'Type'],
              ['location', 'Location']
            ] as [GroupMode, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={`btn sm${group === key ? ' primary' : ''}`}
              onClick={() => setGroup(key)}
            >
              {label}
            </button>
          ))}
        </div>
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

      {isEmpty ? (
        <EmptyState title="No matching items">Try a different search term.</EmptyState>
      ) : (
        <div className="scroll-list" style={{ maxHeight: 440 }}>
          {group === 'type'
            ? visible.map((h) => (
                <AssetRow key={h.typeId} holding={h} isOpen={expanded.has(h.typeId)} onToggle={toggle} />
              ))
            : locationGroups.map((g) => (
                <LocationSection
                  key={g.locationId}
                  group={g}
                  isOpen={!collapsedLocations.has(g.locationId)}
                  onToggle={toggleLocation}
                />
              ))}
        </div>
      )}
    </>
  )
}

function sorterFor(sort: SortKey): (a: AssetHolding, b: AssetHolding) => number {
  switch (sort) {
    case 'quantity':
      return (a, b) => b.quantity - a.quantity
    case 'name':
      return (a, b) => (a.typeName ?? String(a.typeId)).localeCompare(b.typeName ?? String(b.typeId))
    case 'value':
    default:
      return (a, b) => b.value - a.value
  }
}

function sortLocationItems(a: LocationItem, b: LocationItem, sort: SortKey): number {
  switch (sort) {
    case 'quantity':
      return b.quantity - a.quantity
    case 'name':
      return (a.holding.typeName ?? String(a.holding.typeId)).localeCompare(
        b.holding.typeName ?? String(b.holding.typeId)
      )
    case 'value':
    default:
      return b.value - a.value
  }
}

interface LocationItem {
  holding: AssetHolding
  quantity: number
  value: number
}

interface LocationGroup {
  locationId: number
  locationName?: string
  items: LocationItem[]
  totalValue: number
}

function LocationSection({
  group,
  isOpen,
  onToggle
}: {
  group: LocationGroup
  isOpen: boolean
  onToggle: (locationId: number) => void
}): JSX.Element {
  return (
    <div>
      <div className="row" style={{ cursor: 'pointer' }} onClick={() => onToggle(group.locationId)}>
        <span className="grow truncate" style={{ minWidth: 0, fontWeight: 600 }}>
          {group.locationName ?? `Location ${group.locationId}`}
        </span>
        <span className="mono" style={{ minWidth: 92, textAlign: 'right' }}>
          {isk(group.totalValue, true)}
        </span>
        <span className="dim" style={{ width: 12, textAlign: 'center' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </div>
      {isOpen && (
        <div style={{ padding: '2px 4px 8px 16px' }}>
          {group.items.map((item) => {
            const h = item.holding
            const comp = h.isOre ? oreComposition(h.typeId) : null
            const nameEl = <span className="truncate">{h.typeName ?? h.typeId}</span>
            return (
              <div
                key={h.typeId}
                className="row"
                style={{ border: 'none', padding: '4px 0', fontSize: 11.5 }}
              >
                <span className="grow dim" style={{ minWidth: 0 }}>
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
                  {num(item.quantity)}
                </span>
                <span className="mono dim" style={{ minWidth: 92, textAlign: 'right' }}>
                  {isk(item.value, true)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
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
