import { IPC } from '../shared/ipc'
import { app, BrowserWindow, Menu, session, shell, dialog } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerIPC } from './ipc'
import { isAppPage, isExternalLink } from './security'
app.setName('yidu')
if (app.commandLine.hasSwitch('user-data-dir'))
  app.setPath('userData', app.commandLine.getSwitchValue('user-data-dir'))
function createWindow(): void {
  const appUrl = process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).href
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    useContentSize: true,
    title: '译读',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  const shortcut = (key: string, shiftKey = false) => {
    if (!win.isDestroyed())
      void win.webContents
        .executeJavaScript(
          'window.dispatchEvent(new KeyboardEvent("keydown",' +
            JSON.stringify({ key, ctrlKey: true, shiftKey, bubbles: true }) +
            '))'
        )
        .catch(() => {})
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: '文件',
        submenu: [
          { label: '打开文件', accelerator: 'CmdOrCtrl+O', click: () => shortcut('o') },
          { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => shortcut('s') },
          { label: '另存为', accelerator: 'CmdOrCtrl+Shift+S', click: () => shortcut('s', true) },
          { type: 'separator' },
          { label: '关闭标签', accelerator: 'CmdOrCtrl+W', click: () => shortcut('w') },
          { label: '退出', click: () => win.close() }
        ]
      }
    ])
  )
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalLink(url)) void shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppPage(url, appUrl)) event.preventDefault()
  })
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())
  let allowClose = false,
    fallbackOpen = false
  const confirmClose = () => {
    allowClose = true
    win.close()
  }
  const fallback = async () => {
    if (win.isDestroyed() || allowClose || fallbackOpen) return
    fallbackOpen = true
    try {
      const result = await dialog.showMessageBox(win, {
        type: 'warning',
        title: '阅读器没有响应',
        message: '阅读器没有响应，尚未保存的编辑可能丢失。',
        buttons: ['继续等待', '退出并放弃未保存修改'],
        defaultId: 0,
        cancelId: 0
      })
      if (result.response === 1) confirmClose()
    } finally {
      fallbackOpen = false
    }
  }
  win.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    if (win.webContents.isCrashed()) {
      void fallback()
      return
    }
    win.webContents.send(IPC.APP_CLOSE_REQUEST)
    // A responsive renderer may be waiting for the user in the save dialog.
    // Only trigger the native fallback if it cannot acknowledge this liveness probe.
    const timer = setTimeout(() => void fallback(), 5000)
    void win.webContents
      .executeJavaScript('Boolean(document.documentElement)')
      .then(() => clearTimeout(timer))
      .catch(() => {
        clearTimeout(timer)
        void fallback()
      })
  })
  registerIPC(win, appUrl, confirmClose)
  win.once('ready-to-show', () => win.show())
  void win.loadURL(appUrl)
}
void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  session.defaultSession.setPermissionCheckHandler(() => false)
  createWindow()
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
