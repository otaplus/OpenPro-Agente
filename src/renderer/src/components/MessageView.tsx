import { useState } from 'react'
import { t } from '../i18n'
import type { ChatMessage, MessageMetrics } from '@shared/types'
import { Markdown } from './Markdown'
import { ToolCard } from './ToolCard'
import { formatDuration, formatInt, formatSpeed } from '../lib'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  return (
    <button
      className="copy-btn"
      title={t('Copiar respuesta')}
      onClick={() => {
        void window.clipboard.write(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? t('✓ Copiado') : t('Copiar')}
    </button>
  )
}

/** Pie con los números de la generación, para comparar modelos de un vistazo. */
function MetricsFooter({ metrics }: { metrics: MessageMetrics }) {
  const detail = [
    `${t('Modelo')}: ${metrics.model ?? '—'}${metrics.backend ? ` (${metrics.backend})` : ''}`,
    `${t('Tokens de prompt')}: ${formatInt(metrics.promptTokens)}${
      metrics.cachedTokens ? ` (${formatInt(metrics.cachedTokens)} ${t('en caché')})` : ''
    }`,
    `${t('Evaluación del prompt')}: ${formatDuration(metrics.promptMs)} · ${formatSpeed(metrics.promptTokPerSec)}`,
    `${t('Tokens generados')}: ${formatInt(metrics.completionTokens)}`,
    `${t('Generación')}: ${formatDuration(metrics.genMs)} · ${formatSpeed(metrics.genTokPerSec)}`,
    `${t('Primer token (media)')}: ${formatDuration(metrics.firstTokenMs)}`,
    `${t('en total')}: ${formatDuration(metrics.totalMs)}`,
    metrics.steps && metrics.steps > 1 ? `${t('Pasos del agente')}: ${metrics.steps}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div className="msg-metrics" title={detail}>
      <span className="metric">
        <strong>{formatInt(metrics.completionTokens)}</strong> tok
      </span>
      <span className="metric">{formatSpeed(metrics.genTokPerSec)}</span>
      <span className="metric">{t('1er tok')} {formatDuration(metrics.firstTokenMs)}</span>
      <span className="metric">{formatDuration(metrics.totalMs)}</span>
      {metrics.promptTokens > 0 && (
        <span className="metric muted">
          {t('prompt')} {formatInt(metrics.promptTokens)} tok · {formatSpeed(metrics.promptTokPerSec)}
        </span>
      )}
    </div>
  )
}

export function MessageView({
  message,
  toolResults,
  streaming
}: {
  message: ChatMessage
  toolResults: Map<string, ChatMessage>
  streaming?: boolean
}) {
  if (message.role === 'tool') return <></>

  if (message.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="avatar user">{t('TÚ')}</div>
        <div className="msg-body">
          <div className="msg-head">
            <span className="name">{t('Tú')}</span>
            <span className="spacer" />
            <CopyButton text={message.content} />
          </div>
          {message.content}
        </div>
      </div>
    )
  }

  const modelName = message.metrics?.model ?? message.meta?.model

  return (
    <div className="msg">
      <div className="avatar assistant">OP</div>
      <div className="msg-body">
        <div className="msg-head">
          <span className="name">OpenPro</span>
          {modelName && <span>{modelName}</span>}
          <span className="spacer" />
          <CopyButton text={message.content} />
        </div>
        {message.reasoning && (
          <details className="reasoning">
            <summary>{t('Razonamiento del modelo')}</summary>
            <div className="reasoning-body">{message.reasoning}</div>
          </details>
        )}
        {message.content && <Markdown text={message.content} />}
        {streaming && !message.content && <span className="cursor" />}
        {message.error && <div className="msg-error">{message.error}</div>}
        {(message.toolCalls ?? []).map((call) => {
          const result = toolResults.get(call.id)
          return (
            <ToolCard
              key={call.id}
              call={call}
              status={result?.toolStatus ?? 'running'}
              result={result?.content}
            />
          )
        })}
        {message.metrics && <MetricsFooter metrics={message.metrics} />}
      </div>
    </div>
  )
}
