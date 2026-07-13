import { useEffect, useState } from 'react'
import { useAsync } from '../lib/hooks'
import { relativeTime } from '../lib/format'
import { Panel, Loader, ErrorBox, EmptyState, UpdatedAgo } from '../components/ui'
import type { EsiResult, IndustryData, IndustryJob } from '@shared/types'

/** Finished and awaiting delivery: an explicit 'ready' status, or the end date has passed. */
function isReady(job: IndustryJob): boolean {
  if (job.status?.toLowerCase() === 'ready') return true
  const end = new Date(job.endDate).getTime()
  return !isNaN(end) && end <= Date.now()
}

function isPaused(job: IndustryJob): boolean {
  return job.status?.toLowerCase() === 'paused'
}

export function Industry({ autoRefreshMs }: { autoRefreshMs?: number }): JSX.Element {
  const { loading, data, error, reload, lastUpdatedAt } = useAsync<EsiResult<IndustryData>>(
    () => window.firstmate.esi.industry(),
    [],
    autoRefreshMs
  )

  // Local tick so countdowns update and jobs flip to "Ready to deliver" at their
  // end time without needing an ESI re-fetch (ESI caches these jobs ~5 min, so
  // this drives the live feel; the ↻ button / auto-refresh pull server changes).
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  if (loading) return <Loader label="Checking industry jobs…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load industry data.'} onRetry={reload} />
  }

  const jobs = data.data.jobs
  const readyCount = jobs.filter(isReady).length

  return (
    <Panel
      title={`Active Jobs (${jobs.length})`}
      actions={
        <>
          <UpdatedAgo at={lastUpdatedAt} />
          <button className="btn sm" onClick={reload}>
            ↻
          </button>
        </>
      }
    >
      {jobs.length === 0 ? (
        <EmptyState title="No active jobs">
          Running and ready-to-deliver manufacturing, research, and reaction jobs appear here.
          Delivered jobs are not shown.
        </EmptyState>
      ) : (
        <>
          {readyCount > 0 && (
            <div className="hint" style={{ marginBottom: 8 }}>
              {readyCount} job{readyCount === 1 ? '' : 's'} ready to deliver.
            </div>
          )}
          <div className="scroll-list" style={{ maxHeight: 560 }}>
            {jobs.map((j) => {
              const paused = isPaused(j)
              const ready = !paused && isReady(j)
              return (
                <div
                  className="row"
                  key={j.jobId}
                  style={ready ? { background: 'rgba(74, 222, 128, 0.06)' } : undefined}
                >
                  <span className="grow" style={{ minWidth: 0 }}>
                    <div className="truncate">{j.productName ?? j.blueprintName ?? 'Job'}</div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      {j.activity} · {j.runs} run{j.runs === 1 ? '' : 's'} ·{' '}
                      {j.locationName ?? (j.locationId ? `Location ${j.locationId}` : '—')}
                    </div>
                  </span>
                  {paused ? (
                    <span className="chip amber">Paused</span>
                  ) : ready ? (
                    <span className="chip green">Ready to deliver</span>
                  ) : (
                    <span className="mono dim" style={{ minWidth: 60, textAlign: 'right' }}>
                      {relativeTime(j.endDate)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}
