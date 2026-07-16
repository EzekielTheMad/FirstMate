import { describe, expect, it } from 'vitest'
import type { WormholeSignature } from '@shared/types'
import {
  EOL_WINDOW_MS,
  createSystem,
  formatShortDuration,
  getEolWindow,
  updateWormholeStatus
} from './exploration'

function signature(): WormholeSignature {
  return {
    id: 'sig-1',
    sigId: 'ABC-123',
    group: 'wormhole',
    name: '',
    status: 'fresh',
    createdAt: 1,
    updatedAt: 1
  }
}

describe('exploration helpers', () => {
  it('creates a trimmed empty system', () => {
    expect(createSystem('  J123456  ', 'system-1', 42)).toEqual({
      id: 'system-1',
      name: 'J123456',
      signatures: [],
      createdAt: 42,
      updatedAt: 42
    })
  })

  it('records when a signature is first marked EOL and preserves that time', () => {
    const marked = updateWormholeStatus(signature(), 'eol', 1_000)
    expect(marked.eolMarkedAt).toBe(1_000)
    expect(updateWormholeStatus(marked, 'eol', 2_000).eolMarkedAt).toBe(1_000)
    expect(updateWormholeStatus(marked, 'stable', 3_000).eolMarkedAt).toBeUndefined()
  })

  it('reports the conservative four-hour EOL window', () => {
    const marked = updateWormholeStatus(signature(), 'eol', 1_000)
    expect(getEolWindow(marked, 1_000 + 90 * 60_000)).toEqual({
      elapsedMs: 90 * 60_000,
      remainingMs: EOL_WINDOW_MS - 90 * 60_000,
      windowPassed: false
    })
    expect(getEolWindow(marked, 1_000 + EOL_WINDOW_MS + 1)?.windowPassed).toBe(true)
  })

  it('formats short durations for the tracker', () => {
    expect(formatShortDuration(30 * 60_000)).toBe('30m')
    expect(formatShortDuration(2 * 60 * 60_000 + 15 * 60_000)).toBe('2h 15m')
  })
})
