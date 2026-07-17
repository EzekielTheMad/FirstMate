import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type {
  AssetHolding,
  AssetsData,
  EsiResult,
  McpAssetLocation,
  ShipInfo,
  ShipsData
} from '@shared/types'
import { getIdentity } from '../auth/sso'
import {
  fetchClones,
  fetchDashboard,
  fetchEconomy,
  fetchIndustryJobs,
  fetchInventorySnapshot,
  fetchMining,
  fetchShips
} from '../esi/client'
import { getAdvisorHistory, getCombat, getExploration, getSettings } from '../store'

const PRICE_WARNING =
  'Values use ESI universe average/adjusted prices, not executable local buy or sell orders.'
const REPROCESS_WARNING =
  'Reprocessing estimates cover curated ores only and assume 100% base yield before skills, facility bonuses, and tax. Module and ice reprocessing is not valued.'

interface LocationInventory {
  id: number
  name?: string
  gear: ProjectedHolding[]
  materials: ProjectedHolding[]
  ships: ShipInfo[]
}

interface ProjectedHolding {
  typeId: number
  typeName?: string
  quantity: number
  estimatedUnitValue: number
  estimatedValue: number
  reprocessing: {
    supported: boolean
    estimatedBaseMineralValue?: number
    difference?: number
    ratio?: number
  }
}

function unwrap<T>(result: EsiResult<T>): T {
  if (!result.ok || !result.data) throw new Error(result.error || 'The requested ESI data is unavailable.')
  return result.data
}

function envelope(data: unknown, warnings: string[] = [], source = 'ESI + FirstMate local data') {
  const identity = getIdentity()
  return {
    asOf: new Date().toISOString(),
    character: identity ? { id: String(identity.characterId), name: identity.characterName } : null,
    source,
    warnings,
    data
  }
}

function toolResult(data: unknown, warnings: string[] = [], source?: string) {
  const value = envelope(data, warnings, source)
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value
  }
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const value = { ok: false, error: { code: 'FIRSTMATE_DATA_UNAVAILABLE', message, retryable: true } }
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value
  }
}

async function safeTool(run: () => Promise<ReturnType<typeof toolResult>>) {
  try {
    return await run()
  } catch (error) {
    return toolError(error)
  }
}

function projectHolding(holding: AssetHolding, locationId: number): ProjectedHolding | null {
  const local = holding.locations.find((item) => item.locationId === locationId)
  if (!local) return null
  const unitValue = holding.quantity ? holding.value / holding.quantity : 0
  const unitRefinedValue = holding.quantity ? holding.refinedValue / holding.quantity : 0
  const estimatedValue = unitValue * local.quantity
  const estimatedRefinedValue = unitRefinedValue * local.quantity
  return {
    typeId: holding.typeId,
    typeName: holding.typeName,
    quantity: local.quantity,
    estimatedUnitValue: unitValue,
    estimatedValue,
    reprocessing: {
      supported: holding.isOre && estimatedRefinedValue > 0,
      estimatedBaseMineralValue: estimatedRefinedValue || undefined,
      difference: estimatedRefinedValue ? estimatedRefinedValue - estimatedValue : undefined,
      ratio: estimatedRefinedValue && estimatedValue ? estimatedRefinedValue / estimatedValue : undefined
    }
  }
}

async function inventoryData(): Promise<{ gear: AssetsData; materials: AssetsData; ships: ShipsData }> {
  const inventory = unwrap(await fetchInventorySnapshot())
  return {
    gear: { holdings: inventory.gear, totalValue: inventory.totalGearValue, itemTypeCount: inventory.gearTypeCount },
    materials: { holdings: inventory.materials, totalValue: inventory.totalMaterialValue, itemTypeCount: inventory.materialTypeCount },
    ships: { ships: inventory.ships, totalValue: inventory.totalShipsValue }
  }
}

