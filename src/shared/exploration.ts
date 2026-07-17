import type { ExplorationState, WormholeSignature, WormholeSystem } from './types'

export const LIFE_OPTIONS: NonNullable<WormholeSignature['life']>[] = [
  'unknown',
  'over-day',
  'under-day',
  'under-4h',
  'under-1h',
  'expired'
]

export const MASS_OPTIONS: NonNullable<WormholeSignature['mass']>[] = [
  'unknown',
  'stable',
  'reduced',
  'critical'
]

export const LIFE_LABELS: Record<NonNullable<WormholeSignature['life']>, string> = {
  unknown: 'Unknown',
  'over-day': '> 1 day',
  'under-day': '< 1 day',
  'under-4h': '< 4 hours',
  'under-1h': '< 1 hour',
  expired: 'Expired'
}

export const MASS_LABELS: Record<NonNullable<WormholeSignature['mass']>, string> = {
  unknown: 'Unknown',
  stable: '> 50%',
  reduced: '< 50%',
  critical: '< 10%'
}

export function createSystem(name: string, id: string, now = Date.now()): WormholeSystem {
  return {
    id,
    name: name.trim(),
    signatures: [],
    createdAt: now,
    updatedAt: now
  }
}

function normalizeSignature(signature: WormholeSignature): WormholeSignature {
  let life = signature.life
  let mass = signature.mass
  let lifeObservedAt = signature.lifeObservedAt

  if (!life || !mass) {
    switch (signature.status) {
      case 'fresh':
      case 'stable':
        life ??= 'over-day'
        mass ??= 'stable'
        break
      case 'reduced':
        life ??= 'unknown'
        mass ??= 'reduced'
        break
      case 'critical':
        life ??= 'unknown'
        mass ??= 'critical'
        break
      case 'eol':
        life ??= 'under-4h'
        mass ??= 'unknown'
        lifeObservedAt ??= signature.eolMarkedAt
        break
      default:
        life ??= 'unknown'
        mass ??= 'unknown'
    }
  }

  const { status: _status, eolMarkedAt: _eolMarkedAt, ...rest } = signature
  return {
    ...rest,
    life: signature.group === 'wormhole' ? life : undefined,
    mass: signature.group === 'wormhole' ? mass : undefined,
    lifeObservedAt: signature.group === 'wormhole' ? lifeObservedAt : undefined
  }
}

/** Deterministic, idempotent upgrade of the unversioned v1 local chain. */
export function normalizeExplorationState(input: unknown): ExplorationState {
  const raw = input && typeof input === 'object' ? (input as Partial<ExplorationState>) : {}
  const systems = Array.isArray(raw.systems)
    ? raw.systems.map((system) => ({
        ...system,
        signatures: Array.isArray(system.signatures)
          ? system.signatures.map(normalizeSignature)
          : []
      }))
    : []
  const ids = new Set(systems.map((system) => system.id))
  const activeSystemId = raw.activeSystemId && ids.has(raw.activeSystemId)
    ? raw.activeSystemId
    : systems[0]?.id
  const rootSystemId = raw.rootSystemId && ids.has(raw.rootSystemId)
    ? raw.rootSystemId
    : systems[0]?.id

  return {
    schemaVersion: 2,
    systems,
    activeSystemId,
    rootSystemId,
    helpDismissed: raw.helpDismissed ?? false,
    showSiteGuidance: raw.showSiteGuidance ?? false
  }
}

export type SiteRiskLevel = 'lower' | 'caution' | 'danger' | 'unknown'

export interface SiteRiskGuidance {
  level: SiteRiskLevel
  label: string
  summary: string
}

const HIGH_DANGER_SITE = /(?:covert research facility|besieged research facility|sleeper cache)/i
const SLEEPER_SITE = /(?:forgotten|unsecured)/i

/**
 * Beginner-oriented PvE guidance derived only from scanner text and system class.
 * This deliberately avoids the word "safe": scanner results cannot measure player threat,
 * ship suitability, site escalation, or whether another pilot is already inside.
 */
export function getSiteRiskGuidance(
  signature: Pick<WormholeSignature, 'group' | 'name'>,
  systemClass?: string
): SiteRiskGuidance {
  const name = signature.name.trim()
  const normalizedClass = systemClass?.trim() ?? ''
  const inWormholeSpace = /^C[1-6]$/i.test(normalizedClass) || /^(?:Thera|Shattered|Sentinel|Barbican|Vidette|Conflux|Redoubt)$/i.test(normalizedClass)

  if (HIGH_DANGER_SITE.test(name)) {
    return {
      level: 'danger',
      label: 'Dangerous mechanics',
      summary: 'Timed explosions, environmental damage, or hostile NPC mechanics may destroy an exploration frigate.'
    }
  }
  if (SLEEPER_SITE.test(name) && (inWormholeSpace || signature.group === 'data' || signature.group === 'relic')) {
    return {
      level: 'danger',
      label: 'Sleeper combat site',
      summary: 'Unsecured and Forgotten sites contain hostile Sleepers; do not treat them as ordinary hacking sites.'
    }
  }
  if (signature.group === 'combat') {
    return {
      level: 'danger',
      label: 'Combat expected',
      summary: 'Hostile NPCs are expected. Check the exact site and bring a suitable combat ship.'
    }
  }
  if (signature.group === 'gas') {
    return {
      level: 'caution',
      label: 'NPC risk',
      summary: 'Gas sites can contain or later spawn hostile NPCs. Identify the exact site before lingering.'
    }
  }
  if (signature.group === 'wormhole') {
    return {
      level: 'caution',
      label: 'Travel risk',
      summary: 'The destination and other side may be hostile. Check the hole, polarization, mass, and return route.'
    }
  }
  if ((signature.group === 'data' || signature.group === 'relic') && !name) {
    return {
      level: 'unknown',
      label: 'Scan further',
      summary: 'Resolve the site to 100% so FirstMate can check its name for special hazards.'
    }
  }
  if (signature.group === 'data' || signature.group === 'relic') {
    return {
      level: 'lower',
      label: 'Lower PvE risk',
      summary: 'No special hazard was recognized in this site name. Players and unrecognized mechanics can still be dangerous.'
    }
  }
  return {
    level: 'unknown',
    label: 'Unknown risk',
    summary: 'FirstMate does not have enough scanner information to rate this site.'
  }
}

