import { useEffect, useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { defaultConfig } from '../../../../shared/config'
import type { ModelProfile, PromptPreset } from '../../../../shared/types'
import { Modal } from './Modal'
import { Select } from '../Select/Select'
import styles from './SettingsDialog.module.css'
export function SettingsDialog() {
  const saved = useSettingsStore((s) => s.config)!
  const [draft, setDraft] = useState(() => structuredClone(saved)),
    [tab, setTab] = useState('model'),
    [profileId, setProfileId] = useState(saved.settings.activeProfileId || saved.profiles[0].id),
    [presetId, setPresetId] = useState(saved.settings.activePresetId || saved.presets[0].id)
  const [keys, setKeys] = useState<Record<string, string>>({}),
    [hasKey, setHasKey] = useState(false),
    [reveal, setReveal] = useState(false),
    [message, setMessage] = useState(''),
    [ok, setOk] = useState(false),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false)
  const profile = draft.profiles.find((p) => p.id === profileId)!,
    preset = draft.presets.find((p) => p.id === presetId)!
  useEffect(() => {
    let live = true
    void window.api.hasSecret({ profileId }).then((v) => {
      if (live) setHasKey(v)
    })
    setMessage('')
    return () => {
      live = false
    }
  }, [profileId])
  const updateProfile = (patch: Partial<ModelProfile>) =>
    setDraft((d) => ({
      ...d,
      profiles: d.profiles.map((p) => (p.id === profileId ? { ...p, ...patch } : p))
    }))
  const updatePreset = (patch: Partial<PromptPreset>) =>
    setDraft((d) => ({
      ...d,
      presets: d.presets.map((p) => (p.id === presetId ? { ...p, ...patch } : p))
    }))
  const close = () => {
    if (JSON.stringify(draft) !== JSON.stringify(saved) || Object.keys(keys).length)
      setConfirm(true)
    else useSettingsStore.getState().close()
  }
  const save = async () => {
    setBusy(true)
    setMessage('')
    try {
      for (const [id, apiKey] of Object.entries(keys))
        await window.api.setSecret({ profileId: id, apiKey })
      await useSettingsStore.getState().save(draft)
      useSettingsStore.getState().close()
    } catch (e) {
      setOk(false)
      setMessage((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, ''))
    } finally {
      setBusy(false)
    }
  }
  const test = async () => {
    setBusy(true)
    setMessage('')
    try {
      if (keys[profileId] !== undefined)
        await window.api.setSecret({ profileId, apiKey: keys[profileId] })
      const result = await window.api.testConnection({ profile })
      setOk(result.ok)
      setMessage(
        result.ok ? '✓ 连接正常，响应 ' + result.latencyMs + ' ms' : result.message || '连接失败'
      )
    } catch {
      setOk(false)
      setMessage('连接失败，请检查模型配置')
    } finally {
      setBusy(false)
    }
  }
  const tokenEstimate = Math.ceil(
    (preset.systemPrompt.match(/[^\x00-\x7f]/g)?.length || 0) * 1.5 +
      (preset.systemPrompt.match(/[\x00-\x7f]/g)?.length || 0) / 4
  )
  return (
    <>
      <Modal
        title="设置"
        wide
        onClose={close}
        footer={
          <>
            <button onClick={close}>取消</button>
            <button className="primary" disabled={busy} onClick={() => void save()}>
              保存
            </button>
          </>
        }
      >
        <nav className={styles.tabs} role="tablist" aria-label="设置分类">
          {[
            ['model', '模型 API'],
            ['prompt', '系统提示词'],
            ['preferences', '偏好设置']
          ].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className={styles.content}>
          {tab === 'model' && (
            <>
              <div className={styles.row}>
                <label>
                  模型配置
                  <Select
                    value={profileId}
                    options={draft.profiles.map((p) => ({ value: p.id, label: p.name }))}
                    onChange={(value) => {
                      setProfileId(value)
                      setDraft((d) => ({
                        ...d,
                        settings: { ...d.settings, activeProfileId: value }
                      }))
                    }}
                  />
                </label>
                <button
                  onClick={() => {
                    const p = {
                      ...defaultConfig().profiles[0],
                      id: crypto.randomUUID(),
                      name: '新模型'
                    }
                    setDraft((d) => ({
                      ...d,
                      profiles: [...d.profiles, p],
                      settings: { ...d.settings, activeProfileId: p.id }
                    }))
                    setProfileId(p.id)
                  }}
                >
                  新建
                </button>
                <button
                  disabled={draft.profiles.length === 1}
                  onClick={() => {
                    const next = draft.profiles.filter((p) => p.id !== profileId)
                    setDraft((d) => ({
                      ...d,
                      profiles: next,
                      settings: {
                        ...d.settings,
                        activeProfileId: next[0].id,
                        summaryProfileId:
                          d.settings.summaryProfileId === profileId
                            ? null
                            : d.settings.summaryProfileId
                      }
                    }))
                    setProfileId(next[0].id)
                  }}
                >
                  删除
                </button>
              </div>
              <label>
                配置名称
                <input
                  value={profile.name}
                  maxLength={100}
                  onChange={(e) => updateProfile({ name: e.target.value })}
                />
              </label>
              <label>
                接口类型
                <Select<ModelProfile['provider']>
                  value={profile.provider}
                  options={[
                    { value: 'openai-compatible', label: 'OpenAI 兼容接口（推荐）' },
                    { value: 'anthropic', label: 'Anthropic Messages' },
                    { value: 'azure-openai', label: 'Azure OpenAI' }
                  ]}
                  onChange={(provider) =>
                    updateProfile({
                      provider,
                      baseUrl:
                        provider === 'anthropic'
                          ? 'https://api.anthropic.com'
                          : provider === 'azure-openai'
                            ? 'https://YOUR-RESOURCE.openai.azure.com'
                            : 'https://api.openai.com/v1'
                    })
                  }
                />
              </label>
              <label>
                Base URL
                <input
                  value={profile.baseUrl}
                  onChange={(e) => updateProfile({ baseUrl: e.target.value })}
                />
              </label>
              <label>
                API Key
                <div className={styles.row}>
                  <input
                    type={reveal ? 'text' : 'password'}
                    value={keys[profileId] ?? ''}
                    placeholder={hasKey ? '••••••••' : '输入 API Key'}
                    autoComplete="off"
                    onChange={(e) => setKeys((k) => ({ ...k, [profileId]: e.target.value }))}
                  />
                  <button
                    aria-label={reveal ? '隐藏密钥' : '显示密钥'}
                    onClick={() => setReveal(!reveal)}
                  >
                    {reveal ? '隐藏' : '显示'}
                  </button>
                </div>
                <small>密钥加密保存在本机系统钥匙串中，不会写入配置文件。</small>
              </label>
              <div className={styles.row}>
                <label>
                  模型名称
                  <input
                    value={profile.model}
                    placeholder="例如 gpt-4o-mini"
                    onChange={(e) => updateProfile({ model: e.target.value })}
                  />
                </label>
                <label>
                  Temperature
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step=".1"
                    value={profile.temperature}
                    onChange={(e) => updateProfile({ temperature: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div className={styles.row}>
                <label>
                  上下文长度
                  <input
                    type="number"
                    value={profile.contextWindow ?? 64000}
                    min="1"
                    onChange={(e) => updateProfile({ contextWindow: Number(e.target.value) })}
                  />
                </label>
                {profile.provider === 'azure-openai' && (
                  <label>
                    API Version
                    <input
                      value={profile.azureApiVersion || '2024-02-15-preview'}
                      onChange={(e) => updateProfile({ azureApiVersion: e.target.value })}
                    />
                  </label>
                )}
              </div>
              <div className={styles.connection}>
                <button disabled={busy} onClick={() => void test()}>
                  测试连接
                </button>
                <span className={ok ? styles.success : styles.error} role="status">
                  {message}
                </span>
              </div>
            </>
          )}
          {tab === 'prompt' && (
            <>
              <div className={styles.row}>
                <label>
                  提示词预设
                  <Select
                    value={presetId}
                    options={draft.presets.map((p) => ({ value: p.id, label: p.name }))}
                    onChange={(value) => {
                      setPresetId(value)
                      setDraft((d) => ({
                        ...d,
                        settings: { ...d.settings, activePresetId: value }
                      }))
                    }}
                  />
                </label>
                <button
                  onClick={() => {
                    const p = {
                      id: crypto.randomUUID(),
                      name: '新预设',
                      systemPrompt: '',
                      snippets: []
                    }
                    setDraft((d) => ({
                      ...d,
                      presets: [...d.presets, p],
                      settings: { ...d.settings, activePresetId: p.id }
                    }))
                    setPresetId(p.id)
                  }}
                >
                  新建
                </button>
                <button
                  disabled={draft.presets.length === 1}
                  onClick={() => {
                    const next = draft.presets.filter((p) => p.id !== presetId)
                    setDraft((d) => ({
                      ...d,
                      presets: next,
                      settings: { ...d.settings, activePresetId: next[0].id }
                    }))
                    setPresetId(next[0].id)
                  }}
                >
                  删除
                </button>
              </div>
              <label>
                预设名称
                <input
                  value={preset.name}
                  onChange={(e) => updatePreset({ name: e.target.value })}
                />
              </label>
              <label>
                领域背景 / 系统提示词
                <textarea
                  rows={9}
                  value={preset.systemPrompt}
                  onChange={(e) => updatePreset({ systemPrompt: e.target.value })}
                />
                <small className={tokenEstimate > 2000 ? styles.warning : undefined}>
                  约 {tokenEstimate} token
                  {tokenEstimate > 2000 ? ' · 提示词较长，会增加每次翻译的费用' : ''}
                </small>
              </label>
              <strong>来自文章总结的背景</strong>
              {preset.snippets.length ? (
                preset.snippets.map((s) => (
                  <div className={styles.snippet} key={s.id}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) =>
                          updatePreset({
                            snippets: preset.snippets.map((v) =>
                              v.id === s.id ? { ...v, enabled: e.target.checked } : v
                            )
                          })
                        }
                      />
                      {s.source.split(/[\\/]/).at(-1)} 的总结
                    </label>
                    <details>
                      <summary>查看背景</summary>
                      <p>{s.text}</p>
                    </details>
                    <button
                      onClick={() =>
                        updatePreset({ snippets: preset.snippets.filter((v) => v.id !== s.id) })
                      }
                    >
                      删除背景
                    </button>
                  </div>
                ))
              ) : (
                <small>还没有背景。用「全文总结」生成后可以加入这里。</small>
              )}
              <small>启用的背景会追加在系统提示词之后，一起发送给模型。</small>
            </>
          )}
          {tab === 'preferences' && (
            <>
              <label>
                目标语言
                <Select
                  value="zh-CN"
                  disabled
                  options={[{ value: 'zh-CN', label: '简体中文' }]}
                  onChange={() => {}}
                />
              </label>
              <label>
                默认翻译模式
                <Select
                  value={draft.settings.defaultMode}
                  options={[
                    { value: 'sentence', label: '逐句' },
                    { value: 'paragraph', label: '整段' }
                  ]}
                  onChange={(defaultMode) =>
                    setDraft((d) => ({
                      ...d,
                      settings: { ...d.settings, defaultMode }
                    }))
                  }
                />
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft.settings.autoTranslateOnSelect}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      settings: { ...d.settings, autoTranslateOnSelect: e.target.checked }
                    }))
                  }
                />
                选中文字后自动翻译
              </label>
              <label>
                全文总结模型
                <Select
                  value={draft.settings.summaryProfileId || ''}
                  options={[
                    { value: '', label: '使用当前翻译模型' },
                    ...draft.profiles.map((p) => ({ value: p.id, label: p.name }))
                  ]}
                  onChange={(value) =>
                    setDraft((d) => ({
                      ...d,
                      settings: { ...d.settings, summaryProfileId: value || null }
                    }))
                  }
                />
              </label>
            </>
          )}
          {tab !== 'model' && message && (
            <p className={styles.error} role="alert">
              {message}
            </p>
          )}
        </div>
      </Modal>
      {confirm && (
        <Modal
          title="放弃对设置的修改？"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <button onClick={() => setConfirm(false)}>继续编辑</button>
              <button className="primary" onClick={() => useSettingsStore.getState().close()}>
                放弃修改
              </button>
            </>
          }
        >
          <div className={styles.content}>尚未保存的修改将丢失。</div>
        </Modal>
      )}
    </>
  )
}
