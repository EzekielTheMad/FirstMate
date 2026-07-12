import { useMemo } from 'react'
import { useAsync } from '../lib/hooks'
import { isk, num, shortDate } from '../lib/format'
import { Panel, Stat, Loader, ErrorBox, EmptyState } from '../components/ui'
import type { EsiResult, MiningData } from '@shared/types'

export function Mining(): JSX.Element {
  const { loading, data, error, reload } = useAsync<EsiResult<MiningData>>(() =>
    window.firstmate.esi.mining()
  )

  const dateSpan = useMemo(() => {
    const entries = data?.data?.entries
    if (!entries || entries.length === 0) return undefined
    let earliest = entries[0]
    let latest = entries[0]
    for (const e of entries) {
      if (new Date(e.date).getTime() < new Date(earliest.date).getTime()) earliest = e
      if (new Date(e.date).getTime() > new Date(latest.date).getTime()) latest = e
    }
    return { earliest: earliest.date, latest: latest.date }
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
        title="Mined · last ~30 days"
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
          {dateSpan
            ? `Ledger entries span ${shortDate(dateSpan.earliest)} – ${shortDate(dateSpan.latest)}. `
            : ''}
          This is your recent mining activity, not current ore holdings — see{' '}
          <strong>Assets</strong> for what you have on hand. Value estimates use ESI average
          market prices — actual refined/sell value will vary.
        </div>
      </Panel>

      <Panel title="Recent Sessions">
        {m.entries.length === 0 ? (
          <EmptyState title="No mining recorded">
            Your ESI mining ledger updates roughly daily. Come back after a mining session.
          </EmptyState>
        ) : (
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
        )}
      </Panel>
    </>
  )
}
