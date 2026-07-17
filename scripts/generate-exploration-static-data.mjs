import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

const sourceDir = resolve(process.argv[2] || '.tmp/sde')
const outputPath = resolve(process.argv[3] || 'src/shared/data/exploration-static.json')

async function readJsonLines(filename, visit) {
  const lines = createInterface({
    input: createReadStream(resolve(sourceDir, filename), { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  for await (const line of lines) {
    if (line.trim()) visit(JSON.parse(line))
  }
}

const CLASS_LABELS = {
  1: 'C1', 2: 'C2', 3: 'C3', 4: 'C4', 5: 'C5', 6: 'C6',
  7: 'HS', 8: 'LS', 9: 'NS', 12: 'Thera', 13: 'Shattered',
  14: 'Sentinel', 15: 'Barbican', 16: 'Vidette', 17: 'Conflux',
  18: 'Redoubt', 25: 'Pochven'
}

const EFFECT_LABELS = {
  30574: 'Magnetar',
  30575: 'Black Hole',
  30576: 'Red Giant',
  30577: 'Pulsar',
  30669: 'Wolf-Rayet',
  30670: 'Cataclysmic Variable'
}

const regions = new Map()
const constellations = new Map()
const effects = new Map()
await readJsonLines('mapRegions.jsonl', (row) => regions.set(row._key, row))
await readJsonLines('mapConstellations.jsonl', (row) => constellations.set(row._key, row))
await readJsonLines('mapSecondarySuns.jsonl', (row) => effects.set(row.solarSystemID, EFFECT_LABELS[row.typeID]))

const systems = []
await readJsonLines('mapSolarSystems.jsonl', (row) => {
  const constellation = constellations.get(row.constellationID)
  const region = regions.get(row.regionID)
  const classId = row.wormholeClassID ?? constellation?.wormholeClassID ?? region?.wormholeClassID
  systems.push({
    id: row._key,
    name: row.name?.en,
    class: CLASS_LABELS[classId] ?? undefined,
    security: typeof row.securityStatus === 'number' ? row.securityStatus : undefined,
    effect: effects.get(row._key),
    region: region?.name?.en
  })
})
systems.sort((a, b) => a.name.localeCompare(b.name))

const wormholeTypes = new Map()
await readJsonLines('types.jsonl', (row) => {
  if (row.groupID !== 988) return
  const match = row.name?.en?.match(/^Wormhole\s+([A-Z0-9-]+)$/i)
  if (match) wormholeTypes.set(row._key, { code: match[1].toUpperCase() })
})

await readJsonLines('typeDogma.jsonl', (row) => {
  const item = wormholeTypes.get(row._key)
  if (!item) return
  const attributes = new Map((row.dogmaAttributes ?? []).map((entry) => [entry.attributeID, entry.value]))
  const targetClassId = attributes.get(1381)
  item.destinationClass = CLASS_LABELS[targetClassId] ?? (targetClassId ? `Class ${targetClassId}` : undefined)
  item.lifetimeHours = attributes.has(1382) ? attributes.get(1382) / 60 : undefined
  item.totalMassKg = attributes.get(1383) || undefined
  item.regenerationKg = attributes.get(1384) || undefined
  item.maxJumpMassKg = attributes.get(1385) || undefined
})

const sde = JSON.parse(readFileSync(resolve(sourceDir, '_sde.jsonl'), 'utf8').trim())
const output = {
  source: {
    publisher: 'CCP Games',
    buildNumber: sde.buildNumber,
    releaseDate: sde.releaseDate
  },
  systems,
  wormholeTypes: [...wormholeTypes.values()].sort((a, b) => a.code.localeCompare(b.code))
}

writeFileSync(outputPath, `${JSON.stringify(output)}\n`)
console.log(`Wrote ${systems.length} systems and ${output.wormholeTypes.length} wormhole types to ${outputPath}`)
