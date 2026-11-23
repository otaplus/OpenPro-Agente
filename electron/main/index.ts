import { app, BrowserWindow, Menu, session, shell } from 'electron'
import path from 'node:path'
import { setEngineRoot, stopEngine } from './engine'
import { registerIpc } from './ipc'
import { setMainWindow } from './bus'
import { log } from './logger'
import { loadSettings } from './settings'

// La consola puede cerrarse aunque la app siga viva (p. ej. si se lanzó desde
// una terminal): los EPIPE no deben convertirse en una excepción sin capturar.
for (const stream of [process.stdout, process.stderr]) stream.on('error', () => {})

app.setName('OpenPro Agente')
// La UI es texto y código: no merece la pena arriesgarse a un driver gráfico
// inestable (GPU integradas antiguas) que tumbe la ventana.
app.disableHardwareAcceleration()
setEngineRoot(path.join(app.getPath('userData'), 'engine'))

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // En algunos equipos/entornos Windows no se puede crear el archivo de bloqueo
  // de instancia única (Acceso denegado). Cerrar la app ahí sería un fallo
  // invisible: mejor seguir y avisar, aunque no podamos impedir una 2ª instancia.
  log('warn', 'No se pudo crear el bloqueo de instancia única (permisos); continuando.')
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#0b0f14',
    title: 'OpenPro Agente',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true
    }
  })

  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    if (process.env['OPENPRO_DEVTOOLS'] === '1') mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    setMainWindow(null)
    mainWindow = null
  })

  mainWindow.on('close', () => log('warn', 'Ventana cerrándose'))
  mainWindow.on('unresponsive', () => log('error', 'Ventana no responde'))
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('error', `Proceso de render cerrado: ${details.reason} (código ${details.exitCode})`)
  })
  mainWindow.webContents.on('unresponsive', () => log('error', 'Renderer no responde'))
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    log('error', `Error en preload ${preloadPath}`, error.stack ?? String(error))
  })
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nueva conversación',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-chat')
        },
        {
          label: 'Abrir carpeta de proyecto…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-workspace')
        },
        { type: 'separator' },
        {
          label: 'Abrir carpeta de modelos',
          click: async () => {
            const s = await loadSettings()
            void shell.openPath(s.modelsDir)
          }
        },
        {
          label: 'Abrir logs',
          click: () => void shell.openPath(path.join(app.getPath('userData'), 'logs'))
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Documentación de llama.cpp',
          click: () => void shell.openExternal('https://github.com/ggml-org/llama.cpp')
        },
        {
          label: 'Modelos en HuggingFace',
          click: () => void shell.openExternal('https://huggingface.co/models?library=gguf')
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  if (!process.env['ELECTRON_RENDERER_URL']) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'"
          ]
        }
      })
    })
  }
  registerIpc()
  buildMenu()
  createWindow()
  log('info', `OpenPro Agente ${app.getVersion()} iniciado en ${process.platform}/${process.arch}`)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  log('warn', 'Todas las ventanas cerradas')
  if (process.platform !== 'darwin') app.quit()
})

app.on('child-process-gone', (_event, details) => {
  log('error', `Proceso hijo (${details.type}) terminado: ${details.reason} (código ${details.exitCode})`)
})

let quitting = false

app.on('before-quit', (event) => {
  log('warn', 'Solicitud de cierre de la aplicación')
  if (quitting) return
  event.preventDefault()
  quitting = true
  void stopEngine().finally(() => app.quit())
})

process.on('uncaughtException', (err) => {
  log('error', 'Excepción no capturada', err.stack ?? String(err))
})
process.on('unhandledRejection', (reason) => {
  log('error', 'Promesa rechazada sin manejar', String(reason))
})
