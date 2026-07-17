import { describe, expect, it } from 'vitest'
import type { ExplorationMap } from './types'
import { createMapJson, createMapShareCode, decodeSharedMap, prepareImportedMap } from './exploration-share'

const map: ExplorationMap = {
  id: 'map-original',
  name: 'Saturday chain',
  systems: [{
    id: 'system-a',
    name: 'Jita',
    systemClass: 'HS',
    signatures: [{
      id: 'sig-a',
      sigId: 'ABC-123',
      group: 'wormhole',
      name: 'Unstable Wormhole',
      wormholeType: 'H296',
      destinationSystemId: 'system-b',
      createdAt: 1,
      updatedAt: 1
    }],
    createdAt: 1,
    updatedAt: 1
  }, {
    id: 'system-b',
    name: 'J105934',
    systemClass: 'C6',
    signatures: [],
    createdAt: 1,
    updatedAt: 1
  }],
  activeSystemId: 'system-b',
  rootSystemId: 'system-a',
  createdAt: 1,
  updatedAt: 2
}

describe('exploration map sharing', () => {
  it('round-trips a compact clipboard share code', async () => {
    const code = await createMapShareCode(map)
    expect(code.startsWith('FMAP1G:')).toBe(true)
    expect(await decodeSharedMap(code)).toMatchObject({ name: 'Saturday chain', systems: map.systems })
  })

  it('accepts the readable JSON file format', async () => {
    const json = createMapJson(map)
    expect(await decodeSharedMap(json)).toMatchObject({ id: 'map-original', name: 'Saturday chain' })
  })

  it('gives imported maps a new local identity', () => {
    expect(prepareImportedMap(map, 'map-imported', 50)).toMatchObject({
      id: 'map-imported',
      name: 'Saturday chain (imported)',
      createdAt: 50,
      archivedAt: undefined
    })
  })

  it('rejects arbitrary JSON', async () => {
    await expect(decodeSharedMap('{"hello":"world"}')).rejects.toThrow('not a FirstMate exploration map')
  })
})
