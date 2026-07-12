import { app, shell, BrowserWindow, protocol } from 'electron'
import { join, extname } from 'path'
import { existsSync, mkdirSync, appendFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { registerIpc } from './ipc'
import { restoreSession, getAuthState, handleCallbackUrl } from './auth/sso'
import { getSettings } from './store'
import { registerProtocol, findCallbackUrl } from './protocol'
import { initUpdater } from './updater'

let mainWindow: BrowserWindow | null = null

const APP_SCHEME = 'app'
const RENDERER_DIR = join(__dirname, '../renderer')

/** Append a line to userData/firstmate/startup.log — survives having no window. */
function logStartup(msg: string): void {
  try {
    const dir = join(app.getPath('userData'), 'firstmate')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'startup.log'), `[${new Date().toISOString()}] ${msg}\n`)
  } catch {
    /* logging must never crash startup */
  }
}

process.on('uncaughtException', (e) => logStartup(`uncaughtException: ${(e as Error)?.stack ?? e}`))
process.on('unhandledRejection', (e) => logStartup(`unhandledRejection: ${String(e)}`))

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json'
}

// Must be registered before the app is ready. A standard, secure scheme makes
// the packaged renderer behave like http (CSP 'self', ES modules, and CORS all
// work) instead of the brittle file:// path.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])

/** Serve the built renderer from `app://bundle/...`. */
function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const { pathname } = new URL(request.url)
      const rel = !pathname || pathname === '/' ? '/index.html' : decodeURIComponent(pathname)
      const filePath = join(RENDERER_DIR, rel)
      // Guard against path traversal outside the renderer dir.
      if (!filePath.startsWith(RENDERER_DIR)) return new Response('Forbidden', { status: 403 })
      const data = await readFile(filePath)
      const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(data), { headers: { 'content-type': type } })
    } catch (e) {
      logStartup(`protocol.handle error for ${request.url}: ${String(e)}`)
      return new Response('Not found', { status: 404 })
    }
  })
}

function showWindow(reason: string): void {
  if (!mainWindow) return
  if (!mainWindow.isVisible()) {
    logStartup(`showing window (${reason})`)
    mainWindow.show()
  }
  mainWindow.focus()
}

function createWindow(): void {
  const settings = getSettings()

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
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const wc = mainWindow.webContents

  // Show as soon as the content is ready — but never depend on a single event.
  mainWindow.once('ready-to-show', () => showWindow('ready-to-show'))
  wc.once('did-finish-load', () => showWindow('did-finish-load'))
  // Fallback: if neither of the above fires (renderer trouble), show anyway so
  // the app is never invisible.
  const fallback = setTimeout(() => showWindow('fallback-timer'), 4000)
  mainWindow.once('show', () => clearTimeout(fallback))

  wc.on('did-fail-load', (_e, code, desc, url) => {
    logStartup(`did-fail-load ${code} ${desc} ${url}`)
    showWindow('did-fail-load')
    if (!app.isPackaged || process.env.FIRSTMATE_DEBUG) wc.openDevTools({ mode: 'detach' })
  })
  wc.on('render-process-gone', (_e, details) =>
    logStartup(`render-process-gone: ${JSON.stringify(details)}`)
  )
  wc.on('preload-error', (_e, path, error) => logStartup(`preload-error ${path}: ${error.stack}`))

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Dev: Vite dev server over http. Prod: our custom app:// scheme.
  if (process.env['ELECTRON_RENDERER_URL']) {
    logStartup(`loading dev URL ${process.env['ELECTRON_RENDERER_URL']}`)
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    logStartup(`loading app://bundle/index.html (renderer dir ${RENDERER_DIR})`)
    if (!existsSync(join(RENDERER_DIR, 'index.html'))) {
      logStartup(`WARNING: renderer index.html not found at ${RENDERER_DIR}`)
    }
    mainWindow.loadURL(`${APP_SCHEME}://bundle/index.html`)
  }
}

// Single instance so the SSO redirect is routed to the running app.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  logStartup('second instance — quitting')
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const url = findCallbackUrl(argv)
    if (url) handleCallbackUrl(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      showWindow('second-instance')
    }
  })

  app.on('open-url', (_e, url) => {
    handleCallbackUrl(url)
    showWindow('open-url')
  })

  app.whenReady().then(async () => {
    logStartup(`app ready (packaged=${app.isPackaged}, version=${app.getVersion()})`)
    try {
      registerAppProtocol()
      registerProtocol(getSettings().callbackScheme)
      registerIpc(() => mainWindow)
      createWindow()
    } catch (e) {
      logStartup(`fatal during startup: ${(e as Error)?.stack ?? e}`)
      // Try to surface a window even on failure.
      if (!mainWindow) createWindow()
    }

    const initialUrl = findCallbackUrl(process.argv)
    if (initialUrl) handleCallbackUrl(initialUrl)

    try {
      await restoreSession()
    } catch {
      /* ignore */
    }
    initUpdater()
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
