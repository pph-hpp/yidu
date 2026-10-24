import type { SummaryRequest, SummaryProgress, SummaryResult } from './summary'
import type { AppConfig } from './config'
import type {
  TranslateRequest,
  TranslationDelta,
  TranslationError,
  ConnectionResult
} from './translation'
import type { ModelProfile } from './types'
import type { OpenedFile } from './types'
export const IPC = {
  FILE_OPEN: 'file:open',
  FILE_OPEN_PATH: 'file:openPath',
  FILE_RECENT: 'file:recent',
  PDF_SAVE: 'pdf:save',
  PDF_SAVE_AS: 'pdf:saveAs',
  LLM_TRANSLATE: 'llm:translate',
  LLM_CANCEL: 'llm:cancel',
  LLM_DELTA: 'llm:delta',
  LLM_DONE: 'llm:done',
  LLM_ERROR: 'llm:error',
  LLM_TEST: 'llm:test',
  SUMMARY_START: 'summary:start',
  SUMMARY_PROGRESS: 'summary:progress',
  SUMMARY_RESULT: 'summary:result',
  SUMMARY_SAVE: 'summary:save',
  SUMMARY_CANCEL: 'summary:cancel',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  SECRET_SET: 'secret:set',
  SECRET_HAS: 'secret:has',
  APP_CLOSE_REQUEST: 'app:closeRequest',
  APP_CLOSE_CONFIRMED: 'app:closeConfirmed'
} as const
export interface OpenPathRequest {
  path: string
}
// Expose individual validated operations, never generic IPC.
export interface YiduAPI {
  startSummary(req: SummaryRequest): Promise<void>
  cancelSummary(req: { jobId: string }): Promise<void>
  saveSummary(req: {
    markdown: string
    defaultName: string
  }): Promise<{ ok: boolean; path?: string }>
  onSummaryProgress(callback: (event: SummaryProgress) => void): () => void
  onSummaryResult(callback: (event: SummaryResult) => void): () => void
  getConfig(): Promise<AppConfig>
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>
  setSecret(req: { profileId: string; apiKey: string }): Promise<void>
  hasSecret(req: { profileId: string }): Promise<boolean>
  testConnection(req: { profile: ModelProfile }): Promise<ConnectionResult>
  translate(req: TranslateRequest): Promise<void>
  cancelTranslation(req: { requestId: string }): Promise<void>
  onTranslationDelta(callback: (event: TranslationDelta) => void): () => void
  onTranslationDone(callback: (event: { requestId: string }) => void): () => void
  onTranslationError(callback: (event: TranslationError) => void): () => void
  openFile(): Promise<OpenedFile | null>
  openPath(req: OpenPathRequest): Promise<OpenedFile>
}
