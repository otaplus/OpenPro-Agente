import type { CatalogModel, FitLevel, HardwareInfo, ModelRecommendation, QuantOption } from '@shared/types'

function q(quant: string, sizeGB: number, quality: number): QuantOption {
  return { quant, sizeGB, quality }
}

const LFM_LICENSE = 'LFM Open License v1.0'

/**
 * Catálogo curado de modelos GGUF pensados para un agente de programación local.
 * Los nombres de archivo no se fijan aquí: se resuelven en el repo de HuggingFace
 * buscando la cuantización solicitada, de modo que el catálogo no se rompe cuando
 * el autor del repo renombra los archivos.
 */
export const CATALOG: CatalogModel[] = [
  {
    id: 'lfm3-1.7b',
    name: 'Liquid LFM3 1.7B',
    vendor: 'Liquid AI',
    paramsB: 1.73,
    repo: 'LiquidAI/LFM3-1.7B-GGUF',
    coding: false,
    toolUse: true,
    ctxK: 256,
    license: LFM_LICENSE,
    description:
      'Arquitectura tri-híbrida (convolución + atención). Entrenado para agentes: tool calling nativo, 256K de contexto y español nativo. A 4 bits ocupa ~1 GB.',
    quants: [
      q('Q4_0', 1.05, 78),
      q('Q4_K_M', 1.1, 82),
      q('Q5_K_M', 1.26, 88),
      q('Q6_K', 1.43, 93),
      q('Q8_0', 1.85, 97)
    ],
    minAppRamGB: 6,
    sampling: { temperature: 0.1, topK: 50, repeatPenalty: 1.1 }
  },
  {
    id: 'lfm2.5-1.2b-instruct',
    name: 'Liquid LFM2.5 1.2B Instruct',
    vendor: 'Liquid AI',
    paramsB: 1.2,
    repo: 'LiquidAI/LFM2.5-1.2B-Instruct-GGUF',
    coding: false,
    toolUse: true,
    ctxK: 32,
    license: LFM_LICENSE,
    description:
      'El más pequeño de la familia con tool calling nativo. Pensado para chat, instrucciones y agentes sencillos en equipos muy modestos.',
    quants: [q('Q4_0', 0.7, 78), q('Q4_K_M', 0.73, 82), q('Q5_K_M', 0.84, 88), q('Q8_0', 1.25, 97)],
    minAppRamGB: 4,
    sampling: { temperature: 0.1, topK: 50, repeatPenalty: 1.05 }
  },
  {
    id: 'lfm2.5-350m',
    name: 'Liquid LFM2.5 350M',
    vendor: 'Liquid AI',
    paramsB: 0.35,
    repo: 'LiquidAI/LFM2.5-350M-GGUF',
    coding: false,
    toolUse: true,
    ctxK: 32,
    license: LFM_LICENSE,
    description:
      'Ultra ligero (~220 MB en Q4) y con tool calling nativo, verificado con llama.cpp. Ideal para probar la interfaz y el motor; flojo para razonar.',
    quants: [q('Q4_0', 0.22, 76), q('Q4_K_M', 0.23, 80), q('Q5_K_M', 0.26, 86), q('Q8_0', 0.38, 95)],
    minAppRamGB: 4,
    sampling: { temperature: 0.2, topK: 50, repeatPenalty: 1.05 }
  },
  {
    id: 'lfm2.5-8b-a1b',
    name: 'Liquid LFM2.5 8B A1B (MoE)',
    vendor: 'Liquid AI',
    paramsB: 8,
    activeParamsB: 1.5,
    repo: 'LiquidAI/LFM2.5-8B-A1B-GGUF',
    coding: false,
    toolUse: true,
    ctxK: 128,
    license: LFM_LICENSE,
    description:
      'Mezcla de expertos: calidad de 8B con coste de 1,5B activos. Pensado para tool calling y tareas agénticas, con razonamiento paso a paso.',
    quants: [
      q('Q4_0', 4.84, 78),
      q('Q4_K_M', 5.16, 82),
      q('Q5_K_M', 6.03, 88),
      q('Q6_K', 6.96, 93),
      q('Q8_0', 9.01, 97)
    ],
    minAppRamGB: 12,
    sampling: { temperature: 0.2, topK: 80, repeatPenalty: 1.05 }
  },
  {
    id: 'qwen2.5-coder-1.5b',
    name: 'Qwen2.5 Coder 1.5B',
    vendor: 'Alibaba',
    paramsB: 1.5,
    repo: 'unsloth/Qwen2.5-Coder-1.5B-Instruct-GGUF',
    coding: true,
    toolUse: true,
    ctxK: 32,
    license: 'Apache-2.0',
    description: 'El más ligero de la familia. Ideal para equipos de oficina con 4-8 GB de RAM o GPU muy pequeña.',
    quants: [q('Q3_K_M', 0.9, 68), q('Q4_K_M', 1.1, 80), q('Q5_K_M', 1.3, 88), q('Q8_0', 1.9, 96)],
    minAppRamGB: 4
  },
  {
    id: 'qwen2.5-coder-3b',
    name: 'Qwen2.5 Coder 3B',
    vendor: 'Alibaba',
    paramsB: 3.1,
    repo: 'unsloth/Qwen2.5-Coder-3B-Instruct-GGUF',
    coding: true,
    toolUse: true,
    ctxK: 32,
    license: 'Apache-2.0',
    description: 'Pequeño pero sorprendentemente capaz para autocompletar y refactorizar. Buen equilibrio en 8 GB.',
    quants: [q('Q3_K_M', 1.6, 68), q('Q4_K_M', 2.0, 80), q('Q5_K_M', 2.4, 88), q('Q8_0', 3.5, 96)],
    minAppRamGB: 6
  },
  {
    id: 'qwen2.5-coder-7b',
    name: 'Qwen2.5 Coder 7B',
    vendor: 'Alibaba',
    paramsB: 7.6,
    repo: 'unsloth/Qwen2.5-Coder-7B-Instruct-GGUF',
    coding: true,
    toolUse: true,
    ctxK: 32,
    license: 'Apache-2.0',
    description: 'El punto dulce para programar en local. Excelente relación calidad/velocidad en GPUs de 8 GB.',
    quants: [q('Q3_K_M', 3.7, 68), q('Q4_K_M', 4.7, 80), q('Q5_K_M', 5.4, 88), q('Q8_0', 8.1, 96)],
    minAppRamGB: 10
  },
  {
    id: 'qwen2.5-coder-14b',
    name: 'Qwen2.5 Coder 14B',
    vendor: 'Alibaba',
    paramsB: 14.8,
    repo: 'unsloth/Qwen2.5-Coder-14B-Instruct-GGUF',
    coding: true,
    toolUse: true,
    ctxK: 32,
    license: 'Apache-2.0',
    description: 'Salto claro de calidad en tareas complejas. Recomendado para GPUs de 12-16 GB o 32 GB de RAM.',
    quants: [q('Q3_K_M', 7.2, 68), q('Q4_K_M', 9.0, 80), q('Q5_K_M', 10.7, 88), q('Q8_0', 15.7, 96)],
    minAppRamGB: 16
  },
  {
    id: 'qwen2.5-coder-32b',
    name: 'Qwen2.5 Coder 32B',
    vendor: 'Alibaba',
    paramsB: 32.8,
    repo: 'unsloth/Qwen2.5-Coder-32B-Instruct-GGUF',
    coding: true,
    toolUse: true,
    ctxK: 32,
    license: 'Apache-2.0',
    description: 'Nivel casi de modelos en la nube. Necesita 24 GB de VRAM o 64 GB de RAM para ser práctico.',
    quants: [q('Q3_K_M', 15.5, 68), q('Q4_K_M', 20.0, 80), q('Q5_K_M', 23.5, 88), q('Q8_0', 34.0, 96)],
    minAppRamGB: 32
  },
  {
    id: 'qwen3-coder-30b-a3b',
    name: 'Qwen3 Coder 30B A3B (MoE)',
    vendor: 'Alibaba',
    paramsB: 30.5,
    activeParamsB: 3.3,
    repo: 'unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF',
    coding: true,
    toolUse: true,
    ctxK: 128,
    license: 'Apache-2.0',
    description:
      'Mezcla de expertos: calidad de 30B con velocidad de 3B. La mejor opción si tienes 24 GB de VRAM o 32 GB de RAM.',
    quants: [q('Q3_K_M', 14.6, 68), q('Q4_K_M', 18.6, 80), q('Q5_K_M', 22.0, 88), q('Q8_0', 36.0, 96)],
    minAppRamGB: 32
  },
  {
    id: 'qwen3-4b-2507',
    name: 'Qwen3 4B Instruct 2507',
    vendor: 'Alibaba',
    paramsB: 4.0,
    repo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF',
    coding: true,
    toolUse: true,
    ctxK: 256,
    license: 'Apache-2.0',
    description: 'Modelo general muy reciente, rápido y con buen tool calling. Alternativa moderna a los 3-4B clásicos.',
    quants: [q('Q3_K_M', 2.1, 68), q('Q4_K_M', 2.6, 80), q('Q5_K_M', 3.1, 88), q('Q8_0', 4.5, 96)],
    minAppRamGB: 8
  },
  {
    id: 'qwen3-8b',
    name: 'Qwen3 8B',
    vendor: 'Alibaba',
    paramsB: 8.2,
    repo: 'unsloth/Qwen3-8B-GGUF',
    coding: true,
    toolUse: true,
    ctxK: 128,
    license: 'Apache-2.0',
    description: 'Razonamiento híbrido y buen uso de herramientas. Cabe en 8 GB de VRAM con Q4.',
    quants: [q('Q3_K_M', 4.0, 68), q('Q4_K_M', 5.0, 80), q('Q5_K_M', 5.9, 88), q('Q8_0', 8.7, 96)],
    minAppRamGB: 12
  },
  {
    id: 'deepseek-coder-v2-lite',
    name: 'DeepSeek Coder V2 Lite (MoE)',
    vendor: 'DeepSeek',
    paramsB: 15.7,
    activeParamsB: 2.4,
    repo: 'bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF',
    coding: true,
    toolUse: true,
    ctxK: 128,
    license: 'DeepSeek License',
    description: 'MoE con 2.4B activos: rápido incluso en CPU. Muy fuerte en código y con 128K de contexto.',
    quants: [q('Q3_K_M', 8.2, 68), q('Q4_K_M', 10.4, 80), q('Q5_K_M', 12.2, 88)],
    minAppRamGB: 16
  },
  {
    id: 'deepseek-r1-distill-7b',
    name: 'DeepSeek R1 Distill Qwen 7B',
    vendor: 'DeepSeek',
    paramsB: 7.6,
    repo: 'unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF',
    coding: true,
    toolUse: false,
    ctxK: 32,
    license: 'MIT',
    description: 'Razonamiento paso a paso para depurar y explicar código. No es fiable con tool calling: úsalo en modo chat.',
    quants: [q('Q3_K_M', 3.7, 68), q('Q4_K_M', 4.7, 80), q('Q5_K_M', 5.4, 88), q('Q8_0', 8.1, 96)],
    minAppRamGB: 10
  },
  {
    id: 'codestral-22b',
    name: 'Codestral 22B',
    vendor: 'Mistral',
    paramsB: 22.2,
    repo: 'bartowski/Codestral-22B-v0.1-GGUF',
    coding: true,
    toolUse: false,
    ctxK: 32,
    license: 'MNPL (solo uso no comercial)',
    description: 'Muy bueno completando y rellenando código. Licencia restrictiva: revisa antes de usarlo en empresas.',
    quants: [q('Q3_K_M', 10.4, 68), q('Q4_K_M', 13.5, 80), q('Q5_K_M', 16.0, 88)],
    minAppRamGB: 24
  },
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B Instruct',
    vendor: 'Meta',
    paramsB: 3.2,
    repo: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    coding: false,
    toolUse: true,
    ctxK: 128,
    license: 'Llama 3.2 Community',
    description: 'Rápido y con buen soporte de herramientas. Buena opción para tareas generales en equipos modestos.',
    quants: [q('Q3_K_M', 1.6, 68), q('Q4_K_M', 2.0, 80), q('Q5_K_M', 2.4, 88), q('Q8_0', 3.5, 96)],
    minAppRamGB: 6
  },
  {
    id: 'gemma-3-4b',
    name: 'Gemma 3 4B',
    vendor: 'Google',
    paramsB: 4.3,
    repo: 'unsloth/gemma-3-4b-it-GGUF',
    coding: false,
    toolUse: false,
    ctxK: 128,
    license: 'Gemma Terms',
    description: 'Multimodal ligero (texto e imágenes) y muy rápido. Útil para explicar capturas o diagramas.',
    quants: [q('Q3_K_M', 2.2, 68), q('Q4_K_M', 2.6, 80), q('Q5_K_M', 3.1, 88), q('Q8_0', 4.5, 96)],
    minAppRamGB: 8
  },
  {
    id: 'gemma-3-12b',
    name: 'Gemma 3 12B',
    vendor: 'Google',
    paramsB: 12.2,
    repo: 'unsloth/gemma-3-12b-it-GGUF',
    coding: false,
    toolUse: false,
    ctxK: 128,
    license: 'Gemma Terms',
    description: 'Buen razonamiento general y visión. No recomendado como agente de código por su tool calling limitado.',
    quants: [q('Q3_K_M', 6.0, 68), q('Q4_K_M', 7.4, 80), q('Q5_K_M', 8.8, 88), q('Q8_0', 13.0, 96)],
    minAppRamGB: 16
  }
]

