import { it, expect } from 'vitest'
import {
  defaultConfig,
  validateConfig,
  validateProfile,
  buildPrompt,
  migrateConfig
} from '../../src/shared/config'
it('配置白名单拒绝密钥、非法 URL 和不存在的模型', () => {
  const c = defaultConfig()
  expect(() => validateConfig(c)).not.toThrow()
  for (const baseUrl of [
    'http://example.org',
    'file:///etc/passwd',
    'https://user:secret@example.org',
    'javascript:alert(1)'
  ])
    expect(() => validateProfile({ ...c.profiles[0], baseUrl })).toThrow()
  expect(() =>
    validateProfile({ ...c.profiles[0], baseUrl: 'http://127.0.0.1:1234/v1' })
  ).not.toThrow()
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
it('显式 HTTP 例外仅匹配完整 Base URL，不能扩展其他主机/端口/路径', () => {
  const profile = defaultConfig().profiles[0],
    allowed = ['http://example.org:8080/v1']
  expect(() => validateProfile({ ...profile, baseUrl: allowed[0] }, allowed)).not.toThrow()
  for (const baseUrl of [
    'http://other.example/v1',
    'http://example.org:8081/v1',
    'http://example.org:8080/other',
    'http://example.org:8080/v1?next=evil'
  ])
    expect(() => validateProfile({ ...profile, baseUrl }, allowed)).toThrow()
  expect(() => validateProfile({ ...profile, id: '__proto__' })).toThrow()
})

it('文本安全校验继续拒绝 NUL、非字符串及过长输入', async () => {
  const { stringField } = await import('../../src/shared/config')
  expect(() => stringField('text\0artifact')).toThrow('文本参数无效')
  expect(() => stringField({ text: 'value' })).toThrow('文本参数无效')
  expect(() => stringField('long text', 4)).toThrow('文本参数无效')
})
it('旧配置迁移：按当前大模型是否可用决定翻译引擎，补齐机器翻译配置', () => {
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
  const withKey = migrateConfig(legacy(), () => true)
  expect(withKey.settings.translator).toEqual({ kind: 'llm' })
  expect(withKey.settings.llmFallbackToMt).toBe(false)
  expect(withKey.mt).toEqual({ youdaoAppKey: '', privacyAcked: [], hideFreeHint: false })
  expect(() => validateConfig(withKey)).not.toThrow()
  expect(migrateConfig(legacy(), () => false).settings.translator).toEqual({
    kind: 'mt',
    engineId: 'microsoft-free'
  })
  const local = legacy()
  local.profiles[0].baseUrl = 'http://127.0.0.1:11434/v1'
  expect(migrateConfig(local, () => false).settings.translator).toEqual({ kind: 'llm' })
  const noModel = legacy()
  noModel.profiles[0].model = ''
  expect(migrateConfig(noModel, () => true).settings.translator.kind).toBe('mt')
})
it('非法引擎回退到微软翻译，非法隐私记录被清理；校验拒绝非法翻译引擎配置', () => {
  const c = defaultConfig() as unknown as Record<string, any>
  c.settings.translator = { kind: 'mt', engineId: 'deepl' }
  c.mt = { youdaoAppKey: 'k', privacyAcked: ['google-free', 'bogus', 'google-free'] }
  const m = migrateConfig(c as ReturnType<typeof defaultConfig>, () => true)
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
