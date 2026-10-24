import type { AppSettings, ModelProfile, PromptPreset, RecentFile } from './types'
export interface AppConfig {
  settings: AppSettings
  profiles: ModelProfile[]
  presets: PromptPreset[]
  recent: RecentFile[]
}
export const DEFAULT_PROMPT =
  '你是专业的学术论文译者。请将英文学术文本翻译为准确、通顺、符合中文学术习惯的简体中文。\n- 术语使用学科内通用译法，专有缩写首次出现时保留英文，如“卷积神经网络（CNN）”。\n- 保持原文的逻辑关系和语气，不增删信息。'
export const OUTPUT_FORMAT =
  '\n\n## 输出格式（必须遵守）\n将用户给出的编号句子逐句翻译为简体中文。\n每句一行，格式为 "[编号] 译文"，编号与输入一一对应，不要合并、拆分或省略句子。\n只输出译文，不要解释、不要重复原文。公式、变量名、引用编号原样保留。'
export function buildPrompt(preset: PromptPreset): string {
  const snippets = preset.snippets.filter((s) => s.enabled).map((s) => s.text)
  return (
    (preset.systemPrompt || DEFAULT_PROMPT) +
    (snippets.length ? '\n\n## 文献背景（来自总结）\n' + snippets.join('\n') : '') +
    OUTPUT_FORMAT
  )
}
export function defaultConfig(): AppConfig {
  return {
    settings: {
      activeProfileId: 'default',
      activePresetId: 'academic',
      summaryProfileId: null,
      targetLang: 'zh-CN',
      defaultMode: 'sentence',
      autoTranslateOnSelect: true,
      rightPaneWidth: 420,
      zoom: 1
    },
    profiles: [
      {
        id: 'default',
        name: '默认模型',
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        model: '',
        temperature: 0.2,
        contextWindow: 64000
      }
    ],
    presets: [{ id: 'academic', name: '通用学术', systemPrompt: DEFAULT_PROMPT, snippets: [] }],
    recent: []
  }
}
function record(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数格式错误')
}
export function stringField(value: unknown, max = 20000): asserts value is string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0'))
    throw new Error('文本参数无效')
}
export function validId(value: unknown): asserts value is string {
  stringField(value, 200)
  if (['__proto__', 'prototype', 'constructor'].includes(value) || !/^[\w:.-]+$/.test(value))
    throw new Error('标识无效')
}
export function validateProfile(
  value: unknown,
  approvedHttp: readonly string[] = []
): asserts value is ModelProfile {
  record(value)
  validId(value.id)
  stringField(value.name, 100)
  stringField(value.model, 200)
  stringField(value.baseUrl, 2048)
  if (!['openai-compatible', 'anthropic', 'azure-openai'].includes(value.provider as string))
    throw new Error('接口类型无效')
  const url = new URL(value.baseUrl)
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
          approvedHttp.some(
            (s) => new URL(s).href.replace(/\/$/, '') === url.href.replace(/\/$/, '')
          ))
      ))
  )
    throw new Error('Base URL 必须为 HTTPS，只有本地模型可使用 HTTP')
  if (
    typeof value.temperature !== 'number' ||
    !Number.isFinite(value.temperature) ||
    value.temperature < 0 ||
    value.temperature > 2
  )
    throw new Error('Temperature 必须在 0～2 之间')
  for (const key of ['maxTokens', 'contextWindow'])
    if (
      value[key] !== undefined &&
      (!Number.isInteger(value[key]) ||
        (value[key] as number) < 1 ||
        (value[key] as number) > 2000000)
    )
      throw new Error('Token 数无效')
  if (value.azureApiVersion !== undefined) stringField(value.azureApiVersion, 100)
  if (
    Object.keys(value).some(
      (k) =>
        ![
          'id',
          'name',
          'model',
          'provider',
          'baseUrl',
          'temperature',
          'maxTokens',
          'contextWindow',
          'azureApiVersion'
        ].includes(k)
    )
  )
    throw new Error('模型配置包含未知字段')
}
export function validateConfig(
  value: unknown,
  approvedHttp: readonly string[] = []
): asserts value is AppConfig {
  record(value)
  if (Object.keys(value).some((k) => !['settings', 'profiles', 'presets', 'recent'].includes(k)))
    throw new Error('配置包含未知字段')
  if (!Array.isArray(value.profiles) || !value.profiles.length || value.profiles.length > 100)
    throw new Error('至少保留一个模型')
  value.profiles.forEach((p) => validateProfile(p, approvedHttp))
  if (new Set(value.profiles.map((p) => p.id)).size !== value.profiles.length)
    throw new Error('模型标识重复')
  if (!Array.isArray(value.presets) || !value.presets.length || value.presets.length > 100)
    throw new Error('至少保留一个提示词')
  for (const p of value.presets) {
    record(p)
    validId(p.id)
    stringField(p.name, 100)
    stringField(p.systemPrompt, 100000)
    if (!Array.isArray(p.snippets) || p.snippets.length > 200) throw new Error('背景条目过多')
    for (const s of p.snippets) {
      record(s)
      validId(s.id)
      stringField(s.source, 32767)
      stringField(s.text, 500000)
      stringField(s.createdAt, 100)
      if (typeof s.enabled !== 'boolean') throw new Error('背景开关无效')
      if (Object.keys(s).some((k) => !['id', 'source', 'text', 'enabled', 'createdAt'].includes(k)))
        throw new Error('背景字段无效')
    }
    if (Object.keys(p).some((k) => !['id', 'name', 'systemPrompt', 'snippets'].includes(k)))
      throw new Error('提示词字段无效')
  }
  if (new Set(value.presets.map((p) => p.id)).size !== value.presets.length)
    throw new Error('预设标识重复')
  const s = value.settings
  record(s)
  if (
    Object.keys(s).some(
      (k) =>
        ![
          'activeProfileId',
          'activePresetId',
          'summaryProfileId',
          'targetLang',
          'defaultMode',
          'autoTranslateOnSelect',
          'rightPaneWidth',
          'zoom'
        ].includes(k)
    )
  )
    throw new Error('偏好字段无效')
  if (
    s.targetLang !== 'zh-CN' ||
    !['sentence', 'paragraph'].includes(s.defaultMode as string) ||
    typeof s.autoTranslateOnSelect !== 'boolean'
  )
    throw new Error('偏好设置无效')
  if (
    typeof s.rightPaneWidth !== 'number' ||
    !Number.isFinite(s.rightPaneWidth) ||
    s.rightPaneWidth < 320 ||
    s.rightPaneWidth > 640 ||
    typeof s.zoom !== 'number' ||
    !Number.isFinite(s.zoom) ||
    s.zoom < 0.5 ||
    s.zoom > 3
  )
    throw new Error('界面尺寸无效')
  for (const k of ['activeProfileId', 'summaryProfileId'])
    if (s[k] !== null && !value.profiles.some((p) => p.id === s[k])) throw new Error('模型不存在')
  if (s.activePresetId !== null && !value.presets.some((p) => p.id === s.activePresetId))
    throw new Error('预设不存在')
  if (!Array.isArray(value.recent) || value.recent.length > 10) throw new Error('最近文件无效')
  for (const f of value.recent) {
    record(f)
    stringField(f.path, 32767)
    stringField(f.name, 32767)
    if (!['pdf', 'md'].includes(f.kind as string) || typeof f.mtimeMs !== 'number')
      throw new Error('最近文件无效')
  }
}
