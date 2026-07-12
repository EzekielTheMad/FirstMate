import { useMemo } from 'react'
import { useAsync } from '../lib/hooks'
import { isk, num, shortDate } from '../lib/format'
import { Panel, Stat, Loader, ErrorBox, EmptyState } from '../components/ui'
import type { EsiResult, MiningData } from '@shared/types'

export function Mining(): JSX.Element {
  const { loading, data, error, reload } = useAsync<EsiResult<MiningData>>(() =>
    window.firstmate.esi.mining()
  )

  const byType = useMemo(() => {
    if (!data?.data) return []
    const map = new Map<string, { qty: number; value: number }>()
    for (const e of data.data.entries) {
      const key = e.typeName ?? String(e.typeId)
      const cur = map.get(key) ?? { qty: 0, value: 0 }
      cur.qty += e.quantity
      cur.value += e.estimatedValue ?? 0
      map.set(key, cur)
    }
    return [...map.entries()].sort((a, b) => b[1].value - a[1].value)
  }, [data])

  if (loading) return <Loader label="Reading mining ledger…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load mining data.'} onRetry={reload} />
  }

  const m = data.data

  return (
    <>
      <Panel
        title="Mining Ledger"
        actions={
          <button className="btn sm" onClick={reload}>
            ↻
          </button>
        }
      >
        <div className="grid-2">
          <Stat label="Units Mined" value={num(m.totalQuantity)} sub="recent period" tone="accent" />
          <Stat
            label="Est. Value"
            value={`${isk(m.totalEstimatedValue, true)}`}
            sub="avg market price"
            tone="amber"
          />
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          Value estimates use ESI average market prices — actual refined/sell value will vary.
        </div>
      </Panel>

      <Panel title={`By Ore / Type (${byType.length})`}>
        {byType.length === 0 ? (
          <EmptyState title="No mining recorded">
            Your ESI mining ledger updates roughly daily. Come back after a mining session.
          </EmptyState>
        ) : (
          <div className="scroll-list">
            {byType.map(([type, agg]) => (
              <div className="row" key={type}>
                <span className="grow truncate">{type}</span>
                <span className="mono dim" style={{ minWidth: 80, textAlign: 'right' }}>
                  {num(agg.qty)}
                </span>
                <span className="mono amber" style={{ minWidth: 88, textAlign: 'right', color: 'var(--amber)' }}>
                  {isk(agg.value, true)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {m.entries.length > 0 && (
        <Panel title="Recent Sessions">
          <div className="scroll-list">
            {m.entries.slice(0, 40).map((e, i) => (
              <div className="row" key={`${e.date}-${e.typeId}-${i}`}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate">{e.typeName ?? e.typeId}</div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {shortDate(e.date)} · {e.solarSystemName ?? e.solarSystemId}
                  </div>
                </span>
                <span className="mono dim">{num(e.quantity)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  )
}
