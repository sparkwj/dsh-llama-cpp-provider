import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, join } from 'node:path'

import z from '@deepseek-ai/schemastery'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

const REMOTE_NS = 'llamaCpp'
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** Where a path came from, so the Models card can explain it. */
function locate(configured, detect) {
  if (configured) return { path: configured, source: 'config', exists: existsSync(configured) }
  const found = detect()
  return found ? { path: found, source: 'auto', exists: true } : { path: '', source: 'none', exists: false }
}

/** Read-only facts the Models card shows under Llama.cpp. */
function makeInfoService(getConfig) {
  class LlamaCppInfo extends TypertRemoteService {
    constructor(ctx) { super(ctx, REMOTE_NS) }
    getInfo() {
      const config = getConfig()
      return {
        platform: process.platform,
        binary: locate('', detectBinary),
        preset: locate('', detectPreset),
      }
    }
  }
  Object.defineProperty(LlamaCppInfo.prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze({ version: 1, methods: Object.freeze([Object.freeze({ method: 'getInfo', invocation: Object.freeze({ kind: 'direct' }) })]) }),
  })
  return LlamaCppInfo
}

const isWin = process.platform === 'win32'

export const Config = z.object({
  modelsMax: z.number(),
  extraArgs: z.array(z.string()).default([]),
  autostart: z.boolean().default(true),
  offerProvider: z.boolean().default(true),
  piAiEntryId: z.string().default('llm-pi-ai'),
  apiKey: z.string(),
})

/** Read a field that may be a volatile reference. */
const val = (config, key) => {
  const v = config[key]
  return v && typeof v === 'object' && typeof v.get === 'function' ? v.get() : v
}
const ROUTE = 'llama.dsh'
const HOST = '127.0.0.1'
const PORT = 19931
const DISPLAY_NAME = 'Llama.cpp'
const PI_AI_NAME = '@deepseek-ai/dsh-llm-pi-ai'

function isExecutable(file) {
  try { return statSync(file).isFile() } catch { return false }
}

