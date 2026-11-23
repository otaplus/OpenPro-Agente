import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n'
import type {
  AppSettings,
  DownloadJob,
  EngineInstallState,
  EngineStatus,
  HardwareInfo,
  ModelRecommendation
} from '@shared/types'
import { api, formatBytes } from '../lib'

export function Onboarding({
  settings,
  hardware,
  engine,
  installing,
  recommendations,
  downloads,
  onSave,
  onDone,
  toast
}: {
  settings: AppSettings
  hardware: HardwareInfo | null
  engine: EngineStatus | null
  installing: EngineInstallState | null
  recommendations: ModelRecommendation[]
  downloads: DownloadJob[]
  onSave: (patch: Partial<AppSettings>) => Promise<void>
  onDone: (patch: Partial<AppSettings>) => Promise<void>
  toast: (message: string, error?: boolean) => void
}) {
  const [step, setStep] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modelsDir, setModelsDir] = useState(settings.modelsDir)
  const [workspace, setWorkspace] = useState(settings.lastWorkspace)
  const [preparing, setPreparing] = useState(false)
  const [expectedFiles, setExpectedFiles] = useState(0)

  const usable = useMemo(() => recommendations.filter((r) => r.fit !== 'no'), [recommendations])
  const options = (usable.length ? usable : recommendations).slice(0, 4)

  useEffect(() => {
    if (!selectedId && options.length) setSelectedId(options[0].model.id)
  }, [options, selectedId])

  const selected = options.find((r) => r.model.id === selectedId) ?? null

  const jobs = useMemo(
    () => (selected ? downloads.filter((d) => d.repo === selected.model.repo) : []),
    [downloads, selected]
  )
  const downloadDone =
    expectedFiles > 0 && jobs.length >= expectedFiles && jobs.every((j) => j.status === 'done')
  const downloadError = jobs.find((j) => j.status === 'error')
  const totalBytes = jobs.reduce((acc, j) => acc + j.sizeBytes, 0)
  const receivedBytes = jobs.reduce((acc, j) => acc + j.receivedBytes, 0)
  const pct = totalBytes > 0 ? Math.min(100, (receivedBytes / totalBytes) * 100) : downloadDone ? 100 : 0

  async function pickModelsDir(): Promise<void> {
    const dir = await api.dialog.pickFolder(t('Carpeta para guardar los modelos'), modelsDir)
    if (dir) setModelsDir(dir)
  }

  async function pickWorkspace(): Promise<void> {
    const dir = await api.dialog.pickFolder(t('Carpeta del proyecto donde trabajará el agente'), workspace ?? undefined)
    if (dir) setWorkspace(dir)
  }

  async function startDownload(): Promise<void> {
    if (!selected) return
    setPreparing(true)
    try {
      if (modelsDir !== settings.modelsDir) await onSave({ modelsDir })
      if (!engine?.installed) {
        await api.engine.install()
      }
      const resolved = await api.models.resolve(selected.model.repo, selected.quant.quant)
      setExpectedFiles(resolved.files.length)
      await api.models.download({
        repo: selected.model.repo,
        files: resolved.files.map((f) => ({ path: f.path, sizeBytes: f.sizeBytes })),
        label: `${selected.model.name} ${resolved.quant}`
      })
      toast(`Descargando ${selected.model.name} (${formatBytes(resolved.sizeBytes)})`)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true)
    } finally {
      setPreparing(false)
    }
  }

  async function finish(skipModel = false): Promise<void> {
    const patch: Partial<AppSettings> = {
      onboardingDone: true,
      modelsDir,
      lastWorkspace: workspace
    }
    if (!skipModel && selected) {
      const installed = await api.models.installed()
      const match = installed.find((m) => m.repo === selected.model.repo)
      if (match) patch.lastModelPath = match.path
    }
    await onDone(patch)
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="steps">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`step-pill ${i <= step ? 'active' : ''}`} />
          ))}
        </div>

        {step === 0 && (
          <>
            <h2>{t('Bienvenido a OpenPro Agente')}</h2>
            <div className="modal-sub">
              {t('Un agente de programación que corre íntegramente en tu equipo: modelos GGUF de HuggingFace, motor llama.cpp y tus archivos. Sin cuentas ni nube.')}
            </div>
            {!hardware && <div className="hint-box">{t('Analizando tu equipo… (CPU, RAM, GPU y espacio libre)')}</div>}
            {hardware && (
              <>
                <div className="hw-grid">
                  <div className="hw-item">
                    <div className="k">{t('Sistema')}</div>
                    <div className="v">{hardware.osLabel}</div>
                  </div>
                  <div className="hw-item">
                    <div className="k">CPU</div>
                    <div className="v" title={hardware.cpuModel}>{hardware.cpuModel}</div>
                  </div>
                  <div className="hw-item">
                    <div className="k">RAM</div>
                    <div className="v">{hardware.ramGB} GB</div>
                  </div>
                  <div className="hw-item">
                    <div className="k">GPU</div>
                    <div className="v" title={hardware.gpus.map((g) => g.name).join(', ')}>
                      {hardware.gpus.length
                        ? `${hardware.gpus[0].name}${hardware.totalVramGB ? ` · ${hardware.totalVramGB} GB` : ''}`
                        : t('Sin GPU dedicada')}
                    </div>
                  </div>
                  <div className="hw-item">
                    <div className="k">{t('Aceleración')}</div>
                    <div className="v">{hardware.backend.toUpperCase()}</div>
                  </div>
                  <div className="hw-item">
                    <div className="k">Disco libre</div>
                    <div className="v">{hardware.freeDiskGB >= 0 ? `${hardware.freeDiskGB} GB` : 'desconocido'}</div>
                  </div>
                </div>
                {!!hardware.notes.length && (
                  <ul className="reco-reasons">
                    {hardware.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => void finish(true)}>
                {t('Configurar más tarde')}
              </button>
              <button className="btn btn-primary" onClick={() => setStep(1)}>
                {t('Continuar')}
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>{t('¿Dónde guardamos las cosas?')}</h2>
            <div className="modal-sub">
              Los modelos ocupan varios GB. Elige una carpeta con espacio; puedes cambiarla después.
            </div>

            <div className="field">
              <label>{t('Carpeta de modelos')}</label>
              <div className="row">
                <input className="input mono grow" value={modelsDir} readOnly />
                <button className="btn" onClick={() => void pickModelsDir()}>
                  Cambiar…
                </button>
              </div>
              <span className="hint">
                {hardware && hardware.freeDiskGB >= 0
                  ? t('Quedan ~{gb} GB libres en ese disco (según la carpeta actual).', { gb: hardware.freeDiskGB })
                  : t('Se creará automáticamente si no existe.')}
              </span>
            </div>

            <div className="field">
              <label>{t('Carpeta del proyecto (opcional)')}</label>
              <div className="row">
                <input className="input mono grow" value={workspace ?? ''} readOnly placeholder={t('Elige el repo o carpeta donde quieres trabajar')} />
                <button className="btn" onClick={() => void pickWorkspace()}>
                  Elegir…
                </button>
              </div>
              <span className="hint">{t('El agente nunca saldrá de esta carpeta. Puedes cambiarla en cualquier momento.')}</span>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setStep(0)}>
                {t('Atrás')}
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  if (modelsDir !== settings.modelsDir) await onSave({ modelsDir })
                  setStep(2)
                }}
              >
                {t('Continuar')}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>{t('Elige tu modelo')}</h2>
            <div className="modal-sub">
              {t('Recomendaciones según tu hardware. El motor llama.cpp se instala solo la primera vez.')}
            </div>

            {!options.length && (
              <div className="hint-box">
                {t('No se pudo calcular una recomendación. Puedes instalar un modelo manualmente desde la pestaña Modelos.')}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {options.map((rec) => (
                <div
                  key={rec.model.id}
                  className={`reco ${selectedId === rec.model.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(rec.model.id)}
                >
                  <div className="reco-head">
                    <span className="reco-name">{rec.model.name}</span>
                    <span className={`badge ${rec.fit === 'gpu' || rec.fit === 'unified' ? 'ok' : rec.fit === 'hybrid' ? 'accent' : 'warn'}`}>
                      {rec.fit === 'gpu'
                        ? t('GPU completa')
                        : rec.fit === 'unified'
                          ? t('Memoria unificada')
                          : rec.fit === 'hybrid'
                            ? t('GPU + CPU')
                            : 'CPU'}
                    </span>
                    <span className="badge">{rec.quant.quant} · {rec.quant.sizeGB.toFixed(1)} GB</span>
                    <span className="badge">{rec.estimatedSpeed}</span>
                    {rec.model.coding && <span className="badge accent">código</span>}
                  </div>
                  <div className="reco-desc">{rec.model.description}</div>
                  {!!rec.warnings.length && (
                    <ul className="reco-warnings">
                      {rec.warnings.slice(0, 2).map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <div className="divider" />

            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="muted small">
                Estado del motor: {engine?.installed ? `instalado${engine.version ? ` (${engine.version})` : ''}` : 'no instalado'}
              </span>
              <span className="spacer" />
              <button
                className="btn btn-primary"
                onClick={() => void startDownload()}
                disabled={!selected || preparing || installing?.running || downloadDone}
              >
                {preparing || installing?.running
                  ? t('Preparando…')
                  : downloadDone
                    ? t('Descarga completada')
                    : 'Instalar motor y descargar'}
              </button>
            </div>

            {(preparing || installing?.running || jobs.length > 0) && (
              <div style={{ marginTop: 12 }}>
                <div className="progress">
                  <span style={{ width: `${installing?.running ? installing.pct : pct}%` }} />
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>
                  {installing?.running
                    ? installing.stage
                    : downloadError
                      ? downloadError.error
                      : downloadDone
                        ? t('Modelo descargado. ¡Listo para empezar!')
                        : jobs.length
                          ? `${formatBytes(receivedBytes)} de ${formatBytes(totalBytes)}`
                          : 'Resolviendo archivos en HuggingFace…'}
                </div>
              </div>
            )}

            {installing?.error && <div className="msg-error" style={{ marginTop: 10 }}>{installing.error}</div>}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>
                {t('Atrás')}
              </button>
              <button className="btn" onClick={() => void finish(true)}>
                {t('Omitir descarga')}
              </button>
              <button className="btn btn-primary" onClick={() => void finish(false)} disabled={!downloadDone}>
                {t('Empezar a usar')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
