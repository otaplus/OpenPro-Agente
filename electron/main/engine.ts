import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import type { Backend, EngineInstallState, EngineStatus, ModelSampling, ToolCall } from '@shared/types'
import { loadSettings, saveSettings } from './settings'
import { emit } from './bus'
import { log } from './logger'
import { ensureDir, extractArchive, fetchJson, findFile, findAllFiles, pathExists, run, sleep, truncate, uid } from './util'

const GITHUB_RELEASES = 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10'

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface Release {
  tag_name: string
  name: string
  assets: ReleaseAsset[]
}

interface Manifest {
  tag: string
  asset: string
  binary: string
  installedAt: number
  backend: Backend
}

let child: ChildProcess | null = null
let status: EngineStatus = {
  state: 'stopped',
  installed: false,
  binaryPath: null,
  backend: null,
  modelPath: null,
  modelName: null,
  port: null
}
let stderrTail = ''
let stopRequested = false
const cpuFallbackDone = new Set<string>()
let installState: EngineInstallState = { running: false, stage: 'idle', pct: 0 }

export function engineStatus(): EngineStatus {
  return { ...status }
}

export function engineInstallState(): EngineInstallState {
  return { ...installState }
}

function setStatus(patch: Partial<EngineStatus>): EngineStatus {
  status = { ...status, ...patch }
  emit('engine', { status: engineStatus() })
  return engineStatus()
}

let rootOverride: string = path.join(process.cwd(), 'engine')

export function setEngineRoot(dir: string): void {
  rootOverride = dir
}

function root(): string {
  return rootOverride
}

function manifestPath(): string {
  return path.join(root(), 'manifest.json')
}

async function readManifest(): Promise<Manifest | null> {
  try {
    return JSON.parse(await fsp.readFile(manifestPath(), 'utf8')) as Manifest
  } catch {
    return null
  }
}

export async function currentBinary(): Promise<{ path: string | null; backend: Backend | null; version?: string }> {
  const settings = await loadSettings()
  if (settings.engine.mode === 'external' && settings.engine.binaryPath) {
    const exists = await pathExists(settings.engine.binaryPath)
    return { path: exists ? settings.engine.binaryPath : null, backend: null }
  }
  const manifest = await readManifest()
  if (manifest) {
    const full = path.join(root(), manifest.binary)
    if (await pathExists(full)) return { path: full, backend: manifest.backend, version: manifest.tag }
  }
  // Búsqueda de respaldo por si el manifest se perdió.
  if (await pathExists(root())) {
    const found = await findFile(root(), (name) => /^llama-server(\.exe)?$/i.test(name))
    if (found) return { path: found, backend: null }
  }
  return { path: null, backend: null }
}

export async function refreshEngineStatus(): Promise<EngineStatus> {
  const found = await currentBinary()
  return setStatus({
    installed: Boolean(found.path),
    binaryPath: found.path,
    backend: status.backend ?? found.backend ?? null,
    version: found.version
  })
}

// ---------------------------- Instalación --------------------------------

function platformScore(asset: string): number {
  const name = asset.toLowerCase()
  const isWin = /win/.test(name)
  const isMac = /macos|osx|darwin/.test(name)
  const isLinux = /ubuntu|linux/.test(name)
  let score = 0
  if (process.platform === 'win32') score += isWin ? 100 : -1000
  else if (process.platform === 'darwin') score += isMac ? 100 : -1000
  else score += isLinux ? 100 : -1000

  const isArm = /arm64|aarch64/.test(name)
  if (process.arch === 'arm64') score += isArm ? 25 : isMac ? -50 : -60
  else score += isArm ? -60 : 20

  return score
}