export interface ScannerRow {
  sigId: string
  group: WormholeSignature['group']
  name: string
}

export interface ScannerParseResult {
  rows: ScannerRow[]
  skipped: number
}

function scannerGroup(value: string): WormholeSignature['group'] {
  const normalized = value.trim().toLowerCase()
  if (normalized.includes('wormhole')) return 'wormhole'
  if (normalized.includes('relic')) return 'relic'
  if (normalized.includes('data')) return 'data'
  if (normalized.includes('gas')) return 'gas'
  if (normalized.includes('combat')) return 'combat'
  return 'unknown'
}

export function parseScannerResults(text: string): ScannerParseResult {
  const best = new Map<string, ScannerRow>()
  let skipped = 0
  const lines = text.replace(/^\uFEFF/, '').replace(/\0/g, '').split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const cells = rawLine.split('\t')
    const sigId = cells[0]?.trim().toUpperCase()
    if (!/^[A-Z]{3}-\d{3}$/.test(sigId)) {
      skipped += 1
      continue
    }
    if (cells.some((cell) => cell.trim().toLowerCase() === 'cosmic anomaly')) {
      skipped += 1
      continue
    }
    const group = scannerGroup(cells.slice(1, 4).join(' '))
    const name = (cells[3] || cells[2] || '').trim()
    const row = { sigId, group, name }
    const previous = best.get(sigId)
    const score = (item: ScannerRow): number =>
      (item.group === 'unknown' ? 0 : 1) + (item.name ? 1 : 0)
    if (!previous || score(row) > score(previous)) best.set(sigId, row)
  }

  return { rows: [...best.values()], skipped }
}

export interface ImportSummary {
  system: WormholeSystem
  added: number
  updated: number
}

export function upsertScannerRows(
  system: WormholeSystem,
  rows: ScannerRow[],
  makeId: () => string,
  now = Date.now()
): ImportSummary {
  const existing = new Map(system.signatures.map((signature) => [signature.sigId.toUpperCase(), signature]))
  let added = 0
  let updated = 0
  const signatures = [...system.signatures]

  for (const row of rows) {
    const current = existing.get(row.sigId)
    if (current) {
      const index = signatures.findIndex((signature) => signature.id === current.id)
      const next = {
        ...current,
        group: row.group === 'unknown' ? current.group : row.group,
        name: row.name || current.name,
        life: row.group === 'wormhole' ? (current.life ?? 'unknown') : current.life,
        mass: row.group === 'wormhole' ? (current.mass ?? 'unknown') : current.mass,
        updatedAt: now
      }
      signatures[index] = next
      updated += 1
    } else {
      const signature: WormholeSignature = {
        id: makeId(),
        sigId: row.sigId,
        group: row.group,
        name: row.name,
        life: row.group === 'wormhole' ? 'unknown' : undefined,
        mass: row.group === 'wormhole' ? 'unknown' : undefined,
        createdAt: now,
        updatedAt: now
      }
      signatures.push(signature)
      existing.set(row.sigId, signature)
      added += 1
    }
  }

  return { system: { ...system, signatures, updatedAt: now }, added, updated }
}

export interface ChainRow {
  system: WormholeSystem
  depth: number
  via?: WormholeSignature
  cycle?: boolean
}

/** Produces a narrow-window-friendly traversal and safely marks cycles. */
export function buildChainRows(state: ExplorationState): ChainRow[] {
  const systems = state.systems.filter((system) => !system.archivedAt)
  const byId = new Map(systems.map((system) => [system.id, system]))
  const adjacency = new Map<string, { destination: WormholeSystem; via: WormholeSignature; edgeId: string }[]>()
  const visited = new Set<string>()
  const usedEdges = new Set<string>()
  const rows: ChainRow[] = []

  for (const origin of systems) {
    for (const signature of origin.signatures) {
      if (signature.group !== 'wormhole' || signature.closedAt || !signature.destinationSystemId) continue
      const destination = byId.get(signature.destinationSystemId)
      if (!destination || destination.id === origin.id) continue
      const edgeId = `${origin.id}:${signature.id}`
      adjacency.set(origin.id, [...(adjacency.get(origin.id) ?? []), { destination, via: signature, edgeId }])
      adjacency.set(destination.id, [...(adjacency.get(destination.id) ?? []), { destination: origin, via: signature, edgeId }])
    }
  }

  function visit(system: WormholeSystem, depth: number, via?: WormholeSignature): void {
    if (visited.has(system.id)) {
      rows.push({ system, depth, via, cycle: true })
      return
    }
    visited.add(system.id)
    rows.push({ system, depth, via })
    for (const edge of adjacency.get(system.id) ?? []) {
      if (usedEdges.has(edge.edgeId)) continue
      usedEdges.add(edge.edgeId)
      visit(edge.destination, depth + 1, edge.via)
    }
  }

  const root = byId.get(state.rootSystemId ?? '') ?? systems[0]
  if (root) visit(root, 0)
  for (const system of systems) if (!visited.has(system.id)) visit(system, 0)
  return rows
}

export function formatShortDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}
