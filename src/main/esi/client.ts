import {
  AssetHolding,
  AssetsData,
  ClonesData,
  DashboardData,
  EconomyData,
  EsiResult,
  FittedItem,
  ImplantInfo,
  IndustryData,
  IndustryJob,
  JumpClone,
  MarketOrder,
  MiningData,
  MiningLedgerEntry,
  ShipInfo,
  ShipSlot,
  ShipsData,
  SkillQueueEntry,
  WalletJournalEntry
} from '@shared/types'
import {
  MINERAL_TYPE_IDS,
  isMaterialType,
  oreComposition,
  refinedValue as computeRefinedValue
} from '@shared/data/ore-minerals'
import { getValidAccessToken, getIdentity, setClearAuthCaches } from '../auth/sso'

const ESI_BASE = 'https://esi.evetech.net/latest'
const USER_AGENT = 'FirstMate/0.1 (EVE companion app)'

// ---- Name resolution cache -------------------------------------------------

const nameCache = new Map<number, string>()
/** Ids /universe/names can't resolve (e.g. player structures) — skip on retry. */
const unresolvableIds = new Set<number>()
let marketPrices: Map<number, number> | null = null
let marketPricesAt = 0

// ---- Type -> group -> category classification cache ------------------------
// Used to detect ships (category_id 6) among a character's assets. These map
// small integer ids and are effectively static SDE data, so they're cached for
// the life of the process (cleared only on logout/re-auth like everything else
// here) rather than on the short inventory TTL below.
const typeGroup = new Map<number, number>()
const groupCategory = new Map<number, number>()

/** Single-entry (per logged-in character) cache of the combined ships/assets pass. */
let inventoryCache: { cid: number; at: number; data: InventorySnapshot } | null = null
let inventoryInFlight: { cid: number; promise: Promise<InventorySnapshot> } | null = null
const INVENTORY_TTL_MS = 2 * 60 * 1000

setClearAuthCaches(() => {
  nameCache.clear()
  unresolvableIds.clear()
  marketPrices = null
  marketPricesAt = 0
  typeGroup.clear()
  groupCategory.clear()
  inventoryCache = null
  inventoryInFlight = null
})

interface EsiOptions {
  auth?: boolean
  method?: 'GET' | 'POST'
  body?: unknown
}

