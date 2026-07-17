import type { ExplorationMap, WormholeSignature, WormholeSystem } from './types'
import { normalizeExplorationState } from './exploration'

const SHARE_PREFIX = 'FMAP1G:'
const FORMAT = 'firstmate-map'
const FORMAT_VERSION = 1
const MAX_IMPORT_CHARACTERS = 5_000_000
const MAX_SYSTEMS = 2_000
const MAX_SIGNATURES = 25_000
const SIGNATURE_GROUPS = new Set(['wormhole', 'relic', 'data', 'gas', 'combat', 'unknown'])

interface MapEnvelope {
  format: typeof FORMAT
  version: typeof FORMAT_VERSION
  exportedAt: number
  map: ExplorationMap
}

function envelope(map: ExplorationMap): MapEnvelope {
  return { format: FORMAT, version: FORMAT_VERSION, exportedAt: Date.now(), map }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([Uint8Array.from(bytes).buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateMap(value: unknown): ExplorationMap {
  if (!isRecord(value) || typeof value.name !== 'string' || !Array.isArray(value.systems)) {
    throw new Error('This is not a FirstMate exploration map.')
  }
  if (value.systems.length > MAX_SYSTEMS) throw new Error(`Map exceeds the ${MAX_SYSTEMS.toLocaleString()}-system import limit.`)
  let signatureCount = 0
  for (const system of value.systems) {
    if (!isRecord(system) || typeof system.id !== 'string' || typeof system.name !== 'string' || !Array.isArray(system.signatures)) {
      throw new Error('The map contains an invalid system record.')
    }
    signatureCount += system.signatures.length
    if (signatureCount > MAX_SIGNATURES) throw new Error(`Map exceeds the ${MAX_SIGNATURES.toLocaleString()}-signature import limit.`)
    for (const signature of system.signatures) {
      if (!isRecord(signature) || typeof signature.id !== 'string' || typeof signature.sigId !== 'string' || typeof signature.group !== 'string' || !SIGNATURE_GROUPS.has(signature.group)) {
        throw new Error('The map contains an invalid signature record.')
      }
    }
  }
  const normalized = normalizeExplorationState({ maps: [value] }).maps[0]
  if (!normalized) throw new Error('The map did not contain any importable data.')
  if (normalized.nodePositions) {
    const systemIds = new Set(normalized.systems.map((system) => system.id))
    normalized.nodePositions = Object.fromEntries(Object.entries(normalized.nodePositions).filter(([id, position]) =>
      systemIds.has(id) &&
      isRecord(position) &&
      typeof position.x === 'number' && Number.isFinite(position.x) && Math.abs(position.x) <= 1_000_000 &&
      typeof position.y === 'number' && Number.isFinite(position.y) && Math.abs(position.y) <= 1_000_000
    ).map(([id, position]) => [id, { x: position.x as number, y: position.y as number }]))
  }
  return normalized
}

function parseEnvelope(text: string): ExplorationMap {
  if (text.length > MAX_IMPORT_CHARACTERS) throw new Error('The pasted map is too large to import safely.')
  const parsed: unknown = JSON.parse(text)
  if (isRecord(parsed) && parsed.format === FORMAT) {
    if (parsed.version !== FORMAT_VERSION) throw new Error(`This FirstMate map uses unsupported format version ${String(parsed.version)}.`)
    return validateMap(parsed.map)
  }
  return validateMap(parsed)
}

export async function createMapShareCode(map: ExplorationMap): Promise<string> {
  const compressed = await gzip(JSON.stringify(envelope(map)))
  return `${SHARE_PREFIX}${bytesToBase64Url(compressed)}`
}

export function createMapJson(map: ExplorationMap): string {
  return `${JSON.stringify(envelope(map), null, 2)}\n`
}

export async function decodeSharedMap(input: string): Promise<ExplorationMap> {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Paste a FirstMate share code or map JSON first.')
  try {
    if (trimmed.startsWith(SHARE_PREFIX)) {
      const json = await gunzip(base64UrlToBytes(trimmed.slice(SHARE_PREFIX.length)))
      return parseEnvelope(json)
    }
    return parseEnvelope(trimmed)
  } catch (error) {
    if (error instanceof Error && /FirstMate|map|limit|unsupported|Paste/.test(error.message)) throw error
    throw new Error('FirstMate could not decode that share code or JSON file.')
  }
}

export function prepareImportedMap(map: ExplorationMap, newMapId: string, now = Date.now()): ExplorationMap {
  return {
    ...map,
    id: newMapId,
    name: `${map.name} (imported)`,
    archivedAt: undefined,
    createdAt: now,
    updatedAt: now
  }
}

export type { WormholeSignature, WormholeSystem }
