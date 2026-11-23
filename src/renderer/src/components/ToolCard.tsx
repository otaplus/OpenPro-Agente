import type { ToolCall } from '@shared/types'
import { t } from '../i18n'
import { copyText } from '../lib'

export type ToolStatus = 'pending' | 'running' | 'done' | 'error' | 'denied'

function targetOf(call: ToolCall): string {
  const args = call.args ?? {}
  const pick = (key: string): string => (typeof args[key] === 'string' ? (args[key] as string) : '')
  switch (call.name) {
    case 'run_command':
      return pick('command')
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return pick('path')
    case 'grep':
      return `${pick('pattern')}${pick('glob') ? `  [${pick('glob')}]` : ''}`
    case 'glob':
      return pick('pattern')
    case 'list_dir':
      return pick('path') || '.'
    case 'web_fetch':
      return pick('url')
    default:
      return ''
  }
}

const STATUS_LABEL: Record<ToolStatus, string> = {
  pending: t('en cola'),
  running: t('ejecutando'),
  done: 'ok',
  error: t('error'),
  denied: t('denegado')
}

export function ToolCard({
  call,
  status,
  result,
  durationMs
}: {
  call: ToolCall
  status: ToolStatus
  result?: string
  durationMs?: number
}) {
  const target = targetOf(call)
  return (
    <details className="tool-card">
      <summary className="tool-head">
        <span className={`tool-dot ${status}`} />
        <span className="tool-name">{call.name}</span>
        {target && <span className="tool-target">{target}</span>}
        <span className="spacer" />
        {typeof durationMs === 'number' && durationMs > 400 && (
          <span className="muted small">{(durationMs / 1000).toFixed(1)} s</span>
        )}
        <span className="badge">{STATUS_LABEL[status]}</span>
      </summary>
      <div className="tool-body">
        <div className="tool-args">
          {Object.entries(call.args ?? {})
            .slice(0, 4)
            .map(([key, value]) => (
              <span className="chip" key={key} title={typeof value === 'string' ? value : JSON.stringify(value)}>
                {key}: {typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, 90) : JSON.stringify(value).slice(0, 60)}
              </span>
            ))}
        </div>
        {result ? (
          <>
            <pre className="tool-pre">{result}</pre>
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => void copyText(result)}>
                Copiar salida
              </button>
            </div>
          </>
        ) : (
          <div className="muted small">{status === 'running' ? t('Ejecutando…') : t('Sin salida todavía.')}</div>
        )}
      </div>
    </details>
  )
}
