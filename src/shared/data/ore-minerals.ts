/**
 * Ore -> mineral reprocessing reference data (bundled static data).
 *
 * Coverage is CURATED AND PARTIAL, not exhaustive. Every entry below was
 * cross-checked against the EVE Online static data export (via
 * fuzzwork.co.uk's SDE CSV dump and everef.net type pages) before being
 * included; anything we could not verify with confidence was deliberately
 * left out rather than guessed. The Materials view degrades gracefully for
 * asset types that aren't tabled here (they're simply not treated as
 * reprocessable "materials").
 *
 * Yields are the SDE's base `invTypeMaterials` figures — i.e. reprocessing
 * `portionSize` units of the ore at 100% base efficiency, BEFORE any
 * character skills, station/structure bonuses, or tax. This intentionally
 * mirrors how `fetchMining`/`getMarketPrices` already treat prices: a
 * best-effort estimate, not an exact wallet-accurate number.
 *
 * To extend: add another `[typeId]: { name, portionSize, minerals }` entry
 * to ORE_MINERALS once you have verified the typeId and yields against the
 * SDE (fuzzwork.co.uk/dump/latest/csv/invTypeMaterials.csv or
 * everef.net/type/<id>). Only the 8 minerals + Morphite are priced by
 * `refinedValue` (via MINERAL_TYPE_IDS) — ice reprocessing products (Heavy
 * Water, isotopes, Strontium Clathrates, ...) are out of scope for that
 * helper since they aren't minerals.
 */

/** The 8 base minerals + Morphite, keyed by name -> type id. */
export const MINERAL_TYPE_IDS: Record<string, number> = {
  Tritanium: 34,
  Pyerite: 35,
  Mexallon: 36,
  Isogen: 37,
  Nocxium: 38,
  Zydrine: 39,
  Megacyte: 40,
  Morphite: 11399
}

interface OreEntry {
  name: string
  /** Units of ore reprocessed to yield the listed minerals. */
  portionSize: number
  /** Mineral name -> quantity yielded per `portionSize` units, at 100% base efficiency. */
  minerals: Record<string, number>
}

/**
 * Standard asteroid ores + their common "II/III/IV-Grade" (+5%/+10%/+15%)
 * variants, keyed by type id. Partial coverage by design — see file header.
 */
