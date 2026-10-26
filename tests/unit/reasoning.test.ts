import { it, expect, vi, afterEach } from 'vitest'
vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))
import { FetchAdapter, LLMError, requestSpec } from '../../src/main/services/llm/adapter'
import { ThinkFilter, stripThink } from '../../src/main/services/llm/think'
import { LLMService } from '../../src/main/services/llm/llm.service'
import { defaultConfig } from '../../src/shared/config'
import type { ConfigService } from '../../src/main/services/config.service'
import type { SecretService } from '../../src/main/services/secret.service'
afterEach(() => vi.useRealTimers())
const profile = {
    ...defaultConfig().profiles[0],
    model: 'qwen3',
    baseUrl: 'http://192.168.1.10:8080/v1'
  },
  opts = () => ({ temperature: 0.2, signal: new AbortController().signal })
const sse = (...deltas: object[]) =>
  deltas.map((d) => 'data: ' + JSON.stringify({ choices: [{ delta: d }] }) + '\n\n').join('') +
  'data: [DONE]\n\n'
async function collect(adapter: FetchAdapter, onThinking?: () => void) {
  let out = ''
  for await (const t of adapter.chatStream([{ role: 'user', content: 'hi' }], {
    ...opts(),
    onThinking
  }))
    out += t
  return out
}

it('局域网 HTTP 地址照常构造请求；没有密钥时不带 Authorization', () => {
  const spec = requestSpec(profile, '', [{ role: 'user', content: 'hi' }], opts(), true)
  expect(spec.url).toBe('http://192.168.1.10:8080/v1/chat/completions')
  expect(spec.headers.Authorization).toBeUndefined()
  expect(requestSpec(profile, 'sk', [], opts(), true).headers.Authorization).toBe('Bearer sk')
})

it('<think> 过滤：标签被拆在多个数据块之间也能去掉，正文保持流式', () => {
  const f = new ThinkFilter()
  const out = [
    '<thi',
    'nk>\n用户要翻译。\n[1] The first',
    ' work.\n</th',
    'ink>\n\n[1] 第',
    '一句。\n[2] 第二句。'
  ]
    .map((c) => f.push(c))
    .join('')
  expect(out + f.finish()).toBe('[1] 第一句。\n[2] 第二句。')
  expect(f.thinking).toBe(true)
  const plain = new ThinkFilter()
  expect(plain.push('[1] 普通译文 <b>')).toBe('[1] 普通译文 <b>')
  expect(plain.push('a < b')).toBe('a < b')
  expect(plain.finish()).toBe('')
  expect(plain.thinking).toBe(false)
  const unclosed = new ThinkFilter()
  expect(unclosed.push('<think>想到一半')).toBe('')
  expect(unclosed.finish()).toBe('')
})

it('非流式回答去掉思考内容，兼容模板预先插入 <think> 时只剩结尾标签', () => {
  expect(stripThink('<think>想想</think>\n\n结果')).toBe('结果')
  expect(stripThink('想想……\n</think>\n结果')).toBe('结果')
  expect(stripThink('没有思考')).toBe('没有思考')
})

it('思考过程在 reasoning_content / reasoning 字段：不当作正文，通知思考中', async () => {
  for (const field of ['reasoning_content', 'reasoning']) {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(sse({ [field]: '先分析一下' }, { [field]: '……' }, { content: '[1] 译文' }))
      )
    const onThinking = vi.fn()
    expect(await collect(new FetchAdapter(profile, '', fetcher), onThinking)).toBe('[1] 译文')
    expect(onThinking).toHaveBeenCalled()
  }
})

it('思考内容混在 content 里：输出前过滤，并通知思考中', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        sse(
          { content: '<think>\n[1] The first' },
          { content: ' work.\n</think>\n' },
          { content: '[1] 译文' }
        )
      )
    )
  const onThinking = vi.fn()
  expect(await collect(new FetchAdapter(profile, '', fetcher), onThinking)).toBe('[1] 译文')
  expect(onThinking).toHaveBeenCalled()
})

