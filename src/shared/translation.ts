import type { MtEngineId } from './mt'
export interface TranslateRequest {
  requestId: string
  sentences: { id: string; text: string }[]
  profileId?: string
  presetId?: string
}
export interface TranslationDelta {
  requestId: string
  sentenceId: string
  text: string
  /** 为 true 时用 text 覆盖该句已有内容，而不是追加 */
  replace?: true
  /** 推理模型正在思考（text 为空），界面显示「模型思考中」 */
  thinking?: true
}
export interface TranslationDone {
  requestId: string
  /** 大模型失败后改用的机器翻译引擎；此时译文不写入大模型的缓存 */
  fallback?: MtEngineId
}
export interface TranslationError {
  requestId: string
  code: string
  message: string
  sentenceIds?: string[]
}
export interface ConnectionResult {
  ok: boolean
  latencyMs?: number
  code?: string
  message?: string
}