async function esi<T>(path: string, opts: EsiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json'
  }
  if (opts.auth) {
    const token = await getValidAccessToken()
    headers.Authorization = `Bearer ${token}`
  }
  if (opts.body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${ESI_BASE}${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`ESI ${res.status} ${path}: ${text.slice(0, 200)}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }
  return (await res.json()) as T
}

/**
 * Resolve a chunk of ids via /universe/names. That endpoint is all-or-nothing:
 * if ANY id is unresolvable (e.g. a player-structure location id), it 404s the
 * whole batch. So on failure we binary-split to salvage the resolvable ids and
 * isolate the bad ones (recorded in `unresolvableIds` so we don't retry them
 * every refresh). O(log n) extra calls only in the failure case.
 */
async function resolveChunk(chunk: number[]): Promise<void> {
  if (chunk.length === 0) return
  try {
    const results = await esi<Array<{ id: number; name: string }>>('/universe/names/', {
      body: chunk
    })
    for (const r of results) nameCache.set(r.id, r.name)
  } catch {
    if (chunk.length === 1) {
      unresolvableIds.add(chunk[0])
      return
    }
    const mid = Math.floor(chunk.length / 2)
    await resolveChunk(chunk.slice(0, mid))
    await resolveChunk(chunk.slice(mid))
  }
}

/** Resolve a batch of ids to names using the universe/names endpoint. */
async function resolveNames(ids: number[]): Promise<void> {
  const unique = [...new Set(ids)].filter(
    (id) => id > 0 && !nameCache.has(id) && !unresolvableIds.has(id)
  )
  if (unique.length === 0) return
  // /universe/names accepts up to 1000 ids per call.
  for (let i = 0; i < unique.length; i += 1000) {
    await resolveChunk(unique.slice(i, i + 1000))
  }
}

function nameOf(id?: number): string | undefined {
  if (!id) return undefined
  return nameCache.get(id)
}

/**
 * Resolve player-owned (Upwell) structure ids via /universe/structures/{id}/.
 * Unlike /universe/names, this is a per-id endpoint that requires the
 * esi-universe.read_structures.v1 scope AND docking/observer access to the
 * structure — so on any error (403/404/etc.) we just record the id as
 * unresolvable rather than retrying it every refresh.
 */
async function resolveStructureNames(ids: number[]): Promise<void> {
  const unique = [...new Set(ids)].filter(
    (id) => id > 0 && !nameCache.has(id) && !unresolvableIds.has(id)
  )
  await Promise.all(
    unique.map(async (id) => {
      try {
        const structure = await esi<{ name: string }>(`/universe/structures/${id}/`, { auth: true })
        nameCache.set(id, structure.name)
      } catch {
        unresolvableIds.add(id)
      }
    })
  )
}

/**
 * Name a character's own container/ship item ids via /characters/{id}/assets/names.
 * Used when an item's root location walk ends on a container that is itself an
 * asset (so we can show "In <container name>"). ESI returns "None" for unnamed
 * items; those are treated as unresolvable.
 */
async function resolveAssetNames(cid: number, ids: number[]): Promise<Set<number>> {
  const named = new Set<number>()
  const unique = [...new Set(ids)].filter(
    (id) => id > 0 && !nameCache.has(id) && !unresolvableIds.has(id)
  )
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000)
    try {
      const results = await esi<Array<{ item_id: number; name: string }>>(
        `/characters/${cid}/assets/names/`,
        { auth: true, method: 'POST', body: chunk }
      )
      for (const r of results) {
        if (r.name && r.name !== 'None') {
          nameCache.set(r.item_id, r.name)
          named.add(r.item_id)
        }
        // Not marking unnamed items unresolvable: a big id the assets/names
        // endpoint doesn't own may still be a player structure to try next.
      }
    } catch {
      /* leave for the structure resolver / fallback label */
    }
  }
  return named
}

/** Ships are category_id 6. Used to tell hulls apart from modules/ammo/etc. */
const SHIP_CATEGORY_ID = 6

/** Resolve a single type's category_id via /universe/types/{id}/ -> /universe/groups/{id}/. */
async function resolveCategory(typeId: number): Promise<number | undefined> {
  if (!typeGroup.has(typeId)) {
    try {
      const t = await esi<{ group_id: number }>(`/universe/types/${typeId}/`)
      typeGroup.set(typeId, t.group_id)
    } catch {
      return undefined
    }
  }
  const gid = typeGroup.get(typeId)!
  if (!groupCategory.has(gid)) {
    try {
      const g = await esi<{ category_id: number }>(`/universe/groups/${gid}/`)
      groupCategory.set(gid, g.category_id)
    } catch {
      return undefined
    }
  }
  return groupCategory.get(gid)
}

/** Warm the type/group/category caches for a batch of type ids, in parallel. */
async function resolveCategories(typeIds: number[]): Promise<void> {
  await Promise.all([...new Set(typeIds)].map((id) => resolveCategory(id)))
}

/** Synchronous lookup after `resolveCategories` has warmed the caches. */
function categoryOf(typeId: number): number | undefined {
  const gid = typeGroup.get(typeId)
  return gid == null ? undefined : groupCategory.get(gid)
}

async function getMarketPrices(): Promise<Map<number, number>> {
  if (marketPrices && Date.now() - marketPricesAt < 10 * 60 * 1000) return marketPrices
  try {
    const rows = await esi<Array<{ type_id: number; average_price?: number; adjusted_price?: number }>>(
      '/markets/prices/'
    )
    const map = new Map<number, number>()
    for (const r of rows) map.set(r.type_id, r.average_price ?? r.adjusted_price ?? 0)
    marketPrices = map
    marketPricesAt = Date.now()
    return map
  } catch {
    return marketPrices ?? new Map()
  }
}

function wrap<T>(fn: () => Promise<T>): Promise<EsiResult<T>> {
  return fn()
    .then((data) => ({ ok: true, data }) as EsiResult<T>)
    .catch((e: Error & { status?: number }) => {
      const scopeError = e.status === 403
      return {
        ok: false,
        error: scopeError
          ? 'Access denied by ESI — the required scope may not be granted. Re-login and approve all scopes.'
          : e.message,
        scopeError
      } as EsiResult<T>
    })
}

// ---- Dashboard -------------------------------------------------------------

export function fetchDashboard(): Promise<EsiResult<DashboardData>> {
  return wrap(async () => {
    const identity = getIdentity()
    if (!identity) throw new Error('Not logged in.')
    const cid = identity.characterId

    const [wallet, location, ship, online, skills, queue] = await Promise.all([
      esi<number>(`/characters/${cid}/wallet/`, { auth: true }),
      esi<{ solar_system_id: number; station_id?: number; structure_id?: number }>(
        `/characters/${cid}/location/`,
        { auth: true }
      ),
      esi<{ ship_type_id: number; ship_name: string }>(`/characters/${cid}/ship/`, { auth: true }),
      esi<{ online: boolean }>(`/characters/${cid}/online/`, { auth: true }).catch(() => ({
        online: false
      })),
      esi<{ total_sp: number }>(`/characters/${cid}/skills/`, { auth: true }).catch(() => ({
        total_sp: 0
      })),
      esi<Array<{ skill_id: number; finished_level: number; finish_date?: string }>>(
        `/characters/${cid}/skillqueue/`,
        { auth: true }
      ).catch(() => [])
    ])

    const system = await esi<{ name: string; security_status: number; constellation_id: number }>(
      `/universe/systems/${location.solar_system_id}/`
    ).catch(() => null)

    const idsToResolve = [location.solar_system_id, ship.ship_type_id]
    if (location.station_id) idsToResolve.push(location.station_id)
    const nextSkill = queue[0]
    if (nextSkill) idsToResolve.push(nextSkill.skill_id)
    idsToResolve.push(...queue.map((q) => q.skill_id))

    // Region name via constellation -> region
    let regionName: string | undefined
    if (system?.constellation_id) {
      const constellation = await esi<{ region_id: number }>(
        `/universe/constellations/${system.constellation_id}/`
      ).catch(() => null)
      if (constellation?.region_id) {
        idsToResolve.push(constellation.region_id)
        await resolveNames(idsToResolve)
        regionName = nameOf(constellation.region_id)
      }
    }
    await resolveNames(idsToResolve)

    return {
      identity,
      online: online.online,
      walletBalance: wallet,
      location: {
        solarSystemId: location.solar_system_id,
        solarSystemName: system?.name ?? nameOf(location.solar_system_id),
        regionName,
        security: system ? Math.round(system.security_status * 10) / 10 : undefined,
        stationOrStructure: location.station_id
          ? nameOf(location.station_id)
          : location.structure_id
            ? 'Player structure'
            : 'In space'
      },
      ship: {
        typeId: ship.ship_type_id,
        typeName: nameOf(ship.ship_type_id),
        name: ship.ship_name
      },
      skillPoints: skills.total_sp,
      skillQueueCount: queue.length,
      nextSkill: nextSkill
        ? {
            name: nameOf(nextSkill.skill_id),
            finishesAt: nextSkill.finish_date,
            level: nextSkill.finished_level
          }
        : undefined,
      skillQueue: queue.map(
        (q): SkillQueueEntry => ({
          name: nameOf(q.skill_id),
          level: q.finished_level,
          finishesAt: q.finish_date
        })
      )
    }
  })
}

// ---- Economy ---------------------------------------------------------------

export function fetchEconomy(): Promise<EsiResult<EconomyData>> {
  return wrap(async () => {
    const identity = getIdentity()
    if (!identity) throw new Error('Not logged in.')
    const cid = identity.characterId

    const [wallet, journalRaw, ordersRaw] = await Promise.all([
      esi<number>(`/characters/${cid}/wallet/`, { auth: true }),
      esi<
        Array<{
          id: number
          date: string
          ref_type: string
          amount?: number
          balance?: number
          description: string
        }>
      >(`/characters/${cid}/wallet/journal/`, { auth: true }).catch(() => []),
      esi<
        Array<{
          order_id: number
          type_id: number
          is_buy_order?: boolean
          price: number
          volume_remain: number
          volume_total: number
          region_id: number
          issued: string
        }>
      >(`/characters/${cid}/orders/`, { auth: true }).catch(() => [])
    ])

    await resolveNames(ordersRaw.map((o) => o.type_id))

    const journal: WalletJournalEntry[] = journalRaw.slice(0, 50).map((j) => ({
      id: j.id,
      date: j.date,
      refType: j.ref_type,
      amount: j.amount ?? 0,
      balance: j.balance,
      description: j.description
    }))

    const orders: MarketOrder[] = ordersRaw.map((o) => ({
      orderId: o.order_id,
      typeId: o.type_id,
      typeName: nameOf(o.type_id),
      isBuyOrder: Boolean(o.is_buy_order),
      price: o.price,
      volumeRemain: o.volume_remain,
      volumeTotal: o.volume_total,
      regionId: o.region_id,
      issued: o.issued
    }))

    return { walletBalance: wallet, journal, orders }
  })
}

// ---- Mining ----------------------------------------------------------------

export function fetchMining(): Promise<EsiResult<MiningData>> {
  return wrap(async () => {
    const identity = getIdentity()
    if (!identity) throw new Error('Not logged in.')
    const cid = identity.characterId

    const [raw, prices] = await Promise.all([
      esi<Array<{ date: string; solar_system_id: number; type_id: number; quantity: number }>>(
        `/characters/${cid}/mining/`,
        { auth: true }
      ).catch(() => []),
      getMarketPrices()
    ])

    await resolveNames(raw.flatMap((r) => [r.solar_system_id, r.type_id]))

    let totalQuantity = 0
    let totalEstimatedValue = 0
    const entries: MiningLedgerEntry[] = raw.map((r) => {
      const unit = prices.get(r.type_id) ?? 0
      const estimatedValue = unit * r.quantity
      totalQuantity += r.quantity
      totalEstimatedValue += estimatedValue
      return {
        date: r.date,
        solarSystemId: r.solar_system_id,
        solarSystemName: nameOf(r.solar_system_id),
        typeId: r.type_id,
        typeName: nameOf(r.type_id),
        quantity: r.quantity,
        estimatedValue
      }
    })

    entries.sort((a, b) => (a.date < b.date ? 1 : -1))
    return { entries, totalQuantity, totalEstimatedValue }
  })
}

// ---- Assets -----------------------------------------------------------------

interface AssetRow {
  item_id: number
  type_id: number
  quantity: number
  location_id: number
  location_flag: string
  location_type: 'station' | 'solar_system' | 'item' | 'other'
  is_singleton: boolean
}

/**
 * Fetch one page of the character assets endpoint via a direct fetch (rather
 * than the shared `esi()` helper) so we can read the `X-Pages` response
 * header for pagination.
 */
async function fetchAssetsPage(
  characterId: number,
  page: number
): Promise<{ rows: AssetRow[]; pages: number }> {
  const token = await getValidAccessToken()
  const res = await fetch(`${ESI_BASE}/characters/${characterId}/assets/?page=${page}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    }
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(
      `ESI ${res.status} /characters/${characterId}/assets/: ${text.slice(0, 200)}`
    ) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  const pages = Number(res.headers.get('X-Pages') ?? '1') || 1
  const rows = (await res.json()) as AssetRow[]
  return { rows, pages }
}

