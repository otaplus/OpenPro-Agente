import { useEffect, useRef, useState } from 'react'

export function Composer({
  busy,
  step,
  disabled,
  onSend,
  onStop
}: {
  busy: boolean
  step: { step: number; max: number } | null
  disabled?: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(220, el.scrollHeight)}px`
  }, [value])

  const send = (): void => {
    const text = value.trim()
    if (!text || busy || disabled) return
    setValue('')
    onSend(text)
  }

  const paste = async (): Promise<void> => {
    const text = await window.clipboard.read()
    if (!text) return
    setValue((prev) => {
      const el = ref.current
      const start = el?.selectionStart ?? prev.length
      const end = el?.selectionEnd ?? prev.length
      return prev.slice(0, start) + text + prev.slice(end)
    })
  }

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="composer-box">
          <textarea
            ref={ref}
            value={value}
            placeholder={
              disabled
                ? 'Selecciona un modelo y una carpeta de proyecto para empezar…'
                : 'Pide un cambio, una explicación o una tarea. Shift+Enter para nueva línea.'
            }
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div className="composer-actions">
            {busy && step && (
              <span className="muted small">
                Paso {step.step} de {step.max}
              </span>
            )}
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={paste} disabled={disabled} title="Pegar del portapapeles">
              Pegar
            </button>
            {busy ? (
              <button className="btn btn-danger" onClick={onStop}>
                Detener
              </button>
            ) : (
              <button className="btn btn-primary" onClick={send} disabled={!value.trim() || disabled}>
                Enviar ↵
              </button>
            )}
          </div>
        </div>
        <div className="composer-hint">
          El modelo y las herramientas se ejecutan en tu equipo. Nada se envía a la nube.
        </div>
      </div>
    </div>
  )
}
