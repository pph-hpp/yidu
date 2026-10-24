import { openAIRequest } from './openai'
import { anthropicRequest } from './anthropic'
import { net } from 'electron'
import type { ModelProfile } from '../../../shared/types'
import { validateProfile } from '../../../shared/config'
import { readSSE } from './sse'
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
export interface ChatOptions {
  temperature: number
  maxTokens?: number
  signal: AbortSignal
}
export interface LLMAdapter {
  chatStream(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<string>
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<string>
}
export type ErrorCode =
  | 'NO_PROFILE'
  | 'AUTH'
  | 'MODEL_NOT_FOUND'
  | 'RATE_LIMIT'
  | 'CONTEXT_TOO_LONG'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'SERVER'
const messages: Record<ErrorCode, string> = {
  NO_PROFILE: '还没有配置翻译模型',
  AUTH: 'API Key 无效或无权限',
  MODEL_NOT_FOUND: '找不到模型',
  RATE_LIMIT: '请求太频繁，稍后重试',
  CONTEXT_TOO_LONG: '选区太长',
  NETWORK: '网络连接失败',
  TIMEOUT: '网络连接失败（超时）',
  SERVER: '模型服务异常'
}
export class LLMError extends Error {
  constructor(public code: ErrorCode) {
    super(messages[code])
  }
}
export function requestSpec(
  profile: ModelProfile,
  key: string,
  msgs: ChatMessage[],
  opts: ChatOptions,
  stream: boolean
) {
  validateProfile(profile)
  return profile.provider === 'anthropic'
    ? anthropicRequest(profile, key, msgs, opts, stream)
    : openAIRequest(profile, key, msgs, opts, stream)
}

export class FetchAdapter implements LLMAdapter {
  constructor(
    private profile: ModelProfile,
    private key: string,
    private fetcher: typeof fetch = net.fetch as typeof fetch
  ) {}
  async *chatStream(msgs: ChatMessage[], opts: ChatOptions): AsyncIterable<string> {
    const controller = new AbortController()
    const abort = () => controller.abort(opts.signal.reason)
    opts.signal.addEventListener('abort', abort, { once: true })
    if (opts.signal.aborted) abort()
    let timedOut = false
    let timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 30000)
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, 60000)
    }
    try {
      const spec = requestSpec(this.profile, this.key, msgs, opts, true)
      const res = await this.fetcher(spec.url, {
        method: 'POST',
        headers: spec.headers,
        body: JSON.stringify(spec.body),
        signal: controller.signal,
        redirect: 'error'
      })
      if (!res.ok) {
        await res.body?.cancel()
        throw new LLMError(
          res.status === 401 || res.status === 403
            ? 'AUTH'
            : res.status === 404
              ? 'MODEL_NOT_FOUND'
              : res.status === 429
                ? 'RATE_LIMIT'
                : res.status >= 500
                  ? 'SERVER'
                  : res.status === 413 || res.status === 400
                    ? 'CONTEXT_TOO_LONG'
                    : 'SERVER'
        )
      }
      if (!res.body) throw new LLMError('SERVER')
      let completed = false
      for await (const data of readSSE(res.body)) {
        if (data === '[DONE]') {
          completed = true
          break
        }
        const parsed = JSON.parse(data)
        if (parsed.type === 'message_stop' || parsed.choices?.[0]?.finish_reason) completed = true
        if (parsed.error || parsed.type === 'error') throw new LLMError('SERVER')
        const text =
          this.profile.provider === 'anthropic'
            ? parsed.delta?.text
            : parsed.choices?.[0]?.delta?.content
        if (typeof text === 'string' && text) {
          reset()
          yield text
        }
      }
      if (!completed) throw new LLMError('NETWORK')
    } catch (error) {
      if (opts.signal.aborted) throw new DOMException('已取消', 'AbortError')
      if (error instanceof LLMError) throw error
      throw new LLMError(timedOut ? 'TIMEOUT' : 'NETWORK')
    } finally {
      clearTimeout(timer)
      opts.signal.removeEventListener('abort', abort)
    }
  }
  async chat(msgs: ChatMessage[], opts: ChatOptions): Promise<string> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    opts.signal.addEventListener('abort', abort, { once: true })
    if (opts.signal.aborted) abort()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 60000)
    try {
      const spec = requestSpec(this.profile, this.key, msgs, opts, false)
      const res = await this.fetcher(spec.url, {
        method: 'POST',
        headers: spec.headers,
        body: JSON.stringify(spec.body),
        signal: controller.signal,
        redirect: 'error'
      })
      if (!res.ok) {
        await res.body?.cancel()
        throw new LLMError(
          res.status === 401 || res.status === 403
            ? 'AUTH'
            : res.status === 404
              ? 'MODEL_NOT_FOUND'
              : res.status === 429
                ? 'RATE_LIMIT'
                : res.status >= 500
                  ? 'SERVER'
                  : res.status === 400 || res.status === 413
                    ? 'CONTEXT_TOO_LONG'
                    : 'SERVER'
        )
      }
      const body = await res.json()
      const text =
        this.profile.provider === 'anthropic'
          ? body.content
              ?.filter((v: { type: string }) => v.type === 'text')
              .map((v: { text: string }) => v.text)
              .join('')
          : body.choices?.[0]?.message?.content
      if (typeof text !== 'string') throw new LLMError('SERVER')
      return text
    } catch (error) {
      if (opts.signal.aborted) throw new DOMException('已取消', 'AbortError')
      if (error instanceof LLMError) throw error
      throw new LLMError(timedOut ? 'TIMEOUT' : 'NETWORK')
    } finally {
      clearTimeout(timer)
      opts.signal.removeEventListener('abort', abort)
    }
  }
}
