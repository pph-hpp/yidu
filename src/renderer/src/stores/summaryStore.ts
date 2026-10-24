import { create } from 'zustand'
import type { OpenedFile } from '../../../shared/types'
import type { SummaryResult, SummaryProgress } from '../../../shared/summary'
import { extractText } from '../lib/extractText'
import { useSettingsStore } from './settingsStore'
import { useUIStore } from './uiStore'

export interface SummaryJob {
  status: 'extract' | 'confirm' | 'running' | 'error' | 'unsaved' | 'saving' | 'saved'
  jobId: string
  file: OpenedFile
  text: string
  tokens: number
  requests: number
  progress: SummaryProgress | null
  result: SummaryResult | null
  error: string
  savedPath: string
  promptOpen: boolean
}
interface State {
  jobs: Record<string, SummaryJob>
  activeKey: string | null
  visible: boolean
  cancellingKey: string | null
  start(file: OpenedFile): Promise<void>
  retry(): Promise<void>
  run(key?: string): Promise<void>
  save(key?: string): Promise<void>
  cancel(): void
  confirmCancel(): void
  dismissCancel(): void
  close(): void
  showPrompt(): void
}
const extractions = new Map<string, AbortController>()
export const summaryKey = (file: OpenedFile) => file.path.toLowerCase()
const cleanError = (e: unknown) =>
  (e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')
export const useSummaryStore = create<State>((set, get) => {
  const update = (key: string, jobId: string, patch: Partial<SummaryJob>) => {
    if (get().jobs[key]?.jobId !== jobId) return false
    set((s) => ({ jobs: { ...s.jobs, [key]: { ...s.jobs[key], ...patch } } }))
    return true
  }
  const foreground = (key: string) =>
    get().visible && get().activeKey === key && !get().cancellingKey
  const stop = (job: SummaryJob) => {
    extractions.get(job.jobId)?.abort()
    extractions.delete(job.jobId)
    if (job.status === 'running')
      void window.api.cancelSummary({ jobId: job.jobId }).catch(() => {})
  }
  const begin = async (file: OpenedFile, reusableText = '') => {
    const key = summaryKey(file),
      jobId = crypto.randomUUID()
    const controller = new AbortController(),
      signal = controller.signal
    extractions.set(jobId, controller)
    const job: SummaryJob = {
      jobId,
      file,
      status: 'extract',
      text: '',
      tokens: 0,
      requests: 0,
      result: null,
      error: '',
      savedPath: '',
      promptOpen: false,
      progress: { jobId, stage: 'extract', done: 0, total: 1 }
    }
    set((s) => ({
      jobs: { ...s.jobs, [key]: job },
      activeKey: key,
      visible: true,
      cancellingKey: null
    }))
    try {
      const text =
        reusableText ||
        (await extractText(file, signal, (done, total) => {
          update(key, jobId, { progress: { jobId, stage: 'extract', done, total } })
        }))
      if (signal.aborted || get().jobs[key]?.jobId !== jobId) return
      if (text.replace(/<<PAGE \d+>>|\s/g, '').length < 200)
        throw new Error('未提取到文字，可能是扫描版 PDF')
      const config = useSettingsStore.getState().config!,
        profile = config.profiles.find(
          (p) => p.id === (config.settings.summaryProfileId || config.settings.activeProfileId)
        )
      const { summaryPlan } = await import('../../../shared/summary')
      if (signal.aborted || get().jobs[key]?.jobId !== jobId) return
      const plan = summaryPlan(text, profile?.contextWindow)
      update(key, jobId, { text, tokens: plan.tokens, requests: plan.requests })
      if (plan.tokens > 30000) update(key, jobId, { status: 'confirm' })
      else await get().run(key)
    } catch (e) {
      if (
        !signal.aborted &&
        update(key, jobId, { status: 'error', error: cleanError(e) }) &&
        !foreground(key)
      )
        useUIStore.getState().showToast(file.name + ' 总结未完成，点击全文总结可重试')
    } finally {
      extractions.delete(jobId)
    }
  }
  return {
    jobs: {},
    activeKey: null,
    visible: false,
    cancellingKey: null,
    async start(file) {
      const key = summaryKey(file),
        existing = get().jobs[key]
      if (existing) {
        update(key, existing.jobId, {
          promptOpen: false,
          ...(!['extract', 'running', 'saving'].includes(existing.status)
            ? {
                file,
                text: file.mtimeMs === existing.file.mtimeMs ? existing.text : ''
              }
            : {})
        })
        set({ activeKey: key, visible: true, cancellingKey: null })
        return
      }
      await begin(file)
    },
    async retry() {
      const key = get().activeKey,
        job = key ? get().jobs[key] : undefined
      if (!job || job.status === 'saving') return
      stop(job)
      // Failed jobs can reuse extracted text and successful Map chunks. Completed
      // jobs are deliberately regenerated only through this explicit action.
      await begin(job.file, job.text)
    },
    async run(key = get().activeKey || '') {
      const job = get().jobs[key]
      if (!job || job.status === 'running' || job.status === 'saving') return
      const { file, text } = job,
        jobId = crypto.randomUUID()
      update(key, job.jobId, {
        jobId,
        status: 'running',
        result: null,
        error: '',
        savedPath: '',
        promptOpen: false,
        progress: { jobId, stage: 'map', done: 0, total: 1 }
      })
      try {
        await window.api.startSummary({
          jobId,
          fileId: file.fileId,
          text,
          title: file.name.replace(/\.[^.]+$/, '')
        })
        if (!update(key, jobId, { status: 'unsaved' })) return
        if (foreground(key)) await get().save(key)
        else useUIStore.getState().showToast(file.name + ' 总结已完成，点击全文总结查看结果')
      } catch (e) {
        if (update(key, jobId, { status: 'error', error: cleanError(e) }) && !foreground(key))
          useUIStore.getState().showToast(file.name + ' 总结未完成，点击全文总结可重试')
      }
    },
    async save(key = get().activeKey || '') {
      const job = get().jobs[key]
      if (!job?.result || !['unsaved', 'saved'].includes(job.status)) return
      const { result, file, jobId } = job
      update(key, jobId, { status: 'saving', error: '' })
      try {
        const saved = await window.api.saveSummary({
          markdown: result.markdown,
          defaultName: file.name.replace(/\.[^.]+$/, '') + '_总结.md'
        })
        update(
          key,
          jobId,
          saved.ok
            ? { status: 'saved', savedPath: saved.path!, promptOpen: foreground(key) }
            : { status: 'unsaved' }
        )
      } catch (e) {
        update(key, jobId, { status: 'unsaved', error: cleanError(e) })
      }
    },
    cancel() {
      if (get().activeKey) set({ cancellingKey: get().activeKey })
    },
    confirmCancel() {
      const key = get().cancellingKey,
        job = key ? get().jobs[key] : undefined
      if (!key || !job) return
      stop(job)
      set((s) => {
        const jobs = { ...s.jobs }
        delete jobs[key]
        return { jobs, cancellingKey: null, visible: false, activeKey: null }
      })
    },
    dismissCancel() {
      set({ cancellingKey: null })
    },
    close() {
      const key = get().activeKey,
        job = key ? get().jobs[key] : undefined
      if (key && job) update(key, job.jobId, { promptOpen: false })
      set({ visible: false, cancellingKey: null })
    },
    showPrompt() {
      const key = get().activeKey,
        job = key ? get().jobs[key] : undefined
      if (key && job?.status === 'saved') update(key, job.jobId, { promptOpen: true })
    }
  }
})
export function bindSummaryEvents(): () => void {
  const apply = (jobId: string, patch: Partial<SummaryJob>) => {
    useSummaryStore.setState((s) => {
      const entry = Object.entries(s.jobs).find(([, job]) => job.jobId === jobId)
      if (!entry) return s
      const [key, job] = entry
      return { jobs: { ...s.jobs, [key]: { ...job, ...patch } } }
    })
  }
  const off = [
    window.api.onSummaryProgress((progress) => apply(progress.jobId, { progress })),
    window.api.onSummaryResult((result) => apply(result.jobId, { result }))
  ]
  return () => off.forEach((f) => f())
}
