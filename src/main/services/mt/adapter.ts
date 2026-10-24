import { app, net } from 'electron'
import { LLMError } from '../llm/adapter'
import { mtEngine, type MtEngineId } from '../../../shared/mt'
export interface MtAdapter {
  /** 返回数组与输入一一对应；失败时抛出带错误码的 LLMError */
  translate(texts: string[], opts: { signal: AbortSignal }): Promise<string[]>
}
export type Fetcher = typeof fetch
export const defaultFetcher = (...args: Parameters<Fetcher>) => (net.fetch as Fetcher)(...args)
const overrideEnv: Record<MtEngineId, string> = {
  'microsoft-free': 'YIDU_MT_BASE_MICROSOFT',
  'google-free': 'YIDU_MT_BASE_GOOGLE',
  youdao: 'YIDU_MT_BASE_YOUDAO'
}
/** 测试专用：未打包时允许用环境变量把引擎地址指向本地 mock 服务 */
export function testBase(id: MtEngineId): string | undefined {
  const value = app?.isPackaged === false ? process.env[overrideEnv[id]] : undefined
  return value ? value.replace(/\/$/, '') : undefined
}
/**
 * 机器翻译统一的请求入口：只允许白名单域名（或测试替换地址）、禁止重定向、15 秒超时；
 * 网络失败与超时都视为引擎不可用。
 */
export async function mtFetch(
  id: MtEngineId,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  fetcher: Fetcher,
  unavailable: string,
  timeoutMs = 15000
): Promise<Response> {
  const host = new URL(url).hostname,
    base = testBase(id)
  if (!mtEngine(id).hosts.includes(host) && !(base && new URL(base).hostname === host))
    throw new Error('拒绝请求白名单以外的地址')
  const controller = new AbortController(),
    abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const timer = setTimeout(abort, timeoutMs)
  try {
    return await fetcher(url, { ...init, signal: controller.signal, redirect: 'error' })
  } catch {
    if (signal.aborted) throw new DOMException('已取消', 'AbortError')
    throw new LLMError('ENGINE_UNAVAILABLE', unavailable)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}
export async function readJson(res: Response, unavailable: string): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    throw new LLMError('ENGINE_UNAVAILABLE', unavailable)
  }
}
/** 按条数和总字符数分批，单条超长时独占一批 */
export function chunk(texts: string[], maxItems: number, maxChars: number): string[][] {
  const batches: string[][] = []
  let current: string[] = [],
    chars = 0
  for (const text of texts) {
    if (current.length && (current.length >= maxItems || chars + text.length > maxChars)) {
      batches.push(current)
      current = []
      chars = 0
    }
    current.push(text)
    chars += text.length
  }
  if (current.length) batches.push(current)
  return batches
}
/** 保持顺序、限制并发地处理每一项 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await run(items[i])
      }
    })
  )
  return out
}
