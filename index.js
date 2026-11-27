import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, watch, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'

import z from '@deepseek-ai/schemastery'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { notifyHiddenChanged, registerLlamaRoute } from './adapter.js'

const ENTRY_ID = 'llama-cpp-provider'

const REMOTE_NS = 'llamaCpp'
const LOG_FILE = join(homedir(), '.dsh', 'llama-cpp', 'llama-server.log')
const SETTINGS_FILE = join(homedir(), '.dsh', 'llama-cpp', 'settings.json')

function readSettings() {
  try { const v = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
function writeSettings(patch) {
  const next = { ...readSettings(), ...patch }
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true })
  if (Object.keys(next).length) writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2) + '\n')
  else { try { unlinkSync(SETTINGS_FILE) } catch {} }
}
// PID of the llama-server we started. On POSIX it leads its own process group,
// so the router and the model instances it spawns are stopped together, and a
// server left over from an earlier run (DSH killed, plugin removed) is found.
const PID_FILE = join(homedir(), '.dsh', 'llama-cpp', 'server.pid')
const WIN = process.platform === 'win32'

function treeAlive(pid) {
  try { process.kill(WIN ? pid : -pid, 0); return true } catch (e) { return e?.code === 'EPERM' }
}

function killTree(pid, sig) {
  if (!pid) return
  if (WIN) {
    try { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {}) } catch {}
    return
  }
  try { process.kill(-pid, sig) } catch { try { process.kill(pid, sig) } catch {} }
}

function readPid() {
  try { const n = parseInt(readFileSync(PID_FILE, 'utf8'), 10); return n > 0 ? n : undefined } catch { return undefined }
}

function clearPid(pid) {
  if (pid !== undefined && readPid() !== pid) return
  try { unlinkSync(PID_FILE) } catch {}
}

// Stop a llama-server tree recorded by an earlier run, then wait for it to go.
async function killStale(logger) {
  const pid = readPid()
  if (!pid) return
  if (!treeAlive(pid)) { clearPid(pid); return }
  logger.info(`llama.cpp: stopping llama-server left over from an earlier run (pid ${pid})`)
  killTree(pid, 'SIGTERM')
  for (let i = 0; i < 50 && treeAlive(pid); i++) await new Promise(r => setTimeout(r, 100))
  if (treeAlive(pid)) killTree(pid, 'SIGKILL')
  clearPid(pid)
}
/** The llama.cpp folder (or executable) picked on the detail page, if any. */
function readCustom() {
  try { const v = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')).llamaPath; return typeof v === 'string' && v.trim() ? v.trim() : undefined } catch { return undefined }
}

/** Open the server log, replacing the previous run's output. */
function openServerLog(logger) {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true })
    const stream = createWriteStream(LOG_FILE, { flags: 'w' })
    stream.on('error', err => logger.debug(`llama.cpp: log file error: ${err?.message ?? err}`))
    return stream
  } catch (err) {
    logger.debug(`llama.cpp: cannot open ${LOG_FILE}: ${err?.message ?? err}`)
  }
}
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** Where a path came from, so the Models card can explain it. */
function locate(configured, detect) {
  if (configured) return { path: configured, source: 'config', exists: existsSync(configured) }
  const found = detect()
  return found ? { path: found, source: 'auto', exists: true } : { path: '', source: 'none', exists: false }
}

/** Expand a leading ~ (GUI apps get values like "~/x" verbatim). */
const expandHome = p => (p === '~' ? homedir() : p.replace(/^~(?=[\/])/, homedir()))

/**
 * DSH_LLAMA_CPP_PATH may name the executable itself or a llama.cpp folder:
 * look for llama-server / llama in it and in build/bin, bin, build/bin/Release.
 */
function resolveLlamaPath(value) {
  const p = expandHome(value)
  let st
  try { st = statSync(p) } catch { return undefined }
  if (st.isFile()) return isExecutable(p) ? p : undefined
  if (!st.isDirectory()) return undefined
  const names = isWin ? ['llama-server.exe', 'llama.exe'] : ['llama-server', 'llama']
  for (const sub of ['', join('build', 'bin'), 'bin', join('build', 'bin', 'Release')]) {
    for (const name of names) {
      const file = join(p, sub, name)
      if (isExecutable(file)) return file
    }
  }
  return undefined
}