export async function listAssetLocations(): Promise<McpAssetLocation[]> {
  const inventory = await inventoryData()
  const locations = new Map<number, McpAssetLocation>()
  const ensure = (id: number, name?: string): McpAssetLocation => {
    let location = locations.get(id)
    if (!location) {
      location = {
        locationId: id,
        locationName: name,
        itemTypeCount: 0,
        totalQuantity: 0,
        estimatedValue: 0,
        hasGear: false,
        hasMaterials: false,
        hasShips: false
      }
      locations.set(id, location)
    }
    if (!location.locationName && name) location.locationName = name
    return location
  }

  const addHoldings = (data: AssetsData, kind: 'gear' | 'materials'): void => {
    for (const holding of data.holdings) {
      for (const local of holding.locations) {
        const location = ensure(local.locationId, local.locationName)
        location.itemTypeCount += 1
        location.totalQuantity += local.quantity
        location.estimatedValue += holding.quantity ? (holding.value / holding.quantity) * local.quantity : 0
        if (kind === 'gear') location.hasGear = true
        else location.hasMaterials = true
      }
    }
  }
  addHoldings(inventory.gear, 'gear')
  addHoldings(inventory.materials, 'materials')
  for (const ship of inventory.ships.ships) {
    const location = ensure(ship.locationId, ship.locationName)
    location.itemTypeCount += 1
    location.totalQuantity += 1
    location.estimatedValue += ship.value
    location.hasShips = true
  }
  return [...locations.values()].sort((a, b) => b.estimatedValue - a.estimatedValue)
}

async function resolveLocation(locationId?: string, locationName?: string): Promise<McpAssetLocation> {
  const locations = await listAssetLocations()
  const configured = getSettings().mcpHomeLocationId
  const id = locationId || configured
  if (id) {
    const exact = locations.find((location) => String(location.locationId) === id)
    if (exact) return exact
    throw new Error(`No assets were found at location id ${id}. Call list_asset_locations first.`)
  }
  if (locationName) {
    const query = locationName.trim().toLowerCase()
    const matches = locations.filter((location) => location.locationName?.toLowerCase().includes(query))
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) throw new Error(`Location name is ambiguous. Use one of these ids: ${matches.map((item) => item.locationId).join(', ')}`)
  }
  throw new Error('Home base is not configured. Call list_asset_locations, then set the Home base location in FirstMate Settings or pass location_id.')
}

