import { create } from 'zustand'
import { isLocalUrl, type AppConfig } from '../../../shared/config'
import { YOUDAO_SECRET_ID, mtEngine, type MtEngineId } from '../../../shared/mt'
export type SettingsTab = 'translator' | 'model' | 'prompt' | 'preferences'
interface State {
  config: AppConfig | null
  /** 各模型配置与有道应用密钥是否已保存（只有布尔值，不含密钥） */
  keys: Record<string, boolean>
  opened: boolean
  tab: SettingsTab
  open(tab?: SettingsTab): void
  close(): void
  load(): Promise<void>
  save(config: AppConfig): Promise<void>
  refreshKeys(): Promise<void>
}
export const useSettingsStore = create<State>((set, get) => ({
  config: null,
  keys: {},
  opened: false,
  tab: 'translator',
  open: (tab = 'translator') => set({ opened: true, tab }),
  close: () => set({ opened: false }),
  async load() {
    set({ config: await window.api.getConfig() })
    await get().refreshKeys()
  },
  async save(config) {
    set({ config: await window.api.setConfig(config) })
    await get().refreshKeys()
  },
  async refreshKeys() {
    const config = get().config
    if (!config) return
    const ids = [...config.profiles.map((p) => p.id), YOUDAO_SECRET_ID]
    const values = await Promise.all(
      ids.map((profileId) => window.api.hasSecret({ profileId }).catch(() => false))
    )
    set({ keys: Object.fromEntries(ids.map((id, i) => [id, values[i]])) })
  }
}))
type Snapshot = Pick<State, 'config' | 'keys'>
/** 大模型配置可用：填写了模型名，且已保存密钥或为本地模型（与主进程判断一致） */
export function profileReady(s: Snapshot, profileId: string | null | undefined): boolean {
  const profile = s.config?.profiles.find((p) => p.id === profileId)
  return !!profile?.model && (isLocalUrl(profile.baseUrl) || !!s.keys[profile.id])
}
/** 全文总结所用的大模型是否可用（设计文档 8.6） */
export function llmReady(s: Snapshot): boolean {
  const settings = s.config?.settings
  return !!settings && profileReady(s, settings.summaryProfileId ?? settings.activeProfileId)
}
export function mtReady(s: Snapshot, id: MtEngineId): boolean {
  return !mtEngine(id).requiresKey || (!!s.config?.mt.youdaoAppKey && !!s.keys[YOUDAO_SECRET_ID])
}
/** 当前翻译引擎是否已配置好 */
export function translatorReady(s: Snapshot): boolean {
  const t = s.config?.settings.translator
  if (!t) return false
  return t.kind === 'mt'
    ? mtReady(s, t.engineId)
    : profileReady(s, s.config!.settings.activeProfileId)
}
/** 需要大模型的功能入口调用：不可用时打开「模型 API」设置并返回 false */
export function requireLlm(): boolean {
  const state = useSettingsStore.getState()
  if (llmReady(state)) return true
  state.open('model')
  return false
}
