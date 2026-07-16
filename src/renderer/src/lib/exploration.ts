import type { WormholeSignature, WormholeSystem } from '@shared/types'

export const EOL_WINDOW_MS = 4 * 60 * 60 * 1000

export function createSystem(name: string, id: string, now = Date.now()): WormholeSystem {
  return {
    id,
    name: name.trim(),
    signatures: [],
    createdAt: now,
    updatedAt: now
  }
}

export function updateWormholeStatus(
  signature: WormholeSignature,
  status: NonNullable<WormholeSignature['status']>,
  now = Date.now()
): WormholeSignature {
  return {
    ...signature,
    status,
    eolMarkedAt:
      status === 'eol'
        ? signature.status === 'eol'
          ? (signature.eolMarkedAt ?? now)
          : now
        : undefined,
    updatedAt: now
  }
}

export interface EolWindow {
  elapsedMs: number
  remainingMs: number
  windowPassed: boolean
}

export function getEolWindow(
  signature: WormholeSignature,
  now = Date.now()
): EolWindow | undefined {
  if (signature.status !== 'eol' || !signature.eolMarkedAt) return undefined
  const elapsedMs = Math.max(0, now - signature.eolMarkedAt)
  const remainingMs = Math.max(0, EOL_WINDOW_MS - elapsedMs)
  return { elapsedMs, remainingMs, windowPassed: elapsedMs >= EOL_WINDOW_MS }
}

export function formatShortDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}
