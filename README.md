# OpenPro Agente

Agente de programación **100 % local** para tu escritorio. Descarga modelos GGUF de HuggingFace, los ejecuta con **llama.cpp embebido** y trabaja sobre tus proyectos sin enviar código a ningún servidor.

- Sin cuentas, sin nube y sin telemetría.
- Motor propio: la app descarga el binario de llama.cpp adecuado para tu sistema y tu GPU.
- Modelos descargables desde la propia interfaz, con carpeta configurable.
- Recomendador de modelos según tu RAM, VRAM y espacio libre.
- Agente con herramientas: leer, escribir y editar archivos, buscar, listar, ejecutar comandos y consultar documentación web.
- Aprobación de comandos, permisos por nivel y sesiones persistentes.
- Métricas por respuesta: tokens, tokens/s, latencia del primer token y tiempo total, para comparar modelos.
- Resumen por conversación (totales y medias) y exportación a CSV de todas las métricas.
- UI en español, temas oscuro y claro.

> Estado: **beta**. La app funciona en Windows y el código incluye configuración para macOS y Linux; los instaladores de macOS/Linux aún no se han probado a fondo.

## Requisitos

- Windows 10/11, macOS 12+ o una distribución Linux moderna de 64 bits.
- 8 GB de RAM como mínimo (16 GB recomendable). Para modelos de 7B en adelante, 16-32 GB.
- GPU opcional. Con NVIDIA (CUDA), AMD (Vulkan/ROCm) o Apple Silicon (Metal) la inferencia es mucho más rápida; también funciona en CPU.
- Espacio en disco: entre 1 y 20 GB según el modelo que elijas.
- Para desarrollar: Node.js 22 o superior y npm.

## Inicio rápido (Windows)

1. Instala las dependencias la primera vez:

   ```powershell
   npm install
   ```

2. Haz doble clic en **`Abrir OpenPro.bat`**.

   El lanzador compila la app si hace falta, limpia la variable `ELECTRON_RUN_AS_NODE` (si está definida, Electron arranca como Node y la ventana no sale), inicia la aplicación con `--no-sandbox --disable-gpu` y comprueba que sigue viva. El registro queda en `abrir-openpro.log`.

3. En el asistente inicial:
   - revisa el hardware detectado;
   - elige la carpeta donde se guardarán los modelos;
   - acepta una recomendación (o elige otro modelo) y pulsa **Instalar motor y descargar**.

Cuando termine, elige la carpeta del proyecto y empieza a chatear.

