import type { AppInfo, EngineStatus, SessionSummary } from '@shared/types'
import { timeAgo } from '../lib'
import { t } from '../i18n'

export type Page = 'chat' | 'models' | 'settings'

function Icon({ name }: { name: 'chat' | 'cube' | 'gear' | 'plus' | 'trash' | 'folder' }) {
  const paths: Record<string, React.JSX.Element> = {
    chat: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 3.4c-.5.4-1.4 0-1.4-.7V5.5Z" />,
    cube: <path d="M12 2.8 20 7v10l-8 4.2L4 17V7l8-4.2Zm0 2.3L6.2 8.3 12 11.4l5.8-3.1L12 5.1ZM6 10.1v5.6l5 2.6v-5.6l-5-2.6Zm7 8.2 5-2.6v-5.6l-5 2.6v5.6Z" />,
    gear: (
      <path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm8.6 3.4c0 .5 0 1-.1 1.4l2 1.6-1.7 3-2.5-.8c-.7.6-1.5 1-2.3 1.4l-.4 2.6h-3.4l-.4-2.6c-.8-.3-1.6-.8-2.3-1.4l-2.5.8-1.7-3 2-1.6a8.6 8.6 0 0 1 0-2.8l-2-1.6 1.7-3 2.5.8c.7-.6 1.5-1 2.3-1.4l.4-2.6h3.4l.4 2.6c.8.3 1.6.8 2.3 1.4l2.5-.8 1.7 3-2 1.6c0 .5.1.9.1 1.4Z" />
    ),
    plus: <path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z" />,
    trash: <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z" />,
    folder: <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export function Sidebar({
  info,
  sessions,
  activeId,
  page,
  engine,
  installedCount,
  onPage,
  onSelectSession,
  onDeleteSession,
  onNewChat
}: {
  info: AppInfo | null
  sessions: SessionSummary[]
  activeId: string | null
  page: Page
  engine: EngineStatus | null
  installedCount: number
  onPage: (page: Page) => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onNewChat: () => void
}) {
  const chipClass =
    engine?.state === 'ready' ? 'ready' : engine?.state === 'starting' ? 'starting' : engine?.state === 'error' ? 'error' : ''
  const chipText =
    engine?.state === 'ready'
      ? `Motor listo${engine.backend ? ` · ${engine.backend.toUpperCase()}` : ''}`
      : engine?.state === 'starting'
        ? t('Cargando modelo…')
        : engine?.state === 'error'
          ? t('Error del motor')
          : t('Motor detenido')

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">OP</div>
        <div>
          <div className="brand-name">OpenPro Agente</div>
          <div className="brand-version">{info ? `v${info.version}` : 'local-first'}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button className={`nav-btn ${page === 'chat' ? 'active' : ''}`} onClick={() => onPage('chat')}>
          <Icon name="chat" /> {t('Chat')}
        </button>
        <button className={`nav-btn ${page === 'models' ? 'active' : ''}`} onClick={() => onPage('models')}>
          <Icon name="cube" /> {t('Modelos')}
        </button>
        <button className={`nav-btn ${page === 'settings' ? 'active' : ''}`} onClick={() => onPage('settings')}>
          <Icon name="gear" /> {t('Ajustes')}
        </button>
      </nav>

      <div className="sidebar-section">
        <span>Conversaciones</span>
        <button className="btn btn-sm btn-ghost" title={t('Nueva conversación')} onClick={onNewChat}>
          <Icon name="plus" />
        </button>
      </div>

      <div className="sessions">
        {!sessions.length && <div className="muted small" style={{ padding: '8px 10px' }}>{t('Sin conversaciones todavía.')}</div>}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-item ${session.id === activeId && page === 'chat' ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
            title={session.title}
          >
            <span className="title">{session.title}</span>
            <span className="when">{timeAgo(session.updatedAt)}</span>
            <button
              className="del"
              title={t('Eliminar conversación')}
              onClick={(event) => {
                event.stopPropagation()
                onDeleteSession(session.id)
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className={`status-chip ${chipClass}`} title={engine?.message ?? ''}>
          <span className="dot" /> {chipText}
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted small">{installedCount} {t('modelo(s) local(es)')}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => onPage('models')}>
            <Icon name="folder" /> {t('Gestionar')}
          </button>
        </div>
      </div>
    </aside>
  )
}
