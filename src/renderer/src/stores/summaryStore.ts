import { create } from 'zustand'
import type { OpenedFile } from '../../../shared/types'
import type { SummaryResult, SummaryProgress } from '../../../shared/summary'
import { extractText } from '../lib/extractText'
import { useSettingsStore } from './settingsStore'
interface State {
  status: 'idle' | 'extract' | 'confirm' | 'running' | 'error' | 'unsaved' | 'saving' | 'saved'
  jobId: string | null
  file: OpenedFile | null
  text: string
  tokens: number
  requests: number
  progress: SummaryProgress | null
  result: SummaryResult | null
  error: string
  savedPath: string
  start(file: OpenedFile): Promise<void>
  run(): Promise<void>
  save(): Promise<void>
  cancel(): void
  close(): void
}
let extraction: AbortController | undefined
const cleanError = (e: unknown) =>
  (e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')
export const useSummaryStore = create<State>((set, get) => ({
  status: 'idle',
  jobId: null,
  file: null,
  text: '',
  tokens: 0,
  requests: 0,
  progress: null,
  result: null,
  error: '',
  savedPath: '',
  async start(file) {
    get().cancel()
    const jobId = crypto.randomUUID()
    extraction = new AbortController()
    const signal = extraction.signal
    set({
      jobId,
      file,
      status: 'extract',
      text: '',
      result: null,
      error: '',
      savedPath: '',
      progress: { jobId, stage: 'extract', done: 0, total: 1 }
    })
    try {
      const text = await extractText(file, signal, (done, total) => {
        if (get().jobId === jobId) set({ progress: { jobId, stage: 'extract', done, total } })
      })
      if (signal.aborted) return
      if (text.replace(/<<PAGE \d+>>|\s/g, '').length < 200)
        throw new Error('未提取到文字，可能是扫描版 PDF')
      const config = useSettingsStore.getState().config!,
        profile = config.profiles.find(
          (p) => p.id === (config.settings.summaryProfileId || config.settings.activeProfileId)
        )
      const { summaryPlan } = await import('../../../shared/summary')
      if (signal.aborted) return
      const plan = summaryPlan(text, profile?.contextWindow)
      set({ text, tokens: plan.tokens, requests: plan.requests })
      if (plan.tokens > 30000) set({ status: 'confirm' })
      else await get().run()
    } catch (e) {
      if (!signal.aborted) set({ status: 'error', error: cleanError(e) })
    }
  },
  async run() {
    const { file, text } = get()
    if (!file) return
    const jobId = crypto.randomUUID()
    set({
      jobId,
      status: 'running',
      result: null,
      error: '',
      progress: { jobId, stage: 'map', done: 0, total: 1 }
    })
    try {
      await window.api.startSummary({
        jobId,
        fileId: file.fileId,
        text,
        title: file.name.replace(/\.[^.]+$/, '')
      })
      if (get().jobId !== jobId) return
      set({ status: 'unsaved' })
      await get().save()
    } catch (e) {
      if (get().jobId === jobId) set({ status: 'error', error: cleanError(e) })
    }
  },
  async save() {
    const { result, file, jobId } = get()
    if (!result || !file) return
    set({ status: 'saving', error: '' })
    try {
      const saved = await window.api.saveSummary({
        markdown: result.markdown,
        defaultName: file.name.replace(/\.[^.]+$/, '') + '_总结.md'
      })
      if (get().jobId !== jobId) return
      set(saved.ok ? { status: 'saved', savedPath: saved.path! } : { status: 'unsaved' })
    } catch (e) {
      set({ status: 'unsaved', error: cleanError(e) })
    }
  },
  cancel() {
    const id = get().jobId
    extraction?.abort()
    if (id) void window.api.cancelSummary({ jobId: id })
    set({ status: 'idle', jobId: null })
  },
  close() {
    get().cancel()
  }
}))
export function bindSummaryEvents(): () => void {
  const off = [
    window.api.onSummaryProgress((p) => {
      if (useSummaryStore.getState().jobId === p.jobId) useSummaryStore.setState({ progress: p })
    }),
    window.api.onSummaryResult((result) => {
      if (useSummaryStore.getState().jobId === result.jobId) useSummaryStore.setState({ result })
    })
  ]
  return () => off.forEach((f) => f())
}
