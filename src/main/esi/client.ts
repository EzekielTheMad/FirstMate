import {
  DashboardData,
  EconomyData,
  EsiResult,
  MarketOrder,
  MiningData,
  MiningLedgerEntry,
  WalletJournalEntry
} from '@shared/types'
import { getValidAccessToken, getIdentity, setClearAuthCaches } from '../auth/sso'

const ESI_BASE = 'https://esi.evetech.net/latest'
const USER_AGENT = 'FirstMate/0.1 (EVE companion app)'

// ---- Name resolution cache -------------------------------------------------

const nameCache = new Map<number, string>()
let marketPrices: Map<number, number> | null = null
let marketPricesAt = 0

setClearAuthCaches(() => {
  nameCache.clear()
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

/** Resolve a batch of ids to names using the universe/names endpoint. */
async function resolveNames(ids: number[]): Promise<void> {
  const unique = [...new Set(ids)].filter((id) => id > 0 && !nameCache.has(id))
  if (unique.length === 0) return
  // /universe/names accepts up to 1000 ids per call.
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000)
    try {
      const results = await esi<Array<{ id: number; name: string }>>('/universe/names/', {
        body: chunk
      })
      for (const r of results) nameCache.set(r.id, r.name)
    } catch {
      /* leave unresolved ids blank */
    }
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
        : undefined
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
