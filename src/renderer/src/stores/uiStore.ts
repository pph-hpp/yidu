import { create } from 'zustand'
import type { MtEngineId } from '../../../shared/mt'
let timer: ReturnType<typeof setTimeout>
let privacyResolve: ((ok: boolean) => void) | null = null,
  privacyWaiting: Promise<boolean> | null = null
interface State {
  toast: string
  showToast(message: string): void
  /** 正在询问隐私确认的引擎（设计文档 8.11） */
  privacy: MtEngineId | null
  askPrivacy(engineId: MtEngineId): Promise<boolean>
  answerPrivacy(ok: boolean): void
}
export const useUIStore = create<State>((set, get) => ({
  toast: '',
  showToast: (toast) => {
    clearTimeout(timer)
    set({ toast })
    timer = setTimeout(() => set({ toast: '' }), 2000)
  },
  privacy: null,
  askPrivacy(engineId) {
    // 同一时间只弹一个确认框，并发的翻译批次共用同一个结果
    if (privacyWaiting && get().privacy === engineId) return privacyWaiting
    privacyResolve?.(false)
    set({ privacy: engineId })
    privacyWaiting = new Promise<boolean>((resolve) => (privacyResolve = resolve))
    return privacyWaiting
  },
  answerPrivacy(ok) {
    privacyResolve?.(ok)
    privacyResolve = null
    privacyWaiting = null
    set({ privacy: null })
  }
}))
