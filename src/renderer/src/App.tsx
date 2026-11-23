import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppInfo,
  AppSettings,
  ApprovalRequest,
  ChatToolEvent,
  DownloadJob,
  EngineInstallState,
  EngineStatus,
  HardwareInfo,
  InstalledModel,
  ModelRecommendation,
  Session,
  SessionSummary
} from '@shared/types'
import { api, shortPath } from './lib'
import { setLang, t } from './i18n'
import { Sidebar, type Page } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { ModelsPage } from './components/ModelsPage'
import { SettingsPage } from './components/SettingsPage'
import { Onboarding } from './components/Onboarding'

export default function App() {
  const [booting, setBooting] = useState(true)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const [recommendations, setRecommendations] = useState<ModelRecommendation[]>([])
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [installing, setInstalling] = useState<EngineInstallState | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [installed, setInstalled] = useState<InstalledModel[]>([])
  const [downloads, setDownloads] = useState<DownloadJob[]>([])
  const [page, setPage] = useState<Page>('chat')
  const [live, setLive] = useState<{ id: string; content: string; reasoning: string } | null>(null)
  const [liveTools, setLiveTools] = useState<ChatToolEvent[]>([])
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<{ step: number; max: number } | null>(null)
  const [toastState, setToastState] = useState<{ id: number; text: string; error: boolean } | null>(null)

  const booted = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  const settingsRef = useRef<AppSettings | null>(null)

  useEffect(() => {
    sessionIdRef.current = session?.id ?? null
    if (session) localStorage.setItem('openpro.lastSession', session.id)
  }, [session])

  useEffect(() => {
    settingsRef.current = settings
    if (settings) document.documentElement.dataset.theme = settings.theme
    if (settings) setLang(settings.language)
  }, [settings])

  const toast = useCallback((message: string, error = false) => {
    setToastState({ id: Date.now(), text: message, error })
  }, [])

  useEffect(() => {
    if (!toastState) return
    const timer = setTimeout(() => setToastState(null), 5200)
    return () => clearTimeout(timer)
  }, [toastState])

  const refreshInstalled = useCallback(async () => {
    try {
      setInstalled(await api.models.installed())
    } catch {
      // ignorar
    }
  }, [])

  const refreshSession = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id) return
    const loaded = await api.sessions.load(id)
    if (!loaded || sessionIdRef.current !== id) return
    setSession(loaded)
    const ids = new Set(loaded.messages.map((m) => m.id))
    setLive((prev) => (prev && ids.has(prev.id) ? null : prev))
    setLiveTools((prev) => prev.filter((t) => !ids.has(t.messageId)))
  }, [])

  const scheduleRefresh = useCallback(() => {
    setTimeout(() => void refreshSession(), 90)
  }, [refreshSession])

  // ------------------------------ Eventos --------------------------------
  useEffect(() => {
    const offs = [
      api.on.chatDelta((event) => {
        if (event.sessionId !== sessionIdRef.current) return
        setLive((prev) => {
          if (!prev || prev.id !== event.messageId) {
            return event.kind === 'content'
              ? { id: event.messageId, content: event.text, reasoning: '' }
              : { id: event.messageId, content: '', reasoning: event.text }
          }
          return event.kind === 'content'
            ? { ...prev, content: prev.content + event.text }
            : { ...prev, reasoning: prev.reasoning + event.text }
        })
      }),
      api.on.chatStep((event) => {
        if (event.sessionId !== sessionIdRef.current) return
        setStep({ step: event.step, max: event.maxSteps })
        scheduleRefresh()
      }),
      api.on.chatTool((event) => {
        if (event.sessionId !== sessionIdRef.current) return
        setLiveTools((prev) => {
          const index = prev.findIndex((t) => t.messageId === event.messageId)
          if (index === -1) return [...prev, event]
          const next = [...prev]
          next[index] = event
          return next
        })
        if (event.status === 'done' || event.status === 'error' || event.status === 'denied') scheduleRefresh()
      }),
      api.on.chatDone((event) => {
        if (event.sessionId !== sessionIdRef.current) return
        setBusy(false)
        setStep(null)
        setLive(null)
        setLiveTools([])
        if (event.error) toast(event.error, true)
        void (async () => {
          const loaded = await api.sessions.load(event.sessionId)
          if (loaded && sessionIdRef.current === event.sessionId) setSession(loaded)
          setSessions(await api.sessions.list())
        })()
        if (event.aborted) toast(t('Generación detenida'))
      }),
      api.on.chatApproval((request) => {
        if (request.sessionId !== sessionIdRef.current) return
        setApproval(request)
      }),
      api.on.engine((event) => setEngine(event.status)),
      api.on.engineInstall((state) => setInstalling(state)),
      api.on.download((event) => {
        setDownloads((prev) => {
          const index = prev.findIndex((d) => d.id === event.job.id)
          if (index === -1) return [...prev, event.job]
          const next = [...prev]
          next[index] = event.job
          return next
        })
        if (event.job.status === 'done') {
          void refreshInstalled()
          toast(`Descarga completada: ${event.job.label}`)
        }
      })
    ]
    return () => offs.forEach((off) => off())
  }, [refreshInstalled, scheduleRefresh, toast])

  // ------------------------------ Arranque --------------------------------
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void (async () => {
      try {
        const [appInfo, appSettings] = await Promise.all([api.info(), api.settings.get()])
        setInfo(appInfo)
        setSettings(appSettings)
        document.documentElement.dataset.theme = appSettings.theme
      setLang(appSettings.language)

        const [list, models, engineStatus, jobs, installState] = await Promise.all([
          api.sessions.list(),
          api.models.installed(),
          api.engine.status(),
          api.models.downloads(),
          api.engine.installState()
        ])
        setSessions(list)
        setInstalled(models)
        setEngine(engineStatus)
        setDownloads(jobs)
        setInstalling(installState)

        const lastId = localStorage.getItem('openpro.lastSession')
        const loaded = lastId ? await api.sessions.load(lastId) : null
        if (loaded) {
          setSession(loaded)
        } else {
          const created = await api.sessions.create(appSettings.lastWorkspace)
          setSession(created)
          setSessions(await api.sessions.list())
        }
        setBooting(false)

        void api
          .hardware()
          .then(async (hw) => {
            setHardware(hw)
            setRecommendations(await api.models.recommend(hw))
          })
          .catch((err) => {
            // Si falla la detección, la pestaña «Recomendados» se queda vacía:
            // mejor decir por qué que dejar una pantalla en blanco.
            toast(
              t('No se pudo leer el hardware del equipo ({error}). Las recomendaciones no estarán disponibles.', {
                error: err instanceof Error ? err.message : String(err)
              }),
              true
            )
          })
      } catch (err) {
        setBooting(false)
        toast(err instanceof Error ? err.message : String(err), true)
      }
    })()
  }, [toast])

  // ------------------------------ Acciones --------------------------------
  const applySettings = useCallback(
    async (next: AppSettings) => {
      setSettings(next)
      document.documentElement.dataset.theme = next.theme
      setLang(next.language)
      void refreshInstalled()
    },
    [refreshInstalled]
  )

  const newChat = useCallback(async () => {
    if (busy && session) await api.chat.abort(session.id)
    const created = await api.sessions.create(settingsRef.current?.lastWorkspace ?? null)
    setSession(created)
    setSessions(await api.sessions.list())
    setPage('chat')
    setLive(null)
    setLiveTools([])
    setStep(null)
    setBusy(false)
    setApproval(null)
  }, [busy, session])

  const selectSession = useCallback(
    async (id: string) => {
      if (id === sessionIdRef.current) {
        setPage('chat')
        return
      }
      if (busy && session) {
        await api.chat.abort(session.id)
        setBusy(false)
      }
      const loaded = await api.sessions.load(id)
      if (loaded) {
        setSession(loaded)
        setPage('chat')
        setLive(null)
        setLiveTools([])
        setStep(null)
        setApproval(null)
      }
    },
    [busy, session]
  )

  const deleteSession = useCallback(
    async (id: string) => {
      if (!window.confirm(t('¿Eliminar esta conversación? No se puede deshacer.'))) return
      await api.sessions.delete(id)
      setSessions(await api.sessions.list())
      if (sessionIdRef.current === id) await newChat()
    },
    [newChat]
  )

  useEffect(() => {
    const offNew = window.menu?.onNewChat(() => void newChat())
    const offOpen = window.menu?.onOpenWorkspace(() => {
      void (async () => {
        const dir = await api.dialog.pickFolder('Carpeta del proyecto')
        if (!dir) return
        const next = await api.settings.save({ lastWorkspace: dir })
        await applySettings(next)
        toast(t('Carpeta del proyecto actualizada'))
      })()
    })
    return () => {
      offNew?.()
      offOpen?.()
    }
  }, [newChat, applySettings, toast])

  const pickWorkspace = useCallback(async () => {
    const dir = await api.dialog.pickFolder(
      'Carpeta del proyecto donde trabajará el agente',
      settingsRef.current?.lastWorkspace ?? undefined
    )
    if (!dir) return
    const next = await api.settings.save({ lastWorkspace: dir })
    await applySettings(next)
    if (sessionIdRef.current) {
      const current = await api.sessions.load(sessionIdRef.current)
      if (current) {
        const updated = { ...current, workspace: dir }
        await api.sessions.save(updated)
        setSession(updated)
      }
    }
    toast(t('Carpeta del proyecto actualizada'))
  }, [applySettings, toast])

  const startModel = useCallback(
    async (path: string) => {
      try {
        const next = await api.settings.save({ lastModelPath: path })
        await applySettings(next)
        if (sessionIdRef.current) {
          const current = await api.sessions.load(sessionIdRef.current)
          if (current) {
            const updated = { ...current, modelPath: path }
            await api.sessions.save(updated)
            setSession(updated)
          }
        }
        setPage('chat')
        await api.engine.start(path)
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), true)
        setEngine(await api.engine.status())
      }
    },
    [applySettings, toast]
  )

  const handleSend = useCallback(
    async (text: string) => {
      if (!session) return
      const current = settingsRef.current
      const workspace = session.workspace ?? current?.lastWorkspace ?? null
      const modelPath = current?.lastModelPath ?? session.modelPath ?? null
      if (!workspace) {
        toast(t('Elige primero una carpeta de proyecto'), true)
        setPage('chat')
        return
      }
      if (!modelPath) {
        toast(t('Elige un modelo para empezar'), true)
        setPage('models')
        return
      }
      setBusy(true)
      setStep(null)
      setApproval(null)
      setLive({ id: 'pending', content: '', reasoning: '' })
      setLiveTools([])
      const optimisticId = `local_${Date.now()}`
      setSession((prev) =>
        prev
          ? {
              ...prev,
              messages: [
                ...prev.messages,
                { id: optimisticId, role: 'user', content: text, createdAt: Date.now() }
              ]
            }
          : prev
      )
      try {
        await api.chat.send({ sessionId: session.id, text, workspace, modelPath })
      } catch (err) {
        setBusy(false)
        setLive(null)
        toast(err instanceof Error ? err.message : String(err), true)
      }
    },
    [session, toast]
  )

  const stop = useCallback(() => {
    if (session) void api.chat.abort(session.id)
  }, [session])

  const approve = useCallback(
    async (requestId: string, decision: 'once' | 'always' | 'deny') => {
      setApproval(null)
      await api.chat.approve(requestId, decision)
    },
    []
  )

  const completeOnboarding = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = await api.settings.save(patch)
      await applySettings(next)
      const hw = await api.hardware().catch(() => null)
      if (hw) {
        setHardware(hw)
        setRecommendations(await api.models.recommend(hw).catch(() => []))
      }
      await refreshInstalled()
      if (patch.lastModelPath) {
        void startModel(patch.lastModelPath)
      } else {
        setPage('chat')
      }
    },
    [applySettings, refreshInstalled, startModel]
  )

  if (booting || !settings) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <div className="brand">
          <div className="brand-logo">OP</div>
          <div>
            <div className="brand-name">OpenPro Agente</div>
            <div className="brand-version">Cargando…</div>
          </div>
        </div>
      </div>
    )
  }

  const workspace = session?.workspace ?? settings.lastWorkspace
  const currentModel = settings.lastModelPath ?? session?.modelPath ?? null
  const canChat = Boolean(workspace) && Boolean(currentModel)
  const chipClass =
    engine?.state === 'ready' ? 'ready' : engine?.state === 'starting' ? 'starting' : engine?.state === 'error' ? 'error' : ''
  const chipText =
    engine?.state === 'ready'
      ? `Motor listo${engine.backend ? ` · ${engine.backend.toUpperCase()}` : ''}`
      : engine?.state === 'starting'
        ? 'Cargando modelo…'
        : engine?.state === 'error'
          ? 'Error del motor'
          : 'Motor detenido'

  return (
    <div className="app">
      <Sidebar
        info={info}
        sessions={sessions}
        activeId={session?.id ?? null}
        page={page}
        engine={engine}
        installedCount={installed.length}
        onPage={setPage}
        onSelectSession={(id) => void selectSession(id)}
        onDeleteSession={(id) => void deleteSession(id)}
        onNewChat={() => void newChat()}
      />

      <div className="main">
        <div className="topbar">
          <div className="workspace">
            <button className="btn btn-sm" onClick={() => void pickWorkspace()} title={workspace ?? 'Elegir carpeta'}>
              📁 {workspace ? shortPath(workspace) : 'Elegir carpeta'}
            </button>
          </div>
          <span className="spacer" />
          {installed.length > 0 ? (
            <select
              className="select"
              style={{ width: 280 }}
              value={currentModel ?? ''}
              onChange={(e) => void startModel(e.target.value)}
            >
              <option value="" disabled>
                Selecciona un modelo
              </option>
              {installed.map((model) => (
                <option key={model.id} value={model.path}>
                  {model.name}
                  {model.quant ? ` · ${model.quant}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <button className="btn" onClick={() => setPage('models')}>
              {t('Descargar un modelo')}
            </button>
          )}
          <div className={`status-chip ${chipClass}`} title={engine?.message ?? ''}>
            <span className="dot" /> {chipText}
          </div>
        </div>

        <div className="content">
          {page === 'chat' && (
            <ChatView
              session={session}
              live={live}
              liveTools={liveTools}
              approval={approval}
              busy={busy}
              step={step}
              engine={engine}
              disabled={!canChat}
              onToast={toast}
              onSend={(text) => void handleSend(text)}
              onStop={stop}
              onApprove={(id, decision) => void approve(id, decision)}
              onPickWorkspace={() => void pickWorkspace()}
            />
          )}
          {page === 'models' && (
            <ModelsPage
              hardware={hardware}
              recommendations={recommendations}
              installed={installed}
              downloads={downloads}
              engine={engine}
              installing={installing}
              selectedModelPath={currentModel}
              modelsDir={settings.modelsDir}
              backendPref={settings.engine.backend}
              onUseModel={(path) => void startModel(path)}
              onRefresh={() => void refreshInstalled()}
              toast={toast}
            />
          )}
          {page === 'settings' && (
            <SettingsPage
              settings={settings}
              engine={engine}
              installing={installing}
              info={info}
              hardware={hardware}
              onSaved={(next) => void applySettings(next)}
              toast={toast}
            />
          )}
        </div>
      </div>

      {!settings.onboardingDone && (
        <Onboarding
          settings={settings}
          hardware={hardware}
          engine={engine}
          installing={installing}
          recommendations={recommendations}
          downloads={downloads}
          onSave={async (patch) => {
            const next = await api.settings.save(patch)
            await applySettings(next)
          }}
          onDone={completeOnboarding}
          toast={toast}
        />
      )}

      {toastState && <div className={`toast ${toastState.error ? 'error' : ''}`}>{toastState.text}</div>}
    </div>
  )
}