/** If the env var is set, report it (and whether it points to a real file); else auto-detect. */
function locateEnv(name, detect) {
  const raw = process.env[name]?.trim()
  if (!raw) return locate('', detect)
  if (name === 'DSH_LLAMA_CPP_PATH') {
    const found = resolveLlamaPath(raw)
    return { path: found ?? expandHome(raw), source: 'env', env: name, exists: !!found }
  }
  const p = expandHome(raw)
  let isFile = false
  try { isFile = statSync(p).isFile() } catch {}
  return { path: p, source: 'env', env: name, exists: isFile }
}

/** Where llama.cpp looks for models.user.ini by default (created on first save). */
function defaultPresetPath() {
  return process.platform === 'win32' ? join(homedir(), '.llama', 'models.user.ini') : join(homedir(), '.config', 'llama', 'models.user.ini')
}

function customInfo() {
  const c = readCustom()
  if (!c) return undefined
  const f = resolveLlamaPath(c)
  return { path: f ?? c, dir: c, source: 'custom', exists: !!f }
}

/** Read-only facts the Models card shows under llama.cpp. */
function makeInfoService(getConfig, onCreated, onBinaryChanged, getBaseURL) {
  class LlamaCppInfo extends TypertRemoteService {
    constructor(ctx) { super(ctx, REMOTE_NS) }
    getInfo() {
      const config = getConfig()
      return {
        platform: process.platform,
        binary: customInfo() ?? locateEnv('DSH_LLAMA_CPP_PATH', detectBinary),
        preset: locateEnv('LLAMA_ARG_MODELS_PRESET', detectPreset),
      }
    }
    /** The models-preset file the server uses (the one the watcher follows). */
    readPreset() {
      const env = process.env.LLAMA_ARG_MODELS_PRESET?.trim()
      const file = env || detectPreset() || defaultPresetPath()
      let text = '', exists = false
      try { text = readFileSync(file, 'utf8'); exists = true } catch {}
      return { path: file, exists, envMissing: !!env && !exists, text }
    }
    /** Save the preset; the file watcher then reloads the model list. */
    writePreset(text) {
      if (typeof text !== 'string') return { ok: false, error: 'text must be a string' }
      const env = process.env.LLAMA_ARG_MODELS_PRESET?.trim()
      const file = env || detectPreset() || defaultPresetPath()
      const created = !existsSync(file)
      if (env && created) return { ok: false, error: `LLAMA_ARG_MODELS_PRESET file not found: ${file}` }
      try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text, 'utf8') }
      catch (err) { return { ok: false, error: String(err?.message ?? err) } }
      if (created) onCreated?.(file)
      return { ok: true, path: file, created }
    }
    /** Use a llama.cpp folder (or executable) picked on the detail page. */
    setLlamaPath(path) {
      if (typeof path !== 'string' || !path.trim()) return { ok: false, error: 'no path' }
      const found = resolveLlamaPath(path.trim())
      if (!found) return { ok: false, error: 'not found' }
      try { mkdirSync(dirname(SETTINGS_FILE), { recursive: true }); writeSettings({ llamaPath: path.trim() }) }
      catch (err) { return { ok: false, error: String(err?.message ?? err) } }
      onBinaryChanged?.('custom llama.cpp path set')
      return { ok: true, path: found }
    }
    /** Back to DSH_LLAMA_CPP_PATH or auto-detection. */
    /** Every model llama-server lists, and whether it is hidden from the picker. */
    async listModels() {
      const hidden = new Set(Array.isArray(readSettings().hiddenModels) ? readSettings().hiddenModels : [])
      try {
        const res = await fetch(getBaseURL() + '/models', { signal: AbortSignal.timeout(3000) })
        const body = await res.json()
        const ids = (body?.data ?? []).map(x => x?.id).filter(Boolean)
        return { ok: true, models: ids.map(id => ({ id, hidden: hidden.has(id) })) }
      } catch (err) {
        return { ok: false, error: String(err?.message ?? err), models: [...hidden].map(id => ({ id, hidden: true })) }
      }
    }
    /** Save the models hidden from the picker (settings.json hiddenModels). */
    setHiddenModels(ids) {
      const list = Array.isArray(ids) ? [...new Set(ids.filter(x => typeof x === 'string'))] : []
      writeSettings({ hiddenModels: list.length ? list : undefined })
      notifyHiddenChanged()
      return { ok: true, hidden: list }
    }
    clearLlamaPath() {
      try { writeSettings({ llamaPath: undefined }) } catch {}
      onBinaryChanged?.('custom llama.cpp path cleared')
      return { ok: true }
    }
    /** The last 200 lines of this run's llama-server output. */
    readLog() {
      try {
        const st = statSync(LOG_FILE)
        const lines = readFileSync(LOG_FILE, 'utf8').split(/\r?\n/)
        const max = 200
        return { path: LOG_FILE, exists: true, mtime: st.mtimeMs, truncated: lines.length > max, text: lines.slice(-max).join('\n') }
      } catch {
        return { path: LOG_FILE, exists: false, text: '' }
      }
    }
  }
  Object.defineProperty(LlamaCppInfo.prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze({ version: 1, methods: Object.freeze([Object.freeze({ method: 'getInfo', invocation: Object.freeze({ kind: 'direct' }) }), Object.freeze({ method: 'readLog', invocation: Object.freeze({ kind: 'direct' }) }), Object.freeze({ method: 'readPreset', invocation: Object.freeze({ kind: 'direct' }) }), Object.freeze({ method: 'writePreset', invocation: Object.freeze({ kind: 'direct' }) }), Object.freeze({ method: 'setLlamaPath', invocation: Object.freeze({ kind: 'direct' }) }), Object.freeze({ method: 'clearLlamaPath', invocation: Object.freeze({ kind: 'direct' }) }), Object.freeze({ method: 'listModels', invocation: Object.freeze({ kind: 'direct' }) }), Object.freeze({ method: 'setHiddenModels', invocation: Object.freeze({ kind: 'direct' }) })]) }),
  })
  return LlamaCppInfo
}

