import { SummaryService } from './services/summary.service'
import { writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { stringField } from '../shared/config'
import { BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import { ConfigService } from './services/config.service'
import { SecretService } from './services/secret.service'
import { LLMService, validateTranslate } from './services/llm/llm.service'
import { FileService, PdfSaveError } from './services/file.service'
import { isAppPage } from './security'
export function registerIPC(
  win: BrowserWindow,
  appUrl: string,
  closeConfirmed: () => void = () => win.close()
): void {
  const files = new FileService()
  const secrets = new SecretService(),
    config = new ConfigService(),
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
  const openRecent = async (arg: unknown) => {
    const file = await files.openPath(arg)
    config.set({
      recent: [
        { path: file.path, name: file.name, kind: file.kind, mtimeMs: file.mtimeMs },
        ...config.get().recent.filter((f) => f.path.toLowerCase() !== file.path.toLowerCase())
      ].slice(0, 10)
    })
    return file
  }
  handle(IPC.FILE_RECENT, async (arg) => {
    if (arg !== undefined) throw new Error('最近文件不接受参数')
    return config.get().recent
  })
  handle(IPC.FILE_OPEN, async (arg) => {
    if (arg !== undefined) throw new Error('打开文件不接受参数')
    const result = await dialog.showOpenDialog(win, {
      title: '打开 PDF 或 Markdown 文件',
      properties: ['openFile'],
      filters: [{ name: 'PDF / Markdown', extensions: ['pdf', 'md', 'markdown'] }]
    })
    return result.canceled ? null : openRecent({ path: result.filePaths[0] })
  })
  handle(IPC.FILE_OPEN_PATH, openRecent)
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
  const saveAs = async (arg: unknown) => {
    const source = files.paths.get(payload(arg).fileId as string)
    if (!source) throw new Error('文件未打开')
    const result = await dialog.showSaveDialog(win, {
      title: 'PDF 另存为',
      defaultPath: source,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath)
      return { ok: false, code: 'CANCELED', message: '已取消保存' }
    return { ok: true, ...(await files.save(arg, result.filePath, true)) }
  }
  const savePdf = async (arg: unknown, asCopy: boolean) => {
    try {
      if (asCopy) return await saveAs(arg)
      try {
        return { ok: true, ...(await files.save(arg)) }
      } catch (e) {
        if (!(e instanceof PdfSaveError) || e.code !== 'EXTERNAL_CHANGE') throw e
        const result = await dialog.showMessageBox(win, {
          type: 'warning',
          title: '文件已被其他程序修改',
          message: '文件已被其他程序修改',
          detail: '请选择覆盖、另存为或取消。',
          buttons: ['覆盖', '另存为', '取消'],
          defaultId: 2,
          cancelId: 2
        })
        if (result.response === 0) return { ok: true, ...(await files.save(arg, undefined, true)) }
        if (result.response === 1) return await saveAs(arg)
        return { ok: false, code: 'CANCELED', message: '已取消保存' }
      }
    } catch (e) {
      const code = (e as { code?: string }).code || 'SAVE_FAILED'
      return {
        ok: false,
        code,
        message: ['EBUSY', 'EPERM', 'EACCES'].includes(code)
          ? '文件正被其他程序使用，请关闭后重试，或另存为'
          : e instanceof PdfSaveError
            ? e.message
            : '保存失败，请检查文件权限或选择另存为'
      }
    }
  }
  handle(IPC.PDF_SAVE, async (arg) => savePdf(arg, false))
  handle(IPC.PDF_SAVE_AS, async (arg) => savePdf(arg, true))
  handle(IPC.APP_CLOSE_CONFIRMED, async (arg) => {
    if (arg !== undefined) throw new Error('关闭不接受参数')
    closeConfirmed()
  })
  handle(IPC.CONFIG_GET, async (arg) => {
    if (arg !== undefined) throw new Error('配置读取不接受参数')
    return config.get()
  })
  handle(IPC.CONFIG_SET, async (arg) => config.set(arg))
  handle(IPC.SECRET_SET, async (arg) => {
    const p = payload(arg)
    secrets.set(p.profileId, p.apiKey)
  })
  handle(IPC.SECRET_HAS, async (arg) => secrets.has(payload(arg).profileId))
  handle(IPC.SECRET_REVEAL, async (arg) => secrets.reveal(payload(arg).profileId))
  handle(IPC.LLM_TEST, async (arg) => llm.test(payload(arg).profile))
  handle(IPC.MT_TEST, async (arg) => llm.mt.test(arg))
  handle(IPC.CLIPBOARD_READ, async (arg) => {
    if (arg !== undefined) throw new Error('剪贴板读取不接受参数')
    return clipboard.readText().slice(0, 10000)
  })
  handle(IPC.LLM_CANCEL, async (arg) => llm.cancel(payload(arg).requestId))
  handle(IPC.LLM_TRANSLATE, async (arg) => {
    validateTranslate(arg)
    void llm
      .translate(
        arg,
        (e) => send(IPC.LLM_DELTA, e),
        (requestId, info) => send(IPC.LLM_DONE, { requestId, ...info }),
        (e) => send(IPC.LLM_ERROR, e)
      )
      .catch(() =>
        send(IPC.LLM_ERROR, {
          requestId: arg.requestId,
          code: 'NETWORK',
          message: '无法开始翻译，请重试',
          sentenceIds: arg.sentences.map((s) => s.id)
        })
      )
  })
}
