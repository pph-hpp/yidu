import { create } from 'zustand'
let timer: ReturnType<typeof setTimeout>
export const useUIStore = create<{ toast: string; showToast(message: string): void }>((set) => ({
  toast: '',
  showToast: (toast) => {
    clearTimeout(timer)
    set({ toast })
    timer = setTimeout(() => set({ toast: '' }), 2000)
  }
}))
