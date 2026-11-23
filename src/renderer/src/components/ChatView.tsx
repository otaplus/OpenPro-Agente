import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../i18n'
import type { ApprovalRequest, ChatMessage, ChatToolEvent, EngineStatus, Session } from '@shared/types'
import { MessageView } from './MessageView'
import { Markdown } from './Markdown'
import { ToolCard, type ToolStatus } from './ToolCard'
import { Composer } from './Composer'
import { SessionMetrics } from './SessionMetrics'

const SUGGESTIONS = [
  t('Explora el proyecto y explícame su arquitectura.'),
  t('Busca posibles bugs y propone correcciones.'),
  t('Añade tests para el módulo principal.'),
  t('Revisa el último cambio y resume su impacto.')
]

export function ChatView({
  session,
  live,
  liveTools,
  approval,
  busy,
  step,
  engine,
  disabled,
  onToast,
  onSend,
  onStop,
  onApprove,
  onPickWorkspace
}: {
  session: Session | null
  live: { id: string; content: string; reasoning: string } | null
  liveTools: ChatToolEvent[]
  approval: ApprovalRequest | null
  busy: boolean
  step: { step: number; max: number } | null
  engine: EngineStatus | null
  disabled: boolean
  onToast: (message: string, error?: boolean) => void
  onSend: (text: string) => void
  onStop: () => void
  onApprove: (requestId: string, decision: 'once' | 'always' | 'deny') => void
  onPickWorkspace: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const messages = session?.messages ?? []
  const toolResults = useMemo(() => {
    const map = new Map<string, ChatMessage>()
    for (const message of messages) {
      if (message.role === 'tool' && message.toolCallId) map.set(message.toolCallId, message)
    }
    return map
  }, [messages])

  const persistedIds = useMemo(() => new Set(messages.map((m) => m.id)), [messages])
  const liveIsPersisted = live ? persistedIds.has(live.id) : false
  const visibleLiveTools = liveTools.filter((t) => !persistedIds.has(t.messageId))
  const showLive = Boolean(live && !liveIsPersisted && (live.content || live.reasoning || busy))
  const thinking = busy && showLive && !live?.content && !live?.reasoning && visibleLiveTools.length === 0

  // Cronómetro visible mientras el modelo "piensa": en CPU el primer token tarda
  // mucho y sin esto la app parece congelada.
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stick.current) return
    el.scrollTop = el.scrollHeight
  }, [messages, live?.content, live?.reasoning, visibleLiveTools.length, thinking])

  return (
    <div className="chat">
      <div
        className="messages"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
        }}
      >
        <div className="messages-inner">
          <SessionMetrics session={session} onExported={(path, error) => onToast(error ?? (path ? t('Métricas exportadas: {path}', { path }) : t('Exportación cancelada')), Boolean(error))} />
          {engine?.state === 'error' && (
            <div className="msg-error">Motor: {engine.message ?? 'error desconocido'}</div>
          )}

          {!messages.length && !busy && (
            <div className="empty">
              <h2 style={{ margin: '0 0 6px', fontSize: 20, color: 'var(--text)' }}>{t('Agente local listo para programar')}</h2>
              <p style={{ maxWidth: 520, margin: '0 auto 20px' }}>
                {t('Abre una carpeta de proyecto, elige un modelo GGUF y pídeme cambios reales en el código. Puedo leer, editar, buscar y ejecutar comandos.')}
              </p>
              {!session?.workspace && (
                <button className="btn btn-primary" onClick={onPickWorkspace} style={{ marginBottom: 20 }}>
                  {t('Elegir carpeta de proyecto')}
                </button>
              )}
              <div className="grid-2" style={{ maxWidth: 640, margin: '0 auto' }}>
                {SUGGESTIONS.map((text) => (
                  <button
                    key={text}
                    className="card"
                    style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--text-dim)' }}
                    onClick={() => onSend(text)}
                    disabled={disabled}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <MessageView key={message.id} message={message} toolResults={toolResults} />
          ))}

          {showLive && live && (
            <div className="msg">
              <div className="avatar assistant">OP</div>
              <div className="msg-body">
                <div className="msg-head">
                  <span className="name">OpenPro</span>
                  {engine?.modelName && <span>{engine.modelName}</span>}
                </div>
                {live.reasoning && (
                  <details className="reasoning" open>
                    <summary>Razonamiento del modelo</summary>
                    <div className="reasoning-body">{live.reasoning}</div>
                  </details>
                )}
                {live.content ? <Markdown text={live.content} /> : thinking ? <span className="muted">{t('Pensando…')} {elapsed}s</span> : null}
                {busy && <span className="cursor" />}
              </div>
            </div>
          )}

          {visibleLiveTools.map((event) => (
            <div className="msg" key={event.messageId}>
              <div className="avatar assistant" style={{ visibility: 'hidden' }} />
              <div className="msg-body">
                <ToolCard
                  call={event.call}
                  status={event.status as ToolStatus}
                  result={event.result}
                  durationMs={event.durationMs}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {approval && (
        <div className="composer" style={{ paddingBottom: 0, borderTop: 'none' }}>
          <div className="composer-inner">
            <div className="approval">
              <div className="approval-head">⚠ {approval.reason}</div>
              <pre className="approval-pre">{approval.preview}</pre>
              <div className="approval-actions">
                <button className="btn btn-sm" onClick={() => onApprove(approval.id, 'deny')}>
                  Denegar
                </button>
                <button className="btn btn-sm" onClick={() => onApprove(approval.id, 'always')}>
                  Permitir siempre
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => onApprove(approval.id, 'once')}>
                  Permitir una vez
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Composer busy={busy} step={step} disabled={disabled} onSend={onSend} onStop={onStop} />
    </div>
  )
}
