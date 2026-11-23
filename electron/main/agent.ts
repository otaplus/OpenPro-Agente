import os from 'node:os'
import path from 'node:path'
import type {
  ApprovalDecision,
  ApprovalRequest,
  ChatMessage,
  ChatSendPayload,
  ModelSampling,
  Session,
  ToolCall
} from '@shared/types'
import { emit } from './bus'
import { engineStatus, startEngine, streamChat, type EngineMessage } from './engine'
import { executeTool, isOutsideWorkspace, toolDefinitions, TOOLS, WRITE_TOOLS } from './tools'
import { loadSession, saveSession } from './sessions'
import { loadSettings, saveSettings } from './settings'
import { catalogByRepo } from './catalog'
import { modelRepoFor } from './downloader'
import { log } from './logger'
import { pathExists, truncate, uid } from './util'

interface ActiveRun {
  controller: AbortController
  sessionId: string
}

const runs = new Map<string, ActiveRun>()
const pendingApprovals = new Map<string, (decision: ApprovalDecision) => void>()

export function resolveApproval(requestId: string, decision: ApprovalDecision): void {
  const resolver = pendingApprovals.get(requestId)
  if (resolver) {
    pendingApprovals.delete(requestId)
    resolver(decision)
  }
}

export function abortChat(sessionId: string): void {
  const run = runs.get(sessionId)
  if (run) run.controller.abort()
  for (const [id, resolve] of pendingApprovals) {
    resolve('deny')
    pendingApprovals.delete(id)
  }
}

export function isRunning(sessionId: string): boolean {
  return runs.has(sessionId)
}

// ------------------------------ Utilidades -------------------------------

function batched(sessionId: string, messageId: string): {
  content: (t: string) => void
  reasoning: (t: string) => void
  stop: () => void
} {
  let bufferContent = ''
  let bufferReasoning = ''
  let timer: NodeJS.Timeout | null = null

  const flush = (): void => {
    if (bufferContent) {
      emit('chat:delta', { sessionId, messageId, kind: 'content', text: bufferContent })
      bufferContent = ''
    }
    if (bufferReasoning) {
      emit('chat:delta', { sessionId, messageId, kind: 'reasoning', text: bufferReasoning })
      bufferReasoning = ''
    }
  }
  const schedule = (): void => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      flush()
    }, 45)
  }
  return {
    content: (t) => {
      bufferContent += t
      schedule()
    },
    reasoning: (t) => {
      bufferReasoning += t
      schedule()
    },
    stop: () => {
      if (timer) clearTimeout(timer)
      timer = null
      flush()
    }
  }
}

function systemPrompt(
  workspace: string,
  textProtocol: boolean,
  extra: string,
  permission: 'plan' | 'workspace' | 'full' = 'workspace'
): string {
  const shell = process.platform === 'win32' ? 'cmd.exe (PowerShell disponible)' : '/bin/bash'
  const permisos =
    permission === 'plan'
      ? 'Modo «solo pensar»: NO dispones de herramientas para escribir archivos ni ejecutar comandos. Analiza, lee y propón los cambios en texto; el usuario los aplicará o te dará más permisos.'
      : permission === 'full'
        ? 'Modo «control total»: puedes trabajar dentro y fuera del proyecto. Antes de tocar algo fuera de él se pedirá aprobación al usuario.'
        : 'Modo «escribir en el proyecto»: solo puedes modificar archivos dentro del proyecto abierto.'
  const base = `Eres OpenPro Agente, un agente de programación autónomo que corre 100% en local en el equipo del usuario.

## Entorno
- Sistema operativo: ${os.type()} ${os.release()} (${process.arch})
- Shell: ${shell}
- Proyecto abierto: ${workspace}
- Permisos: ${permisos}
- Fecha: ${new Date().toISOString().slice(0, 10)}

## Cómo trabajas
1. Antes de modificar código, explora y lee los archivos relevantes con list_dir, read_file, grep o glob. Nunca inventes el contenido de un archivo.
2. Usa edit_file para cambios puntuales (el texto old_text debe existir exactamente y ser único) y write_file solo para archivos nuevos o reescrituras completas.
3. Muestra tu razonamiento de forma breve y en el idioma del usuario. No narres cada token.
4. Después de cambios importantes, ejecuta las pruebas, el linter o el build con run_command cuando exista un comando razonable.
5. Mantén los cambios mínimos y coherentes con el estilo del proyecto. No borres ni reescribas archivos que no necesites tocar.
6. No salgas del directorio del proyecto (${workspace}) y no ejecutes comandos interactivos ni servidores en primer plano.
7. Si un comando falla, lee el error y corrige. No repitas el mismo comando fallido sin cambios.
8. Cuando termines, responde con un resumen breve en markdown: qué cambiaste, qué archivos tocaste y cómo probarlo.

## Herramientas
${
  permission === 'plan'
    ? 'Solo tienes herramientas de lectura (list_dir, read_file, grep, glob) y web_fetch. No puedes escribir archivos ni ejecutar comandos: no lo intentes, describe los cambios en texto.'
    : 'Dispones de herramientas para leer/escribir archivos, buscar, listar y ejecutar comandos. Úsalas en lugar de suponer.'
}
Todas las rutas son relativas al proyecto.`

  const protocol = textProtocol
    ? `

## Formato obligatorio para usar herramientas
Cuando necesites una herramienta, responde SOLO con un bloque como este y nada más:

\`\`\`tool
{"name": "read_file", "arguments": {"path": "src/index.ts"}}
\`\`\`

Espera el resultado y continúa. Cuando ya no necesites herramientas, responde normalmente en markdown.`
    : ''

  return [base, protocol, extra.trim()].filter(Boolean).join('\n')
}

