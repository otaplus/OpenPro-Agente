import { useState } from 'react'
import type { ChatMessage } from '@shared/types'
import { Markdown } from './Markdown'
import { ToolCard } from './ToolCard'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  return (
    <button
      className="copy-btn"
      title="Copiar respuesta"
      onClick={() => {
        void window.clipboard.write(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? '✓ Copiado' : 'Copiar'}
    </button>
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
        <div className="avatar user">TÚ</div>
        <div className="msg-body">
          <div className="msg-head">
            <span className="name">Tú</span>
            <span className="spacer" />
            <CopyButton text={message.content} />
          </div>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="msg">
      <div className="avatar assistant">OP</div>
      <div className="msg-body">
        <div className="msg-head">
          <span className="name">OpenPro</span>
          {message.meta?.model && <span>{message.meta.model}</span>}
          <span className="spacer" />
          <CopyButton text={message.content} />
        </div>
        {message.reasoning && (
          <details className="reasoning">
            <summary>Razonamiento del modelo</summary>
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
      </div>
    </div>
  )
}
