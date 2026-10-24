import Store from 'electron-store'
import { defaultConfig, validateConfig, type AppConfig } from '../../shared/config'
export class ConfigService {
  private store = new Store<AppConfig>({ name: 'config', defaults: defaultConfig() })
  get(): AppConfig {
    return structuredClone(this.store.store)
  }
  set(patch: unknown): AppConfig {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('配置格式错误')
    const next = { ...this.get(), ...patch }
    validateConfig(next)
    this.store.store = next
    return this.get()
  }
}
