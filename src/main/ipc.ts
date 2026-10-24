import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import { FileService } from './services/file.service'
import { isAppPage } from './security'
export function registerIPC(win: BrowserWindow, appUrl: string): void {
  const files = new FileService()
  const handle = (channel: string, run: (arg: unknown) => Promise<unknown>) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (event, arg: unknown) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame ||
        !event.senderFrame ||
        !isAppPage(event.senderFrame.url, appUrl)
      )
        throw new Error('拒绝不可信页面的请求')
      return run(arg)
    })
  }
  handle(IPC.FILE_OPEN, async (arg) => {
    if (arg !== undefined) throw new Error('打开文件不接受参数')
    const result = await dialog.showOpenDialog(win, {
      title: '打开 PDF 或 Markdown 文件',
      properties: ['openFile'],
      filters: [{ name: 'PDF / Markdown', extensions: ['pdf', 'md', 'markdown'] }]
    })
    return result.canceled ? null : files.openPath({ path: result.filePaths[0] })
  })
  handle(IPC.FILE_OPEN_PATH, (arg) => files.openPath(arg))
}
