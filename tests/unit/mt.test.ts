import { it, expect, vi, afterEach, describe } from 'vitest'
vi.mock('electron', () => ({ net: { fetch: vi.fn() }, app: { isPackaged: true } }))
import { createHash } from 'node:crypto'
import { chunk, mapLimit, mtFetch } from '../../src/main/services/mt/adapter'
import { MicrosoftFreeAdapter } from '../../src/main/services/mt/microsoft-free'
import { GoogleFreeAdapter } from '../../src/main/services/mt/google-free'
import {
  YoudaoAdapter,
  youdaoError,
  youdaoInput,
  youdaoSign
} from '../../src/main/services/mt/youdao'
import { MtService } from '../../src/main/services/mt/mt.service'
import { LLMService } from '../../src/main/services/llm/llm.service'
import { LLMError } from '../../src/main/services/llm/adapter'
import { defaultConfig } from '../../src/shared/config'
import type { ConfigService } from '../../src/main/services/config.service'
import type { SecretService } from '../../src/main/services/secret.service'
afterEach(() => vi.useRealTimers())
const signal = () => new AbortController().signal
type Call = { url: string; init: RequestInit }
function fakeFetch(handler: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(url), init: init || {} }
    calls.push(call)
    return handler(call, calls.length - 1)
  }) as unknown as typeof fetch
  return { fetcher, calls }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof LLMError ? e.code : String(e)
  }
}

describe('通用工具', () => {
  it('按条数和字符数分批，单条超长独占一批', () => {
    expect(chunk(['a', 'b', 'c'], 2, 100)).toEqual([['a', 'b'], ['c']])
    expect(chunk(['aaaa', 'bb', 'cccccc'], 10, 5)).toEqual([['aaaa'], ['bb'], ['cccccc']])
  })
  it('mapLimit 保持顺序且并发不超过上限', async () => {
    let active = 0,
      peak = 0
    const out = await mapLimit([5, 1, 3, 2, 4], 2, async (n) => {
      peak = Math.max(peak, ++active)
      await new Promise((r) => setTimeout(r, n))
      active--
      return n * 10
    })
    expect(out).toEqual([50, 10, 30, 20, 40])
    expect(peak).toBe(2)
  })
  it('拒绝白名单以外的地址，网络失败视为引擎不可用', async () => {
    const { fetcher } = fakeFetch(() => {
      throw new TypeError('fetch failed')
    })
    await expect(
      mtFetch('google-free', 'https://evil.example/x', {}, signal(), fetcher, '不可用')
    ).rejects.toThrow('白名单')
    const e = await mtFetch(
      'google-free',
      'https://translate.googleapis.com/x',
      {},
      signal(),
      fetcher,
      '谷歌翻译不可用（可能需要代理）'
    ).catch((e) => e)
    expect(e).toBeInstanceOf(LLMError)
    expect(e.code).toBe('ENGINE_UNAVAILABLE')
    expect(e.message).toContain('可能需要代理')
  })
})

