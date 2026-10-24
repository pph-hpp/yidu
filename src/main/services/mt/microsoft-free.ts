import { LLMError } from '../llm/adapter'
import {
  chunk,
  defaultFetcher,
  mtFetch,
  readJson,
  testBase,
  type Fetcher,
  type MtAdapter
} from './adapter'
const UNAVAILABLE = '微软翻译暂时不可用'
const TOKEN_TTL = 9 * 60 * 1000
// Edge 浏览器内置翻译使用的接口：先取临时 token，再调用 Translator v3（设计文档 8.7）
export class MicrosoftFreeAdapter implements MtAdapter {
  private token?: { value: string; expires: number }
  constructor(
    private fetcher: Fetcher = defaultFetcher,
    private now: () => number = Date.now
  ) {}
  private urls() {
    const base = testBase('microsoft-free')
    return {
      auth: (base ?? 'https://edge.microsoft.com') + '/translate/auth',
      api:
        (base ?? 'https://api-edge.cognitive.microsofttranslator.com') +
        '/translate?api-version=3.0&to=zh-Hans'
    }
  }
  private async getToken(signal: AbortSignal): Promise<string> {
    if (this.token && this.token.expires > this.now()) return this.token.value
    const res = await mtFetch(
      'microsoft-free',
      this.urls().auth,
      { method: 'GET' },
      signal,
      this.fetcher,
      UNAVAILABLE
    )
    const value = res.ok ? (await res.text()).trim() : ''
    if (!value || value.length > 8192) throw new LLMError('ENGINE_UNAVAILABLE', UNAVAILABLE)
    this.token = { value, expires: this.now() + TOKEN_TTL }
    return value
  }
  async translate(texts: string[], { signal }: { signal: AbortSignal }): Promise<string[]> {
    const out: string[] = []
    for (const batch of chunk(texts, 100, 10000)) out.push(...(await this.batch(batch, signal)))
    return out
  }
  private async batch(texts: string[], signal: AbortSignal, retried = false): Promise<string[]> {
    const token = await this.getToken(signal)
    const res = await mtFetch(
      'microsoft-free',
      this.urls().api,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(texts.map((Text) => ({ Text })))
      },
      signal,
      this.fetcher,
      UNAVAILABLE
    )
    if (res.status === 401) {
      // token 可能被提前作废：重新获取一次
      this.token = undefined
      if (!retried) return this.batch(texts, signal, true)
      throw new LLMError('ENGINE_UNAVAILABLE', UNAVAILABLE)
    }
    if (res.status === 429) throw new LLMError('RATE_LIMIT')
    if (!res.ok) throw new LLMError('ENGINE_UNAVAILABLE', UNAVAILABLE)
    const body = await readJson(res, UNAVAILABLE)
    if (!Array.isArray(body) || body.length !== texts.length)
      throw new LLMError('ENGINE_UNAVAILABLE', UNAVAILABLE)
    return body.map((item) => {
      const text = item?.translations?.[0]?.text
      if (typeof text !== 'string') throw new LLMError('ENGINE_UNAVAILABLE', UNAVAILABLE)
      return text
    })
  }
}
