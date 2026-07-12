import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { restoreSession, getAuthState, handleCallbackUrl } from './auth/sso'
import { getSettings } from './store'
import { registerProtocol, findCallbackUrl } from './protocol'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const settings = getSettings()

  // Sized for the lower half of a portrait secondary monitor: tall & narrow.
  mainWindow = new BrowserWindow({
    width: 480,
    height: 900,
    minWidth: 360,
    minHeight: 480,
    show: false,
    title: 'FirstMate',
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    frame: !settings.compactMode,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite provides the dev server URL in development.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Ensure a single instance so the SSO redirect is routed to the running app.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // Windows/Linux: the browser redirect launches a second instance; its argv
  // carries the deep link. Forward it to this (primary) instance.
  app.on('second-instance', (_e, argv) => {
    const url = findCallbackUrl(argv)
    if (url) handleCallbackUrl(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // macOS delivers the deep link via open-url.
  app.on('open-url', (_e, url) => {
    handleCallbackUrl(url)
    mainWindow?.focus()
  })

  app.whenReady().then(async () => {
    registerProtocol(getSettings().callbackScheme)
    registerIpc(() => mainWindow)
    createWindow()

    // Cold start on Windows: a deep link may be in argv.
    const initialUrl = findCallbackUrl(process.argv)
    if (initialUrl) handleCallbackUrl(initialUrl)

    // Try to restore a session silently on startup.
    try {
      await restoreSession()
    } catch {
      /* ignore */
    }
    mainWindow?.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('auth:changed', getAuthState())
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
