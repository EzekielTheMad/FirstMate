import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { AppSettings, McpServerStatus } from '@shared/types'
import { registerFirstMateTools } from './tools'

interface Session {
  server: McpServer
  transport: StreamableHTTPServerTransport
}

let httpServer: Server | null = null
let sessions = new Map<string, Session>()
let fingerprint = ''
let status: McpServerStatus = {
  enabled: false,
  running: false,
  host: '127.0.0.1',
  port: 8643,
  endpoint: 'http://127.0.0.1:8643/mcp'
}

function jsonError(res: ServerResponse, statusCode: number, message: string): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }))
}

function authorized(header: string | undefined, expected: string): boolean {
  const provided = header?.match(/^Bearer\s+(.+)$/i)?.[1] ?? ''
  const left = createHash('sha256').update(provided).digest()
  const right = createHash('sha256').update(expected).digest()
  return Boolean(provided && expected) && timingSafeEqual(left, right)
}

async function readBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new Error('REQUEST_TOO_LARGE')
    chunks.push(buffer)
  }
  if (!chunks.length) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function validLoopbackHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false
  const value = hostHeader.toLowerCase()
  return value === `127.0.0.1:${port}` || value === `localhost:${port}` || value === `[::1]:${port}`
}

function createToolServer(): McpServer {
  const server = new McpServer(
    { name: 'firstmate', version: '0.1.16' },
    {
      instructions:
        'Read-only access to the current FirstMate character and locally tracked EVE data. ' +
        'Use these tools before answering questions about assets, skills, wallet, ships, industry, or wormhole chains. ' +
        'Treat prices and reprocessing outputs as estimates and repeat important warnings.'
    }
  )
  registerFirstMateTools(server)
  return server
}

export function getMcpServerStatus(): McpServerStatus {
  return { ...status }
}

export async function stopMcpServer(): Promise<void> {
  const active = httpServer
  httpServer = null
  fingerprint = ''
  for (const session of sessions.values()) {
    await session.transport.close().catch(() => undefined)
    await session.server.close().catch(() => undefined)
  }
  sessions.clear()
  if (active) await new Promise<void>((resolve) => active.close(() => resolve()))
  status = { ...status, running: false }
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  settings: AppSettings
): Promise<void> {
  if (req.url !== '/mcp') return jsonError(res, 404, 'Not found')
  if (req.headers.origin) return jsonError(res, 403, 'Browser-origin requests are not allowed')
  if (!settings.mcpAllowLan && !validLoopbackHost(req.headers.host, settings.mcpPort)) {
    return jsonError(res, 403, 'Invalid Host header')
  }
  if (!authorized(req.headers.authorization, settings.mcpApiKey)) {
    res.setHeader('WWW-Authenticate', 'Bearer')
    return jsonError(res, 401, 'Unauthorized')
  }

  if (req.method === 'DELETE') {
    const sessionId = req.headers['mcp-session-id']
    const session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined
    if (!session) return jsonError(res, 404, 'Unknown MCP session')
    await session.transport.handleRequest(req, res)
    sessions.delete(sessionId as string)
    await session.server.close().catch(() => undefined)
    return
  }
  if (req.method === 'GET') {
    const sessionId = req.headers['mcp-session-id']
    const session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined
    if (!session) return jsonError(res, 404, 'Unknown MCP session')
    await session.transport.handleRequest(req, res)
    return
  }
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed')

  let body: unknown
  try {
    body = await readBody(req)
  } catch (error) {
    return jsonError(res, error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, 'Invalid request body')
  }

  const sessionId = req.headers['mcp-session-id']
  let session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined
  if (!session && isInitializeRequest(body)) {
    const toolServer = createToolServer()
    let transport!: StreamableHTTPServerTransport
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        sessions.set(id, { server: toolServer, transport })
      }
    })
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId)
    }
    await toolServer.connect(transport)
    await transport.handleRequest(req, res, body)
    return
  }
  if (!session) return jsonError(res, 400, 'No valid MCP session')
  await session.transport.handleRequest(req, res, body)
}

export async function configureMcpServer(settings: AppSettings): Promise<McpServerStatus> {
  const host = settings.mcpAllowLan ? '0.0.0.0' : '127.0.0.1'
  const nextFingerprint = JSON.stringify({
    enabled: settings.mcpEnabled,
    host,
    port: settings.mcpPort,
    key: createHash('sha256').update(settings.mcpApiKey).digest('hex')
  })
  status = {
    enabled: settings.mcpEnabled,
    running: Boolean(httpServer),
    host,
    port: settings.mcpPort,
    endpoint: `http://${settings.mcpAllowLan ? 'HOST_OR_IP' : '127.0.0.1'}:${settings.mcpPort}/mcp`
  }
  if (fingerprint === nextFingerprint && httpServer) return getMcpServerStatus()
  await stopMcpServer()
  fingerprint = nextFingerprint
  status = { ...status, enabled: settings.mcpEnabled, host, port: settings.mcpPort }
  if (!settings.mcpEnabled) return getMcpServerStatus()
  if (!settings.mcpApiKey) {
    status.error = 'Generate and save a FirstMate MCP access key.'
    return getMcpServerStatus()
  }
  if (!Number.isInteger(settings.mcpPort) || settings.mcpPort < 1024 || settings.mcpPort > 65535) {
    status.error = 'Choose a port between 1024 and 65535.'
    return getMcpServerStatus()
  }

  const server = createServer((req, res) => {
    void handleMcpRequest(req, res, settings).catch(() => {
      if (!res.headersSent) jsonError(res, 500, 'Internal MCP server error')
      else if (!res.writableEnded) res.end()
    })
  })
  server.requestTimeout = 125_000
  server.headersTimeout = 10_000
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(settings.mcpPort, host, () => {
        server.off('error', reject)
        resolve()
      })
    })
    httpServer = server
    status = { ...status, running: true, error: undefined }
  } catch (error) {
    server.close()
    status = {
      ...status,
      running: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
  return getMcpServerStatus()
}
