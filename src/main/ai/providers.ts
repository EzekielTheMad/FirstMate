import Anthropic from '@anthropic-ai/sdk'
import type { AdvisorConnectionResult, AppSettings } from '@shared/types'

export const OPENAI_BASE_URL = 'https://api.openai.com/v1'
export const HERMES_BASE_URL = 'http://127.0.0.1:8642/v1'

interface GenerateRequest {
  system: string
  userMessage: string
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
  error?: { message?: string }
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('Enter a server URL in Settings.')
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The server URL must start with http:// or https://.')
  }
  return trimmed
}

export function extractChatText(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim()
  }
  return ''
}

function providerKey(settings: AppSettings): string {
  switch (settings.advisorProvider) {
    case 'anthropic':
      return settings.anthropicApiKey
    case 'openai':
      return settings.openaiApiKey
    case 'hermes':
      return settings.hermesApiKey
    case 'compatible':
      return settings.compatibleApiKey
    default:
      return ''
  }
}

function providerBaseUrl(settings: AppSettings): string {
  if (settings.advisorProvider === 'openai') return OPENAI_BASE_URL
  return normalizeBaseUrl(settings.advisorBaseUrl)
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ChatCompletionResponse
    return body.error?.message || `${response.status} ${response.statusText}`
  } catch {
    return `${response.status} ${response.statusText}`
  }
}

async function generateOpenAICompatible(
  settings: AppSettings,
  request: GenerateRequest
): Promise<string> {
  const baseUrl = providerBaseUrl(settings)
  const apiKey = providerKey(settings)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(apiKey)
  }
  if (settings.advisorProvider === 'hermes' && settings.advisorSessionKey.trim()) {
    headers['X-Hermes-Session-Key'] = settings.advisorSessionKey.trim()
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.advisorModel,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.userMessage }
      ],
      stream: false
    }),
    signal: AbortSignal.timeout(120_000)
  })

  if (!response.ok) throw new Error(await responseError(response))
  const body = (await response.json()) as ChatCompletionResponse
  const text = extractChatText(body)
  if (!text) throw new Error('The advisor returned no text. Try rephrasing the goal.')
  return text
}

export async function generateAdvisorText(
  settings: AppSettings,
  request: GenerateRequest
): Promise<string> {
  if (settings.advisorProvider === 'disabled') {
    throw new Error('The AI Advisor is disabled. Choose a provider in Settings to enable it.')
  }
  if (!settings.advisorModel.trim()) throw new Error('Enter an Advisor model in Settings.')

  if (settings.advisorProvider === 'anthropic') {
    if (!settings.anthropicApiKey) throw new Error('Add an Anthropic API key in Settings.')
    const client = new Anthropic({ apiKey: settings.anthropicApiKey })
    const stream = client.messages.stream({
      model: settings.advisorModel,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: request.system,
      messages: [{ role: 'user', content: request.userMessage }]
    })
    const message = await stream.finalMessage()
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    if (!text) throw new Error('The advisor returned no text. Try rephrasing the goal.')
    return text
  }

  if (settings.advisorProvider === 'openai' && !settings.openaiApiKey) {
    throw new Error('Add an OpenAI API key in Settings.')
  }
  return generateOpenAICompatible(settings, request)
}

async function testModelsEndpoint(settings: AppSettings): Promise<AdvisorConnectionResult> {
  const baseUrl = providerBaseUrl(settings)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...authHeaders(providerKey(settings))
  }
  if (settings.advisorProvider === 'hermes' && settings.advisorSessionKey.trim()) {
    headers['X-Hermes-Session-Key'] = settings.advisorSessionKey.trim()
  }
  const response = await fetch(`${baseUrl}/models`, {
    headers,
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) return { ok: false, message: await responseError(response) }
  return {
    ok: true,
    message:
      settings.advisorProvider === 'hermes'
        ? 'Connected to Hermes successfully.'
        : 'Connected to the model provider successfully.'
  }
}

export async function testAdvisorConnection(
  settings: AppSettings
): Promise<AdvisorConnectionResult> {
  try {
    if (settings.advisorProvider === 'disabled') {
      return { ok: false, message: 'Choose an AI Advisor provider first.' }
    }
    if (settings.advisorProvider === 'anthropic') {
      if (!settings.anthropicApiKey) return { ok: false, message: 'Add an Anthropic API key first.' }
      const client = new Anthropic({ apiKey: settings.anthropicApiKey })
      await client.models.list({ limit: 1 })
      return { ok: true, message: 'Connected to Anthropic successfully.' }
    }
    if (settings.advisorProvider === 'openai' && !settings.openaiApiKey) {
      return { ok: false, message: 'Add an OpenAI API key first.' }
    }
    return await testModelsEndpoint(settings)
  } catch (error) {
    const err = error as Error & { status?: number }
    if (err.status === 401) return { ok: false, message: 'The provider rejected the access key.' }
    return { ok: false, message: err.message || String(error) }
  }
}