function backendScore(asset: string, backend: Backend): number {
  const name = asset.toLowerCase()
  const hasCuda = /cuda/.test(name)
  const hasVulkan = /vulkan/.test(name)
  const hasRocm = /rocm|hip/.test(name)
  const hasMetal = /macos|osx/.test(name)
  const cudart = /cudart/.test(name)
  if (cudart) return -200
  if (backend === 'cuda') {
    if (!hasCuda) return /cpu|avx/.test(name) ? 0 : -20
    // CUDA 12.4 exige un driver más antiguo: mejor compatibilidad.
    return /cuda-12/.test(name) ? 85 : 80
  }
  if (backend === 'vulkan') return hasVulkan ? 80 : /cpu|avx/.test(name) ? 0 : -20
  if (backend === 'rocm') return hasRocm ? 80 : /cpu|avx/.test(name) ? 0 : -20
  if (backend === 'metal') return hasMetal ? 80 : -10
  return !hasCuda && !hasVulkan && !hasRocm ? 60 : -10
}

function archCompatible(name: string, backend: Backend): boolean {
  const n = name.toLowerCase()
  if (/xcframework|android|snapdragon|zdnn|s390x|openvino|sycl|opencl|-ui\./.test(n)) return false
  if (backend !== 'rocm' && /rocm|hip/.test(n)) return false
  if (process.arch === 'arm64') return /arm64|aarch64/.test(n)
  return !/arm64|aarch64/.test(n)
}

