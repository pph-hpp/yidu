import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type YiduAPI } from '../shared/ipc'
function on<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
let pendingPaths: string[][] = []
let openCallback: ((paths: string[]) => void) | undefined
ipcRenderer.on(IPC.FILE_OPEN_PATH, (_event, paths: string[]) => {
  if (openCallback) openCallback(paths)
  else pendingPaths.push(paths)
})
const api: YiduAPI = {
  recentFiles: () => ipcRenderer.invoke(IPC.FILE_RECENT),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onOpenPaths: (callback) => {
    openCallback = callback
    for (const paths of pendingPaths) callback(paths)
    pendingPaths = []
    return () => {
      if (openCallback === callback) openCallback = undefined
    }
  },
  savePdf: (req) => ipcRenderer.invoke(IPC.PDF_SAVE, req),
  savePdfAs: (req) => ipcRenderer.invoke(IPC.PDF_SAVE_AS, req),
  onCloseRequest: (callback) => on(IPC.APP_CLOSE_REQUEST, callback),
  confirmClose: () => ipcRenderer.invoke(IPC.APP_CLOSE_CONFIRMED),
  startSummary: (req) => ipcRenderer.invoke(IPC.SUMMARY_START, req),
  cancelSummary: (req) => ipcRenderer.invoke(IPC.SUMMARY_CANCEL, req),
  saveSummary: (req) => ipcRenderer.invoke(IPC.SUMMARY_SAVE, req),
  onSummaryProgress: (callback) => on(IPC.SUMMARY_PROGRESS, callback),
  onSummaryResult: (callback) => on(IPC.SUMMARY_RESULT, callback),
  openFile: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  openPath: (req) => ipcRenderer.invoke(IPC.FILE_OPEN_PATH, req),
  getConfig: () => ipcRenderer.invoke(IPC.CONFIG_GET),
  setConfig: (patch) => ipcRenderer.invoke(IPC.CONFIG_SET, patch),
  setSecret: (req) => ipcRenderer.invoke(IPC.SECRET_SET, req),
  hasSecret: (req) => ipcRenderer.invoke(IPC.SECRET_HAS, req),
  revealSecret: (req) => ipcRenderer.invoke(IPC.SECRET_REVEAL, req),
  testConnection: (req) => ipcRenderer.invoke(IPC.LLM_TEST, req),
  testMtEngine: (req) => ipcRenderer.invoke(IPC.MT_TEST, req),
  readClipboard: () => ipcRenderer.invoke(IPC.CLIPBOARD_READ),
  translate: (req) => ipcRenderer.invoke(IPC.LLM_TRANSLATE, req),
  cancelTranslation: (req) => ipcRenderer.invoke(IPC.LLM_CANCEL, req),
  onTranslationDelta: (callback) => on(IPC.LLM_DELTA, callback),
  onTranslationDone: (callback) => on(IPC.LLM_DONE, callback),
  onTranslationError: (callback) => on(IPC.LLM_ERROR, callback)
}
contextBridge.exposeInMainWorld('api', api)