export const ORE_MINERALS: Record<number, OreEntry> = {
  // Veldspar
  1230: { name: 'Veldspar', portionSize: 100, minerals: { Tritanium: 400 } },
  17470: { name: 'Veldspar II-Grade', portionSize: 100, minerals: { Tritanium: 420 } },
  17471: { name: 'Veldspar III-Grade', portionSize: 100, minerals: { Tritanium: 440 } },
  46689: { name: 'Veldspar IV-Grade', portionSize: 100, minerals: { Tritanium: 460 } },

  // Scordite
  1228: { name: 'Scordite', portionSize: 100, minerals: { Tritanium: 150, Pyerite: 110 } },
  17463: {
    name: 'Scordite II-Grade',
    portionSize: 100,
    minerals: { Tritanium: 158, Pyerite: 114 }
  },
  17464: {
    name: 'Scordite III-Grade',
    portionSize: 100,
    minerals: { Tritanium: 165, Pyerite: 119 }
  },
  46687: {
    name: 'Scordite IV-Grade',
    portionSize: 100,
    minerals: { Tritanium: 173, Pyerite: 125 }
  },

  // Pyroxeres
  1224: { name: 'Pyroxeres', portionSize: 100, minerals: { Pyerite: 90, Mexallon: 30 } },
  17459: {
    name: 'Pyroxeres II-Grade',
    portionSize: 100,
    minerals: { Pyerite: 95, Mexallon: 32 }
  },
  17460: {
    name: 'Pyroxeres III-Grade',
    portionSize: 100,
    minerals: { Pyerite: 99, Mexallon: 33 }
  },
  46686: {
    name: 'Pyroxeres IV-Grade',
    portionSize: 100,
    minerals: { Pyerite: 104, Mexallon: 35 }
  },

  // Plagioclase
  18: { name: 'Plagioclase', portionSize: 100, minerals: { Tritanium: 175, Mexallon: 70 } },
  17455: {
    name: 'Plagioclase II-Grade',
    portionSize: 100,
    minerals: { Tritanium: 184, Mexallon: 74 }
  },
  17456: {
    name: 'Plagioclase III-Grade',
    portionSize: 100,
    minerals: { Tritanium: 193, Mexallon: 77 }
  },
  46685: {
    name: 'Plagioclase IV-Grade',
    portionSize: 100,
    minerals: { Tritanium: 201, Mexallon: 81 }
  },

  // Omber
  1227: { name: 'Omber', portionSize: 100, minerals: { Pyerite: 90, Isogen: 75 } },
  17867: { name: 'Omber II-Grade', portionSize: 100, minerals: { Pyerite: 95, Isogen: 79 } },
  17868: { name: 'Omber III-Grade', portionSize: 100, minerals: { Pyerite: 99, Isogen: 83 } },
  46684: { name: 'Omber IV-Grade', portionSize: 100, minerals: { Pyerite: 104, Isogen: 86 } },

  // Kernite
  20: { name: 'Kernite', portionSize: 100, minerals: { Mexallon: 60, Isogen: 120 } },
  17452: {
    name: 'Kernite II-Grade',
    portionSize: 100,
    minerals: { Mexallon: 63, Isogen: 126 }
  },
  17453: {
    name: 'Kernite III-Grade',
    portionSize: 100,
    minerals: { Mexallon: 66, Isogen: 132 }
  },
  46683: {
    name: 'Kernite IV-Grade',
    portionSize: 100,
    minerals: { Mexallon: 69, Isogen: 138 }
  },

  // Jaspet
  1226: { name: 'Jaspet', portionSize: 100, minerals: { Mexallon: 150, Nocxium: 50 } },
  17448: {
    name: 'Jaspet II-Grade',
    portionSize: 100,
    minerals: { Mexallon: 158, Nocxium: 53 }
  },
  17449: {
    name: 'Jaspet III-Grade',
    portionSize: 100,
    minerals: { Mexallon: 165, Nocxium: 55 }
  },
  46682: {
    name: 'Jaspet IV-Grade',
    portionSize: 100,
    minerals: { Mexallon: 173, Nocxium: 58 }
  },

  // Hemorphite
  1231: { name: 'Hemorphite', portionSize: 100, minerals: { Isogen: 240, Nocxium: 90 } },
  17444: {
    name: 'Hemorphite II-Grade',
    portionSize: 100,
    minerals: { Isogen: 252, Nocxium: 95 }
  },
  17445: {
    name: 'Hemorphite III-Grade',
    portionSize: 100,
    minerals: { Isogen: 264, Nocxium: 99 }
  },
  46681: {
    name: 'Hemorphite IV-Grade',
    portionSize: 100,
    minerals: { Isogen: 276, Nocxium: 104 }
  },

  // Hedbergite
  21: { name: 'Hedbergite', portionSize: 100, minerals: { Pyerite: 450, Nocxium: 120 } },
  17440: {
    name: 'Hedbergite II-Grade',
    portionSize: 100,
    minerals: { Pyerite: 473, Nocxium: 126 }
  },
  17441: {
    name: 'Hedbergite III-Grade',
    portionSize: 100,
    minerals: { Pyerite: 495, Nocxium: 132 }
  },
  46680: {
    name: 'Hedbergite IV-Grade',
    portionSize: 100,
    minerals: { Pyerite: 518, Nocxium: 138 }
  },

  // Gneiss
  1229: {
    name: 'Gneiss',
    portionSize: 100,
    minerals: { Pyerite: 2000, Mexallon: 1500, Isogen: 800 }
  },
  17865: {
    name: 'Gneiss II-Grade',
    portionSize: 100,
    minerals: { Pyerite: 2100, Mexallon: 1575, Isogen: 840 }
  },
  17866: {
    name: 'Gneiss III-Grade',
    portionSize: 100,
    minerals: { Pyerite: 2200, Mexallon: 1650, Isogen: 880 }
  },
  46679: {
    name: 'Gneiss IV-Grade',
    portionSize: 100,
    minerals: { Pyerite: 2300, Mexallon: 1725, Isogen: 920 }
  },

  // Dark Ochre
  1232: {
    name: 'Dark Ochre',
    portionSize: 100,
    minerals: { Mexallon: 1360, Isogen: 1200, Nocxium: 320 }
  },
  17436: {
    name: 'Dark Ochre II-Grade',
    portionSize: 100,
    minerals: { Mexallon: 1428, Isogen: 1260, Nocxium: 336 }
  },
  17437: {
    name: 'Dark Ochre III-Grade',
    portionSize: 100,
    minerals: { Mexallon: 1496, Isogen: 1320, Nocxium: 352 }
  },
  46675: {
    name: 'Dark Ochre IV-Grade',
    portionSize: 100,
    minerals: { Mexallon: 1564, Isogen: 1380, Nocxium: 368 }
  },

  // Spodumain
  19: {
    name: 'Spodumain',
    portionSize: 100,
    minerals: { Tritanium: 48000, Isogen: 1000, Nocxium: 160, Zydrine: 80, Megacyte: 40 }
  },
  17466: {
    name: 'Spodumain II-Grade',
    portionSize: 100,
    minerals: { Tritanium: 50400, Isogen: 1050, Nocxium: 168, Zydrine: 84, Megacyte: 42 }
  },
  17467: {
    name: 'Spodumain III-Grade',
    portionSize: 100,
    minerals: { Tritanium: 52800, Isogen: 1100, Nocxium: 176, Zydrine: 88, Megacyte: 44 }
  },
  46688: {
    name: 'Spodumain IV-Grade',
    portionSize: 100,
    minerals: { Tritanium: 55200, Isogen: 1150, Nocxium: 184, Zydrine: 92, Megacyte: 46 }
  },

  // Crokite
  1225: {
    name: 'Crokite',
    portionSize: 100,
    minerals: { Pyerite: 800, Mexallon: 2000, Nocxium: 800 }
  },
  17432: {
    name: 'Crokite II-Grade',
    portionSize: 100,
    minerals: { Pyerite: 840, Mexallon: 2100, Nocxium: 840 }
  },
  17433: {
    name: 'Crokite III-Grade',
    portionSize: 100,
    minerals: { Pyerite: 880, Mexallon: 2200, Nocxium: 880 }
  },
  46677: {
    name: 'Crokite IV-Grade',
    portionSize: 100,
    minerals: { Pyerite: 920, Mexallon: 2300, Nocxium: 920 }
  },

  // Bistot
  1223: {
    name: 'Bistot',
    portionSize: 100,
    minerals: { Pyerite: 3200, Mexallon: 1200, Zydrine: 160 }
  },
  17428: {
    name: 'Bistot II-Grade',
    portionSize: 100,
    minerals: { Pyerite: 3360, Mexallon: 1260, Zydrine: 168 }
  },
  17429: {
    name: 'Bistot III-Grade',
    portionSize: 100,
    minerals: { Pyerite: 3520, Mexallon: 1320, Zydrine: 176 }
  },
  46676: {
    name: 'Bistot IV-Grade',
    portionSize: 100,
    minerals: { Pyerite: 3680, Mexallon: 1380, Zydrine: 184 }
  },

  // Arkonor
  22: {
    name: 'Arkonor',
    portionSize: 100,
    minerals: { Pyerite: 3200, Mexallon: 1200, Megacyte: 120 }
  },
  17425: {
    name: 'Arkonor II-Grade',
    portionSize: 100,
    minerals: { Pyerite: 3360, Mexallon: 1260, Megacyte: 126 }
  },
  17426: {
    name: 'Arkonor III-Grade',
    portionSize: 100,
    minerals: { Pyerite: 3520, Mexallon: 1320, Megacyte: 132 }
  },
  46678: {
    name: 'Arkonor IV-Grade',
    portionSize: 100,
    minerals: { Pyerite: 3680, Mexallon: 1380, Megacyte: 138 }
  },

  // Mercoxit (no published IV-Grade variant)
  11396: { name: 'Mercoxit', portionSize: 100, minerals: { Morphite: 140 } },
  17869: { name: 'Mercoxit II-Grade', portionSize: 100, minerals: { Morphite: 147 } },
  17870: { name: 'Mercoxit III-Grade', portionSize: 100, minerals: { Morphite: 154 } }
}

