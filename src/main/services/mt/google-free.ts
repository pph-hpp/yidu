import { LLMError } from '../llm/adapter'
import {
  chunk,
  defaultFetcher,
  mapLimit,
  mtFetch,
  readJson,
  testBase,
  type Fetcher,
  type MtAdapter
} from './adapter'
const UNAVAILABLE = '谷歌翻译不可用（可能需要代理）'
// 网页端 client=gtx 接口：多句以换行连接成一次请求，再按换行切回（设计文档 8.7）
export class GoogleFreeAdapter implements MtAdapter {
  constructor(private fetcher: Fetcher = defaultFetcher) {}
  async translate(texts: string[], { signal }: { signal: AbortSignal }): Promise<string[]> {
    const out: string[] = []
    for (const batch of chunk(texts, Infinity, 5000)) out.push(...(await this.batch(batch, signal)))
    return out
  }
  private async batch(texts: string[], signal: AbortSignal): Promise<string[]> {
    const lines = texts.map((t) => t.replace(/\s*\n\s*/g, ' '))
    if (lines.length > 1) {
      const parts = (await this.request(lines.join('\n'), signal)).split('\n')
      if (parts.length === lines.length) return parts.map((p) => p.trim())
    }
    // 换行没有保留下来时改为逐句请求
    return mapLimit(lines, 3, async (line) => (await this.request(line, signal)).trim())
  }
  private async request(q: string, signal: AbortSignal): Promise<string> {
    const url =
      (testBase('google-free') ?? 'https://translate.googleapis.com') +
      '/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t'
    const res = await mtFetch(
      'google-free',
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ q }).toString()
      },
      signal,
      this.fetcher,
      UNAVAILABLE
    )
    if (res.status === 429) throw new LLMError('RATE_LIMIT')
    if (!res.ok) throw new LLMError('ENGINE_UNAVAILABLE', UNAVAILABLE)
    const body = await readJson(res, UNAVAILABLE)
    const segments = Array.isArray(body) ? body[0] : undefined
    if (!Array.isArray(segments)) throw new LLMError('ENGINE_UNAVAILABLE', UNAVAILABLE)
    return segments.map((s) => (Array.isArray(s) && typeof s[0] === 'string' ? s[0] : '')).join('')
  }
}
