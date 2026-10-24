import type { OpenedFile } from './types'
export const IPC = {
  FILE_OPEN: 'file:open', FILE_OPEN_PATH: 'file:openPath', FILE_RECENT: 'file:recent',
  PDF_SAVE: 'pdf:save', PDF_SAVE_AS: 'pdf:saveAs',
  LLM_TRANSLATE: 'llm:translate', LLM_CANCEL: 'llm:cancel', LLM_DELTA: 'llm:delta',
  LLM_DONE: 'llm:done', LLM_ERROR: 'llm:error', LLM_TEST: 'llm:test',
  SUMMARY_START: 'summary:start', SUMMARY_PROGRESS: 'summary:progress',
  SUMMARY_RESULT: 'summary:result', SUMMARY_SAVE: 'summary:save', SUMMARY_CANCEL: 'summary:cancel',
  CONFIG_GET: 'config:get', CONFIG_SET: 'config:set', SECRET_SET: 'secret:set', SECRET_HAS: 'secret:has',
  APP_CLOSE_REQUEST: 'app:closeRequest', APP_CLOSE_CONFIRMED: 'app:closeConfirmed'
} as const
export interface OpenPathRequest { path: string }
// Only implemented M1 methods are exposed. Future channels are not callable yet.
export interface YiduAPI {
  openFile(): Promise<OpenedFile | null>
  openPath(req: OpenPathRequest): Promise<OpenedFile>
}