/**
 * Assets can nest arbitrarily (an item inside a container inside a ship inside
 * a station, etc). Walk up the `location_id` chain until we reach a row whose
 * location is not itself another asset — that's the "root" location (a
 * station, structure, or solar system) the item ultimately sits in.
 */
function rootLocation(
  row: AssetRow,
  byItemId: Map<number, AssetRow>
): { id: number; type: AssetRow['location_type'] } {
  let cur = row
  const seen = new Set<number>()
  let hops = 0
  while (cur.location_type === 'item' && byItemId.has(cur.location_id) && !seen.has(cur.item_id) && hops < 50) {
    seen.add(cur.item_id)
    hops++
    cur = byItemId.get(cur.location_id)!
  }
  return { id: cur.location_id, type: cur.location_type }
}

/**
 * Structure ids (Upwell citadels/engineering complexes/etc., and by extension
 * the asset "item" location space) are 64-bit ids well above 100 billion.
 * NPC station ids top out in the low billions and solar system ids are ~8
 * digits, so this threshold cleanly separates "resolve via /universe/names"
 * locations from "resolve via /universe/structures/{id}/" locations.
 */
const STRUCTURE_ID_THRESHOLD = 100_000_000_000

/**
 * Aggregates a (pre-filtered) set of asset rows into `AssetHolding`s, grouping
 * by type and, within a type, by root location. Shared by the gear and
 * materials aggregation passes in `buildInventory` — both hand it a different
 * row subset but the same `roots`/`prices`/`mineralPrices`/`locationName`
 * built once for the whole inventory.
 */
