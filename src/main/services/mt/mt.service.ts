import { stringField } from '../../../shared/config'
import { isMtEngineId, YOUDAO_SECRET_ID, type MtEngineId } from '../../../shared/mt'
import type { ConnectionResult } from '../../../shared/translation'
import { LLMError } from '../llm/adapter'
import { ProfileQueue, delay } from '../llm/queue'
import type { ConfigService } from '../config.service'
import type { SecretService } from '../secret.service'
import type { MtAdapter } from './adapter'
import { MicrosoftFreeAdapter } from './microsoft-free'
import { GoogleFreeAdapter } from './google-free'
import { YoudaoAdapter } from './youdao'
export class MtService {
  private queue = new ProfileQueue()
  // 免费引擎的实例常驻，微软 token 缓存在实例里
  private microsoft = new MicrosoftFreeAdapter()
  private google = new GoogleFreeAdapter()
  constructor(
    readonly config: ConfigService,
    readonly secrets: SecretService
  ) {}
  adapter(id: MtEngineId, youdao?: { appKey?: string; appSecret?: string }): MtAdapter {
    if (id === 'microsoft-free') return this.microsoft
    if (id === 'google-free') return this.google
    const appKey = youdao?.appKey ?? this.config.get().mt.youdaoAppKey,
      appSecret = youdao?.appSecret ?? this.secrets.get(YOUDAO_SECRET_ID)
    if (!appKey || !appSecret)
      throw new LLMError('NO_PROFILE', '有道智云还没有配置应用 ID 和应用密钥')
    return new YoudaoAdapter(appKey, appSecret)
  }
  /** 限流时按 1s、2s 退避重试两次；结果为空视为服务异常 */
  async translate(
    id: MtEngineId,
    texts: string[],
    signal: AbortSignal,
    adapter: MtAdapter = this.adapter(id)
  ): Promise<string[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await this.queue.run('mt:' + id, signal, () =>
          adapter.translate(texts, { signal })
        )
        if (out.length !== texts.length || out.some((t) => !t.trim()))
          throw new LLMError('SERVER', '翻译结果为空')
        return out
      } catch (e) {
        if (signal.aborted || !(e instanceof LLMError) || e.code !== 'RATE_LIMIT' || attempt === 2)
          throw e
        await delay(1000 * 2 ** attempt, signal)
      }
    }
  }
  async test(value: unknown): Promise<ConnectionResult> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数格式错误')
    const v = value as Record<string, unknown>
    if (!isMtEngineId(v.engineId)) throw new Error('翻译引擎无效')
    if (v.appKey !== undefined) stringField(v.appKey, 200)
    if (v.appSecret !== undefined) stringField(v.appSecret, 4096)
    const start = Date.now(),
      controller = new AbortController()
    try {
      const adapter = this.adapter(v.engineId, {
        appKey: v.appKey as string | undefined,
        appSecret: v.appSecret as string | undefined
      })
      await this.translate(v.engineId, ['Hello'], controller.signal, adapter)
      return { ok: true, latencyMs: Date.now() - start }
    } catch (e) {
      const error = e instanceof LLMError ? e : new LLMError('ENGINE_UNAVAILABLE')
      return { ok: false, code: error.code, message: error.message }
    } finally {
      controller.abort()
    }
  }
}
