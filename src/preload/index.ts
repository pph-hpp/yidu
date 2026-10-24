import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type YiduAPI } from '../shared/ipc'
const api: YiduAPI = {
  openFile: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  openPath: (req) => ipcRenderer.invoke(IPC.FILE_OPEN_PATH, req)
}
contextBridge.exposeInMainWorld('api', api)
