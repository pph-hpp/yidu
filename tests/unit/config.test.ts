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
