// Tipos compartidos entre el proceso principal de Electron y el renderer.

export type Backend = 'cuda' | 'metal' | 'vulkan' | 'rocm' | 'cpu'

export interface GpuInfo {
  name: string
  vendor: string
  vramMB: number | null
  backend: Backend
  driver?: string
}

export interface HardwareInfo {
  platform: NodeJS.Platform
  arch: string
  osLabel: string
  cpuModel: string
  cpuCores: number
  cpuThreads: number
  ramGB: number
  gpus: GpuInfo[]
  unifiedMemory: boolean
  totalVramGB: number
  backend: Backend
  freeDiskGB: number
  notes: string[]
}

export interface QuantOption {
  /** Etiqueta corta, p. ej. Q4_K_M */
  quant: string
  /** Tamaño aproximado del archivo en GB */
  sizeGB: number
  /** Calidad relativa 0-100 para ordenar */
  quality: number
}

/** Parámetros de muestreo recomendados por el autor del modelo. */
export interface ModelSampling {
  temperature?: number
  topK?: number
  topP?: number
  repeatPenalty?: number
}

export interface CatalogModel {
  id: string
  name: string
  vendor: string
  /** Parámetros totales en miles de millones */
  paramsB: number
  /** Parámetros activos (solo modelos MoE) */
  activeParamsB?: number
  /** Repositorio de HuggingFace que contiene los GGUF */
  repo: string
  coding: boolean
  toolUse: boolean
  ctxK: number
  license: string
  description: string
  quants: QuantOption[]
  /** RAM mínima del sistema para que sea usable en CPU */
  minAppRamGB: number
  /** Muestreo recomendado; se envía al motor para frenar bucles y ruido. */
  sampling?: ModelSampling
}

export type FitLevel = 'gpu' | 'unified' | 'hybrid' | 'cpu' | 'no'

export interface ModelRecommendation {
  model: CatalogModel
  quant: QuantOption
  fit: FitLevel
  score: number
  /** Porcentaje de capas que se pueden mandar a la GPU */
  gpuLayersPct: number
  estimatedSpeed: string
  reasons: string[]
  warnings: string[]
}

export interface HfModelSummary {
  id: string
  downloads: number
  likes: number
  lastModified?: string
  tags: string[]
  gated: boolean
}

export interface HfFile {
  path: string
  sizeBytes: number
  /** Parte de un GGUF dividido, p. ej. 1 de 3 */
  split?: { index: number; total: number }
  isMmproj?: boolean
}

export interface ResolvedQuant {
  quant: string
  files: HfFile[]
  sizeBytes: number
  exact: boolean
}

export interface DownloadJob {
  id: string
  repo: string
  file: string
  label: string
  url: string
  dest: string
  sizeBytes: number
  receivedBytes: number
  speedBps: number
  etaSeconds: number | null
  status: 'queued' | 'downloading' | 'verifying' | 'done' | 'error' | 'cancelled'
  error?: string
  startedAt?: number
  finishedAt?: number
}

export interface InstalledModel {
  id: string
  name: string
  path: string
  sizeBytes: number
  repo?: string
  quant?: string
  modifiedAt: number
  parts: number
  valid: boolean
}

export type EngineState = 'stopped' | 'starting' | 'ready' | 'error'

export interface EngineStatus {
  state: EngineState
  installed: boolean
  binaryPath: string | null
  version?: string
  backend: Backend | null
  modelPath: string | null
  modelName: string | null
  port: number | null
  message?: string
}

export interface EngineInstallState {
  running: boolean
  stage: string
  pct: number
  message?: string
  error?: string
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

/** Métricas de una generación, para comparar modelos con números. */
export interface MessageMetrics {
  /** Modelo que generó la respuesta (nombre del archivo GGUF). */
  model?: string
  backend?: Backend
  /** Tokens del prompt: historial + mensajes + esquemas de herramientas. */
  promptTokens: number
  /** Tokens generados (razonamiento + respuesta). */
  completionTokens: number
  /** Parte del prompt que ya estaba en caché (no se reprocesa). */
  cachedTokens?: number
  /** Evaluación del prompt (prefill). */
  promptMs?: number
  promptTokPerSec?: number
  /** Generación de la respuesta. */
  genMs?: number
  genTokPerSec?: number
  /** Tiempo hasta el primer token visible, medido en el cliente. */
  firstTokenMs?: number
  /** Duración total de la llamada al motor. */
  totalMs?: number
  /** Pasos del agente que se acumulan en este mensaje. */
  steps?: number
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  reasoning?: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  toolName?: string
  createdAt: number
  error?: string
  toolStatus?: 'done' | 'error' | 'denied'
  /** Métricas de la respuesta (tokens, velocidad, tiempos). */
  metrics?: MessageMetrics
  meta?: {
    model?: string
    tokens?: number
    durationMs?: number
    steps?: number
  }
}

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  workspace: string | null
  modelPath: string | null
  messages: ChatMessage[]
}

export interface SessionSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  workspace: string | null
  messageCount: number
}

