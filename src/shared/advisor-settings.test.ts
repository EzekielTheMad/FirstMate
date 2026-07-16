import { describe, expect, it } from 'vitest'
import { resolveAdvisorProvider } from './advisor-settings'

describe('resolveAdvisorProvider', () => {
  it('keeps existing Anthropic users enabled during migration', () => {
    expect(resolveAdvisorProvider(undefined, true)).toBe('anthropic')
  })

  it('leaves new installations disabled', () => {
    expect(resolveAdvisorProvider(undefined, false)).toBe('disabled')
  })

  it('respects an explicit disabled selection even when a key remains stored', () => {
    expect(resolveAdvisorProvider('disabled', true)).toBe('disabled')
  })
})
