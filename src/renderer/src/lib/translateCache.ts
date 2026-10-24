import { createStore, get, set, del, entries } from 'idb-keyval'
import { buildPrompt } from '../../../shared/config'
import type { ModelProfile, PromptPreset } from '../../../shared/types'
const store = createStore('yidu-translations', 'sentences')
interface Entry {
  target: string
  used: number
}
export async function sha256(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export async function cacheKey(
  source: string,
  profile: ModelProfile,
  preset: PromptPreset
): Promise<string> {
  return sha256(
    source + '\0' + profile.id + profile.model + '\0' + (await sha256(buildPrompt(preset)))
  )
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
