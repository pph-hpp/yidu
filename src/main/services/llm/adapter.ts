import { openAIRequest } from './openai'
import { anthropicRequest } from './anthropic'
import { net } from 'electron'
import type { ModelProfile } from '../../../shared/types'
import { validateProfile } from '../../../shared/config'
import { readSSE } from './sse'
import { ThinkFilter, stripThink } from './think'
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
export interface ChatOptions {
  temperature: number
  maxTokens?: number
  signal: AbortSignal
  /** 推理模型正在输出思考过程（还没有正文） */
  onThinking?: () => void
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
  | 'ENGINE_UNAVAILABLE'
  | 'QUOTA'
const messages: Record<ErrorCode, string> = {
  NO_PROFILE: '还没有配置翻译模型',
  AUTH: 'API Key 无效或无权限',
  MODEL_NOT_FOUND: '找不到模型',
  RATE_LIMIT: '请求太频繁，稍后重试',
  CONTEXT_TOO_LONG: '选区太长',
  NETWORK: '网络连接失败',
  TIMEOUT: '网络连接失败（超时）',
  SERVER: '模型服务异常',
  ENGINE_UNAVAILABLE: '翻译引擎暂时不可用',
  QUOTA: '账户余额不足'
}
export class LLMError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string
  ) {
    super(message ?? messages[code])
  }
}
export function classifyHttpError(status: number, body: string): ErrorCode {
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 404) return 'MODEL_NOT_FOUND'
  if (status === 429) return 'RATE_LIMIT'
  if (status === 413) return 'CONTEXT_TOO_LONG'
  if (status === 400) {
    if (
      /context[_ ]?(length|window)|maximum context|too many tokens|token[^\n]{0,30}(limit|exceed)/i.test(
        body
      )
    )
      return 'CONTEXT_TOO_LONG'
    if (/model|deployment/i.test(body) && /invalid|not|supported|exist/i.test(body))
      return 'MODEL_NOT_FOUND'
  }
  return 'SERVER'
}
async function responseError(res: Response): Promise<LLMError> {
  let body = ''
  const reader = res.body?.getReader()
  if (reader) {
    try {
      const decoder = new TextDecoder()
      let bytes = 0
      while (bytes < 16384) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        body += decoder.decode(value.subarray(0, Math.max(0, 16384 - (bytes - value.byteLength))), {
          stream: true
        })
      }
    } catch {
    } finally {
      await reader.cancel().catch(() => {})
    }
  }
  return new LLMError(classifyHttpError(res.status, body))
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
      if (!res.ok) throw await responseError(res)
      if (!res.body) throw new LLMError('SERVER')
      let completed = false
      const filter = new ThinkFilter()
      for await (const data of readSSE(res.body)) {
        if (data === '[DONE]') {
          completed = true
          break
        }
        const parsed = JSON.parse(data)
        if (parsed.type === 'message_stop' || parsed.choices?.[0]?.finish_reason) completed = true
        if (parsed.error || parsed.type === 'error') throw new LLMError('SERVER')
        const delta =
          this.profile.provider === 'anthropic' ? parsed.delta : parsed.choices?.[0]?.delta
        // 服务端推理解析器把思考过程放在单独字段：算作服务端仍在工作，不计入超时
        const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thinking
        if (typeof reasoning === 'string' && reasoning) {
          reset()
          opts.onThinking?.()
        }
        const text = this.profile.provider === 'anthropic' ? delta?.text : delta?.content
        if (typeof text === 'string' && text) {
          reset()
          const visible = filter.push(text)
          if (visible) yield visible
          else if (filter.thinking) opts.onThinking?.()
        }
      }
      if (!completed) throw new LLMError('NETWORK')
      const rest = filter.finish()
      if (rest) yield rest
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
      if (!res.ok) throw await responseError(res)
      const body = await res.json()
      const text =
        this.profile.provider === 'anthropic'
          ? body.content
              ?.filter((v: { type: string }) => v.type === 'text')
              .map((v: { text: string }) => v.text)
              .join('')
          : body.choices?.[0]?.message?.content
      const message = body.choices?.[0]?.message
      const visible = typeof text === 'string' ? stripThink(text) : ''
      if (!visible && (message?.reasoning_content || message?.reasoning || /<think>/.test(text)))
        throw new LLMError('SERVER', '模型只返回了思考过程，没有给出回答（可能超出了最大输出长度）')
      if (typeof text !== 'string') throw new LLMError('SERVER')
      return visible
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
