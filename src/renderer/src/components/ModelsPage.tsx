import { useMemo, useState } from 'react'
import type {
  AppSettings,
  CatalogModel,
  DownloadJob,
  EngineInstallState,
  EngineStatus,
  HardwareInfo,
  HfFile,
  HfModelSummary,
  InstalledModel,
  ModelRecommendation
} from '@shared/types'
import { api, formatBytes } from '../lib'

const FIT_LABEL: Record<ModelRecommendation['fit'], string> = {
  gpu: 'GPU completa',
  unified: 'Memoria unificada',
  hybrid: 'GPU + CPU',
  cpu: 'CPU',
  no: 'No cabe'
}

const FIT_CLASS: Record<ModelRecommendation['fit'], string> = {
  gpu: 'ok',
  unified: 'ok',
  hybrid: 'accent',
  cpu: 'warn',
  no: 'bad'
}

function splitGroup(files: HfFile[], file: HfFile): HfFile[] {
  if (!file.split) return [file]
  const prefix = file.path.replace(/[-.]\d{5}-of-\d{5}\.gguf$/i, '')
  const group = files.filter(
    (f) => f.split && f.split.total === file.split!.total && f.path.startsWith(prefix)
  )
  return group.length ? group.sort((a, b) => a.split!.index - b.split!.index) : [file]
}

