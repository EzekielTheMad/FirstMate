import { useAsync } from '../lib/hooks'
import { isk, num, relativeTime, securityColor } from '../lib/format'
import { Panel, Stat, Loader, ErrorBox } from '../components/ui'
import type { DashboardData, EsiResult } from '@shared/types'

export function Dashboard(): JSX.Element {
  const { loading, data, error, reload } = useAsync<EsiResult<DashboardData>>(() =>
    window.firstmate.esi.dashboard()
  )

  if (loading) return <Loader label="Reading capsule telemetry…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load dashboard.'} onRetry={reload} />
  }

  const d = data.data
  const spInB = d.skillPoints / 1_000_000

  return (
    <>
      <Panel
        title="Overview"
        actions={
          <button className="btn sm" onClick={reload}>
            ↻
          </button>
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

      {d.nextSkill && (
        <Panel title="Training">
          <div className="row">
            <span className="grow">
              <strong>{d.nextSkill.name ?? 'Unknown skill'}</strong>{' '}
              <span className="chip accent">Lvl {d.nextSkill.level}</span>
            </span>
            <span className="dim">{relativeTime(d.nextSkill.finishesAt)}</span>
          </div>
        </Panel>
      )}
    </>
  )
}