/**
 * Ice ore type ids we're confident about. These reprocess into fuel
 * materials (Heavy Water, isotopes, Strontium Clathrates) rather than the 8
 * minerals, so they're intentionally NOT in ORE_MINERALS (refinedValue only
 * prices minerals) — they're still classified as "materials" via
 * isMaterialType so the Materials view surfaces held ice.
 */
export const ICE_PRODUCT_TYPE_IDS: number[] = [
  16262, // Clear Icicle
  16263, // Glacial Mass
  16264, // Blue Ice
  16265, // White Glaze
  16266, // Glare Crust
  16267, // Dark Glitter
  16268, // Gelidus
  16269, // Krystallos
  17975, // Blue Ice IV-Grade
  17976, // White Glaze IV-Grade
  17977, // Glacial Mass IV-Grade
  17978 // Clear Icicle IV-Grade
]

const MINERAL_TYPE_ID_SET = new Set(Object.values(MINERAL_TYPE_IDS))

/** True if `typeId` is a mineral, a tabled ore, or a known ice ore. */
export function isMaterialType(typeId: number): boolean {
  return (
    MINERAL_TYPE_ID_SET.has(typeId) ||
    Object.prototype.hasOwnProperty.call(ORE_MINERALS, typeId) ||
    ICE_PRODUCT_TYPE_IDS.includes(typeId)
  )
}

/** Per-portion mineral breakdown for a tabled ore, or null if not tabled. */
export function oreComposition(typeId: number): { name: string; qty: number }[] | null {
  const ore = ORE_MINERALS[typeId]
  if (!ore) return null
  return Object.entries(ore.minerals).map(([name, qty]) => ({ name, qty }))
}

/**
 * ISK value of the minerals produced by reprocessing `quantity` units of
 * `oreTypeId`, using `mineralPrices` (typeId -> unit price, e.g. from
 * getMarketPrices()). Returns 0 if the ore isn't tabled.
 */
export function refinedValue(
  oreTypeId: number,
  quantity: number,
  mineralPrices: Map<number, number>
): number {
  const ore = ORE_MINERALS[oreTypeId]
  if (!ore) return 0
  const portions = quantity / ore.portionSize
  let total = 0
  for (const [mineralName, qtyPerPortion] of Object.entries(ore.minerals)) {
    const mineralTypeId = MINERAL_TYPE_IDS[mineralName]
    if (mineralTypeId == null) continue
    const price = mineralPrices.get(mineralTypeId) ?? 0
    total += price * qtyPerPortion * portions
  }
  return total
}
