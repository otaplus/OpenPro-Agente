import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { DownloadJob, InstalledModel } from '@shared/types'
import { ensureDir, freeDiskGB, pathExists, slug, uid } from './util'
import { emit } from './bus'
import { log } from './logger'
import { downloadUrl, modelNameFromRepo, quantFromFileName } from './hf'
import { loadSettings } from './settings'

const jobs = new Map<string, DownloadJob>()
const controllers = new Map<string, AbortController>()
const cancelRequested = new Set<string>()
const lastEmit = new Map<string, number>()
const samples = new Map<string, { bytes: number; at: number }>()

const MAX_CONCURRENT = 2
let running = 0

export function listDownloads(): DownloadJob[] {
  return [...jobs.values()].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
}

function emitJob(job: DownloadJob, force = false): void {
  const now = Date.now()
  if (!force && now - (lastEmit.get(job.id) ?? 0) < 250) return
  lastEmit.set(job.id, now)
  emit('download', { job: { ...job } })
}

async function authHeader(): Promise<Record<string, string>> {
  const s = await loadSettings()
  return s.hfToken ? { Authorization: `Bearer ${s.hfToken}` } : {}
}

export interface EnqueueRequest {
  repo: string
  file: string
  label: string
  sizeBytes: number
  url?: string
}

export async function enqueueDownload(req: EnqueueRequest): Promise<DownloadJob> {
  const settings = await loadSettings()
  const repoDir = path.join(settings.modelsDir, slug(req.repo || req.label))
  const dest = path.join(repoDir, req.file)
  try {
    await ensureDir(repoDir)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EACCES') {
      throw new Error(
        `No tengo permisos para escribir en la carpeta de modelos (${settings.modelsDir}). Elige otra carpeta en Ajustes → Carpeta de modelos, o comprueba sus permisos de Windows.`
      )
    }
    throw err
  }

  const free = await freeDiskGB(settings.modelsDir)
  if (free > 0 && req.sizeBytes > 0 && free * 1024 ** 3 < req.sizeBytes * 1.05) {
    throw new Error(
      `Espacio insuficiente en ${settings.modelsDir}: necesitas ~${(req.sizeBytes / 1024 ** 3).toFixed(
        1
      )} GB y quedan ${free} GB.`
    )
  }

  const job: DownloadJob = {
    id: uid('dl_'),
    repo: req.repo,
    file: req.file,
    label: req.label,
    url: req.url ?? downloadUrl(req.repo, req.file),
    dest,
    sizeBytes: req.sizeBytes,
    receivedBytes: 0,
    speedBps: 0,
    etaSeconds: null,
    status: 'queued'
  }
  jobs.set(job.id, job)
  emitJob(job, true)

  await ensureDir(path.dirname(dest))
  if (req.repo) {
    await fsp
      .writeFile(
        path.join(repoDir, '.openpro.json'),
        JSON.stringify({ repo: req.repo, label: req.label, quant: quantFromFileName(req.file) }, null, 2)
      )
      .catch(() => {})
  }

  schedule()
  return job
}

function schedule(): void {
  while (running < MAX_CONCURRENT) {
    const next = [...jobs.values()].find((j) => j.status === 'queued')
    if (!next) break
    running++
    next.status = 'downloading'
    next.startedAt = Date.now()
    void runJob(next)
      .catch((err) => {
        next.status = 'error'
        next.error = err instanceof Error ? err.message : String(err)
        log('error', `Descarga falló: ${next.label}`, next.error)
      })
      .finally(() => {
        running--
        emitJob(next, true)
        schedule()
      })
  }
}

async function runJob(job: DownloadJob): Promise<void> {
  const part = `${job.dest}.part`
  let start = 0
  try {
    const st = await fsp.stat(part)
    start = st.size
  } catch {
    start = 0
  }
  if (job.sizeBytes > 0 && start >= job.sizeBytes) {
    await finalize(job, part)
    return
  }

  const controller = new AbortController()
  controllers.set(job.id, controller)
  const isLocal = job.url.startsWith('file://')

  try {
    if (isLocal) {
      await copyLocal(job, part, start, controller.signal)
    } else {
      await downloadHttp(job, part, start, controller.signal)
    }
    await finalize(job, part, controller.signal)
  } catch (err) {
    if (cancelRequested.has(job.id) || controller.signal.aborted) {
      job.status = 'cancelled'
      job.error = 'Cancelado por el usuario'
    } else {
      log('warn', `Descarga interrumpida: ${job.label}`, err instanceof Error ? err.message : String(err))
      throw err
    }
  } finally {
    controllers.delete(job.id)
    cancelRequested.delete(job.id)
  }
}

