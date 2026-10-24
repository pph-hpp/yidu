import { it, expect } from 'vitest'
import {
  defaultConfig,
  validateConfig,
  validateProfile,
  buildPrompt
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
