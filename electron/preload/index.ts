import { contextBridge, ipcRenderer } from 'electron'
import type { OpenProApi } from '@shared/types'

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OpenProApi = {
  info: () => invoke('app:info'),
  settings: {
    get: () => invoke('settings:get'),
    save: (patch) => invoke('settings:save', patch),
    reset: () => invoke('settings:reset')
  },
  hardware: () => invoke('hw:scan'),
  dialog: {
    pickFolder: (title, defaultPath) => invoke('dialog:folder', title, defaultPath),
    pickFile: (title, filters) => invoke('dialog:file', title, filters)
  },
  models: {
    catalog: () => invoke('models:catalog'),
    recommend: (hardware) => invoke('models:recommend', hardware),
    search: (query) => invoke('models:search', query),
    files: (repo) => invoke('models:files', repo),
    resolve: (repo, quant) => invoke('models:resolve', repo, quant),
    download: (req) => invoke('models:download', req),
    cancel: (jobId) => invoke('models:cancel', jobId),
    downloads: () => invoke('models:downloads'),
    installed: () => invoke('models:installed'),
    delete: (path) => invoke('models:delete', path),
    importFile: () => invoke('models:import')
  },
  metrics: {
    exportCsv: (sessionId) => invoke('metrics:exportCsv', sessionId)
  },
  engine: {
    status: () => invoke('engine:status'),
    install: () => invoke('engine:install'),
    installState: () => invoke('engine:installState'),
    start: (modelPath) => invoke('engine:start', modelPath),
    stop: () => invoke('engine:stop'),
    candidate: () => invoke('engine:candidate')
  },
  sessions: {
    list: () => invoke('sessions:list'),
    load: (id) => invoke('sessions:load', id),
    save: (session) => invoke('sessions:save', session),
    delete: (id) => invoke('sessions:delete', id),
    create: (workspace) => invoke('sessions:create', workspace)
  },
  chat: {
    send: (payload) => invoke('chat:send', payload),
    abort: (sessionId) => invoke('chat:abort', sessionId),
    approve: (requestId, decision) => invoke('chat:approve', requestId, decision)
  },
  shell: {
    openPath: (target) => invoke('shell:openPath', target),
    openModelsDir: () => invoke('shell:openModelsDir'),
    openLogs: () => invoke('shell:openLogs'),
    reveal: (target) => invoke('shell:reveal', target)
  },
  on: {
    chatDelta: (cb) => subscribe('chat:delta', cb),
    chatStep: (cb) => subscribe('chat:step', cb),
    chatTool: (cb) => subscribe('chat:tool', cb),
    chatDone: (cb) => subscribe('chat:done', cb),
    chatApproval: (cb) => subscribe('chat:approval', cb),
    engine: (cb) => subscribe('engine', cb),
    download: (cb) => subscribe('download', cb),
    engineInstall: (cb) => subscribe('engineInstall', cb),
    log: (cb) => subscribe('log', cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('menu', {
  onNewChat: (cb: () => void) => subscribe('menu:new-chat', cb),
  onOpenWorkspace: (cb: () => void) => subscribe('menu:open-workspace', cb)
})
contextBridge.exposeInMainWorld('clipboard', {
  write: (text: string) => invoke('clipboard:write', text),
  read: () => invoke<string>('clipboard:read')
})