async function pickAssets(backend: Backend): Promise<{ main: ReleaseAsset; cudart?: ReleaseAsset; tag: string }> {
  const releases = await fetchJson<Release[]>(GITHUB_RELEASES, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  const release = (releases ?? []).find((r) =>
    (r.assets ?? []).some((a) => /^llama-.*\.(zip|tar\.gz)$/i.test(a.name))
  )
  if (!release) throw new Error('No se encontró ninguna release de llama.cpp con binarios.')
  const assets = release.assets.filter((a) => /\.(zip|tar\.gz)$/i.test(a.name))
  if (!assets.length) throw new Error('El release de llama.cpp no contiene binarios descargables.')

  const ranked = assets
    .filter((a) => archCompatible(a.name, backend))
    .map((a) => ({ asset: a, score: platformScore(a.name) + backendScore(a.name, backend) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!ranked.length) {
    throw new Error(
      `No hay binario de llama.cpp para ${process.platform}/${process.arch} con backend ${backend}. Prueba a instalar llama.cpp manualmente y selecciona el ejecutable en Ajustes.`
    )
  }
  const main = ranked[0].asset
  const cudaVersion = main.name.match(/cuda-(\d+\.\d+)/i)?.[1]
  const cudart =
    backend === 'cuda'
      ? assets.find(
          (a) =>
            /cudart/i.test(a.name) &&
            archCompatible(a.name, backend) &&
            (cudaVersion ? a.name.includes(cudaVersion) : true)
        )
      : undefined
  return { main, cudart, tag: release.tag_name }
}

async function downloadFile(url: string, dest: string, onPct: (pct: number) => void): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': 'OpenPro-Agente/0.1' }, redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar el binario (HTTP ${res.status}).`)
  const total = Number(res.headers.get('content-length') ?? 0)
  let received = 0
  const tmp = `${dest}.part`
  const handle = await fsp.open(tmp, 'w')
  try {
    const { Readable } = await import('node:stream')
    const stream = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream)
    for await (const chunk of stream) {
      await handle.write(chunk as Buffer)
      received += (chunk as Buffer).length
      if (total > 0) onPct(Math.min(99, Math.round((received / total) * 100)))
    }
  } finally {
    await handle.close()
  }
  await fsp.rename(tmp, dest)
}

export async function installEngine(): Promise<EngineStatus> {
  if (installState.running) return engineStatus()
  installState = { running: true, stage: 'Consultando la última versión de llama.cpp…', pct: 0 }
  const push = (patch: Partial<EngineInstallState>): void => {
    installState = { ...installState, ...patch }
    emit('engineInstall', { ...installState })
  }
  emit('engineInstall', { ...installState })

  try {
    const settings = await loadSettings()
    const preferred = settings.engine.backend === 'auto' ? await detectBackend() : settings.engine.backend
    const { main, cudart, tag } = await pickAssets(preferred)
    log('info', `Instalando llama.cpp ${tag} (${main.name})`)

    const dir = path.join(root(), tag.replace(/[^\w.-]+/g, '_'))
    await ensureDir(dir)
    push({ stage: `Descargando ${main.name}`, pct: 2 })
    const archive = path.join(dir, main.name)
    await downloadFile(main.browser_download_url, archive, (pct) => push({ stage: `Descargando ${main.name}`, pct: 2 + Math.round(pct * 0.55) }))

    if (cudart) {
      push({ stage: 'Descargando runtime CUDA…', pct: 58 })
      const cudartArchive = path.join(dir, cudart.name)
      await downloadFile(cudart.browser_download_url, cudartArchive, (pct) =>
        push({ stage: 'Descargando runtime CUDA…', pct: 58 + Math.round(pct * 0.15) })
      )
      push({ stage: 'Extrayendo runtime CUDA…', pct: 74 })
      await extractArchive(cudartArchive, dir)
      await fsp.rm(cudartArchive, { force: true }).catch(() => {})
    }

    push({ stage: 'Extrayendo binarios…', pct: 78 })
    await extractArchive(archive, dir)
    await fsp.rm(archive, { force: true }).catch(() => {})

    push({ stage: 'Localizando llama-server…', pct: 92 })
    const binary = await findFile(dir, (name) => /^llama-server(\.exe)?$/i.test(name))
    if (!binary) throw new Error('No se encontró llama-server dentro del paquete descargado.')

    if (process.platform === 'win32') {
      // En Windows las DLL de CUDA vienen en un zip aparte: deben quedar junto al .exe.
      const runtime = await findAllFiles(dir, (name) =>
        /^(cudart|cublas|nvrtc|curand|nvJitLink).*\.dll$/i.test(name)
      )
      for (const dll of runtime) {
        await fsp.copyFile(dll, path.join(path.dirname(binary), path.basename(dll))).catch(() => {})
      }
    } else {
      await fsp.chmod(binary, 0o755).catch(() => {})
    }

    const manifest: Manifest = {
      tag,
      asset: main.name,
      binary: path.relative(root(), binary),
      installedAt: Date.now(),
      backend: preferred
    }
    await fsp.writeFile(manifestPath(), JSON.stringify(manifest, null, 2), 'utf8')
    await saveSettings({
      engine: { ...settings.engine, backend: preferred === 'cpu' ? 'cpu' : preferred, installedTag: tag }
    })

    push({ stage: 'Listo', pct: 100 })
    installState = { running: false, stage: 'Listo', pct: 100 }
    emit('engineInstall', { ...installState })
    log('info', `llama.cpp instalado en ${binary}`)
    return setStatus({ installed: true, binaryPath: binary, version: tag, backend: preferred })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    installState = { running: false, stage: 'Error', pct: 0, error: message }
    emit('engineInstall', { ...installState })
    log('error', 'Fallo instalando llama.cpp', message)
    throw new Error(message)
  }
}

async function detectBackend(): Promise<Backend> {
  const { scanHardware } = await import('./hardware')
  const settings = await loadSettings()
  const hw = await scanHardware(settings.modelsDir)
  return hw.backend
}

// --------------------------- Ciclo de vida -------------------------------

async function freePort(start: number): Promise<number> {
  for (let port = start; port < start + 40; port++) {
    const ok = await new Promise<boolean>((resolve) => {
      const srv = net.createServer()
      srv.once('error', () => resolve(false))
      srv.once('listening', () => srv.close(() => resolve(true)))
      srv.listen(port, '127.0.0.1')
    })
    if (ok) return port
  }
  return start
}

async function waitHealthy(port: number, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new Error(`llama-server terminó inesperadamente.\n${truncate(stderrTail, 1200)}`)
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2500) })
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { status?: string }
        if (data.status === 'ok' || data.status === undefined) return
      }
    } catch {
      // aún arrancando
    }
    await sleep(600)
  }
  throw new Error(`El motor no respondió en ${Math.round(timeoutMs / 1000)} s.\n${truncate(stderrTail, 1200)}`)
}