function aggregateHoldings(
  rows: AssetRow[],
  roots: Map<number, { id: number; type: AssetRow['location_type'] }>,
  prices: Map<number, number>,
  mineralPrices: Map<number, number>,
  locationName: (loc: { id: number; type: AssetRow['location_type'] }) => string | undefined
): AssetsData {
  const byType = new Map<number, AssetHolding>()
  for (const row of rows) {
    let holding = byType.get(row.type_id)
    if (!holding) {
      holding = {
        typeId: row.type_id,
        typeName: nameOf(row.type_id),
        quantity: 0,
        value: 0,
        isOre: Boolean(oreComposition(row.type_id)),
        refinedValue: 0,
        locations: []
      }
      byType.set(row.type_id, holding)
    }
    holding.quantity += row.quantity

    const root = roots.get(row.item_id)!
    let loc = holding.locations.find((l) => l.locationId === root.id)
    if (!loc) {
      loc = {
        locationId: root.id,
        locationName: locationName(root),
        quantity: 0
      }
      holding.locations.push(loc)
    }
    loc.quantity += row.quantity
  }

  let totalValue = 0
  const holdings = [...byType.values()].map((holding) => {
    const unitPrice = prices.get(holding.typeId) ?? 0
    holding.value = unitPrice * holding.quantity
    holding.refinedValue = holding.isOre
      ? computeRefinedValue(holding.typeId, holding.quantity, mineralPrices)
      : 0
    totalValue += holding.value
    return holding
  })

  holdings.sort((a, b) => b.value - a.value)

  return { holdings, totalValue, itemTypeCount: holdings.length }
}

