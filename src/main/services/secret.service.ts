import Store from 'electron-store'
import { safeStorage } from 'electron'
import { stringField, validId } from '../../shared/config'
export class SecretService {
  private store = new Store<{ keys: Record<string, string> }>({
    name: 'secrets',
    defaults: { keys: {} }
  })
  set(profileId: unknown, apiKey: unknown): void {
    validId(profileId)
    stringField(apiKey, 4096)
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密不可用，无法保存密钥')
    const keys = this.store.get('keys')
    if (apiKey) keys[profileId] = safeStorage.encryptString(apiKey).toString('base64')
    else delete keys[profileId]
    this.store.set('keys', keys)
  }
  has(profileId: unknown): boolean {
    validId(profileId)
    return !!this.store.get('keys')[profileId]
  }
  get(profileId: string): string {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密不可用')
    const cipher = this.store.get('keys')[profileId]
    return cipher ? safeStorage.decryptString(Buffer.from(cipher, 'base64')) : ''
  }
}