export async function startEngine(modelPath: string, forceBackend?: Backend): Promise<EngineStatus> {
  const settings = await loadSettings()
  if (!(await pathExists(modelPath))) throw new Error(`El modelo no existe: ${modelPath}`)

  if (status.state === 'ready' && status.modelPath === modelPath && !forceBackend) return engineStatus()
  if (status.state === 'starting' && status.modelPath === modelPath && !forceBackend) return engineStatus()
  await stopEngine()
  stopRequested = false

  const found = await currentBinary()
  if (!found.path) throw new Error('llama.cpp no está instalado. Instálalo desde Ajustes o en el asistente inicial.')
  const configured = settings.engine.backend === 'auto' ? null : settings.engine.backend
  const backend = forceBackend ?? configured ?? found.backend ?? (await detectBackend())
  const port = await freePort(settings.engine.port || 8790)

  const threads = settings.engine.threads || Math.max(2, Math.floor((await import('node:os')).cpus().length * 0.75))
  const gpuLayers = settings.engine.gpuLayers >= 0 ? settings.engine.gpuLayers : backend === 'cpu' ? 0 : 99
  const extra = settings.engine.extraArgs.trim() ? settings.engine.extraArgs.trim().split(/\s+/) : []
  const args = [
    '-m',
    modelPath,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '-c',
    String(settings.engine.ctxSize),
    '-ngl',
    String(gpuLayers),
    '-t',
    String(threads),
    // Un solo slot: el agente pide de una en una, y así la caché KV no se
    // multiplica por 4. En equipos de 8 GB con un modelo de 3 B es la
    // diferencia entre que quepa en RAM o que el servidor corte la conexión.
    '--parallel',
    '1',
    '--jinja',
    ...extra
  ]

  setStatus({
    state: 'starting',
    modelPath,
    modelName: path.basename(modelPath),
    port,
    backend,
    binaryPath: found.path,
    message: 'Cargando modelo en memoria…',
    installed: true
  })
  stderrTail = ''
  log('info', `Iniciando llama-server: ${found.path} ${args.join(' ')}`)

  child = spawn(found.path, args, {
    cwd: path.dirname(found.path),
    windowsHide: true,
    env: {
      ...process.env,
      LLAMA_CACHE: path.join(root(), 'cache'),
      // Con backend CPU el binario Vulkan (o CUDA) sigue inicializando sus
      // dispositivos al cargar el modelo; si el driver quedó en mal estado el
      // arranque falla aunque se pidan 0 capas en GPU.
      ...(backend === 'cpu' ? { GGML_VK_VISIBLE_DEVICES: '' } : {})
    }
  })

  child.stdout?.on('data', (d) => log('info', `[llama] ${String(d).trim()}`))
  child.stderr?.on('data', (d) => {
    const text = String(d)
    stderrTail = truncate(stderrTail + text, 6000)
    const clean = text.replace(/\r/g, '\n').split('\n').filter((l) => l.trim()).map((l) => l.trim().slice(0, 400))
    if (clean.length) log('info', `[llama] ${clean.join(' | ')}`)
  })
  child.on('exit', (code) => {
    const modelPathForFallback = status.modelPath
    const failedBackend = status.backend
    const wasActive = status.state !== 'stopped'
    child = null

    if (stopRequested) {
      setStatus({ state: 'stopped', modelPath: null, message: 'Motor detenido' })
      return
    }

    // GPU inestable: reintenta una vez en CPU antes de rendirse.
    if (
      wasActive &&
      code !== 0 &&
      modelPathForFallback &&
      failedBackend &&
      failedBackend !== 'cpu' &&
      !cpuFallbackDone.has(modelPathForFallback)
    ) {
      cpuFallbackDone.add(modelPathForFallback)
      log('warn', `llama-server falló con backend ${failedBackend} (código ${code}). Reintentando en CPU.`)
      setStatus({
        state: 'starting',
        message: 'La GPU falló al ejecutar el modelo. Reintentando en CPU…',
        backend: 'cpu'
      })
      setTimeout(() => {
        void startEngine(modelPathForFallback, 'cpu').catch((err) => {
          setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
        })
      }, 700)
      return
    }

    if (wasActive) {
      setStatus({
        state: code === 0 ? 'stopped' : 'error',
        message:
          code === 0
            ? 'Motor detenido'
            : `llama-server se cerró (código ${code}).\n${truncate(stderrTail, 900)}`,
        modelPath: null
      })
    }
  })

  try {
    const timeout = Number(process.env.OPENPRO_START_TIMEOUT ?? 240000)
    await waitHealthy(port, timeout)
  } catch (err) {
    await stopEngine()
    const message = err instanceof Error ? err.message : String(err)
    if (backend !== 'cpu' && !cpuFallbackDone.has(modelPath)) {
      cpuFallbackDone.add(modelPath)
      log('warn', `El motor no arrancó con ${backend}: ${message}. Reintentando en CPU.`)
      return startEngine(modelPath, 'cpu')
    }
    setStatus({ state: 'error', message })
    throw new Error(message)
  }

  log('info', `Motor listo en http://127.0.0.1:${port}`)
  return setStatus({
    state: 'ready',
    port,
    modelPath,
    backend,
    message: `Modelo cargado (${backend.toUpperCase()})`
  })
}