/** Classify a fitted/stowed item's slot from its `location_flag`. */
function slotOf(flag: string): ShipSlot {
  if (/^HiSlot/.test(flag)) return 'High'
  if (/^MedSlot/.test(flag)) return 'Mid'
  if (/^LoSlot/.test(flag)) return 'Low'
  if (/^RigSlot/.test(flag)) return 'Rig'
  if (/^SubSystemSlot/.test(flag)) return 'Subsystem'
  if (flag === 'DroneBay') return 'Drones'
  if (flag === 'FighterBay' || /^FighterTube/.test(flag)) return 'Fighters'
  if (flag === 'Cargo') return 'Cargo'
  if (/Hold|Hangar/.test(flag)) return 'Hold'
  return 'Other'
}

export interface InventorySnapshot {
  ships: ShipInfo[]
  gear: AssetHolding[]
  materials: AssetHolding[]
  totalGearValue: number
  totalMaterialValue: number
  totalShipsValue: number
  gearTypeCount: number
  materialTypeCount: number
}

/**
 * Single heavy pass over a character's full asset list, shared by
 * `fetchShips`/`fetchAssets`/`fetchMaterials` (see `getInventory` for the
 * short-TTL cache wrapper around this). Splits assets into:
 *  - ships (hulls, category_id 6) with their fittings/cargo/drones nested
 *    underneath them, including the currently-flown ship (which ESI omits
 *    from `/assets/` entirely — only its fitted/stowed contents show up
 *    there, keyed by the ship's item id as their location).
 *  - gear: everything else not inside a ship and not itself a ship hull.
 *  - materials: the ore/mineral/ice subset of gear (see `isMaterialType`).
 */
