import { it, expect } from 'vitest'
import {
  defaultConfig,
  validateConfig,
  validateProfile,
  buildPrompt,
  migrateConfig
} from '../../src/shared/config'
it('Base URL 由用户决定：HTTP、局域网、主机名、自建网关一律放行', () => {
  const c = defaultConfig()
  for (const baseUrl of [
    'http://192.168.1.10:8080/v1',
    'http://10.0.0.5:8000/v1',
    'http://gpu-server.local:11434/v1',
    'http://example.org/v1',
    'https://user:secret@gateway.example/v1',
    'http://127.0.0.1:1234/v1',
    'not a url'
  ])
    expect(() => validateProfile({ ...c.profiles[0], baseUrl })).not.toThrow()
  expect(() =>
    validateConfig({
      ...c,
      profiles: [{ ...c.profiles[0], baseUrl: 'http://192.168.1.10:8080/v1' }]
    })
  ).not.toThrow()
  expect(() => validateProfile({ ...c.profiles[0], baseUrl: 'x'.repeat(2049) })).toThrow()
})
it('配置白名单拒绝密钥字段和不存在的模型', () => {
  const c = defaultConfig()
  expect(() => validateConfig(c)).not.toThrow()
  expect(() => validateConfig({ ...c, apiKey: 'secret' })).toThrow()
  expect(() =>
    validateConfig({ ...c, profiles: [{ ...c.profiles[0], apiKey: 'secret' }] })
  ).toThrow()
  expect(() =>
    validateConfig({ ...c, settings: { ...c.settings, activeProfileId: 'missing' } })
  ).toThrow()
})
it('仅拼接已启用背景，固定输出规则最后追加', () => {
  const p = defaultConfig().presets[0]
  p.systemPrompt = 'slack 译为时序裕量'
  p.snippets = [
    { id: 'a', source: 'paper', text: '自定义术语', enabled: true, createdAt: '' },
    { id: 'b', source: 'paper', text: '禁用背景', enabled: false, createdAt: '' }
  ]
  const text = buildPrompt(p)
  expect(text).toContain('时序裕量')
  expect(text).toContain('自定义术语')
  expect(text).not.toContain('禁用背景')
  expect(text).toContain('[编号]')
})
it('模型配置标识仍拒绝原型污染', () => {
  expect(() => validateProfile({ ...defaultConfig().profiles[0], id: '__proto__' })).toThrow()
})

it('文本安全校验继续拒绝 NUL、非字符串及过长输入', async () => {
  const { stringField } = await import('../../src/shared/config')
  expect(() => stringField('text\0artifact')).toThrow('文本参数无效')
  expect(() => stringField({ text: 'value' })).toThrow('文本参数无效')
  expect(() => stringField('long text', 4)).toThrow('文本参数无效')
})
it('旧配置迁移：已填写模型名则用大模型（密钥可选），补齐机器翻译配置', () => {
  const legacy = () => {
    const c = defaultConfig() as unknown as Record<string, unknown> & {
      settings: Record<string, unknown>
      profiles: { model: string; baseUrl: string }[]
    }
    delete c.settings.translator
    delete c.settings.llmFallbackToMt
    delete c.mt
    c.profiles[0].model = 'gpt'
    return c as unknown as ReturnType<typeof defaultConfig>
  }
  const withModel = migrateConfig(legacy())
  expect(withModel.settings.translator).toEqual({ kind: 'llm' })
  expect(withModel.settings.llmFallbackToMt).toBe(false)
  expect(withModel.mt).toEqual({ youdaoAppKey: '', privacyAcked: [], hideFreeHint: false })
  expect(() => validateConfig(withModel)).not.toThrow()
  const lan = legacy()
  lan.profiles[0].baseUrl = 'http://192.168.1.10:8080/v1'
  expect(migrateConfig(lan).settings.translator).toEqual({ kind: 'llm' })
  const noModel = legacy()
  noModel.profiles[0].model = ''
  expect(migrateConfig(noModel).settings.translator).toEqual({
    kind: 'mt',
    engineId: 'microsoft-free'
  })
})
it('非法引擎回退到微软翻译，非法隐私记录被清理；校验拒绝非法翻译引擎配置', () => {
  const c = defaultConfig() as unknown as Record<string, any>
  c.settings.translator = { kind: 'mt', engineId: 'deepl' }
  c.mt = { youdaoAppKey: 'k', privacyAcked: ['google-free', 'bogus', 'google-free'] }
  const m = migrateConfig(c as ReturnType<typeof defaultConfig>)
  expect(m.settings.translator).toEqual({ kind: 'mt', engineId: 'microsoft-free' })
  expect(m.mt).toEqual({ youdaoAppKey: 'k', privacyAcked: ['google-free'], hideFreeHint: false })
  const ok = defaultConfig()
  expect(() => validateConfig(ok)).not.toThrow()
  for (const translator of [
    { kind: 'mt', engineId: 'deepl' },
    { kind: 'llm', profileId: 'default' },
    { kind: 'other' }
  ])
    expect(() =>
      validateConfig({ ...ok, settings: { ...ok.settings, translator } as never })
    ).toThrow()
  expect(() =>
    validateConfig({ ...ok, mt: { ...ok.mt, privacyAcked: ['bogus'] } } as never)
  ).toThrow()
  expect(() => validateConfig({ ...ok, mt: { ...ok.mt, appSecret: 'x' } } as never)).toThrow()
})
it('Base URL 和模型名去掉首尾空白，不改动中间内容；已保存的旧配置读取时修正', async () => {
  const { normalizeProfile } = await import('../../src/shared/config')
  const p = {
    ...defaultConfig().profiles[0],
    baseUrl: '  http://192.168.1.201:8080/v1 \n',
    model: ' Qwen3.8-27B Coder Q8\t'
  }
  expect(normalizeProfile(p)).toMatchObject({
    baseUrl: 'http://192.168.1.201:8080/v1',
    model: 'Qwen3.8-27B Coder Q8'
  })
  expect(normalizeProfile(null)).toBeNull()
  const stored = defaultConfig()
  stored.profiles[0] = p
  expect(migrateConfig(stored).profiles[0]).toMatchObject({
    baseUrl: 'http://192.168.1.201:8080/v1',
    model: 'Qwen3.8-27B Coder Q8'
  })
})
