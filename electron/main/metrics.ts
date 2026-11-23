import { app, dialog } from 'electron'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { ChatMessage, Session } from '@shared/types'
import { listSessions, loadSession } from './sessions'
import { log } from './logger'

const HEADER = [
  'fecha',
  'conversacion',
  'modelo',
  'backend',
  'tokens_prompt',
  'tokens_prompt_cache',
  'ms_prompt',
  'tok_s_prompt',
  'tokens_generados',
  'ms_generacion',
  'tok_s_generacion',
  'ms_primer_token',
  'ms_total',
  'pasos'
]

function csvCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return ''
  const text = String(value)
  // Excel en español espera punto y coma y comillas para los campos con separador.
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function rowsFor(session: Session): string[] {
  const rows: string[] = []
  const title = (session.title || session.id).replace(/\r?\n/g, ' ')
  for (const message of session.messages as ChatMessage[]) {
    const m = message.metrics
    if (!m) continue
    rows.push(
      [
        new Date(message.createdAt).toISOString(),
        title,
        m.model ?? '',
        m.backend ?? '',
        m.promptTokens,
        m.cachedTokens ?? '',
        m.promptMs !== undefined ? Math.round(m.promptMs) : '',
        m.promptTokPerSec !== undefined ? m.promptTokPerSec.toFixed(1) : '',
        m.completionTokens,
        m.genMs !== undefined ? Math.round(m.genMs) : '',
        m.genTokPerSec !== undefined ? m.genTokPerSec.toFixed(1) : '',
        m.firstTokenMs ?? '',
        m.totalMs ?? '',
        m.steps ?? ''
      ]
        .map(csvCell)
        .join(';')
    )
  }
  return rows
}

/** Construye el CSV (una fila por respuesta con métricas). */
export async function buildMetricsCsv(sessionId?: string): Promise<{ csv: string; rows: number }> {
  let sessions: Session[]
  if (sessionId) {
    const one = await loadSession(sessionId)
    sessions = one ? [one] : []
  } else {
    const list = await listSessions()
    sessions = []
    for (const summary of list) {
      const full = await loadSession(summary.id)
      if (full) sessions.push(full)
    }
  }
  const rows = sessions.flatMap((session) => rowsFor(session))
  // BOM para que Excel respete los acentos.
  const csv = '\uFEFF' + [HEADER.join(';'), ...rows].join('\r\n') + '\r\n'
  return { csv, rows: rows.length }
}

/** Abre el diálogo de guardado y escribe el CSV. Devuelve la ruta o null. */
export async function exportMetricsCsv(sessionId?: string): Promise<string | null> {
  const { csv, rows } = await buildMetricsCsv(sessionId)
  if (!rows) throw new Error('Todavía no hay métricas que exportar: envía algún mensaje primero.')

  // Permite automatizar la exportación (pruebas/CI) sin abrir el diálogo.
  const forcedPath = process.env.OPENPRO_CSV_PATH
  if (forcedPath) {
    await fsp.writeFile(forcedPath, csv, 'utf8')
    log('info', `Métricas exportadas: ${rows} filas → ${forcedPath}`)
    return forcedPath
  }

  const suggested = sessionId ? 'metricas-conversacion.csv' : 'metricas-openpro.csv'
  const result = await dialog.showSaveDialog({
    title: 'Exportar métricas a CSV',
    defaultPath: path.join(app.getPath('documents'), suggested),
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (result.canceled || !result.filePath) return null

  await fsp.writeFile(result.filePath, csv, 'utf8')
  log('info', `Métricas exportadas: ${rows} filas → ${result.filePath}`)
  return result.filePath
}
