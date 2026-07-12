import { useEffect, useState } from 'react'
import { Panel, ErrorBox, EmptyState } from '../components/ui'
import { renderMarkdown, isk, num, relativeTime } from '../lib/format'
import type { AdvisorHistoryEntry, AdvisorResponse } from '@shared/types'

const EXAMPLES = [
  'Become self-sufficient in a wormhole',
  'Earn 1b ISK/week from exploration',
  'Train into a solo PvP frigate pilot',
  'Set up passive market trading income'
]

export function Advisor({ hasKey }: { hasKey: boolean }): JSX.Element {
  const [goal, setGoal] = useState('')
  const [focus, setFocus] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AdvisorResponse | null>(null)
  const [history, setHistory] = useState<AdvisorHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    window.firstmate.advisor.getHistory().then(setHistory)
  }, [])

  async function ask(): Promise<void> {
    if (!goal.trim() || loading) return
    setLoading(true)
    setResult(null)
    const res = await window.firstmate.advisor.ask({ goal, focus: focus || undefined })
    setResult(res)
    setLoading(false)
    if (res.ok) {
      window.firstmate.advisor.getHistory().then(setHistory)
    }
  }

  async function deleteEntry(id: string): Promise<void> {
    const next = await window.firstmate.advisor.deleteHistory(id)
    setHistory(next)
  }

  async function clearAll(): Promise<void> {
    const next = await window.firstmate.advisor.clearHistory()
    setHistory(next)
  }

  const sortedHistory = [...history].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <>
      <Panel title="AI Advisor">
        {!hasKey && (
          <div className="error-box">
            Add an Anthropic API key in Settings to enable the advisor. It reads your live
            character context (ISK, skills, location, market orders) and recommends what to focus
            on to reach your goal.
          </div>
        )}
        <div className="field-group">
          <label className="field-label">Your goal</label>
          <textarea
            className="field"
            placeholder="e.g. Become a self-sufficient wormhole explorer earning 500m ISK/week"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Focus / play style (optional)</label>
          <input
            className="field"
            placeholder="e.g. mostly solo, limited playtime, risk-averse"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
        </div>
        <div className="actions">
          <button className="btn primary" onClick={ask} disabled={loading || !goal.trim() || !hasKey}>
            {loading ? 'Consulting…' : 'Get advice'}
          </button>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="btn sm" onClick={() => setGoal(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </Panel>

      {loading && (
        <Panel>
          <div className="center-msg">
            <div className="spinner" />
            <div className="dim">Analyzing your character and building a plan…</div>
          </div>
        </Panel>
      )}

      {result && !result.ok && <ErrorBox message={result.error ?? 'The advisor failed.'} />}

      {result?.ok && result.advice && (
        <Panel title="Recommendation">
          <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.advice) }} />
        </Panel>
      )}

      <Panel
        title={`History (${history.length})`}
        actions={
          <>
            {history.length > 0 && (
              <button className="btn sm" onClick={clearAll}>
                Clear all
              </button>
            )}
            <button className="btn sm" onClick={() => setHistoryOpen((o) => !o)}>
              {historyOpen ? 'Hide' : 'Show'}
            </button>
          </>
        }
      >
        {historyOpen &&
          (history.length === 0 ? (
            <EmptyState title="No history yet">
              Advice you receive is saved here automatically.
            </EmptyState>
          ) : (
            <div className="scroll-list">
              {sortedHistory.map((h) => (
                <div className="history-entry" key={h.id}>
                  <div
                    className="row"
                    onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                  >
                    <span className="grow truncate">{h.goal}</span>
                    <span className="dim">{relativeTime(h.createdAt)}</span>
                    <button
                      className="btn sm danger"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteEntry(h.id)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  {expandedId === h.id && (
                    <div style={{ padding: '2px 4px 14px' }}>
                      <div className="faint" style={{ fontSize: 11, marginBottom: 8 }}>
                        {isk(h.snapshot.isk, true)} ISK · {num(h.snapshot.skillPoints)} SP
                        {h.snapshot.locationName ? ` · ${h.snapshot.locationName}` : ''}
                        {h.snapshot.shipName ? ` · ${h.snapshot.shipName}` : ''}
                      </div>
                      <div
                        className="md"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(h.advice) }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
      </Panel>
    </>
  )
}
