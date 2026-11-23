import os from 'node:os'
import path from 'node:path'
import si from 'systeminformation'
import type { Backend, GpuInfo, HardwareInfo } from '@shared/types'
import { hasBinary, run, freeDiskGB } from './util'
import { log } from './logger'

interface NvidiaGpu {
  name: string
  vramMB: number
  driver?: string
}

async function nvidiaSmi(): Promise<NvidiaGpu[]> {
  if (!(await hasBinary('nvidia-smi'))) return []
  const res = await run(
    'nvidia-smi',
    ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'],
    { timeoutMs: 8000 }
  )
  if (res.code !== 0) return []
  return res.stdout
    .split(/\r?\n/)
    .map((line) => line.split(',').map((p) => p.trim()))
    .filter((parts) => parts.length >= 2 && parts[0])
    .map((parts) => ({
      name: parts[0],
      vramMB: Number(parts[1]) || 0,
      driver: parts[2]
    }))
}

async function hasRocm(): Promise<boolean> {
  if (process.platform !== 'linux') return false
  return hasBinary('rocm-smi')
}

async function hasVulkan(): Promise<boolean> {
  return hasBinary('vulkaninfo')
}

function osLabel(): string {
  switch (process.platform) {
    case 'win32':
      return `Windows ${os.release()}`
    case 'darwin':
      return `macOS ${os.release()}`
    case 'linux':
      return `Linux ${os.release()}`
    default:
      return `${os.type()} ${os.release()}`
  }
}

export async function scanHardware(modelsDir: string): Promise<HardwareInfo> {
  const notes: string[] = []
  const cpus = os.cpus()
  const cpuModel = (cpus[0]?.model ?? 'CPU desconocido').replace(/\s+/g, ' ').trim()
  const ramGB = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10
  const cpuThreads = cpus.length
  const cpuCores = Math.max(1, Math.round(cpuThreads / 2))

  const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64'
  const unifiedMemory = isAppleSilicon
  let backend: Backend = 'cpu'
  let gpus: GpuInfo[] = []

  try {
    const graphics = await si.graphics()
    gpus = (graphics.controllers ?? [])
      .filter((c) => c.model && !/virtual|basic display|remote/i.test(c.model))
      .map((c) => {
        const rawVram =
          typeof c.vram === 'number' ? c.vram : typeof c.vramDynamic === 'number' ? c.vramDynamic : null
        const vram = rawVram !== null && rawVram > 0 ? rawVram : null
        const vendor = (c.vendor ?? '').toLowerCase()
        return {
          name: c.model,
          vendor: c.vendor ?? '',
          vramMB: vram,
          backend: /nvidia/i.test(vendor)
            ? 'cuda'
            : /advanced micro devices|amd|radeon|ati/i.test(vendor)
              ? 'vulkan'
              : 'cpu'
        } satisfies GpuInfo
      })
  } catch (err) {
    log('warn', 'No se pudo leer información gráfica', String(err))
  }

  const nvidia = await nvidiaSmi().catch(() => [] as NvidiaGpu[])
  if (nvidia.length) {
    backend = 'cuda'
    const seen = new Set(nvidia.map((g) => g.name))
    gpus = [
      ...nvidia.map((g) => ({
        name: g.name,
        vendor: 'NVIDIA',
        vramMB: g.vramMB,
        backend: 'cuda' as Backend,
        driver: g.driver
      })),
      ...gpus.filter((g) => !seen.has(g.name) && !/nvidia/i.test(g.vendor))
    ]
    notes.push('GPU NVIDIA detectada: se usará CUDA para máxima velocidad.')
  } else if (isAppleSilicon) {
    backend = 'metal'
    gpus = [
      {
        name: 'Apple Silicon (GPU integrada)',
        vendor: 'Apple',
        vramMB: Math.round(ramGB * 1024),
        backend: 'metal'
      }
    ]
    notes.push(
      'Memoria unificada: la GPU comparte RAM con el sistema. Metal reserva como máximo ~70 % de la RAM para el modelo.'
    )
  } else if (await hasRocm()) {
    backend = 'rocm'
    notes.push('ROCm disponible: se usará para acelerar modelos en GPU AMD.')
  } else if ((await hasVulkan()) && gpus.length) {
    backend = 'vulkan'
    notes.push('Vulkan disponible: se usará para acelerar la inferencia en GPU.')
  } else {
    backend = 'cpu'
    notes.push('No se detectó aceleración por GPU utilizable: el modelo correrá en CPU (más lento).')
  }

  const totalVramGB = unifiedMemory
    ? ramGB
    : Math.round(
        (gpus.filter((g) => !/intel/i.test(g.vendor)).reduce((acc, g) => acc + (g.vramMB ?? 0), 0) / 1024) * 10
      ) / 10

  if (!unifiedMemory && totalVramGB < 4 && backend !== 'cpu') {
    notes.push('Menos de 4 GB de VRAM: conviene usar modelos pequeños o cuantizaciones Q4.')
  }
  if (ramGB < 16) {
    notes.push('Con menos de 16 GB de RAM los modelos de 14B o más pueden no ser utilizables.')
  }

  let freeDisk = await freeDiskGB(modelsDir)
  if (freeDisk < 0) {
    freeDisk = await freeDiskGB(path.dirname(modelsDir))
  }

  return {
    platform: process.platform,
    arch: process.arch,
    osLabel: osLabel(),
    cpuModel,
    cpuCores,
    cpuThreads,
    ramGB,
    gpus,
    unifiedMemory,
    totalVramGB,
    backend,
    freeDiskGB: freeDisk,
    notes
  }
}
