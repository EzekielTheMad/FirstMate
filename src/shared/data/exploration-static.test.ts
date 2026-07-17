import { describe, expect, it } from 'vitest'
import {
  exactSolarSystem,
  solarSystemById,
  suggestSolarSystems,
  wormholeTypeByCode
} from './exploration-static'

describe('official exploration static data', () => {
  it('resolves a wormhole system with inherited class and effect', () => {
    expect(exactSolarSystem('j105934')).toMatchObject({
      id: 31002487,
      name: 'J105934',
      class: 'C6',
      effect: 'Magnetar'
    })
    expect(solarSystemById(31002487)?.name).toBe('J105934')
  })

  it('prioritizes prefix matches for autocomplete', () => {
    const suggestions = suggestSolarSystems('jit')
    expect(suggestions[0]?.name).toBe('Jita')
    expect(suggestions.length).toBeLessThanOrEqual(8)
  })

  it('provides official wormhole-type attributes without inferring K162', () => {
    expect(wormholeTypeByCode('h296')).toMatchObject({
      code: 'H296',
      destinationClass: 'C5',
      lifetimeHours: 24,
      totalMassKg: 3_300_000_000,
      maxJumpMassKg: 2_000_000_000
    })
    expect(wormholeTypeByCode('K162')).toEqual({ code: 'K162' })
  })
})
