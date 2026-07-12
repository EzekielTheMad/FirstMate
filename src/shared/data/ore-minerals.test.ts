import { describe, it, expect } from 'vitest'
import {
  MINERAL_TYPE_IDS,
  ORE_MINERALS,
  ICE_PRODUCT_TYPE_IDS,
  isMaterialType,
  oreComposition,
  refinedValue
} from './ore-minerals'

describe('isMaterialType', () => {
  it('treats a known mineral type id as a material', () => {
    expect(isMaterialType(MINERAL_TYPE_IDS.Tritanium)).toBe(true)
  })

  it('treats a tabled ore type id as a material', () => {
    // Veldspar
    expect(isMaterialType(1230)).toBe(true)
  })

  it('treats a known ice ore type id as a material', () => {
    // Blue Ice
    expect(isMaterialType(16264)).toBe(true)
  })

  it('does not treat an arbitrary non-material type id as a material', () => {
    // Rifter (a ship hull), not ore/mineral/ice
    expect(isMaterialType(587)).toBe(false)
  })
})

describe('oreComposition', () => {
  it('returns the per-portion mineral breakdown for a tabled ore', () => {
    // Scordite: 100 units -> 150 Tritanium, 110 Pyerite
    const comp = oreComposition(1228)
    expect(comp).not.toBeNull()
    expect(comp).toEqual(
      expect.arrayContaining([
        { name: 'Tritanium', qty: 150 },
        { name: 'Pyerite', qty: 110 }
      ])
    )
    expect(comp).toHaveLength(2)
  })

  it('returns null for an untabled type id', () => {
    expect(oreComposition(999999999)).toBeNull()
  })
})

describe('refinedValue', () => {
  it('computes minerals x price x (quantity / portionSize) for a tabled ore', () => {
    // Veldspar: portionSize 100, yields 400 Tritanium per portion.
    // 200 units of Veldspar => 2 portions => 800 Tritanium.
    // Tritanium priced at 5 ISK => 4000 ISK.
    const prices = new Map<number, number>([[MINERAL_TYPE_IDS.Tritanium, 5]])
    expect(refinedValue(1230, 200, prices)).toBeCloseTo(4000)
  })

  it('returns 0 for an untabled ore', () => {
    const prices = new Map<number, number>([[MINERAL_TYPE_IDS.Tritanium, 5]])
    expect(refinedValue(999999999, 100, prices)).toBe(0)
  })

  it('sums multiple minerals correctly', () => {
    // Scordite: 100 units -> 150 Tritanium, 110 Pyerite.
    // 100 units (1 portion), Tritanium @2, Pyerite @3 => 150*2 + 110*3 = 630.
    const prices = new Map<number, number>([
      [MINERAL_TYPE_IDS.Tritanium, 2],
      [MINERAL_TYPE_IDS.Pyerite, 3]
    ])
    expect(refinedValue(1228, 100, prices)).toBeCloseTo(630)
  })
})

describe('ICE_PRODUCT_TYPE_IDS', () => {
  it('is a non-empty array of numeric type ids', () => {
    expect(Array.isArray(ICE_PRODUCT_TYPE_IDS)).toBe(true)
    for (const id of ICE_PRODUCT_TYPE_IDS) {
      expect(typeof id).toBe('number')
    }
  })
})

describe('ORE_MINERALS', () => {
  it('every entry has a positive portionSize and at least one mineral yield', () => {
    for (const [typeId, entry] of Object.entries(ORE_MINERALS)) {
      expect(Number(typeId)).toBeGreaterThan(0)
      expect(entry.portionSize).toBeGreaterThan(0)
      expect(Object.keys(entry.minerals).length).toBeGreaterThan(0)
    }
  })
})
