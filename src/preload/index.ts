import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type YiduAPI } from '../shared/ipc'
function on<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
const api: YiduAPI = {
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
  testConnection: (req) => ipcRenderer.invoke(IPC.LLM_TEST, req),
  translate: (req) => ipcRenderer.invoke(IPC.LLM_TRANSLATE, req),
  cancelTranslation: (req) => ipcRenderer.invoke(IPC.LLM_CANCEL, req),
  onTranslationDelta: (callback) => on(IPC.LLM_DELTA, callback),
  onTranslationDone: (callback) => on(IPC.LLM_DONE, callback),
  onTranslationError: (callback) => on(IPC.LLM_ERROR, callback)
}
contextBridge.exposeInMainWorld('api', api)
