import { useAsync } from '../lib/hooks'
import { isk, num } from '../lib/format'
import { Panel, Stat, Loader, ErrorBox, EmptyState, UpdatedAgo } from '../components/ui'
import { HoldingsList } from '../components/HoldingsList'
import type { AssetsData, EsiResult } from '@shared/types'

export function Assets({ autoRefreshMs }: { autoRefreshMs?: number }): JSX.Element {
  const { loading, data, error, reload, lastUpdatedAt } = useAsync<EsiResult<AssetsData>>(
    () => window.firstmate.esi.assets(),
    [],
    autoRefreshMs
  )

  if (loading) return <Loader label="Appraising hangar contents…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load assets data.'} onRetry={reload} />
  }

  const a = data.data
  const nw = a.netWorth

  return (
    <>
      <Panel
        title="Net Worth"
        actions={
          <>
            <UpdatedAgo at={lastUpdatedAt} />
            <button className="btn sm" onClick={reload}>
              ↻
            </button>
          </>
        }
      >
        {nw ? (
          <>
            <Stat label="Total" value={isk(nw.total, true)} sub="gear + materials + ships" tone="amber" />
            <div className="grid-2" style={{ marginTop: 10 }}>
              <Stat label="Gear" value={isk(nw.gear, true)} />
              <Stat label="Materials" value={isk(nw.materials, true)} />
              <Stat label="Ships" value={isk(nw.ships, true)} />
              <Stat label="Item Types" value={num(a.itemTypeCount)} sub="distinct gear types held" />
            </div>
          </>
        ) : (
          <div className="grid-2">
            <Stat label="Total Value" value={isk(a.totalValue, true)} sub="current market price" tone="amber" />
            <Stat label="Item Types" value={num(a.itemTypeCount)} sub="distinct types held" />
          </div>
        )}
      </Panel>

      <Panel title="Holdings">
        {a.holdings.length === 0 ? (
          <EmptyState title="No assets found">
            Ships, modules, ammo, and other gear held across your hangars, ships, and containers
            will appear here. Ore, minerals, and ice are tracked in <strong>Materials</strong>.
          </EmptyState>
        ) : (
          <HoldingsList holdings={a.holdings} />
        )}
      </Panel>
    </>
  )
}