interface Budget {
  vramGB: number
  unifiedGB: number
  cpuGB: number
  unified: boolean
}

function memoryBudget(hw: HardwareInfo): Budget {
  const vramGB = hw.totalVramGB
  // Reserva ~4 GB para el sistema operativo y apps ofimáticas, y no dejes
  // que el modelo acapare más del 72 % de la RAM.
  const usableRam = Math.max(0, Math.min(hw.ramGB - 4, hw.ramGB * 0.72))
  return {
    vramGB,
    unifiedGB: hw.unifiedMemory ? hw.ramGB * 0.7 : 0,
    cpuGB: usableRam,
    unified: hw.unifiedMemory
  }
}

/** Coste extra de memoria por el contexto/KV cache (aprox. para 8K). */
function overheadGB(ctxSize: number): number {
  const base = Math.max(0.4, ctxSize / 8192 * 0.8)
  return base
}

function evaluateFit(sizeGB: number, budget: Budget, ctxSize: number): { fit: FitLevel; gpuLayersPct: number } {
  const need = sizeGB + overheadGB(ctxSize)
  if (budget.unified && budget.unifiedGB >= need) return { fit: 'unified', gpuLayersPct: 100 }
  if (budget.vramGB >= need) return { fit: 'gpu', gpuLayersPct: 100 }
  if (budget.vramGB >= 2 && budget.cpuGB + budget.vramGB >= need) {
    const pct = Math.round((budget.vramGB / need) * 100)
    return { fit: 'hybrid', gpuLayersPct: Math.max(10, Math.min(95, pct)) }
  }
  if (budget.cpuGB >= need) return { fit: 'cpu', gpuLayersPct: 0 }
  return { fit: 'no', gpuLayersPct: 0 }
}