async function inventoryAt(locationId?: string, locationName?: string): Promise<LocationInventory> {
  const [location, inventory] = await Promise.all([resolveLocation(locationId, locationName), inventoryData()])
  return {
    id: location.locationId,
    name: location.locationName,
    gear: inventory.gear.holdings.map((item) => projectHolding(item, location.locationId)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    materials: inventory.materials.holdings.map((item) => projectHolding(item, location.locationId)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    ships: inventory.ships.ships.filter((ship) => ship.locationId === location.locationId)
  }
}

const limitSchema = z.number().int().min(1).max(200).default(50)

export function registerFirstMateTools(server: McpServer): void {
  server.registerTool('get_firstmate_status', {
    description: 'Check FirstMate login, MCP data availability, granted ESI scopes, configured home base, and tool limitations.',
    inputSchema: {}
  }, async () => safeTool(async () => {
    const identity = getIdentity()
    const settings = getSettings()
    return toolResult({
      loggedIn: Boolean(identity),
      identity: identity ? { id: String(identity.characterId), name: identity.characterName, grantedScopes: identity.scopes } : null,
      homeBaseLocationId: settings.mcpHomeLocationId || null,
      firstMateMustRemainRunning: true,
      readOnly: true
    })
  }))

  server.registerTool('get_character_overview', {
    description: 'Get current location, active ship, wallet balance, total skill points, and current skill queue summary.', inputSchema: {}
  }, async () => safeTool(async () => toolResult(unwrap(await fetchDashboard()))))

  server.registerTool('get_current_location', {
    description: 'Get only the character current solar system, region, security, and station/structure.', inputSchema: {}
  }, async () => safeTool(async () => toolResult(unwrap(await fetchDashboard()).location)))

  server.registerTool('get_current_ship', {
    description: 'Get only the currently active ship and its name/type.', inputSchema: {}
  }, async () => safeTool(async () => toolResult(unwrap(await fetchDashboard()).ship)))

  server.registerTool('get_skills_and_queue', {
    description: 'Get total skill points and the current training queue.', inputSchema: { limit: limitSchema }
  }, async ({ limit }) => safeTool(async () => {
    const data = unwrap(await fetchDashboard())
    return toolResult({ totalSkillPoints: data.skillPoints, queueCount: data.skillQueueCount, queue: data.skillQueue.slice(0, limit) })
  }))

  server.registerTool('get_wallet_activity', {
    description: 'Get wallet balance and recent wallet journal activity.', inputSchema: { limit: z.number().int().min(0).max(50).default(20) }
  }, async ({ limit }) => safeTool(async () => {
    const data = unwrap(await fetchEconomy())
    return toolResult({ walletBalance: data.walletBalance, journal: data.journal.slice(0, limit) })
  }))

  server.registerTool('get_market_orders', {
    description: 'Get the character own open market buy and sell orders.',
    inputSchema: { side: z.enum(['all', 'buy', 'sell']).default('all'), search: z.string().optional(), limit: limitSchema }
  }, async ({ side, search, limit }) => safeTool(async () => {
    const data = unwrap(await fetchEconomy())
    const query = search?.toLowerCase()
    const orders = data.orders.filter((order) => (side === 'all' || (side === 'buy') === order.isBuyOrder) && (!query || order.typeName?.toLowerCase().includes(query))).slice(0, limit)
    return toolResult({ walletBalance: data.walletBalance, orders })
  }))

  server.registerTool('list_asset_locations', {
    description: 'List stable asset location ids/names with estimated values and whether each contains gear, materials, or ships. Use before location-scoped inventory questions.', inputSchema: {}
  }, async () => safeTool(async () => toolResult(await listAssetLocations(), [PRICE_WARNING])))

  server.registerTool('get_assets_at_location', {
    description: 'Get bounded gear, materials, and ships at a location. Omit location_id to use the configured home base.',
    inputSchema: { location_id: z.string().optional(), location_name: z.string().optional(), kind: z.enum(['all', 'gear', 'materials', 'ships']).default('all'), search: z.string().optional(), minimum_value: z.number().min(0).default(0), limit: limitSchema }
  }, async ({ location_id, location_name, kind, search, minimum_value, limit }) => safeTool(async () => {
    const data = await inventoryAt(location_id, location_name)
    const query = search?.toLowerCase()
    const filter = <T extends { typeName?: string; estimatedValue: number }>(items: T[]) => items.filter((item) => item.estimatedValue >= minimum_value && (!query || item.typeName?.toLowerCase().includes(query))).sort((a, b) => b.estimatedValue - a.estimatedValue).slice(0, limit)
    const ships = data.ships.filter((ship) => !query || `${ship.name} ${ship.typeName}`.toLowerCase().includes(query)).sort((a, b) => b.value - a.value).slice(0, limit)
    return toolResult({ location: { id: String(data.id), name: data.name }, gear: kind === 'all' || kind === 'gear' ? filter(data.gear) : [], materials: kind === 'all' || kind === 'materials' ? filter(data.materials) : [], ships: kind === 'all' || kind === 'ships' ? ships : [] }, [PRICE_WARNING, REPROCESS_WARNING])
  }))

  server.registerTool('search_assets', {
    description: 'Search asset type names across every location and return matching quantities and estimated values.',
    inputSchema: { query: z.string().min(1), limit: limitSchema }
  }, async ({ query, limit }) => safeTool(async () => {
    const inventory = await inventoryData()
    const needle = query.toLowerCase()
    const matches = [...inventory.gear.holdings.map((item) => ({ kind: 'gear', ...item, estimatedValue: item.value })), ...inventory.materials.holdings.map((item) => ({ kind: 'material', ...item, estimatedValue: item.value }))].filter((item) => item.typeName?.toLowerCase().includes(needle)).sort((a, b) => b.estimatedValue - a.estimatedValue).slice(0, limit)
    const ships = inventory.ships.ships.filter((ship) => `${ship.name} ${ship.typeName}`.toLowerCase().includes(needle)).slice(0, limit)
    return toolResult({ matches, ships }, [PRICE_WARNING])
  }))

  server.registerTool('get_asset_cleanup_context', {
    description: 'Get a comprehensive evidence packet for deciding what to keep, sell, or reprocess at home base: gear, materials, ships/fittings/cargo, own market orders, and industry jobs. Results are estimates, not automatic recommendations.',
    inputSchema: { location_id: z.string().optional(), location_name: z.string().optional(), minimum_stack_value: z.number().min(0).default(0), limit: z.number().int().min(1).max(200).default(100) }
  }, async ({ location_id, location_name, minimum_stack_value, limit }) => safeTool(async () => {
    const [data, economy, industry] = await Promise.all([inventoryAt(location_id, location_name), fetchEconomy(), fetchIndustryJobs()])
    const allStacks = [...data.gear.map((item) => ({ kind: 'gear', ...item })), ...data.materials.map((item) => ({ kind: 'material', ...item }))]
    const matchingStacks = allStacks.filter((item) => item.estimatedValue >= minimum_stack_value).sort((a, b) => b.estimatedValue - a.estimatedValue)
    const stacks = matchingStacks.slice(0, limit)
    const total = allStacks.reduce((sum, item) => sum + item.estimatedValue, 0) + data.ships.reduce((sum, ship) => sum + ship.value, 0)
    return toolResult({
      location: { id: String(data.id), name: data.name },
      summary: {
        estimatedValue: total,
        totalStackCount: allStacks.length,
        matchingStackCount: matchingStacks.length,
        returnedStackCount: stacks.length,
        resultsTruncated: matchingStacks.length > stacks.length,
        shipCount: data.ships.length
      },
      stacks,
      ships: data.ships,
      openMarketOrders: economy.ok ? economy.data?.orders ?? [] : [],
      industryJobs: industry.ok ? industry.data?.jobs ?? [] : [],
      guidanceForAgent: 'Ask about doctrine, fitted ships, planned industry, hauling effort, and reserve quantities before labeling an item safe to sell. Treat blueprints, assembled ships, fitted/cargo items, and unsupported reprocessing as review items.'
    }, [PRICE_WARNING, REPROCESS_WARNING])
  }))

  server.registerTool('analyze_reprocessing_candidates', {
    description: 'Compare estimated raw-market value with known theoretical base mineral value for supported ore stacks at a location.',
    inputSchema: { location_id: z.string().optional(), location_name: z.string().optional(), limit: limitSchema }
  }, async ({ location_id, location_name, limit }) => safeTool(async () => {
    const data = await inventoryAt(location_id, location_name)
    const supported = data.materials.filter((item) => item.reprocessing.supported).sort((a, b) => Math.abs(b.reprocessing.difference ?? 0) - Math.abs(a.reprocessing.difference ?? 0)).slice(0, limit)
    return toolResult({ location: { id: String(data.id), name: data.name }, candidates: supported }, [PRICE_WARNING, REPROCESS_WARNING])
  }))

  server.registerTool('get_ships', {
    description: 'Get owned ships with location, estimated hull+contents value, fitted modules, drones, and cargo.',
    inputSchema: { location_id: z.string().optional(), search: z.string().optional(), active_only: z.boolean().default(false), limit: limitSchema }
  }, async ({ location_id, search, active_only, limit }) => safeTool(async () => {
    const data = unwrap(await fetchShips())
    const needle = search?.toLowerCase()
    const ships = data.ships.filter((ship) => (!location_id || String(ship.locationId) === location_id) && (!active_only || ship.isActive) && (!needle || `${ship.name} ${ship.typeName}`.toLowerCase().includes(needle))).slice(0, limit)
    return toolResult({ totalEstimatedValue: ships.reduce((sum, ship) => sum + ship.value, 0), ships }, [PRICE_WARNING])
  }))

  server.registerTool('get_mining_history', {
    description: 'Get recent personal mining ledger entries with system, ore, quantity, and estimated value.',
    inputSchema: { days: z.number().int().min(1).max(365).default(30), search: z.string().optional(), limit: limitSchema }
  }, async ({ days, search, limit }) => safeTool(async () => {
    const data = unwrap(await fetchMining())
    const cutoff = Date.now() - days * 86_400_000
    const needle = search?.toLowerCase()
    const entries = data.entries.filter((entry) => Date.parse(entry.date) >= cutoff && (!needle || `${entry.typeName} ${entry.solarSystemName}`.toLowerCase().includes(needle))).slice(0, limit)
    return toolResult({ entries, totalQuantity: entries.reduce((sum, entry) => sum + entry.quantity, 0), totalEstimatedValue: entries.reduce((sum, entry) => sum + (entry.estimatedValue ?? 0), 0) }, [PRICE_WARNING])
  }))

  server.registerTool('get_industry_jobs', {
    description: 'Get character industry jobs, products, blueprints, locations, status, runs, and end times.',
    inputSchema: { status: z.string().optional(), limit: limitSchema }
  }, async ({ status, limit }) => safeTool(async () => {
    const data = unwrap(await fetchIndustryJobs())
    const jobs = data.jobs.filter((job) => !status || job.status.toLowerCase() === status.toLowerCase()).slice(0, limit)
    return toolResult({ jobs })
  }))

  server.registerTool('get_clones_and_implants', {
    description: 'Get medical clone home, jump clones, and installed implants.', inputSchema: {}
  }, async () => safeTool(async () => toolResult(unwrap(await fetchClones()))))

  server.registerTool('get_exploration_chain', {
    description: 'Get one locally tracked wormhole map with linked systems, signatures, life/mass observations, and notes. Defaults to the active map.',
    inputSchema: { map_id: z.string().optional(), map_name: z.string().optional(), include_archived: z.boolean().default(false), include_closed: z.boolean().default(false) }
  }, async ({ map_id, map_name, include_archived, include_closed }) => safeTool(async () => {
    const state = getExploration()
    const map = state.maps.find((item) => (map_id && item.id === map_id) || (map_name && item.name.toLowerCase() === map_name.toLowerCase()))
      ?? state.maps.find((item) => item.id === state.activeMapId)
      ?? state.maps[0]
    if (!map) throw new Error('No exploration maps have been saved yet.')
    const systems = map.systems.filter((system) => include_archived || !system.archivedAt).map((system) => ({ ...system, signatures: system.signatures.filter((signature) => include_closed || !signature.closedAt) }))
    const availableMaps = state.maps.map((item) => ({ id: item.id, name: item.name, archivedAt: item.archivedAt, systemCount: item.systems.length }))
    return toolResult({ map: { ...map, systems }, availableMaps, activeMapId: state.activeMapId }, ['Exploration data is manually observed and stored locally; it is not live ESI data.'])
  }))

  server.registerTool('get_exploration_system', {
    description: 'Find one locally tracked exploration system by exact id or case-insensitive name.',
    inputSchema: { map_id: z.string().optional(), map_name: z.string().optional(), system_id: z.string().optional(), name: z.string().optional(), include_closed: z.boolean().default(false) }
  }, async ({ map_id, map_name, system_id, name, include_closed }) => safeTool(async () => {
    const state = getExploration()
    const maps = map_id || map_name
      ? state.maps.filter((map) => (map_id && map.id === map_id) || (map_name && map.name.toLowerCase() === map_name.toLowerCase()))
      : [...state.maps.filter((map) => map.id === state.activeMapId), ...state.maps.filter((map) => map.id !== state.activeMapId)]
    const owner = maps.find((map) => map.systems.some((item) => (system_id && item.id === system_id) || (name && item.name.toLowerCase() === name.toLowerCase())))
    const system = owner?.systems.find((item) => (system_id && item.id === system_id) || (name && item.name.toLowerCase() === name.toLowerCase()))
    if (!system) throw new Error('Exploration system not found. Call get_exploration_chain first.')
    return toolResult({ map: owner && { id: owner.id, name: owner.name }, ...system, signatures: system.signatures.filter((signature) => include_closed || !signature.closedAt) }, ['Exploration data is manually observed and stored locally; it is not live ESI data.'])
  }))

  server.registerTool('get_wormhole_alerts', {
    description: 'List player-observed wormholes with short life, expired life, critical mass, or closed status.', inputSchema: {}
  }, async () => safeTool(async () => {
    const alerts = getExploration().maps.filter((map) => !map.archivedAt).flatMap((map) => map.systems.flatMap((system) => system.signatures.filter((signature) => signature.group === 'wormhole' && (signature.closedAt || signature.mass === 'critical' || ['under-day', 'under-4h', 'under-1h', 'expired'].includes(signature.life ?? ''))).map((signature) => ({ map: { id: map.id, name: map.name }, system: { id: system.id, name: system.name }, signature }))))
    return toolResult({ alerts }, ['These are player-recorded observations. Recheck wormholes in game before committing a route.'])
  }))

  server.registerTool('get_combat_library', {
    description: 'Get locally saved combat notes and EFT/pyfa-style fits. Useful for identifying modules and ships that may be worth keeping.',
    inputSchema: { search: z.string().optional(), limit: limitSchema }
  }, async ({ search, limit }) => safeTool(async () => {
    const combat = getCombat()
    const needle = search?.toLowerCase()
    return toolResult({ notes: combat.notes, fits: combat.fits.filter((fit) => !needle || `${fit.name} ${fit.shipType} ${fit.role} ${fit.notes} ${fit.eft}`.toLowerCase().includes(needle)).slice(0, limit) }, [], 'FirstMate local data')
  }))

  server.registerTool('get_advisor_history', {
    description: 'Search successful FirstMate Advisor questions and answers saved locally.',
    inputSchema: { search: z.string().optional(), limit: z.number().int().min(1).max(50).default(10) }
  }, async ({ search, limit }) => safeTool(async () => {
    const needle = search?.toLowerCase()
    const history = getAdvisorHistory().filter((entry) => !needle || `${entry.goal} ${entry.focus} ${entry.advice}`.toLowerCase().includes(needle)).slice(0, limit)
    return toolResult({ history }, [], 'FirstMate local data')
  }))
}