/** Find llama-server or llama on PATH, then in common install dirs. */
export function detectBinary() {
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

const hasRoute = raw => !!(raw && typeof raw === 'object' && raw.providers && raw.providers[ROUTE])

/**
 * Offer llama.dsh in Models > Add model provider while it is not configured.
 * The entry is declared on behalf of the llm-pi-ai namespace, so the stock
 * pi-ai editor handles it. Once the user saves it, pi-ai declares the route
 * itself, so this entry is withdrawn first to avoid a duplicate declaration.
 */
function offerProvider(ctx, config, baseURL) {
  const llm = ctx.get('llm')
  if (!llm) return
  const piAiEntryId = config.piAiEntryId || 'llm-pi-ai'
  let handle

  const withdraw = () => {
    if (!handle) return
    try { handle() } catch {}
    handle = undefined
  }
  const offer = () => {
    if (handle) return
    try {
      handle = llm.registerConfigurableProviders([{
        provider: ROUTE,
        displayName: DISPLAY_NAME,
        settingsNs: piAiEntryId,
        settingsPath: ['providers', ROUTE],
        declared: true,
        defaultBaseURL: baseURL,
      }])
    } catch (err) {
      // Already declared (configured) by pi-ai: nothing to offer.
      ctx.logger.debug(`llama.cpp: provider offer skipped: ${err?.message ?? err}`)
    }
  }

  const piAiFiber = fiber => {
    const entry = fiber?.entry
    return entry?.options?.id === piAiEntryId || entry?.options?.name === PI_AI_NAME
  }
  const configured = () => {
    const editor = ctx.get('configEditor')
    const layer = editor?.configuration().find(c => c.entry?.options?.id === piAiEntryId)
    if (!layer) return false
    return hasRoute(layer.override) || hasRoute(layer.inherited)
  }

  // Model discovery is keyed by namespace and pi-ai owns llm-pi-ai's, so wrap
  // its function: a llama.dsh draft with no baseURL asks the local server.
  const map = llm.discoveries
  if (map instanceof Map) {
    const wrapped = new WeakSet()
    const wrap = fn => {
      if (typeof fn !== 'function' || wrapped.has(fn)) return fn
      const w = (request, signal) => fn(
        request?.provider === ROUTE && !request.baseURL
          ? { ...request, baseURL, api: request.api || 'openai-completions' }
          : request,
        signal,
      )
      wrapped.add(w)
      return w
    }
    const originalSet = map.set
    map.set = function (key, value) {
      return originalSet.call(this, key, key === piAiEntryId ? wrap(value) : value)
    }
    if (map.has(piAiEntryId)) originalSet.call(map, piAiEntryId, wrap(map.get(piAiEntryId)))
    ctx.effect(() => () => { map.set = originalSet })
  } else {
    ctx.logger.warn('llama.cpp: cannot hook model discovery; enter the baseURL on the card')
  }

  // Runs before pi-ai's own volatile update re-declares its directory, so the
  // route is withdrawn here before pi-ai tries to declare it. A saved
  // llama.dsh profile without a baseURL gets this plugin's endpoint at runtime.
  ctx.on('internal/config', (fiber, next) => {
    let raw = next()
    if (piAiFiber(fiber)) {
      if (hasRoute(raw)) {
        withdraw()
        const profile = raw.providers[ROUTE]
        // pi-ai has no catalog for llama.dsh, so every model needs an api;
        // llama-server speaks OpenAI chat completions.
        // A local llama-server needs no key, but pi-ai refuses a request with
        // no auth. Profiles have no apiKey field (only apiKeyEnv), yet pi-ai
        // accepts an authorization header as auth, so add one at runtime
        // when the user configured neither a key nor their own header.
        const hdrs = (profile && profile.headers) || {}
        const hasAuthHeader = Object.keys(hdrs).some(k => k.toLowerCase() === 'authorization')
        const needsKey = profile && typeof profile === 'object' && !profile.apiKeyEnv && !hasAuthHeader
        if (profile && typeof profile === 'object' && (!profile.baseURL || !profile.api || !profile.displayName || needsKey)) {
          raw = {
            ...raw,
            providers: {
              ...raw.providers,
              [ROUTE]: {
                ...profile,
                displayName: profile.displayName || DISPLAY_NAME,
                api: profile.api || 'openai-completions',
                baseURL: profile.baseURL || baseURL,
                ...(needsKey ? { headers: { ...hdrs, authorization: `Bearer ${config.apiKey || 'llama-local'}` } } : {}),
              },
            },
          }
        }
      } else queueMicrotask(() => { if (!configured()) offer() })
    }
    return raw
  })

  if (configured()) return
  offer()
  ctx.effect(() => () => withdraw())
}

export function apply(ctx, config = {}) {
  // Fixed endpoint: llama serve's default port 9931 with a leading 1.
  const host = HOST
  const port = PORT
  const baseURL = `http://${host}:${port}/v1`

  // Read-only Remote the Models card uses to show where llama was found.
  ctx.plugin(makeInfoService(() => config))

  // At boot the llm service may not exist yet; wait for it instead of
  // reading it once (which silently skipped the offer after a restart).
  if (config.offerProvider !== false) {
    ctx.inject(['llm'], ctx => offerProvider(ctx, config, baseURL))
  }
  if (config.autostart === false) return

  let child
  let stopped = false

  const start = async () => {
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
    if (preset) args.push('--models-preset', preset)
    if (config.modelsMax !== undefined) args.push('--models-max', String(config.modelsMax))
    if (Array.isArray(config.extraArgs)) args.push(...config.extraArgs.map(String))

    ctx.logger.info(`llama.cpp: starting ${binary} ${args.join(' ')}`)
    child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const relay = chunk => {
      for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) ctx.logger.debug(`llama.cpp: ${line}`)
    }
    child.stdout.on('data', relay)
    child.stderr.on('data', relay)
    child.on('error', err => ctx.logger.error(`llama.cpp: failed to start: ${err.message}`))
    child.on('exit', (code, signal) => {
      if (!stopped) ctx.logger.warn(`llama.cpp: server exited (code ${code}, signal ${signal})`)
      child = undefined
    })
  }

  ctx.effect(() => {
    start().catch(err => ctx.logger.error(err))
    return () => {
      stopped = true
      if (child && child.exitCode === null) {
        const c = child
        c.kill('SIGTERM')
        setTimeout(() => { if (c.exitCode === null) c.kill('SIGKILL') }, 5000).unref?.()
      }
    }
  })
}
