import type { PdfSaveRequest, PdfSaveResult } from './annotations'
import type { SummaryRequest, SummaryProgress, SummaryResult } from './summary'
import type { AppConfig } from './config'
import type {
  TranslateRequest,
  TranslationDelta,
  TranslationError,
  TranslationDone,
  ConnectionResult
} from './translation'
import type { MtEngineId } from './mt'
import type { ModelProfile } from './types'
import type { OpenedFile, RecentFile } from './types'
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
  MT_TEST: 'mt:test',
  CLIPBOARD_READ: 'clipboard:read',
  SUMMARY_START: 'summary:start',
  SUMMARY_PROGRESS: 'summary:progress',
  SUMMARY_RESULT: 'summary:result',
  SUMMARY_SAVE: 'summary:save',
  SUMMARY_CANCEL: 'summary:cancel',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  SECRET_SET: 'secret:set',
  SECRET_HAS: 'secret:has',
  SECRET_REVEAL: 'secret:reveal',
  APP_CLOSE_REQUEST: 'app:closeRequest',
  APP_CLOSE_CONFIRMED: 'app:closeConfirmed'
} as const
export interface OpenPathRequest {
  path: string
}
// Expose individual validated operations, never generic IPC.
export interface YiduAPI {
  recentFiles(): Promise<RecentFile[]>
  getPathForFile(file: File): string
  onOpenPaths(callback: (paths: string[]) => void): () => void
  savePdf(req: PdfSaveRequest): Promise<PdfSaveResult>
  savePdfAs(req: PdfSaveRequest): Promise<PdfSaveResult>
  onCloseRequest(callback: () => void): () => void
  confirmClose(): Promise<void>
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
  revealSecret(req: { profileId: string }): Promise<string>
  testConnection(req: { profile: ModelProfile }): Promise<ConnectionResult>
  testMtEngine(req: {
    engineId: MtEngineId
    appKey?: string
    appSecret?: string
  }): Promise<ConnectionResult>
  /** 只允许在用户点击「从剪贴板识别」后调用 */
  readClipboard(): Promise<string>
  translate(req: TranslateRequest): Promise<void>
  cancelTranslation(req: { requestId: string }): Promise<void>
  onTranslationDelta(callback: (event: TranslationDelta) => void): () => void
  onTranslationDone(callback: (event: TranslationDone) => void): () => void
  onTranslationError(callback: (event: TranslationError) => void): () => void
  openFile(): Promise<OpenedFile | null>
  openPath(req: OpenPathRequest): Promise<OpenedFile>
}
