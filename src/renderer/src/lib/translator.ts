import type { AppConfig } from '../../../shared/config'
import { DEFAULT_MT_ENGINE, mtEngine, type MtEngineId } from '../../../shared/mt'
import type { Translator } from '../../../shared/types'
import { useSettingsStore } from '../stores/settingsStore'
import { useTranslateStore } from '../stores/translateStore'
/** 翻译栏和错误提示里显示的当前引擎名 */
export function translatorName(config: AppConfig): string {
  const t = config.settings.translator
  if (t.kind === 'mt') return mtEngine(t.engineId).name
  const profile = config.profiles.find((p) => p.id === config.settings.activeProfileId)
  return profile?.model || profile?.name || '大模型'
}
export async function switchTranslator(translator: Translator, profileId?: string): Promise<void> {
  const config = useSettingsStore.getState().config
  if (!config) return
  await useSettingsStore.getState().save({
    ...config,
    settings: {
      ...config.settings,
      translator,
      activeProfileId: profileId ?? config.settings.activeProfileId
    }
  })
}
/** 错误卡片上的「切换到…」：当前已是微软时备选谷歌 */
export function alternativeEngine(config: AppConfig): MtEngineId {
  const t = config.settings.translator
  return t.kind === 'mt' && t.engineId === DEFAULT_MT_ENGINE ? 'google-free' : DEFAULT_MT_ENGINE
}
export async function switchAndRetry(engineId: MtEngineId): Promise<void> {
  await switchTranslator({ kind: 'mt', engineId })
  useTranslateStore.getState().retryFailed()
}
/** 配置类错误打开对应的设置页：机器翻译 → 翻译引擎，大模型 → 模型 API */
export function openTranslatorSettings(): void {
  const config = useSettingsStore.getState().config
  useSettingsStore
    .getState()
    .open(config?.settings.translator.kind === 'mt' ? 'translator' : 'model')
}