function toEngineMessages(
  session: Session,
  textProtocol: boolean,
  extra: string,
  permission: 'plan' | 'workspace' | 'full' = 'workspace'
): EngineMessage[] {
  const messages: EngineMessage[] = [
    { role: 'system', content: systemPrompt(session.workspace ?? '.', textProtocol, extra, permission) }
  ]
  for (const m of session.messages) {
    if (m.role === 'system') continue
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const msg: EngineMessage = { role: 'assistant', content: m.content || '' }
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) }
        }))
      }
      messages.push(msg)
    } else if (m.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        name: m.toolName,
        content: truncate(m.content, 12000)
      })
    }
  }
  return messages
}

/** Recorta el historial para que quepa en el contexto configurado. */
function trimHistory(messages: EngineMessage[], ctxSize: number, maxTokens: number): EngineMessage[] {
  const systems = messages.filter((m) => m.role === 'system')
  const rest = messages.filter((m) => m.role !== 'system')
  const budgetChars = Math.max(6000, (ctxSize - maxTokens - 1400) * 3.5)
  let total = systems.reduce((acc, m) => acc + m.content.length, 0)
  const kept: EngineMessage[] = []

  for (let i = rest.length - 1; i >= 0; i--) {
    const m = rest[i]
    const size = (m.content?.length ?? 0) + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0)
    if (total + size > budgetChars && kept.length > 0) break
    total += size
    kept.unshift(m)
  }
  // No empezar con un resultado de herramienta huérfano.
  while (kept.length && kept[0].role === 'tool') kept.shift()
  return [...systems, ...kept]
}

function extractToolCalls(content: string): { calls: ToolCall[]; cleaned: string } {
  const calls: ToolCall[] = []
  let cleaned = content

  const patterns: RegExp[] = [
    /```tool\s*([\s\S]*?)```/gi,
    /<tool_call>\s*([\s\S]*?)<\/tool_call>/gi,
    /<tools>\s*([\s\S]*?)<\/tools>/gi,
    /<tool>\s*([\s\S]*?)<\/tool>/gi,
    /<function_call>\s*([\s\S]*?)<\/function_call>/gi,
    /```json\s*(\{[\s\S]*?"name"[\s\S]*?\})\s*```/gi,
    /```(?:json)?\s*(\[[\s\S]*?"name"[\s\S]*?\])\s*```/gi
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content))) {
      const parsed = tryParseCalls(match[1])
      if (parsed.length) {
        calls.push(...parsed)
        cleaned = cleaned.replace(match[0], '')
      }
    }
  }

  if (!calls.length) {
    const direct = tryParseCalls(content)
    if (direct.length) {
      calls.push(...direct)
      cleaned = ''
    }
  }

  return { calls, cleaned: cleaned.trim() }
}

