import { app } from 'electron'
import os from 'node:os'
import path from 'node:path'
import type { AppSettings } from '@shared/types'
import { readJson, writeJsonAtomic } from './util'

const FILE = path.join(app.getPath('userData'), 'settings.json')

export function defaultSettings(): AppSettings {
  return {
    version: 1,
    modelsDir: path.join(os.homedir(), 'OpenProAgente', 'models'),
    onboardingDone: false,
    theme: 'dark',
    hfToken: '',
    engine: {
      mode: 'managed',
      binaryPath: '',
      port: 8790,
      backend: 'auto',
      ctxSize: 16384,
      gpuLayers: -1,
      threads: 0,
      extraArgs: '',
      installedTag: null
    },
    agent: {
      maxSteps: 24,
      approvalMode: 'ask',
      permission: 'workspace',
      temperature: 0.2,
      maxTokens: 3072,
      systemExtra: '',
      allowList: [],
      webFetch: true
    },
    lastWorkspace: null,
    lastModelPath: null
  }
}

function merge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object') return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = out[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object' && !Array.isArray(current)) {
      out[key] = merge(current, value)
    } else if (value !== undefined && key in out) {
      out[key] = value
    }
  }
  return out as T
}

let cache: AppSettings | null = null

export async function loadSettings(): Promise<AppSettings> {
  if (!cache) {
    const stored = await readJson<Partial<AppSettings>>(FILE, {})
    cache = merge(defaultSettings(), stored)
    // Sanea valores claramente inválidos.
    cache.engine.ctxSize = Math.min(Math.max(cache.engine.ctxSize || 8192, 2048), 262144)
    cache.engine.port = Math.min(Math.max(cache.engine.port || 8790, 1024), 65535)
    if (!cache.modelsDir) cache.modelsDir = defaultSettings().modelsDir
    if (!['plan', 'workspace', 'full'].includes(cache.agent.permission)) cache.agent.permission = 'workspace'
  }
  return cache
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings()
  const next = merge(current, patch)
  cache = next
  await writeJsonAtomic(FILE, next)
  return next
}

export async function resetSettings(): Promise<AppSettings> {
  cache = defaultSettings()
  await writeJsonAtomic(FILE, cache)
  return cache
}

export function settingsFile(): string {
  return FILE
}
