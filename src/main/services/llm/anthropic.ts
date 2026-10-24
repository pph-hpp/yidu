import type { ModelProfile } from '../../../shared/types'
import type { ChatMessage, ChatOptions } from './adapter'
export function anthropicRequest(
  profile: ModelProfile,
  key: string,
  msgs: ChatMessage[],
  opts: ChatOptions,
  stream: boolean
) {
  const url =
    profile.baseUrl.replace(/\/+$/, '').replace(/\/v1(?:\/messages)?$/, '') + '/v1/messages'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01'
  }
  return {
    url,
    headers,
    body: {
      model: profile.model,
      system: msgs
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n'),
      messages: msgs.filter((m) => m.role !== 'system'),
      temperature: opts.temperature,
      max_tokens: opts.maxTokens ?? profile.maxTokens ?? 4096,
      stream
    } as Record<string, unknown>
  }
}