async function buildInventory(cid: number): Promise<InventorySnapshot> {
  const first = await fetchAssetsPage(cid, 1)
  let rows = first.rows
  for (let page = 2; page <= first.pages; page++) {
    const next = await fetchAssetsPage(cid, page)
    rows = rows.concat(next.rows)
  }

  const byItemId = new Map<number, AssetRow>()
  for (const row of rows) byItemId.set(row.item_id, row)

  // The active (currently-flown) ship is NOT in the assets list, but its fitted
  // modules and cargo ARE (their location is the ship's item id). Fetch the
  // active ship + current location so we can map those to where the ship is.
  const [activeShip, curLoc, prices] = await Promise.all([
    esi<{ ship_item_id: number; ship_type_id: number; ship_name: string }>(
      `/characters/${cid}/ship/`,
      { auth: true }
    ).catch(() => null),
    esi<{ solar_system_id: number; station_id?: number; structure_id?: number }>(
      `/characters/${cid}/location/`,
      { auth: true }
    ).catch(() => null),
    getMarketPrices()
  ])
  let activeShipRoot: { id: number; type: AssetRow['location_type'] } | null = null
  if (curLoc) {
    const id = curLoc.station_id ?? curLoc.structure_id ?? curLoc.solar_system_id
    const type: AssetRow['location_type'] = curLoc.station_id
      ? 'station'
      : curLoc.structure_id
        ? 'other'
        : 'solar_system'
    activeShipRoot = { id, type }
  }

  // Identify ships: category_id 6 hulls among the (non-stackable) singleton
  // rows, plus the active ship (deduped against a matching row, though in
  // practice the active ship never appears as a row of its own).
  //
  // Only classify singletons that sit LOOSE (in a hangar/hold) — never ones in a
  // fitting slot or cargo. A ship hull always sits in a hangar, while the bulk of
  // singletons are fitted modules; skipping those avoids a large burst of
  // /universe/types + /universe/groups lookups on first load.
  const IN_SHIP_SLOTS = new Set<ShipSlot>([
    'High',
    'Mid',
    'Low',
    'Rig',
    'Subsystem',
    'Drones',
    'Fighters',
    'Cargo'
  ])
  const shipCandidateTypeIds = rows
    .filter((r) => r.is_singleton && !IN_SHIP_SLOTS.has(slotOf(r.location_flag)))
    .map((r) => r.type_id)
  await resolveCategories(shipCandidateTypeIds)
  const shipRows = rows.filter(
    (r) =>
      r.is_singleton &&
      !IN_SHIP_SLOTS.has(slotOf(r.location_flag)) &&
      categoryOf(r.type_id) === SHIP_CATEGORY_ID
  )

  interface ShipEntry {
    itemId: number
    typeId: number
    isActive: boolean
    name?: string
  }
  const shipEntries: ShipEntry[] = shipRows.map((r) => ({
    itemId: r.item_id,
    typeId: r.type_id,
    isActive: false
  }))
  if (activeShip) {
    const existing = shipEntries.find((s) => s.itemId === activeShip.ship_item_id)
    if (existing) {
      existing.isActive = true
      existing.name = activeShip.ship_name
    } else {
      shipEntries.push({
        itemId: activeShip.ship_item_id,
        typeId: activeShip.ship_type_id,
        isActive: true,
        name: activeShip.ship_name
      })
    }
  }
  const shipItemIds = new Set(shipEntries.map((s) => s.itemId))

  // In-ship membership: walk each row's location chain looking for the nearest
  // ancestor (or the row's own direct location) that is a ship item id. This is
  // deliberately a different walk than `rootLocation` below — it stops as soon
  // as it finds a ship, rather than continuing all the way to a station/system,
  // and it also catches the active ship (whose item id is never itself a row in
  // `byItemId`, so the ordinary root walk can't "see" it as a stopping point).
  function findOwningShip(row: AssetRow): number | undefined {
    let curId = row.location_id
    let curType = row.location_type
    const seen = new Set<number>([row.item_id])
    let hops = 0
    while (hops < 50) {
      if (shipItemIds.has(curId)) return curId
      if (curType !== 'item' || seen.has(curId)) return undefined
      seen.add(curId)
      const parent = byItemId.get(curId)
      if (!parent) return undefined
      curId = parent.location_id
      curType = parent.location_type
      hops++
    }
    return undefined
  }
  const rowShip = new Map<number, number>()
  for (const row of rows) {
    const sid = findOwningShip(row)
    if (sid !== undefined) rowShip.set(row.item_id, sid)
  }

  // Root (non-nested) location for every row — a ship's own row resolves to
  // wherever the ship sits (station/structure/system), which doubles as that
  // ship's displayed location. Items fitted to the ACTIVE ship are remapped to
  // the active ship's real (fetched) location, same as before this file grew a
  // Ships view.
  const roots = new Map<number, { id: number; type: AssetRow['location_type'] }>()
  for (const row of rows) {
    let root = rootLocation(row, byItemId)
    if (activeShip && activeShipRoot && root.type === 'item' && root.id === activeShip.ship_item_id) {
      root = activeShipRoot
    }
    roots.set(row.item_id, root)
  }

  // Resolve names by id space / endpoint: type ids (incl. the active ship's
  // hull type, which has no row of its own) via /universe/names, NPC
  // station/system ids via /universe/names, player structures via
  // /universe/structures, and ship/container custom names via the
  // character-assets names endpoint. The active ship's location is included
  // even when nothing is fitted to it (so it still resolves a name).
  const typeIds = [...new Set(rows.map((r) => r.type_id))]
  if (activeShip) typeIds.push(activeShip.ship_type_id)
  const rootVals = [...roots.values()]
  if (activeShipRoot) rootVals.push(activeShipRoot)
  // NPC stations + solar systems have small ids. Player structures (citadels)
  // AND the character's own containers/ships have large ids and can arrive as
  // either an 'item' or 'other' root type — so we can't split them by type.
  // Name the character's own items first (assets/names), then try
  // /universe/structures for any large id that endpoint didn't own.
  const smallIds = rootVals.filter((r) => r.id > 0 && r.id < STRUCTURE_ID_THRESHOLD).map((r) => r.id)
  const bigIds = [...new Set(rootVals.filter((r) => r.id >= STRUCTURE_ID_THRESHOLD).map((r) => r.id))]
  const containerNamed = await resolveAssetNames(cid, [...bigIds, ...shipItemIds])
  await Promise.all([
    resolveNames(typeIds),
    resolveNames(smallIds),
    resolveStructureNames(bigIds)
  ])

  // A container/ship the character owns is shown as "In <name>"; a resolved
  // station/structure plainly; an unresolved large id (a structure we can't
  // access) as a generic label, then the view's "Location <id>".
  function locationName(loc: { id: number; type: AssetRow['location_type'] }): string | undefined {
    const n = nameOf(loc.id)
    if (n) return containerNamed.has(loc.id) ? `In ${n}` : n
    return loc.id >= STRUCTURE_ID_THRESHOLD ? 'Player structure' : undefined
  }

  // Mineral price lookup for refinedValue (only the 9 tabled minerals).
  const mineralPrices = new Map<number, number>()
  for (const mineralTypeId of Object.values(MINERAL_TYPE_IDS)) {
    mineralPrices.set(mineralTypeId, prices.get(mineralTypeId) ?? 0)
  }

  // Gear/materials aggregation excludes ship hulls themselves (they get their
  // own Ships tab) and anything sitting inside any ship (fittings/cargo/drones
  // belong to that ship, not to the flat Assets/Materials lists).
  function isShipOrInShip(row: AssetRow): boolean {
    return shipItemIds.has(row.item_id) || rowShip.has(row.item_id)
  }
  const gearRows = rows.filter((r) => !isShipOrInShip(r) && !isMaterialType(r.type_id))
  const materialRows = rows.filter((r) => !isShipOrInShip(r) && isMaterialType(r.type_id))

  const gearResult = aggregateHoldings(gearRows, roots, prices, mineralPrices, locationName)
  const materialResult = aggregateHoldings(materialRows, roots, prices, mineralPrices, locationName)

  // Ships: nest each ship's fittings/cargo/drones (aggregated by type + slot,
  // since a ship can carry several of the same module across different slots).
  function buildFittedItems(contentRows: AssetRow[]): FittedItem[] {
    const map = new Map<string, FittedItem>()
    for (const r of contentRows) {
      const slot = slotOf(r.location_flag)
      const key = `${r.type_id}:${slot}`
      let f = map.get(key)
      if (!f) {
        f = { typeId: r.type_id, typeName: nameOf(r.type_id), quantity: 0, slot }
        map.set(key, f)
      }
      f.quantity += r.quantity
    }
    return [...map.values()]
  }

  const ships: ShipInfo[] = shipEntries.map((entry) => {
    const contentRows = rows.filter((r) => rowShip.get(r.item_id) === entry.itemId)
    const fittings = buildFittedItems(contentRows)
    const hullValue = prices.get(entry.typeId) ?? 0
    const contentValue = contentRows.reduce((s, r) => s + (prices.get(r.type_id) ?? 0) * r.quantity, 0)

    const loc = entry.isActive
      ? (activeShipRoot ?? { id: 0, type: 'solar_system' as const })
      : (roots.get(entry.itemId) ?? { id: 0, type: 'solar_system' as const })

    return {
      itemId: entry.itemId,
      typeId: entry.typeId,
      typeName: nameOf(entry.typeId),
      name: nameOf(entry.itemId) ?? entry.name,
      isActive: entry.isActive,
      locationId: loc.id,
      locationName: locationName(loc),
      value: hullValue + contentValue,
      fittings
    }
  })
  ships.sort((a, b) => b.value - a.value)
  const totalShipsValue = ships.reduce((s, sh) => s + sh.value, 0)

  return {
    ships,
    gear: gearResult.holdings,
    materials: materialResult.holdings,
    totalGearValue: gearResult.totalValue,
    totalMaterialValue: materialResult.totalValue,
    totalShipsValue,
    gearTypeCount: gearResult.itemTypeCount,
    materialTypeCount: materialResult.itemTypeCount
  }
}