async function copyLocal(job: DownloadJob, part: string, start: number, signal: AbortSignal): Promise<void> {
  const src = decodeURIComponent(job.url.replace('file://', ''))
  const total = (await fsp.stat(src)).size
  job.sizeBytes = total
  const handle = await fsp.open(part, start > 0 ? 'a' : 'w')
  try {
    const stream = fs.createReadStream(src, { start })
    for await (const chunk of stream) {
      if (signal.aborted) throw new Error('aborted')
      await handle.write(chunk as Buffer)
      progress(job, (chunk as Buffer).length)
    }
  } finally {
    await handle.close()
  }
}

async function downloadHttp(job: DownloadJob, part: string, start: number, signal: AbortSignal): Promise<void> {
  const headers: Record<string, string> = {
    'User-Agent': 'OpenPro-Agente/0.1',
    ...(await authHeader())
  }
  if (start > 0) headers.Range = `bytes=${start}-`

  const res = await fetch(job.url, { headers, signal, redirect: 'follow' })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'Acceso denegado por HuggingFace. El repositorio puede requerir aceptar la licencia o un token: configúralo en Ajustes → Token de HuggingFace.'
      )
    }
    if (res.status === 404) throw new Error('Archivo no encontrado en HuggingFace (puede haber cambiado el repo).')
    throw new Error(`Error HTTP ${res.status} al descargar ${job.file}`)
  }
  if (start > 0 && res.status !== 206) {
    // El servidor ignora el rango: reinicia desde cero.
    start = 0
    await fsp.rm(part, { force: true })
  }
  const length = Number(res.headers.get('content-length') ?? 0)
  if (length > 0) job.sizeBytes = start + length
  job.receivedBytes = start

  if (!res.body) throw new Error('La respuesta no contiene cuerpo.')
  const handle = await fsp.open(part, start > 0 ? 'a' : 'w')
  try {
    const stream = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream)
    for await (const chunk of stream) {
      if (signal.aborted) throw new Error('aborted')
      await handle.write(chunk as Buffer)
      progress(job, (chunk as Buffer).length)
    }
  } finally {
    await handle.close()
  }
}

function progress(job: DownloadJob, bytes: number): void {
  job.receivedBytes += bytes
  const prev = samples.get(job.id)
  const now = Date.now()
  if (!prev) {
    samples.set(job.id, { bytes: job.receivedBytes, at: now })
  } else if (now - prev.at > 1200) {
    const delta = job.receivedBytes - prev.bytes
    const instant = (delta / (now - prev.at)) * 1000
    job.speedBps = job.speedBps ? job.speedBps * 0.6 + instant * 0.4 : instant
    samples.set(job.id, { bytes: job.receivedBytes, at: now })
  }
  if (job.sizeBytes > 0 && job.speedBps > 0) {
    job.etaSeconds = Math.max(0, Math.round((job.sizeBytes - job.receivedBytes) / job.speedBps))
  }
  emitJob(job)
}

async function finalize(job: DownloadJob, part: string, signal?: AbortSignal): Promise<void> {
  job.status = 'verifying'
  emitJob(job, true)
  const st = await fsp.stat(part).catch(() => null)
  if (!st) throw new Error('El archivo descargado no existe.')
  if (job.sizeBytes > 0 && st.size < job.sizeBytes * 0.999) {
    throw new Error(
      `Descarga incompleta: ${st.size} de ${job.sizeBytes} bytes. Vuelve a intentarlo (se reanudará).`
    )
  }
  if (signal?.aborted) throw new Error('aborted')
  await fsp.rm(job.dest, { force: true }).catch(() => {})
  await fsp.rename(part, job.dest)
  job.receivedBytes = st.size
  job.sizeBytes = job.sizeBytes || st.size
  job.status = 'done'
  job.finishedAt = Date.now()
  job.speedBps = 0
  job.etaSeconds = 0
  log('info', `Descarga completa: ${job.label} (${job.dest})`)
}

export function cancelDownload(id: string): void {
  log('warn', `Cancelación solicitada para ${id}`, new Error('traza').stack)
  cancelRequested.add(id)
  const controller = controllers.get(id)
  if (controller) controller.abort()
  const job = jobs.get(id)
  if (job && job.status === 'queued') {
    job.status = 'cancelled'
    emitJob(job, true)
  }
}

