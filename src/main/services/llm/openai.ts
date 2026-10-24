import type { ModelProfile } from '../../../shared/types'
import type { ChatMessage, ChatOptions } from './adapter'
export function openAIRequest(
  profile: ModelProfile,
  key: string,
  msgs: ChatMessage[],
  opts: ChatOptions,
  stream: boolean
) {
  let url = profile.baseUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (profile.provider === 'azure-openai') {
    url +=
      '/openai/deployments/' +
      encodeURIComponent(profile.model) +
      '/chat/completions?api-version=' +
      encodeURIComponent(profile.azureApiVersion || '2024-02-15-preview')
    headers['api-key'] = key
  } else {
    if (!url.endsWith('/chat/completions')) url += '/chat/completions'
    if (key) headers.Authorization = 'Bearer ' + key
  }
  return {
    url,
    headers,
    body: {
      model: profile.model,
      messages: msgs,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens ?? profile.maxTokens,
      stream
    } as Record<string, unknown>
  }
}