export function ModelsPage({
  hardware,
  recommendations,
  installed,
  downloads,
  engine,
  installing,
  selectedModelPath,
  modelsDir,
  backendPref,
  onUseModel,
  onRefresh,
  toast
}: {
  hardware: HardwareInfo | null
  recommendations: ModelRecommendation[]
  installed: InstalledModel[]
  downloads: DownloadJob[]
  engine: EngineStatus | null
  installing: EngineInstallState | null
  selectedModelPath: string | null
  modelsDir: string
  backendPref: AppSettings['engine']['backend']
  onUseModel: (path: string) => void
  onRefresh: () => void
  toast: (message: string, error?: boolean) => void
}) {
  const [tab, setTab] = useState<'installed' | 'recommended' | 'search'>('installed')
  // Lo que realmente usa el motor manda sobre la detección del equipo.
  const activeBackend =
    engine?.state === 'ready' && engine.backend
      ? engine.backend
      : backendPref !== 'auto'
        ? backendPref
        : (hardware?.backend ?? 'cpu')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HfModelSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [files, setFiles] = useState<Record<string, HfFile[]>>({})
  const [busyRepo, setBusyRepo] = useState<string | null>(null)

  const installedByRepo = useMemo(() => {
    const map = new Map<string, InstalledModel>()
    for (const model of installed) if (model.repo) map.set(model.repo, model)
    return map
  }, [installed])

  const activeDownloads = downloads.filter((d) => d.status === 'queued' || d.status === 'downloading' || d.status === 'verifying')
  const recentDownloads = downloads
    .filter((d) => d.status === 'done' || d.status === 'error' || d.status === 'cancelled')
    .slice(-4)
    .reverse()

  async function search(): Promise<void> {
    setSearching(true)
    try {
      const found = await api.models.search(query)
      setResults(found)
      if (!found.length) toast('Sin resultados en HuggingFace para esa búsqueda.')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true)
    } finally {
      setSearching(false)
    }
  }

  async function expandRepo(repo: string): Promise<void> {
    if (expanded === repo) {
      setExpanded(null)
      return
    }
    setExpanded(repo)
    if (!files[repo]) {
      try {
        const list = await api.models.files(repo)
        setFiles((prev) => ({ ...prev, [repo]: list }))
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), true)
      }
    }
  }

  async function downloadFiles(repo: string, list: HfFile[], label: string): Promise<void> {
    if (!list.length) return
    setBusyRepo(repo)
    try {
      await api.models.download({
        repo,
        files: list.map((f) => ({ path: f.path, sizeBytes: f.sizeBytes })),
        label
      })
      toast(`Descarga iniciada: ${label}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true)
    } finally {
      setBusyRepo(null)
    }
  }

  async function downloadRecommendation(rec: ModelRecommendation): Promise<void> {
    setBusyRepo(rec.model.repo)
    try {
      const resolved = await api.models.resolve(rec.model.repo, rec.quant.quant)
      const label = `${rec.model.name} ${resolved.quant}`
      await api.models.download({
        repo: rec.model.repo,
        files: resolved.files.map((f) => ({ path: f.path, sizeBytes: f.sizeBytes })),
        label
      })
      toast(`Descargando ${label} (${formatBytes(resolved.sizeBytes)})`)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true)
    } finally {
      setBusyRepo(null)
    }
  }

  async function remove(model: InstalledModel): Promise<void> {
    if (!window.confirm(`¿Eliminar ${model.name} (${formatBytes(model.sizeBytes)}) del disco?`)) return
    try {
      await api.models.delete(model.path)
      toast('Modelo eliminado')
      onRefresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true)
    }
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-header">
          <h1>Modelos</h1>
          <p>
            Descarga modelos GGUF desde HuggingFace y guárdalos en tu carpeta. Todo se ejecuta en local con llama.cpp.
          </p>
        </div>

        {!engine?.installed && (
          <div className="card" style={{ borderColor: 'rgba(91,157,255,0.4)' }}>
            <div className="row">
              <div className="grow">
                <div className="card-title">Falta el motor llama.cpp</div>
                <div className="card-sub">
                  Se descargará el binario adecuado para {hardware?.osLabel ?? 'tu sistema'} y backend{' '}
                  {hardware?.backend?.toUpperCase() ?? 'automático'}. Ocupa entre 30 y 400 MB según la GPU.
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => void api.engine.install()} disabled={installing?.running}>
                {installing?.running ? 'Instalando…' : 'Instalar motor'}
              </button>
            </div>
            {installing?.running && (
              <div style={{ marginTop: 12 }}>
                <div className="progress">
                  <span style={{ width: `${installing.pct}%` }} />
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>{installing.stage}</div>
              </div>
            )}
          </div>
        )}

        {hardware && (
          <div className="hw-grid">
            <div className="hw-item">
              <div className="k">Equipo</div>
              <div className="v" title={hardware.cpuModel}>{hardware.cpuModel}</div>
            </div>
            <div className="hw-item">
              <div className="k">RAM / VRAM</div>
              <div className="v">
                {hardware.ramGB} GB · {hardware.unifiedMemory ? 'unificada' : `${hardware.totalVramGB} GB GPU`}
              </div>
            </div>
            <div className="hw-item">
              <div className="k">Aceleración</div>
              <div className="v" title={activeBackend === hardware.backend ? 'Detectada en tu equipo' : 'Configurada en Ajustes'}>
                {activeBackend.toUpperCase()}
                {backendPref !== 'auto' ? <span className="muted"> · fijada</span> : null}
              </div>
            </div>
            <div className="hw-item">
              <div className="k">Espacio libre</div>
              <div className="v">{hardware.freeDiskGB >= 0 ? `${hardware.freeDiskGB} GB` : '—'}</div>
            </div>
          </div>
        )}

        {(activeDownloads.length > 0 || recentDownloads.length > 0) && (
          <>
            <div className="section-title">Descargas</div>
            {[...activeDownloads, ...recentDownloads].map((job) => {
              const pct = job.sizeBytes > 0 ? Math.min(100, (job.receivedBytes / job.sizeBytes) * 100) : 0
              return (
                <div className="download-item" key={job.id}>
                  <div className="download-top">
                    <span className="download-name" title={job.file}>{job.label}</span>
                    <span className={`badge ${job.status === 'done' ? 'ok' : job.status === 'error' ? 'bad' : job.status === 'cancelled' ? 'warn' : 'accent'}`}>
                      {job.status === 'downloading' ? `${pct.toFixed(0)} %` : job.status}
                    </span>
                    {(job.status === 'downloading' || job.status === 'queued') && (
                      <button className="btn btn-sm" onClick={() => void api.models.cancel(job.id)}>
                        Cancelar
                      </button>
                    )}
                  </div>
                  <div className={`progress ${job.status === 'queued' ? 'indeterminate' : ''}`}>
                    <span style={{ width: `${job.status === 'queued' ? 35 : pct}%` }} />
                  </div>
                  <div className="download-meta">
                    <span>
                      {formatBytes(job.receivedBytes)} / {formatBytes(job.sizeBytes)}
                    </span>
                    {job.status === 'downloading' && <span>{formatBytes(job.speedBps)}/s</span>}
                    {job.etaSeconds != null && job.status === 'downloading' && <span>~{job.etaSeconds}s restantes</span>}
                    {job.error && <span style={{ color: 'var(--danger)' }}>{job.error}</span>}
                  </div>
                </div>
              )
            })}
          </>
        )}

        <div className="tabs" style={{ marginTop: 18 }}>
          <button className={`tab ${tab === 'installed' ? 'active' : ''}`} onClick={() => setTab('installed')}>
            Instalados ({installed.length})
          </button>
          <button className={`tab ${tab === 'recommended' ? 'active' : ''}`} onClick={() => setTab('recommended')}>
            Recomendados
          </button>
          <button className={`tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>
            Buscar en HuggingFace
          </button>
        </div>

        {tab === 'installed' && (
          <div>
            <div className="row" style={{ marginBottom: 12 }}>
              <span className="muted small">Carpeta de modelos: <span className="mono">{modelsDir}</span></span>
              <span className="spacer" />
              <button className="btn btn-sm" onClick={() => void api.shell.openModelsDir()}>
                Abrir carpeta
              </button>
              <button className="btn btn-sm" onClick={() => void api.models.importFile().then(() => onRefresh())}>
                Importar GGUF…
              </button>
            </div>
            {!installed.length && (
              <div className="empty">
                No hay modelos instalados. Ve a <strong>Recomendados</strong> para descargar el que mejor encaje con tu
                equipo.
              </div>
            )}
            {installed.map((model) => (
              <div className="model-row" key={model.id}>
                <div className="model-main">
                  <div className="model-name" title={model.name}>{model.name}</div>
                  <div className="model-meta">
                    {model.quant && <span className="badge">{model.quant}</span>}
                    <span>{formatBytes(model.sizeBytes)}</span>
                    {model.parts > 1 && <span>{model.parts} partes</span>}
                    {model.repo && <span className="mono">{model.repo}</span>}
                  </div>
                </div>
                {selectedModelPath === model.path && <span className="badge accent">en uso</span>}
                <button className="btn btn-sm" onClick={() => void api.shell.reveal(model.path)}>
                  Revelar
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => void remove(model)}>
                  Eliminar
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => onUseModel(model.path)}>
                  Usar
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'recommended' && (
          <div>
            <p className="muted small" style={{ marginTop: 0 }}>
              Calculado con {hardware?.ramGB ?? '?'} GB de RAM y {hardware?.totalVramGB ?? '?'} GB de VRAM. Las velocidades
              son estimaciones orientativas.
            </p>
            <div className="grid-2">
              {recommendations.map((rec) => {
                const installedMatch = installedByRepo.get(rec.model.repo)
                return (
                  <div className="card" key={rec.model.id}>
                    <div className="reco-head">
                      <span className="reco-name">{rec.model.name}</span>
                      <span className={`badge ${FIT_CLASS[rec.fit]}`}>{FIT_LABEL[rec.fit]}</span>
                      <span className="badge">{rec.quant.quant}</span>
                      {installedMatch && <span className="badge ok">instalado</span>}
                    </div>
                    <div className="reco-desc">{rec.model.description}</div>
                    <div className="model-meta" style={{ marginTop: 8 }}>
                      <span>{rec.quant.sizeGB.toFixed(1)} GB</span>
                      <span>{rec.estimatedSpeed}</span>
                      <span>ctx {rec.model.ctxK}K</span>
                      <span>{rec.model.license}</span>
                      {rec.model.coding && <span className="badge accent">código</span>}
                      {rec.model.toolUse && <span className="badge ok">tools</span>}
                    </div>
                    {!!rec.reasons.length && (
                      <ul className="reco-reasons">
                        {rec.reasons.slice(0, 3).map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                    {!!rec.warnings.length && (
                      <ul className="reco-warnings">
                        {rec.warnings.slice(0, 2).map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    )}
                    <div className="row" style={{ marginTop: 12 }}>
                      <span className="spacer" />
                      {installedMatch ? (
                        <button className="btn btn-sm btn-primary" onClick={() => onUseModel(installedMatch.path)}>
                          Usar modelo
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busyRepo === rec.model.repo || rec.fit === 'no'}
                          onClick={() => void downloadRecommendation(rec)}
                        >
                          {busyRepo === rec.model.repo ? 'Preparando…' : `Descargar ${rec.quant.sizeGB.toFixed(1)} GB`}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'search' && (
          <div>
            <div className="search-row">
              <input
                className="input"
                placeholder="Buscar modelos GGUF, p. ej. qwen2.5-coder, deepseek, coder"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void search()
                }}
              />
              <button className="btn btn-primary" onClick={() => void search()} disabled={searching}>
                {searching ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            <p className="muted small">
              Se muestran los repositorios GGUF con más descargas. Al abrir uno verás sus archivos y podrás descargar la
              cuantización que quieras.
            </p>
            {results.map((result) => (
              <div key={result.id} style={{ marginBottom: 8 }}>
                <div className="model-row" style={{ cursor: 'pointer' }} onClick={() => void expandRepo(result.id)}>
                  <div className="model-main">
                    <div className="model-name">{result.id}</div>
                    <div className="model-meta">
                      <span>{result.downloads.toLocaleString()} descargas</span>
                      <span>{result.likes} likes</span>
                      {result.gated && <span className="badge warn">gated</span>}
                      {result.tags
                        .filter((t) => /qwen|llama|gemma|coder|deepseek|mistral|gguf/i.test(t))
                        .slice(0, 4)
                        .map((tag) => (
                          <span key={tag} className="badge">{tag}</span>
                        ))}
                    </div>
                  </div>
                  <button className="btn btn-sm">{expanded === result.id ? 'Cerrar' : 'Ver archivos'}</button>
                </div>
                {expanded === result.id && (
                  <div style={{ padding: '4px 0 8px 4px' }}>
                    {!files[result.id] && <div className="muted small">Cargando archivos…</div>}
                    {files[result.id]?.filter((f) => !f.isMmproj).length === 0 && (
                      <div className="muted small">Este repo no tiene GGUF sueltos visibles.</div>
                    )}
                    {files[result.id]
                      ?.filter((f) => !f.isMmproj && (!f.split || f.split.index === 1))
                      .slice(0, 40)
                      .map((file) => {
                        const group = splitGroup(files[result.id], file)
                        const size = group.reduce((acc, f) => acc + f.sizeBytes, 0)
                        return (
                          <div className="model-row" key={file.path} style={{ background: 'var(--bg-soft)' }}>
                            <div className="model-main">
                              <div className="model-name mono" style={{ fontSize: 12 }}>{file.path}</div>
                              <div className="model-meta">
                                <span>{formatBytes(size)}</span>
                                {group.length > 1 && <span>{group.length} partes</span>}
                              </div>
                            </div>
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={busyRepo === result.id}
                              onClick={() => void downloadFiles(result.id, group, file.path)}
                            >
                              Descargar
                            </button>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