describe('微软翻译（免费）', () => {
  const translateResponse = (call: Call) =>
    json(
      JSON.parse(String(call.init.body)).map((t: { Text: string }) => ({
        translations: [{ text: '译:' + t.Text, to: 'zh-Hans' }]
      }))
    )
  it('token 未过期不重复获取，过期后重新获取', async () => {
    let now = 0
    const { fetcher, calls } = fakeFetch((call) =>
      call.url.includes('/translate/auth') ? new Response('token-1') : translateResponse(call)
    )
    const a = new MicrosoftFreeAdapter(fetcher, () => now)
    expect(await a.translate(['one'], { signal: signal() })).toEqual(['译:one'])
    await a.translate(['two'], { signal: signal() })
    expect(calls.filter((c) => c.url.includes('/auth'))).toHaveLength(1)
    expect(calls[1].init.headers).toMatchObject({ Authorization: 'Bearer token-1' })
    now = 10 * 60 * 1000
    await a.translate(['three'], { signal: signal() })
    expect(calls.filter((c) => c.url.includes('/auth'))).toHaveLength(2)
    expect(calls.every((c) => c.init.redirect === 'error')).toBe(true)
  })
  it('翻译接口 401 时重新获取一次 token 后重试，仍失败报引擎不可用', async () => {
    let first = true
    const ok = fakeFetch((call) => {
      if (call.url.includes('/auth')) return new Response('t')
      if (first) {
        first = false
        return new Response('', { status: 401 })
      }
      return translateResponse(call)
    })
    expect(
      await new MicrosoftFreeAdapter(ok.fetcher).translate(['x'], { signal: signal() })
    ).toEqual(['译:x'])
    expect(ok.calls.filter((c) => c.url.includes('/auth'))).toHaveLength(2)
    const bad = fakeFetch((call) =>
      call.url.includes('/auth') ? new Response('t') : new Response('', { status: 401 })
    )
    expect(
      await codeOf(new MicrosoftFreeAdapter(bad.fetcher).translate(['x'], { signal: signal() }))
    ).toBe('ENGINE_UNAVAILABLE')
  })
  it('150 句拆成两批（每批不超过 100 句），输出顺序与输入一致', async () => {
    const { fetcher, calls } = fakeFetch((call) =>
      call.url.includes('/auth') ? new Response('t') : translateResponse(call)
    )
    const texts = Array.from({ length: 150 }, (_, i) => 's' + i)
    const out = await new MicrosoftFreeAdapter(fetcher).translate(texts, { signal: signal() })
    expect(out).toEqual(texts.map((t) => '译:' + t))
    const batches = calls.filter((c) => !c.url.includes('/auth'))
    expect(batches.map((c) => JSON.parse(String(c.init.body)).length)).toEqual([100, 50])
    expect(batches[0].url).toBe(
      'https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&to=zh-Hans'
    )
  })
  it('429 映射为限流，返回格式异常映射为引擎不可用', async () => {
    const limited = fakeFetch((c) =>
      c.url.includes('/auth') ? new Response('t') : new Response('', { status: 429 })
    )
    expect(
      await codeOf(new MicrosoftFreeAdapter(limited.fetcher).translate(['x'], { signal: signal() }))
    ).toBe('RATE_LIMIT')
    const broken = fakeFetch((c) => (c.url.includes('/auth') ? new Response('t') : json({ a: 1 })))
    expect(
      await codeOf(new MicrosoftFreeAdapter(broken.fetcher).translate(['x'], { signal: signal() }))
    ).toBe('ENGINE_UNAVAILABLE')
  })
})

