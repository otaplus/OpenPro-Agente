import { app, clipboard, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import type { AppInfo, AppSettings, ChatSendPayload, Session } from '@shared/types'
import { loadSettings, resetSettings, saveSettings, settingsFile } from './settings'
import { scanHardware } from './hardware'
import { CATALOG, recommendModels } from './catalog'
import { resolveQuant, listGgufFiles, searchModels } from './hf'
import {
  cancelDownload,
  deleteModel,
  enqueueDownload,
  importLocalGguf,
  listDownloads,
  listInstalledModels
} from './downloader'
import {
  candidateEngine,
  engineInstallState,
  engineStatus,
  installEngine,
  refreshEngineStatus,
  startEngine,
  stopEngine
} from './engine'
import { abortChat, resolveApproval, sendChat } from './agent'
import { exportMetricsCsv } from './metrics'
import { createSession, deleteSession, listSessions, loadSession, saveSession } from './sessions'
import { ensureDir } from './util'
import { log, logPathForUser } from './logger'

export function registerIpc(): void {
  ipcMain.handle('app:info', async (): Promise<AppInfo> => {
    const settings = await loadSettings()
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      userData: app.getPath('userData'),
      modelsDir: settings.modelsDir,
      engineBinary: engineStatus().binaryPath
    }
  })

  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', async (_e, patch: Partial<AppSettings>) => {
    const next = await saveSettings(patch)
    if (patch.modelsDir) await ensureDir(next.modelsDir)
    return next
  })
  ipcMain.handle('settings:reset', () => resetSettings())

  ipcMain.handle('hw:scan', async () => {
    const settings = await loadSettings()
    return scanHardware(settings.modelsDir)
  })

  ipcMain.handle('dialog:folder', async (_e, title?: string, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      title: title ?? 'Selecciona una carpeta',
      defaultPath: defaultPath || app.getPath('home'),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(
    'dialog:file',
    async (_e, title?: string, filters?: { name: string; extensions: string[] }[]) => {
      const result = await dialog.showOpenDialog({
        title: title ?? 'Selecciona un archivo',
        properties: ['openFile'],
        filters: filters ?? [{ name: 'Todos', extensions: ['*'] }]
      })
      return result.canceled ? null : result.filePaths[0]
    }
  )

  ipcMain.handle('models:catalog', () => CATALOG)
  ipcMain.handle('models:recommend', async (_e, hardware) => {
    const hw = hardware ?? (await scanHardware((await loadSettings()).modelsDir))
    return recommendModels(hw)
  })
  ipcMain.handle('models:search', (_e, query: string) => searchModels(query))
  ipcMain.handle('models:files', (_e, repo: string) => listGgufFiles(repo))
  ipcMain.handle('models:resolve', (_e, repo: string, quant: string) => resolveQuant(repo, quant))
  ipcMain.handle(
    'models:download',
    async (_e, req: { repo: string; files: { path: string; sizeBytes: number }[]; label: string }) => {
      if (!req.files?.length) throw new Error('No se indicaron archivos para descargar.')
      const jobs = []
      for (const file of req.files) {
        jobs.push(
          await enqueueDownload({
            repo: req.repo,
            file: file.path,
            sizeBytes: file.sizeBytes,
            label: req.label
          })
        )
      }
      return jobs
    }
  )
  ipcMain.handle('models:cancel', (_e, jobId: string) => cancelDownload(jobId))
  ipcMain.handle('models:downloads', () => listDownloads())
  ipcMain.handle('models:installed', () => listInstalledModels())
  ipcMain.handle('models:delete', (_e, target: string) => deleteModel(target))
  ipcMain.handle('models:import', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Importar modelo GGUF',
      properties: ['openFile'],
      filters: [{ name: 'Modelos GGUF', extensions: ['gguf'] }]
    })
    if (picked.canceled || !picked.filePaths[0]) return null
    return importLocalGguf(picked.filePaths[0])
  })

  ipcMain.handle('engine:status', async () => refreshEngineStatus())
  ipcMain.handle('engine:install', () => installEngine())
  ipcMain.handle('engine:installState', () => engineInstallState())
  ipcMain.handle('engine:start', (_e, modelPath: string) => startEngine(modelPath))
  ipcMain.handle('engine:stop', () => stopEngine())
  ipcMain.handle('engine:candidate', () => candidateEngine())

  ipcMain.handle('sessions:list', () => listSessions())
  ipcMain.handle('sessions:load', (_e, id: string) => loadSession(id))
  ipcMain.handle('sessions:save', (_e, session: Session) => saveSession(session))
  ipcMain.handle('sessions:delete', (_e, id: string) => deleteSession(id))
  ipcMain.handle('sessions:create', (_e, workspace: string | null) => createSession(workspace))

  ipcMain.handle('chat:send', async (_e, payload: ChatSendPayload) => {
    await sendChat(payload)
  })
  ipcMain.handle('chat:abort', (_e, sessionId: string) => abortChat(sessionId))
  ipcMain.handle('chat:approve', (_e, requestId: string, decision) => resolveApproval(requestId, decision))

  ipcMain.handle('shell:openPath', async (_e, target: string) => {
    await shell.openPath(target)
  })
  ipcMain.handle('shell:openModelsDir', async () => {
    const settings = await loadSettings()
    await ensureDir(settings.modelsDir)
    await shell.openPath(settings.modelsDir)
  })
  ipcMain.handle('shell:openLogs', async () => {
    await shell.openPath(path.dirname(logPathForUser()))
  })
  ipcMain.handle('shell:reveal', (_e, target: string) => {
    shell.showItemInFolder(target)
  })

  ipcMain.handle('app:settingsFile', () => settingsFile())

  ipcMain.handle('metrics:exportCsv', (_e, sessionId?: string) => exportMetricsCsv(sessionId))

  ipcMain.handle('clipboard:write', (_e, text: string) => {
    clipboard.writeText(String(text ?? ''))
  })
  ipcMain.handle('clipboard:read', () => clipboard.readText())

  log('info', 'IPC registrado')
}
