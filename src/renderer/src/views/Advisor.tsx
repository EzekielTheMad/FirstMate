import { useState } from 'react'
import { Panel, ErrorBox } from '../components/ui'
import { renderMarkdown } from '../lib/format'
import type { AdvisorResponse } from '@shared/types'

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

  async function ask(): Promise<void> {
    if (!goal.trim() || loading) return
    setLoading(true)
    setResult(null)
    const res = await window.firstmate.advisor.ask({ goal, focus: focus || undefined })
    setResult(res)
    setLoading(false)
  }

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
    </>
  )
}
