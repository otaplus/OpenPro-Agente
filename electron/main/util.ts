import { execFile } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export function uid(prefix = ''): string {
  return prefix + randomUUID()
}

export async function ensureDir(p: string): Promise<void> {
  await fsp.mkdir(p, { recursive: true })
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p)
    return true
  } catch {
    return false
  }
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(file))
  const tmp = `${file}.${process.pid}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fsp.rename(tmp, file)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`
}

export function slug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'item'
}

export function expandHome(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1))
  return p
}

export async function freeDiskGB(dir: string): Promise<number> {
  let probe = path.resolve(dir)
  for (let i = 0; i < 10; i++) {
    try {
      const stat = await fsp.statfs(probe)
      return Math.round(((stat.bavail * stat.bsize) / 1024 ** 3) * 10) / 10
    } catch {
      const parent = path.dirname(probe)
      if (parent === probe) break
      probe = parent
    }
  }
  return -1
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0
  const walk = async (d: string): Promise<void> => {
    const entries = await fsp.readdir(d, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) {
        const st = await fsp.stat(full).catch(() => null)
        if (st) total += st.size
      }
    }
  }
  await walk(dir)
  return total
}

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs ?? 15000,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, ...(opts.env ?? {}) }
      },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : err ? 1 : 0
        resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
      }
    )
  })
}

export async function hasBinary(bin: string): Promise<boolean> {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  const res = await run(cmd, [bin], { timeoutMs: 4000 })
  return res.code === 0 && res.stdout.trim().length > 0
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OpenPro-Agente/0.1',
      ...(init.headers ?? {})
    }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 300)}` : ''}`)
  }
  return (await res.json()) as T
}

/** Extrae el binario de un ZIP/TGZ usando herramientas del sistema. */
export async function extractArchive(archive: string, destDir: string): Promise<void> {
  await ensureDir(destDir)
  const isZip = /\.zip$/i.test(archive)
  const attempts: { cmd: string; args: string[] }[] = []
  if (process.platform === 'win32') {
    if (isZip) {
      attempts.push({
        cmd: 'powershell',
        args: ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${destDir}' -Force`]
      })
    }
    attempts.push({ cmd: 'tar', args: ['-xf', archive, '-C', destDir] })
  } else {
    if (isZip) attempts.push({ cmd: 'unzip', args: ['-o', '-q', archive, '-d', destDir] })
    attempts.push({ cmd: 'tar', args: ['-xf', archive, '-C', destDir] })
  }
  let lastError = ''
  for (const a of attempts) {
    const res = await run(a.cmd, a.args, { timeoutMs: 180000 })
    if (res.code === 0) return
    lastError = `${a.cmd}: ${res.stderr || res.stdout}`.slice(0, 400)
  }
  throw new Error(`No se pudo extraer ${path.basename(archive)}. ${lastError}`)
}

export async function findFile(root: string, predicate: (name: string) => boolean): Promise<string | null> {
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()!
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (predicate(entry.name)) return full
    }
  }
  return null
}

export async function findAllFiles(root: string, predicate: (name: string) => boolean): Promise<string[]> {
  const stack = [root]
  const found: string[] = []
  while (stack.length) {
    const dir = stack.pop()!
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (predicate(entry.name)) found.push(full)
    }
  }
  return found
}

export function isBinaryBuffer(buf: Buffer): boolean {
  const len = Math.min(buf.length, 4096)
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true
  return false
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n… (salida truncada, ${text.length - maxChars} caracteres omitidos)`
}

export function safeJsonParse<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
