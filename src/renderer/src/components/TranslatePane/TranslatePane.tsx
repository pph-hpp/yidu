import { SentenceCard, SentenceError } from './SentenceCard'
import { ModeSwitch } from './ModeSwitch'
import { FreeInput } from './FreeInput'
import { useEffect, useRef, useState } from 'react'
import { useTranslateStore } from '../../stores/translateStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUIStore } from '../../stores/uiStore'
import { Icon } from '../Icon'
import styles from './TranslatePane.module.css'
export function TranslatePane() {
  const state = useTranslateStore(),
    config = useSettingsStore((s) => s.config)
  const [hasKey, setHasKey] = useState(false)
  const list = useRef<HTMLDivElement>(null),
    auto = useRef(true),
    lastScroll = useRef(0)
  useEffect(() => {
    auto.current = true
  }, [state.requestId])
  useEffect(() => {
    if (auto.current) {
      const el = list.current?.querySelector('[data-streaming=true]')
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [state.sentences])
  useEffect(() => {
    let alive = true
    const id = config?.settings.activeProfileId
    if (id)
      void window.api.hasSecret({ profileId: id }).then((v) => {
        if (alive) setHasKey(v)
      })
    return () => {
      alive = false
    }
  }, [config])
  const copy = (text: string) =>
    void navigator.clipboard
      .writeText(text)
      .then(() => useUIStore.getState().showToast('已复制'))
      .catch(() => useUIStore.getState().showToast('复制失败'))
  return (
    <aside className={styles.pane} aria-label="翻译栏">
      <div className={styles.header}>
        <div className={styles.row}>
          <strong>翻译</strong>
          <ModeSwitch />
        </div>
        <div className={styles.tags}>
          <span className={styles.model}>
            <i
              data-active={hasKey}
              data-error={state.sentences.some((s) => s.status === 'error')}
            />
            <select
              aria-label="当前模型"
              value={config?.settings.activeProfileId || ''}
              onChange={(e) => {
                if (config)
                  void useSettingsStore.getState().save({
                    ...config,
                    settings: { ...config.settings, activeProfileId: e.target.value }
                  })
              }}
            >
              {config?.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.model || p.name}
                </option>
              ))}
            </select>
          </span>
          <select
            className={styles.preset}
            aria-label="当前提示词"
            value={config?.settings.activePresetId || ''}
            onChange={(e) => {
              if (config)
                void useSettingsStore.getState().save({
                  ...config,
                  settings: { ...config.settings, activePresetId: e.target.value }
                })
            }}
          >
            {config?.presets.map((p) => (
              <option key={p.id} value={p.id}>
                提示词：{p.name}
              </option>
            ))}
          </select>
          <span>已选 {state.sentences.length} 句</span>
        </div>
      </div>
      <div
        className={styles.list}
        ref={list}
        onWheel={(e) => {
          if (e.deltaY < 0) auto.current = false
        }}
        onScroll={(e) => {
          if (e.currentTarget.scrollTop < lastScroll.current - 2) auto.current = false
          lastScroll.current = e.currentTarget.scrollTop
        }}
      >
        {!state.sentences.length ? (
          <div className={styles.empty}>
            <Icon name="translate" size={32} />
            <p>在左侧选中文字，这里会逐句显示译文</p>
          </div>
        ) : state.mode === 'paragraph' ? (
          <article className={styles.paragraph}>
            <div className={styles.target}>
              {state.sentences.map((s) => s.target).join(' ') || '翻译中…'}
            </div>
            <hr />
            <div className={styles.source}>{state.sentences.map((s) => s.source).join(' ')}</div>
            {state.sentences.map((s) => (
              <div key={s.id}>
                <SentenceError sentence={s} />
              </div>
            ))}
          </article>
        ) : (
          state.sentences.map((s, i) => (
            <SentenceCard
              key={s.id}
              sentence={s}
              paragraphStart={i > 0 && state.paragraphStarts.includes(i)}
            />
          ))
        )}
      </div>
      <div className={styles.footer}>
        <div className={styles.actions}>
          <button
            disabled={!state.sentences.some((s) => s.target)}
            onClick={() => copy(state.sentences.map((s) => s.target).join(' '))}
          >
            <Icon name="copy" size={14} />
            复制译文
          </button>
          <button disabled={!state.sentences.length} onClick={() => state.retry()}>
            重新翻译
          </button>
          <button
            aria-pressed={state.locked}
            className={state.locked ? styles.locked : undefined}
            onClick={state.toggleLock}
          >
            <Icon name="lock" size={14} />
            {state.locked ? '已锁定' : '锁定'}
          </button>
        </div>
        <FreeInput />
      </div>
    </aside>
  )
}
