import { approvedHttpUrls } from '../http-exceptions'
import { buildPrompt, validId, stringField, validateProfile } from '../../../shared/config'
import type { ModelProfile } from '../../../shared/types'
import type {
  TranslateRequest,
  TranslationDelta,
  TranslationError,
  ConnectionResult
} from '../../../shared/translation'
import { FetchAdapter, LLMError, type ChatMessage } from './adapter'
import { StreamParser } from './streamParser'
import { ProfileQueue, delay } from './queue'
import type { ConfigService } from '../config.service'
import type { SecretService } from '../secret.service'
import { MtService } from '../mt/mt.service'
import { DEFAULT_MT_ENGINE, type MtEngineId } from '../../../shared/mt'
export function validateTranslate(value: unknown): asserts value is TranslateRequest {
  if (!value || typeof value !== 'object') throw new Error('翻译参数无效')
  const v = value as TranslateRequest
  validId(v.requestId)
  if (!Array.isArray(v.sentences) || !v.sentences.length || v.sentences.length > 60)
    throw new Error('每批最多 60 句')
  let length = 0
  for (const s of v.sentences) {
    validId(s.id)
    stringField(s.text, 6000)
    length += s.text.length
  }
  if (length > 6000 || new Set(v.sentences.map((s) => s.id)).size !== v.sentences.length)
    throw new Error('选区太长或句子标识重复')
  if (v.profileId !== undefined) validId(v.profileId)
  if (v.presetId !== undefined) validId(v.presetId)
}
export class LLMService {
  readonly queue = new ProfileQueue()
  readonly mt: MtService
  private requests = new Map<string, AbortController>()
  constructor(
    readonly config: ConfigService,
    readonly secrets: SecretService
  ) {
    this.mt = new MtService(config, secrets)
  }
  profile(id?: string | null): ModelProfile {
    const cfg = this.config.get(),
      profile = cfg.profiles.find((p) => p.id === (id || cfg.settings.activeProfileId))
    if (!profile?.model) throw new LLMError('NO_PROFILE')
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(profile.baseUrl).hostname)
    if (!local && !this.secrets.has(profile.id)) throw new LLMError('NO_PROFILE')
    return profile
  }
  cancel(id: unknown): void {
    validId(id)
    this.requests.get(id)?.abort()
  }
  cancelAll(): void {
    for (const c of this.requests.values()) c.abort()
  }
  async stream(
    profile: ModelProfile,
    messages: ChatMessage[],
    signal: AbortSignal,
    onText: (text: string) => void,
    maxTokens?: number
  ): Promise<void> {
    await this.queue.run(profile.id, signal, async () => {
      const adapter = new FetchAdapter(profile, this.secrets.get(profile.id))
      for await (const text of adapter.chatStream(messages, {
        temperature: profile.temperature,
        maxTokens,
        signal
      }))
        onText(text)
    })
  }
  async test(value: unknown): Promise<ConnectionResult> {
    validateProfile(value, approvedHttpUrls())
    const start = Date.now(),
      controller = new AbortController()
    try {
      if (!value.model) throw new LLMError('NO_PROFILE')
      await this.stream(
        value,
        [{ role: 'user', content: 'Reply OK.' }],
        controller.signal,
        () => {},
        5
      )
      return { ok: true, latencyMs: Date.now() - start }
    } catch (e) {
      const error = e instanceof LLMError ? e : new LLMError('NETWORK')
      return { ok: false, code: error.code, message: error.message }
    }
  }
  async translate(
    value: unknown,
    delta: (d: TranslationDelta) => void,
    done: (id: string, info?: { fallback?: MtEngineId }) => void,
    fail: (e: TranslationError) => void
  ): Promise<void> {
    validateTranslate(value)
    const req = value
    if (this.requests.has(req.requestId)) throw new Error('请求标识重复')
    const controller = new AbortController(),
      signal = controller.signal
    this.requests.set(req.requestId, controller)
    const pending = new Map<string, { text: string; replace?: true }>()
    const flush = () => {
      for (const [sentenceId, { text, replace }] of pending)
        if (!signal.aborted) delta({ requestId: req.requestId, sentenceId, text, replace })
      pending.clear()
    }
    const timer = setInterval(flush, 50)
    const emit = (sentenceId: string, text: string) => {
      const prev = pending.get(sentenceId)
      pending.set(sentenceId, { ...prev, text: (prev?.text || '') + text })
    }
    // 机器翻译整句返回，覆盖该句已显示的内容（大模型中断时可能残留半句）
    const replace = (sentenceId: string, text: string) =>
      pending.set(sentenceId, { text, replace: true })
    const completed = new Set<string>()
    try {
      const { translator, llmFallbackToMt } = this.config.get().settings
      let fallback: MtEngineId | undefined
      if (translator.kind === 'mt')
        await this.translateMt(translator.engineId, req.sentences, signal, replace, completed)
      else
        try {
          await this.translateLlm(req, signal, emit, completed, flush)
        } catch (e) {
          // 网络、超时、服务异常或重试后仍限流时，未完成的句子改用微软免费引擎（设计文档 8.8）
          if (
            signal.aborted ||
            !llmFallbackToMt ||
            !(e instanceof LLMError) ||
            !['NETWORK', 'TIMEOUT', 'SERVER', 'RATE_LIMIT'].includes(e.code)
          )
            throw e
          fallback = DEFAULT_MT_ENGINE
          await this.translateMt(
            fallback,
            req.sentences.filter((s) => !completed.has(s.id)),
            signal,
            replace,
            completed
          )
        }
      flush()
      if (!signal.aborted) done(req.requestId, fallback && { fallback })
    } catch (e) {
      flush()
      if (!signal.aborted) {
        const err = e instanceof LLMError ? e : new LLMError('NETWORK')
        fail({
          requestId: req.requestId,
          code: err.code,
          message: err.message,
          sentenceIds: req.sentences.filter((s) => !completed.has(s.id)).map((s) => s.id)
        })
      }
    } finally {
      controller.abort()
      clearInterval(timer)
      this.requests.delete(req.requestId)
    }
  }
  private async translateMt(
    engineId: MtEngineId,
    sentences: TranslateRequest['sentences'],
    signal: AbortSignal,
    emit: (sentenceId: string, text: string) => void,
    completed: Set<string>
  ): Promise<void> {
    if (!sentences.length) return
    const out = await this.mt.translate(
      engineId,
      sentences.map((s) => s.text),
      signal
    )
    sentences.forEach((s, i) => {
      emit(s.id, out[i].trim())
      completed.add(s.id)
    })
  }
  private async translateLlm(
    req: TranslateRequest,
    signal: AbortSignal,
    emit: (sentenceId: string, text: string) => void,
    completed: Set<string>,
    flush: () => void
  ): Promise<void> {
    const profile = this.profile(req.profileId),
      cfg = this.config.get(),
      preset =
        cfg.presets.find((p) => p.id === (req.presetId || cfg.settings.activePresetId)) ||
        cfg.presets[0]
    const system = buildPrompt(preset)
    // Finish complete earlier sentences; never append a restarted partial translation.
    const parser = new StreamParser(req.sentences.length, (index, text) =>
      emit(req.sentences[index - 1].id, text)
    )
    let interrupted = false
    for (let attempt = 0; attempt < 3; attempt++) {
      let emitted = false
      try {
        await this.stream(
          profile,
          [
            { role: 'system', content: system },
            {
              role: 'user',
              content: req.sentences.map((s, i) => '[' + (i + 1) + '] ' + s.text).join('\n')
            }
          ],
          signal,
          (text) => {
            emitted = true
            parser.push(text)
          }
        )
        break
      } catch (e) {
        if (signal.aborted) throw e
        if (emitted) {
          interrupted = true
          break
        }
        if (
          !(e instanceof LLMError) ||
          !['RATE_LIMIT', 'SERVER', 'NETWORK', 'TIMEOUT'].includes(e.code) ||
          attempt === 2
        )
          throw e
        await delay(1000 * 2 ** attempt, signal)
      }
    }
    const missing = parser.finish()
    // When interrupted, the last numbered sentence may be truncated.
    if (interrupted) {
      const last = [...parser.values.keys()].at(-1)
      if (last && !missing.includes(last)) missing.push(last)
    }
    for (let i = 1; i <= req.sentences.length; i++)
      if (!missing.includes(i)) completed.add(req.sentences[i - 1].id)
    flush()
    if (interrupted) throw new LLMError('NETWORK')
    await Promise.all(
      missing.map(async (index) => {
        const s = req.sentences[index - 1]
        for (let attempt = 0; attempt < 3; attempt++) {
          let text = ''
          try {
            await this.stream(
              profile,
              [
                { role: 'system', content: system },
                { role: 'user', content: '[1] ' + s.text }
              ],
              signal,
              (t) => {
                text += t
              }
            )
            const cleaned = text.replace(/^\s*\[1\]\s*/, '').trim()
            if (!cleaned) throw new LLMError('SERVER')
            emit(s.id, cleaned)
            completed.add(s.id)
            return
          } catch (e) {
            if (signal.aborted) throw e
            if (
              !(e instanceof LLMError) ||
              !['RATE_LIMIT', 'SERVER', 'NETWORK', 'TIMEOUT'].includes(e.code) ||
              attempt === 2
            )
              throw e
            await delay(1000 * 2 ** attempt, signal)
          }
        }
      })
    )
  }
}
