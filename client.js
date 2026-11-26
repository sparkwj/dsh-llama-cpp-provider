/**
 * llama.cpp — browser half. Shows read-only notes on the llama.cpp card in
 * Settings > Models (while adding it, or while its editor is open): where
 * the llama executable and models-preset file were found, or how to install
 * llama.cpp when they were not.
 */
window.__ModuleLoader__.load({
  id: 'dsh-llama-cpp-provider',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PKG = 'dsh-llama-cpp-provider'
    const ROUTE = 'llama.dsh'
    const PI_AI_NS = 'llm-pi-ai'
    const NS = 'llama-cpp'
    const REMOTE_NS = 'llamaCpp'
    const INSTALL_URL = 'https://github.com/ggml-org/llama.cpp#quick-start'
    const CMD_MAC = 'curl -LsSf https://llama.app/install.sh | sh'
    const CMD_WIN = 'irm https://llama.app/install.ps1 | iex'
    const isFound = item => !!item && (item.source === 'auto' || ((item.source === 'env' || item.source === 'custom') && item.exists))

    const zh = {
      title: 'llama.cpp 本地服务',
      binary: 'llama 命令',
      preset: 'models-preset 文件',
      auto: '已找到：{path}',
      env: '由 {name} 指定：{path}',
      envMissing: '{name} 指向的文件不存在：{path}',
      binaryNone: '没有找到 llama 命令。请按 llama.cpp 官方教程安装：',
      binaryInstallMac: 'macOS / Linux：curl -LsSf https://llama.app/install.sh | sh',
      binaryInstallWin: 'Windows（PowerShell）：irm https://llama.app/install.ps1 | iex',
      binaryAfter: '安装后重启 DSH。',
      presetNone: '没有找到 models.user.ini，llama 服务会以默认设置启动。',
      loading: '正在读取…',
      failed: '无法读取本地服务信息',
      guide: '官方教程',
      cardMissing: '没有找到 llama.cpp，请到「插件」> llama.cpp 详情页查看安装方法。',
      installCmd: '安装命令：{cmd}',
      copy: '复制',
      copied: '已复制',
      installAfter: '在终端里运行后，重新打开 DSH。',
      binCustomize: '自定义…',
      binRevert: '还原',
      binCustomFrom: '自定义目录：{path}',
      binCustomInvalid: '这个目录里没有找到 llama-server 或 llama：{path}',
      binPickFailed: '无法选择目录：{error}',
      logTitle: 'llama-server 日志',
      logNone: '还没有日志。llama 服务由本插件启动后才会写入。',
      logTruncated: '只显示最后 200 行。',
      logRefresh: '刷新',
      logFile: '文件：{path}',
      presetNoFile: '没有找到 models.user.ini，无法编辑。',
      presetSave: '保存',
      presetRevert: '还原',
      presetSaving: '正在保存…',
      presetSaved: '已保存，llama 服务正在重新读取。',
      presetSaveFailed: '保存失败：{error}',
      presetConflict: '文件已在别处被修改。保存会覆盖那些修改。',
      presetLoadDisk: '载入新内容',
    }
    const en = {
      title: 'llama.cpp local server',
      binary: 'llama executable',
      preset: 'models-preset file',
      auto: 'Found: {path}',
      env: 'Set by {name}: {path}',
      envMissing: 'The file {name} points to does not exist: {path}',
      binaryNone: 'No llama executable was found. Install llama.cpp by following the official guide:',
      binaryInstallMac: 'macOS / Linux: curl -LsSf https://llama.app/install.sh | sh',
      binaryInstallWin: 'Windows (PowerShell): irm https://llama.app/install.ps1 | iex',
      binaryAfter: 'Restart DSH after installing.',
      presetNone: 'No models.user.ini was found; the llama server starts with default settings.',
      loading: 'Loading…',
      failed: 'Could not read local server information',
      guide: 'Official guide',
      cardMissing: 'llama.cpp was not found. See Plugins > llama.cpp for how to install it.',
      installCmd: 'Install command: {cmd}',
      copy: 'Copy',
      copied: 'Copied',
      installAfter: 'Run it in a terminal, then reopen DSH.',
      binCustomize: 'Customize…',
      binRevert: 'Reset',
      binCustomFrom: 'Custom folder: {path}',
      binCustomInvalid: 'No llama-server or llama in this folder: {path}',
      binPickFailed: 'Could not pick a folder: {error}',
      logTitle: 'llama-server log',
      logNone: 'No log yet. It is written once this plugin starts the llama server.',
      logTruncated: 'Showing the last 200 lines.',
      logRefresh: 'Refresh',
      logFile: 'File: {path}',
      presetNoFile: 'No models.user.ini was found, so there is nothing to edit.',
      presetSave: 'Save',
      presetRevert: 'Revert',
      presetSaving: 'Saving…',
      presetSaved: 'Saved. The llama server is reloading it.',
      presetSaveFailed: 'Could not save: {error}',
      presetConflict: 'The file was changed elsewhere. Saving will overwrite those changes.',
      presetLoadDisk: 'Load the new version',
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
      }, {
        id: PKG + '#' + REMOTE_NS + '/readLog',
        service: REMOTE_NS,
        namespace: REMOTE_NS,
        method: 'readLog',
        invocation: { kind: 'direct' },
        parameters: [],
        result: { mode: 'strict', typeSymbol: PKG + '#readLog:result', create: () => IDENTITY_SCHEMA },
      }, {
        id: PKG + '#' + REMOTE_NS + '/readPreset',
        service: REMOTE_NS,
        namespace: REMOTE_NS,
        method: 'readPreset',
        invocation: { kind: 'direct' },
        parameters: [],
        result: { mode: 'strict', typeSymbol: PKG + '#readPreset:result', create: () => IDENTITY_SCHEMA },
      }, {
        id: PKG + '#' + REMOTE_NS + '/writePreset',
        service: REMOTE_NS,
        namespace: REMOTE_NS,
        method: 'writePreset',
        invocation: { kind: 'direct' },
        parameters: [{ wire: 'text', codec: { mode: 'strict', typeSymbol: PKG + '#writePreset:text', create: () => IDENTITY_SCHEMA } }],
        result: { mode: 'strict', typeSymbol: PKG + '#writePreset:result', create: () => IDENTITY_SCHEMA },
      }, {
        id: PKG + '#' + REMOTE_NS + '/setLlamaPath',
        service: REMOTE_NS,
        namespace: REMOTE_NS,
        method: 'setLlamaPath',
        invocation: { kind: 'direct' },
        parameters: [{ wire: 'path', codec: { mode: 'strict', typeSymbol: PKG + '#setLlamaPath:path', create: () => IDENTITY_SCHEMA } }],
        result: { mode: 'strict', typeSymbol: PKG + '#setLlamaPath:result', create: () => IDENTITY_SCHEMA },
      }, {
        id: PKG + '#' + REMOTE_NS + '/clearLlamaPath',
        service: REMOTE_NS,
        namespace: REMOTE_NS,
        method: 'clearLlamaPath',
        invocation: { kind: 'direct' },
        parameters: [],
        result: { mode: 'strict', typeSymbol: PKG + '#clearLlamaPath:result', create: () => IDENTITY_SCHEMA },
      }],
    }

    const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars ? vars[k] : ''))
    const muted = { fontSize: 12, opacity: 0.75, lineHeight: 1.6 }
    const code = { fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)', fontSize: 12, wordBreak: 'break-all' }

    function PathLine({ label, item, none, t }) {
      let body
      if (item.source === 'auto') body = h('span', { style: code }, fill(t('auto'), { path: item.path }))
      else if (item.source === 'env' && item.exists) body = h('span', { style: code }, fill(t('env'), { name: item.env, path: item.path }))
      else if (item.source === 'env') body = h('span', { style: { ...code, color: 'var(--dsw-color-danger, #d33)' } }, fill(t('envMissing'), { name: item.env, path: item.path }))
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

      // Only a missing llama executable is worth a note here.
      if (error || !info || isFound(info.binary)) return null
      return box([h('div', { key: 'm', style: muted }, t('cardMissing'))])

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
      inject: ['slots', 'locale', 'remote', 'uiWorkspace'],
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

        // ctx.get throws when the namespace is not mounted; treat that as not mounted.
        const remoteNs = () => {
          try { const v = typeof ctx.get === 'function' && ctx.get('remote.' + REMOTE_NS); if (v) return v } catch {}
          return ctx.remote && ctx.remote[REMOTE_NS]
        }
        const api = {
          getInfo() {
            const ns = remoteNs()
            if (!ns) return Promise.reject(new Error('llama.cpp remote is not mounted yet'))
            return ns.getInfo().then(r => { if (!r.ok) throw r.error; return r.value })
          },
          readPreset() {
            const ns = remoteNs()
            if (!ns) return Promise.reject(new Error('llama.cpp remote is not mounted yet'))
            return ns.readPreset().then(r => { if (!r.ok) throw r.error; return r.value })
          },
          writePreset(text) {
            const ns = remoteNs()
            if (!ns) return Promise.reject(new Error('llama.cpp remote is not mounted yet'))
            return ns.writePreset(text).then(r => { if (!r.ok) throw r.error; return r.value })
          },
          setLlamaPath(...args) {
            const ns = remoteNs()
            if (!ns) return Promise.reject(new Error('llama.cpp remote is not mounted yet'))
            return ns.setLlamaPath(...args).then(r => { if (!r.ok) throw r.error; return r.value })
          },
          clearLlamaPath(...args) {
            const ns = remoteNs()
            if (!ns) return Promise.reject(new Error('llama.cpp remote is not mounted yet'))
            return ns.clearLlamaPath(...args).then(r => { if (!r.ok) throw r.error; return r.value })
          },
          readLog() {
            const ns = remoteNs()
            if (!ns) return Promise.reject(new Error('llama.cpp remote is not mounted yet'))
            return ns.readLog().then(r => { if (!r.ok) throw r.error; return r.value })
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

        // Plugin detail page: this run's llama-server output, refreshed every 3 s.
        function LogPanel({ t }) {
          const [log, setLog] = React.useState(null)
          const [error, setError] = React.useState(false)
          const pre = React.useRef(null)
          const load = React.useCallback(() => api.readLog().then(v => { setLog(v); setError(false) }, err => {
            console.error('[llama.cpp] readLog failed', err)
            setError(true)
          }), [])
          React.useEffect(() => {
            load()
            const id = setInterval(() => { if (!document.hidden) load() }, 3000)
            return () => clearInterval(id)
          }, [load])
          // Stay at the bottom unless the user scrolled up to read.
          const text = log ? log.text : ''
          React.useLayoutEffect(() => {
            const el = pre.current
            if (el && el.dataset.pinned !== 'false') el.scrollTop = el.scrollHeight
          }, [text])
          const onScroll = e => { const el = e.currentTarget; el.dataset.pinned = String(el.scrollHeight - el.scrollTop - el.clientHeight < 24) }

          let body
          if (error) body = h('div', { style: muted }, t('failed'))
          else if (!log) body = h('div', { style: muted }, t('loading'))
          else if (!log.exists || !log.text.trim()) body = h('div', { style: muted }, t('logNone'))
          else body = h('pre', {
            ref: pre, onScroll,
            style: {
              ...code, wordBreak: 'normal', whiteSpace: 'pre', margin: 0, padding: 10, maxHeight: 360, overflow: 'auto', borderRadius: 6,
              background: 'var(--dsw-color-bg-subtle, rgba(127,127,127,.08))', border: '1px solid var(--dsw-color-border, rgba(127,127,127,.25))',
            },
          }, log.text)

          return h(Collapsible, { title: t('logTitle'), description: log ? log.path : null, defaultOpen: true },
            body,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: { ...muted, flex: 1 } }, log && log.truncated ? t('logTruncated') : ''),
              h('button', { type: 'button', onClick: load, style: { fontSize: 12, cursor: 'pointer' } }, t('logRefresh'))))
        }

        // Collapsible section, styled like the plugin market's.
        const sectionStyle = {
          background: 'var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1, #fff))',
          border: '.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l4, #00000029))',
          borderRadius: 'var(--dsw-radius-lg, 16px)', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
        }
        const headStyle = {
          font: 'inherit', color: 'var(--dsw-alias-label-primary, #1f2328)', cursor: 'pointer', textAlign: 'left', background: 'none',
          border: 'none', display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', padding: 0, fontSize: 13, fontWeight: 600,
        }
        const secondary = 'var(--dsw-alias-label-secondary, #6b7280)'
        const chevron = open => h('svg', { width: 14, height: 14, viewBox: '0 0 14 14', style: { flexShrink: 0, marginTop: 2, color: secondary, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' } },
          h('path', { d: 'M5 3l4 4-4 4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
        function Collapsible({ title, description, defaultOpen = false, children }) {
          const [open, setOpen] = React.useState(defaultOpen)
          return h('section', { style: sectionStyle },
            h('button', { type: 'button', style: headStyle, 'aria-expanded': open, onClick: () => setOpen(o => !o) },
              chevron(open),
              h('span', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
                h('span', null, title),
                description ? h('span', { style: { ...code, fontWeight: 400, color: secondary } }, description) : null)),
            open ? h('div', { style: { borderTop: '1px solid var(--dsw-alias-border-l2, #f0f1f3)', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, paddingTop: 10, minWidth: 0 } }, children) : null)
        }

        function PresetEditor({ t, preset, onSaved }) {
          const [text, setText] = React.useState(preset.text)
          const [saved, setSaved] = React.useState(preset.text)
          const [state, setState] = React.useState({ kind: 'idle' })
          const dirty = text !== saved
          // Follow edits made outside DSH: take them when nothing is edited here,
          // otherwise keep the user's text and flag the conflict.
          const [disk, setDisk] = React.useState(null)
          const live = React.useRef({ text, saved })
          live.current = { text, saved }
          React.useEffect(() => {
            const id = setInterval(() => {
              if (document.hidden) return
              api.readPreset().then(p => {
                if (!p || !p.exists) return
                const cur = live.current
                if (p.text === cur.saved) { setDisk(null); return }
                if (cur.text === cur.saved) { setText(p.text); setSaved(p.text); setDisk(null); setState({ kind: 'idle' }) }
                else setDisk(p.text)
              }, () => {})
            }, 3000)
            return () => clearInterval(id)
          }, [])
          const save = () => {
            setState({ kind: 'saving' })
            api.writePreset(text).then(r => {
              if (r && r.ok) { setSaved(text); setDisk(null); setState({ kind: 'saved' }); onSaved && onSaved() }
              else setState({ kind: 'failed', error: (r && r.error) || 'unknown' })
            }, err => setState({ kind: 'failed', error: String(err?.message ?? err) }))
          }
          const onKeyDown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (dirty) save() } }
          let status = null
          if (state.kind === 'saving') status = t('presetSaving')
          else if (state.kind === 'saved' && !dirty) status = t('presetSaved')
          else if (state.kind === 'failed') status = fill(t('presetSaveFailed'), { error: state.error })
          return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            h('textarea', {
              value: text, spellCheck: false, onKeyDown, onChange: e => setText(e.target.value), rows: 16,
              style: { ...code, wordBreak: 'normal', whiteSpace: 'pre', width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: 10, borderRadius: 6,
                color: 'inherit', background: 'var(--dsw-color-bg-subtle, rgba(127,127,127,.08))', border: '1px solid var(--dsw-color-border, rgba(127,127,127,.25))' },
            }),
            disk !== null ? h('div', { style: { ...muted, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dsw-color-warning, #b26b00)' } },
              h('span', { style: { flex: 1 } }, t('presetConflict')),
              h('button', { type: 'button', onClick: () => { setText(disk); setSaved(disk); setDisk(null); setState({ kind: 'idle' }) }, style: { fontSize: 12, cursor: 'pointer' } }, t('presetLoadDisk'))) : null,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: { ...muted, flex: 1, color: state.kind === 'failed' ? 'var(--dsw-color-danger, #d33)' : undefined } }, status),
              h('button', { type: 'button', disabled: !dirty || state.kind === 'saving', onClick: () => { setText(saved); setState({ kind: 'idle' }) }, style: { fontSize: 12, cursor: 'pointer' } }, t('presetRevert')),
              h('button', { type: 'button', disabled: !dirty || state.kind === 'saving', onClick: save, style: { fontSize: 12, cursor: 'pointer' } }, t('presetSave'))))
        }

        // Status icon in the same 14px column as the chevrons, so titles line up.
        const statusIcon = ok => h('svg', { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true, style: { flexShrink: 0, marginTop: 2, color: ok ? 'var(--dsw-color-success, #1a7f37)' : 'var(--dsw-color-warning, #b26b00)' } },
          h('circle', { cx: 7, cy: 7, r: 6, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
          ok
            ? h('path', { d: 'M4.3 7.2l1.8 1.8 3.6-3.8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' })
            : h('path', { d: 'M7 4v3.6M7 9.6v.1', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }))

        // llama-server row: its path or the install command; Customize… / Reset on the right.
        function BinarySection({ t }) {
          const [info, setInfo] = React.useState(null)
          const [copied, setCopied] = React.useState(false)
          const [busy, setBusy] = React.useState(false)
          const [error, setError] = React.useState(null)
          const load = React.useCallback(() => api.getInfo().then(setInfo, err => console.error('[llama.cpp] getInfo failed', err)), [])
          React.useEffect(() => { load() }, [load])
          if (!info) return null
          const bin = info.binary || {}
          const found = isFound(bin)
          const custom = bin.source === 'custom'
          const cmd = info.platform === 'win32' ? CMD_WIN : CMD_MAC
          const danger = 'var(--dsw-color-danger, #d33)'
          const copy = () => {
            Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(cmd)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {})
          }
          const done = p => p.then(load).catch(err => setError(String(err?.message ?? err))).finally(() => setBusy(false))
          const customize = () => {
            setError(null)
            Promise.resolve(ctx.uiWorkspace.pickDirectory()).then(dir => {
              if (!dir) return
              setBusy(true)
              return done(api.setLlamaPath(dir).then(r => { if (!r || !r.ok) throw new Error(fill(t('binCustomInvalid'), { path: dir })) }))
            }, err => setError(fill(t('binPickFailed'), { error: String(err?.message ?? err) })))
          }
          const revert = () => { setError(null); setBusy(true); done(api.clearLlamaPath()) }
          let detail
          if (found) detail = h('span', { style: { ...code, color: secondary } }, bin.path)
          else if (custom) detail = h('span', { style: { ...code, color: danger } }, fill(t('binCustomInvalid'), { path: bin.dir || bin.path }))
          else detail = h('span', { style: { ...code, color: secondary } }, fill(t('installCmd'), { cmd }), ' ',
            h('a', { href: '#', onClick: e => { e.preventDefault(); copy() }, style: { fontFamily: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer' } }, copied ? t('copied') : t('copy')))
          return h('section', { style: sectionStyle },
            h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8 } },
              statusIcon(found),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 } },
                h('span', { style: { fontSize: 13, fontWeight: 600 } }, 'llama-server'),
                detail,
                custom && found ? h('span', { style: muted }, fill(t('binCustomFrom'), { path: bin.dir })) : null,
                !found && !custom ? h('span', { style: muted }, t('installAfter')) : null,
                error ? h('span', { style: { ...muted, color: danger } }, error) : null),
              h('button', { type: 'button', disabled: busy, onClick: custom ? revert : customize, style: { fontSize: 12, cursor: 'pointer', flexShrink: 0, alignSelf: 'center' } }, custom ? t('binRevert') : t('binCustomize'))))
        }

        function PresetSection({ t }) {
          const [preset, setPreset] = React.useState(null)
          React.useEffect(() => {
            api.readPreset().then(setPreset, err => { console.error('[llama.cpp] readPreset failed', err); setPreset({ exists: false, path: null, text: '' }) })
          }, [])
          if (!preset) return null
          // A missing default file is created on the first save.
          return h(Collapsible, { title: 'models.user.ini', description: preset.path },
            preset.envMissing
              ? h('div', { style: { ...muted, color: 'var(--dsw-color-danger, #d33)' } }, fill(t('envMissing'), { name: 'LLAMA_ARG_MODELS_PRESET', path: preset.path }))
              : h(PresetEditor, { t, preset }))
        }

        ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config', key: PKG, locale: NS,
        }, (props = {}) => (props.view === 'summary' ? null : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          h(BinarySection, { t }),
          h(PresetSection, { t }),
          h(LogPanel, { t }))))), 'llama-cpp: detail page')

        ctx.effect(() => ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
          name: 'settings.models.provider-card', key: PI_AI_NS, locale: NS,
        }, Extra)), 'llama-cpp: provider card')
      },
    }
  },
})
