import { createStore, get, set, del, entries } from 'idb-keyval'
import { buildPrompt, type AppConfig } from '../../../shared/config'
const store = createStore('yidu-translations', 'sentences')
interface Entry {
  target: string
  used: number
}
export async function sha256(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
/**
 * 当前翻译引擎的缓存标识（设计文档 7.6）：大模型含模型与提示词哈希，机器翻译只含引擎 id，
 * 切换引擎后不会命中其他引擎的译文。返回空字符串表示不使用缓存。
 */
export async function engineTag(config: AppConfig): Promise<string> {
  const { translator, activeProfileId, activePresetId } = config.settings
  if (translator.kind === 'mt') return 'mt:' + translator.engineId
  const profile = config.profiles.find((p) => p.id === activeProfileId),
    preset = config.presets.find((p) => p.id === activePresetId) || config.presets[0]
  if (!profile) return ''
  return 'llm:' + profile.id + profile.model + '\0' + (await sha256(buildPrompt(preset)))
}
export async function cacheKey(source: string, tag: string): Promise<string> {
  return sha256(source + '\0' + tag)
}
export async function cacheGet(key: string): Promise<string | undefined> {
  try {
    const entry = await get<Entry>(key, store)
    if (entry) {
      await set(key, { ...entry, used: Date.now() }, store)
      return entry.target
    }
  } catch {
    /* Cache is optional; translation remains available. */
  }
}
let writes = Promise.resolve()
export function cachePut(key: string, target: string): Promise<void> {
  writes = writes
    .then(async () => {
      await set(key, { target, used: Date.now() }, store)
      const all = await entries<string, Entry>(store)
      for (const [id] of all
        .sort((a, b) => a[1].used - b[1].used)
        .slice(0, Math.max(0, all.length - 5000)))
        await del(id, store)
    })
    .catch(() => {})
  return writes
}