export async function stopEngine(): Promise<EngineStatus> {
  stopRequested = true
  if (child && child.pid) {
    const pid = child.pid
    try {
      if (process.platform === 'win32') {
        await run('taskkill', ['/PID', String(pid), '/T', '/F'], { timeoutMs: 8000 })
      } else {
        try {
          process.kill(-pid, 'SIGTERM')
        } catch {
          child.kill('SIGTERM')
        }
        await sleep(400)
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {
          // ya terminó
        }
      }
    } catch {
      // ignorar
    }
    child = null
  }
  return setStatus({
    state: 'stopped',
    modelPath: null,
    port: null,
    message: 'Motor detenido'
  })
}

// ----------------------------- Inferencia --------------------------------

export interface EngineMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: unknown[]
  tool_call_id?: string
  name?: string
}

export interface EngineToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface StreamResult {
  content: string
  reasoning: string
  toolCalls: ToolCall[]
  finishReason: string | null
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

interface DeltaToolCall {
  index: number
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

export async function streamChat(opts: {
  messages: EngineMessage[]
  tools?: EngineToolDef[]
  temperature: number
  maxTokens: number
  sampling?: ModelSampling
  signal: AbortSignal
  onContent?: (text: string) => void
  onReasoning?: (text: string) => void
}): Promise<StreamResult> {
  if (status.state !== 'ready' || !status.port) throw new Error('El motor no está listo.')
  const url = `http://127.0.0.1:${status.port}/v1/chat/completions`
  const body: Record<string, unknown> = {
    messages: opts.messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    stream: true,
    stream_options: { include_usage: true }
  }
  // Parámetros recomendados por el autor del modelo (top_k, penalización por
  // repetición…). Ayudan mucho con modelos pequeños, que tienden a repetirse.
  if (opts.sampling?.topK && opts.sampling.topK > 0) body.top_k = opts.sampling.topK
  if (opts.sampling?.topP && opts.sampling.topP > 0 && opts.sampling.topP < 1) body.top_p = opts.sampling.topP
  if (opts.sampling?.repeatPenalty && opts.sampling.repeatPenalty > 0) {
    body.repeat_penalty = opts.sampling.repeatPenalty
  }
  if (opts.tools?.length) {
    body.tools = opts.tools
    body.tool_choice = 'auto'
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    if (/tools?/i.test(text) && /(not supported|unsupported|invalid)/i.test(text) && opts.tools?.length) {
      throw new Error('TOOLS_NOT_SUPPORTED: la plantilla del modelo no admite tool calling nativo.')
    }
    if (res.status === 400 && /context|n_past|exceed/i.test(text)) {
      throw new Error(`El contexto es demasiado largo para el modelo. Aumenta el contexto en Ajustes o inicia un chat nuevo.\n${text.slice(0, 400)}`)
    }
    throw new Error(`El motor devolvió HTTP ${res.status}: ${text.slice(0, 600)}`)
  }

  let content = ''
  let reasoning = ''
  let finishReason: string | null = null
  let usage: StreamResult['usage']
  const toolAcc = new Map<number, DeltaToolCall>()

  const { Readable } = await import('node:stream')
  const stream = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream)
  let buffer = ''
  for await (const chunk of stream) {
    buffer += (chunk as Buffer).toString('utf8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      const json = safeParse(payload)
      if (!json) continue
      const choice = json.choices?.[0]
      const delta = choice?.delta ?? {}
      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content
        opts.onContent?.(delta.content)
      }
      const thought = delta.reasoning_content ?? delta.reasoning
      if (typeof thought === 'string' && thought) {
        reasoning += thought
        opts.onReasoning?.(thought)
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls as DeltaToolCall[]) {
          const index = typeof tc.index === 'number' ? tc.index : toolAcc.size
          const prev = toolAcc.get(index) ?? { index }
          toolAcc.set(index, {
            index,
            id: tc.id ?? prev.id,
            type: tc.type ?? prev.type,
            function: {
              name: tc.function?.name ?? prev.function?.name,
              arguments: (prev.function?.arguments ?? '') + (tc.function?.arguments ?? '')
            }
          })
        }
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason
      if (json.usage) usage = json.usage
    }
  }