describe('谷歌翻译（免费）', () => {
  // 录制样本的结构：data[0] 为 [译文段, 原文段, ...] 数组
  const sample = (parts: string[]) =>
    json([parts.map((p) => [p, 'src', null, null, 10]), null, 'en'])
  it('多句以换行连接成一次请求，再按换行切回', async () => {
    const { fetcher, calls } = fakeFetch(() =>
      sample(['静态时序分析验证约束。\n', '然而，工艺偏差带来不确定性。\n', '该方法改进了估计。'])
    )
    const out = await new GoogleFreeAdapter(fetcher).translate(['A.', 'B\nwrapped.', 'C.'], {
      signal: signal()
    })
    expect(out).toEqual([
      '静态时序分析验证约束。',
      '然而，工艺偏差带来不确定性。',
      '该方法改进了估计。'
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t'
    )
    expect(new URLSearchParams(String(calls[0].init.body)).get('q')).toBe('A.\nB wrapped.\nC.')
  })
  it('段数对不上时改为逐句请求', async () => {
    const { fetcher, calls } = fakeFetch((call, i) =>
      i === 0
        ? sample(['合并成一句'])
        : sample(['逐句:' + new URLSearchParams(String(call.init.body)).get('q')])
    )
    const out = await new GoogleFreeAdapter(fetcher).translate(['A', 'B'], { signal: signal() })
    expect(out).toEqual(['逐句:A', '逐句:B'])
    expect(calls).toHaveLength(3)
  })
  it('返回 HTML 或无法解析时报引擎不可用并提示可能需要代理', async () => {
    const { fetcher } = fakeFetch(() => new Response('<html>blocked</html>', { status: 200 }))
    const e = await new GoogleFreeAdapter(fetcher)
      .translate(['A'], { signal: signal() })
      .catch((e) => e)
    expect(e.code).toBe('ENGINE_UNAVAILABLE')
    expect(e.message).toBe('谷歌翻译不可用（可能需要代理）')
  })
})

describe('有道智云', () => {
  it('签名 input：长度 ≤ 20 取原文，否则取前 10 + 长度 + 后 10', () => {
    const short = 'Hello timing world.' // 19
    expect(youdaoInput(short)).toBe(short)
    const long = 'abcdefghij0123456789ABCDEFGHIJ' // 30
    expect(youdaoInput(long)).toBe('abcdefghij30ABCDEFGHIJ')
    // 按字符计长度：10 + 1 + 10 = 21 个汉字
    expect(youdaoInput('一二三四五六七八九十' + '中' + '乙丙丁戊己庚辛壬癸子')).toBe(
      '一二三四五六七八九十21乙丙丁戊己庚辛壬癸子'
    )
  })
  it('请求字段与签名组成正确', async () => {
    const { fetcher, calls } = fakeFetch(() => json({ errorCode: '0', translation: ['你好'] }))
    const out = await new YoudaoAdapter(
      'app-key',
      'app-secret',
      fetcher,
      () => 1700000000123
    ).translate(['Hello'], { signal: signal() })
    expect(out).toEqual(['你好'])
    expect(calls[0].url).toBe('https://openapi.youdao.com/api')
    const body = new URLSearchParams(String(calls[0].init.body))
    expect(Object.fromEntries(body)).toMatchObject({
      q: 'Hello',
      from: 'auto',
      to: 'zh-CHS',
      appKey: 'app-key',
      curtime: '1700000000',
      signType: 'v3'
    })
    const expected = createHash('sha256')
      .update('app-key' + 'Hello' + body.get('salt') + '1700000000' + 'app-secret')
      .digest('hex')
    expect(body.get('sign')).toBe(expected)
    expect(youdaoSign('k', 'Hello', 's', '1', 'x')).toBe(
      createHash('sha256').update('kHellos1x').digest('hex')
    )
  })
  it('错误码映射为中文说明', async () => {
    expect([youdaoError('108'), youdaoError('202'), youdaoError('110')].map((e) => e.code)).toEqual(
      ['AUTH', 'AUTH', 'AUTH']
    )
    expect(youdaoError('110').message).toBe('应用未绑定文本翻译服务')
    expect(youdaoError('401').code).toBe('QUOTA')
    expect(youdaoError('411').code).toBe('RATE_LIMIT')
    expect(youdaoError('999').message).toContain('999')
    const { fetcher } = fakeFetch(() => json({ errorCode: '110' }))
    const e = await new YoudaoAdapter('k', 's', fetcher)
      .translate(['x'], { signal: signal() })
      .catch((e) => e)
    expect([e.code, e.message]).toEqual(['AUTH', '应用未绑定文本翻译服务'])
  })
})

function services(patch: (c: ReturnType<typeof defaultConfig>) => void = () => {}) {
  const cfg = defaultConfig()
  cfg.profiles[0].model = 'mock'
  patch(cfg)
  const config = { get: () => structuredClone(cfg) } as ConfigService,
    secrets = { has: () => true, get: () => '' } as unknown as SecretService
  return { cfg, config, secrets }
}

describe('MtService', () => {
  it('限流按退避重试两次，空译文视为服务异常', async () => {
    vi.useFakeTimers()
    const { config, secrets } = services()
    const s = new MtService(config, secrets)
    const limited = { translate: vi.fn().mockRejectedValue(new LLMError('RATE_LIMIT')) }
    const job = codeOf(s.translate('google-free', ['x'], signal(), limited))
    await vi.runAllTimersAsync()
    expect(await job).toBe('RATE_LIMIT')
    expect(limited.translate).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
    const empty = { translate: vi.fn().mockResolvedValue(['  ']) }
    expect(await codeOf(s.translate('google-free', ['x'], signal(), empty))).toBe('SERVER')
  })
  it('有道未配置时报 NO_PROFILE；测试连接返回结构化结果', async () => {
    const { config } = services()
    const s = new MtService(config, { get: () => '' } as unknown as SecretService)
    expect(() => s.adapter('youdao')).toThrow(LLMError)
    const result = await s.test({ engineId: 'youdao' })
    expect(result).toMatchObject({ ok: false, code: 'NO_PROFILE' })
    await expect(s.test({ engineId: 'unknown' })).rejects.toThrow('翻译引擎无效')
    vi.spyOn(s, 'translate').mockResolvedValue(['你好'])
    expect((await s.test({ engineId: 'microsoft-free' })).ok).toBe(true)
  })
})

describe('翻译分流与回退', () => {
  const req = {
    requestId: 'r',
    sentences: [
      { id: 'a', text: 'First.' },
      { id: 'b', text: 'Second.' }
    ]
  }
  async function run(s: LLMService) {
    const deltas: Record<string, string> = {},
      done = vi.fn(),
      fail = vi.fn()
    await s.translate(
      req,
      (d) => (deltas[d.sentenceId] = d.replace ? d.text : (deltas[d.sentenceId] || '') + d.text),
      done,
      fail
    )
    return { deltas, done, fail }
  }
  it('当前引擎为机器翻译时不走大模型，按句返回整句译文', async () => {
    const { config, secrets } = services(
      (c) => (c.settings.translator = { kind: 'mt', engineId: 'google-free' })
    )
    const s = new LLMService(config, secrets)
    const stream = vi.spyOn(s, 'stream'),
      mt = vi.spyOn(s.mt, 'translate').mockResolvedValue(['第一句。', '第二句。'])
    const { deltas, done, fail } = await run(s)
    expect(stream).not.toHaveBeenCalled()
    expect(mt.mock.calls[0].slice(0, 2)).toEqual(['google-free', ['First.', 'Second.']])
    expect(deltas).toEqual({ a: '第一句。', b: '第二句。' })
    expect(done).toHaveBeenCalledWith('r', undefined)
    expect(fail).not.toHaveBeenCalled()
  })
  it('机器翻译失败时返回错误码与未完成句子', async () => {
    const { config, secrets } = services(
      (c) => (c.settings.translator = { kind: 'mt', engineId: 'google-free' })
    )
    const s = new LLMService(config, secrets)
    vi.spyOn(s.mt, 'translate').mockRejectedValue(
      new LLMError('ENGINE_UNAVAILABLE', '谷歌翻译不可用（可能需要代理）')
    )
    const { fail } = await run(s)
    expect(fail.mock.calls[0][0]).toMatchObject({
      code: 'ENGINE_UNAVAILABLE',
      message: '谷歌翻译不可用（可能需要代理）',
      sentenceIds: ['a', 'b']
    })
  })
  it('开启回退时大模型网络失败，只把未完成的句子交给微软翻译', async () => {
    const { config, secrets } = services((c) => {
      c.settings.translator = { kind: 'llm' }
      c.settings.llmFallbackToMt = true
    })
    const s = new LLMService(config, secrets)
    vi.spyOn(s, 'stream').mockImplementation(async (_p, _m, _s, emit) => {
      emit('[1] 完整\n[2] 部分')
      throw new LLMError('NETWORK')
    })
    const mt = vi.spyOn(s.mt, 'translate').mockResolvedValue(['第二句。'])
    const { deltas, done, fail } = await run(s)
    expect(mt.mock.calls[0].slice(0, 2)).toEqual(['microsoft-free', ['Second.']])
    expect(deltas.a).toBe('完整')
    expect(deltas.b).toBe('第二句。')
    expect(done).toHaveBeenCalledWith('r', { fallback: 'microsoft-free' })
    expect(fail).not.toHaveBeenCalled()
  })
  it('未开启回退或配置类错误不回退', async () => {
    for (const [enabled, code] of [
      [false, 'NETWORK'],
      [true, 'AUTH']
    ] as const) {
      vi.useFakeTimers()
      const { config, secrets } = services((c) => {
        c.settings.translator = { kind: 'llm' }
        c.settings.llmFallbackToMt = enabled
      })
      const s = new LLMService(config, secrets)
      vi.spyOn(s, 'stream').mockRejectedValue(new LLMError(code))
      const mt = vi.spyOn(s.mt, 'translate')
      const job = run(s)
      await vi.runAllTimersAsync()
      const { fail } = await job
      expect(mt).not.toHaveBeenCalled()
      expect(fail.mock.calls[0][0].code).toBe(code)
      vi.useRealTimers()
    }
  })
})
