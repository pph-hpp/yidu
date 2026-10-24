import { create } from 'zustand'
import type { AppConfig } from '../../../shared/config'
interface State {
  config: AppConfig | null
  opened: boolean
  open(): void
  close(): void
  load(): Promise<void>
  save(config: AppConfig): Promise<void>
}
export const useSettingsStore = create<State>((set) => ({
  config: null,
  opened: false,
  open: () => set({ opened: true }),
  close: () => set({ opened: false }),
  async load() {
    set({ config: await window.api.getConfig() })
  },
  async save(config) {
    set({ config: await window.api.setConfig(config) })
  }
}))
