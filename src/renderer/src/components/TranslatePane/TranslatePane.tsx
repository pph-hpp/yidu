import { SentenceCard, SentenceError } from './SentenceCard'
import { ModeSwitch } from './ModeSwitch'
import { FreeInput } from './FreeInput'
import { useEffect, useRef } from 'react'
import { useTranslateStore } from '../../stores/translateStore'
import {
  mtReady,
  profileReady,
  translatorReady,
  useSettingsStore
} from '../../stores/settingsStore'
import { MT_ENGINES, isMtEngineId, mtEngine } from '../../../../shared/mt'
import { switchTranslator } from '../../lib/translator'
import { useUIStore } from '../../stores/uiStore'
import { Icon } from '../Icon'
import { Select } from '../Select/Select'
import styles from './TranslatePane.module.css'
export function TranslatePane() {
  const state = useTranslateStore(),
    config = useSettingsStore((s) => s.config),
    ready = useSettingsStore(translatorReady),
    keys = useSettingsStore((s) => s.keys)
  const translator = config?.settings.translator,
    usingMt = translator?.kind === 'mt',
    freeEngine = usingMt && !mtEngine(translator.engineId).requiresKey
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
  const engineOptions = config
    ? [
        ...config.profiles.map((p) => ({
          value: 'llm:' + p.id,
          label: (p.model || p.name) + (profileReady({ config, keys }, p.id) ? '' : '（未配置）'),
          group: '大模型'
        })),
        ...MT_ENGINES.map((e) => ({
          value: 'mt:' + e.id,
          label: e.name + (mtReady({ config, keys }, e.id) ? '' : '（未配置）'),
          group: '机器翻译'
        }))
      ]
    : []
  const engineValue = !translator
    ? ''
    : translator.kind === 'mt'
      ? 'mt:' + translator.engineId
      : 'llm:' + config!.settings.activeProfileId
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
          <Select
            variant="chip"
            className={styles.model}
            aria-label="翻译引擎"
            prefix={
              <i
                data-active={ready}
                data-error={state.sentences.some((s) => s.status === 'error')}
              />
            }
            value={engineValue}
            options={engineOptions}
            onChange={(value) => {
              const [kind, id] = [
                value.slice(0, value.indexOf(':')),
                value.slice(value.indexOf(':') + 1)
              ]
              void (kind === 'mt' && isMtEngineId(id)
                ? switchTranslator({ kind: 'mt', engineId: id })
                : switchTranslator({ kind: 'llm' }, id))
            }}
          />
          <Select
            variant="chip"
            tone="accent"
            className={styles.preset}
            aria-label="当前提示词"
            disabled={usingMt}
            title={usingMt ? '机器翻译引擎不支持提示词' : undefined}
            value={config?.settings.activePresetId || ''}
            options={(config?.presets ?? []).map((p) => ({
              value: p.id,
              label: '提示词：' + p.name
            }))}
            onChange={(value) => {
              if (config)
                void useSettingsStore.getState().save({
                  ...config,
                  settings: { ...config.settings, activePresetId: value }
                })
            }}
          />
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
        {freeEngine && !config?.mt.hideFreeHint && (
          <p className={styles.freeHint}>
            <span>正在使用免费引擎，配置大模型术语更准确</span>
            <button onClick={() => useSettingsStore.getState().open('model')}>去配置</button>
            <button
              aria-label="不再显示此提示"
              className={styles.hintClose}
              onClick={() =>
                config &&
                void useSettingsStore
                  .getState()
                  .save({ ...config, mt: { ...config.mt, hideFreeHint: true } })
              }
            >
              <Icon name="close" size={14} />
            </button>
          </p>
        )}
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
