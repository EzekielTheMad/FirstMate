import { describe, expect, it } from 'vitest'
import type { ExplorationMap, WormholeSignature, WormholeSystem } from '@shared/types'
import {
  buildChainRows,
  createReadableMapSummary,
  createSystem,
  formatShortDuration,
  getSiteRiskGuidance,
  normalizeExplorationState,
  parseScannerResults,
  upsertScannerRows
} from './exploration'

function system(id: string, signatures: WormholeSignature[] = []): WormholeSystem {
  return { id, name: id.toUpperCase(), signatures, createdAt: 1, updatedAt: 1 }
}

function signature(id: string, destinationSystemId?: string): WormholeSignature {
  return {
    id,
    sigId: id.toUpperCase(),
    group: 'wormhole',
    name: 'Unstable Wormhole',
    life: 'unknown',
    mass: 'unknown',
    destinationSystemId,
    createdAt: 1,
    updatedAt: 1
  }
}

describe('exploration data', () => {
  it('creates a trimmed empty system', () => {
    expect(createSystem('  J123456  ', 'system-1', 42)).toEqual({
      id: 'system-1', name: 'J123456', signatures: [], createdAt: 42, updatedAt: 42
    })
  })

  it('migrates legacy life and mass without inventing the missing axis', () => {
    const migrated = normalizeExplorationState({
      systems: [system('a', [
        { ...signature('ABC-123'), life: undefined, mass: undefined, status: 'eol', eolMarkedAt: 500 },
        { ...signature('DEF-456'), life: undefined, mass: undefined, status: 'critical' }
      ])]
    })
    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.activeMapId).toBe('map-1')
    expect(migrated.maps[0].rootSystemId).toBe('a')
    expect(migrated.maps[0].systems[0].signatures[0]).toMatchObject({ life: 'under-4h', mass: 'unknown', lifeObservedAt: 500 })
    expect(migrated.maps[0].systems[0].signatures[1]).toMatchObject({ life: 'unknown', mass: 'critical' })
    expect(migrated.maps[0].systems[0].signatures[0].status).toBeUndefined()
  })

  it('normalization is idempotent', () => {
    const once = normalizeExplorationState({ systems: [system('a')] })
    expect(normalizeExplorationState(once)).toEqual(once)
  })

  it('parses tab-separated scanner rows and preserves unresolved IDs', () => {
    const parsed = parseScannerResults('\uFEFFabc-123\tCosmic Signature\tWormhole\tUnstable Wormhole\t100%\t7 AU\r\nDEF-456\tCosmic Signature\t\t\t8%\t14 AU')
    expect(parsed.rows).toEqual([
      { sigId: 'ABC-123', group: 'wormhole', name: 'Unstable Wormhole' },
      { sigId: 'DEF-456', group: 'unknown', name: '' }
    ])
  })

  it('skips anomalies and malformed prose, and keeps the most resolved duplicate', () => {
    const parsed = parseScannerResults('bad prose\nABC-123\tCosmic Signature\t\t\nABC-123\tCosmic Signature\tRelic Site\tForgotten Site\nXYZ-999\tCosmic Anomaly\tCombat Site')
    expect(parsed.rows).toEqual([{ sigId: 'ABC-123', group: 'relic', name: 'Forgotten Site' }])
    expect(parsed.skipped).toBe(2)
  })

  it('upserts scans while preserving operational wormhole fields', () => {
    const existing = { ...signature('ABC-123', 'b'), notes: 'scout note', life: 'under-4h' as const }
    const result = upsertScannerRows(system('a', [existing]), [
      { sigId: 'ABC-123', group: 'wormhole', name: 'Unstable Wormhole' },
      { sigId: 'DEF-456', group: 'gas', name: 'Gas Site' }
    ], () => 'new-id', 100)
    expect(result).toMatchObject({ added: 1, updated: 1 })
    expect(result.system.signatures[0]).toMatchObject({ notes: 'scout note', destinationSystemId: 'b', life: 'under-4h' })
    expect(result.system.signatures[1]).toMatchObject({ id: 'new-id', sigId: 'DEF-456', group: 'gas' })
  })

  it('builds a rooted chain, includes disconnected systems, and guards cycles', () => {
    const state: ExplorationMap = {
      id: 'map-a',
      name: 'Test chain',
      rootSystemId: 'a',
      activeSystemId: 'a',
      createdAt: 1,
      updatedAt: 1,
      systems: [
        system('a', [signature('AAA-111', 'b')]),
        system('b', [signature('BBB-222', 'a')]),
        system('c')
      ]
    }
    expect(buildChainRows(state).map((row) => [row.system.id, row.depth, Boolean(row.cycle)])).toEqual([
      ['a', 0, false], ['b', 1, false], ['a', 2, true], ['c', 0, false]
    ])
    expect(createReadableMapSummary(state)).toContain('FirstMate map: Test chain')
    expect(createReadableMapSummary(state)).toContain('↳ B — AAA-111')
  })

  it('formats elapsed observation time without claiming a deadline', () => {
    expect(formatShortDuration(30 * 60_000)).toBe('30m')
    expect(formatShortDuration(2 * 60 * 60_000 + 15 * 60_000)).toBe('2h 15m')
  })

  it('keeps beginner site guidance opt-in during normalization', () => {
    expect(normalizeExplorationState({ systems: [] }).showSiteGuidance).toBe(false)
    expect(normalizeExplorationState({ systems: [], showSiteGuidance: true }).showSiteGuidance).toBe(true)
  })

  it('flags named special hazards without calling ordinary hacking sites safe', () => {
    expect(getSiteRiskGuidance({ group: 'data', name: 'Lesser Covert Research Facility' }, 'HS').level).toBe('danger')
    expect(getSiteRiskGuidance({ group: 'relic', name: 'Forgotten Perimeter Coronation Platform' }, 'C2')).toMatchObject({
      level: 'danger',
      label: 'Sleeper combat site'
    })
    expect(getSiteRiskGuidance({ group: 'relic', name: 'Ruined Serpentis Monument Site' }, 'HS')).toMatchObject({
      level: 'lower',
      label: 'Lower PvE risk'
    })
    expect(getSiteRiskGuidance({ group: 'data', name: '' }, 'HS').level).toBe('unknown')
  })
})
