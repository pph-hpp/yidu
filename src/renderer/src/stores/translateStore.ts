import { create } from 'zustand'
import type { Sentence } from '../../../shared/types'
import { textClean } from '../lib/textClean'
import { splitSentences } from '../lib/sentenceSplit'
interface TranslateState {
  requestId: string | null
  rawSelection: string
  sentences: Sentence[]
  translate(text: string): void
  clear(): void
}
export const useTranslateStore = create<TranslateState>((set) => ({
  requestId: null,
  rawSelection: '',
  sentences: [],
  translate(rawSelection) {
    if (rawSelection.trim().length < 2) return
    if (rawSelection.length > 6000) throw new Error('选区过长，请分段选择或使用全文总结')
    const requestId = crypto.randomUUID()
    const sources = textClean(rawSelection).split('\n\n').flatMap(splitSentences)
    set({
      requestId,
      rawSelection,
      sentences: sources.map((source, i) => ({
        id: requestId + ':' + i,
        index: i + 1,
        source,
        target: '',
        status: 'pending'
      }))
    })
  },
  clear: () => set({ requestId: null, rawSelection: '', sentences: [] })
}))
