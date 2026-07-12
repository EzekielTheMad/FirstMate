import { useAsync } from '../lib/hooks'
import { isk, num, relativeTime, securityColor } from '../lib/format'
import { Panel, Stat, Loader, ErrorBox, EmptyState, UpdatedAgo } from '../components/ui'
import type { DashboardData, EsiResult } from '@shared/types'

/** Formats a millisecond duration as e.g. "3d 4h" or "42m". */
function formatRemaining(ms: number): string {
  if (ms <= 0) return '0m'
  const mins = Math.floor(ms / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const remMins = mins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${remMins}m`
  return `${remMins}m`
}

export function Dashboard({ autoRefreshMs }: { autoRefreshMs?: number }): JSX.Element {
  const { loading, data, error, reload, lastUpdatedAt } = useAsync<EsiResult<DashboardData>>(
    () => window.firstmate.esi.dashboard(),
    [],
    autoRefreshMs
  )

  if (loading) return <Loader label="Reading capsule telemetry…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load dashboard.'} onRetry={reload} />
  }

  const d = data.data
  const spInB = d.skillPoints / 1_000_000
  const queue = d.skillQueue ?? []
  const last = queue.length > 0 ? queue[queue.length - 1] : undefined
  const lastFinishMs = last?.finishesAt ? new Date(last.finishesAt).getTime() : undefined
  const remainingMs = lastFinishMs !== undefined ? lastFinishMs - Date.now() : undefined
  const queueEmpty = queue.length === 0
  const queueEndingSoon =
    !queueEmpty && remainingMs !== undefined && remainingMs < 24 * 60 * 60 * 1000

  return (
    <>
      <Panel
        title="Overview"
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
            label="Wallet"
            value={<>{isk(d.walletBalance, true)}</>}
            sub={`${num(Math.round(d.walletBalance))} ISK`}
            tone="amber"
          />
          <Stat
            label="Status"
            value={
              <span>
                <span className={`dot ${d.online ? 'on' : 'off'}`} />{' '}
                {d.online ? 'Online' : 'Offline'}
              </span>
            }
            tone={d.online ? 'green' : undefined}
          />
          <Stat
            label="Skill Points"
            value={`${spInB.toFixed(1)}m`}
            sub={`${num(d.skillPoints)} SP`}
            tone="accent"
          />
          <Stat label="Skill Queue" value={num(d.skillQueueCount)} sub="entries queued" />
        </div>
      </Panel>

      <Panel title="Location">
        <div className="row">
          <span className="dim">System</span>
          <span className="grow" />
          <span className="mono">{d.location.solarSystemName ?? d.location.solarSystemId}</span>
          {d.location.security !== undefined && (
            <span className="mono" style={{ color: securityColor(d.location.security), marginLeft: 8 }}>
              {d.location.security.toFixed(1)}
            </span>
          )}
        </div>
        <div className="row">
          <span className="dim">Region</span>
          <span className="grow" />
          <span>{d.location.regionName ?? '—'}</span>
        </div>
        <div className="row">
          <span className="dim">Docked / Position</span>
          <span className="grow" />
          <span className="truncate" style={{ maxWidth: 220, textAlign: 'right' }}>
            {d.location.stationOrStructure ?? '—'}
          </span>
        </div>
      </Panel>

      <Panel title="Active Ship">
        <div className="row">
          <span className="dim">Hull</span>
          <span className="grow" />
          <span>{d.ship.typeName ?? d.ship.typeId}</span>
        </div>
        <div className="row">
          <span className="dim">Name</span>
          <span className="grow" />
          <span className="truncate" style={{ maxWidth: 220, textAlign: 'right' }}>
            {d.ship.name ?? '—'}
          </span>
        </div>
      </Panel>

      <Panel
        title="Skill Queue"
        actions={
          !queueEmpty && remainingMs !== undefined ? (
            <span className="dim mono" style={{ fontSize: 11 }}>
              {formatRemaining(remainingMs)} left
            </span>
          ) : undefined
        }
      >
        {queueEmpty && <div className="warn-box">Skill queue empty — training is idle.</div>}
        {!queueEmpty && queueEndingSoon && remainingMs !== undefined && (
          <div className="warn-box">
            Queue ends in {formatRemaining(remainingMs)} — add more skills.
          </div>
        )}
        {queueEmpty ? (
          <EmptyState title="Nothing queued">Queue up skills in-game to see them here.</EmptyState>
        ) : (
          <div className="scroll-list">
            {queue.map((s, i) => (
              <div className="row" key={`${s.name ?? 'skill'}-${i}`}>
                <span className="grow truncate">{s.name ?? 'Unknown skill'}</span>
                <span className="chip accent">Lvl {s.level}</span>
                <span className="dim" style={{ minWidth: 46, textAlign: 'right' }}>
                  {relativeTime(s.finishesAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}