function parseLooseJson(raw: string): unknown {
  const text = raw.trim()
  try {
    return JSON.parse(text)
  } catch {
    // Algunos modelos pequeños emiten JSON con comillas simples.
    try {
      return JSON.parse(text.replace(/'/g, '"'))
    } catch {
      return null
    }
  }
}

function tryParseCalls(raw: string): ToolCall[] {
  const data = parseLooseJson(raw)
  if (Array.isArray(data)) {
    return data
      .map((item) => tryParseCall(JSON.stringify(item)))
      .filter((call): call is ToolCall => Boolean(call))
  }
  const single = tryParseCall(raw)
  return single ? [single] : []
}

function tryParseCall(raw: string): ToolCall | null {
  try {
    const data = parseLooseJson(raw) as {
      name?: unknown
      arguments?: unknown
      args?: unknown
      tool?: unknown
      parameters?: unknown
    } | null
    if (!data || typeof data !== 'object') return null
    const name =
      typeof data.name === 'string'
        ? data.name
        : typeof data.tool === 'string'
          ? data.tool
          : typeof (data as { function?: { name?: string } }).function?.name === 'string'
            ? (data as { function: { name: string } }).function.name
            : null
    if (!name) return null
    let args = data.arguments ?? data.args ?? data.parameters
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args)
      } catch {
        args = {}
      }
    }
    return {
      id: uid('call_'),
      name,
      args: args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
    }
  } catch {
    return null
  }
}

function callPathArg(call: ToolCall): string {
  if (call.name === 'run_command') return String(call.args.cwd ?? '.')
  return String(call.args.path ?? '.')
}

/** ¿Esta llamada toca una ruta fuera del proyecto abierto? */
function touchesOutside(call: ToolCall, workspace: string): boolean {
  if (!WRITE_TOOLS.has(call.name)) return false
  return isOutsideWorkspace(workspace, callPathArg(call))
}

function needsApproval(
  call: ToolCall,
  settings: Awaited<ReturnType<typeof loadSettings>>,
  workspace: string
): boolean {
  // Con «control total» las rutas externas se ejecutan, pero siempre avisando.
  if (settings.agent.permission === 'full' && touchesOutside(call, workspace)) return true
  if (settings.agent.approvalMode === 'auto') return false
  return call.name === 'run_command'
}

function commandAllowed(command: string, allowList: string[]): boolean {
  const normalized = command.trim().toLowerCase()
  return allowList.some((prefix) => normalized.startsWith(prefix.toLowerCase()))
}

function approvalPreview(call: ToolCall): string {
  if (call.name === 'run_command') return String(call.args.command ?? '')
  if (call.name === 'write_file') {
    const content = String(call.args.content ?? '')
    return `Escribir ${String(call.args.path ?? '')} (${content.length} caracteres)\n\n${truncate(content, 700)}`
  }
  if (call.name === 'edit_file') {
    return `Editar ${String(call.args.path ?? '')}\n\n- ${truncate(String(call.args.old_text ?? ''), 350)}\n+ ${truncate(
      String(call.args.new_text ?? ''),
      350
    )}`
  }
  return JSON.stringify(call.args, null, 2).slice(0, 800)
}

async function requestApproval(
  sessionId: string,
  call: ToolCall,
  settings: Awaited<ReturnType<typeof loadSettings>>,
  workspace: string
): Promise<ApprovalDecision> {
  if (!needsApproval(call, settings, workspace)) return 'once'
  if (
    call.name === 'run_command' &&
    !touchesOutside(call, workspace) &&
    commandAllowed(String(call.args.command ?? ''), settings.agent.allowList)
  ) {
    return 'once'
  }
  const request: ApprovalRequest = {
    id: uid('apr_'),
    sessionId,
    call,
    kind: call.name === 'run_command' ? 'command' : 'write',
    preview: approvalPreview(call),
    reason:
      call.name === 'run_command'
        ? touchesOutside(call, workspace)
          ? 'El agente quiere ejecutar un comando fuera del proyecto.'
          : 'El agente quiere ejecutar un comando en tu equipo.'
        : 'El agente quiere modificar un archivo fuera del proyecto.'
  }
  emit('chat:approval', request)
  return new Promise<ApprovalDecision>((resolve) => {
    const timer = setTimeout(() => {
      pendingApprovals.delete(request.id)
      resolve('deny')
    }, 5 * 60 * 1000)
    pendingApprovals.set(request.id, (decision) => {
      clearTimeout(timer)
      resolve(decision)
    })
  })
}

// ------------------------------ Bucle principal ---------------------------

export async function sendChat(payload: ChatSendPayload): Promise<void> {
  if (runs.has(payload.sessionId)) throw new Error('Ya hay una respuesta en curso en esta conversación.')
  const controller = new AbortController()
  runs.set(payload.sessionId, { controller, sessionId: payload.sessionId })
  void runChat(payload, controller).finally(() => runs.delete(payload.sessionId))
}

