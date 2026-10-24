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
