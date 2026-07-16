import { describe, expect, it } from 'vitest'
import { extractChatText, normalizeBaseUrl } from './providers'

describe('normalizeBaseUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  http://127.0.0.1:8642/v1/// ')).toBe(
      'http://127.0.0.1:8642/v1'
    )
  })

  it('rejects non-http transports', () => {
    expect(() => normalizeBaseUrl('file:///tmp/hermes')).toThrow(/http:\/\//)
  })
})

describe('extractChatText', () => {
  it('reads standard OpenAI-compatible text', () => {
    expect(
      extractChatText({ choices: [{ message: { content: '  Fly dangerous.  ' } }] })
    ).toBe('Fly dangerous.')
  })

  it('joins text content parts and ignores non-text parts', () => {
    expect(
      extractChatText({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: 'First' },
                { type: 'tool_call' },
                { type: 'text', text: 'Second' }
              ]
            }
          }
        ]
      })
    ).toBe('First\nSecond')
  })
})