async function runChat(payload: ChatSendPayload, controller: AbortController): Promise<void> {
  const started = Date.now()
  const sessionId = payload.sessionId
  const settings = await loadSettings()
  let session: Session | null = await loadSession(sessionId)
  if (!session) {
    emit('chat:done', {
      sessionId,
      messageId: uid('msg_'),
      content: '',
      steps: 0,
      durationMs: 0,
      error: 'La conversación no existe. Crea una nueva.'
    })
    return
  }

  const fail = (message: string): void => {
    const msg: ChatMessage = {
      id: uid('msg_'),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      error: message
    }
    const current = session!
    current.messages.push(msg)
    void saveSession(current)
    emit('chat:done', {
      sessionId,
      messageId: msg.id,
      content: '',
      steps: 0,
      durationMs: Date.now() - started,
      error: message
    })
  }

  const workspace = payload.workspace ?? settings.lastWorkspace
  if (!workspace) {
    fail('Selecciona una carpeta de proyecto antes de enviar un mensaje.')
    return
  }
  if (!(await pathExists(workspace))) {
    fail(`La carpeta del proyecto no existe: ${workspace}`)
    return
  }
  session.workspace = workspace

  const permission = settings.agent.permission ?? 'workspace'

  const modelPath = payload.modelPath ?? session.modelPath ?? settings.lastModelPath
  if (!modelPath) {
    fail('Selecciona un modelo GGUF antes de enviar un mensaje.')
    return
  }

  // Si el modelo viene del catálogo, usa el muestreo recomendado por su autor
  // (top_k y penalización por repetición frenan los bucles de los modelos pequeños).
  let sampling: ModelSampling | undefined
  try {
    sampling = catalogByRepo(await modelRepoFor(modelPath))?.sampling
  } catch {
    sampling = undefined
  }

  const userMessage: ChatMessage = {
    id: uid('msg_'),
    role: 'user',
    content: payload.text,
    createdAt: Date.now()
  }
  session.messages.push(userMessage)
  if (session.title === 'Nueva conversación') {
    session.title = payload.text.trim().slice(0, 60) || 'Nueva conversación'
  }
  await saveSession(session)
  await saveSettings({ lastWorkspace: workspace, lastModelPath: modelPath })

  // Asegura el motor con el modelo solicitado.
  const status = engineStatus()
  if (status.state !== 'ready' || status.modelPath !== modelPath) {
    try {
      await startEngine(modelPath)
    } catch (err) {
      fail(`No se pudo cargar el modelo: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
  }

  let textProtocol = false
  let step = 0
  const maxSteps = Math.max(1, settings.agent.maxSteps)
  let lastContent = ''
  let lastMessageId = uid('msg_')
  let totalSteps = 0
  // Los modelos pequeños tienden a repetir la misma llamada en bucle.
  const seenCalls = new Map<string, { output: string; count: number }>()
  let loopGuardTripped = false

  try {
    while (step < maxSteps) {
      step++
      totalSteps = step
      emit('chat:step', { sessionId, step, maxSteps })

      const assistantId = uid('msg_')
      lastMessageId = assistantId
      let sender = batched(sessionId, assistantId)
      let result
      let gpuRetried = false
      for (;;) {
        try {
          result = await streamChat({
            messages: trimHistory(
              toEngineMessages(session, textProtocol, settings.agent.systemExtra, permission),
              settings.engine.ctxSize,
              settings.agent.maxTokens
            ),
            tools: textProtocol ? undefined : toolDefinitions(settings.agent.webFetch, permission),
            temperature: settings.agent.temperature,
            maxTokens: settings.agent.maxTokens,
            sampling,
            signal: controller.signal,
            onContent: sender.content,
            onReasoning: sender.reasoning
          })
          break
        } catch (err) {
          sender.stop()
          const message = err instanceof Error ? err.message : String(err)
          if (message.startsWith('TOOLS_NOT_SUPPORTED') && !textProtocol) {
            log('warn', 'El modelo no soporta tool calling nativo; usando protocolo de texto.')
            textProtocol = true
            step--
            result = null
            break
          }
          const current = engineStatus()
          if (
            !gpuRetried &&
            !controller.signal.aborted &&
            current.backend &&
            current.backend !== 'cpu'
          ) {
            gpuRetried = true
            log('warn', `Fallo del motor con ${current.backend}: ${message}. Reintentando en CPU.`)
            try {
              await startEngine(modelPath, 'cpu')
            } catch (restartError) {
              throw new Error(
                `La aceleración por GPU falló y no se pudo reiniciar en CPU: ${
                  restartError instanceof Error ? restartError.message : String(restartError)
                }`
              )
            }
            sender = batched(sessionId, assistantId)
            continue
          }
          throw err
        }
      }
      sender.stop()
      if (!result) continue

      let calls = result.toolCalls
      let content = result.content
      if (!calls.length) {
        const parsed = extractToolCalls(content)
        calls = parsed.calls
        content = parsed.cleaned
      }
      // Modelos con razonamiento (LFM3, Qwen3…) pueden gastar todos los tokens
      // pensando y devolver texto vacío. Mejor un aviso claro que una burbuja vacía.
      if (!calls.length && !content.trim()) {
        content =
          result.finishReason === 'length'
            ? 'El modelo agotó el límite de tokens mientras pensaba y no llegó a responder. Sube «Máximo de tokens» en Ajustes o pide algo más concreto.'
            : 'El modelo no devolvió texto. Prueba a reformular la petición.'
      }
      lastContent = content

      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content,
        reasoning: result.reasoning || undefined,
        toolCalls: calls.length ? calls : undefined,
        createdAt: Date.now()
      }
      session.messages.push(assistantMessage)
      await saveSession(session)

      if (!calls.length) {
        emit('chat:done', {
          sessionId,
          messageId: assistantId,
          content,
          reasoning: result.reasoning || undefined,
          steps: totalSteps,
          durationMs: Date.now() - started
        })
        return
      }

      // Ejecuta cada herramienta solicitada.
      for (const call of calls) {
        if (controller.signal.aborted) throw new Error('Cancelado por el usuario')
        const tool = TOOLS[call.name]
        const toolMessageId = uid('msg_')
        emit('chat:tool', {
          sessionId,
          messageId: toolMessageId,
          call,
          status: 'pending'
        })

        if (!tool) {
          const output = `Herramienta desconocida: ${call.name}. Disponibles: ${Object.keys(TOOLS).join(', ')}`
          session.messages.push({
            id: toolMessageId,
            role: 'tool',
            content: output,
            toolCallId: call.id,
            toolName: call.name,
            createdAt: Date.now(),
            toolStatus: 'error'
          })
          await saveSession(session)
          emit('chat:tool', { sessionId, messageId: toolMessageId, call, status: 'error', result: output })
          continue
        }

        // Llamada idéntica a una anterior: no la repetimos, devolvemos el
        // resultado ya obtenido y avisamos al modelo.
        const signature = `${call.name}:${JSON.stringify(call.args ?? {})}`
        const seen = seenCalls.get(signature)
        if (seen) {
          seen.count++
          const output = `Ya ejecutaste exactamente esta llamada antes. Este fue el resultado:\n\n${seen.output}\n\nNo repitas la misma llamada. Responde al usuario con lo que ya sabes o usa otra herramienta distinta.`
          session.messages.push({
            id: toolMessageId,
            role: 'tool',
            content: output,
            toolCallId: call.id,
            toolName: call.name,
            createdAt: Date.now(),
            toolStatus: 'done'
          })
          await saveSession(session)
          emit('chat:tool', { sessionId, messageId: toolMessageId, call, status: 'done', result: output })
          if (seen.count >= 2) loopGuardTripped = true
          continue
        }

        if (permission === 'plan' && WRITE_TOOLS.has(call.name)) {
          // El modo «solo pensar» no ofrece estas herramientas; si el modelo las
          // inventa igualmente, se corta aquí sin tocar nada del equipo.
          const output = `Estás en modo «solo pensar»: no puedes usar ${call.name}. Explica en texto qué cambios propondrías y el usuario decidirá si te da más permisos.`
          session.messages.push({
            id: toolMessageId,
            role: 'tool',
            content: output,
            toolCallId: call.id,
            toolName: call.name,
            createdAt: Date.now(),
            toolStatus: 'denied'
          })
          await saveSession(session)
          emit('chat:tool', { sessionId, messageId: toolMessageId, call, status: 'denied', result: output })
          continue
        }

        const decision = await requestApproval(sessionId, call, settings, workspace)
        if (decision === 'always' && call.name === 'run_command') {
          const command = String(call.args.command ?? '').trim().split(/\s+/).slice(0, 2).join(' ')
          if (command) {
            const allowList = [...new Set([...settings.agent.allowList, command])]
            settings.agent.allowList = allowList
            await saveSettings({ agent: { ...settings.agent, allowList } })
          }
        }
        if (decision === 'deny') {
          const output = 'El usuario denegó la ejecución de esta herramienta. Propón una alternativa o pide instrucciones.'
          session.messages.push({
            id: toolMessageId,
            role: 'tool',
            content: output,
            toolCallId: call.id,
            toolName: call.name,
            createdAt: Date.now(),
            toolStatus: 'denied'
          })
          await saveSession(session)
          emit('chat:tool', { sessionId, messageId: toolMessageId, call, status: 'denied', result: output })
          continue
        }
        emit('chat:tool', { sessionId, messageId: toolMessageId, call, status: 'running' })
        const toolStarted = Date.now()
        const outcome = await executeTool(call.name, call.args, {
          workspace,
          webFetch: settings.agent.webFetch,
          permission,
          signal: controller.signal
        })
        const output = truncate(outcome.output, 14000)
        session.messages.push({
          id: toolMessageId,
          role: 'tool',
          content: output,
          toolCallId: call.id,
          toolName: call.name,
          createdAt: Date.now(),
          toolStatus: outcome.ok ? 'done' : 'error'
        })
        await saveSession(session)
        seenCalls.set(signature, { output, count: 1 })
        emit('chat:tool', {
          sessionId,
          messageId: toolMessageId,
          call,
          status: outcome.ok ? 'done' : 'error',
          result: output,
          durationMs: Date.now() - toolStarted
        })
      }

      if (loopGuardTripped) {
        // En vez de terminar con un aviso seco, se pide un último turno SIN
        // herramientas para que resuma lo que ya hizo: el trabajo suele estar hecho.
        const closingId = uid('msg_')
        let closing = ''
        try {
          const sender = batched(sessionId, closingId)
          const summary = await streamChat({
            messages: trimHistory(
              [
                ...toEngineMessages(session, textProtocol, settings.agent.systemExtra, permission),
                {
                  role: 'user',
                  content:
                    'No uses ninguna herramienta más. Resume en dos o tres líneas qué has hecho y qué archivos has creado o modificado, o di que no pudiste.'
                }
              ],
              settings.engine.ctxSize,
              settings.agent.maxTokens
            ),
            temperature: settings.agent.temperature,
            maxTokens: 320,
            sampling,
            signal: controller.signal,
            onContent: sender.content
          })
          sender.stop()
          closing = summary.content.trim()
        } catch {
          // si el resumen falla, queda el aviso de abajo
        }
        const notice =
          'El modelo se ha quedado repitiendo la misma herramienta y he detenido el bucle. Prueba a reformular la petición o usa un modelo algo más grande.'
        const content = closing ? `${closing}\n\n_${notice}_` : notice
        const loopMessage: ChatMessage = {
          id: closingId,
          role: 'assistant',
          content,
          createdAt: Date.now()
        }
        session.messages.push(loopMessage)
        await saveSession(session)
        emit('chat:done', {
          sessionId,
          messageId: loopMessage.id,
          content,
          steps: totalSteps,
          durationMs: Date.now() - started
        })
        return
      }
    }

    const note = `He alcanzado el límite de ${maxSteps} pasos sin terminar. Revisa el progreso o pídeme que continúe.`
    const finalMessage: ChatMessage = {
      id: uid('msg_'),
      role: 'assistant',
      content: note,
      createdAt: Date.now()
    }
    session.messages.push(finalMessage)
    await saveSession(session)
    emit('chat:done', {
      sessionId,
      messageId: finalMessage.id,
      content: lastContent ? `${lastContent}\n\n${note}` : note,
      steps: totalSteps,
      durationMs: Date.now() - started
    })
  } catch (err) {
    const aborted = controller.signal.aborted
    const message = aborted ? 'Generación cancelada.' : err instanceof Error ? err.message : String(err)
    if (!aborted) log('error', 'Error en el agente', message)
    // Al detener una generación no es un error: se deja una nota neutra.
    const errorMessage: ChatMessage = {
      id: uid('msg_'),
      role: 'assistant',
      content: aborted ? '*Generación detenida.*' : '',
      createdAt: Date.now(),
      error: aborted ? undefined : message
    }
    session.messages.push(errorMessage)
    await saveSession(session)
    emit('chat:done', {
      sessionId,
      messageId: errorMessage.id,
      content: '',
      steps: totalSteps,
      durationMs: Date.now() - started,
      aborted,
      error: aborted ? undefined : message
    })
  }
}

export function describeTools(): string {
  return Object.values(TOOLS).map((t) => `- ${t.name}: ${t.description}`).join('\n')
}

export function workspaceLabel(workspace: string): string {
  return path.basename(workspace) || workspace
}
