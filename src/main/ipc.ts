import { SummaryService } from './services/summary.service'
import { writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { stringField } from '../shared/config'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import { ConfigService } from './services/config.service'
import { SecretService } from './services/secret.service'
import { LLMService, validateTranslate } from './services/llm/llm.service'
import { FileService } from './services/file.service'
import { isAppPage } from './security'
export function registerIPC(win: BrowserWindow, appUrl: string): void {
  const files = new FileService()
  const config = new ConfigService(),
    secrets = new SecretService(),
    llm = new LLMService(config, secrets)
  const summary = new SummaryService(llm, files)
  const payload = (arg: unknown): Record<string, unknown> => {
    if (!arg || typeof arg !== 'object' || Array.isArray(arg)) throw new Error('参数格式错误')
    return arg as Record<string, unknown>
  }
  const send = (channel: string, arg: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(channel, arg)
  }
  win.on('closed', () => {
    llm.cancelAll()
    summary.cancelAll()
  })
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
  handle(IPC.SUMMARY_START, async (arg) =>
    summary.start(
      arg,
      (p) => send(IPC.SUMMARY_PROGRESS, p),
      (r) => send(IPC.SUMMARY_RESULT, r)
    )
  )
  handle(IPC.SUMMARY_CANCEL, async (arg) => summary.cancel(payload(arg).jobId))
  handle(IPC.SUMMARY_SAVE, async (arg) => {
    const p = payload(arg)
    stringField(p.markdown, 5000000)
    stringField(p.defaultName, 512)
    const name = basename(p.defaultName).replace(/[<>:"|?*]/g, '_')
    const result = await dialog.showSaveDialog(win, {
      title: '保存全文总结',
      defaultPath: join(
        summary.lastSourcePath ? dirname(summary.lastSourcePath) : '.',
        name.endsWith('.md') ? name : name + '.md'
      ),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false }
    await writeFile(result.filePath, p.markdown, 'utf8')
    return { ok: true, path: result.filePath }
  })
  handle(IPC.CONFIG_GET, async () => config.get())
  handle(IPC.CONFIG_SET, async (arg) => config.set(arg))
  handle(IPC.SECRET_SET, async (arg) => {
    const p = payload(arg)
    secrets.set(p.profileId, p.apiKey)
  })
  handle(IPC.SECRET_HAS, async (arg) => secrets.has(payload(arg).profileId))
  handle(IPC.LLM_TEST, async (arg) => llm.test(payload(arg).profile))
  handle(IPC.LLM_CANCEL, async (arg) => llm.cancel(payload(arg).requestId))
  handle(IPC.LLM_TRANSLATE, async (arg) => {
    validateTranslate(arg)
    void llm.translate(
      arg,
      (e) => send(IPC.LLM_DELTA, e),
      (requestId) => send(IPC.LLM_DONE, { requestId }),
      (e) => send(IPC.LLM_ERROR, e)
    )
  })
}
