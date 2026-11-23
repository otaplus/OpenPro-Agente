import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { AppSettings } from '@shared/types'
import type { EngineToolDef } from './engine'
import { clamp, isBinaryBuffer, truncate } from './util'

type Permission = AppSettings['agent']['permission']

/** Herramientas que modifican el equipo: no se ofrecen en modo «solo pensar». */
export const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'run_command'])

export interface ToolContext {
  workspace: string
  webFetch: boolean
  permission: Permission
  signal: AbortSignal
}

export interface ToolResult {
  ok: boolean
  output: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  readOnly: boolean
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

/** ¿La ruta cae fuera del proyecto abierto? */
export function isOutsideWorkspace(workspace: string, input: string): boolean {
  const root = path.resolve(workspace)
  const target = path.resolve(root, input || '.')
  const rel = path.relative(root, target)
  return rel.startsWith('..') || path.isAbsolute(rel)
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'out',
  'release',
  'build',
  '.next',
  '.nuxt',
  'target',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'coverage',
  '.cache',
  '.idea',
  '.gradle',
  '.dart_tool',
  'Pods',
  'obj',
  'bin'
])

const MAX_FILE_BYTES = 2 * 1024 * 1024

function str(args: Record<string, unknown>, key: string, fallback = ''): string {
  const value = args[key]
  return typeof value === 'string' ? value : fallback
}

