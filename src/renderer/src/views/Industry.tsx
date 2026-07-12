import { useAsync } from '../lib/hooks'
import { relativeTime } from '../lib/format'
import { Panel, Loader, ErrorBox, EmptyState, UpdatedAgo } from '../components/ui'
import type { EsiResult, IndustryData, IndustryJob } from '@shared/types'

/** Ready when ESI reports a terminal "ready to deliver" status, or the end date has passed. */
function isReady(job: IndustryJob): boolean {
  const status = job.status?.toLowerCase()
  if (status === 'ready' || status === 'delivered') return true
  const end = new Date(job.endDate).getTime()
  return !isNaN(end) && end <= Date.now()
}

function statusChip(job: IndustryJob): { label: string; tone: string } | undefined {
  const status = job.status?.toLowerCase()
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'red' }
  if (status === 'reverted') return { label: 'Reverted', tone: 'red' }
  if (status === 'paused') return { label: 'Paused', tone: 'amber' }
  return undefined
}

export function Industry({ autoRefreshMs }: { autoRefreshMs?: number }): JSX.Element {
  const { loading, data, error, reload, lastUpdatedAt } = useAsync<EsiResult<IndustryData>>(
    () => window.firstmate.esi.industry(),
    [],
    autoRefreshMs
  )

  if (loading) return <Loader label="Checking industry jobs…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load industry data.'} onRetry={reload} />
  }

  const jobs = data.data.jobs

  return (
    <Panel
      title={`Industry Jobs (${jobs.length})`}
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
        <EmptyState title="No industry jobs">
          Manufacturing, research, and invention jobs will appear here.
        </EmptyState>
      ) : (
        <div className="scroll-list" style={{ maxHeight: 560 }}>
          {jobs.map((j) => {
            const ready = isReady(j)
            const chip = statusChip(j)
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
                    {j.locationName ?? '—'}
                  </div>
                </span>
                {ready ? (
                  <span className="chip green">Ready</span>
                ) : chip ? (
                  <span className={`chip ${chip.tone}`}>{chip.label}</span>
                ) : (
                  <span className="mono dim" style={{ minWidth: 60, textAlign: 'right' }}>
                    {relativeTime(j.endDate)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