/** Short-TTL cache around `buildInventory` — shared by Ships/Assets/Materials so
 * hitting all three tabs in quick succession doesn't re-fetch and re-classify
 * the whole asset list three times. */
async function getInventory(cid: number): Promise<InventorySnapshot> {
  if (inventoryCache && inventoryCache.cid === cid && Date.now() - inventoryCache.at < INVENTORY_TTL_MS) {
    return inventoryCache.data
  }
  if (inventoryInFlight?.cid === cid) return inventoryInFlight.promise
  const promise = buildInventory(cid).then((data) => {
    inventoryCache = { cid, at: Date.now(), data }
    return data
  })
  inventoryInFlight = { cid, promise }
  try {
    return await promise
  } finally {
    if (inventoryInFlight?.promise === promise) inventoryInFlight = null
  }
}

/** Unified cached inventory for integrations that need gear, materials, and ships together. */
export function fetchInventorySnapshot(characterId?: number): Promise<EsiResult<InventorySnapshot>> {
  return wrap(async () => {
    const cid = characterId ?? getIdentity()?.characterId
    if (!cid) throw new Error('Not logged in.')
    return getInventory(cid)
  })
}

/** Ships owned by the character, with their fittings/cargo/drones nested underneath. */
export function fetchShips(characterId?: number): Promise<EsiResult<ShipsData>> {
  return wrap(async () => {
    const cid = characterId ?? getIdentity()?.characterId
    if (!cid) throw new Error('Not logged in.')
    const inv = await getInventory(cid)
    return { ships: inv.ships, totalValue: inv.totalShipsValue }
  })
}

/** Non-material gear: modules, ammo, and everything else not tabled as ore/mineral/ice — excludes ship hulls (see Ships) and anything fitted/stowed inside a ship. */
export function fetchAssets(characterId?: number): Promise<EsiResult<AssetsData>> {
  return wrap(async () => {
    const cid = characterId ?? getIdentity()?.characterId
    if (!cid) throw new Error('Not logged in.')
    const inv = await getInventory(cid)
    return {
      holdings: inv.gear,
      totalValue: inv.totalGearValue,
      itemTypeCount: inv.gearTypeCount,
      netWorth: {
        gear: inv.totalGearValue,
        materials: inv.totalMaterialValue,
        ships: inv.totalShipsValue,
        total: inv.totalGearValue + inv.totalMaterialValue + inv.totalShipsValue
      }
    }
  })
}

