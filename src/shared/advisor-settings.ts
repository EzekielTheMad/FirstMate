import type { AdvisorProvider, AppSettings } from './types'

/** Preserve the pre-provider-selection Anthropic behavior during migration. */
export function resolveAdvisorProvider(
  storedProvider: AdvisorProvider | undefined,
  hasAnthropicKey: boolean
): AdvisorProvider {
  return storedProvider ?? (hasAnthropicKey ? 'anthropic' : 'disabled')
}

export function isAdvisorReady(settings: AppSettings): boolean {
  return (
    (settings.advisorProvider === 'anthropic' && Boolean(settings.anthropicApiKey)) ||
    (settings.advisorProvider === 'openai' && Boolean(settings.openaiApiKey)) ||
    (settings.advisorProvider === 'hermes' && Boolean(settings.advisorBaseUrl)) ||
    (settings.advisorProvider === 'compatible' && Boolean(settings.advisorBaseUrl))
  )
}
