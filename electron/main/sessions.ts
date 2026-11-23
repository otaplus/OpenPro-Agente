import { app } from 'electron'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Session, SessionSummary } from '@shared/types'
import { ensureDir, readJson, uid, writeJsonAtomic } from './util'

function dir(): string {
  return path.join(app.getPath('userData'), 'sessions')
}

function fileFor(id: string): string {
  if (!/^ses_[a-f0-9-]{36}$/.test(id)) throw new Error('Identificador de sesión inválido.')
  return path.join(dir(), `${id}.json`)
}

export async function createSession(workspace: string | null): Promise<Session> {
  const now = Date.now()
  const session: Session = {
    id: uid('ses_'),
    title: 'Nueva conversación',
    createdAt: now,
    updatedAt: now,
    workspace,
    modelPath: null,
    messages: []
  }
  await saveSession(session)
  return session
}

export async function saveSession(session: Session): Promise<void> {
  session.updatedAt = Date.now()
  await writeJsonAtomic(fileFor(session.id), session)
}

export async function loadSession(id: string): Promise<Session | null> {
  try {
    return await readJson<Session | null>(fileFor(id), null)
  } catch {
    return null
  }
}

export async function deleteSession(id: string): Promise<void> {
  await fsp.rm(fileFor(id), { force: true })
}

export async function listSessions(): Promise<SessionSummary[]> {
  await ensureDir(dir())
  const entries = await fsp.readdir(dir()).catch(() => [])
  const out: SessionSummary[] = []
  for (const name of entries) {
    if (!name.endsWith('.json')) continue
    const session = await readJson<Session | null>(path.join(dir(), name), null)
    if (!session?.id) continue
    out.push({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      workspace: session.workspace,
      messageCount: session.messages?.length ?? 0
    })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}