const isWin = process.platform === 'win32'

export const Config = z.object({
  autostart: z.boolean().default(true),
  apiKey: z.string(),
  // Volatile on purpose: the settings service only exposes entries that carry
  // a volatile field, and the Models page only lists a provider whose
  // settingsNs it exposes. Edited in place, no plugin restart.
  hiddenModels: z.array(z.string()).default([]).volatile(),
})

/** Read a field that may be a volatile reference. */
const val = (config, key) => {
  const v = config[key]
  return v && typeof v === 'object' && typeof v.get === 'function' ? v.get() : v
}
const HOST = '127.0.0.1'
const PORT = 19931
const DISPLAY_NAME = 'llama.cpp'

function isExecutable(file) {
  try { return statSync(file).isFile() } catch { return false }
}

/** Find llama-server or llama on PATH, then in common install dirs. */
export function detectBinary() {
  // An explicit path wins over everything else.
  // A folder picked on the detail page wins, then DSH_LLAMA_CPP_PATH.
  const custom = readCustom()
  if (custom) return resolveLlamaPath(custom)
  const override = process.env.DSH_LLAMA_CPP_PATH?.trim()
  // Set but invalid: don't fall back, so the card and the running server agree.
  if (override) return resolveLlamaPath(override)
  const names = isWin ? ['llama-server.exe', 'llama.exe'] : ['llama-server', 'llama']
  const dirs = [
    ...(process.env.PATH ?? '').split(delimiter).filter(Boolean),
    join(homedir(), '.local', 'bin'),
    join(homedir(), '.llama-app'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    // install.ps1 puts llama.exe here (normally already on PATH).
    ...(isWin && process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps')] : []),
  ]
  for (const name of names) {
    for (const dir of dirs) {
      const file = join(dir, name)
      if (isExecutable(file)) return file
    }
  }
  return undefined
}

export function detectPreset() {
  // A user-set LLAMA_ARG_MODELS_PRESET wins; llama-server reads it itself.
  const override = process.env.LLAMA_ARG_MODELS_PRESET?.trim()
  if (override) return override
  const candidates = [
    join(homedir(), '.config', 'llama', 'models.user.ini'),
    // Llama for Windows (ggml-org/Llama-Windows UserModelOverrides.cs):
    // %USERPROFILE%\.llama\models.user.ini
    join(homedir(), '.llama', 'models.user.ini'),
    join(homedir(), 'models.user.ini'),
  ]
  return candidates.find(f => existsSync(f))
}

async function healthy(host, port) {
  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch { return false }
}

export function apply(ctx, config = {}) {
  // Fixed endpoint: llama serve's default port 9931 with a leading 1.
  const host = HOST
  const port = PORT
  const baseURL = `http://${host}:${port}/v1`

  // Read-only Remote the Models card uses to show where llama was found.
  ctx.plugin(makeInfoService(() => config, file => presetCreated(file), why => restartServer(why), () => baseURL))

  // Register llama.cpp as this plugin's own provider route. The llm service
  // may not exist yet at boot, so wait for it.
  ctx.inject(['llm'], async ctx => {
    try {
      await registerLlamaRoute(ctx, {
        baseURL,
        displayName: DISPLAY_NAME,
        settingsNs: ctx.fiber?.entry?.options?.id || ENTRY_ID,
        settingsFile: SETTINGS_FILE,
        apiKey: config.apiKey,
      })
    } catch (err) {
      ctx.logger.warn(`llama.cpp: could not register the provider: ${err?.message ?? err}`)
    }
  })
  if (config.autostart === false) return

  let child
  let stopped = false

  const start = async () => {
    if (stopped) return
    await killStale(ctx.logger)
    if (await healthy(host, port)) {
      ctx.logger.info(`llama.cpp: server already running at ${host}:${port}, reusing it`)
      return
    }
    if (stopped) return
    const binary = detectBinary()
    if (!binary) {
      ctx.logger.warn('llama.cpp: no llama-server or llama executable found; install llama.cpp and restart DSH')
      return
    }
    const preset = detectPreset()
    const args = []
    // The unified `llama` CLI takes a subcommand; `llama-server` does not.
    if (/^llama(\.exe)?$/i.test(basename(binary))) args.push('serve')
    args.push('--host', host, '--port', String(port))
    // One model loaded at a time, unless the user set LLAMA_ARG_MODELS_MAX.
    if (!process.env.LLAMA_ARG_MODELS_MAX?.trim()) args.push('--models-max', '1')
    // When the preset came from LLAMA_ARG_MODELS_PRESET, llama-server reads it itself.
    if (preset && !process.env.LLAMA_ARG_MODELS_PRESET?.trim()) args.push('--models-preset', preset)

    ctx.logger.info(`llama.cpp: starting ${binary} ${args.join(' ')}`)
    // An invalid LLAMA_ARG_MODELS_PRESET would stop llama-server from starting:
    // drop it so the server starts with default settings (the card flags it in red).
    const env = { ...process.env }
    const envPreset = env.LLAMA_ARG_MODELS_PRESET?.trim()
    if (envPreset) {
      let ok = false
      try { ok = statSync(envPreset).isFile() } catch {}
      if (!ok) {
        delete env.LLAMA_ARG_MODELS_PRESET
        ctx.logger.warn(`llama.cpp: LLAMA_ARG_MODELS_PRESET file not found (${envPreset}); starting without a preset`)
      }
    }
    const log = openServerLog(ctx.logger)
    log?.write(`=== ${new Date().toISOString()} starting ${binary} ${args.join(' ')}\n`)
    child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env, detached: !WIN })
    const pid = child.pid
    if (pid) {
      try { mkdirSync(dirname(PID_FILE), { recursive: true }); writeFileSync(PID_FILE, String(pid) + '\n') } catch {}
    }
    const relay = chunk => {
      log?.write(chunk)
      for (const line of String(chunk).split(/\r?\n/)) {
        if (!line.trim()) continue
        // Surface failures in the DSH log; everything else stays at debug.
        if (/\b(error|failed|fatal)\b/i.test(line)) ctx.logger.warn(`llama.cpp: ${line}`)
        else ctx.logger.debug(`llama.cpp: ${line}`)
      }
    }
    child.stdout.on('data', relay)
    child.stderr.on('data', relay)
    child.on('error', err => ctx.logger.error(`llama.cpp: failed to start: ${err.message}`))
    child.on('exit', (code, signal) => {
      if (!stopped) ctx.logger.warn(`llama.cpp: server exited (code ${code}, signal ${signal}); see ${LOG_FILE}`)
      log?.end(`=== ${new Date().toISOString()} exited (code ${code}, signal ${signal})\n`)
      // Instances the router spawned may outlive it: stop the rest of the group.
      if (pid && treeAlive(pid)) killTree(pid, 'SIGTERM')
      if (pid && !treeAlive(pid)) clearPid(pid)
      child = undefined
    })
  }

  // Watch the preset file and ask the router to re-read it in place
  // (GET /models?reload=1, what Llama.app does when its menu opens).
  // Watches the folder, not the file: editors often save by replacing it.
  const watchPreset = () => {
    const file = detectPreset()
    if (!file) return () => {}
    const dir = dirname(file), name = basename(file)
    const read = () => { try { return readFileSync(file, 'utf8') } catch { return undefined } }
    let last = read()
    let timer, busy = false, again = false
    const reload = async () => {
      if (busy) { again = true; return }
      const text = read()
      if (text === undefined) {
        ctx.logger.warn(`llama.cpp: ${file} is missing; keeping the current model list`)
        return
      }
      if (text === last) return
      busy = true
      try {
        if (!(await healthy(host, port))) return // not running: it reads the file on next start
        const res = await fetch(`http://${host}:${port}/models?reload=1`, { signal: AbortSignal.timeout(10000) })
        if (res.ok) { last = text; ctx.logger.info(`llama.cpp: reloaded model list from ${file}`) }
        else ctx.logger.warn(`llama.cpp: model reload failed (HTTP ${res.status})`)
      } catch (err) {
        ctx.logger.warn(`llama.cpp: model reload failed: ${err?.message ?? err}`)
      } finally {
        busy = false
        if (again) { again = false; reload() }
      }
    }
    let watcher
    try {
      watcher = watch(dir, (_event, f) => {
        if (f && String(f) !== name) return
        clearTimeout(timer)
        timer = setTimeout(reload, 300) // debounce: one save can fire several events
      })
      watcher.on('error', err => ctx.logger.debug(`llama.cpp: preset watch error: ${err?.message ?? err}`))
    } catch (err) {
      ctx.logger.debug(`llama.cpp: cannot watch ${dir}: ${err?.message ?? err}`)
      return () => {}
    }
    return () => { clearTimeout(timer); watcher.close() }
  }

  // A preset saved for the first time: llama-server only reads --models-preset
  // at start, so restart the server we own and start watching the new file.
  let unwatch = () => {}
  // The executable changed: restart the server we own with the new one.
  function restartServer(why) {
    if (stopped) return
    ctx.logger.info(`llama.cpp: ${why}; restarting llama-server`)
    const c = child
    if (c && c.exitCode === null) {
      c.once('exit', () => { if (!stopped) start().catch(err => ctx.logger.error(err)) })
      killTree(c.pid, 'SIGTERM')
    } else start().catch(err => ctx.logger.error(err))
  }

  function presetCreated(file) {
    if (stopped) return
    unwatch()
    unwatch = watchPreset()
    const c = child
    if (c && c.exitCode === null) {
      ctx.logger.info(`llama.cpp: created ${file}; restarting llama-server`)
      c.once('exit', () => { if (!stopped) start().catch(err => ctx.logger.error(err)) })
      killTree(c.pid, 'SIGTERM')
    } else ctx.logger.warn(`llama.cpp: created ${file}; restart DSH so llama-server reads it`)
  }

  // Last resort when DSH quits without disposing plugins.
  const onExit = () => { if (child && child.exitCode === null) killTree(child.pid, 'SIGTERM') }
  process.once('exit', onExit)

  ctx.effect(() => {
    start().catch(err => ctx.logger.error(err))
    unwatch = watchPreset()
    return () => {
      process.removeListener('exit', onExit)
      unwatch()
      stopped = true
      if (child && child.exitCode === null) {
        const c = child
        killTree(c.pid, 'SIGTERM')
        setTimeout(() => { if (c.exitCode === null) { killTree(c.pid, 'SIGKILL'); clearPid(c.pid) } }, 5000).unref?.()
      }
    }
  })
}
