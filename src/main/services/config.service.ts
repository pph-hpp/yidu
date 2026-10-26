import Store from 'electron-store'
import {
  defaultConfig,
  migrateConfig,
  normalizeProfile,
  validateConfig,
  type AppConfig
} from '../../shared/config'
export class ConfigService {
  private store = new Store<AppConfig>({ name: 'config', defaults: defaultConfig() })
  get(): AppConfig {
    const stored = this.store.store,
      migrated = migrateConfig(stored)
    if (JSON.stringify(migrated) !== JSON.stringify(stored)) this.store.store = migrated
    return structuredClone(migrated)
  }
  set(patch: unknown): AppConfig {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('配置格式错误')
    const next = { ...this.get(), ...patch } as AppConfig
    if (Array.isArray(next.profiles)) next.profiles = next.profiles.map(normalizeProfile)
    validateConfig(next)
    this.store.store = next
    return this.get()
  }
}
