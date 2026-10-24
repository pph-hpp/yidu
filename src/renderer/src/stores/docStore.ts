import { create } from 'zustand'
import type { OpenedFile } from '../../../shared/types'
interface DocState {
  docs: OpenedFile[]
  activeId: string | null
  pageCount: number
  currentPage: number
  zoom: number
  open(file: OpenedFile): void
  close(id: string): void
  setActive(id: string): void
  setZoom(zoom: number): void
  setPage(page: number, count?: number): void
}
export const useDocStore = create<DocState>((set, get) => ({
  docs: [],
  activeId: null,
  pageCount: 0,
  currentPage: 1,
  zoom: 1,
  open(file) {
    const existing = get().docs.find((d) => d.path.toLowerCase() === file.path.toLowerCase())
    if (existing) {
      set({ activeId: existing.fileId })
      return
    }
    if (get().docs.length >= 20) throw new Error('最多同时打开 20 个标签，请先关闭一个标签')
    set((s) => ({ docs: [...s.docs, file], activeId: file.fileId, pageCount: 0, currentPage: 1 }))
  },
  close(id) {
    set((s) => {
      const index = s.docs.findIndex((d) => d.fileId === id)
      const docs = s.docs.filter((d) => d.fileId !== id)
      return {
        docs,
        activeId:
          s.activeId === id ? (docs[Math.min(index, docs.length - 1)]?.fileId ?? null) : s.activeId
      }
    })
  },
  setActive: (id) => set({ activeId: id }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(3, Math.round(zoom * 100) / 100)) }),
  setPage: (currentPage, pageCount) =>
    set((s) => ({ currentPage, pageCount: pageCount ?? s.pageCount }))
}))
