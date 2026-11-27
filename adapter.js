/**
 * llama.cpp as its own LLM route.
 *
 * Reuses pi-ai's request pipeline: PiAiAdapter (exported by
 * @deepseek-ai/dsh-llm-pi-ai) streams through pi-ai's OpenAI chat-completions
 * implementation (@earendil-works/pi-ai/api/openai-completions.lazy). This
 * module only builds the profile PiAiAdapter reads: the models come from
 * llama-server's /v1/models, minus the ones hidden in settings.json.
 */
import { readFileSync } from 'node:fs'

export const ROUTE = 'llama-cpp'

// Set by registerLlamaRoute; called after the hidden-model list is saved.
let hiddenChanged = () => {}
export function notifyHiddenChanged() { try { hiddenChanged() } catch {} }
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const DEFAULT_CONTEXT = 131072
const DEFAULT_MAX_TOKENS = 32768

/** Same values as dsh-llm-pi-ai's config.ts defaults. */
const PROFILE_DEFAULTS = {
  streamIdleTimeoutMs: 300_000,
  maxRequestImageBytes: 20 * 1024 * 1024,
  maxRequestImages: 50,
  imageOffloadCountQuantum: 10,
  requestImageBudgetCount: 20,
  requestImagePixelBudget: 2048 * 2048,
}

function hiddenModels(settingsFile) {
  try {
    const v = JSON.parse(readFileSync(settingsFile, 'utf8')).hiddenModels
    return new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string') : [])
  } catch { return new Set() }
}

/** Api-key auth that hands pi-ai whatever resolveApiKey returned. */
const harnessAuth = name => ({
  apiKey: {
    name,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === undefined ? {} : { apiKey: credential.key },
      source: name,
    }),
  },
})

/** pi-ai credential store/auth context: llama needs no sign-in. */
const NO_AUTH = {
  credentials: {
    async read() { return undefined },
    async list() { return [] },
    async modify() { throw new Error('llama.cpp: no stored credentials') },
    async delete() {},
  },
  authContext: {
    async env(name) { return process.env[name] },
    async fileExists() { return false },
  },
}

/**
 * Register the llama-cpp route. Returns false (after logging) when the pi-ai
 * modules cannot be loaded, so the caller can fall back.
 */
export async function registerLlamaRoute(ctx, { baseURL, displayName, settingsNs, settingsFile, apiKey, trace }) {
  let PiAiAdapter, openAICompletionsApi, resolveRetryPolicy
  try {
    ({ PiAiAdapter } = await import('@deepseek-ai/dsh-llm-pi-ai'))
    ;({ openAICompletionsApi } = await import('@earendil-works/pi-ai/api/openai-completions.lazy'))
    ;({ resolveRetryPolicy } = await import('@deepseek-ai/dsh-llm'))
  } catch (err) {
    ctx.logger.warn(`llama.cpp: cannot load pi-ai modules: ${err?.message ?? err}`)
    trace?.('import failed: ' + (err?.stack ?? err))
    return false
  }
  const api = openAICompletionsApi()
  const retryPolicy = resolveRetryPolicy(undefined, 'llama.cpp retryPolicy')

  // Server model list, refreshed by refresh().
  let serverModels = [] // [{ id, contextWindow }]
  let memo, memoKey

  const buildProfiles = () => {
    const hidden = hiddenModels(settingsFile)
    const key = JSON.stringify([serverModels, [...hidden].sort()])
    if (memo && key === memoKey) return memo
    const models = serverModels.filter(m => !hidden.has(m.id)).map(m => ({
      id: m.id,
      name: m.id,
      api: 'openai-completions',
      provider: ROUTE,
      baseUrl: baseURL,
      input: ['text'],
      cost: NO_COST,
      reasoning: false,
      contextWindow: m.contextWindow || DEFAULT_CONTEXT,
      maxTokens: DEFAULT_MAX_TOKENS,
    }))
    const piProvider = {
      id: ROUTE,
      name: displayName,
      baseUrl: baseURL,
      auth: harnessAuth(displayName),
      getModels: () => models,
      stream: (model, context, options) => api.stream(model, context, options),
      streamSimple: (model, context, options) => api.streamSimple(model, context, options),
    }
    memo = new Map([[ROUTE, {
      ...PROFILE_DEFAULTS,
      provider: ROUTE,
      displayName,
      baseURL,
      api: 'openai-completions',
      retryPolicy,
      piProvider,
      modelErrors: new Map(),
      configuredMaxTokens: new Map(),
    }]])
    memoKey = key
    return memo
  }

  const adapter = new PiAiAdapter({
    profiles: buildProfiles,
    resolveApiKey: async () => apiKey || 'llama-local',
    auth: NO_AUTH,
    resolveAttachments: () => ctx.get('attachments'),
  })

  const llm = ctx.llm
  ctx.effect(() => llm.registerConfigurableProviders([{
    provider: ROUTE,
    displayName,
    settingsNs,
    settingsPath: [],
    defaultBaseURL: baseURL,
  }]), 'llama-cpp: provider directory')
  // Keep the handle: replacing the adapter announces a topology change, which
  // makes the model picker reload its catalog (it drops groups with no models,
  // and our models arrive after registration while llama-server starts).
  let adapterHandle
  ctx.effect(() => { adapterHandle = llm.registerAdapter([ROUTE], adapter); return adapterHandle }, 'llama-cpp: adapter')
  const announce = why => {
    try {
      if (adapterHandle && typeof adapterHandle.replace === 'function') { adapterHandle.replace([ROUTE], adapter); trace?.('announced (' + why + ')') }
      else trace?.('no replace() on adapter handle')
    } catch (e) { trace?.('announce failed: ' + (e?.message ?? e)) }
  }

  hiddenChanged = () => { memo = undefined; announce('hidden models') }
  ctx.effect(() => () => { hiddenChanged = () => {} })

  const refresh = async () => {
    try {
      const res = await fetch(`${baseURL}/models`, { signal: AbortSignal.timeout(3000) })
      const body = await res.json()
      const next = (body?.data ?? []).filter(m => m?.id).map(m => ({
        id: m.id,
        contextWindow: Number(m?.meta?.n_ctx_train) || undefined,
      }))
      if (next.length) {
        const changed = JSON.stringify(next) !== JSON.stringify(serverModels)
        serverModels = next
        if (changed) announce('models ' + next.length)
      }
      return next.length
    } catch { return 0 }
  }
  // The server may still be starting: retry for about a minute.
  ;(async () => {
    for (let i = 0; i < 30; i++) {
      const n = await refresh()
      if (n) { trace?.('route models: ' + n); return }
      await new Promise(r => setTimeout(r, 2000))
    }
  })().catch(() => {})

  ctx.logger.info(`llama.cpp: registered route ${ROUTE}`)
  return { refresh }
}
