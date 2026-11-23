/**
 * Traducciones de la interfaz (fase 1: renderer).
 *
 * Se usa el texto en español como clave: `t('Nueva conversación')`. Así el
 * código sigue siendo legible y no hay que inventar identificadores; el
 * diccionario inglés traduce esas claves. Si falta una traducción se muestra
 * el español, nunca una clave vacía.
 *
 * El proceso principal (mensajes de herramientas, errores del motor y prompt
 * del sistema) sigue en español: es la fase 2.
 */
export type Lang = 'es' | 'en'

const EN: Record<string, string> = {
  // --- Sidebar ---
  Chat: 'Chat',
  Modelos: 'Models',
  Ajustes: 'Settings',
  'Nueva conversación': 'New conversation',
  'Sin conversaciones todavía.': 'No conversations yet.',
  'Eliminar conversación': 'Delete conversation',
  'Cargando modelo…': 'Loading model…',
  'Error del motor': 'Engine error',
  'Motor detenido': 'Engine stopped',
  'Gestionar': 'Manage',
  'modelo(s) local(es)': 'local model(s)',
  'Descargar un modelo': 'Download a model',
  'Elegir carpeta de proyecto': 'Choose project folder',
  'Cambiar carpeta': 'Change folder',

  // --- Composer ---
  'Selecciona un modelo y una carpeta de proyecto para empezar…':
    'Select a model and a project folder to get started…',
  'Pide un cambio, una explicación o una tarea. Shift+Enter para nueva línea.':
    'Ask for a change, an explanation or a task. Shift+Enter for a new line.',
  'Pegar del portapapeles': 'Paste from clipboard',
  'Pegar': 'Paste',
  'Enviar': 'Send',
  'Detener': 'Stop',
  'El modelo y las herramientas se ejecutan en tu equipo. Nada se envía a la nube.':
    'The model and tools run on your machine. Nothing is sent to the cloud.',

  // --- Chat ---
  'Agente local listo para programar': 'Local agent ready to code',
  'Abre una carpeta de proyecto, elige un modelo GGUF y pídeme cambios reales en el código. Puedo leer, editar, buscar y ejecutar comandos.':
    'Open a project folder, choose a GGUF model and ask for real code changes. I can read, edit, search and run commands.',
  'Explora el proyecto y explícame su arquitectura.': 'Explore the project and explain its architecture.',
  'Busca posibles bugs y propone correcciones.': 'Look for bugs and propose fixes.',
  'Añade tests para el módulo principal.': 'Add tests for the main module.',
  'Revisa el último cambio y resume su impacto.': 'Review the last change and summarise its impact.',
  'Pensando…': 'Thinking…',
  'Generando respuesta…': 'Generating response…',
  'Razonamiento del modelo': 'Model reasoning',
  'Copiar': 'Copy',
  'Copiar respuesta': 'Copy response',
  '✓ Copiado': '✓ Copied',
  'Detener generación': 'Stop generation',
  '{n} de {max} pasos': 'step {n} of {max}',
  'Trabajando… {n}s': 'Working… {n}s',

  // --- Métricas ---
  'Ver el resumen de métricas de esta conversación': 'Show this conversation’s metrics summary',
  respuesta: 'response',
  respuestas: 'responses',
  'tok/s media': 'tok/s avg',
  'en total': 'total',
  Detalles: 'Details',
  Ocultar: 'Hide',
  'Tokens generados': 'Generated tokens',
  'Velocidad media': 'Average speed',
  'Tokens de prompt': 'Prompt tokens',
  'Prompt por segundo': 'Prompt tokens/s',
  'Primer token (media)': 'First token (avg)',
  'Tiempo acumulado': 'Total time',
  Modelo: 'Model',
  Backend: 'Backend',
  'Exportar esta conversación (CSV)': 'Export this conversation (CSV)',
  'Exportar todas (CSV)': 'Export all (CSV)',
  'Exportando…': 'Exporting…',
  'Exportación cancelada': 'Export cancelled',
  'Métricas exportadas: {path}': 'Metrics exported: {path}',
  '1er tok': '1st tok',
  prompt: 'prompt',

  // --- Herramientas ---
  'en cola': 'queued',
  ejecutando: 'running',
  error: 'error',
  denegado: 'denied',
  'Ejecutando…': 'Running…',
  'Sin salida todavía.': 'No output yet.',
  'Copiar salida': 'Copy output',

  // --- Modelos ---
  'Descarga modelos GGUF desde HuggingFace y guárdalos en tu carpeta. Todo se ejecuta en local con llama.cpp.':
    'Download GGUF models from HuggingFace into your folder. Everything runs locally with llama.cpp.',
  'GPU completa': 'Full GPU',
  'Memoria unificada': 'Unified memory',
  'GPU + CPU': 'GPU + CPU',
  CPU: 'CPU',
  'No cabe': 'Does not fit',
  'Falta el motor llama.cpp': 'llama.cpp engine missing',
  'Instalar motor': 'Install engine',
  'Instalando…': 'Installing…',
  Equipo: 'Machine',
  'RAM / VRAM': 'RAM / VRAM',
  'Aceleración': 'Acceleration',
  '· fijada': '· fixed',
  'Espacio libre': 'Free space',
  Descargas: 'Downloads',
  Cancelar: 'Cancel',
  Instalados: 'Installed',
  Recomendados: 'Recommended',
  'Buscar en HuggingFace': 'Search HuggingFace',
  'Carpeta de modelos:': 'Models folder:',
  'Abrir carpeta': 'Open folder',
  'Importar GGUF…': 'Import GGUF…',
  'No hay modelos instalados. Ve a': 'No models installed. Go to',
  'para descargar el que mejor encaje con tu equipo.':
    'to download the one that best fits your machine.',
  'en uso': 'in use',
  Revelar: 'Reveal',
  Eliminar: 'Delete',
  Usar: 'Use',
  instalado: 'installed',
  código: 'code',
  tools: 'tools',
  'Usar modelo': 'Use model',
  gated: 'gated',
  'Cargando archivos…': 'Loading files…',
  'Este repo no tiene GGUF sueltos visibles.': 'This repo has no visible single GGUF files.',
  Descargar: 'Download',
  'Preparando…': 'Preparing…',
  'Buscando…': 'Searching…',
  'Ver archivos': 'View files',
  'Cerrar': 'Close',
  'Detectada en tu equipo': 'Detected on your machine',
  'Configurada en Ajustes': 'Set in Settings',
  'tu sistema': 'your system',
  'automático': 'automatic',
  'Modelo eliminado': 'Model deleted',
  'Sin resultados en HuggingFace para esa búsqueda.': 'No HuggingFace results for that search.',
  'Se muestran los repositorios GGUF con más descargas. Al abrir uno verás sus archivos y podrás descargar la cuantización que quieras.':
    'Showing the most downloaded GGUF repositories. Open one to see its files and download any quantisation.',
  'Buscar modelos GGUF, p. ej. qwen2.5-coder, deepseek, coder': 'Search GGUF models, e.g. qwen2.5-coder, deepseek, coder',
  Buscar: 'Search',
  'Calculado con {ram} GB de RAM y {vram} GB de VRAM. Las velocidades son estimaciones orientativas.':
    'Calculated with {ram} GB RAM and {vram} GB VRAM. Speeds are rough estimates.',
  descargas: 'downloads',
  likes: 'likes',
  partes: 'parts',
  '¿Eliminar {name} ({size}) del disco?': 'Delete {name} ({size}) from disk?',
  'Descarga iniciada: {label}': 'Download started: {label}',
  'Descargando {label} ({size})': 'Downloading {label} ({size})',
  'Descargar {size}': 'Download {size}',

  // --- Ajustes ---
  'Todo se guarda en tu equipo. Los cambios del motor se aplican al recargar el modelo.':
    'Everything is saved on your machine. Engine changes apply when the model reloads.',
  General: 'General',
  'Carpeta de modelos': 'Models folder',
  'Cambiar…': 'Change…',
  Abrir: 'Open',
  Tema: 'Theme',
  Oscuro: 'Dark',
  Claro: 'Light',
  'Token de HuggingFace (opcional)': 'HuggingFace token (optional)',
  'Se guarda localmente sin cifrar en settings.json. No se envía a ningún servidor propio.':
    'Stored locally unencrypted in settings.json. It is never sent to any server of ours.',
  'Motor de inferencia (llama.cpp)': 'Inference engine (llama.cpp)',
  Estado: 'Status',
  Binario: 'Binary',
  Versión: 'Version',
  'Detener motor': 'Stop engine',
  'Automático (detectar)': 'Automatic (detect)',
  'Debe coincidir con el binario instalado.': 'Must match the installed binary.',
  'Contexto (tokens)': 'Context (tokens)',
  'Más contexto = más RAM/VRAM. 16K es un buen equilibrio para programar.':
    'More context = more RAM/VRAM. 16K is a good balance for coding.',
  'Capas en GPU': 'GPU layers',
  '-1 = automático (todas si hay GPU). 0 = solo CPU.': '-1 = automatic (all if a GPU is present). 0 = CPU only.',
  'Hilos de CPU': 'CPU threads',
  '0 = automático (75 % de los núcleos).': '0 = automatic (75% of cores).',
  'Puerto local': 'Local port',
  'Si está ocupado se usará el siguiente libre.': 'If busy, the next free one is used.',
  'Argumentos extra': 'Extra arguments',
  'Origen del binario': 'Binary source',
  'Gestionado por la app': 'Managed by the app',
  'Usar mi llama-server': 'Use my llama-server',
  'Elegir…': 'Choose…',
  Agente: 'Agent',
  'Permisos del agente': 'Agent permissions',
  'Solo pensar (leer y analizar)': 'Think only (read and analyse)',
  'Escribir en el proyecto': 'Write inside the project',
  'Control total (cualquier ruta)': 'Full control (any path)',
  'Aprobación de comandos': 'Command approval',
  'Pedir permiso antes de ejecutar comandos': 'Ask before running commands',
  'Automático (sin preguntar)': 'Automatic (never ask)',
  'Las lecturas y ediciones dentro del proyecto no piden permiso; los comandos sí.':
    'Reads and edits inside the project need no approval; commands do.',
  'Máximo de pasos por mensaje': 'Max steps per message',
  'Cada paso puede incluir varias herramientas. 20-30 es razonable.':
    'Each step may run several tools. 20-30 is reasonable.',
  Temperatura: 'Temperature',
  '0.1-0.3 para código; valores altos improvisan más.': '0.1-0.3 for code; higher values improvise more.',
  'Máximo de tokens por respuesta': 'Max tokens per response',
  'Instrucciones extra del sistema': 'Extra system instructions',
  'Permitir consultas web (web_fetch)': 'Allow web requests (web_fetch)',
  'El agente puede leer documentación pública por HTTP(S).':
    'The agent can read public documentation over HTTP(S).',
  'Comandos siempre permitidos': 'Always-allowed commands',
  'Ninguno. Se añaden al pulsar «Permitir siempre».': 'None. They are added when you press “Always allow”.',
  Limpiar: 'Clear',
  Sistema: 'System',
  'SO / arquitectura': 'OS / architecture',
  'Datos de usuario': 'User data',
  'Abrir logs': 'Open logs',
  'Abrir modelos': 'Open models',
  'Restablecer ajustes': 'Reset settings',
  'Carpeta donde guardar los modelos': 'Folder to store models',
  'Carpeta de modelos actualizada': 'Models folder updated',
  'Selecciona llama-server': 'Select llama-server',
  'Ejecutable configurado': 'Configured executable',
  'cargando modelo…': 'loading model…',
  'no instalado': 'not installed',
  'Actualizar llama.cpp': 'Update llama.cpp',
  'Instalar llama.cpp': 'Install llama.cpp',
  'No puede escribir archivos ni ejecutar comandos: solo lee y propone cambios.':
    'It cannot write files or run commands: it only reads and proposes changes.',
  'Puede escribir fuera del proyecto, pero siempre te pedirá permiso antes de hacerlo.':
    'It can write outside the project, but will always ask for your approval first.',
  'Solo modifica archivos dentro de la carpeta del proyecto.':
    'It only changes files inside the project folder.',
  'sin GPU dedicada': 'no dedicated GPU',
  '¿Restablecer todos los ajustes? Los modelos descargados no se borran.':
    'Reset all settings? Downloaded models are not deleted.',
  'Ajustes restablecidos': 'Settings reset',
  Idioma: 'Language',
  'La interfaz cambia al instante. Los mensajes del motor y de las herramientas siguen en español.':
    'The interface switches immediately. Engine and tool messages remain in Spanish.',
  'Selecciona una carpeta': 'Select a folder',
  'Selecciona un archivo': 'Select a file',

  // --- Onboarding ---
  'Analizando tu equipo… (CPU, RAM, GPU y espacio libre)': 'Analysing your machine… (CPU, RAM, GPU and free space)',
  'Sin GPU dedicada': 'No dedicated GPU',
  desconocido: 'unknown',
  'Configurar más tarde': 'Configure later',
  '¿Dónde guardamos las cosas?': 'Where should we keep things?',
  'Los modelos ocupan varios GB. Elige una carpeta con espacio; puedes cambiarla después.':
    'Models take several GB. Pick a folder with free space; you can change it later.',
  'Quedan ~{gb} GB libres en ese disco (según la carpeta actual).':
    'About {gb} GB free on that disk (for the current folder).',
  'Se creará automáticamente si no existe.': 'It will be created automatically if it does not exist.',
  'Elige el repo o carpeta donde quieres trabajar': 'Choose the repo or folder you want to work in',
  'El agente nunca saldrá de esta carpeta. Puedes cambiarla en cualquier momento.':
    'The agent will never leave this folder. You can change it at any time.',
  'Carpeta para guardar los modelos': 'Folder to store models',
  'Carpeta del proyecto donde trabajará el agente': 'Project folder where the agent will work',
  Continuar: 'Continue',
  Atrás: 'Back',
  'Empezar': 'Start',
  'Omitir descarga': 'Skip download',
  'Instalar motor y descargar': 'Install engine and download',
  'Bienvenido a OpenPro Agente': 'Welcome to OpenPro Agente',
  'Tu agente de programación, 100 % en local': 'Your coding agent, 100% on your machine',

  // --- Errores y avisos (renderer) ---
  'Elige primero una carpeta de proyecto': 'Choose a project folder first',
  'Elige un modelo para empezar': 'Choose a model to start',
  'Selecciona un modelo GGUF antes de enviar un mensaje.':
    'Select a GGUF model before sending a message.',
  'Generación detenida': 'Generation stopped',
  '¿Eliminar esta conversación? No se puede deshacer.': 'Delete this conversation? This cannot be undone.',
  'Conversación eliminada': 'Conversation deleted',
  'Carpeta del proyecto actualizada': 'Project folder updated',
  'No se pudo leer el hardware del equipo ({error}). Las recomendaciones no estarán disponibles.':
    'Could not read the machine hardware ({error}). Recommendations will be unavailable.',
  'No se pudo cargar el modelo: {error}': 'Could not load the model: {error}',
  'No se pudo cargar el modelo': 'Could not load the model',
  'Error desconocido': 'Unknown error',
  'Cancelado': 'Cancelled',
  'Cancelado por el usuario': 'Cancelled by the user',
  'Permitir siempre': 'Always allow',
  'Permitir una vez': 'Allow once',
  'Denegar': 'Deny',
  'El agente quiere ejecutar un comando': 'The agent wants to run a command',
  'El agente quiere escribir fuera del proyecto': 'The agent wants to write outside the project',
  'Carpeta del proyecto (opcional)': 'Project folder (optional)',
  'Descarga completada': 'Download complete',
  'Elige tu modelo': 'Choose your model',
  'Empezar a usar': 'Start using it',
  'Modelo descargado. ¡Listo para empezar!': 'Model downloaded. Ready to start!',
  'No se pudo calcular una recomendación. Puedes instalar un modelo manualmente desde la pestaña Modelos.': 'Could not compute a recommendation. You can install a model manually from the Models tab.',
  'Paso {n} de {max}': 'Step {n} of {max}',
  'Recomendaciones según tu hardware. El motor llama.cpp se instala solo la primera vez.': 'Recommendations based on your hardware. The llama.cpp engine installs itself the first time.',
  'Un agente de programación que corre íntegramente en tu equipo: modelos GGUF de HuggingFace, motor llama.cpp y tus archivos. Sin cuentas ni nube.': 'A coding agent that runs entirely on your machine: GGUF models from HuggingFace, the llama.cpp engine and your files. No accounts, no cloud.',
  'media': 'avg',
  'Descargar {size} GB': 'Download {size} GB',
  'ahora': 'now',
  'hace {n} min': '{n} min ago',
  'hace {n} h': '{n} h ago',
  'hace {n} d': '{n} d ago',
  'en caché': 'cached',
  'Evaluación del prompt': 'Prompt evaluation',
  'Generación': 'Generation',
  'Pasos del agente': 'Agent steps',
  'Aquí se descargan los GGUF. Puedes usar un disco externo; asegúrate de que tenga espacio suficiente.': 'GGUF files are downloaded here. You can use an external drive; make sure it has enough free space.',
  'Conversaciones': 'Conversations',
  'Tú': 'You',
  'TÚ': 'YOU',
}

let current: Lang = 'es'

export function setLang(lang: Lang): void {
  current = lang === 'en' ? 'en' : 'es'
  if (typeof document !== 'undefined') document.documentElement.lang = current
}

export function getLang(): Lang {
  return current
}

/**
 * Traduce un texto de la interfaz. Acepta variables con `{nombre}`.
 * En español devuelve el texto tal cual (es el original).
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const base = current === 'en' ? (EN[text] ?? text) : text
  if (!vars) return base
  return base.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}

/** Atajo para saber si hay traducción (útil en pruebas). */
export function hasTranslation(text: string): boolean {
  return text in EN
}
