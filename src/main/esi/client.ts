import {
  AssetHolding,
  AssetsData,
  ClonesData,
  DashboardData,
  EconomyData,
  EsiResult,
  ImplantInfo,
  IndustryData,
  IndustryJob,
  JumpClone,
  MarketOrder,
  MiningData,
  MiningLedgerEntry,
  SkillQueueEntry,
  WalletJournalEntry
} from '@shared/types'
import { MINERAL_TYPE_IDS, oreComposition, refinedValue as computeRefinedValue } from '@shared/data/ore-minerals'
import { getValidAccessToken, getIdentity, setClearAuthCaches } from '../auth/sso'

const ESI_BASE = 'https://esi.evetech.net/latest'
const USER_AGENT = 'FirstMate/0.1 (EVE companion app)'

// ---- Name resolution cache -------------------------------------------------

const nameCache = new Map<number, string>()
/** Ids /universe/names can't resolve (e.g. player structures) — skip on retry. */
const unresolvableIds = new Set<number>()
let marketPrices: Map<number, number> | null = null
let marketPricesAt = 0

setClearAuthCaches(() => {
  nameCache.clear()
  unresolvableIds.clear()
  marketPrices = null
  marketPricesAt = 0
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

export function fetchAssets(characterId?: number): Promise<EsiResult<AssetsData>> {
  return wrap(async () => {
    const cid = characterId ?? getIdentity()?.characterId
    if (!cid) throw new Error('Not logged in.')

    const first = await fetchAssetsPage(cid, 1)
    let rows = first.rows
    for (let page = 2; page <= first.pages; page++) {
      const next = await fetchAssetsPage(cid, page)
      rows = rows.concat(next.rows)
    }

    const byItemId = new Map<number, AssetRow>()
    for (const row of rows) byItemId.set(row.item_id, row)

    // Resolve each row's root (non-nested) location up front.
    const roots = new Map<number, { id: number; type: AssetRow['location_type'] }>()
    for (const row of rows) roots.set(row.item_id, rootLocation(row, byItemId))

    const prices = await getMarketPrices()

    // Type ids and root location ids are resolved as separate /universe/names
    // calls, so an unresolvable structure id can never affect type-name
    // resolution (resolveNames already isolates bad ids within a call, but
    // keeping the batches separate avoids mixing the two id spaces at all).
    const typeIds = [...new Set(rows.map((r) => r.type_id))]
    const locationIds = [...new Set([...roots.values()].map((r) => r.id))]
    await Promise.all([resolveNames(typeIds), resolveNames(locationIds)])

    // Stations and solar systems resolve via /universe/names; player-owned
    // structures generally don't (ESI needs a docking scope for those), so we
    // label them generically. Anything else unresolved falls through to the
    // view's "Location <id>" fallback.
    function locationName(loc: { id: number; type: AssetRow['location_type'] }): string | undefined {
      return nameOf(loc.id) ?? (loc.type === 'other' ? 'Player structure' : undefined)
    }

    // Mineral price lookup for refinedValue (only the 9 tabled minerals).
    const mineralPrices = new Map<number, number>()
    for (const mineralTypeId of Object.values(MINERAL_TYPE_IDS)) {
      mineralPrices.set(mineralTypeId, prices.get(mineralTypeId) ?? 0)
    }

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
