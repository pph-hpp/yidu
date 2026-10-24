import { createHash, randomUUID } from 'node:crypto'
import { LLMError } from '../llm/adapter'
import {
  defaultFetcher,
  mapLimit,
  mtFetch,
  readJson,
  testBase,
  type Fetcher,
  type MtAdapter
} from './adapter'
const UNAVAILABLE = '有道智云暂时不可用'
/** 签名用的 input：长度 ≤ 20 取原文，否则取「前 10 个字符 + 长度 + 后 10 个字符」 */
export function youdaoInput(q: string): string {
  const chars = Array.from(q)
  return chars.length <= 20
    ? q
    : chars.slice(0, 10).join('') + chars.length + chars.slice(-10).join('')
}
export function youdaoSign(
  appKey: string,
  q: string,
  salt: string,
  curtime: string,
  appSecret: string
): string {
  return createHash('sha256')
    .update(appKey + youdaoInput(q) + salt + curtime + appSecret)
    .digest('hex')
}
/** 有道错误码映射（以官方错误码文档为准） */
export function youdaoError(code: string): LLMError {
  switch (code) {
    case '108':
      return new LLMError('AUTH', '应用 ID 无效')
    case '202':
      return new LLMError('AUTH', '签名校验失败，请检查应用密钥')
    case '110':
      return new LLMError('AUTH', '应用未绑定文本翻译服务')
    case '401':
      return new LLMError('QUOTA', '有道智云账户余额不足')
    case '411':
      return new LLMError('RATE_LIMIT')
    default:
      return new LLMError('SERVER', '有道智云返回错误（错误码 ' + code + '）')
  }
}
// 有道智云官方文本翻译接口，逐句请求、并发 3（设计文档 8.7）
export class YoudaoAdapter implements MtAdapter {
  constructor(
    private appKey: string,
    private appSecret: string,
    private fetcher: Fetcher = defaultFetcher,
    private now: () => number = Date.now
  ) {}
  translate(texts: string[], { signal }: { signal: AbortSignal }): Promise<string[]> {
    return mapLimit(texts, 3, (q) => this.one(q, signal))
  }
  private async one(q: string, signal: AbortSignal): Promise<string> {
    const salt = randomUUID(),
      curtime = String(Math.floor(this.now() / 1000))
    const res = await mtFetch(
      'youdao',
      (testBase('youdao') ?? 'https://openapi.youdao.com') + '/api',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({
          q,
          from: 'auto',
          to: 'zh-CHS',
          appKey: this.appKey,
          salt,
          curtime,
          signType: 'v3',
          sign: youdaoSign(this.appKey, q, salt, curtime, this.appSecret)
        }).toString()
      },
      signal,
      this.fetcher,
      UNAVAILABLE
    )
    if (res.status === 429) throw new LLMError('RATE_LIMIT')
    if (!res.ok) throw new LLMError('ENGINE_UNAVAILABLE', UNAVAILABLE)
    const body = (await readJson(res, UNAVAILABLE)) as {
      errorCode?: unknown
      translation?: unknown
    }
    const code = String(body?.errorCode ?? '')
    if (code !== '0') throw youdaoError(code || 'unknown')
    const text = Array.isArray(body.translation) ? body.translation[0] : undefined
    if (typeof text !== 'string') throw new LLMError('SERVER', '有道智云返回格式无法解析')
    return text
  }
}
