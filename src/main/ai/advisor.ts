import Anthropic from '@anthropic-ai/sdk'
import { AdvisorGoal, AdvisorResponse } from '@shared/types'
import { getSettings } from '../store'
import { getIdentity } from '../auth/sso'
import { fetchDashboard, fetchEconomy, fetchMining } from '../esi/client'

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

function isk(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} ISK`
}

async function buildContext(): Promise<string> {
  const identity = getIdentity()
  if (!identity) return 'Character context: NOT LOGGED IN. No live data available.'

  const [dash, econ, mining] = await Promise.all([fetchDashboard(), fetchEconomy(), fetchMining()])

  const lines: string[] = []
  lines.push(`Character: ${identity.characterName} (id ${identity.characterId})`)

  if (dash.ok && dash.data) {
    const d = dash.data
    lines.push(`Online: ${d.online ? 'yes' : 'no'}`)
    lines.push(`Wallet: ${isk(d.walletBalance)}`)
    lines.push(
      `Location: ${d.location.solarSystemName ?? d.location.solarSystemId} ` +
        `(${d.location.regionName ?? 'unknown region'}, sec ${d.location.security ?? '?'}) — ${
          d.location.stationOrStructure ?? ''
        }`
    )
    lines.push(`Ship: ${d.ship.typeName ?? d.ship.typeId} "${d.ship.name ?? ''}"`)
    lines.push(`Total SP: ${d.skillPoints.toLocaleString('en-US')}`)
    lines.push(`Skill queue: ${d.skillQueueCount} entries`)
    if (d.nextSkill) {
      lines.push(
        `Next skill: ${d.nextSkill.name ?? '?'} to level ${d.nextSkill.level}` +
          (d.nextSkill.finishesAt ? ` (finishes ${d.nextSkill.finishesAt})` : '')
      )
    }
  } else {
    lines.push(`Dashboard unavailable: ${dash.error}`)
  }

  if (econ.ok && econ.data) {
    lines.push(`Open market orders: ${econ.data.orders.length}`)
    for (const o of econ.data.orders.slice(0, 8)) {
      lines.push(
        `  - ${o.isBuyOrder ? 'BUY' : 'SELL'} ${o.volumeRemain}x ${o.typeName ?? o.typeId} @ ${isk(
          o.price
        )}`
      )
    }
    if (econ.data.journal.length) {
      lines.push('Recent wallet activity (last few):')
      for (const j of econ.data.journal.slice(0, 5)) {
        lines.push(`  - ${j.date}: ${j.refType} ${isk(j.amount)} — ${j.description}`)
      }
    }
  }

  if (mining.ok && mining.data && mining.data.entries.length) {
    lines.push(
      `Mining (recent): ${mining.data.totalQuantity.toLocaleString('en-US')} units, ` +
        `est. ${isk(mining.data.totalEstimatedValue)}`
    )
    const byType = new Map<string, number>()
    for (const e of mining.data.entries.slice(0, 40)) {
      byType.set(e.typeName ?? String(e.typeId), (byType.get(e.typeName ?? String(e.typeId)) ?? 0) + e.quantity)
    }
    for (const [type, qty] of [...byType.entries()].slice(0, 6)) {
      lines.push(`  - ${type}: ${qty.toLocaleString('en-US')} units`)
    }
  }

  return `Character context:\n${lines.join('\n')}`
}

export async function askAdvisor(goal: AdvisorGoal): Promise<AdvisorResponse> {
  const settings = getSettings()
  if (!settings.anthropicApiKey) {
    return {
      ok: false,
      error: 'No Anthropic API key set. Add one in Settings to enable the AI Advisor.'
    }
  }
  if (!goal.goal.trim()) {
    return { ok: false, error: 'Enter a goal first.' }
  }

  try {
    const context = await buildContext()
    const client = new Anthropic({ apiKey: settings.anthropicApiKey })

    const userMessage =
      `${context}\n\n---\n\n` +
      `Player goal: ${goal.goal}\n` +
      (goal.focus ? `Preferred focus / play style: ${goal.focus}\n` : '') +
      `\nGive me a prioritized plan to reach this goal.`

    const stream = client.messages.stream({
      model: settings.advisorModel || 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })

    const message = await stream.finalMessage()
    const advice = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (!advice) return { ok: false, error: 'The advisor returned no text. Try rephrasing the goal.' }
    return { ok: true, advice }
  } catch (e) {
    const err = e as Error & { status?: number }
    if (err.status === 401) {
      return { ok: false, error: 'Anthropic rejected the API key (401). Check it in Settings.' }
    }
    return { ok: false, error: err.message ?? String(e) }
  }
}
