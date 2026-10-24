import { approvedHttpUrls } from './http-exceptions'
import Store from 'electron-store'
import { defaultConfig, migrateConfig, validateConfig, type AppConfig } from '../../shared/config'
export class ConfigService {
  private store = new Store<AppConfig>({ name: 'config', defaults: defaultConfig() })
  /** hasKey 用于迁移旧配置：判断当前大模型是否已保存密钥 */
  constructor(private hasKey: (profileId: string) => boolean = () => false) {}
  get(): AppConfig {
    const stored = this.store.store,
      migrated = migrateConfig(stored, this.hasKey)
    if (JSON.stringify(migrated) !== JSON.stringify(stored)) this.store.store = migrated
    return structuredClone(migrated)
  }
  set(patch: unknown): AppConfig {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('配置格式错误')
    const next = { ...this.get(), ...patch }
    validateConfig(next, approvedHttpUrls())
    this.store.store = next
    return this.get()
  }
}