function speedLabel(fit: FitLevel, effectiveParams: number): string {
  const tiers: [number, string][] = [
    [2, '50-110'],
    [4, '35-80'],
    [9, '20-45'],
    [16, '12-28'],
    [33, '7-16'],
    [Infinity, '4-9']
  ]
  const base = tiers.find(([limit]) => effectiveParams <= limit)?.[1] ?? '4-9'
  if (fit === 'gpu' || fit === 'unified') return `${base} tok/s`
  if (fit === 'hybrid') {
    const [lo, hi] = base.split('-').map(Number)
    const d = hi - lo
    return `${Math.max(2, Math.round(lo * 0.5))}-${Math.round(hi * 0.6)} tok/s`
  }
  const [lo, hi] = base.split('-').map(Number)
  return `${Math.max(1, Math.round(lo * 0.25))}-${Math.max(2, Math.round(hi * 0.3))} tok/s`
}

const FIT_SCORE: Record<FitLevel, number> = { gpu: 60, unified: 58, hybrid: 42, cpu: 26, no: 0 }

export function recommendModels(hw: HardwareInfo): ModelRecommendation[] {
  const budget = memoryBudget(hw)
  const ctxSize = 8192
  const out: ModelRecommendation[] = []

  for (const model of CATALOG) {
    const byQuality = [...model.quants].sort((a, b) => b.quality - a.quality)
    let chosen: QuantOption | null = null
    let fit: FitLevel = 'no'
    let pct = 0

    // 1) La mejor calidad que quepa ENTERA en GPU o memoria unificada.
    for (const quant of byQuality) {
      const evaluation = evaluateFit(quant.sizeGB, budget, ctxSize)
      if (evaluation.fit === 'gpu' || evaluation.fit === 'unified') {
        chosen = quant
        fit = evaluation.fit
        pct = evaluation.gpuLayersPct
        break
      }
    }

    // 2) En modo híbrido/CPU, Q4_K_M es el mejor equilibrio calidad/velocidad.
    if (!chosen) {
      for (const name of ['Q4_K_M', 'Q3_K_M', 'Q5_K_M', 'Q8_0']) {
        const quant = model.quants.find((q) => q.quant === name)
        if (!quant) continue
        const evaluation = evaluateFit(quant.sizeGB, budget, ctxSize)
        if (evaluation.fit !== 'no') {
          chosen = quant
          fit = evaluation.fit
          pct = evaluation.gpuLayersPct
          break
        }
      }
    }

    // 3) Cualquier cuantización que quepa (modelos con cuantos poco habituales).
    if (!chosen) {
      for (const quant of [...model.quants].sort((a, b) => a.sizeGB - b.sizeGB)) {
        const evaluation = evaluateFit(quant.sizeGB, budget, ctxSize)
        if (evaluation.fit !== 'no') {
          chosen = quant
          fit = evaluation.fit
          pct = evaluation.gpuLayersPct
          break
        }
      }
    }

    if (!chosen) {
      chosen = [...model.quants].sort((a, b) => a.sizeGB - b.sizeGB)[0]
      fit = 'no'
    }

    const needed = chosen.sizeGB + overheadGB(ctxSize)
    const usableTotal = budget.cpuGB + budget.vramGB
    if (fit === 'no' && needed > usableTotal) {
      if (model.paramsB > 12) continue
    }

    const effective = model.activeParamsB ?? model.paramsB
    let score = FIT_SCORE[fit] + Math.min(22, Math.log2(model.paramsB + 1) * 6.5)
    if (model.coding) score += 10
    if (model.toolUse) score += 8
    if (model.ctxK >= 128) score += 3
    if (/no comercial|MNPL/i.test(model.license)) score -= 6
    if (fit === 'no') score = Math.max(1, score - 55)

    const reasons: string[] = []
    const warnings: string[] = []
    const totalGb = Math.round(budget.vramGB * 10) / 10

    if (fit === 'gpu') reasons.push(`Cabe completo en tu GPU (${totalGb} GB de VRAM) con ${chosen.quant}.`)
    if (fit === 'unified') reasons.push('Aprovecha la memoria unificada del chip de Apple y la GPU Metal.')
    if (fit === 'hybrid') reasons.push(`Reparte el modelo entre GPU (${pct} % de capas) y RAM: buen equilibrio.`)
    if (fit === 'cpu') reasons.push('Corre en CPU: útil, pero más lento que en GPU.')
    if (model.coding) reasons.push('Entrenado específicamente para código y edición de archivos.')
    if (model.toolUse) reasons.push('Soporta tool calling: puede leer/escribir archivos y ejecutar comandos.')

    if (fit === 'no') {
      warnings.push(
        `Necesita ~${(chosen.sizeGB + overheadGB(ctxSize)).toFixed(1)} GB y tu equipo dispone de ~${(
          budget.cpuGB + budget.vramGB
        ).toFixed(1)} GB utilizables.`
      )
    }
    if (hw.ramGB < model.minAppRamGB) {
      warnings.push(`RAM recomendada: ${model.minAppRamGB} GB (tienes ${hw.ramGB} GB).`)
    }
    if (fit === 'cpu' && model.paramsB > 9) {
      warnings.push('En CPU la generación puede ser de pocos tokens por segundo: considera una cuantización más pequeña.')
    }
    if ((fit === 'hybrid' || fit === 'cpu') && usableTotal > 0 && needed > usableTotal * 0.85) {
      warnings.push(
        `Memoria muy justa: necesita ~${needed.toFixed(1)} GB de ~${usableTotal.toFixed(
          1
        )} GB utilizables. Cierra otras aplicaciones o elige una cuantización menor.`
      )
    }
    if (/no comercial|MNPL/i.test(model.license)) warnings.push('Licencia no comercial: no apta para uso empresarial.')
    if (/^lfm open license/i.test(model.license)) {
      warnings.push('Uso comercial gratuito solo si tu empresa factura menos de 10 M USD al año.')
    }
    if (model.ctxK < 32 && fit !== 'no') warnings.push('Contexto corto: puede quedarse sin espacio en repositorios grandes.')

    out.push({
      model,
      quant: chosen,
      fit,
      score: Math.round(score),
      gpuLayersPct: pct,
      estimatedSpeed: fit === 'no' ? 'no recomendado' : speedLabel(fit, effective),
      reasons,
      warnings
    })
  }

  // Una recomendación por familia, la mejor puntuada.
  const byFamily = new Map<string, ModelRecommendation>()
  for (const rec of out.sort((a, b) => b.score - a.score)) {
    const family = rec.model.id.replace(/-\d+(\.\d+)?b.*$/i, '')
    const existing = byFamily.get(family)
    if (!existing || existing.score < rec.score) byFamily.set(family, rec)
  }

  const result = [...byFamily.values()].sort((a, b) => b.score - a.score)
  const usable = result.filter((r) => r.fit !== 'no')
  const notUsable = result.filter((r) => r.fit === 'no')
  return [...usable.slice(0, 8), ...notUsable.slice(0, 2)]
}

export function pickBest(hw: HardwareInfo): ModelRecommendation | null {
  const recs = recommendModels(hw).filter((r) => r.fit !== 'no')
  return recs[0] ?? null
}

export function catalogById(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id)
}

/** Busca el modelo del catálogo al que corresponde un repositorio de HuggingFace. */
export function catalogByRepo(repo: string | undefined): CatalogModel | undefined {
  if (!repo) return undefined
  const target = repo.trim().toLowerCase()
  return CATALOG.find((m) => m.repo.toLowerCase() === target)
}
