import { AdvisorHistoryEntry } from '@shared/types'
import { getIdentity } from '../auth/sso'
import { fetchDashboard, fetchEconomy, fetchMining } from '../esi/client'

export interface AdvisorContext {
  context: string
  snapshot?: AdvisorHistoryEntry['snapshot']
}

function isk(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} ISK`
}

/**
 * Builds the provider-independent character context used by every Advisor
 * backend. Keeping ESI access here prevents provider adapters from becoming a
 * second data pipeline.
 */
export async function buildAdvisorContext(): Promise<AdvisorContext> {
  const identity = getIdentity()
  if (!identity) return { context: 'Character context: NOT LOGGED IN. No live data available.' }

  const [dash, econ, mining] = await Promise.all([fetchDashboard(), fetchEconomy(), fetchMining()])

  const lines: string[] = []
  lines.push(`Character: ${identity.characterName} (id ${identity.characterId})`)

  let snapshot: AdvisorContext['snapshot']
  if (dash.ok && dash.data) {
    snapshot = {
      isk: dash.data.walletBalance,
      skillPoints: dash.data.skillPoints,
      locationName: dash.data.location.solarSystemName,
      shipName: dash.data.ship.name
    }
  }

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
      const type = e.typeName ?? String(e.typeId)
      byType.set(type, (byType.get(type) ?? 0) + e.quantity)
    }
    for (const [type, qty] of [...byType.entries()].slice(0, 6)) {
      lines.push(`  - ${type}: ${qty.toLocaleString('en-US')} units`)
    }
  }

  return { context: `Character context:\n${lines.join('\n')}`, snapshot }
}
