import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { AppConfig } from '../../../../shared/config'
import { MT_ENGINES, YOUDAO_SECRET_ID, mtEngine, type MtEngineId } from '../../../../shared/mt'
import { profileReady, type SettingsTab } from '../../stores/settingsStore'
import { Modal } from './Modal'
import styles from './SettingsDialog.module.css'
type Result = { ok: boolean; text: string }
const descriptions: Record<MtEngineId, string> = {
  'microsoft-free': '无需配置，国内可直接使用',
  'google-free': '无需配置，国内需要开启系统代理',
  youdao: '官方接口，稳定，需注册获取应用 ID 和应用密钥'
}
const remoteError = (e: unknown) =>
  (e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')
/** 从剪贴板文字中识别有道应用 ID（通常 16 位十六进制）和应用密钥（通常 32 位字母数字） */
export function parseYoudaoKeys(text: string): { appKey?: string; appSecret?: string } {
  return {
    appKey: text.match(/(?<![0-9a-z])[0-9a-f]{16}(?![0-9a-z])/i)?.[0],
    appSecret: text.match(/(?<![0-9a-z])[0-9a-z]{32}(?![0-9a-z])/i)?.[0]
  }
}
export function TranslatorTab({
  draft,
  setDraft,
  keys,
  setKeys,
  savedKeys,
  goTo
}: {
  draft: AppConfig
  setDraft: Dispatch<SetStateAction<AppConfig>>
  keys: Record<string, string>
  setKeys: Dispatch<SetStateAction<Record<string, string>>>
  savedKeys: Record<string, boolean>
  goTo(tab: SettingsTab): void
}) {
  const translator = draft.settings.translator,
    selected = translator.kind === 'mt' ? translator.engineId : 'llm',
    profile = draft.profiles.find((p) => p.id === draft.settings.activeProfileId)
  const [results, setResults] = useState<Record<string, Result>>({}),
    [busy, setBusy] = useState(''),
    [reveal, setReveal] = useState(false),
    [storedSecret, setStoredSecret] = useState(''),
    [clip, setClip] = useState<{ appKey?: string; appSecret?: string } | null>(null)
  const llmOk =
    profileReady({ config: draft, keys: savedKeys }, profile?.id) ||
    (!!profile?.model && !!keys[profile.id])
  const youdaoSecretSaved = !!savedKeys[YOUDAO_SECRET_ID],
    youdaoOk = !!draft.mt.youdaoAppKey && (youdaoSecretSaved || !!keys[YOUDAO_SECRET_ID])
  const choose = (id: MtEngineId | 'llm') =>
    setDraft((d) => ({
      ...d,
      settings: {
        ...d.settings,
        translator: id === 'llm' ? { kind: 'llm' } : { kind: 'mt', engineId: id }
      }
    }))
  const test = async (id: MtEngineId, youdao?: { appKey: string; appSecret?: string }) => {
    setBusy(id)
    try {
      const r = await window.api.testMtEngine({ engineId: id, ...youdao })
      setResults((s) => ({
        ...s,
        [id]: r.ok
          ? { ok: true, text: '✓ 连接正常，响应 ' + r.latencyMs + ' ms' }
          : { ok: false, text: r.message || '连接失败' }
      }))
    } catch (e) {
      setResults((s) => ({ ...s, [id]: { ok: false, text: remoteError(e) } }))
    } finally {
      setBusy('')
    }
  }
  const testYoudao = (appKey = draft.mt.youdaoAppKey, appSecret = keys[YOUDAO_SECRET_ID]) =>
    test('youdao', { appKey, appSecret: appSecret || undefined })
  const toggleReveal = async () => {
    if (reveal) {
      setReveal(false)
      setStoredSecret('')
      return
    }
    if (youdaoSecretSaved && keys[YOUDAO_SECRET_ID] === undefined) {
      try {
        setStoredSecret(await window.api.revealSecret({ profileId: YOUDAO_SECRET_ID }))
      } catch (e) {
        setResults((s) => ({ ...s, youdao: { ok: false, text: remoteError(e) } }))
        return
      }
    }
    setReveal(true)
  }
  const readClipboard = async () => {
    const found = parseYoudaoKeys(await window.api.readClipboard())
    if (found.appKey || found.appSecret) setClip(found)
    else
      setResults((s) => ({
        ...s,
        youdao: { ok: false, text: '剪贴板中没有识别到应用 ID 或应用密钥' }
      }))
  }
  const fillClipboard = () => {
    if (!clip) return
    const appKey = clip.appKey ?? draft.mt.youdaoAppKey,
      appSecret = clip.appSecret ?? keys[YOUDAO_SECRET_ID]
    if (clip.appKey) setDraft((d) => ({ ...d, mt: { ...d.mt, youdaoAppKey: clip.appKey! } }))
    if (clip.appSecret) setKeys((k) => ({ ...k, [YOUDAO_SECRET_ID]: clip.appSecret! }))
    setClip(null)
    if (appKey && (appSecret || youdaoSecretSaved)) void testYoudao(appKey, appSecret)
  }
  const card = (
    id: MtEngineId | 'llm',
    name: string,
    tags: [string, 'free' | 'proxy' | 'key' | 'ok'][],
    description: ReactNode,
    extra?: ReactNode
  ) => (
    <div className={styles.engine} data-selected={selected === id}>
      <div className={styles.engineHead}>
        <label className={styles.engineName}>
          <input
            type="radio"
            name="translator"
            checked={selected === id}
            onChange={() => choose(id)}
          />
          <span>{name}</span>
          {tags.map(([text, tone]) => (
            <span key={text} className={styles.tag} data-tone={tone}>
              {text}
            </span>
          ))}
        </label>
        {id !== 'llm' && (
          <button
            className={styles.small}
            disabled={!!busy}
            onClick={() => void (id === 'youdao' ? testYoudao() : test(id))}
          >
            {busy === id ? '测试中…' : '测试连接'}
          </button>
        )}
      </div>
      <small className={styles.engineDesc}>{description}</small>
      {results[id] && (
        <small className={results[id].ok ? styles.success : styles.error} role="status">
          {results[id].text}
        </small>
      )}
      {extra}
    </div>
  )
  return (
    <>
      <div role="radiogroup" aria-label="翻译时使用" className={styles.engines}>
        <strong>翻译时使用</strong>
        {card(
          'llm',
          '大模型',
          [[llmOk ? '已配置' : '需密钥', llmOk ? 'ok' : 'key']],
          llmOk ? (
            <>
              当前：{profile?.name}
              {profile?.model ? '（' + profile.model + '）' : ''}，支持提示词，专业术语更准确
            </>
          ) : (
            <>
              未配置。
              <button className={styles.link} onClick={() => goTo('model')}>
                前往「模型 API」配置
              </button>
            </>
          )
        )}
        {MT_ENGINES.map((e) =>
          card(
            e.id,
            e.name,
            e.requiresKey
              ? [[youdaoOk ? '已配置' : '需密钥', youdaoOk ? 'ok' : 'key']]
              : e.needsProxyInChina
                ? [
                    ['免费', 'free'],
                    ['需代理', 'proxy']
                  ]
                : [['免费', 'free']],
            descriptions[e.id],
            e.id === 'youdao' && (selected === 'youdao' || !youdaoOk) && (
              <div className={styles.youdao}>
                <div className={styles.row}>
                  <label>
                    应用 ID
                    <input
                      value={draft.mt.youdaoAppKey}
                      maxLength={200}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(ev) =>
                        setDraft((d) => ({ ...d, mt: { ...d.mt, youdaoAppKey: ev.target.value } }))
                      }
                    />
                  </label>
                  <label>
                    应用密钥
                    <div className={styles.row}>
                      <input
                        type={reveal ? 'text' : 'password'}
                        value={keys[YOUDAO_SECRET_ID] ?? (reveal ? storedSecret : '')}
                        placeholder={youdaoSecretSaved ? '••••••••' : '输入应用密钥'}
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(ev) =>
                          setKeys((k) => ({ ...k, [YOUDAO_SECRET_ID]: ev.target.value }))
                        }
                      />
                      <button
                        type="button"
                        aria-label={reveal ? '隐藏应用密钥' : '显示应用密钥'}
                        aria-pressed={reveal}
                        onClick={(ev) => {
                          ev.preventDefault()
                          void toggleReveal()
                        }}
                      >
                        {reveal ? '隐藏' : '显示'}
                      </button>
                    </div>
                  </label>
                </div>
                <div className={styles.youdaoActions}>
                  <a href={mtEngine('youdao').signupUrl} target="_blank" rel="noreferrer">
                    如何获取？
                  </a>
                  <button className={styles.small} onClick={() => void readClipboard()}>
                    从剪贴板识别
                  </button>
                </div>
                <ol className={styles.steps}>
                  <li>打开有道智云 AI 开放平台，用手机号注册并登录</li>
                  <li>完成实名认证</li>
                  <li>在控制台创建应用，接入方式选「API」</li>
                  <li>给应用绑定「文本翻译」服务</li>
                  <li>复制「应用 ID」和「应用密钥」，粘贴到上方</li>
                </ol>
              </div>
            )
          )
        )}
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.settings.llmFallbackToMt}
          onChange={(ev) =>
            setDraft((d) => ({
              ...d,
              settings: { ...d.settings, llmFallbackToMt: ev.target.checked }
            }))
          }
        />
        大模型请求失败时改用微软翻译（免费）
      </label>
      {clip && (
        <Modal
          title="从剪贴板识别"
          onClose={() => setClip(null)}
          footer={
            <>
              <button onClick={() => setClip(null)}>取消</button>
              <button className="primary" onClick={fillClipboard}>
                填入
              </button>
            </>
          }
        >
          <div className={styles.content}>
            识别到
            {clip.appKey && ' 应用 ID ' + clip.appKey.slice(0, 4) + '…' + clip.appKey.slice(-4)}
            {clip.appKey && clip.appSecret && ' 和'}
            {clip.appSecret && ' 应用密钥 ••••'}
            ，是否填入？
          </div>
        </Modal>
      )}
    </>
  )
}