export interface AppSettings {
  version: number
  modelsDir: string
  onboardingDone: boolean
  theme: 'dark' | 'light'
  hfToken: string
  engine: {
    mode: 'managed' | 'external'
    binaryPath: string
    port: number
    backend: 'auto' | Backend
    ctxSize: number
    gpuLayers: number
    threads: number
    extraArgs: string
    installedTag: string | null
  }
  agent: {
    maxSteps: number
    approvalMode: 'ask' | 'auto'
    /** plan = solo lectura; workspace = escribir en el proyecto; full = cualquier ruta. */
    permission: 'plan' | 'workspace' | 'full'
    temperature: number
    maxTokens: number
    systemExtra: string
    allowList: string[]
    webFetch: boolean
  }
  lastWorkspace: string | null
  lastModelPath: string | null
}

export interface ChatSendPayload {
  sessionId: string
  text: string
  workspace: string | null
  modelPath: string | null
}

export interface ApprovalRequest {
  id: string
  sessionId: string
  call: ToolCall
  kind: 'command' | 'write'
  preview: string
  reason: string
}

export type ApprovalDecision = 'once' | 'always' | 'deny'

// ------------------------------- Eventos ---------------------------------

export interface ChatDeltaEvent {
  sessionId: string
  messageId: string
  kind: 'content' | 'reasoning'
  text: string
}

export interface ChatStepEvent {
  sessionId: string
  step: number
  maxSteps: number
}

export interface ChatToolEvent {
  sessionId: string
  messageId: string
  call: ToolCall
  status: 'pending' | 'running' | 'done' | 'error' | 'denied'
  result?: string
  durationMs?: number
}

export interface ChatDoneEvent {
  sessionId: string
  messageId: string
  content: string
  reasoning?: string
  steps: number
  durationMs: number
  /** Totales de la respuesta terminada (para el pie de métricas). */
  metrics?: MessageMetrics
  aborted?: boolean
  error?: string
}

export interface EngineEvent {
  status: EngineStatus
}

export interface DownloadEvent {
  job: DownloadJob
}

export interface LogEvent {
  level: 'info' | 'warn' | 'error'
  message: string
  at: number
}

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  arch: string
  userData: string
  modelsDir: string
  engineBinary: string | null
}

// ------------------------------- API -------------------------------------

export interface OpenProApi {
  info(): Promise<AppInfo>
  settings: {
    get(): Promise<AppSettings>
    save(patch: Partial<AppSettings>): Promise<AppSettings>
    reset(): Promise<AppSettings>
  }
  hardware(): Promise<HardwareInfo>
  dialog: {
    pickFolder(title?: string, defaultPath?: string): Promise<string | null>
    pickFile(title?: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null>
  }
  models: {
    catalog(): Promise<CatalogModel[]>
    recommend(hardware: HardwareInfo): Promise<ModelRecommendation[]>
    search(query: string): Promise<HfModelSummary[]>
    files(repo: string): Promise<HfFile[]>
    resolve(repo: string, quant: string): Promise<ResolvedQuant>
    download(req: {
      repo: string
      files: { path: string; sizeBytes: number }[]
      label: string
    }): Promise<DownloadJob[]>
    cancel(jobId: string): Promise<void>
    downloads(): Promise<DownloadJob[]>
    installed(): Promise<InstalledModel[]>
    delete(path: string): Promise<void>
    importFile(): Promise<DownloadJob | null>
  }
  engine: {
    status(): Promise<EngineStatus>
    install(): Promise<EngineStatus>
    installState(): Promise<EngineInstallState>
    start(modelPath: string): Promise<EngineStatus>
    stop(): Promise<EngineStatus>
    candidate(): Promise<{ tag: string; asset: string; url: string } | null>
  }
  sessions: {
    list(): Promise<SessionSummary[]>
    load(id: string): Promise<Session | null>
    save(session: Session): Promise<void>
    delete(id: string): Promise<void>
    create(workspace: string | null): Promise<Session>
  }
  chat: {
    send(payload: ChatSendPayload): Promise<void>
    abort(sessionId: string): Promise<void>
    approve(requestId: string, decision: ApprovalDecision): Promise<void>
  }
  shell: {
    openPath(target: string): Promise<void>
    openModelsDir(): Promise<void>
    openLogs(): Promise<void>
    reveal(target: string): Promise<void>
  }
  on: {
    chatDelta(cb: (e: ChatDeltaEvent) => void): () => void
    chatStep(cb: (e: ChatStepEvent) => void): () => void
    chatTool(cb: (e: ChatToolEvent) => void): () => void
    chatDone(cb: (e: ChatDoneEvent) => void): () => void
    chatApproval(cb: (e: ApprovalRequest) => void): () => void
    engine(cb: (e: EngineEvent) => void): () => void
    download(cb: (e: DownloadEvent) => void): () => void
    engineInstall(cb: (e: EngineInstallState) => void): () => void
    log(cb: (e: LogEvent) => void): () => void
  }
}