/** Materials on hand: ore, minerals, and ice held across hangars/containers — excludes anything fitted/stowed inside a ship. */
export function fetchMaterials(characterId?: number): Promise<EsiResult<AssetsData>> {
  return wrap(async () => {
    const cid = characterId ?? getIdentity()?.characterId
    if (!cid) throw new Error('Not logged in.')
    const inv = await getInventory(cid)
    return {
      holdings: inv.materials,
      totalValue: inv.totalMaterialValue,
      itemTypeCount: inv.materialTypeCount
    }
  })
}

// ---- Industry jobs -----------------------------------------------------------

interface IndustryJobRow {
  job_id: number
  activity_id: number
  blueprint_type_id: number
  product_type_id?: number
  runs: number
  status: string
  start_date: string
  end_date: string
  station_id: number
  facility_id: number
}

const ACTIVITY_LABELS: Record<number, string> = {
  1: 'Manufacturing',
  3: 'Research Time Efficiency',
  4: 'Research Material Efficiency',
  5: 'Copying',
  8: 'Invention',
  9: 'Reactions'
}

export function fetchIndustryJobs(characterId?: number): Promise<EsiResult<IndustryData>> {
  return wrap(async () => {
    const cid = characterId ?? getIdentity()?.characterId
    if (!cid) throw new Error('Not logged in.')

    // No include_completed: we want CURRENT jobs (in progress or finished but not
    // yet delivered), not a history of everything ever crafted. Defensively drop
    // any terminal states in case the endpoint still returns some.
    const all = await esi<IndustryJobRow[]>(`/characters/${cid}/industry/jobs/`, { auth: true })
    const rows = all.filter((r) => {
      const s = r.status?.toLowerCase()
      return s !== 'delivered' && s !== 'cancelled' && s !== 'reverted'
    })

    await resolveNames([
      ...rows.map((r) => r.blueprint_type_id),
      ...rows.filter((r) => r.product_type_id != null).map((r) => r.product_type_id as number),
      ...rows.map((r) => r.station_id ?? r.facility_id)
    ])

    const jobs: IndustryJob[] = rows.map((r) => ({
      jobId: r.job_id,
      activity: ACTIVITY_LABELS[r.activity_id] ?? `Activity ${r.activity_id}`,
      productName: r.product_type_id != null ? nameOf(r.product_type_id) : undefined,
      blueprintName: nameOf(r.blueprint_type_id),
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      locationName: nameOf(r.station_id ?? r.facility_id),
      locationId: r.station_id ?? r.facility_id ?? 0,
      runs: r.runs
    }))

    // Soonest-to-finish (and already-ready) jobs first.
    jobs.sort((a, b) => (a.endDate < b.endDate ? -1 : 1))
    return { jobs }
  })
}

// ---- Clones & implants -------------------------------------------------------

interface CloneRow {
  home_location?: { location_id: number; location_type: 'station' | 'structure' }
  jump_clones: Array<{
    implants: number[]
    jump_clone_id: number
    location_id: number
    location_type: 'station' | 'structure'
    name?: string
  }>
}

export function fetchClones(characterId?: number): Promise<EsiResult<ClonesData>> {
  return wrap(async () => {
    const cid = characterId ?? getIdentity()?.characterId
    if (!cid) throw new Error('Not logged in.')

    const [clones, implantIds] = await Promise.all([
      esi<CloneRow>(`/characters/${cid}/clones/`, { auth: true }),
      esi<number[]>(`/characters/${cid}/implants/`, { auth: true }).catch(() => [] as number[])
    ])

    const idsToResolve = [
      ...implantIds,
      ...(clones.home_location ? [clones.home_location.location_id] : []),
      ...clones.jump_clones.flatMap((jc) => [jc.location_id, ...jc.implants])
    ]
    await resolveNames(idsToResolve)

    const activeImplants: ImplantInfo[] = implantIds.map((id) => ({
      typeId: id,
      typeName: nameOf(id)
    }))

    const jumpClones: JumpClone[] = clones.jump_clones.map((jc) => ({
      locationId: jc.location_id,
      locationName: nameOf(jc.location_id),
      implants: jc.implants.map((id) => ({ typeId: id, typeName: nameOf(id) }))
    }))

    return {
      activeImplants,
      jumpClones,
      homeLocationName: clones.home_location ? nameOf(clones.home_location.location_id) : undefined
    }
  })
}
