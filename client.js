/**
 * Llama.cpp — browser half. Shows read-only notes on the Llama.cpp card in
 * Settings > Models (while adding it, or while its editor is open): where
 * the llama executable and models-preset file were found, or how to install
 * llama.cpp when they were not.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-llama-cpp',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PKG = '@local/dsh-llama-cpp'
    const ROUTE = 'llama.dsh'
    const PI_AI_NS = 'llm-pi-ai'
    const NS = 'llama-cpp'
    const REMOTE_NS = 'llamaCpp'
    const INSTALL_URL = 'https://github.com/ggml-org/llama.cpp#quick-start'

    const zh = {
      title: 'Llama.cpp 本地服务',
      binary: 'llama 命令',
      preset: 'models-preset 文件',
      auto: '已自动找到：{path}',
      binaryNone: '没有找到 llama 命令。请按 llama.cpp 官方教程安装：',
      binaryInstallMac: 'macOS / Linux：curl -LsSf https://llama.app/install.sh | sh',
      binaryInstallWin: 'Windows（PowerShell）：irm https://llama.app/install.ps1 | iex',
      binaryAfter: '安装后重启 DSH。',
      presetNone: '没有找到 models.user.ini，llama 服务会以默认设置启动。',
      loading: '正在读取…',
      failed: '无法读取本地服务信息',
      guide: '官方教程',
    }
    const en = {
      title: 'Llama.cpp local server',
      binary: 'llama executable',
      preset: 'models-preset file',
      auto: 'Found automatically: {path}',
      binaryNone: 'No llama executable was found. Install llama.cpp by following the official guide:',
      binaryInstallMac: 'macOS / Linux: curl -LsSf https://llama.app/install.sh | sh',
      binaryInstallWin: 'Windows (PowerShell): irm https://llama.app/install.ps1 | iex',
      binaryAfter: 'Restart DSH after installing.',
      presetNone: 'No models.user.ini was found; the llama server starts with default settings.',
      loading: 'Loading…',
      failed: 'Could not read local server information',
      guide: 'Official guide',
    }

    // ---- Remote (read-only getInfo on the Host) ----
    const IDENTITY_SCHEMA = {
      '~standard': { version: 1, vendor: PKG, validate: value => ({ value }) },
      parse: value => value,
    }
    const CONTRIBUTION = {
      package: PKG,
      descriptors: [{
        id: PKG + '#' + REMOTE_NS + '/getInfo',
        service: REMOTE_NS,
        namespace: REMOTE_NS,
        method: 'getInfo',
        invocation: { kind: 'direct' },
        parameters: [],
        result: { mode: 'strict', typeSymbol: PKG + '#getInfo:result', create: () => IDENTITY_SCHEMA },
      }],
    }

    const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars ? vars[k] : ''))
    const muted = { fontSize: 12, opacity: 0.75, lineHeight: 1.6 }
    const code = { fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)', fontSize: 12, wordBreak: 'break-all' }

    function PathLine({ label, item, none, t }) {
      let body
      if (item.source === 'auto') body = h('span', { style: code }, fill(t('auto'), { path: item.path }))
      else if (item.source === 'config' && item.exists) body = h('span', { style: code }, fill(t('config'), { path: item.path }))
      else if (item.source === 'config') body = h('span', { style: { ...code, color: 'var(--dsw-color-danger, #d33)' } }, fill(t('configMissing'), { path: item.path }))
      else body = none
      // One line per item: label, then where it was found.
      return h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 } },
        h('span', { style: { fontSize: 12, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' } }, label),
        h('div', { style: { ...muted, minWidth: 0 } }, body))
    }

    function Info({ api, t }) {
      const [info, setInfo] = React.useState(null)
      const [error, setError] = React.useState(false)
      React.useEffect(() => {
        let live = true
        api.getInfo().then(v => { if (live) setInfo(v) }, err => {
          console.error('[llama.cpp] getInfo failed', err)
          if (live) setError(true)
        })
        return () => { live = false }
      }, [])

      const box = children => h('div', {
        style: {
          display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, paddingTop: 12,
          borderTop: '1px solid var(--dsw-color-border, rgba(127,127,127,.25))',
        },
      }, h('span', { style: { fontSize: 13, fontWeight: 600 } }, t('title')), ...children)

      if (error) return box([h('div', { style: muted }, t('failed'))])
      if (!info) return box([h('div', { style: muted }, t('loading'))])

      const win = info.platform === 'win32'
      const binaryNone = h('div', null,
        h('div', null, t('binaryNone'), ' ',
          h('a', { href: INSTALL_URL, target: '_blank', rel: 'noreferrer' }, t('guide'))),
        h('div', { style: code }, win ? t('binaryInstallWin') : t('binaryInstallMac')),
        h('div', null, t('binaryAfter')))

      return box([
        h(PathLine, { key: 'b', label: t('binary'), item: info.binary, none: binaryNone, t }),
        h(PathLine, { key: 'p', label: t('preset'), item: info.preset, none: t('presetNone'), t }),
      ])
    }

    // Show on the add-provider draft (configured is false), and on a saved
    // row only while its editor is open: the editor is then rendered right
    // after this slot area inside the card.
    function useEditorOpen(anchor, enabled) {
      const [open, setOpen] = React.useState(false)
      React.useEffect(() => {
        let el = anchor.current
        if (!enabled || !el) return
        while (el.parentElement && el.parentElement.tagName !== 'LI') el = el.parentElement
        const card = el.parentElement
        if (!card) return
        const check = () => setOpen(!!el.nextElementSibling)
        check()
        const mo = new MutationObserver(check)
        mo.observe(card, { childList: true })
        return () => mo.disconnect()
      }, [enabled])
      return open
    }

    return {
      inject: ['slots', 'locale', 'remote'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'llama-cpp: dictionaries')

        ctx.effect(() => {
          let disposed = false
          let disposer = null
          Promise.resolve(ctx.remote.$mount(CONTRIBUTION)).then(d => {
            if (disposed) { Promise.resolve(d()).catch(() => {}); return }
            disposer = d
          }, err => console.error('[llama.cpp] remote mount failed', err))
          return () => { disposed = true; if (disposer) return disposer() }
        }, 'llama-cpp: remote')

        const api = {
          getInfo() {
            const ns = (typeof ctx.get === 'function' && ctx.get('remote.' + REMOTE_NS)) || (ctx.remote && ctx.remote[REMOTE_NS])
            if (!ns) return Promise.reject(new Error('llama.cpp remote is not mounted yet'))
            return ns.getInfo().then(r => { if (!r.ok) throw r.error; return r.value })
          },
        }

        // On the add-provider draft the page renders this area after the
        // editor; move it visually above the editor (CSS order only, React's
        // DOM is left untouched) so it matches the edit card.
        function useAboveEditor(anchor, enabled) {
          React.useEffect(() => {
            let el = anchor.current
            if (!enabled || !el) return
            while (el.parentElement && !el.previousElementSibling) el = el.parentElement
            const editor = el.previousElementSibling
            const panel = el.parentElement
            if (!editor || !panel) return
            const saved = { display: panel.style.display, dir: panel.style.flexDirection, editor: editor.style.order, el: el.style.order }
            if (getComputedStyle(panel).display !== 'flex') { panel.style.display = 'flex'; panel.style.flexDirection = 'column' }
            editor.style.order = '2'
            el.style.order = '1'
            return () => {
              panel.style.display = saved.display
              panel.style.flexDirection = saved.dir
              editor.style.order = saved.editor
              el.style.order = saved.el
            }
          }, [enabled])
        }

        function Extra(props) {
          const anchor = React.useRef(null)
          const mine = !!props.provider && props.provider.provider === ROUTE
          const draft = props.configured === false
          const editorOpen = useEditorOpen(anchor, mine && !draft)
          useAboveEditor(anchor, mine && draft)
          if (!mine) return null
          return h('div', { ref: anchor }, draft || editorOpen ? h(Info, { api, t: props.t || t }) : null)
        }

        ctx.effect(() => ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
          name: 'settings.models.provider-card', key: PI_AI_NS, locale: NS,
        }, Extra)), 'llama-cpp: provider card')
      },
    }
  },
})
