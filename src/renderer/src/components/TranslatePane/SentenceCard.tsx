import { useSourceLink, showSource } from '../../lib/sourceLink'
import { useState } from 'react'
import type { Sentence } from '../../../../shared/types'
import { useTranslateStore } from '../../stores/translateStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUIStore } from '../../stores/uiStore'
import { alternativeEngine, openTranslatorSettings, switchAndRetry } from '../../lib/translator'
import { mtEngine } from '../../../../shared/mt'
import styles from './TranslatePane.module.css'
export function SentenceError({ sentence }: { sentence: Sentence }) {
  const state = useTranslateStore(),
    config = useSettingsStore((s) => s.config)
  if (sentence.status !== 'error' || !config) return null
  const code = sentence.error?.split(':')[0] || '',
    message = sentence.error?.split(':').slice(1).join(':'),
    other = alternativeEngine(config),
    retry = <button onClick={() => state.retry(sentence.id)}>重试</button>,
    settings = <button onClick={openTranslatorSettings}>去设置</button>,
    switchTo = (
      <button onClick={() => void switchAndRetry(other)}>
        {code === 'NO_PROFILE' ? '改用' + mtEngine(other).name : '切换到' + mtEngine(other).name}
      </button>
    )
  return (
    <div className={styles.error}>
      {message}
      {code === 'ENGINE_UNAVAILABLE' ? (
        <>
          {switchTo}
          {retry}
        </>
      ) : code === 'NO_PROFILE' ? (
        <>
          {settings}
          {switchTo}
        </>
      ) : code === 'AUTH' || code === 'MODEL_NOT_FOUND' ? (
        settings
      ) : code === 'QUOTA' ? (
        <a href={mtEngine('youdao').signupUrl} target="_blank" rel="noreferrer">
          打开有道控制台
        </a>
      ) : code === 'CANCELED' ? (
        <>
          {retry}
          {settings}
        </>
      ) : code === 'CONTEXT_TOO_LONG' ? null : (
        retry
      )}
    </div>
  )
}
export function SentenceCard({
  sentence: s,
  paragraphStart
}: {
  sentence: Sentence
  paragraphStart: boolean
}) {
  const hover = useSourceLink((s) => s.hover)
  const state = useTranslateStore(),
    [editing, setEditing] = useState<string | null>(null),
    [edit, setEdit] = useState('')
  const retry = () => {
    state.retry(s.id, editing === s.id ? edit : undefined)
    setEditing(null)
  }
  const copy = (text: string) =>
    void navigator.clipboard
      .writeText(text)
      .then(() => useUIStore.getState().showToast('已复制'))
      .catch(() => useUIStore.getState().showToast('复制失败'))
  const error = (sentence: Sentence) => <SentenceError sentence={sentence} />
  return (
    <article
      className={styles.card}
      data-testid="sentence-card"
      data-linked={hover === s.id}
      onMouseEnter={() => showSource(s.id)}
      onMouseLeave={() => showSource(null)}
      onFocus={() => showSource(s.id)}
      onBlur={() => showSource(null)}
      data-status={s.status}
      data-streaming={s.status === 'streaming'}
      data-paragraph={paragraphStart}
    >
      <span className={styles.number}>{s.index}</span>
      <div className={styles.content}>
        <div className={styles.cardActions}>
          <button
            aria-label={'复制第 ' + s.index + ' 句'}
            disabled={!s.target}
            onClick={() => copy(s.target)}
          >
            复制
          </button>
          <button aria-label={'重译第 ' + s.index + ' 句'} onClick={retry}>
            重译
          </button>
          <button
            aria-label={'编辑第 ' + s.index + ' 句原文'}
            onClick={() => {
              setEditing(s.id)
              setEdit(s.source)
            }}
          >
            编辑
          </button>
        </div>
        <div className={styles.target} aria-label={s.status === 'pending' ? '译文待生成' : '译文'}>
          {s.target || s.status === 'pending'
            ? s.target || (
                <>
                  <div className={styles.skeleton} />
                  <div className={styles.skeleton} />
                </>
              )
            : null}
        </div>
        {editing === s.id ? (
          <textarea
            autoFocus
            aria-label="编辑原文"
            value={edit}
            onChange={(e) => setEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(null)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                retry()
              }
            }}
          />
        ) : (
          <div className={styles.source}>{s.source}</div>
        )}
        {error(s)}
      </div>
    </article>
  )
}
