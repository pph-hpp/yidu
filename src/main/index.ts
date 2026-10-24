import { app, BrowserWindow, Menu, session, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerIPC } from './ipc'
import { isAppPage, isExternalLink } from './security'
app.setName('yidu')
function createWindow(): void {
  const appUrl = process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).href
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600, useContentSize: true,
    title: '译读', show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true
    }
  })
  Menu.setApplicationMenu(null)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalLink(url)) void shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppPage(url, appUrl)) event.preventDefault()
  })
  win.webContents.on('will-attach-webview', event => event.preventDefault())
  registerIPC(win, appUrl)
  win.once('ready-to-show', () => win.show())
  void win.loadURL(appUrl)
}
void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

