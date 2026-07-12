import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { restoreSession, getAuthState } from './auth/sso'
import { getSettings } from './store'

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

app.whenReady().then(async () => {
  registerIpc(() => mainWindow)
  createWindow()

  // Try to restore a session silently on startup.
  try {
    await restoreSession()
    mainWindow?.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('auth:changed', getAuthState())
    })
  } catch {
    /* ignore */
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
