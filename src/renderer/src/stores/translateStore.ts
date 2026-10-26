import { create } from 'zustand'
import type { Sentence, TranslateMode } from '../../../shared/types'
import { textClean } from '../lib/textClean'
import { splitSentences } from '../lib/sentenceSplit'
import { useSettingsStore } from './settingsStore'
import { cacheGet, cacheKey, cachePut, engineTag } from '../lib/translateCache'
import { useUIStore } from './uiStore'
import { mtEngine } from '../../../shared/mt'
interface TranslateState {
  requestId: string | null
  rawSelection: string
  sentences: Sentence[]
  mode: TranslateMode
  locked: boolean
  paragraphStarts: number[]
  translate(text: string, force?: boolean, waitMs?: number): void
  retry(id?: string, edited?: string, match?: (s: Sentence) => boolean): void
  /** 只重译出错的句子（切换引擎后使用） */
  retryFailed(): void
  clear(): void
  setMode(mode: TranslateMode): void
  toggleLock(): void
}
const batches = new Map<
  string,
  { root: string; ids: string[]; keys: Map<string, string>; attempt: number }
>()
export const useTranslateStore = create<TranslateState>((set, get) => ({
  requestId: null,
  rawSelection: '',
  sentences: [],
  mode: 'sentence',
  locked: false,
  paragraphStarts: [],
  translate(rawSelection, force = false, waitMs = 0) {
    if (rawSelection.trim().length < 2) return
    if (rawSelection.length > 6000) throw new Error('选区过长，请分段选择或使用全文总结')
    cancelBatches()
    const requestId = crypto.randomUUID(),
      paragraphs = textClean(rawSelection).split('\n\n').map(splitSentences)
    let index = 0
    const paragraphStarts = paragraphs.map((p) => {
      const start = index
      index += p.length
      return start
    })
    const sentences = paragraphs.flat().map((source, i) => ({
      id: requestId + ':' + i,
      index: i + 1,
      source,
      target: '',
      status: 'pending' as const
    }))
    set({ requestId, rawSelection, sentences, paragraphStarts })
    if (typeof window !== 'undefined' && window.api)
      void send(sentences, requestId, force, 0, waitMs)
  },
  retryFailed() {
    if (get().sentences.some((s) => s.status === 'error'))
      get().retry(undefined, undefined, (s) => s.status === 'error')
  },
  retry(id, edited, match = (s) => !id || s.id === id) {
    const state = get()
    if (!state.requestId) return
    const selected = state.sentences.filter(match).map((s) => ({
      ...s,
      source: edited ?? s.source,
      target: '',
      status: 'pending' as const,
      error: undefined
    }))
    if (edited && (edited.length < 2 || edited.length > 6000)) return
    cancelBatches()
    const requestId = crypto.randomUUID()
    const affected = new Set(selected.map((s) => s.id))
    const interrupted = state.sentences
      .filter((s) => !affected.has(s.id) && (s.status === 'pending' || s.status === 'streaming'))
      .map((s) => ({ ...s, target: '', status: 'pending' as const }))
    const next = [...selected, ...interrupted]
    set({ requestId, sentences: state.sentences.map((s) => next.find((n) => n.id === s.id) || s) })
    void send(next, requestId, true)
  },
  clear() {
    cancelBatches()
    set({ requestId: null, rawSelection: '', sentences: [], paragraphStarts: [] })
  },
  setMode: (mode) => set({ mode }),
  toggleLock: () => set((s) => ({ locked: !s.locked }))
}))
function cancelBatches() {
  for (const id of batches.keys())
    if (typeof window !== 'undefined') void window.api.cancelTranslation({ requestId: id })
  batches.clear()
}
async function send(
  sentences: Sentence[],
  root: string,
  force: boolean,
  attempt = 0,
  waitMs = 0
): Promise<void> {
  const config = useSettingsStore.getState().config
  if (!config) return
  const profile = config.profiles.find((p) => p.id === config.settings.activeProfileId),
    preset =
      config.presets.find((p) => p.id === config.settings.activePresetId) || config.presets[0]
  const keys = new Map<string, string>(),
    missing: Sentence[] = [],
    tag = await engineTag(config)
  for (const sentence of sentences) {
    const key = tag ? await cacheKey(sentence.source, tag) : ''
    if (useTranslateStore.getState().requestId !== root) return
    keys.set(sentence.id, key)
    const cached = !force && key ? await cacheGet(key) : undefined
    if (cached)
      useTranslateStore.setState((s) => ({
        sentences: s.sentences.map((v) =>
          v.id === sentence.id ? { ...v, target: cached, status: 'done' } : v
        )
      }))
    else missing.push(sentence)
  }
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs))
  if (useTranslateStore.getState().requestId !== root || !missing.length) return
  // 第一次使用免费引擎时，发送前先征得同意（设计文档 8.11）
  const translator = config.settings.translator
  if (
    translator.kind === 'mt' &&
    !mtEngine(translator.engineId).requiresKey &&
    !config.mt.privacyAcked.includes(translator.engineId)
  ) {
    const ok = await useUIStore.getState().askPrivacy(translator.engineId)
    if (useTranslateStore.getState().requestId !== root) return
    if (!ok) {
      const ids = new Set(missing.map((s) => s.id))
      useTranslateStore.setState((s) => ({
        sentences: s.sentences.map((v) =>
          ids.has(v.id)
            ? { ...v, status: 'error', error: 'CANCELED:已取消，可在设置中更换翻译引擎' }
            : v
        )
      }))
      return
    }
    const latest = useSettingsStore.getState().config
    if (latest && !latest.mt.privacyAcked.includes(translator.engineId))
      await useSettingsStore.getState().save({
        ...latest,
        mt: { ...latest.mt, privacyAcked: [...latest.mt.privacyAcked, translator.engineId] }
      })
  }
  for (let i = 0; i < missing.length; i += 60) {
    const part = missing.slice(i, i + 60),
      requestId = crypto.randomUUID()
    batches.set(requestId, { root, ids: part.map((s) => s.id), keys, attempt })
    try {
      await window.api.translate({
        requestId,
        sentences: part.map((s) => ({ id: s.id, text: s.source })),
        profileId: profile?.id,
        presetId: preset.id
      })
    } catch {
      onError({ requestId, code: 'NETWORK', message: '网络连接失败' })
    }
  }
}
function onError(e: { requestId: string; code: string; message: string; sentenceIds?: string[] }) {
  const batch = batches.get(e.requestId)
  if (!batch) return
  batches.delete(e.requestId)
  const failed = e.sentenceIds || batch.ids
  const retry =
    ['NETWORK', 'TIMEOUT'].includes(e.code) &&
    batch.attempt < 2 &&
    useTranslateStore.getState().sentences.some((s) => batch.ids.includes(s.id) && s.target)
  useTranslateStore.setState((s) => ({
    sentences: s.sentences.map((v) =>
      batch.ids.includes(v.id)
        ? {
            ...v,
            status: failed.includes(v.id) ? (retry ? 'pending' : 'error') : 'done',
            target: failed.includes(v.id) && retry ? '' : v.target,
            error: failed.includes(v.id) ? e.code + ':' + e.message : undefined
          }
        : v
    )
  }))
  if (retry)
    setTimeout(
      () => {
        const state = useTranslateStore.getState()
        if (state.requestId === batch.root)
          void send(
            state.sentences.filter((s) => failed.includes(s.id)),
            batch.root,
            true,
            batch.attempt + 1
          )
      },
      1000 * 2 ** batch.attempt
    )
}
export function bindTranslationEvents(): () => void {
  const off = [
    window.api.onTranslationDelta((e) => {
      const batch = batches.get(e.requestId)
      if (!batch || useTranslateStore.getState().requestId !== batch.root) return
      if (e.thinking) {
        useTranslateStore.setState((s) => ({
          sentences: s.sentences.map((v) =>
            v.id === e.sentenceId && v.status === 'pending' ? { ...v, thinking: true } : v
          )
        }))
        return
      }
      useTranslateStore.setState((s) => ({
        sentences: s.sentences.map((v) =>
          v.id === e.sentenceId
            ? {
                ...v,
                target: e.replace ? e.text : v.target + e.text,
                status: 'streaming',
                thinking: false
              }
            : v.status === 'streaming' && batch.ids.includes(v.id)
              ? { ...v, status: 'done' }
              : v
        )
      }))
    }),
    window.api.onTranslationDone((e) => {
      const batch = batches.get(e.requestId)
      if (!batch) return
      batches.delete(e.requestId)
      if (e.fallback)
        useUIStore.getState().showToast('大模型请求失败，已改用' + mtEngine(e.fallback).name)
      useTranslateStore.setState((s) => ({
        sentences: s.sentences.map((v) =>
          batch.ids.includes(v.id) ? { ...v, target: v.target.trim(), status: 'done' } : v
        )
      }))
      // 大模型失败后由机器翻译补上的译文不写入大模型的缓存
      if (!e.fallback)
        for (const s of useTranslateStore.getState().sentences)
          if (batch.ids.includes(s.id) && s.target) {
            const key = batch.keys.get(s.id)
            if (key) void cachePut(key, s.target)
          }
    }),
    window.api.onTranslationError(onError)
  ]
  return () => {
    off.forEach((f) => f())
    cancelBatches()
  }
}
