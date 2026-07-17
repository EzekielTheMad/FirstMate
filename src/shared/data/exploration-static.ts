import data from './exploration-static.json'

export interface SolarSystemReference {
  id: number
  name: string
  class?: string
  security?: number
  effect?: string
  region?: string
}

export interface WormholeTypeReference {
  code: string
  destinationClass?: string
  lifetimeHours?: number
  totalMassKg?: number
  regenerationKg?: number
  maxJumpMassKg?: number
}

export const explorationDataSource = data.source
export const solarSystems = data.systems as SolarSystemReference[]
export const wormholeTypes = data.wormholeTypes as WormholeTypeReference[]

const systemById = new Map(solarSystems.map((system) => [system.id, system]))
const systemByName = new Map(solarSystems.map((system) => [system.name.toLowerCase(), system]))
const wormholeByCode = new Map(wormholeTypes.map((type) => [type.code, type]))

export function solarSystemById(id: number): SolarSystemReference | undefined {
  return systemById.get(id)
}

export function exactSolarSystem(name: string): SolarSystemReference | undefined {
  return systemByName.get(name.trim().toLowerCase())
}

export function suggestSolarSystems(query: string, limit = 8): SolarSystemReference[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return solarSystems
    .filter((system) => system.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      const aName = a.name.toLowerCase()
      const bName = b.name.toLowerCase()
      const aPrefix = aName.startsWith(needle) ? 0 : 1
      const bPrefix = bName.startsWith(needle) ? 0 : 1
      return aPrefix - bPrefix || aName.length - bName.length || aName.localeCompare(bName)
    })
    .slice(0, limit)
}

export function wormholeTypeByCode(code: string): WormholeTypeReference | undefined {
  return wormholeByCode.get(code.trim().toUpperCase())
}

