import { useMemo, useState } from 'react'
import type { Session } from '@shared/types'
import { formatDuration, formatInt, formatSpeed } from '../lib'

/**
 * Resumen de las métricas de la conversación: totales y medias.
 * Sirve para comparar dos modelos con la misma conversación o entre sesiones.
 */
export function SessionMetrics({
  session,
  onExported
}: {
  session: Session | null
  onExported: (path: string | null, error?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const stats = useMemo(() => {
    const messages = session?.messages ?? []
    const withMetrics = messages.filter((m) => m.metrics)
    if (!withMetrics.length) return null

    let promptTokens = 0
    let completionTokens = 0
    let genMs = 0
    let promptMs = 0
    let totalMs = 0
    let firstTokenMs = 0
    let firstTokenCount = 0
    const models = new Set<string>()
    let backend = ''

    for (const message of withMetrics) {
      const m = message.metrics!
      promptTokens += m.promptTokens
      completionTokens += m.completionTokens
      genMs += m.genMs ?? 0
      promptMs += m.promptMs ?? 0
      totalMs += m.totalMs ?? 0
      if (m.firstTokenMs !== undefined) {
        firstTokenMs += m.firstTokenMs
        firstTokenCount++
      }
      if (m.model) models.add(m.model)
      if (m.backend) backend = m.backend
    }

    return {
      responses: withMetrics.length,
      promptTokens,
      completionTokens,
      // Media ponderada: tokens totales / tiempo total (más justa que la media de medias).
      genTokPerSec: genMs > 0 ? (completionTokens * 1000) / genMs : undefined,
      promptTokPerSec: promptMs > 0 ? (promptTokens * 1000) / promptMs : undefined,
      firstTokenMs: firstTokenCount ? firstTokenMs / firstTokenCount : undefined,
      totalMs,
      models: [...models],
      backend
    }
  }, [session])

  if (!stats) return null

  async function exportCsv(all: boolean): Promise<void> {
    setExporting(true)
    try {
      const written = await window.api.metrics.exportCsv(all ? undefined : session?.id)
      onExported(written, written ? undefined : 'Exportación cancelada')
    } catch (err) {
      onExported(null, err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="session-metrics">
      <button
        className="session-metrics-bar"
        onClick={() => setOpen((v) => !v)}
        title="Ver el resumen de métricas de esta conversación"
      >
        <span className="metric">
          <strong>{stats.responses}</strong> {stats.responses === 1 ? 'respuesta' : 'respuestas'}
        </span>
        <span className="metric">
          <strong>{formatInt(stats.completionTokens)}</strong> tok
        </span>
        <span className="metric">{formatSpeed(stats.genTokPerSec)} media</span>
        <span className="metric">{formatDuration(stats.totalMs)} en total</span>
        <span className="session-metrics-toggle">{open ? 'Ocultar' : 'Detalles'}</span>
      </button>

      {open && (
        <div className="session-metrics-panel">
          <div className="session-metrics-grid">
            <div>
              <span className="k">Tokens generados</span>
              <span className="v">{formatInt(stats.completionTokens)}</span>
            </div>
            <div>
              <span className="k">Velocidad media</span>
              <span className="v">{formatSpeed(stats.genTokPerSec)}</span>
            </div>
            <div>
              <span className="k">Tokens de prompt</span>
              <span className="v">{formatInt(stats.promptTokens)}</span>
            </div>
            <div>
              <span className="k">Prompt por segundo</span>
              <span className="v">{formatSpeed(stats.promptTokPerSec)}</span>
            </div>
            <div>
              <span className="k">Primer token (media)</span>
              <span className="v">{formatDuration(stats.firstTokenMs)}</span>
            </div>
            <div>
              <span className="k">Tiempo acumulado</span>
              <span className="v">{formatDuration(stats.totalMs)}</span>
            </div>
            <div>
              <span className="k">Modelo</span>
              <span className="v mono small">{stats.models.join(', ') || '—'}</span>
            </div>
            <div>
              <span className="k">Backend</span>
              <span className="v">{stats.backend ? stats.backend.toUpperCase() : '—'}</span>
            </div>
          </div>
          <div className="session-metrics-actions">
            <button className="btn btn-sm" disabled={exporting} onClick={() => void exportCsv(false)}>
              {exporting ? 'Exportando…' : 'Exportar esta conversación (CSV)'}
            </button>
            <button className="btn btn-sm" disabled={exporting} onClick={() => void exportCsv(true)}>
              Exportar todas (CSV)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
