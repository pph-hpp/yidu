import { it, expect, vi, afterEach, describe } from 'vitest'
vi.mock('electron', () => ({ net: { fetch: vi.fn() }, app: { isPackaged: true } }))
import { createHash } from 'node:crypto'
import { chunk, mapLimit, mtFetch } from '../../src/main/services/mt/adapter'
import { MicrosoftFreeAdapter, parseBingParams } from '../../src/main/services/mt/microsoft-free'
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

describe('微软翻译（免费，Bing 网页接口）', () => {
  // 录制样本的关键片段：翻译页面中的参数与 ttranslatev3 的响应
  const page = (token = 'tok-1') =>
    new Response(
      '<html><script>var params_AbusePreventionHelper = [1792835580055,"' +
        token +
        '",3600000];_G={IG:"500ED8E702AB41DD91D3A68AAB3994C9"};</script>' +
        '<div id="tta_outGDCont" data-iid="translator.5023"></div></html>'
    )
  const translated = (text: string) =>
    json([{ translations: [{ text, to: 'zh-Hans' }], detectedLanguage: { language: 'en' } }])
  const form = (call: Call) => new URLSearchParams(String(call.init.body))
  it('解析页面参数，缺少任一参数时返回 undefined', async () => {
    expect(parseBingParams(await page().text())).toEqual({
      key: '1792835580055',
      token: 'tok-1',
      interval: 3600000,
      ig: '500ED8E702AB41DD91D3A68AAB3994C9',
      iid: 'translator.5023'
    })
    expect(parseBingParams('<html>captcha</html>')).toBeUndefined()
  })
  it('多句以空行连接成一次请求再切回；页面参数缓存到过期；www 被重定向时改用 cn.bing.com', async () => {
    let now = 0
    const { fetcher, calls } = fakeFetch((call) => {
      // 国内 www.bing.com 会重定向，redirect: 'error' 下 fetch 直接失败
      if (call.url === 'https://www.bing.com/translator')
        throw new TypeError("Attempted to redirect, but redirect policy was 'error'")
      if (call.url.endsWith('/translator')) return page()
      return translated(
        form(call)
          .get('text')!
          .split('\n\n')
          .map((t) => '译:' + t)
          .join('\n\n')
      )
    })
    const a = new MicrosoftFreeAdapter(fetcher, () => now)
    expect(await a.translate(['One.', 'Two\nwrapped.'], { signal: signal() })).toEqual([
      '译:One.',
      '译:Two wrapped.'
    ])
    await a.translate(['Three.'], { signal: signal() })
    expect(calls.filter((c) => c.url.endsWith('/translator')).map((c) => c.url)).toEqual([
      'https://www.bing.com/translator',
      'https://cn.bing.com/translator'
    ])
    expect(calls.every((c) => c.init.redirect === 'error')).toBe(true)
    const api = calls.filter((c) => c.url.includes('/ttranslatev3'))
    expect(api[0].url).toBe(
      'https://cn.bing.com/ttranslatev3?isVertical=1&IG=500ED8E702AB41DD91D3A68AAB3994C9&IID=translator.5023.1'
    )
    expect(api[1].url.endsWith('IID=translator.5023.2')).toBe(true)
    expect(api.every((c) => c.init.redirect === 'error')).toBe(true)
    expect(Object.fromEntries(form(api[0]))).toMatchObject({
      fromLang: 'auto-detect',
      to: 'zh-Hans',
      text: 'One.\n\nTwo wrapped.',
      token: 'tok-1',
      key: '1792835580055'
    })
    // 过期后重新取参数，优先上次成功的 cn.bing.com
    now = 60 * 60 * 1000
    await a.translate(['Four.'], { signal: signal() })
    expect(calls.filter((c) => c.url.endsWith('/translator')).at(-1)!.url).toBe(
      'https://cn.bing.com/translator'
    )
    expect(calls.filter((c) => c.url.endsWith('/translator'))).toHaveLength(3)
  })
  it('空行没有保留时改为逐句请求', async () => {
    const { fetcher, calls } = fakeFetch((call) =>
      call.url.endsWith('/translator')
        ? page()
        : translated(
            form(call).get('text')!.includes('\n') ? '合并成一句' : '逐句:' + form(call).get('text')
          )
    )
    expect(
      await new MicrosoftFreeAdapter(fetcher).translate(['A', 'B'], { signal: signal() })
    ).toEqual(['逐句:A', '逐句:B'])
    expect(calls.filter((c) => c.url.includes('/ttranslatev3'))).toHaveLength(3)
  })
  it('token 失效（返回错误对象）时重新获取页面参数并重试一次，仍失败报引擎不可用', async () => {
    let pages = 0
    const ok = fakeFetch((call) => {
      if (call.url.endsWith('/translator')) return page('tok-' + ++pages)
      return form(call).get('token') === 'tok-1'
        ? json({ statusCode: 400, errorMessage: '' })
        : translated('译文')
    })
    expect(
      await new MicrosoftFreeAdapter(ok.fetcher).translate(['x'], { signal: signal() })
    ).toEqual(['译文'])
    expect(pages).toBe(2)
    const bad = fakeFetch((call) =>
      call.url.endsWith('/translator') ? page() : json({ ShowCaptcha: true })
    )
    expect(
      await codeOf(new MicrosoftFreeAdapter(bad.fetcher).translate(['x'], { signal: signal() }))
    ).toBe('ENGINE_UNAVAILABLE')
    const noParams = fakeFetch(() => new Response('<html>blocked</html>'))
    expect(
      await codeOf(
        new MicrosoftFreeAdapter(noParams.fetcher).translate(['x'], { signal: signal() })
      )
    ).toBe('ENGINE_UNAVAILABLE')
  })
  it('429 映射为限流；两个站点都不可用时报引擎不可用', async () => {
    const limited = fakeFetch((c) =>
      c.url.endsWith('/translator') ? page() : new Response('', { status: 429 })
    )
    expect(
      await codeOf(new MicrosoftFreeAdapter(limited.fetcher).translate(['x'], { signal: signal() }))
    ).toBe('RATE_LIMIT')
    const offline = fakeFetch(() => {
      throw new TypeError('fetch failed')
    })
    expect(
      await codeOf(new MicrosoftFreeAdapter(offline.fetcher).translate(['x'], { signal: signal() }))
    ).toBe('ENGINE_UNAVAILABLE')
    expect(offline.calls.map((c) => c.url)).toEqual([
      'https://www.bing.com/translator',
      'https://cn.bing.com/translator'
    ])
  })
  it('超过 1000 字符的输入拆成多次请求', async () => {
    const { fetcher, calls } = fakeFetch((call) =>
      call.url.endsWith('/translator')
        ? page()
        : translated(
            form(call)
              .get('text')!
              .split('\n\n')
              .map(() => '段')
              .join('\n\n')
          )
    )
    const texts = Array.from({ length: 6 }, (_, i) => String(i).repeat(300))
    expect(
      await new MicrosoftFreeAdapter(fetcher).translate(texts, { signal: signal() })
    ).toHaveLength(6)
    expect(calls.filter((c) => c.url.includes('/ttranslatev3')).length).toBeGreaterThan(1)
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
