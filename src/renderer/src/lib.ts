import { getLang, t } from './i18n'

export const api = window.api

/** Locale para números y fechas según el idioma elegido. */
function locale(): string {
  return getLang() === 'en' ? 'en-US' : 'es-ES'
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return t('ahora')
  if (min < 60) return t('hace {n} min', { n: min })
  const h = Math.round(min / 60)
  if (h < 24) return t('hace {n} h', { n: h })
  const d = Math.round(h / 24)
  if (d < 30) return t('hace {n} d', { n: d })
  return new Date(ts).toLocaleDateString(locale())
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function shortPath(p: string | null | undefined): string {
  if (!p) return '—'
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts.length <= 3 ? p : `…/${parts.slice(-2).join('/')}`
}

/** Números con separador de miles (1.234 en español, 1,234 en inglés). */
export function formatInt(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString(locale())
}

/** Velocidad en tokens por segundo con un decimal (58,7 tok/s). */
export function formatSpeed(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} tok/s`
}

/** Duración legible: 640 ms, 4,2 s, 2 min 5 s. */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) {
    return `${seconds.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
  }
  const min = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${min} min ${rest} s`
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // ignore
  }
}
