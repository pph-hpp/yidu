import { session, type Session } from 'electron'
import { LLMError } from '../llm/adapter'
import {
  chunk,
  mapLimit,
  mtFetch,
  readJson,
  testBase,
  type Fetcher,
  type MtAdapter
} from './adapter'
const UNAVAILABLE = '微软翻译暂时不可用'
// 网页接口会拒绝带 Electron 标识的 UA，使用普通 Chrome 的 UA
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
/** 每次请求的字符上限（Bing 网页未登录时约 1000） */
const MAX_CHARS = 1000
const SEPARATOR = '\n\n'
let bingSession: Session | undefined
/** 独立的内存会话：Bing 的 cookie 不进入应用默认会话，也不落盘 */
export const bingFetcher: Fetcher = (input, init) => {
  if (!bingSession) {
    bingSession = session.fromPartition('yidu-mt-bing')
    bingSession.setUserAgent(USER_AGENT)
  }
  return bingSession.fetch(input as string, { ...init, credentials: 'include' })
}
export interface BingParams {
  key: string
  token: string
  /** token 有效期（毫秒） */
  interval: number
  ig: string
  iid: string
}
/** 从 Bing 翻译页面提取 ttranslatev3 需要的参数 */
export function parseBingParams(html: string): BingParams | undefined {
  const helper = html.match(
    /params_AbusePreventionHelper\s*=\s*\[\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\]/
  )
  const ig = html.match(/IG:"([0-9A-Fa-f]+)"/)?.[1],
    iid = html.match(/data-iid="(translator\.\d+)"/)?.[1]
  if (!helper || !ig || !iid) return undefined
  return { key: helper[1], token: helper[2], interval: Number(helper[3]), ig, iid }
}
/**
 * 免费微软翻译：Bing 网页翻译接口（设计文档 8.7）。
 * 先请求翻译页面取得 key / token / IG / IID（缓存到 token 过期前），再调用 ttranslatev3；
 * 多句以空行连接成一次请求，再按空行切回。
 */
export class MicrosoftFreeAdapter implements MtAdapter {
  private params?: BingParams & { base: string; expires: number; count: number }
  /** 上次成功的站点优先 */
  private preferred?: string
  constructor(
    private fetcher: Fetcher = bingFetcher,
    private now: () => number = Date.now
  ) {}
  private async getParams(signal: AbortSignal) {
    if (this.params && this.params.expires > this.now()) return this.params
    // 国内访问 www.bing.com 会重定向到 cn.bing.com：不跟随重定向，依次尝试两个站点，
    // 页面和翻译请求都使用成功的那个（Electron 的 fetch 不提供重定向后的地址）
    const test = testBase('microsoft-free'),
      bases = test
        ? [test]
        : [...new Set([this.preferred, 'https://www.bing.com', 'https://cn.bing.com'])].filter(
            (b): b is string => !!b
          )
    for (const base of bases) {
      let parsed: BingParams | undefined
      try {
        const res = await mtFetch(
          'microsoft-free',
          base + '/translator',
          { method: 'GET' },
          signal,
          this.fetcher,
          UNAVAILABLE
        )
        parsed = res.ok ? parseBingParams(await res.text()) : undefined
      } catch (e) {
        if (signal.aborted) throw e
      }
      if (!parsed) continue
      const ttl = Math.min(parsed.interval || 0, 50 * 60 * 1000) || 10 * 60 * 1000
      this.preferred = base
      this.params = { ...parsed, base, expires: this.now() + ttl, count: 0 }
      return this.params
    }
    throw new LLMError('ENGINE_UNAVAILABLE', UNAVAILABLE)
  }
  async translate(texts: string[], { signal }: { signal: AbortSignal }): Promise<string[]> {
    const lines = texts.map((t) => t.replace(/\s+/g, ' ').trim())
    const out: string[] = []
    for (const batch of chunk(lines, Infinity, MAX_CHARS - 20))
      out.push(...(await this.batch(batch, signal)))
    return out
  }
  private async batch(lines: string[], signal: AbortSignal): Promise<string[]> {
    if (lines.length > 1) {
      const parts = (await this.request(lines.join(SEPARATOR), signal)).split(/\n\s*\n/)
      if (parts.length === lines.length) return parts.map((p) => p.trim())
    }
    // 空行没有保留下来时改为逐句请求；并发 2，避免触发网页接口的频率限制
    return mapLimit(lines, 2, async (line) => (await this.request(line, signal)).trim())
  }
  private async request(text: string, signal: AbortSignal, retried = false): Promise<string> {
    const p = await this.getParams(signal)
    const res = await mtFetch(
      'microsoft-free',
      `${p.base}/ttranslatev3?isVertical=1&IG=${p.ig}&IID=${p.iid}.${++p.count}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({
          fromLang: 'auto-detect',
          to: 'zh-Hans',
          text,
          token: p.token,
          key: p.key
        }).toString()
      },
      signal,
      this.fetcher,
      UNAVAILABLE
    )
    if (res.status === 429) throw new LLMError('RATE_LIMIT')
    const body = res.ok ? await readJson(res, UNAVAILABLE).catch(() => undefined) : undefined
    const translated = Array.isArray(body) ? body[0]?.translations?.[0]?.text : undefined
    if (typeof translated === 'string') return translated
    // token 过期、要求验证码或返回错误对象：重新获取一次页面参数后重试
    this.params = undefined
    if (!retried && !signal.aborted) return this.request(text, signal, true)
    if ((body as { statusCode?: number } | undefined)?.statusCode === 429)
      throw new LLMError('RATE_LIMIT')
    throw new LLMError('ENGINE_UNAVAILABLE', UNAVAILABLE)
  }
}