También puedes arrancar desde consola:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run build
npx electron .
```

## Cómo se eligen los modelos

El catálogo es una lista curada de modelos GGUF con licencias y tamaños conocidos. Al abrir la app se detecta el hardware y se calcula qué cuantización cabe:

- **GPU**: el modelo cabe entero en la VRAM y se ejecuta con todas las capas en GPU.
- **Memoria unificada** (Apple Silicon): se usa el presupuesto de memoria compartida.
- **Híbrido**: parte en GPU y parte en CPU.
- **CPU**: cabe en RAM, pero será más lento.
- **No**: no cabe con un margen razonable.

El recomendador reserva alrededor de 4 GB de RAM para el sistema y no deja que el modelo acapare más del 72 % de la memoria. Después elige la mejor cuantización que quepa entera y, en modo híbrido/CPU, prioriza `Q4_K_M` por su equilibrio tamaño/calidad. La ficha de cada recomendación indica la velocidad estimada, los avisos de memoria y la licencia.

Consejo: en equipos de 8 GB, empieza por modelos de 1,5-3B en `Q4_K_M`. En 16 GB, un 7B `Q4_K_M` suele ser el mejor equilibrio para programar.

## Uso

- **Chat**: escribe la petición y el agente explorará el proyecto antes de tocar nada. Las lecturas y escrituras dentro de la carpeta del proyecto se ejecutan directamente; los comandos piden aprobación en el modo `ask`.
- **Modelos**: busca en HuggingFace, explora los archivos GGUF de un repo, descarga cuantizaciones, importa un `.gguf` local o elimina modelos.
- **Ajustes**: carpeta de modelos, token de HuggingFace (solo para repos privados/gated), backend, contexto, capas en GPU, hilos, argumentos extra, puerto, permisos del agente, temperatura, tokens máximos, instrucciones extra y allowlist de comandos.

Los lanzamientos largos muestran un contador «Pensando… N s». En CPU un modelo pequeño puede tardar entre segundos y varios minutos por respuesta; es normal.

### Métricas de cada respuesta

Debajo de cada respuesta aparece un pie con los números reales que reporta llama.cpp:

- **tokens generados** y **tokens/s** de generación (la velocidad a la que el modelo escribe).
- **1er tok**: latencia hasta el primer token, que incluye procesar todo el prompt (lo que más pesa en CPU).
- **tiempo total** de la llamada.
- **prompt**: tokens enviados (historial + instrucciones + herramientas) y su velocidad de evaluación.

Pasa el ratón por encima para ver el desglose completo (modelo, backend, tokens en caché y pasos del agente).
Es la forma más rápida de comparar dos modelos con la misma petición: mismos tokens de prompt, distinta velocidad y calidad.

### Resumen de la conversación y exportación

En la parte superior del chat hay una barra con los totales de la conversación: número de respuestas, tokens generados, velocidad media y tiempo acumulado. Al desplegarla («Detalles») se ven también los tokens de prompt, la media del primer token, el modelo y el backend usados.

Desde ese panel puedes exportar las métricas a **CSV**:

- **esta conversación**: una fila por respuesta;
- **todas**: todas las conversaciones, con su título.

Columnas: fecha, conversación, modelo, backend, tokens de prompt (y cuántos en caché), ms y tok/s del prompt, tokens generados, ms y tok/s de generación, ms del primer token, ms totales y pasos del agente. Se guarda en UTF-8 con BOM y separador `;` para abrirlo directamente en Excel en español.

### Permisos del agente

| Nivel | Comportamiento |
|---|---|
| `plan` | Solo lectura y razonamiento: no se ofrecen herramientas de escritura. |
| `workspace` | Por defecto. Solo opera dentro de la carpeta del proyecto. |
| `full` | Puede salir del proyecto, pero pide aprobación para escribir o ejecutar fuera. |

### Privacidad

- El motor escucha solo en `127.0.0.1`.
- Las conversaciones se guardan en tu disco (`%APPDATA%\openpro-agente\sessions` en Windows).
- El token de HuggingFace, si lo configuras, se guarda sin cifrar en `settings.json` y solo se usa para descargar modelos.
- La única función que sale a internet en tiempo de ejecución es `web_fetch`, que puedes desactivar en Ajustes.
- No hay telemetría ni servidores propios.

## Desarrollo

```powershell
npm install
npm run dev        # electron-vite con HMR
npm run typecheck  # TypeScript (main + renderer)
npm run build      # out/main, out/preload, out/renderer
npm start          # electron-vite preview
```

Estructura:

```
shared/types.ts          contrato entre main, preload y renderer
electron/main/           proceso principal: motor, descargas, agente, sesiones, IPC
electron/preload/        puente seguro (window.api, window.menu, window.clipboard)
src/renderer/src/        React: chat, modelos, ajustes, onboarding
Abrir OpenPro.bat        lanzador de Windows para doble clic
```

Notas técnicas:

- El binario de llama.cpp se descarga en `%APPDATA%\openpro-agente\engine\<tag>` y no se empaqueta con la app.
- `llama-server` se arranca con `--host 127.0.0.1`, `--jinja`, `--parallel 1` y un puerto libre a partir del 8790. La salud se comprueba en `/health`.
- Si la GPU falla (driver inestable, `device lost`), la app reintenta el modelo en CPU automáticamente.
- La UI usa renderizado por software (`app.disableHardwareAcceleration()`) para no depender de drivers gráficos inestables.
- Los eventos del agente viajan por IPC: `chat:delta`, `chat:step`, `chat:tool`, `chat:approval`, `chat:done`, `engine`, `download`, `engineInstall`, `log`.

## Instaladores

```powershell
npm run dist:win     # NSIS + portable (x64)
npm run dist:mac     # dmg (arm64 + x64)
npm run dist:linux   # AppImage + deb
```

La salida queda en `release/`. Para Windows, electron-builder usa `build/icon.ico`; para macOS y Linux, `build/icon.png` (1024×1024).

## Solución de problemas

- **No aparece ninguna ventana**: usa `Abrir OpenPro.bat` o borra `ELECTRON_RUN_AS_NODE` antes de `npx electron .`. Revisa `abrir-openpro.log` y `%APPDATA%\openpro-agente\logs\openpro.log`.
- **«No se puede escribir en la carpeta de modelos»**: elige otra carpeta en Ajustes (por ejemplo, dentro de tu perfil de usuario) o revisa los permisos de la unidad.
- **La GPU provoca errores o cierres**: pon el backend en `cpu` en Ajustes. En equipos con drivers antiguos es la opción más estable.
- **Va muy lento**: usa un modelo más pequeño o una cuantización menor (`Q4_K_M`, `Q4_0`), baja el contexto y cierra otras aplicaciones.
- **El modelo no usa herramientas**: prueba un modelo con tool calling nativo (Qwen2.5 Coder, LFM3, LFM2.5). Los modelos muy pequeños tienden a ignorar las instrucciones de herramientas.

## Modelos y licencias

El catálogo incluye familias como Qwen2.5 Coder, Qwen3, DeepSeek Coder, Codestral, Llama, Gemma y Liquid LFM3/LFM2.5. Cada modelo conserva **su propia licencia**, que se muestra en la ficha de la app; algunas (por ejemplo, LFM Open License) tienen condiciones de uso comercial. Revisa la licencia antes de usarlo en producción.

- Código de la app: Apache-2.0 (ver `LICENSE`).
- llama.cpp: licencia MIT.
- Modelos GGUF: la licencia de cada repositorio de HuggingFace.

## Estado y limitaciones

- No incluye fine-tuning (estilo Unsloth): solo inferencia y agente.
- Los instaladores de macOS/Linux están configurados pero no verificados.
- El agente no ejecuta comandos interactivos ni servidores en primer plano.
- En CPU, el prompt del sistema y los esquemas de herramientas suponen una parte importante del tiempo de respuesta.
