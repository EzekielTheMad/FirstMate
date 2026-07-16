import { AdvisorGoal, AdvisorResponse } from '@shared/types'
import { getSettings, addAdvisorHistory } from '../store'
import { buildAdvisorContext } from './context'
import { generateAdvisorText } from './providers'

const SYSTEM_PROMPT = `You are FirstMate's in-app advisor for the game EVE Online.
The player will state a goal. Using the character context provided, give concrete,
prioritized, actionable guidance to reach that goal.

Cover, where relevant to the goal:
- Skills to train next (name specific skills and target levels) and why they matter.
- Activities to do now (exploration, mining, missions, industry, market trading, PvP).
- Ships / fits worth working toward, and the ISK/skill gap to get there.
- Economic steps (what to buy, sell, or stockpile) grounded in their wallet and market orders.
- A realistic near-term plan (this week) and a stretch plan (this month).

Be specific and practical. Prefer numbered, skimmable lists over prose. Ground advice in
the character context — reference their actual ISK, location, ship, and skill points when useful.
If context is missing (e.g. not logged in), still give the best generic plan and note the gap.
Keep it focused; do not pad. Format as GitHub-flavored markdown.`

export async function askAdvisor(goal: AdvisorGoal): Promise<AdvisorResponse> {
  const settings = getSettings()
  if (settings.advisorProvider === 'disabled') {
    return {
      ok: false,
      error: 'The AI Advisor is disabled. Choose a provider in Settings to enable it.'
    }
  }
  if (!goal.goal.trim()) return { ok: false, error: 'Enter a goal first.' }

  try {
    const { context, snapshot } = await buildAdvisorContext()
    const userMessage =
      `${context}\n\n---\n\n` +
      `Player goal: ${goal.goal}\n` +
      (goal.focus ? `Preferred focus / play style: ${goal.focus}\n` : '') +
      `\nGive me a prioritized plan to reach this goal.`

    const advice = await generateAdvisorText(settings, {
      system: SYSTEM_PROMPT,
      userMessage
    })

    try {
      addAdvisorHistory({
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        goal: goal.goal,
        focus: goal.focus,
        advice,
        createdAt: Date.now(),
        snapshot: snapshot ?? { isk: 0, skillPoints: 0 }
      })
    } catch {
      /* history saving must never break the advisor response */
    }

    return { ok: true, advice }
  } catch (error) {
    const err = error as Error & { status?: number }
    if (err.status === 401) {
      return { ok: false, error: 'The selected AI provider rejected the access key.' }
    }
    return { ok: false, error: err.message ?? String(error) }
  }
}
