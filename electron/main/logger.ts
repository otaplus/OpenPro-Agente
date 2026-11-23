import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { emit } from './bus'

let logPath: string | null = null

function file(): string {
  if (!logPath) {
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    logPath = path.join(dir, 'openpro.log')
  }
  return logPath
}

/**
 * Escribe en la consola sin tumbar la app: al lanzarla desde una terminal,
 * escribe en una tubería que se cierra (EPIPE) y Electron terminaría el proceso
 * principal. El log a fichero es la fuente fiable; la consola es un extra.
 */
function writeConsole(stream: NodeJS.WriteStream, line: string): void {
  try {
    if (!stream.writable || stream.destroyed) return
    stream.write(line)
  } catch {
    // consola no disponible
  }
}

export function log(level: 'info' | 'warn' | 'error', message: string, extra?: unknown): void {
  const at = Date.now()
  const line = `${new Date(at).toISOString()} [${level.toUpperCase()}] ${message}${
    extra ? ` ${safeStringify(extra)}` : ''
  }\n`
  writeConsole(level === 'error' ? process.stderr : process.stdout, line)
  fs.appendFile(file(), line, () => {})
  emit('log', { level, message, at })
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function logPathForUser(): string {
  return file()
}
