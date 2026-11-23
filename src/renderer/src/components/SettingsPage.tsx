import { useEffect, useState } from 'react'
import { t } from '../i18n'
import type { AppInfo, AppSettings, EngineInstallState, EngineStatus, HardwareInfo } from '@shared/types'
import { api } from '../lib'

export function SettingsPage({
  settings,
  engine,
  installing,
  info,
  hardware,
  onSaved,
  toast
}: {
  settings: AppSettings
  engine: EngineStatus | null
  installing: EngineInstallState | null
  info: AppInfo | null
  hardware: HardwareInfo | null
  onSaved: (settings: AppSettings) => void
  toast: (message: string, error?: boolean) => void
}) {
  const [token, setToken] = useState(settings.hfToken)
  const [extraArgs, setExtraArgs] = useState(settings.engine.extraArgs)
  const [systemExtra, setSystemExtra] = useState(settings.agent.systemExtra)

  useEffect(() => setToken(settings.hfToken), [settings.hfToken])
  useEffect(() => setExtraArgs(settings.engine.extraArgs), [settings.engine.extraArgs])
  useEffect(() => setSystemExtra(settings.agent.systemExtra), [settings.agent.systemExtra])

  async function update(patch: Partial<AppSettings>, message?: string): Promise<void> {
    try {
      const next = await api.settings.save(patch)
      onSaved(next)
      if (message) toast(message)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true)
    }
  }

  async function pickModelsDir(): Promise<void> {
    const dir = await api.dialog.pickFolder(t('Carpeta donde guardar los modelos'), settings.modelsDir)
    if (dir) await update({ modelsDir: dir }, t('Carpeta de modelos actualizada'))
  }

  async function pickBinary(): Promise<void> {
    const file = await api.dialog.pickFile(t('Selecciona llama-server'), [
      { name: 'llama-server', extensions: info?.platform === 'win32' ? ['exe'] : ['*'] }
    ])
    if (file) await update({ engine: { ...settings.engine, mode: 'external', binaryPath: file } }, t('Ejecutable configurado'))
  }

  async function pickTheme(theme: 'dark' | 'light'): Promise<void> {
    document.documentElement.dataset.theme = theme
    await update({ theme })
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-header">
          <h1>{t('Ajustes')}</h1>
          <p>{t('Todo se guarda en tu equipo. Los cambios del motor se aplican al recargar el modelo.')}</p>
        </div>

        <div className="section-title">{t('General')}</div>
        <div className="card">
          <div className="field">
            <label>{t('Carpeta de modelos')}</label>
            <div className="row">
              <input className="input mono grow" value={settings.modelsDir} readOnly />
              <button className="btn" onClick={() => void pickModelsDir()}>
                {t('Cambiar…')}
              </button>
              <button className="btn" onClick={() => void api.shell.openModelsDir()}>
                {t('Abrir')}
              </button>
            </div>
            <span className="hint">
              {t('Aquí se descargan los GGUF. Puedes usar un disco externo; asegúrate de que tenga espacio suficiente.')}
            </span>
          </div>

          <div className="field">
            <label>{t('Tema')}</label>
            <div className="row">
              <button className={`btn ${settings.theme === 'dark' ? 'btn-primary' : ''}`} onClick={() => void pickTheme('dark')}>
                {t('Oscuro')}
              </button>
              <button className={`btn ${settings.theme === 'light' ? 'btn-primary' : ''}`} onClick={() => void pickTheme('light')}>
                {t('Claro')}
              </button>
            </div>
          </div>

          <div className="field">
            <label>{t('Idioma')}</label>
            <div className="row">
              <button
                className={`btn ${settings.language === 'es' ? 'btn-primary' : ''}`}
                onClick={() => void update({ language: 'es' })}
              >
                Español
              </button>
              <button
                className={`btn ${settings.language === 'en' ? 'btn-primary' : ''}`}
                onClick={() => void update({ language: 'en' })}
              >
                English
              </button>
            </div>
            <span className="hint">
              {t('La interfaz cambia al instante. Los mensajes del motor y de las herramientas siguen en español.')}
            </span>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('Token de HuggingFace (opcional)')}</label>
            <div className="row">
              <input
                className="input grow"
                type="password"
                placeholder="hf_… (solo necesario para repos gated o descargas privadas)"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onBlur={() => void update({ hfToken: token.trim() })}
              />
            </div>
            <span className="hint">{t('Se guarda localmente sin cifrar en settings.json. No se envía a ningún servidor propio.')}</span>
          </div>
        </div>

        <div className="section-title">{t('Motor de inferencia (llama.cpp)')}</div>
        <div className="card">
          <div className="kv" style={{ marginBottom: 14 }}>
            <span className="k">{t('Estado')}</span>
            <span className="v">
              {engine?.state === 'ready'
                ? `listo · puerto ${engine.port} · ${engine.backend?.toUpperCase() ?? ''}`
                : engine?.state === 'starting'
                  ? t('cargando modelo…')
                  : engine?.state === 'error'
                    ? `error: ${engine.message ?? ''}`
                    : 'detenido'}
            </span>
            <span className="k">{t('Binario')}</span>
            <span className="v">{engine?.binaryPath ?? t('no instalado')}</span>
            <span className="k">{t('Versión')}</span>
            <span className="v">{engine?.version ?? '—'}</span>
          </div>

          <div className="row" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => void api.engine.install()} disabled={installing?.running}>
              {installing?.running ? t('Instalando…') : engine?.installed ? t('Actualizar llama.cpp') : t('Instalar llama.cpp')}
            </button>
            <button className="btn" onClick={() => void api.engine.stop()} disabled={!engine || engine.state === 'stopped'}>
              {t('Detener motor')}
            </button>
            {installing?.running && (
              <span className="muted small">
                {installing.stage} ({installing.pct} %)
              </span>
            )}
          </div>
          {installing?.error && <div className="msg-error" style={{ marginBottom: 12 }}>{installing.error}</div>}

          <div className="grid-2">
            <div className="field">
              <label>{t('Backend')}</label>
              <select
                className="select"
                value={settings.engine.backend}
                onChange={(e) => void update({ engine: { ...settings.engine, backend: e.target.value as AppSettings['engine']['backend'] } })}
              >
                <option value="auto">Automático (detectar)</option>
                <option value="cuda">CUDA (NVIDIA)</option>
                <option value="metal">Metal (Apple Silicon)</option>
                <option value="vulkan">Vulkan (AMD/Intel)</option>
                <option value="rocm">ROCm (AMD Linux)</option>
                <option value="cpu">CPU</option>
              </select>
              <span className="hint">{t('Debe coincidir con el binario instalado.')}</span>
            </div>
            <div className="field">
              <label>{t('Contexto (tokens)')}</label>
              <input
                className="input"
                type="number"
                min={2048}
                max={262144}
                step={1024}
                value={settings.engine.ctxSize}
                onChange={(e) => void update({ engine: { ...settings.engine, ctxSize: Number(e.target.value) } })}
              />
              <span className="hint">{t('Más contexto = más RAM/VRAM. 16K es un buen equilibrio para programar.')}</span>
            </div>
            <div className="field">
              <label>{t('Capas en GPU')}</label>
              <input
                className="input"
                type="number"
                min={-1}
                max={999}
                value={settings.engine.gpuLayers}
                onChange={(e) => void update({ engine: { ...settings.engine, gpuLayers: Number(e.target.value) } })}
              />
              <span className="hint">{t('-1 = automático (todas si hay GPU). 0 = solo CPU.')}</span>
            </div>
            <div className="field">
              <label>{t('Hilos de CPU')}</label>
              <input
                className="input"
                type="number"
                min={0}
                max={128}
                value={settings.engine.threads}
                onChange={(e) => void update({ engine: { ...settings.engine, threads: Number(e.target.value) } })}
              />
              <span className="hint">{t('0 = automático (75 % de los núcleos).')}</span>
            </div>
            <div className="field">
              <label>{t('Puerto local')}</label>
              <input
                className="input"
                type="number"
                min={1024}
                max={65535}
                value={settings.engine.port}
                onChange={(e) => void update({ engine: { ...settings.engine, port: Number(e.target.value) } })}
              />
              <span className="hint">{t('Si está ocupado se usará el siguiente libre.')}</span>
            </div>
            <div className="field">
              <label>{t('Argumentos extra')}</label>
              <input
                className="input mono"
                placeholder="--flash-attn --no-warmup"
                value={extraArgs}
                onChange={(e) => setExtraArgs(e.target.value)}
                onBlur={() => void update({ engine: { ...settings.engine, extraArgs } })}
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('Origen del binario')}</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <select
                className="select"
                style={{ width: 220 }}
                value={settings.engine.mode}
                onChange={(e) =>
                  void update({ engine: { ...settings.engine, mode: e.target.value as 'managed' | 'external' } })
                }
              >
                <option value="managed">{t('Gestionado por la app')}</option>
                <option value="external">{t('Usar mi llama-server')}</option>
              </select>
              {settings.engine.mode === 'external' && (
                <>
                  <input className="input mono grow" value={settings.engine.binaryPath} readOnly placeholder="ruta a llama-server" />
                  <button className="btn" onClick={() => void pickBinary()}>
                    {t('Elegir…')}
                  </button>
                </>
              )}
            </div>
            <span className="hint">
              Si ya compilaste llama.cpp o usas una build concreta, apunta aquí al ejecutable llama-server.
            </span>
          </div>
        </div>

        <div className="section-title">{t('Agente')}</div>
        <div className="card">
          <div className="grid-2">
            <div className="field">
              <label>{t('Permisos del agente')}</label>
              <select
                className="select"
                value={settings.agent.permission}
                onChange={(e) =>
                  void update({
                    agent: { ...settings.agent, permission: e.target.value as 'plan' | 'workspace' | 'full' }
                  })
                }
              >
                <option value="plan">{t('Solo pensar (leer y analizar)')}</option>
                <option value="workspace">{t('Escribir en el proyecto')}</option>
                <option value="full">{t('Control total (cualquier ruta)')}</option>
              </select>
              <span className="hint">
                {settings.agent.permission === 'plan'
                  ? t('No puede escribir archivos ni ejecutar comandos: solo lee y propone cambios.')
                  : settings.agent.permission === 'full'
                    ? t('Puede escribir fuera del proyecto, pero siempre te pedirá permiso antes de hacerlo.')
                    : t('Solo modifica archivos dentro de la carpeta del proyecto.')}
              </span>
            </div>
            <div className="field">
              <label>{t('Aprobación de comandos')}</label>
              <select
                className="select"
                value={settings.agent.approvalMode}
                onChange={(e) =>
                  void update({ agent: { ...settings.agent, approvalMode: e.target.value as 'ask' | 'auto' } })
                }
              >
                <option value="ask">{t('Pedir permiso antes de ejecutar comandos')}</option>
                <option value="auto">{t('Automático (sin preguntar)')}</option>
              </select>
              <span className="hint">{t('Las lecturas y ediciones dentro del proyecto no piden permiso; los comandos sí.')}</span>
            </div>
            <div className="field">
              <label>{t('Máximo de pasos por mensaje')}</label>
              <input
                className="input"
                type="number"
                min={1}
                max={100}
                value={settings.agent.maxSteps}
                onChange={(e) => void update({ agent: { ...settings.agent, maxSteps: Number(e.target.value) } })}
              />
              <span className="hint">{t('Cada paso puede incluir varias herramientas. 20-30 es razonable.')}</span>
            </div>
            <div className="field">
              <label>{t('Temperatura')}</label>
              <input
                className="input"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={settings.agent.temperature}
                onChange={(e) => void update({ agent: { ...settings.agent, temperature: Number(e.target.value) } })}
              />
              <span className="hint">{t('0.1-0.3 para código; valores altos improvisan más.')}</span>
            </div>
            <div className="field">
              <label>{t('Máximo de tokens por respuesta')}</label>
              <input
                className="input"
                type="number"
                min={256}
                max={32768}
                step={256}
                value={settings.agent.maxTokens}
                onChange={(e) => void update({ agent: { ...settings.agent, maxTokens: Number(e.target.value) } })}
              />
            </div>
          </div>

          <div className="field">
            <label>{t('Instrucciones extra del sistema')}</label>
            <textarea
              className="textarea"
              rows={3}
              placeholder="Ej.: usa TypeScript estricto, responde en español, no uses librerías nuevas sin preguntar…"
              value={systemExtra}
              onChange={(e) => setSystemExtra(e.target.value)}
              onBlur={() => void update({ agent: { ...settings.agent, systemExtra } })}
            />
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <label>{t('Permitir consultas web (web_fetch)')}</label>
            <div className="row">
              <div
                className={`switch ${settings.agent.webFetch ? 'on' : ''}`}
                onClick={() => void update({ agent: { ...settings.agent, webFetch: !settings.agent.webFetch } })}
              />
              <span className="muted small">{t('El agente puede leer documentación pública por HTTP(S).')}</span>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('Comandos siempre permitidos')}</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {settings.agent.allowList.length ? (
                settings.agent.allowList.map((cmd) => (
                  <span className="chip" key={cmd}>{cmd}</span>
                ))
              ) : (
                <span className="muted small">Ninguno. {t('Ninguno. Se añaden al pulsar «Permitir siempre».')}</span>
              )}
              {settings.agent.allowList.length > 0 && (
                <button className="btn btn-sm btn-ghost" onClick={() => void update({ agent: { ...settings.agent, allowList: [] } })}>
                  {t('Limpiar')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="section-title">{t('Sistema')}</div>
        <div className="card">
          <div className="kv" style={{ marginBottom: 14 }}>
            <span className="k">{t('Versión')}</span>
            <span className="v">{info?.version ?? '—'}</span>
            <span className="k">{t('SO / arquitectura')}</span>
            <span className="v">{hardware ? `${hardware.osLabel} · ${hardware.arch}` : `${info?.platform ?? ''} · ${info?.arch ?? ''}`}</span>
            <span className="k">CPU</span>
            <span className="v">{hardware?.cpuModel ?? '—'}</span>
            <span className="k">RAM</span>
            <span className="v">{hardware ? `${hardware.ramGB} GB` : '—'}</span>
            <span className="k">GPU</span>
            <span className="v">
              {hardware?.gpus?.length
                ? hardware.gpus.map((g) => `${g.name}${g.vramMB ? ` (${(g.vramMB / 1024).toFixed(0)} GB)` : ''}`).join(' · ')
                : t('sin GPU dedicada')}
            </span>
            <span className="k">{t('Datos de usuario')}</span>
            <span className="v">{info?.userData ?? '—'}</span>
          </div>
          {!!hardware?.notes.length && (
            <ul className="reco-reasons" style={{ marginBottom: 14 }}>
              {hardware.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <div className="row">
            <button className="btn" onClick={() => void api.shell.openLogs()}>
              {t('Abrir logs')}
            </button>
            <button className="btn" onClick={() => void api.shell.openModelsDir()}>
              {t('Abrir modelos')}
            </button>
            <span className="spacer" />
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!window.confirm(t('¿Restablecer todos los ajustes? Los modelos descargados no se borran.'))) return
                const reset = await api.settings.reset()
                onSaved(reset)
                toast(t('Ajustes restablecidos'))
              }}
            >
              {t('Restablecer ajustes')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
