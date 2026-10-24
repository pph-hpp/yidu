import { it, expect, vi, afterEach } from 'vitest'
vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))
import { LLMService, validateTranslate } from '../../src/main/services/llm/llm.service'
import { FetchAdapter, LLMError } from '../../src/main/services/llm/adapter'
import { defaultConfig } from '../../src/shared/config'
import type { ConfigService } from '../../src/main/services/config.service'
import type { SecretService } from '../../src/main/services/secret.service'
import { cacheKey, engineTag } from '../../src/renderer/src/lib/translateCache'
afterEach(() => vi.useRealTimers())
function service() {
  const cfg = defaultConfig()
  cfg.profiles[0].model = 'mock'
  cfg.settings.translator = { kind: 'llm' }
  return new LLMService(
    { get: () => cfg } as ConfigService,
    { has: () => true, get: () => '' } as unknown as SecretService
  )
}
it('无输出时网络错误只重试两次', async () => {
  vi.useFakeTimers()
  const s = service(),
    stream = vi.spyOn(s, 'stream').mockRejectedValue(new LLMError('NETWORK')),
    fail = vi.fn()
  const job = s.translate(
    { requestId: 'r', sentences: [{ id: 's', text: 'source' }] },
    () => {},
    () => {},
    fail
  )
  await vi.runAllTimersAsync()
  await job
  expect(stream).toHaveBeenCalledTimes(3)
  expect(fail.mock.calls[0][0].code).toBe('NETWORK')
})
it('部分流中断仅返回未完成句子，已完成句不重译', async () => {
  const s = service(),
    fail = vi.fn(),
    out: string[] = []
  vi.spyOn(s, 'stream').mockImplementation(async (_p, _m, _s, emit) => {
    emit('[1] 完整\n[2] 部分')
    throw new LLMError('NETWORK')
  })
  await s.translate(
    {
      requestId: 'r',
      sentences: [
        { id: 'a', text: 'one' },
        { id: 'b', text: 'two' },
        { id: 'c', text: 'three' }
      ]
    },
    (e) => out.push(e.text),
    () => {},
    fail
  )
  expect(fail.mock.calls[0][0].sentenceIds).toEqual(['b', 'c'])
  expect(out.join('')).toContain('完整')
})
it('首字 30 秒、增量间隔 60 秒超时并关闭流', async () => {
  vi.useFakeTimers()
  for (const first of [false, true]) {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        if (first)
          c.enqueue(
            new TextEncoder().encode('data: {"choices":[{"delta":{"content":"first"}}]}\n\n')
          )
      }
    })
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      init.signal.addEventListener('abort', () => {})
      return new Response(body)
    })
    // Model fetch cancellation closes its stream; imitate that behavior in this isolated test.
    let control: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        control = c
        if (first)
          c.enqueue(
            new TextEncoder().encode('data: {"choices":[{"delta":{"content":"first"}}]}\n\n')
          )
      }
    })
    fetcher.mockImplementation(async (_url, init) => {
      init.signal.addEventListener('abort', () =>
        control.error(new DOMException('abort', 'AbortError'))
      )
      return new Response(stream)
    })
    const adapter = new FetchAdapter({ ...defaultConfig().profiles[0], model: 'mock' }, '', fetcher)
    const result = (async () => {
      try {
        for await (const _t of adapter.chatStream([], {
          temperature: 0.2,
          signal: new AbortController().signal
        })) {
        }
        return ''
      } catch (e) {
        return (e as LLMError).code
      }
    })()
    await vi.advanceTimersByTimeAsync(first ? 60001 : 30001)
    expect(await result).toBe('TIMEOUT')
  }
})
it('缓存键随模型、提示词和启用背景变化，禁用背景不影响', async () => {
  const base = defaultConfig()
  base.settings.translator = { kind: 'llm' }
  const key = async (patch: (c: ReturnType<typeof defaultConfig>) => void = () => {}) => {
    const c = structuredClone(base)
    patch(c)
    return cacheKey('source', await engineTag(c))
  }
  const a = await key()
  expect(await key()).toBe(a)
  expect(await key((c) => (c.profiles[0].model = 'new'))).not.toBe(a)
  expect(await key((c) => (c.presets[0].systemPrompt = 'new'))).not.toBe(a)
  const snippet = { id: 'n', source: 'test', text: 'background', enabled: false, createdAt: '' }
  expect(await key((c) => (c.presets[0].snippets = [snippet]))).toBe(a)
  expect(await key((c) => (c.presets[0].snippets = [{ ...snippet, enabled: true }]))).not.toBe(a)
})
it('同一原文在大模型与两个机器翻译引擎下缓存键互不相同，机器翻译不受提示词影响', async () => {
  const c = defaultConfig()
  c.settings.translator = { kind: 'llm' }
  const llm = await cacheKey('source', await engineTag(c))
  c.settings.translator = { kind: 'mt', engineId: 'microsoft-free' }
  const microsoft = await cacheKey('source', await engineTag(c))
  c.presets[0].systemPrompt = 'changed'
  expect(await cacheKey('source', await engineTag(c))).toBe(microsoft)
  c.settings.translator = { kind: 'mt', engineId: 'google-free' }
  const google = await cacheKey('source', await engineTag(c))
  expect(new Set([llm, microsoft, google]).size).toBe(3)
})
it('IPC 拒绝超过 60 句、6000 字和重复句子标识', () => {
  expect(() =>
    validateTranslate({
      requestId: 'r',
      sentences: Array.from({ length: 61 }, (_, i) => ({ id: String(i), text: 'x' }))
    })
  ).toThrow()
  expect(() =>
    validateTranslate({ requestId: 'r', sentences: [{ id: 's', text: 'x'.repeat(6001) }] })
  ).toThrow()
  expect(() =>
    validateTranslate({
      requestId: 'r',
      sentences: [
        { id: 's', text: 'a' },
        { id: 's', text: 'b' }
      ]
    })
  ).toThrow()
})