// ------------------------- Modelos instalados ---------------------------

const SPLIT_RE = /[-.](\d{5})-of-(\d{5})\.gguf$/i

function baseKey(filePath: string): string {
  return filePath.replace(SPLIT_RE, '').replace(/\.gguf$/i, '')
}

function hashId(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 16)
}

async function walkGguf(root: string, depth = 0): Promise<string[]> {
  if (depth > 5) return []
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
  const found: string[] = []
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      found.push(...(await walkGguf(full, depth + 1)))
    } else if (entry.isFile() && /\.gguf$/i.test(entry.name) && !/\.part$/i.test(entry.name)) {
      found.push(full)
    }
  }
  return found
}

async function readMeta(dir: string): Promise<{ repo?: string; label?: string } | null> {
  try {
    const raw = await fsp.readFile(path.join(dir, '.openpro.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Repositorio de HuggingFace del modelo, leído del `.openpro.json` de su carpeta. */
export async function modelRepoFor(modelPath: string): Promise<string | undefined> {
  const meta = await readMeta(path.dirname(modelPath))
  return meta?.repo
}

export async function listInstalledModels(): Promise<InstalledModel[]> {
  const settings = await loadSettings()
  const root = settings.modelsDir
  if (!(await pathExists(root))) return []
  const files = await walkGguf(root)
  const groups = new Map<string, string[]>()

  for (const file of files) {
    if (/mmproj/i.test(path.basename(file))) continue
    const m = path.basename(file).match(SPLIT_RE)
    if (m && Number(m[1]) !== 1) continue
    const key = baseKey(file)
    const group = groups.get(key) ?? []
    group.push(file)
    groups.set(key, group)
  }

  const result: InstalledModel[] = []
  for (const [key, group] of groups) {
    const first = group[0]
    const dir = path.dirname(first)
    const meta = await readMeta(dir)
    let sizeBytes = 0
    let parts = 0
    const baseName = path.basename(key)
    const dirFiles = await fsp.readdir(dir).catch(() => [])
    for (const name of dirFiles) {
      if (name.startsWith(baseName) && /\.gguf$/i.test(name)) {
        const st = await fsp.stat(path.join(dir, name)).catch(() => null)
        if (st) {
          sizeBytes += st.size
          parts++
        }
      }
    }
    const quant = quantFromFileName(path.basename(first))
    const cleanName = path
      .basename(first)
      .replace(SPLIT_RE, '')
      .replace(/\.gguf$/i, '')
      .replace(new RegExp(quant ? `[-_.]?${quant}` : '___', 'i'), '')
      .replace(/[-_.]+$/, '')
      .replace(/[-_]/g, ' ')
      .trim()

    result.push({
      id: hashId(key),
      name: cleanName || modelNameFromRepo(meta?.repo ?? baseName),
      path: first,
      sizeBytes,
      repo: meta?.repo,
      quant,
      modifiedAt: (await fsp.stat(first).catch(() => ({ mtimeMs: 0 }))).mtimeMs,
      parts,
      valid: sizeBytes > 1024 * 1024
    })
  }
  return result.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
}

export async function deleteModel(modelPath: string): Promise<void> {
  const settings = await loadSettings()
  const root = path.resolve(settings.modelsDir)
  const target = path.resolve(modelPath)
  if (!target.startsWith(root)) throw new Error('El archivo no está dentro de la carpeta de modelos.')
  const dir = path.dirname(target)
  const base = baseKey(target)
  const baseName = path.basename(base)
  const entries = await fsp.readdir(dir).catch(() => [])
  for (const name of entries) {
    if (name.startsWith(baseName) && (/\.gguf$/i.test(name) || name.endsWith('.part'))) {
      await fsp.rm(path.join(dir, name), { force: true })
    }
  }
  const remaining = await fsp.readdir(dir).catch(() => [])
  if (remaining.every((n) => n.startsWith('.'))) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function importLocalGguf(srcPath: string): Promise<DownloadJob> {
  const settings = await loadSettings()
  const st = await fsp.stat(srcPath)
  const name = path.basename(srcPath)
  const folder = slug(name.replace(/\.gguf$/i, ''))
  return enqueueDownload({
    repo: `local/${folder}`,
    file: name,
    label: name,
    sizeBytes: st.size,
    url: `file://${srcPath}`
  })
}
