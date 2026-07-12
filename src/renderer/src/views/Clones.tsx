import { useAsync } from '../lib/hooks'
import { Panel, Loader, ErrorBox, EmptyState } from '../components/ui'
import type { ClonesData, EsiResult } from '@shared/types'

export function Clones(): JSX.Element {
  const { loading, data, error, reload } = useAsync<EsiResult<ClonesData>>(() =>
    window.firstmate.esi.clones()
  )

  if (loading) return <Loader label="Scanning clone bay…" />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data?.ok || !data.data) {
    return <ErrorBox message={data?.error ?? 'Could not load clone data.'} onRetry={reload} />
  }

  const c = data.data

  return (
    <>
      <Panel
        title="Active Implants"
        actions={
          <button className="btn sm" onClick={reload}>
            ↻
          </button>
        }
      >
        {c.homeLocationName && (
          <div className="row" style={{ border: 'none', paddingTop: 0 }}>
            <span className="dim">Home station</span>
            <span className="grow" />
            <span className="truncate" style={{ maxWidth: 220, textAlign: 'right' }}>
              {c.homeLocationName}
            </span>
          </div>
        )}
        {c.activeImplants.length === 0 ? (
          <EmptyState title="No active implants">
            Implants plugged into your current clone will appear here.
          </EmptyState>
        ) : (
          <div className="scroll-list">
            {c.activeImplants.map((i, idx) => (
              <div className="row" key={`${i.typeId}-${idx}`}>
                <span className="grow truncate">{i.typeName ?? i.typeId}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Jump Clones (${c.jumpClones.length})`}>
        {c.jumpClones.length === 0 ? (
          <EmptyState title="No jump clones">
            Jump clones you've installed around New Eden will appear here.
          </EmptyState>
        ) : (
          <div className="scroll-list" style={{ maxHeight: 480 }}>
            {c.jumpClones.map((jc) => (
              <div
                key={jc.locationId}
                style={{
                  border: '1px solid var(--border-soft)',
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 8,
                  background: 'var(--bg-elevated)'
                }}
              >
                <div className="truncate" style={{ fontWeight: 600, marginBottom: 6 }}>
                  {jc.locationName ?? jc.locationId}
                </div>
                {jc.implants.length === 0 ? (
                  <div className="faint" style={{ fontSize: 11.5 }}>
                    No implants
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {jc.implants.map((i, idx) => (
                      <span className="chip" key={`${i.typeId}-${idx}`}>
                        {i.typeName ?? i.typeId}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}