  // Si llama-server pierde la GPU a mitad del stream (device lost), cierra la
  // conexión sin enviar finish_reason: hay que tratarlo como fallo del motor
  // para que el agente pueda reintentar en CPU en vez de guardar una respuesta vacía.
  if (!finishReason && !opts.signal.aborted) {
    throw new Error(
      `La conexión con el motor se cortó antes de terminar${
        status.backend && status.backend !== 'cpu' ? ' (posible fallo de la GPU)' : ''
      }.`
    )
  }

  const toolCalls: ToolCall[] = [...toolAcc.values()]
    .sort((a, b) => a.index - b.index)
    .filter((tc) => tc.function?.name)
    .map((tc) => ({
      id: tc.id || uid('call_'),
      name: tc.function!.name!,
      args: parseArgs(tc.function?.arguments ?? '')
    }))

  return { content, reasoning, toolCalls, finishReason, usage }
}

function safeParse(text: string): {
  choices?: Array<{ delta?: Record<string, unknown>; finish_reason?: string | null }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
} | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseArgs(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { value: parsed }
  } catch {
    // Intenta reparar JSON truncado (cierra comillas/llaves abiertas).
    const repaired = repairJson(trimmed)
    if (repaired) {
      try {
        return JSON.parse(repaired) as Record<string, unknown>
      } catch {
        // continúa
      }
    }
    return { _raw: trimmed }
  }
}

function repairJson(input: string): string | null {
  let out = input
  let inString = false
  let escape = false
  const stack: string[] = []
  for (const ch of out) {
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') stack.pop()
  }
  if (inString) out += '"'
  while (stack.length) {
    const open = stack.pop()
    out += open === '{' ? '}' : ']'
  }
  return out
}

export async function engineProps(): Promise<Record<string, unknown> | null> {
  if (status.state !== 'ready' || !status.port) return null
  try {
    return await fetchJson<Record<string, unknown>>(`http://127.0.0.1:${status.port}/props`, {}, 4000)
  } catch {
    return null
  }
}

export function isEngineBusy(): boolean {
  return status.state === 'starting'
}

export async function candidateEngine(): Promise<{ tag: string; asset: string; url: string } | null> {
  try {
    const settings = await loadSettings()
    const backend = settings.engine.backend === 'auto' ? await detectBackend() : settings.engine.backend
    const { main, tag } = await pickAssets(backend)
    return { tag, asset: main.name, url: main.browser_download_url }
  } catch {
    return null
  }
}

export function registeredPaths(): string[] {
  const paths = [root(), manifestPath()]
  return paths
}

export function ensureEngineDirs(): void {
  fs.mkdirSync(root(), { recursive: true })
}
