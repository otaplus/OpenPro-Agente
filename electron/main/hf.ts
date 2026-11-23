import type { HfFile, HfModelSummary, ResolvedQuant } from '@shared/types'
import { fetchJson } from './util'
import { loadSettings } from './settings'
import { log } from './logger'

const BASE = 'https://huggingface.co'

async function authHeaders(): Promise<Record<string, string>> {
  const s = await loadSettings()
  return s.hfToken ? { Authorization: `Bearer ${s.hfToken}` } : {}
}

export async function searchModels(query: string, limit = 25): Promise<HfModelSummary[]> {
  const params = new URLSearchParams({
    filter: 'gguf',
    sort: 'downloads',
    direction: '-1',
    limit: String(limit),
    full: 'false'
  })
  if (query.trim()) params.set('search', query.trim())
  const url = `${BASE}/api/models?${params.toString()}`
  const data = await fetchJson<
    Array<{
      id: string
      downloads?: number
      likes?: number
      lastModified?: string
      tags?: string[]
      gated?: boolean | string
    }>
  >(url, { headers: await authHeaders() })

  return (data ?? [])
    .filter((m) => m.id)
    .map((m) => ({
      id: m.id,
      downloads: m.downloads ?? 0,
      likes: m.likes ?? 0,
      lastModified: m.lastModified,
      tags: m.tags ?? [],
      gated: Boolean(m.gated)
    }))
}

function splitInfo(p: string): { index: number; total: number } | undefined {
  const m = p.match(/[-.](\d{5})-of-(\d{5})\.gguf$/i)
  if (!m) return undefined
  return { index: Number(m[1]), total: Number(m[2]) }
}

export function naturalKey(p: string): string {
  return p.toUpperCase().replace(/[-.\s]/g, '_')
}

export async function listGgufFiles(repo: string): Promise<HfFile[]> {
  const headers = await authHeaders()
  type TreeEntry = { type: string; path: string; size?: number; lfs?: { size?: number } }
  let entries: TreeEntry[] = []
  try {
    entries = await fetchJson<TreeEntry[]>(
      `${BASE}/api/models/${repo}/tree/main?recursive=true&expand=false`,
      { headers },
      30000
    )
  } catch (err) {
    log('warn', `tree API falló para ${repo}, probando /api/models`, String(err))
    const info = await fetchJson<{ siblings?: Array<{ rfilename: string; size?: number; lfs?: { size?: number } }> }>(
      `${BASE}/api/models/${repo}?blobs=true`,
      { headers },
      30000
    )
    entries = (info.siblings ?? []).map((s) => ({
      type: 'file',
      path: s.rfilename,
      size: s.size,
      lfs: s.lfs
    }))
  }

  const files: HfFile[] = []
  for (const entry of entries) {
    if (entry.type !== 'file') continue
    if (!/\.gguf$/i.test(entry.path)) continue
    const size = entry.lfs?.size ?? entry.size ?? 0
    files.push({
      path: entry.path,
      sizeBytes: size,
      split: splitInfo(entry.path),
      isMmproj: /mmproj/i.test(entry.path)
    })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

export function downloadUrl(repo: string, file: string): string {
  const encoded = file.split('/').map((p) => encodeURIComponent(p)).join('/')
  return `${BASE}/${repo}/resolve/main/${encoded}?download=true`
}

export interface ResolvedQuantLocal extends ResolvedQuant {}

/**
 * Busca en el repo los archivos GGUF de la cuantización pedida.
 * Si no existe esa cuantización exacta, baja de calidad hasta encontrar algo usable.
 */
export async function resolveQuant(repo: string, quant: string): Promise<ResolvedQuant> {
  const all = (await listGgufFiles(repo)).filter((f) => !f.isMmproj)
  if (!all.length) throw new Error(`El repositorio ${repo} no contiene archivos GGUF.`)

  const wanted = naturalKey(quant)
  const byQuant = (candidate: string): HfFile[] => {
    const key = naturalKey(candidate)
    return all.filter((f) => naturalKey(f.path).includes(key))
  }

  const fallbackOrder = [
    quant,
    'Q4_K_M',
    'Q4_K_S',
    'Q4_0',
    'Q5_K_M',
    'Q3_K_M',
    'Q8_0'
  ]
  for (const candidate of fallbackOrder) {
    const matches = byQuant(candidate)
    if (!matches.length) continue
    return groupResult(matches, candidate, naturalKey(candidate) === wanted)
  }

  // Sin coincidencias conocidas: elige el GGUF con "Q4" o el primero disponible.
  const q4 = all.filter((f) => /q4/i.test(f.path))
  const chosen = q4.length ? q4 : all
  return groupResult(chosen, 'auto', false)
}

function groupResult(matches: HfFile[], quant: string, exact: boolean): ResolvedQuant {
  // Si hay archivos divididos, descarga todas las partes del mismo modelo.
  const splitTotals = new Set(matches.filter((m) => m.split).map((m) => m.split!.total))
  let files = matches
  if (splitTotals.size) {
    const total = [...splitTotals].sort((a, b) => b - a)[0]
    files = matches.filter((m) => m.split && m.split.total === total).sort((a, b) => a.split!.index - b.split!.index)
    // La primera parte identifica el modelo; si hay varias variantes, agrupa por prefijo.
    const first = files.find((f) => f.split!.index === 1)
    if (first) {
      const prefix = first.path.replace(/[-.]\d{5}-of-\d{5}\.gguf$/i, '')
      files = files.filter((f) => f.path.startsWith(prefix))
    }
  } else {
    // Varios GGUF de la misma cuantización: prioriza el de mayor tamaño que no sea mmproj.
    files = [matches.slice().sort((a, b) => b.sizeBytes - a.sizeBytes)[0]]
  }
  const sizeBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0)
  return { quant, files, sizeBytes, exact }
}

export function modelNameFromRepo(repo: string): string {
  return repo.split('/').pop() ?? repo
}

export function quantFromFileName(file: string): string | undefined {
  const m = file.match(/(?:^|[-_.])((?:I?Q\d+(?:_[A-Z0-9]+)*)|(?:F16)|(?:BF16)|(?:F32))(?=[-_.]|\.gguf)/i)
  return m?.[1]?.toUpperCase()
}
