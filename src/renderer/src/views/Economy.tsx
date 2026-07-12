import { useAsync } from '../lib/hooks'
import { isk, num, shortDate } from '../lib/format'
import { Panel, Stat, Loader, ErrorBox, EmptyState, UpdatedAgo } from '../components/ui'
import { Sparkline } from '../components/Sparkline'
import type { EconomyData, EsiResult } from '@shared/types'

export function Economy({ autoRefreshMs }: { autoRefreshMs?: number }): JSX.Element {
  const { loading, data, error, reload, lastUpdatedAt } = useAsync<EsiResult<EconomyData>>(
    () => window.firstmate.esi.economy(),
    [],
    autoRefreshMs
  )

  if (loading) return <Loader label="Auditing wallet & market…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load economy data.'} onRetry={reload} />
  }

  const e = data.data
  const buyOrders = e.orders.filter((o) => o.isBuyOrder)
  const sellOrders = e.orders.filter((o) => !o.isBuyOrder)
  const escrow = buyOrders.reduce((s, o) => s + o.price * o.volumeRemain, 0)
  const listed = sellOrders.reduce((s, o) => s + o.price * o.volumeRemain, 0)
  const balanceSeries = e.journal
    .filter((j): j is typeof j & { balance: number } => j.balance !== undefined)
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((j) => j.balance)

  return (
    <>
      <Panel
        title="Wallet"
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
          <Stat label="Balance" value={`${isk(e.walletBalance, true)}`} sub={`${num(Math.round(e.walletBalance))} ISK`} tone="amber" />
          <Stat label="Open Orders" value={num(e.orders.length)} sub={`${buyOrders.length} buy · ${sellOrders.length} sell`} />
          <Stat label="Buy Escrow" value={`${isk(escrow, true)}`} tone="accent" />
          <Stat label="Sell Listed" value={`${isk(listed, true)}`} tone="green" />
        </div>
        {balanceSeries.length >= 2 && (
          <div style={{ marginTop: 14 }}>
            <div
              className="dim"
              style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 6 }}
            >
              Balance trend
            </div>
            <Sparkline values={balanceSeries} height={44} />
          </div>
        )}
      </Panel>

      <Panel title={`Market Orders (${e.orders.length})`}>
        {e.orders.length === 0 ? (
          <EmptyState title="No active orders">Your market orders will appear here.</EmptyState>
        ) : (
          <div className="scroll-list">
            {e.orders.map((o) => (
              <div className="row" key={o.orderId}>
                <span className={`chip ${o.isBuyOrder ? 'green' : 'accent'}`}>
                  {o.isBuyOrder ? 'BUY' : 'SELL'}
                </span>
                <span className="grow truncate">{o.typeName ?? o.typeId}</span>
                <span className="mono dim">
                  {num(o.volumeRemain)}/{num(o.volumeTotal)}
                </span>
                <span className="mono" style={{ minWidth: 96, textAlign: 'right' }}>
                  {isk(o.price, true)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Wallet Journal">
        {e.journal.length === 0 ? (
          <EmptyState title="No recent entries" />
        ) : (
          <div className="scroll-list">
            {e.journal.map((j) => (
              <div className="row" key={j.id}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate">{j.description || j.refType}</div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {shortDate(j.date)} · {j.refType}
                  </div>
                </span>
                <span className={`mono ${j.amount >= 0 ? 'pos' : 'neg'}`}>
                  {j.amount >= 0 ? '+' : ''}
                  {isk(j.amount, true)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}