function num(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function resolveInWorkspace(workspace: string, input: string): string {
  const root = path.resolve(workspace)
  const target = path.resolve(root, input || '.')
  const rel = path.relative(root, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Ruta fuera del área de trabajo: ${input}. El agente solo puede operar dentro de ${root}.`)
  }
  return target
}

/**
 * Resuelve una ruta que el agente va a modificar. Con permiso «control total»
 * se acepta cualquier ruta (el agente ya habrá pedido aprobación al usuario);
 * en el resto de modos solo se permite dentro del proyecto abierto.
 */
function resolveForWrite(ctx: ToolContext, input: string): string {
  const root = path.resolve(ctx.workspace)
  const target = path.resolve(root, input || '.')
  const rel = path.relative(root, target)
  const outside = rel.startsWith('..') || path.isAbsolute(rel)
  if (!outside) return target
  if (ctx.permission === 'full') return target
  throw new Error(
    `Ruta fuera del área de trabajo: ${input}. El proyecto abierto es ${root}; usa rutas relativas a él.`
  )
}

function rel(ctx: ToolContext, full: string): string {
  const r = path.relative(path.resolve(ctx.workspace), full)
  return r.split(path.sep).join('/') || '.'
}

async function walk(
  dir: string,
  visit: (file: string) => Promise<boolean | void>,
  depth = 0
): Promise<void> {
  if (depth > 12) return
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      await walk(full, visit, depth + 1)
    } else if (entry.isFile()) {
      const stop = await visit(full)
      if (stop) return
    }
  }
}

function globToRegExp(pattern: string): RegExp {
  let out = ''
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '')
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        i++
        if (normalized[i + 1] === '/') {
          i++
          out += '(?:.*/)?'
        } else {
          out += '.*'
        }
      } else {
        out += '[^/]*'
      }
    } else if (ch === '?') {
      out += '[^/]'
    } else if ('\\^$+.()|{}[]'.includes(ch)) {
      out += `\\${ch}`
    } else {
      out += ch
    }
  }
  const flags = process.platform === 'win32' ? 'i' : ''
  return new RegExp(`^${out}$`, flags)
}

function countLines(text: string): number {
  return text.split('\n').length
}

export const TOOLS: Record<string, ToolDefinition> = {
  list_dir: {
    name: 'list_dir',
    description:
      'Lista archivos y carpetas dentro del área de trabajo. Úsalo para explorar la estructura antes de leer archivos.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta relativa a listar. Por defecto la raíz del proyecto.' },
        depth: { type: 'number', description: 'Profundidad máxima (1-4). Por defecto 2.' }
      }
    },
    async run(args, ctx) {
      const base = resolveInWorkspace(ctx.workspace, str(args, 'path', '.'))
      const depth = clamp(num(args, 'depth', 2), 1, 4)
      const lines: string[] = []
      let count = 0
      const limit = 400

      const visit = async (dir: string, level: number): Promise<void> => {
        if (count >= limit) return
        const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
        entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
        for (const entry of entries) {
          if (count >= limit) return
          const full = path.join(dir, entry.name)
          const pad = '  '.repeat(level)
          if (entry.isDirectory()) {
            if (IGNORED_DIRS.has(entry.name)) continue
            lines.push(`${pad}${entry.name}/`)
            count++
            if (level + 1 < depth) await visit(full, level + 1)
          } else {
            const st = await fsp.stat(full).catch(() => null)
            lines.push(`${pad}${entry.name}${st ? ` (${formatSize(st.size)})` : ''}`)
            count++
          }
        }
      }

      await visit(base, 0)
      return {
        ok: true,
        output: `${rel(ctx, base)}/\n${lines.join('\n') || '(vacío)'}${count >= limit ? '\n… (listado truncado)' : ''}`
      }
    }
  },

  read_file: {
    name: 'read_file',
    description: 'Lee un archivo de texto del proyecto. Devuelve el contenido con números de línea.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta relativa del archivo.' },
        start_line: { type: 'number', description: 'Primera línea a leer (1-based).' },
        end_line: { type: 'number', description: 'Última línea a leer.' }
      },
      required: ['path']
    },
    async run(args, ctx) {
      const full = resolveInWorkspace(ctx.workspace, str(args, 'path'))
      const st = await fsp.stat(full).catch(() => null)
      if (!st) return { ok: false, output: `No existe el archivo ${str(args, 'path')}` }
      if (st.isDirectory()) return { ok: false, output: `${str(args, 'path')} es una carpeta; usa list_dir.` }
      if (st.size > MAX_FILE_BYTES) {
        return { ok: false, output: `El archivo pesa ${formatSize(st.size)}. Lee un rango de líneas con start_line y end_line.` }
      }
      const buf = await fsp.readFile(full)
      if (isBinaryBuffer(buf)) return { ok: false, output: 'El archivo parece binario.' }
      const all = buf.toString('utf8').replace(/\r\n/g, '\n').split('\n')
      const total = all.length
      const start = clamp(Math.floor(num(args, 'start_line', 1)), 1, total)
      const end = clamp(Math.floor(num(args, 'end_line', Math.min(total, start + 1499))), start, total)
      const width = String(end).length
      const body = all
        .slice(start - 1, end)
        .map((line, i) => `${String(start + i).padStart(width, ' ')} | ${line}`)
        .join('\n')
      return {
        ok: true,
        output: `${rel(ctx, full)} (${total} líneas, mostrando ${start}-${end})\n${body}`
      }
    }
  },

  write_file: {
    name: 'write_file',
    description:
      'Crea o reemplaza por completo un archivo de texto. Para cambios pequeños usa edit_file. Escribe rutas relativas al proyecto.',
    readOnly: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta relativa del archivo a escribir.' },
        content: { type: 'string', description: 'Contenido completo del archivo.' }
      },
      required: ['path', 'content']
    },
    async run(args, ctx) {
      const full = resolveForWrite(ctx, str(args, 'path'))
      const content = str(args, 'content')
      if (content.length > 1_500_000) return { ok: false, output: 'Contenido demasiado grande (máx. 1,5 MB).' }
      const existed = await fsp.stat(full).then(() => true).catch(() => false)
      try {
        await fsp.mkdir(path.dirname(full), { recursive: true })
        await fsp.writeFile(full, content, 'utf8')
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'EPERM' || code === 'EACCES' || code === 'EROFS') {
          // Los modelos pequeños suelen inventar rutas absolutas fuera del
          // proyecto; sin una pista clara se quedan repitiendo que no pueden.
          return {
            ok: false,
            output: `No tengo permiso para escribir en ${full}. El proyecto abierto es ${path.resolve(
              ctx.workspace
            )} y las rutas deben ser relativas a él; prueba con "${path.basename(full)}".`
          }
        }
        throw err
      }
      return {
        ok: true,
        output: `${existed ? 'Archivo actualizado' : 'Archivo creado'}: ${rel(ctx, full)} (${countLines(content)} líneas, ${formatSize(
          Buffer.byteLength(content, 'utf8')
        )})`
      }
    }
  },

  edit_file: {
    name: 'edit_file',
    description:
      'Edita un archivo reemplazando un fragmento exacto de texto. old_text debe aparecer exactamente una vez (salvo replace_all=true) e incluir suficiente contexto para ser único.',
    readOnly: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta relativa del archivo.' },
        old_text: { type: 'string', description: 'Texto exacto a buscar, con su indentación original.' },
        new_text: { type: 'string', description: 'Texto de reemplazo.' },
        replace_all: { type: 'boolean', description: 'Reemplazar todas las apariciones.' }
      },
      required: ['path', 'old_text', 'new_text']
    },
    async run(args, ctx) {
      const full = resolveForWrite(ctx, str(args, 'path'))
      const raw = await fsp.readFile(full, 'utf8').catch(() => null)
      if (raw === null) return { ok: false, output: `No existe ${str(args, 'path')}. Usa write_file para crearlo.` }
      const oldText = str(args, 'old_text')
      const newText = str(args, 'new_text')
      if (!oldText) return { ok: false, output: 'old_text no puede estar vacío.' }
      const count = raw.split(oldText).length - 1
      if (count === 0) {
        return {
          ok: false,
          output:
            'No se encontró el texto exacto. Revisa espacios/indentación o lee el archivo de nuevo antes de editar.'
        }
      }
      if (count > 1 && args.replace_all !== true) {
        return {
          ok: false,
          output: `El texto aparece ${count} veces. Añade más contexto para que sea único o usa replace_all=true.`
        }
      }
      const updated = args.replace_all === true ? raw.split(oldText).join(newText) : raw.replace(oldText, newText)
      await fsp.writeFile(full, updated, 'utf8')
      return {
        ok: true,
        output: `Editado ${rel(ctx, full)}: ${count} reemplazo(s). Nuevo tamaño: ${formatSize(
          Buffer.byteLength(updated, 'utf8')
        )}`
      }
    }
  },

  grep: {
    name: 'grep',
    description: 'Busca un patrón (expresión regular) en los archivos del proyecto y devuelve coincidencias con archivo y línea.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Expresión regular JavaScript.' },
        path: { type: 'string', description: 'Carpeta o archivo donde buscar. Por defecto el proyecto.' },
        glob: { type: 'string', description: 'Filtro de archivos, p. ej. "*.ts" o "src/**/*.tsx".' },
        ignore_case: { type: 'boolean', description: 'Ignorar mayúsculas/minúsculas.' },
        max_results: { type: 'number', description: 'Máximo de coincidencias (por defecto 120).' }
      },
      required: ['pattern']
    },
    async run(args, ctx) {
      const pattern = str(args, 'pattern')
      let regex: RegExp
      try {
        regex = new RegExp(pattern, args.ignore_case === true ? 'i' : '')
      } catch (err) {
        return { ok: false, output: `Expresión regular inválida: ${String(err)}` }
      }
      const start = resolveInWorkspace(ctx.workspace, str(args, 'path', '.'))
      const filter = str(args, 'glob') ? globToRegExp(str(args, 'glob')) : null
      const max = clamp(num(args, 'max_results', 120), 1, 500)
      const results: string[] = []
      let scanned = 0

      const handle = async (file: string): Promise<boolean> => {
        if (filter && !filter.test(rel(ctx, file))) return false
        const st = await fsp.stat(file).catch(() => null)
        if (!st || st.size > MAX_FILE_BYTES) return false
        const buf = await fsp.readFile(file).catch(() => null)
        if (!buf || isBinaryBuffer(buf)) return false
        scanned++
        const lines = buf.toString('utf8').replace(/\r\n/g, '\n').split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push(`${rel(ctx, file)}:${i + 1}: ${lines[i].trim().slice(0, 240)}`)
            if (results.length >= max) return true
          }
        }
        return false
      }

      const stat = await fsp.stat(start).catch(() => null)
      if (!stat) return { ok: false, output: `No existe la ruta ${str(args, 'path')}` }
      if (stat.isFile()) await handle(start)
      else await walk(start, handle)

      return {
        ok: true,
        output: results.length
          ? `${results.join('\n')}\n\n${results.length} coincidencia(s) en ${scanned} archivo(s).`
          : `Sin coincidencias (${scanned} archivos revisados).`
      }
    }
  },

  glob: {
    name: 'glob',
    description: 'Encuentra archivos por patrón glob, por ejemplo "**/*.ts" o "src/**/test/*.js".',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Patrón glob relativo a la raíz del proyecto.' }
      },
      required: ['pattern']
    },
    async run(args, ctx) {
      const regex = globToRegExp(str(args, 'pattern'))
      const found: string[] = []
      await walk(ctx.workspace, async (file) => {
        if (regex.test(rel(ctx, file))) found.push(rel(ctx, file))
        return found.length >= 500
      })
      return {
        ok: true,
        output: found.length ? `${found.slice(0, 500).join('\n')}\n\n${found.length} archivo(s).` : 'Sin resultados.'
      }
    }
  },

  run_command: {
    name: 'run_command',
    description:
      'Ejecuta un comando de shell dentro del proyecto (tests, build, npm, git, etc.). Devuelve stdout, stderr y el código de salida. Evita comandos interactivos o de larga duración.',
    readOnly: false,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Comando completo a ejecutar.' },
        cwd: { type: 'string', description: 'Directorio de trabajo relativo al proyecto.' },
        timeout_ms: { type: 'number', description: 'Tiempo máximo en ms (por defecto 120000, máx. 600000).' }
      },
      required: ['command']
    },
    async run(args, ctx) {
      const command = str(args, 'command').trim()
      if (!command) return { ok: false, output: 'Comando vacío.' }
      const cwd = resolveForWrite(ctx, str(args, 'cwd', '.'))
      const timeout = clamp(num(args, 'timeout_ms', 120000), 1000, 600000)
      return await new Promise<ToolResult>((resolve) => {
        const shell = process.platform === 'win32' ? process.env.COMSPEC || 'cmd.exe' : '/bin/bash'
        const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command]
        const proc = spawn(shell, shellArgs, { cwd, windowsHide: true, env: process.env })
        let stdout = ''
        let stderr = ''
        let killed = false
        const timer = setTimeout(() => {
          killed = true
          if (process.platform === 'win32' && proc.pid) {
            spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true })
          } else {
            proc.kill('SIGKILL')
          }
        }, timeout)

        const onAbort = (): void => {
          killed = true
          proc.kill('SIGKILL')
        }
        ctx.signal.addEventListener('abort', onAbort, { once: true })

        proc.stdout.on('data', (d) => {
          stdout += String(d)
          if (stdout.length > 200_000) stdout = stdout.slice(-200_000)
        })
        proc.stderr.on('data', (d) => {
          stderr += String(d)
          if (stderr.length > 200_000) stderr = stderr.slice(-200_000)
        })
        proc.on('error', (err) => {
          clearTimeout(timer)
          ctx.signal.removeEventListener('abort', onAbort)
          resolve({ ok: false, output: `No se pudo ejecutar: ${err.message}` })
        })
        proc.on('close', (code) => {
          clearTimeout(timer)
          ctx.signal.removeEventListener('abort', onAbort)
          const parts = [`$ ${command}`, `cwd: ${rel(ctx, cwd)}`, `exit code: ${code ?? 'null'}${killed ? ' (terminado por tiempo o cancelación)' : ''}`]
          if (stdout.trim()) parts.push(`--- stdout ---\n${truncate(stdout.trim(), 20000)}`)
          if (stderr.trim()) parts.push(`--- stderr ---\n${truncate(stderr.trim(), 20000)}`)
          resolve({ ok: code === 0 && !killed, output: parts.join('\n') })
        })
      })
    }
  },

  web_fetch: {
    name: 'web_fetch',
    description: 'Descarga una URL (documentación, issues, APIs) y devuelve el texto plano. Solo http/https.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL http(s) a consultar.' }
      },
      required: ['url']
    },
    async run(args, ctx) {
      if (!ctx.webFetch) return { ok: false, output: 'La consulta web está desactivada en Ajustes.' }
      const url = str(args, 'url')
      if (!/^https?:\/\//i.test(url)) return { ok: false, output: 'Solo se permiten URLs http o https.' }
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 OpenPro-Agente', Accept: 'text/html,application/json,text/plain,*/*' },
          signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(25000)])
        })
        if (!res.ok) return { ok: false, output: `HTTP ${res.status} al consultar ${url}` }
        const type = res.headers.get('content-type') ?? ''
        const raw = await res.text()
        let text = raw
        if (type.includes('html')) {
          text = raw
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
        }
        return { ok: true, output: truncate(`Contenido de ${url}:\n${text.trim()}`, 40000) }
      } catch (err) {
        return { ok: false, output: `Error consultando ${url}: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  }
}

export function toolDefinitions(webFetch: boolean, permission: Permission = 'workspace'): EngineToolDef[] {
  return Object.values(TOOLS)
    .filter((t) => t.name !== 'web_fetch' || webFetch)
    // En «solo pensar» ni siquiera se le ofrecen las herramientas que modifican
    // archivos: así no las intenta ni se queda explicando que no puede.
    .filter((t) => permission !== 'plan' || !WRITE_TOOLS.has(t.name))
    .map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }))
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const tool = TOOLS[name]
  if (!tool) return { ok: false, output: `Herramienta desconocida: ${name}` }
  try {
    return await tool.run(args, ctx)
  } catch (err) {
    return { ok: false, output: `Error en ${name}: ${err instanceof Error ? err.message : String(err)}` }
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
