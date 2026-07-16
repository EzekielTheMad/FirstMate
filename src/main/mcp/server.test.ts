import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { DEFAULT_SETTINGS } from '@shared/types'
import { configureMcpServer, getMcpServerStatus, stopMcpServer } from './server'

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

async function start(key = 'test-firstmate-secret'): Promise<{ port: number; url: string; key: string }> {
  const port = await freePort()
  await configureMcpServer({
    ...DEFAULT_SETTINGS,
    mcpEnabled: true,
    mcpPort: port,
    mcpApiKey: key
  })
  return { port, url: `http://127.0.0.1:${port}/mcp`, key }
}

afterEach(async () => {
  await stopMcpServer()
})

describe('FirstMate MCP server', () => {
  it('stays stopped when disabled', async () => {
    await configureMcpServer({ ...DEFAULT_SETTINGS, mcpEnabled: false })
    expect(getMcpServerStatus()).toMatchObject({ enabled: false, running: false })
  })

  it('rejects missing/wrong bearer authentication and browser origins', async () => {
    const { url, key } = await start()
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' }
      }
    }
    const missing = await fetch(url, { method: 'POST', body: JSON.stringify(initialize) })
    expect(missing.status).toBe(401)
    expect(missing.headers.get('www-authenticate')).toBe('Bearer')

    const wrong = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' },
      body: JSON.stringify(initialize)
    })
    expect(wrong.status).toBe(401)

    const browser = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, Origin: 'https://malicious.example', 'Content-Type': 'application/json' },
      body: JSON.stringify(initialize)
    })
    expect(browser.status).toBe(403)
  })

  it('completes the official MCP handshake and exposes the comprehensive read-only tools', async () => {
    const { url, key } = await start()
    const client = new Client({ name: 'firstmate-test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } }
    })
    await client.connect(transport)
    const tools = await client.listTools()
    const names = tools.tools.map((tool) => tool.name)
    expect(names).toContain('get_asset_cleanup_context')
    expect(names).toContain('list_asset_locations')
    expect(names).toContain('get_exploration_chain')
    expect(names).toContain('get_combat_library')
    expect(names).toContain('get_wallet_activity')
    expect(names.length).toBeGreaterThanOrEqual(20)
    await client.close()
  })
})

