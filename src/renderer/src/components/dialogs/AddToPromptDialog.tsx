import { useEffect, useState } from 'react'
import { useSummaryStore } from '../../stores/summaryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useDocStore } from '../../stores/docStore'
import { useUIStore } from '../../stores/uiStore'
import { Modal } from './Modal'
import styles from './BusinessDialog.module.css'
export function AddToPromptDialog() {
  const store = useSummaryStore(),
    s = store.activeKey ? store.jobs[store.activeKey] : undefined,
    [brief, setBrief] = useState(true),
    [duplicate, setDuplicate] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    setBrief(true)
    setDuplicate(false)
    setError('')
  }, [s?.jobId, s?.promptOpen])
  if (!store.visible || store.cancellingKey || !s?.promptOpen || s.status !== 'saved' || !s.result)
    return null
  const text =
    brief && s.result.keyTerms && s.result.question
      ? s.result.question + '\n\n' + s.result.keyTerms
      : s.result.markdown
  const add = async (replace?: boolean) => {
    const config = useSettingsStore.getState().config!,
      preset =
        config.presets.find((p) => p.id === config.settings.activePresetId) || config.presets[0]
    if (replace === undefined && preset.snippets.some((n) => n.source === s.file!.path)) {
      setDuplicate(true)
      return
    }
    setBusy(true)
    try {
      const snippet = {
        id: crypto.randomUUID(),
        source: s.file!.path,
        text,
        enabled: true,
        createdAt: new Date().toISOString()
      }
      await useSettingsStore.getState().save({
        ...config,
        presets: config.presets.map((p) =>
          p.id === preset.id
            ? {
                ...p,
                snippets: [
                  ...(replace ? p.snippets.filter((n) => n.source !== s.file!.path) : p.snippets),
                  snippet
                ]
              }
            : p
        )
      })
      useUIStore.getState().showToast('已加入提示词')
      store.close()
    } catch {
      setError('保存背景失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  const footer = duplicate ? (
    <>
      <button onClick={() => setDuplicate(false)}>取消</button>
      <button disabled={busy} onClick={() => void add(false)}>
        保留两份
      </button>
      <button className="primary" disabled={busy} onClick={() => void add(true)}>
        替换
      </button>
    </>
  ) : (
    <>
      <button onClick={store.close}>暂不加入</button>
      <button className="primary" disabled={busy} onClick={() => void add()}>
        加入提示词
      </button>
    </>
  )
  return (
    <Modal
      title={duplicate ? '这个文件已有背景' : '总结已保存'}
      onClose={store.close}
      footer={footer}
    >
      <div className={styles.content}>
        <div className={styles.path}>
          <span title={s.savedPath}>{s.savedPath}</span>
          <button
            onClick={() =>
              void window.api
                .openPath({ path: s.savedPath })
                .then((file) => useDocStore.getState().open(file))
                .catch(() => setError('无法打开总结文件'))
            }
          >
            打开
          </button>
        </div>
        <div className={styles.snippetPreview}>{text}</div>
        <p>
          {duplicate
            ? '要替换已有背景，还是保留两份？'
            : '要把这份总结加入系统提示词，作为后续翻译的领域背景吗？'}
        </p>
        {!duplicate && (
          <label className={styles.check}>
            <input type="checkbox" checked={brief} onChange={(e) => setBrief(e.target.checked)} />
            只加入「关键术语」和「研究问题」部分（更省 token）
          </label>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