it('思考持续超过 30 秒不会超时：思考增量同样重置计时器', async () => {
  vi.useFakeTimers()
  let control!: ReadableStreamDefaultController<Uint8Array>
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (control = c) })
  const fetcher = vi.fn().mockImplementation(async (_url, init) => {
    init.signal.addEventListener('abort', () =>
      control.error(new DOMException('abort', 'AbortError'))
    )
    return new Response(body)
  })
  const result = collect(new FetchAdapter(profile, '', fetcher)).catch((e) => (e as LLMError).code)
  // 连续 80 秒只有思考内容，每 20 秒一块
  for (let i = 0; i < 4; i++) {
    await vi.advanceTimersByTimeAsync(20000)
    control.enqueue(
      enc.encode(
        'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '…' } }] }) + '\n\n'
      )
    )
  }
  control.enqueue(enc.encode(sse({ content: '[1] 译文' })))
  control.close()
  expect(await result).toBe('[1] 译文')
})

it('非流式：只返回思考过程时给出明确提示', async () => {
  const adapter = new FetchAdapter(
    profile,
    '',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '', reasoning_content: '想了很久' } }] })
        )
      )
  )
  await expect(adapter.chat([], opts())).rejects.toThrow('模型只返回了思考过程')
  const inline = new FetchAdapter(
    profile,
    '',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '<think>想</think>好的' } }] })
        )
      )
  )
  expect(await inline.chat([], opts())).toBe('好的')
})

it('翻译流程：思考时给尚未出译文的句子发一次「思考中」通知；没有密钥也能翻译', async () => {
  const cfg = defaultConfig()
  cfg.profiles[0] = { ...cfg.profiles[0], model: 'qwen3', baseUrl: 'http://192.168.1.10:8080/v1' }
  cfg.settings.translator = { kind: 'llm' }
  const s = new LLMService(
    { get: () => cfg } as ConfigService,
    { has: () => false, get: () => '' } as unknown as SecretService
  )
  vi.spyOn(s, 'stream').mockImplementation(async (_p, _m, _s, onText, _max, onThinking) => {
    onThinking?.()
    onThinking?.()
    onText('[1] 第一句。\n[2] 第二句。')
  })
  const deltas: { sentenceId: string; text: string; thinking?: true }[] = [],
    done = vi.fn(),
    fail = vi.fn()
  await s.translate(
    {
      requestId: 'r',
      sentences: [
        { id: 'a', text: 'one' },
        { id: 'b', text: 'two' }
      ]
    },
    (d) => deltas.push(d),
    done,
    fail
  )
  expect(fail).not.toHaveBeenCalled()
  expect(done).toHaveBeenCalled()
  expect(deltas.filter((d) => d.thinking).map((d) => d.sentenceId)).toEqual(['a', 'b'])
  expect(
    deltas
      .filter((d) => !d.thinking)
      .map((d) => d.text)
      .join('')
  ).toContain('第一句')
})

it('测试连接：局域网 HTTP 地址不再被拦截，没有密钥也会真正发出请求', async () => {
  const s = new LLMService(
    { get: () => defaultConfig() } as ConfigService,
    { has: () => false, get: () => '' } as unknown as SecretService
  )
  const stream = vi.spyOn(s, 'stream').mockResolvedValue()
  expect(await s.test(profile)).toMatchObject({ ok: true })
  expect(stream).toHaveBeenCalled()
})
it('测试连接先去掉 Base URL 和模型名的首尾空白', async () => {
  const s = new LLMService(
    { get: () => defaultConfig() } as ConfigService,
    { has: () => false, get: () => '' } as unknown as SecretService
  )
  const stream = vi.spyOn(s, 'stream').mockResolvedValue()
  await s.test({ ...profile, baseUrl: ' http://192.168.1.201:8080/v1 ', model: ' qwen3 ' })
  expect(stream.mock.calls[0][0]).toMatchObject({
    baseUrl: 'http://192.168.1.201:8080/v1',
    model: 'qwen3'
  })
})
