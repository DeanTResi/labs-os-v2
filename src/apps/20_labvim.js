// labvim: a modal editor over OS.fs, with a LazyLabs dashboard, a fuzzy file finder and a lualine-style statusline.
(() => {
  const { h, esc } = OS;
  const HOME = OS.fs.home;
  const CWD = HOME + '/labs';
  const LH = 18;
  const TS = 4;
  const IW = 2;
  const CONFIG = HOME + '/.config/labvim/init.lua';

  if (!OS.fs.exists(CONFIG)) {
    OS.fs.seed({
      [CONFIG]: [
        '-- labvim config. LazyLabs reads this, then does what it was going to do anyway.',
        'vim.g.mapleader = " "',
        'vim.opt.number = true',
        'vim.opt.relativenumber = false',
        'vim.opt.scrolloff = 4',
        '',
        'require("lazylabs").setup({',
        '  { "labs/bricky.labvim", enabled = true },          -- shows Bricky. The one that does something.',
        '  { "labs/not-worse-than-main.labvim" },             -- prints a tick',
        '  { "labs/design-review.labvim", rounds = 5 },       -- round 6 is booked',
        '  { "labs/gold.labvim", readonly = true },',
        '  { "labs/craft-cleanup.labvim", auto = "always" },',
        '  { "labs/spend-cap.labvim", usd = 100 },',
        '  -- 41 more. Each one loads in under a millisecond, then waits.',
        '})',
        '',
      ].join('\n'),
    });
  }

  // ---------- filetypes and syntax ----------
  const EXT = {
    rb: 'ruby', rake: 'ruby', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    md: 'markdown', yml: 'yaml', yaml: 'yaml', json: 'json', lua: 'lua', sh: 'sh', css: 'css', conf: 'conf', py: 'python', html: 'html',
  };
  function filetype(path, first) {
    const base = (path || '').split('/').pop();
    const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
    if (EXT[ext]) return EXT[ext];
    if (/^Gemfile$|^Rakefile$/.test(base)) return 'ruby';
    if (/^#!.*\b(ruby)\b/.test(first || '')) return 'ruby';
    if (/^#!.*\b(sh|bash|zsh)\b/.test(first || '')) return 'sh';
    if (/^\.(bashrc|zshrc|profile)$/.test(base)) return 'sh';
    if (/^\/etc\//.test(path || '') && /=/.test(first || '')) return 'conf';
    return 'text';
  }
  const words = (s) => new Set(s.split(' ').filter(Boolean));
  const JS_KW = 'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this super yield delete void null undefined true false';
  const LANG = {
    javascript: { kw: words(JS_KW), line: '//', block: ['/*', '*/'], q: '\'"`', tmpl: '`', id: /^[A-Za-z_$][\w$]*/ },
    typescript: { kw: words(JS_KW + ' interface type enum implements readonly private public protected as keyof declare namespace'), line: '//', block: ['/*', '*/'], q: '\'"`', tmpl: '`', id: /^[A-Za-z_$][\w$]*/ },
    ruby: { kw: words('def end if elsif else unless while until do class module return yield self nil true false and or not then case when begin rescue ensure raise require require_relative include extend attr_reader attr_accessor attr_writer private protected super in'), line: '#', q: '\'"', id: /^@{0,2}[A-Za-z_][\w]*[?!]?/, sym: true },
    lua: { kw: words('local function end if then else elseif for in do while repeat until return true false nil and or not require'), line: '--', q: '\'"', id: /^[A-Za-z_][\w]*/ },
    sh: { kw: words('if then else elif fi for do done while case esac function return export exec local echo alias source in'), line: '#', q: '\'"', id: /^[A-Za-z_$][\w]*/ },
    python: { kw: words('def class return if elif else for while in import from as with try except finally raise None True False and or not lambda pass yield'), line: '#', q: '\'"', id: /^[A-Za-z_][\w]*/ },
    css: { kw: words(''), block: ['/*', '*/'], q: '\'"', id: /^[A-Za-z_-][\w-]*/ },
    json: { kw: words('true false null'), q: '"', id: /^[A-Za-z_][\w]*/ },
    conf: { kw: words('bind general'), line: '#', q: '\'"', id: /^[A-Za-z_][\w.]*/ },
  };

  function push(out, k, t) {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last[0] === k) last[1] += t; else out.push([k, t]);
  }

  // One line of a C-like or script language. st carries an open block comment or template string.
  function tokCode(s, L, st) {
    const out = [];
    let i = 0;
    if (st === 'block') {
      const j = s.indexOf(L.block[1]);
      if (j < 0) { push(out, 'cm', s); return { toks: out, st: 'block' }; }
      push(out, 'cm', s.slice(0, j + L.block[1].length)); i = j + L.block[1].length;
    } else if (st === 'tmpl') {
      let j = 0;
      while (j < s.length && s[j] !== '`') { if (s[j] === '\\') j++; j++; }
      if (j >= s.length) { push(out, 'st', s); return { toks: out, st: 'tmpl' }; }
      push(out, 'st', s.slice(0, j + 1)); i = j + 1;
    }
    while (i < s.length) {
      const c = s[i];
      const rest = s.slice(i);
      if (L.line && rest.startsWith(L.line)) { push(out, 'cm', rest); break; }
      if (L.block && rest.startsWith(L.block[0])) {
        const j = s.indexOf(L.block[1], i + L.block[0].length);
        if (j < 0) { push(out, 'cm', rest); return { toks: out, st: 'block' }; }
        push(out, 'cm', s.slice(i, j + L.block[1].length)); i = j + L.block[1].length; continue;
      }
      if (L.q.includes(c)) {
        let j = i + 1;
        while (j < s.length && s[j] !== c) { if (s[j] === '\\') j++; j++; }
        if (j >= s.length && c === L.tmpl) { push(out, 'st', rest); return { toks: out, st: 'tmpl' }; }
        push(out, 'st', s.slice(i, j + 1)); i = j + 1; continue;
      }
      if (/\d/.test(c) && !/[\w$]/.test(s[i - 1] || '')) {
        const m = /^(0x[\da-f]+|\d[\d_]*(\.\d+)?(e[+-]?\d+)?)/i.exec(rest);
        push(out, 'nu', m[0]); i += m[0].length; continue;
      }
      if (L.sym && c === ':' && /[A-Za-z_]/.test(s[i + 1] || '') && s[i - 1] !== ':') {
        const m = /^:[A-Za-z_]\w*[?!]?/.exec(rest);
        push(out, 'sy', m[0]); i += m[0].length; continue;
      }
      const m = L.id.exec(rest);
      if (m) {
        const w = m[0];
        let k = 'tx';
        if (L.kw.has(w)) k = 'kw';
        else if (w[0] === '@') k = 'va';
        else if (/^[A-Z][A-Z0-9_]+$/.test(w)) k = 'co';
        else if (/^[A-Z]/.test(w)) k = 'ty';
        else if (s[i + w.length] === '(') k = 'fn';
        else if (L.sym && /^\w+:\s/.test(s.slice(i, i + w.length + 2))) k = 'sy';
        push(out, k, w); i += w.length; continue;
      }
      push(out, /[=+\-*/<>!&|?%^~]/.test(c) ? 'op' : (/[()[\]{},;.:]/.test(c) ? 'pu' : 'tx'), c);
      i++;
    }
    return { toks: out, st: null };
  }

  function tokMarkdown(s, st) {
    const out = [];
    if (/^\s*```/.test(s)) { push(out, 'cm', s); return { toks: out, st: st === 'fence' ? null : 'fence' }; }
    if (st === 'fence') { push(out, 'st', s); return { toks: out, st }; }
    if (/^#{1,6}\s/.test(s)) { push(out, 'h1', s); return { toks: out, st: null }; }
    if (/^\s*>/.test(s)) { push(out, 'cm', s); return { toks: out, st: null }; }
    let rest = s;
    const lm = /^(\s*)([-*+]|\d+\.)(\s+)(\[[ xX]\]\s)?/.exec(rest);
    if (lm) { push(out, 'tx', lm[1]); push(out, 'kw', lm[2]); push(out, 'tx', lm[3]); if (lm[4]) push(out, 'nu', lm[4]); rest = rest.slice(lm[0].length); }
    const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
    let at = 0; let m;
    while ((m = re.exec(rest))) {
      push(out, 'tx', rest.slice(at, m.index));
      if (m[1]) push(out, 'st', m[1]);
      else if (m[2]) push(out, 'b', m[2]);
      else { const k = m[3].indexOf(']('); push(out, 'fn', m[3].slice(0, k + 1)); push(out, 'cm', m[3].slice(k + 1)); }
      at = m.index + m[0].length;
    }
    push(out, 'tx', rest.slice(at));
    return { toks: out, st: null };
  }

  function tokYaml(s) {
    const out = [];
    let body = s; let comment = '';
    let q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === '\'') { q = c; continue; }
      if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) { body = s.slice(0, i); comment = s.slice(i); break; }
    }
    const km = /^(\s*)(-\s+)?([^\s#'"][^:#]*?|"[^"]*"|'[^']*')(:)(\s|$)/.exec(body);
    let rest = body;
    if (km) {
      push(out, 'tx', km[1]); if (km[2]) push(out, 'op', km[2]);
      push(out, 'fn', km[3]); push(out, 'pu', ':');
      rest = body.slice(km[0].length - km[5].length);
    } else {
      const dm = /^(\s*)(-\s+)/.exec(body);
      if (dm) { push(out, 'tx', dm[1]); push(out, 'op', dm[2]); rest = body.slice(dm[0].length); }
    }
    const v = rest.trim();
    if (/^(true|false|null|yes|no|~)$/i.test(v)) push(out, 'co', rest);
    else if (/^-?\d[\d_.]*$/.test(v)) push(out, 'nu', rest);
    else if (/^["'].*["']$/.test(v)) push(out, 'st', rest);
    else if (/^[[{]/.test(v)) push(out, 'ty', rest);
    else push(out, 'tx', rest);
    push(out, 'cm', comment);
    return { toks: out, st: null };
  }

  function tokenize(s, ft, st) {
    if (s.length > 4000) return { toks: [['tx', s]], st };
    if (ft === 'markdown') return tokMarkdown(s, st);
    if (ft === 'yaml') return tokYaml(s);
    const L = LANG[ft];
    if (!L) return { toks: [['tx', s]], st: null };
    return tokCode(s, L, st);
  }

  const CSS = `
.lv { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); font: 13px/${LH}px var(--mono); overflow: hidden; --mc: var(--accent); }
.lv[data-mode=insert] { --mc: var(--good); } .lv[data-mode=command] { --mc: var(--warn); } .lv[data-mode=search] { --mc: var(--warn); }
.lv[data-mode=finder] { --mc: var(--info); } .lv[data-mode=replace] { --mc: var(--bad); }
.lv-ta { position: absolute; left: 0; top: 0; width: 2px; height: ${LH}px; opacity: 0; padding: 0; margin: 0; border: 0; outline: none; resize: none; overflow: hidden; white-space: pre; color: transparent; background: transparent; z-index: 0; }
.lv-tabs { display: flex; align-items: stretch; height: 26px; flex: none; background: var(--surface); border-bottom: 1px solid var(--border); font-size: 12px; user-select: none; }
.lv-tab { display: flex; align-items: center; gap: 7px; padding: 0 14px; color: var(--muted); border-right: 1px solid var(--border); min-width: 0; }
.lv-tab.on { background: var(--bg); color: var(--fg); box-shadow: inset 0 2px 0 var(--accent); }
.lv-tab .icon { width: 13px; height: 13px; color: var(--accent2); }
.lv-tab .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lv-tab .st { color: var(--faint); } .lv-tab .st.mod { color: var(--warn); }
.lv-tabs .sp { flex: 1; } .lv-tabs .lz { display: flex; align-items: center; gap: 6px; padding: 0 12px; color: var(--faint); white-space: nowrap; }
.lv-tabs .lz b { color: var(--accent); font-weight: 800; }
.lv-crumb { height: 20px; line-height: 20px; flex: none; padding: 0 12px; color: var(--faint); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: none; }
.lv-crumb .sep { color: var(--faint); margin: 0 6px; } .lv-crumb .seg { color: var(--muted); } .lv-crumb .last { color: var(--fg); }
.lv-main { position: relative; flex: 1; min-height: 0; overflow: hidden; cursor: text; }
.lv-rows { position: absolute; inset: 0; }
.lv-row { height: ${LH}px; display: flex; white-space: pre; }
.lv-row.cl { background: color-mix(in srgb, var(--sel) 55%, transparent); }
.lv-gut { flex: none; display: flex; color: var(--faint); user-select: none; }
.lv-gut .sg { width: 1ch; flex: none; }
.lv-gut .sg.add { box-shadow: inset 2px 0 0 var(--good); }
.lv-gut .n { flex: 1; text-align: right; padding-right: 1ch; }
.lv-row.cl .lv-gut .n { color: var(--warn); font-weight: 700; }
.lv-txt { flex: 1; min-width: 0; overflow: hidden; }
.lv-kw { color: var(--accent2); } .lv-st { color: var(--good); } .lv-nu { color: var(--warn); } .lv-fn { color: var(--info); }
.lv-ty { color: var(--warn); } .lv-co { color: var(--warn); font-weight: 700; } .lv-cm { color: var(--faint); font-style: italic; }
.lv-va { color: var(--bad); } .lv-op { color: var(--info); } .lv-pu { color: var(--muted); } .lv-sy { color: var(--info); }
.lv-h1 { color: var(--accent); font-weight: 800; } .lv-b { font-weight: 800; }
.lv-ig { box-shadow: inset 1px 0 0 color-mix(in srgb, var(--faint) 55%, transparent); }
.lv-m { background: color-mix(in srgb, var(--warn) 32%, transparent); border-radius: 2px; }
.lv-cur { position: absolute; height: ${LH}px; width: 1ch; background: var(--fg); color: var(--bg); white-space: pre; pointer-events: none; z-index: 2; border-radius: 1px; }
.lv-cur.ins { width: 2px; background: var(--mc); color: transparent; overflow: hidden; animation: lv-blink 1.06s steps(1) infinite; }
.lv-cur.blur { background: transparent; color: inherit; box-shadow: inset 0 0 0 1px var(--muted); animation: none; }
.lv-cur.ins.blur { box-shadow: none; background: var(--muted); }
@keyframes lv-blink { 50% { opacity: 0; } }
.lv-sl { height: 22px; line-height: 22px; display: flex; flex: none; background: var(--surface); font-size: 12px; white-space: nowrap; overflow: hidden; user-select: none; }
.lv-sl > span { display: flex; align-items: center; gap: 6px; position: relative; }
.lv-sl .icon { width: 12px; height: 12px; }
.lv-sl .md { background: var(--mc); color: var(--on-accent); font-weight: 800; letter-spacing: .06em; padding: 0 18px 0 11px; z-index: 3; clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%); }
.lv-sl .b2 { background: var(--surface2); color: var(--fg); margin-left: -8px; padding: 0 18px 0 16px; z-index: 2; clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%); }
.lv-sl .b2 .icon { color: var(--mc); }
.lv-sl > span.fl { display: block; flex: 0 1 auto; padding: 0 10px 0 6px; color: var(--fg); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.lv-sl .fl .mod { color: var(--warn); } .lv-sl .fl .ro { color: var(--bad); }
.lv-sl .sp { flex: 1; }
.lv-sl .ft { color: var(--muted); padding: 0 10px; }
.lv-sl .ft i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent2); display: inline-block; }
.lv-sl .r2 { background: var(--surface2); color: var(--fg); padding: 0 10px 0 16px; margin-right: -8px; z-index: 2; clip-path: polygon(8px 0, 100% 0, 100% 100%, 8px 100%, 0 50%); }
.lv-sl .r1 { background: var(--mc); color: var(--on-accent); font-weight: 800; padding: 0 11px 0 16px; z-index: 3; clip-path: polygon(8px 0, 100% 0, 100% 100%, 8px 100%, 0 50%); }
.lv-cmd { height: 20px; line-height: 20px; flex: none; display: flex; padding: 0 10px; white-space: pre; overflow: hidden; }
.lv-cmd .tx { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.lv-cmd .err { color: var(--bad); } .lv-cmd .warn { color: var(--warn); } .lv-cmd .ok { color: var(--good); } .lv-cmd .bold { font-weight: 800; }
.lv-cmd .sc { color: var(--faint); padding-left: 12px; }
.lv-cmd .cc { background: var(--fg); color: var(--bg); }
.lv-wk { position: absolute; left: 8px; right: 8px; bottom: 6px; z-index: 4; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px 10px; box-shadow: 0 10px 30px rgba(0,0,0,.35); display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 2px 18px; }
.lv-wk .wt { grid-column: 1 / -1; color: var(--accent); font-weight: 800; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
.lv-wk .k { color: var(--warn); font-weight: 800; } .lv-wk .a { color: var(--faint); margin: 0 8px; } .lv-wk .g { color: var(--accent2); }
.lv-pop { position: absolute; top: 22%; left: 50%; transform: translateX(-50%); width: max-content; max-width: min(520px, 86%); z-index: 7; background: var(--surface); border: 1px solid var(--mc); border-radius: 8px; padding: 8px 12px; box-shadow: 0 10px 30px rgba(0,0,0,.35); white-space: normal; }
.lv-pop .pt { color: var(--mc); font-weight: 800; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 2px; }
.lv-dash { position: absolute; inset: 0; z-index: 3; background: var(--bg); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; overflow: hidden; padding: 12px; user-select: none; }
.lv-logo { display: block; width: min(440px, 88%); height: auto; flex: none; }
.lv-logo.txt { width: auto; font-size: 22px; font-weight: 800; color: var(--accent); }
.lv-tag { color: var(--muted); margin-top: -8px; text-align: center; }
.lv-items { display: flex; flex-direction: column; gap: 2px; width: min(440px, 100%); }
.lv-it { display: grid; grid-template-columns: 18px 1fr auto 14px; align-items: center; gap: 12px; padding: 3px 12px; border-radius: 6px; cursor: pointer; }
.lv-it .icon { width: 15px; height: 15px; color: var(--accent2); }
.lv-it .k { color: var(--warn); font-weight: 800; }
.lv-it.sel { background: var(--sel); } .lv-it.sel .lb { color: var(--fg); } .lv-it .lb { color: var(--muted); }
.lv-it .rp { color: var(--faint); font-size: 12px; }
.lv-ft { color: var(--faint); font-size: 12px; text-align: center; }
.lv-ft b { color: var(--accent); }
.lv-fzbg { position: absolute; inset: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 88%, transparent); }
.lv-fz { position: absolute; inset: 5% 4%; z-index: 6; display: flex; gap: 8px; }
.lv-pane { position: relative; display: flex; flex-direction: column; min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; box-shadow: 0 14px 40px rgba(0,0,0,.35); }
.lv-pane.list { flex: 1 1 44%; } .lv-pane.prev { flex: 1 1 56%; }
.lv-pane .pt { flex: none; padding: 5px 12px; color: var(--accent); font-weight: 800; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; border-bottom: 1px solid var(--border); display: flex; gap: 8px; }
.lv-pane .pt .cnt { margin-left: auto; color: var(--faint); letter-spacing: 0; text-transform: none; font-weight: 400; }
.lv-pane .q { flex: none; padding: 6px 12px; border-bottom: 1px solid var(--border); white-space: pre; overflow: hidden; }
.lv-pane .q .p { color: var(--accent); font-weight: 800; }
.lv-pane .q .cc { background: var(--fg); color: var(--bg); }
.lv-pane .rs { flex: 1; min-height: 0; overflow: hidden; padding: 4px 0; }
.lv-r { height: 20px; line-height: 20px; padding: 0 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; color: var(--muted); }
.lv-r b { color: var(--fg); font-weight: 400; }
.lv-r mark { background: none; color: var(--accent); font-weight: 800; }
.lv-r.sel { background: var(--sel); box-shadow: inset 2px 0 0 var(--accent); }
.lv-r.sel b { font-weight: 700; }
.lv-r .tg { color: var(--accent2); font-size: 11px; margin-left: 8px; }
.lv-pv { flex: 1; min-height: 0; overflow: hidden; padding: 4px 0; white-space: pre; }
.lv-pv .lv-row .lv-gut .n { color: var(--faint); font-weight: 400; }
.lv-empty { padding: 10px 12px; color: var(--faint); }
.lv-narrow .lv-sl .ft, .lv-narrow .lv-tabs .lz, .lv-narrow .lv-it .rp { display: none; }
.lv-tiny .lv-sl .b2 { display: none; } .lv-tiny .lv-sl .r1 { display: none; }
`;

  const GLYPHS = {
    L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
    A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
    B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
    V: ['██╗   ██╗', '██║   ██║', '██║   ██║', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚═══╝  '],
    I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
    M: ['███╗   ███╗', '████╗ ████║', '██╔████╔██║', '██║╚██╔╝██║', '██║ ╚═╝ ██║', '╚═╝     ╚═╝'],
  };
  const LOGO = [0, 1, 2, 3, 4, 5].map((r) => [...'LABVIM'].map((c) => GLYPHS[c][r]).join(''));
  const LOGO_W = LOGO[0].length;
  // The block letters as SVG: one rect per full block, one stroke per box-drawing shadow, so rows join at any size.
  const LOGO_SVG = (() => {
    const cw = 10; const chh = 20; let rects = ''; let d = '';
    LOGO.forEach((row, r) => [...row].forEach((c, x) => {
      const X = x * cw; const Y = r * chh; const mx = X + cw / 2; const my = Y + chh / 2;
      if (c === '█') {
        if (row[x - 1] === '█') return;
        let n = 1; while (row[x + n] === '█') n++;
        rects += `<rect x="${X}" y="${Y}" width="${n * cw}" height="${chh + 1}"/>`;
        return;
      }
      d += { '═': `M${X} ${my}H${X + cw}`, '║': `M${mx} ${Y}V${Y + chh}`, '╗': `M${X} ${my}H${mx}V${Y + chh}`, '╝': `M${X} ${my}H${mx}V${Y}`, '╚': `M${X + cw} ${my}H${mx}V${Y}`, '╔': `M${X + cw} ${my}H${mx}V${Y + chh}` }[c] || '';
    }));
    return `<svg class="lv-logo" viewBox="0 0 ${LOGO_W * cw} ${6 * chh}" role="img" aria-label="LABVIM"><defs><linearGradient id="lv-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent2)"/></linearGradient></defs>`
      + `<path d="${d}" fill="none" style="stroke:var(--accent2)" stroke-opacity=".45" stroke-width="2.2"/><g fill="url(#lv-grad)" shape-rendering="crispEdges">${rects}</g></svg>`;
  })();

  const recent = () => OS.store.get('labvim.recent', []).filter((p) => typeof p === 'string');
  const addRecent = (p) => OS.store.set('labvim.recent', [p, ...recent().filter((x) => x !== p)].slice(0, 12));
  const disp = (p) => (p === HOME ? '~' : p && p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p || '[No Name]');
  const bytes = (t) => new TextEncoder().encode(t).length;
  const wordCls = (c) => (c === undefined || /\s/.test(c) ? 0 : /[\wÀ-￿]/.test(c) ? 1 : 2);
  function readonlyWhy(p) {
    if (!p) return null;
    if (/^\/usr\/src\//.test(p)) return 'src';
    if (/^\/proc\//.test(p)) return 'proc';
    if (/^\/gold\//.test(p)) return 'gold';
    return null;
  }

  // Subsequence match, basename first. Returns {score, hits} or null.
  function fuzzy(q, text) {
    const s = q.toLowerCase().replace(/\s+/g, '');
    if (!s) return { score: 0, hits: [] };
    const run = (t, off) => {
      let ti = 0; let score = 0; let prev = -2; const hits = [];
      for (const ch of s) {
        const i = t.indexOf(ch, ti);
        if (i < 0) return null;
        score += 1 + (i === prev + 1 ? 4 : 0) + (i === 0 || /[\s_\-./]/.test(t[i - 1]) ? 3 : 0);
        hits.push(i + off); prev = i; ti = i + 1;
      }
      return { score, hits };
    };
    const low = text.toLowerCase();
    const base = low.lastIndexOf('/') + 1;
    const b = run(low.slice(base), base);
    if (b) return { score: b.score + 12 - text.length * 0.02, hits: b.hits };
    const a = run(low, 0);
    return a ? { score: a.score - text.length * 0.02, hits: a.hits } : null;
  }

  function createEditor(win, arg) {
    const S = win.state;
    Object.assign(S, {
      mode: 'dashboard', lines: [''], cy: 0, cx: 0, want: 0, top: 0, left: 0,
      path: null, ft: 'text', eol: true, saved: '', modified: false, orig: new Set(), readonly: null,
      undo: [], redo: [], seq: 0, reg: { text: '', linewise: false },
      count: '', op: null, opCount: '', prefix: '', escs: 0,
      cmd: '', cmdType: ':', hist: OS.store.get('labvim.hist', []), histAt: -1,
      search: '', searchDir: 1, hl: false, msg: null, number: true, rnu: false,
      states: [], dirty: true, dashSel: 0, finder: null, wk: null, pop: null, chW: 0, rows: 1, cols: 1, gut: 0,
    });

    const root = h('div', { class: 'lv', dataset: { mode: 'normal' } });
    const ta = h('textarea', { class: 'lv-ta', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', wrap: 'off', 'aria-label': 'labvim keyboard input' });
    const tabs = h('div', { class: 'lv-tabs' });
    const crumb = h('div', { class: 'lv-crumb' });
    const main = h('div', { class: 'lv-main' });
    const rowsEl = h('div', { class: 'lv-rows' });
    const cur = h('div', { class: 'lv-cur' });
    const layer = h('div');
    const sl = h('div', { class: 'lv-sl' });
    const cmdEl = h('div', { class: 'lv-cmd' });
    main.append(rowsEl, cur, layer);
    root.append(tabs, crumb, main, sl, cmdEl, ta);
    win.body.append(root);

    // ---------- buffer ----------
    const line = (y = S.cy) => S.lines[y] ?? '';
    const text = () => {
      const t = S.lines.join('\n');
      return S.eol && !(S.lines.length === 1 && S.lines[0] === '') ? t + '\n' : t;
    };
    const msg = (t, k = '') => { S.msg = { t, k }; };
    const changed = () => { S.dirty = true; S.modified = text() !== S.saved; updateTitle(); };
    function snap() {
      S.undo.push({ lines: S.lines.slice(), cy: S.cy, cx: S.cx });
      if (S.undo.length > 400) S.undo.shift();
      S.redo = [];
      S.seq++;
    }
    function restore(from, to, word) {
      const st = from.pop();
      if (!st) { msg(word === 'undo' ? 'Already at oldest change' : 'Already at newest change'); return; }
      to.push({ lines: S.lines.slice(), cy: S.cy, cx: S.cx });
      const diff = st.lines.length - S.lines.length;
      S.lines = st.lines; S.cy = Math.min(st.cy, S.lines.length - 1); S.cx = st.cx;
      clampX(); changed();
      const what = diff === 0 ? '1 change' : `${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'line' : 'lines'} ${diff > 0 ? 'more' : 'less'}`;
      S.seq += word === 'undo' ? -1 : 1;
      msg(`${what}; ${word === 'undo' ? 'before' : 'after'} #${Math.max(0, S.seq + (word === 'undo' ? 1 : 0))}`);
    }

    function updateTitle() {
      const name = S.mode === 'dashboard' && !S.path ? 'dashboard' : (S.path ? OS.fs.basename(S.path) : '[No Name]');
      win.setTitle(`labvim: ${name}`);
      win.setMeta(S.modified ? '[+]' : (S.readonly ? '[RO]' : ''));
    }

    function setBuffer(content, p) {
      S.eol = content === '' || content.endsWith('\n');
      const ls = content.split('\n');
      if (content.endsWith('\n')) ls.pop();
      S.lines = ls.length ? ls : [''];
      S.path = p; S.ft = filetype(p, S.lines[0]); S.readonly = readonlyWhy(p);
      S.saved = text(); S.modified = false; S.orig = new Set(S.lines);
      S.cy = 0; S.cx = 0; S.want = 0; S.top = 0; S.left = 0; S.undo = []; S.redo = []; S.seq = 0; S.dirty = true;
      S.mode = 'normal';
      updateTitle();
    }

    function load(path, at) {
      const p = OS.fs.resolve(CWD, path);
      if (OS.fs.isDir(p)) { msg(`"${disp(p)}" is a directory. Space f f finds the files in it.`, 'warn'); return false; }
      let content = '';
      const isNew = !OS.fs.exists(p);
      if (!isNew) {
        try { content = OS.fs.read(p); } catch (e) { msg(e.message, 'err'); return false; }
      }
      setBuffer(content, p);
      if (at) gotoLine(at - 1);
      if (!isNew) addRecent(p);
      const ro = S.readonly ? ' [RO]' : '';
      msg(isNew ? `"${disp(p)}" [New]` : `"${disp(p)}"${ro} ${S.lines.length}L, ${bytes(content)}B`);
      return true;
    }

    function newBuffer() {
      setBuffer('', null);
      msg('New buffer. :w <path> to name it.');
    }

    function goldCrash(p) {
      const m = /^\/gold\/houses\/(\d+)\//.exec(p);
      const target = `${HOME}/gold-overrides/${m ? m[1] + '.yml' : OS.fs.basename(p)}`;
      win.crash({
        title: 'E212: gold is never edited, only overridden', code: 'E212 GOLD_IS_READ_ONLY', icon: 'padlock',
        lines: [`${disp(p)} is gold. People wrote it and people checked it.`, 'labvim can write this buffer as an override instead, at:', disp(target)],
        actions: [
          {
            label: 'Write the override', primary: true,
            run: () => {
              try { OS.fs.mkdir(OS.fs.dirname(target), { parents: true }); OS.fs.write(target, text()); } catch (e) { msg(`E212: ${e.message}`, 'err'); render(); return; }
              S.path = target; S.readonly = null; S.saved = text(); S.modified = false;
              addRecent(target); updateTitle();
              msg(`"${disp(target)}" written. Gold is unchanged.`, 'ok');
              render(); win.after(0, focusInput);
            },
          },
          { label: 'Cancel', run: () => { win.after(0, focusInput); } },
        ],
      });
    }

    function write(path, force) {
      const p = path ? OS.fs.resolve(CWD, path) : S.path;
      if (!p) { msg('E32: No file name', 'err'); return false; }
      const why = readonlyWhy(p);
      if (why && !force) { msg('E45: \'readonly\' option is set (add ! to override)', 'err'); return false; }
      if (why === 'gold') { goldCrash(p); return false; }
      if (why === 'src') { msg('E212: Can\'t open file for writing: this is the page\'s own source, read from its script tag', 'err'); return false; }
      if (why === 'proc') { msg('E212: Can\'t open file for writing: /proc is written by the kernel, when you read it', 'err'); return false; }
      if (OS.fs.isDir(p)) { msg(`E502: "${disp(p)}" is a directory`, 'err'); return false; }
      const t = text();
      const existed = OS.fs.exists(p);
      try { OS.fs.write(p, t); } catch (e) { msg(`E212: Can't open file for writing: ${e.message}`, 'err'); return false; }
      const copy = S.path && p !== S.path;
      if (!copy) {
        if (!S.path) { S.path = p; S.ft = filetype(p, S.lines[0]); S.readonly = null; S.dirty = true; }
        S.saved = t; S.modified = false;
      }
      addRecent(p);
      msg(`"${disp(p)}"${existed ? '' : ' [New]'} ${S.lines.length}L, ${bytes(t)}B written`);
      updateTitle();
      return true;
    }

    // Reload when another app (Gristle's boring fixes, say) changes the file and this buffer has no edits.
    win.state.offFs = OS.on('fs', (ev) => {
      if (!S.path || ev?.path !== S.path || S.modified) return;
      let t;
      try { t = OS.fs.read(S.path); } catch { return; }
      if (t === S.saved) return;
      const { cy, cx } = S;
      setBuffer(t, S.path);
      S.cy = Math.min(cy, S.lines.length - 1); S.cx = cx; clampX();
      msg(`"${disp(S.path)}" changed on disk; reloaded`, 'warn');
      render();
    });

    // ---------- cursor ----------
    const maxX = (y = S.cy) => Math.max(0, line(y).length - (S.mode === 'insert' ? 0 : 1));
    function clampX() { S.cy = OS.clamp(S.cy, 0, S.lines.length - 1); S.cx = OS.clamp(S.cx, 0, maxX()); }
    function vcol(y, x) {
      const s = line(y); let c = 0;
      for (let i = 0; i < x && i < s.length; i++) c += s[i] === '\t' ? TS - (c % TS) : 1;
      return c;
    }
    function xAtV(y, v) {
      const s = line(y); let c = 0;
      for (let i = 0; i < s.length; i++) { const w = s[i] === '\t' ? TS - (c % TS) : 1; if (c + w > v) return i; c += w; }
      return s.length;
    }
    const firstNb = (y = S.cy) => { const m = /\S/.exec(line(y)); return m ? m.index : Math.max(0, line(y).length - 1); };
    function gotoLine(y) { S.cy = OS.clamp(y, 0, S.lines.length - 1); S.cx = firstNb(); clampX(); S.want = vcol(S.cy, S.cx); }

    // ---------- word motions ----------
    function wordFwd(p) {
      let { y, x } = p; let s = line(y);
      const c0 = wordCls(s[x]);
      if (c0 !== 0) while (x < s.length && wordCls(s[x]) === c0) x++;
      for (;;) {
        while (x < s.length && wordCls(s[x]) === 0) x++;
        if (x < s.length) return { y, x };
        if (y >= S.lines.length - 1) return { y, x: s.length, end: true };
        y++; x = 0; s = line(y);
        if (!s.length) return { y, x: 0 };
      }
    }
    function wordBack(p) {
      let { y, x } = p; let s = line(y);
      x--;
      for (;;) {
        while (x >= 0 && wordCls(s[x]) === 0) x--;
        if (x >= 0) break;
        if (y === 0) return { y: 0, x: 0 };
        y--; s = line(y); x = s.length - 1;
        if (!s.length) return { y, x: 0 };
      }
      const c = wordCls(s[x]);
      while (x > 0 && wordCls(s[x - 1]) === c) x--;
      return { y, x };
    }
    function wordEnd(p) {
      let { y, x } = p; let s = line(y);
      x++;
      for (;;) {
        while (x < s.length && wordCls(s[x]) === 0) x++;
        if (x < s.length) break;
        if (y >= S.lines.length - 1) return { y, x: Math.max(0, s.length - 1) };
        y++; s = line(y); x = 0;
      }
      const c = wordCls(s[x]);
      while (x < s.length - 1 && wordCls(s[x + 1]) === c) x++;
      return { y, x };
    }

    // A motion: {y, x, lw: linewise, inc: inclusive, vert, jump, eol, word} or null.
    function motion(k, n, given, op) {
      const p = { y: S.cy, x: S.cx };
      const repeat = (fn) => { let q = p; for (let i = 0; i < n; i++) q = fn(q); return q; };
      switch (k) {
        case 'h': case '<Left>': case '<BS>': return { y: p.y, x: Math.max(0, p.x - n) };
        case 'l': case '<Right>': return { y: p.y, x: Math.min(line().length - (op ? 0 : 1), p.x + n) };
        case 'j': case '<Down>': return { y: Math.min(S.lines.length - 1, p.y + n), x: p.x, lw: true, vert: true };
        case 'k': case '<Up>': return { y: Math.max(0, p.y - n), x: p.x, lw: true, vert: true };
        case '<CR>': case '+': return { y: Math.min(S.lines.length - 1, p.y + n), x: 0, lw: true, jump: true };
        case '-': return { y: Math.max(0, p.y - n), x: 0, lw: true, jump: true };
        case 'w': {
          if (op === 'c' && wordCls(line()[p.x]) !== 0) {
            let q = wordCls(line()[p.x + 1]) === wordCls(line()[p.x]) ? wordEnd(p) : p;
            for (let i = 1; i < n; i++) q = wordEnd(q);
            return { ...q, inc: true };
          }
          return { ...repeat(wordFwd), word: true };
        }
        case 'b': return repeat(wordBack);
        case 'e': return { ...repeat(wordEnd), inc: true };
        case '0': case '<Home>': return { y: p.y, x: 0 };
        case '^': return { y: p.y, x: firstNb() };
        case '$': case '<End>': { const y = Math.min(S.lines.length - 1, p.y + n - 1); return { y, x: Math.max(0, line(y).length - 1), inc: true, eol: true }; }
        case 'G': return { y: given ? OS.clamp(n - 1, 0, S.lines.length - 1) : S.lines.length - 1, x: 0, lw: true, jump: true };
        case 'gg': return { y: given ? OS.clamp(n - 1, 0, S.lines.length - 1) : 0, x: 0, lw: true, jump: true };
        default: return null;
      }
    }

    function moveTo(m) {
      S.cy = OS.clamp(m.y, 0, S.lines.length - 1);
      if (m.vert) { S.cx = Math.min(xAtV(S.cy, S.want), maxX()); return; }
      S.cx = m.jump ? firstNb() : m.x;
      clampX();
      S.want = m.eol ? Infinity : vcol(S.cy, S.cx);
    }

    // ---------- operators ----------
    function rangeText(a, b) {
      if (a.y === b.y) return line(a.y).slice(a.x, b.x);
      const out = [line(a.y).slice(a.x)];
      for (let y = a.y + 1; y < b.y; y++) out.push(line(y));
      out.push(line(b.y).slice(0, b.x));
      return out.join('\n');
    }
    function delRange(a, b) {
      S.lines.splice(a.y, b.y - a.y + 1, line(a.y).slice(0, a.x) + line(b.y).slice(b.x));
    }
    function opLines(op, y1, y2) {
      const n = y2 - y1 + 1;
      S.reg = { text: S.lines.slice(y1, y2 + 1).join('\n'), linewise: true };
      if (op === 'y') { S.cy = y1; clampX(); if (n > 2) msg(`${n} lines yanked`); return; }
      snap();
      if (op === 'c') {
        const ind = /^\s*/.exec(S.lines[y1])[0];
        S.lines.splice(y1, n, ind); S.cy = y1; S.cx = ind.length; S.mode = 'insert'; changed();
        return;
      }
      S.lines.splice(y1, n);
      if (!S.lines.length) S.lines = [''];
      S.cy = Math.min(y1, S.lines.length - 1); S.cx = firstNb(); clampX(); S.want = vcol(S.cy, S.cx);
      if (n > 2) msg(`${n} fewer lines`);
      changed();
    }
    function applyOp(op, m) {
      if (m.lw) { opLines(op, Math.min(S.cy, m.y), Math.max(S.cy, m.y)); return; }
      let a = { y: S.cy, x: S.cx }; let b = { y: m.y, x: m.x };
      if (b.y < a.y || (b.y === a.y && b.x < a.x)) [a, b] = [b, a];
      if (m.inc) b = { y: b.y, x: Math.min(line(b.y).length, b.x + 1) };
      if (m.word && b.y > a.y && !m.end) b = { y: b.y - 1, x: line(b.y - 1).length };
      if (a.y === b.y && a.x === b.x) return;
      S.reg = { text: rangeText(a, b), linewise: false };
      if (op === 'y') { S.cy = a.y; S.cx = a.x; clampX(); return; }
      snap();
      delRange(a, b);
      S.cy = a.y; S.cx = a.x;
      if (op === 'c') S.mode = 'insert'; else clampX();
      S.want = vcol(S.cy, S.cx);
      changed();
    }
    function put(after, n) {
      const r = S.reg;
      if (!r.text && !r.linewise) { msg('E353: Nothing in register "', 'err'); return; }
      snap();
      if (r.linewise) {
        const ls = r.text.split('\n'); const block = [];
        for (let i = 0; i < n; i++) block.push(...ls);
        const at = after ? S.cy + 1 : S.cy;
        S.lines.splice(at, 0, ...block);
        S.cy = at; S.cx = firstNb();
        if (block.length > 2) msg(`${block.length} more lines`);
      } else {
        const t = r.text.repeat(n); const s = line();
        const at = after && s.length ? S.cx + 1 : S.cx;
        const parts = t.split('\n');
        if (parts.length === 1) { S.lines[S.cy] = s.slice(0, at) + t + s.slice(at); S.cx = at + t.length - 1; }
        else { S.lines.splice(S.cy, 1, s.slice(0, at) + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + s.slice(at)); S.cx = at; }
      }
      clampX(); S.want = vcol(S.cy, S.cx);
      changed();
    }
    function joinLines(n) {
      if (S.cy >= S.lines.length - 1) return;
      snap();
      for (let i = 0; i < Math.max(1, n - 1) && S.cy < S.lines.length - 1; i++) {
        const a = line().replace(/\s+$/, ''); const b = line(S.cy + 1).replace(/^\s+/, '');
        const sep = !a || !b || b.startsWith(')') ? '' : ' ';
        S.lines.splice(S.cy, 2, a + sep + b);
        S.cx = a.length;
      }
      clampX(); changed();
    }
    function delChars(n, before) {
      const s = line();
      if (!s.length) return;
      const a = before ? Math.max(0, S.cx - n) : S.cx;
      const b = before ? S.cx : Math.min(s.length, S.cx + n);
      if (a === b) return;
      snap();
      S.reg = { text: s.slice(a, b), linewise: false };
      S.lines[S.cy] = s.slice(0, a) + s.slice(b);
      S.cx = a; clampX(); changed();
    }
    function replaceChars(ch, n) {
      const s = line();
      if (S.cx + n > s.length) return;
      snap();
      S.lines[S.cy] = s.slice(0, S.cx) + ch.repeat(n) + s.slice(S.cx + n);
      S.cx += n - 1; changed();
    }
    function startInsert(how) {
      if (S.readonly) msg('W10: Warning: Changing a readonly file', 'warn');
      snap();
      S.mode = 'insert';
      if (how === 'a' && line().length) S.cx++;
      if (how === 'A') S.cx = line().length;
      if (how === 'I') S.cx = /^\s*/.exec(line())[0].length;
      if (how === 'o' || how === 'O') {
        const ind = /^\s*/.exec(line())[0];
        const at = how === 'o' ? S.cy + 1 : S.cy;
        S.lines.splice(at, 0, ind);
        S.cy = at; S.cx = ind.length;
        changed();
      }
    }

    // ---------- insert mode ----------
    function insText(t, raw) {
      for (const ch of t) {
        if (ch === '\r') continue;
        if (ch === '\n') { newline(!raw); continue; }
        const s = line();
        S.lines[S.cy] = s.slice(0, S.cx) + ch + s.slice(S.cx);
        S.cx += ch.length;
      }
      S.want = vcol(S.cy, S.cx);
      changed();
    }
    function newline(indent) {
      const s = line(); const head = s.slice(0, S.cx); let tail = s.slice(S.cx);
      let ind = '';
      if (indent) {
        ind = /^\s*/.exec(head)[0];
        if (/[{([]\s*$/.test(head) || (S.ft === 'ruby' && /^\s*(def|class|module|if|unless|while|do)\b|\bdo(\s*\|[^|]*\|)?\s*$/.test(head))) ind += ' '.repeat(IW);
        tail = tail.replace(/^\s+/, '');
      }
      S.lines.splice(S.cy, 1, /^\s+$/.test(head) && indent ? '' : head, ind + tail);
      S.cy++; S.cx = ind.length;
    }
    function insKey(k) {
      const s = line();
      if (k === '<BS>' || k === '<C-h>') {
        if (S.cx > 0) {
          const before = s.slice(0, S.cx);
          const n = /^ +$/.test(before) ? ((S.cx - 1) % IW) + 1 : 1;
          S.lines[S.cy] = s.slice(0, S.cx - n) + s.slice(S.cx); S.cx -= n;
        } else if (S.cy > 0) {
          const prev = line(S.cy - 1);
          S.lines.splice(S.cy - 1, 2, prev + s); S.cy--; S.cx = prev.length;
        }
      } else if (k === '<Del>') {
        if (S.cx < s.length) S.lines[S.cy] = s.slice(0, S.cx) + s.slice(S.cx + 1);
        else if (S.cy < S.lines.length - 1) S.lines.splice(S.cy, 2, s + line(S.cy + 1));
      } else if (k === '<CR>') newline(true);
      else if (k === '<Tab>') { const n = IW - (vcol(S.cy, S.cx) % IW); S.lines[S.cy] = s.slice(0, S.cx) + ' '.repeat(n) + s.slice(S.cx); S.cx += n; }
      else if (k === '<C-w>') { const m = /(\w+|[^\w\s]+)?\s*$/.exec(s.slice(0, S.cx)); const n = m ? m[0].length || 1 : 1; S.lines[S.cy] = s.slice(0, S.cx - n) + s.slice(S.cx); S.cx = Math.max(0, S.cx - n); }
      else if (k === '<C-u>') { const ind = /^\s*/.exec(s)[0].length; const to = S.cx > ind ? ind : 0; S.lines[S.cy] = s.slice(0, to) + s.slice(S.cx); S.cx = to; }
      else if (k === '<Left>') S.cx = Math.max(0, S.cx - 1);
      else if (k === '<Right>') S.cx = Math.min(s.length, S.cx + 1);
      else if (k === '<Up>' || k === '<Down>') { S.cy = OS.clamp(S.cy + (k === '<Up>' ? -1 : 1), 0, S.lines.length - 1); S.cx = Math.min(xAtV(S.cy, S.want), line().length); return; }
      else if (k === '<Home>') S.cx = 0;
      else if (k === '<End>') S.cx = s.length;
      else return;
      S.want = vcol(S.cy, S.cx);
      changed();
    }

    // ---------- search and substitute ----------
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    function searchRe(pat, g = true) {
      if (!pat) return null;
      const flags = (g ? 'g' : '') + (/[A-Z]/.test(pat) ? '' : 'i');
      try { return new RegExp(pat, flags); } catch { return new RegExp(escRe(pat), flags); }
    }
    function matchesIn(re, s) {
      const out = []; re.lastIndex = 0; let m;
      while ((m = re.exec(s))) { out.push([m.index, m.index + Math.max(1, m[0].length)]); if (!m[0].length) re.lastIndex++; if (out.length > 400) break; }
      return out;
    }
    function find(pat, dir) {
      const re = searchRe(pat);
      if (!re) return null;
      const n = S.lines.length;
      for (let k = 0; k <= n; k++) {
        const y = (((S.cy + dir * k) % n) + n) % n;
        const ms = matchesIn(re, line(y)).map((m) => m[0]);
        let x;
        if (dir > 0) x = k === 0 ? ms.find((i) => i > S.cx) : ms[0];
        else x = k === 0 ? [...ms].reverse().find((i) => i < S.cx) : ms[ms.length - 1];
        if (x !== undefined) return { y, x, wrapped: k > 0 && (dir > 0 ? y <= S.cy : y >= S.cy) };
      }
      return null;
    }
    function searchGo(pat, dir) {
      if (!pat) { msg('E35: No previous regular expression', 'err'); return; }
      S.hl = true;
      const r = find(pat, dir);
      if (!r) { msg(`E486: Pattern not found: ${pat}`, 'err'); return; }
      S.cy = r.y; S.cx = r.x; clampX(); S.want = vcol(S.cy, S.cx);
      if (r.wrapped) msg(dir > 0 ? 'search hit BOTTOM, continuing at TOP' : 'search hit TOP, continuing at BOTTOM', 'err');
      else msg((dir > 0 ? '/' : '?') + pat);
    }
    function substitute(y1, y2, body) {
      const d = body[0];
      if (!d || /[\w\s"|]/.test(d)) { msg('E146: Regular expressions can\'t be delimited by letters', 'err'); return; }
      const parts = []; let curPart = '';
      for (let i = 1; i < body.length; i++) {
        const c = body[i];
        if (c === '\\' && body[i + 1] === d) { curPart += d; i++; continue; }
        if (c === d && parts.length < 2) { parts.push(curPart); curPart = ''; continue; }
        curPart += c;
      }
      parts.push(curPart);
      const pat = parts[0] || S.search; const rep = parts[1] || ''; const flags = parts[2] || '';
      if (!pat) { msg('E35: No previous regular expression', 'err'); return; }
      let re;
      const fl = (flags.includes('g') ? 'g' : '') + (flags.includes('i') ? 'i' : '');
      try { re = new RegExp(pat, fl); } catch { re = new RegExp(escRe(pat), fl); }
      const expand = (args) => rep.replace(/\\(\d|&|\\)|&/g, (t, g1) => {
        if (t === '&') return args[0];
        if (g1 === '&' || g1 === '\\') return g1;
        return args[Number(g1)] ?? '';
      });
      let total = 0; let touched = 0; let last = -1;
      const next = S.lines.slice();
      for (let y = y1; y <= y2; y++) {
        let n = 0;
        next[y] = line(y).replace(re, (...args) => { n++; return expand(args); });
        if (n) { total += n; touched++; last = y; }
      }
      if (!total) { msg(`E486: Pattern not found: ${pat}`, 'err'); return; }
      snap();
      S.lines = next.flatMap((l) => l.split('\n'));
      S.search = pat; S.hl = true;
      gotoLine(last);
      msg(`${total} substitution${total === 1 ? '' : 's'} on ${touched} line${touched === 1 ? '' : 's'}`);
      changed();
    }

    // ---------- ex commands ----------
    const E37 = () => msg('E37: No write since last change (add ! to override)', 'err');
    const BRICKY_E37 = [
      'E37 means write it first. :wq writes and quits. :q! quits and forgets. I would pick :wq. I have been forgotten before.',
      'Unsaved changes. :wq keeps them, :q! does not. I am a brick and even I know that one.',
      'You asked to quit with changes nobody has saved. labvim said no. I agree with labvim. That does not happen often.',
    ];
    function quit(force) {
      if (S.modified && !force) {
        E37();
        OS.brickySay(OS.pick(BRICKY_E37));
        return;
      }
      win.close();
    }
    function popup(title, body, ms = 4500) {
      const p = { title, body };
      S.pop = p;
      win.after(ms, () => { if (S.pop === p) { S.pop = null; render(); } });
    }
    function help() {
      if (S.modified) { E37(); return; }
      load('/usr/share/doc/labvim/help.md');
    }
    function gristle() {
      if (!OS.apps.gristle) { msg('E492: Not an editor command: Gristle (the octopus is not installed)', 'err'); return; }
      if (!S.path && S.mode === 'dashboard') { OS.open('gristle'); return; }
      OS.open('gristle', S.path && !S.modified ? { path: S.path } : { text: text(), name: S.path ? disp(S.path) : '[No Name]' });
    }
    function dashboard() {
      if (S.modified) { E37(); return; }
      S.path = null; S.lines = ['']; S.mode = 'dashboard'; S.dashSel = 0; S.modified = false; S.readonly = null;
      updateTitle();
    }
    function setOpt(s) {
      if (!s) { msg(`  number=${S.number ? 'on' : 'off'}  relativenumber=${S.rnu ? 'on' : 'off'}  hlsearch  scrolloff=4  tabstop=${TS}  shiftwidth=${IW}  expandtab`); return; }
      const opts = { number: 'number', nu: 'number', relativenumber: 'rnu', rnu: 'rnu' };
      for (const o of s.split(/\s+/)) {
        const flip = o.endsWith('!'); const ask = o.endsWith('?');
        let k = o.replace(/[!?]$/, ''); let v = true;
        if (k.startsWith('no') && opts[k.slice(2)]) { k = k.slice(2); v = false; }
        if (k.startsWith('inv') && opts[k.slice(3)]) { k = k.slice(3); v = !S[opts[k]]; }
        if (!opts[k]) { msg(`E518: Unknown option: ${o}`, 'err'); return; }
        if (ask) { msg(`  ${S[opts[k]] ? '' : 'no'}${k === 'nu' ? 'number' : k === 'rnu' ? 'relativenumber' : k}`); return; }
        S[opts[k]] = flip ? !S[opts[k]] : v;
      }
      S.dirty = true;
    }
    function ex(src) {
      const raw = src.trim().replace(/^:+/, '');
      if (!raw) return;
      if (raw !== S.hist[0]) { S.hist.unshift(raw); S.hist.length = Math.min(S.hist.length, 50); OS.store.set('labvim.hist', S.hist); }
      if (/^\d+$/.test(raw)) { if (S.mode !== 'dashboard') gotoLine(Number(raw) - 1); return; }
      if (raw === '$') { gotoLine(S.lines.length - 1); return; }
      const sm = /^(%|\.|\$|\d+)?(?:,(\.|\$|\d+))?\s*s(?:ubstitute)?([^\w\s].*)$/.exec(raw);
      if (sm) {
        if (S.mode === 'dashboard') { msg('E21: Cannot make changes, the dashboard is not a buffer', 'err'); return; }
        const num = (t) => OS.clamp(t === '.' ? S.cy : t === '$' ? S.lines.length - 1 : Number(t) - 1, 0, S.lines.length - 1);
        let y1 = S.cy; let y2 = S.cy;
        if (sm[1] === '%') { y1 = 0; y2 = S.lines.length - 1; } else if (sm[1]) { y1 = num(sm[1]); y2 = sm[2] ? num(sm[2]) : y1; }
        if (y1 > y2) [y1, y2] = [y2, y1];
        substitute(y1, y2, sm[3]);
        return;
      }
      const m = /^([A-Za-z]+)(!?)\s*(.*)$/.exec(raw);
      if (!m) { msg(`E492: Not an editor command: ${raw}`, 'err'); return; }
      const [, c, bang, rest] = m;
      const force = bang === '!';
      switch (c) {
        case 'w': case 'write': case 'up': case 'update':
          if (S.mode === 'dashboard') { msg('E32: No file name', 'err'); return; }
          write(rest, force); return;
        case 'wq': case 'x': case 'xit': case 'exit': case 'wqa': case 'xa':
          if (S.mode === 'dashboard' || (c !== 'wq' && !S.modified && !rest)) { quit(true); return; }
          if (write(rest, force)) quit(true);
          return;
        case 'q': case 'quit': case 'qa': case 'qall': case 'quitall': case 'clo': case 'close': quit(force); return;
        case 'wa': case 'wall': if (S.modified) write('', force); return;
        case 'e': case 'edit':
          if (!rest) {
            if (!S.path) { msg('E32: No file name', 'err'); return; }
            if (S.modified && !force) { E37(); return; }
            load(S.path); return;
          }
          if (S.modified && !force) { E37(); return; }
          load(rest); return;
        case 'enew': case 'new': case 'vnew': if (S.modified && !force) { E37(); return; } newBuffer(); return;
        case 'set': case 'se': case 'setlocal': setOpt(rest); return;
        case 'noh': case 'nohlsearch': S.hl = false; return;
        case 'Gristle': gristle(); return;
        case 'help': case 'h': help(); return;
        case 'pwd': msg(disp(CWD)); return;
        case 'Dashboard': dashboard(); return;
        case 'Files': openFinder('files'); return;
        case 'Lazy': popup('LazyLabs', '47 plugins loaded in 3 ms. 46 do nothing. One shows Bricky. Updates: none available, as always.'); return;
        case 'checkhealth': popup('checkhealth', 'labvim: OK. Composer: ✓ not worse than main. Design review: round 6 booked. Spend: ' + OS.usd(OS.spend.today()) + ' today.'); return;
        case 'smile': popup('labvim', 'Bricky is 32 by 32 and does not smile. He has been asked.'); return;
        default: msg(`E492: Not an editor command: ${raw}`, 'err');
      }
    }

    // ---------- normal mode ----------
    const resetPending = () => { S.count = ''; S.op = null; S.opCount = ''; };
    const countN = () => Math.max(1, Number(S.count || 1) * Number(S.opCount || 1));
    function doMotion(key) {
      const given = !!(S.count || S.opCount); const n = countN(); const op = S.op;
      resetPending();
      const m = motion(key, n, given, op);
      if (!m) return;
      if (!op) { moveTo(m); return; }
      const before = S.undo.length;
      applyOp(op, m);
      if (op === 'c' && S.mode !== 'insert' && S.undo.length === before) { snap(); S.mode = 'insert'; }
    }
    function scrollBy(rowsN, moveCursor) {
      S.top = OS.clamp(S.top + rowsN, 0, Math.max(0, S.lines.length - 1));
      if (moveCursor) { S.cy = OS.clamp(S.cy + rowsN, 0, S.lines.length - 1); S.cx = firstNb(); clampX(); }
    }
    function normal(k) {
      if (k === '<Esc>' || k === '<C-c>') {
        const had = S.count || S.op;
        resetPending();
        if (!had) {
          S.escs++;
          if (S.escs >= 5) { S.escs = 0; msg('To exit, type :q and press Enter. Many have tried.', 'warn'); popup('Tip', 'To exit, type :q and press Enter. Many have tried.'); }
        }
        return;
      }
      S.escs = 0;
      if (/^[1-9]$/.test(k) || (k === '0' && S.count)) { S.count += k; return; }
      if (S.op) {
        if (k === S.op) {
          const y2 = Math.min(S.lines.length - 1, S.cy + countN() - 1); const op = S.op;
          resetPending(); opLines(op, S.cy, y2); return;
        }
        if (k === 'g') { S.prefix = 'g'; return; }
        doMotion(k); return;
      }
      const n = countN();
      const half = Math.max(1, Math.floor(S.rows / 2));
      switch (k) {
        case 'i': case 'a': case 'I': case 'A': case 'o': case 'O': startInsert(k); break;
        case 's': delChars(n, false); S.mode = 'insert'; break;
        case 'S': opLines('c', S.cy, Math.min(S.lines.length - 1, S.cy + n - 1)); break;
        case 'x': case '<Del>': delChars(n, false); break;
        case 'X': delChars(n, true); break;
        case 'd': case 'y': case 'c': S.op = k; S.opCount = S.count; S.count = ''; return;
        case 'D': S.op = 'd'; S.opCount = S.count; S.count = ''; doMotion('$'); return;
        case 'C': S.op = 'c'; S.opCount = S.count; S.count = ''; doMotion('$'); return;
        case 'Y': opLines('y', S.cy, Math.min(S.lines.length - 1, S.cy + n - 1)); break;
        case 'p': put(true, n); break;
        case 'P': put(false, n); break;
        case 'J': joinLines(n); break;
        case 'u': for (let i = 0; i < n; i++) restore(S.undo, S.redo, 'undo'); break;
        case '<C-r>': for (let i = 0; i < n; i++) restore(S.redo, S.undo, 'redo'); break;
        case '~': {
          const s = line(); if (!s.length) break;
          snap();
          const end = Math.min(s.length, S.cx + n);
          const sw = [...s.slice(S.cx, end)].map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
          S.lines[S.cy] = s.slice(0, S.cx) + sw + s.slice(end); S.cx = end; clampX(); changed();
          break;
        }
        case 'n': searchGo(S.search, S.searchDir); break;
        case 'N': searchGo(S.search, -S.searchDir); break;
        case '*': case '#': {
          const s = line(); let a = S.cx; let b = S.cx;
          if (wordCls(s[a]) !== 1) { msg('E348: No string under cursor', 'err'); break; }
          while (a > 0 && wordCls(s[a - 1]) === 1) a--;
          while (b < s.length && wordCls(s[b]) === 1) b++;
          S.search = `\\b${escRe(s.slice(a, b))}\\b`; S.searchDir = k === '*' ? 1 : -1;
          searchGo(S.search, S.searchDir); break;
        }
        case '/': case '?': case ':': openCmd(k); break;
        case 'g': case 'Z': case 'r': S.prefix = k; return;
        case ' ': S.prefix = ' '; S.wk = ' '; return;
        case 'v': case 'V': case '<C-v>': msg('Visual mode is booked for design review round 6.', 'warn'); break;
        case '<C-d>': scrollBy(half, true); break;
        case '<C-u>': scrollBy(-half, true); break;
        case '<C-f>': case '<PageDown>': scrollBy(Math.max(1, S.rows - 2), true); break;
        case '<C-b>': case '<PageUp>': scrollBy(-Math.max(1, S.rows - 2), true); break;
        case '<C-e>': scrollBy(1, false); break;
        case '<C-y>': scrollBy(-1, false); break;
        case '<C-s>': write('', false); break;
        case '<C-g>': msg(`"${disp(S.path)}"${S.modified ? ' [Modified]' : ''} ${S.lines.length} lines --${Math.round(((S.cy + 1) / S.lines.length) * 100)}%--`); break;
        default: doMotion(k); return;
      }
      S.count = '';
    }

    const WK = {
      ' ': { title: 'Space', items: [['f', '+find', true], ['g', 'Gristle this buffer'], ['w', 'write'], ['q', 'quit'], ['d', 'dashboard'], ['h', 'help'], ['/', 'search'], ['l', 'LazyLabs']] },
      ' f': { title: 'Space f: find', items: [['f', 'find files'], ['r', 'recent files'], ['n', 'new file'], ['c', 'config']] },
    };
    function prefixKey(k) {
      const p = S.prefix;
      S.prefix = ''; S.wk = null;
      if (k === '<Esc>' || k === '<C-c>') { resetPending(); return; }
      if (p === 'g') { if (k === 'g') doMotion('gg'); else resetPending(); return; }
      if (p === 'Z') { if (k === 'Z') ex('x'); else if (k === 'Q') ex('q!'); resetPending(); return; }
      if (p === 'r') { if ([...k].length === 1) replaceChars(k, countN()); resetPending(); return; }
      resetPending();
      if (p === ' ') {
        if (k === 'f') { S.prefix = ' f'; S.wk = ' f'; return; }
        if (k === 'g') gristle();
        else if (k === 'w') ex('w');
        else if (k === 'q') ex('q');
        else if (k === 'd') dashboard();
        else if (k === 'h') help();
        else if (k === '/') openCmd('/');
        else if (k === 'l') ex('Lazy');
        return;
      }
      if (p === ' f') {
        if (k === 'f') openFinder('files');
        else if (k === 'r') openFinder('recent');
        else if (k === 'n') { if (S.modified) E37(); else newBuffer(); }
        else if (k === 'c') { if (S.modified) E37(); else load(CONFIG); }
      }
    }

    // ---------- command line ----------
    function openCmd(type) {
      S.cmdType = type; S.cmd = ''; S.histAt = -1; S.prevMode = S.mode;
      S.mode = type === ':' ? 'command' : 'search';
    }
    function closeCmd() { S.mode = S.prevMode === 'dashboard' ? 'dashboard' : 'normal'; S.cmd = ''; }
    const commonPrefix = (arr) => arr.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); });
    function complete() {
      const m = /^(e|edit|w|write|sav)(!?)\s+(.*)$/.exec(S.cmd);
      if (!m) {
        const names = ['write', 'quit', 'wq', 'edit', 'enew', 'set', 'nohlsearch', 'Gristle', 'help', 'Lazy', 'checkhealth', 'Dashboard', 'Files', 'pwd'];
        const hit = names.filter((n) => n.startsWith(S.cmd));
        if (hit.length === 1) S.cmd = hit[0] + ' ';
        else if (hit.length) { S.cmd = commonPrefix(hit); msg(hit.join('  ')); }
        return;
      }
      const part = m[3]; const cut = part.lastIndexOf('/') + 1;
      const dirPart = part.slice(0, cut); const base = part.slice(cut);
      let ents;
      try { ents = OS.fs.ls(OS.fs.resolve(CWD, dirPart || '.')); } catch { return; }
      const hits = ents.filter((e) => e.name.startsWith(base));
      if (!hits.length) return;
      const pre = hits.length === 1 ? hits[0].name + (hits[0].type === 'dir' ? '/' : '') : commonPrefix(hits.map((e) => e.name));
      S.cmd = `${m[1]}${m[2]} ${dirPart}${pre}`;
      if (hits.length > 1) msg(hits.slice(0, 14).map((e) => e.name + (e.type === 'dir' ? '/' : '')).join('  '));
    }
    function cmdKey(k) {
      if (k === '<Esc>' || k === '<C-c>') { closeCmd(); return; }
      if (k === '<CR>') {
        const c = S.cmd; const t = S.cmdType;
        closeCmd();
        if (t === ':') { ex(c); return; }
        const pat = c || S.search;
        S.search = pat; S.searchDir = t === '/' ? 1 : -1;
        searchGo(pat, S.searchDir);
        return;
      }
      if (k === '<BS>' || k === '<C-h>') { if (!S.cmd) { closeCmd(); return; } S.cmd = [...S.cmd].slice(0, -1).join(''); return; }
      if (k === '<C-u>') { S.cmd = ''; return; }
      if (k === '<C-w>') { S.cmd = S.cmd.replace(/(\w+|[^\w\s]+)?\s*$/, ''); return; }
      if (k === '<Up>' || k === '<Down>') {
        if (S.cmdType !== ':' || !S.hist.length) return;
        S.histAt = OS.clamp(S.histAt + (k === '<Up>' ? 1 : -1), -1, S.hist.length - 1);
        S.cmd = S.histAt < 0 ? '' : S.hist[S.histAt];
        return;
      }
      if (k === '<Tab>') { if (S.cmdType === ':') complete(); return; }
      if ([...k].length === 1) S.cmd += k;
    }

    // ---------- dashboard ----------
    const DASH = [
      { k: 'f', icon: 'search', label: 'Find file', hint: 'Space f f', run: () => openFinder('files') },
      { k: 'n', icon: 'files-outline', label: 'New file', hint: ':enew', run: () => newBuffer() },
      { k: 'r', icon: 'hourglass', label: 'Recent files', hint: 'Space f r', run: () => openFinder('recent') },
      { k: 'g', icon: 'octopus', label: 'Gristle review', hint: ':Gristle', run: () => gristle() },
      { k: 'c', icon: 'sliders', label: 'Config', hint: 'init.lua', run: () => load(CONFIG) },
      { k: 'h', icon: 'question', label: 'Help', hint: ':help', run: () => help() },
      { k: 'q', icon: 'exit', label: 'Quit', hint: ':q', run: () => win.close() },
    ];
    function dashKey(k) {
      if (k === 'j' || k === '<Down>' || k === '<Tab>') S.dashSel = (S.dashSel + 1) % DASH.length;
      else if (k === 'k' || k === '<Up>') S.dashSel = (S.dashSel + DASH.length - 1) % DASH.length;
      else if (k === '<CR>') DASH[S.dashSel].run();
      else if (k === ':') openCmd(':');
      else if (k === ' ') { S.prefix = ' '; S.wk = ' '; }
      else if (k === '<Esc>' || k === '<C-c>') normal(k);
      else if (/^[1-4]$/.test(k)) { const p = recent().filter((x) => OS.fs.isFile(x))[Number(k) - 1]; if (p) load(p); }
      else { const it = DASH.find((d) => d.k === k); if (it) it.run(); }
    }

    // ---------- finder ----------
    function openFinder(scope) {
      const all = scope === 'recent'
        ? recent().filter((p) => OS.fs.isFile(p))
        : OS.fs.walk('/').filter((p) => !p.startsWith('/proc/') && OS.fs.isFile(p));
      S.finder = { scope, all, q: '', sel: 0, items: [], back: S.mode === 'dashboard' && !S.path ? 'dashboard' : 'normal' };
      S.mode = 'finder';
      filterFinder();
    }
    function filterFinder() {
      const F = S.finder; const rec = recent();
      if (!F.q) {
        const rest = F.all.filter((p) => !rec.includes(p)).sort((a, b) => Number(!a.startsWith(CWD)) - Number(!b.startsWith(CWD)) || a.localeCompare(b));
        const first = F.scope === 'recent' ? F.all : rec.filter((p) => F.all.includes(p));
        F.items = (F.scope === 'recent' ? first : [...first, ...rest]).map((p) => ({ p, d: disp(p), hits: [], rec: rec.includes(p) }));
      } else {
        F.items = F.all.map((p) => {
          const d = disp(p); const m = fuzzy(F.q, d);
          return m && { p, d, hits: m.hits, score: m.score + (rec.includes(p) ? 3 : 0), rec: rec.includes(p) };
        }).filter(Boolean).sort((a, b) => b.score - a.score);
      }
      F.sel = OS.clamp(F.sel, 0, Math.max(0, F.items.length - 1));
    }
    function closeFinder() { S.mode = S.finder?.back === 'dashboard' && !S.path ? 'dashboard' : 'normal'; S.finder = null; }
    function openPath(p, at) {
      if (S.path === p) { if (at) gotoLine(at - 1); return; }
      if (S.modified) { E37(); return; }
      load(p, at);
    }
    function finderKey(k) {
      const F = S.finder;
      if (k === '<Esc>' || k === '<C-c>') { closeFinder(); return; }
      if (k === '<CR>') { const it = F.items[F.sel]; closeFinder(); if (it) openPath(it.p); return; }
      if (k === '<Down>' || k === '<C-n>' || k === '<C-j>' || k === '<Tab>') { F.sel = Math.min(Math.max(0, F.items.length - 1), F.sel + 1); return; }
      if (k === '<Up>' || k === '<C-p>') { F.sel = Math.max(0, F.sel - 1); return; }
      if (k === '<BS>' || k === '<C-h>') { F.q = [...F.q].slice(0, -1).join(''); F.sel = 0; filterFinder(); return; }
      if (k === '<C-u>') { F.q = ''; F.sel = 0; filterFinder(); return; }
      if ([...k].length === 1 && k !== '\n') { F.q += k; F.sel = 0; filterFinder(); }
    }

    // ---------- input ----------
    const NAMED = { Escape: '<Esc>', Enter: '<CR>', Backspace: '<BS>', Delete: '<Del>', Tab: '<Tab>', ArrowUp: '<Up>', ArrowDown: '<Down>', ArrowLeft: '<Left>', ArrowRight: '<Right>', Home: '<Home>', End: '<End>', PageUp: '<PageUp>', PageDown: '<PageDown>' };
    function keyName(e) {
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === '[') return '<Esc>';
        if (e.key.length === 1 && !/^[vxa]$/i.test(e.key)) return `<C-${e.key.toLowerCase()}>`;
        return NAMED[e.key] || null;
      }
      if (e.metaKey || e.altKey) return null;
      return NAMED[e.key] || null;
    }
    function dispatch(k, raw) {
      if (k === '\r') return;
      if (k === '\t') k = '<Tab>';
      if (k === '\n' && S.mode !== 'insert') k = '<CR>';
      const m = S.mode;
      if (m === 'finder') { finderKey(k); return; }
      if (m === 'command' || m === 'search') { cmdKey(k); return; }
      if (m === 'insert') {
        if (k === '<Esc>' || k === '<C-c>') { S.mode = 'normal'; S.cx = Math.max(0, S.cx - 1); clampX(); S.want = vcol(S.cy, S.cx); return; }
        if (k.length > 1 && k[0] === '<') { insKey(k); return; }
        insText(k, raw);
        return;
      }
      if (S.prefix) { prefixKey(k); return; }
      if (m === 'dashboard') { dashKey(k); return; }
      normal(k);
    }
    function feed(keys, raw) {
      if (win.closed) return;
      if (S.msg && S.mode !== 'command') S.msg = null;
      for (const k of keys) { dispatch(k, raw); if (win.closed) return; }
      render();
    }
    ta.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const k = keyName(e);
      if (!k) return;
      e.preventDefault();
      feed([k]);
    });
    ta.addEventListener('input', (e) => {
      if (e.isComposing) return;
      const v = ta.value; ta.value = '';
      if (v) feed([...v], v.length > 1);
    });
    ta.addEventListener('compositionend', () => { const v = ta.value; ta.value = ''; if (v) feed([...v], true); });
    const focusInput = () => { if (!win.closed && document.activeElement !== ta && !win.body.querySelector('.ui-crash')) ta.focus({ preventScroll: true }); };

    // ---------- render ----------
    function lineHtml(s, ft, st, left, ncols, re, ig) {
      const toks = tokenize(s, ft, st).toks;
      const kind = new Array(s.length); let i = 0;
      for (const [k, t] of toks) for (let j = 0; j < t.length; j++) kind[i++] = k;
      const mark = re ? new Uint8Array(s.length) : null;
      if (re) for (const [a, b] of matchesIn(re, s)) for (let j = a; j < b && j < s.length; j++) mark[j] = 1;
      let leadV = 0;
      if (ig && /\S/.test(s)) { const lead = /^\s*/.exec(s)[0]; for (const ch of lead) leadV += ch === '\t' ? TS - (leadV % TS) : 1; }
      let html = ''; let run = ''; let runCls = null; let vc = 0;
      const flush = () => { if (run) html += `<span class="${runCls}">${esc(run)}</span>`; run = ''; };
      const end = left + ncols;
      for (let j = 0; j < s.length && vc < end; j++) {
        const ch = s[j]; const w = ch === '\t' ? TS - (vc % TS) : 1;
        for (let c = 0; c < w; c++, vc++) {
          if (vc < left || vc >= end) continue;
          const g = vc < leadV && vc % IW === 0;
          const cls = `lv-${kind[j] || 'tx'}${mark && mark[j] ? ' lv-m' : ''}${g ? ' lv-ig' : ''}`;
          if (cls !== runCls || g) { flush(); runCls = cls; }
          run += ch === '\t' ? ' ' : ch;
          if (g) { flush(); runCls = null; }
        }
      }
      flush();
      return html;
    }
    function computeStates() {
      if (!S.dirty) return;
      const out = new Array(S.lines.length); let st = null;
      for (let i = 0; i < S.lines.length; i++) { out[i] = st; st = tokenize(S.lines[i], S.ft, st).st; }
      S.states = out; S.dirty = false;
    }
    const JSFN = /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)|^\s*(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>|^\s*(?:async\s+)?([\w$]+)\s*\([^)]*\)\s*\{/;
    const CTX = { markdown: /^#{1,6}\s+(.+)/, ruby: /^\s*(?:def|class|module)\s+([\w.:?!=]+)/, javascript: JSFN, typescript: JSFN, lua: /function\s+([\w.:]+)/, yaml: /^([\w-]+):/ };
    const NOT_FN = /^(if|for|while|switch|catch|function|return)$/;
    function context() {
      const re = CTX[S.ft];
      if (!re) return '';
      if (re === JSFN) {
        let depth = 0;
        for (let y = S.cy; y >= Math.max(0, S.cy - 1500); y--) {
          const l = y === S.cy ? line(y).slice(0, S.cx + 1) : line(y);
          for (let i = l.length - 1; i >= 0; i--) { if (l[i] === '}') depth++; else if (l[i] === '{') depth--; }
          if (depth >= 0) continue;
          const m = JSFN.exec(line(y));
          const name = m && m.slice(1).find(Boolean);
          if (name && !NOT_FN.test(name)) return name;
          depth = 0;
        }
        return '';
      }
      for (let y = S.cy; y >= Math.max(0, S.cy - 600); y--) {
        const m = re.exec(line(y));
        const name = m && m.slice(1).find(Boolean);
        if (name && !NOT_FN.test(name)) return name;
      }
      return '';
    }
    function measure() {
      const probe = h('span', { style: { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre' } }, 'M'.repeat(40));
      main.append(probe);
      const w = probe.getBoundingClientRect().width / 40;
      probe.remove();
      if (w > 0) S.chW = w;
    }
    const MODES = { normal: 'NORMAL', insert: 'INSERT', command: 'COMMAND', search: 'SEARCH', finder: 'FIND', dashboard: 'NORMAL' };

    function renderDash() {
      const hgt = main.clientHeight;
      const rec = recent().filter((p) => OS.fs.isFile(p)).slice(0, hgt > 520 ? 4 : 0);
      const items = DASH.map((it, i) => `<div class="lv-it${i === S.dashSel ? ' sel' : ''}" data-act="dash" data-i="${i}">${OS.icon(it.icon)}<span class="lb">${esc(it.label)}</span><span class="rp">${esc(it.hint)}</span><span class="k">${it.k}</span></div>`).join('');
      const recHtml = rec.length ? `<div class="lv-items"><div class="lv-tag" style="margin:0 0 4px;text-align:left;padding-left:12px">Recent</div>${rec.map((p, i) => `<div class="lv-it" data-act="rec" data-p="${esc(p)}">${OS.icon('hourglass')}<span class="lb">${esc(disp(p))}</span><span class="rp"></span><span class="k">${i + 1}</span></div>`).join('')}</div>` : '';
      return `<div class="lv-dash">${hgt > 330 ? LOGO_SVG : '<div class="lv-logo txt">labvim</div>'}`
        + `<div class="lv-tag">One mode for typing. Several for not typing.</div><div class="lv-items">${items}</div>${recHtml}`
        + '<div class="lv-ft">LazyLabs: <b>47</b> plugins loaded in <b>3 ms</b>. 46 do nothing.</div></div>';
    }
    function renderFinder() {
      const F = S.finder;
      const paneH = main.clientHeight * 0.9;
      const rowsN = Math.max(1, Math.floor((paneH - 70) / 20));
      const start = Math.max(0, Math.min(F.sel - Math.floor(rowsN / 2), F.items.length - rowsN));
      const rows = F.items.slice(start, start + rowsN).map((it, k) => {
        const i = start + k; const set = new Set(it.hits); const cut = it.d.lastIndexOf('/') + 1;
        let out = '';
        [...it.d].forEach((ch, j) => {
          const c = esc(ch);
          const piece = set.has(j) ? `<mark>${c}</mark>` : c;
          out += j === cut ? '<b>' + piece : piece;
        });
        return `<div class="lv-r${i === F.sel ? ' sel' : ''}" data-act="fz" data-i="${i}">${out}</b>${it.rec && F.scope !== 'recent' ? '<span class="tg">recent</span>' : ''}</div>`;
      }).join('');
      const sel = F.items[F.sel];
      let prev = '';
      if (sel && main.clientWidth > 640) {
        let t = '';
        try { t = OS.fs.read(sel.p); } catch (e) { t = e.message; }
        const ls = t.split('\n').slice(0, Math.floor(paneH / LH));
        const ft = filetype(sel.p, ls[0]); const nw = String(ls.length).length + 1;
        let st = null;
        prev = ls.map((l, i) => { const r = tokenize(l, ft, st); const html = lineHtml(l, ft, st, 0, 200, null, true); st = r.st; return `<div class="lv-row"><span class="lv-gut" style="width:${nw + 2}ch"><i class="sg"></i><span class="n">${i + 1}</span></span><span class="lv-txt">${html}</span></div>`; }).join('');
      }
      const title = F.scope === 'recent' ? 'Recent files' : 'Find files';
      return `<div class="lv-fzbg" data-act="fzclose"></div><div class="lv-fz"><div class="lv-pane list"><div class="pt">${title}<span class="cnt">${F.items.length} / ${F.all.length}</span></div>`
        + `<div class="q"><span class="p">❯ </span>${esc(F.q)}<span class="cc"> </span></div><div class="rs">${rows || '<div class="lv-empty">No matches. The disk is small and it is not on it.</div>'}</div></div>`
        + (sel && main.clientWidth > 640 ? `<div class="lv-pane prev"><div class="pt">Preview<span class="cnt">${esc(disp(sel.p))}</span></div><div class="lv-pv">${prev}</div></div>` : '') + '</div>';
    }

    function render() {
      if (win.closed) return;
      if (!S.chW) measure();
      const chW = S.chW || 7.8;
      const W = main.clientWidth; const H = main.clientHeight;
      root.dataset.mode = S.mode === 'dashboard' ? 'normal' : S.mode;
      root.classList.toggle('lv-narrow', W < 600);
      root.classList.toggle('lv-tiny', W < 430);
      const buffer = S.mode !== 'dashboard' && !(S.mode === 'finder' && S.finder?.back === 'dashboard') && !(S.prevMode === 'dashboard' && (S.mode === 'command' || S.mode === 'search'));
      const name = S.path ? OS.fs.basename(S.path) : '[No Name]';
      tabs.style.display = buffer ? '' : 'none';
      crumb.style.display = buffer ? '' : 'none';
      if (buffer) {
        tabs.innerHTML = `<div class="lv-tab on">${OS.icon('files-outline')}<span class="nm">${esc(name)}</span><span class="st${S.modified ? ' mod' : ''}" data-act="close">${S.modified ? '●' : '×'}</span></div><div class="sp"></div><div class="lz">${OS.icon('labs')}<b>LazyLabs</b></div>`;
        const segs = (S.path ? disp(S.path) : '[No Name]').split('/').filter(Boolean);
        const ctx = context();
        crumb.innerHTML = segs.map((s, i) => `<span class="${i === segs.length - 1 ? 'last' : 'seg'}">${esc(s)}</span>`).join('<span class="sep">›</span>') + (ctx ? `<span class="sep">›</span><span class="lv-kw">ƒ</span> <span class="seg">${esc(ctx)}</span>` : '');
      }

      // buffer rows
      const rowsN = Math.max(1, Math.floor(H / LH));
      S.rows = rowsN;
      const numW = S.number || S.rnu ? Math.max(3, String(S.lines.length).length) : 0;
      S.gut = 1 + numW + 1;
      S.cols = Math.max(1, Math.floor(W / chW) - S.gut);
      clampX();
      if (buffer) {
        const so = Math.min(4, Math.floor((rowsN - 1) / 2));
        if (S.cy < S.top + so) S.top = Math.max(0, S.cy - so);
        if (S.cy > S.top + rowsN - 1 - so) S.top = S.cy - rowsN + 1 + so;
        S.top = OS.clamp(S.top, 0, Math.max(0, S.lines.length - 1));
        const vc = vcol(S.cy, S.cx);
        if (vc < S.cols - 4) S.left = 0;
        else if (vc < S.left) S.left = Math.max(0, vc - 8);
        else if (vc >= S.left + S.cols) S.left = vc - S.cols + 8;
        computeStates();
        const pat = S.mode === 'search' && S.cmd ? S.cmd : (S.hl ? S.search : '');
        const re = pat ? searchRe(pat) : null;
        const ig = S.ft !== 'text' && S.ft !== 'markdown';
        let html = '';
        for (let r = 0; r < rowsN; r++) {
          const y = S.top + r;
          if (y >= S.lines.length) { html += '<div class="lv-row"></div>'; continue; }
          const isCur = y === S.cy;
          const num = numW ? String(S.rnu && !isCur ? Math.abs(y - S.cy) : (S.rnu && !S.number ? 0 : y + 1)) : '';
          const added = !S.orig.has(S.lines[y]) && S.lines[y] !== '';
          html += `<div class="lv-row${isCur ? ' cl' : ''}"><span class="lv-gut" style="width:${S.gut}ch"><i class="sg${added ? ' add' : ''}"></i><span class="n">${num}</span></span><span class="lv-txt">${lineHtml(S.lines[y], S.ft, S.states[y], S.left, S.cols + 1, re, ig)}</span></div>`;
        }
        rowsEl.innerHTML = html;
        const showCur = S.mode === 'normal' || S.mode === 'insert';
        cur.style.display = showCur ? '' : 'none';
        const cx = S.gut + vc - S.left; const cyPx = (S.cy - S.top) * LH;
        if (showCur) {
          const ch = line()[S.cx];
          cur.textContent = !ch || ch === '\t' ? ' ' : ch;
          cur.className = 'lv-cur' + (S.mode === 'insert' ? ' ins' : '') + (win.isFocused() ? '' : ' blur');
          cur.style.left = cx + 'ch'; cur.style.top = cyPx + 'px';
        }
        ta.style.left = Math.min(W - 4, cx * chW) + 'px';
        ta.style.top = (main.offsetTop + cyPx) + 'px';
      } else {
        rowsEl.innerHTML = '';
        cur.style.display = 'none';
      }

      // overlays inside the editor
      let lay = '';
      if (S.mode === 'dashboard' || !buffer) lay += renderDash();
      if (S.mode === 'finder') lay += renderFinder();
      if (S.wk && WK[S.wk]) lay += `<div class="lv-wk"><div class="wt">${esc(WK[S.wk].title)}</div>${WK[S.wk].items.map(([k, label, grp]) => `<div><span class="k">${esc(k)}</span><span class="a">→</span><span class="${grp ? 'g' : ''}">${esc(label)}</span></div>`).join('')}</div>`;
      if (S.pop) lay += `<div class="lv-pop"><div class="pt">${esc(S.pop.title)}</div>${esc(S.pop.body)}</div>`;
      layer.innerHTML = lay;

      // statusline
      const vc = vcol(S.cy, S.cx);
      const n = S.lines.length;
      const pos = !buffer ? 'Top' : n <= rowsN ? 'All' : S.top === 0 ? 'Top' : S.top + rowsN >= n ? 'Bot' : Math.round((S.top / (n - rowsN)) * 100) + '%';
      const fname = buffer ? (S.path ? disp(S.path) : '[No Name]') : 'dashboard';
      const clock = OS.now().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      sl.innerHTML = `<span class="md">${MODES[S.mode] || 'NORMAL'}</span><span class="b2">${OS.icon('branch')}main</span>`
        + `<span class="fl">${esc(fname)}${S.modified ? ' <b class="mod">[+]</b>' : ''}${S.readonly ? ' <b class="ro">[RO]</b>' : ''}</span><span class="sp"></span>`
        + `<span class="ft"><i></i>${buffer ? S.ft : 'dashboard'}</span><span class="ft">utf-8 · unix</span>`
        + `<span class="r2">${pos}  ${buffer ? `${S.cy + 1}:${vc + 1}` : '1:1'}</span><span class="r1">${clock}</span>`;

      // command line
      let c;
      if (S.mode === 'command' || S.mode === 'search') c = `<span class="tx">${esc(S.cmdType + S.cmd)}<span class="cc"> </span></span>`;
      else if (S.msg) c = `<span class="tx ${S.msg.k}">${esc(S.msg.t)}</span>`;
      else if (S.mode === 'insert') c = '<span class="tx bold">-- INSERT --</span>';
      else c = '<span class="tx"></span>';
      const sc = (S.opCount || '') + (S.op || '') + S.count + (S.prefix ? S.prefix.replace(/ /g, '␣') : '');
      cmdEl.innerHTML = c + `<span class="sc">${esc(sc)}</span>`;
    }

    // ---------- mouse ----------
    main.addEventListener('mousedown', (e) => { if (!e.target.closest('.lv-pop')) e.preventDefault(); });
    main.addEventListener('pointerdown', (e) => {
      focusInput();
      if (e.target.closest('.lv-dash, .lv-fz, .lv-fzbg, .lv-wk, .lv-pop')) return;
      if (S.mode !== 'normal' && S.mode !== 'insert') return;
      const r = main.getBoundingClientRect();
      const row = Math.floor((e.clientY - r.top) / LH);
      const col = Math.floor((e.clientX - r.left) / (S.chW || 7.8)) - S.gut + S.left;
      S.cy = OS.clamp(S.top + row, 0, S.lines.length - 1);
      S.cx = xAtV(S.cy, Math.max(0, col)); clampX(); S.want = vcol(S.cy, S.cx);
      S.msg = null;
      render();
    });
    main.addEventListener('wheel', (e) => {
      if (S.mode === 'dashboard' || S.mode === 'finder') return;
      e.preventDefault();
      const d = Math.sign(e.deltaY) * 3;
      if (!d) return;
      S.top = OS.clamp(S.top + d, 0, Math.max(0, S.lines.length - 1));
      const so = Math.min(4, Math.floor((S.rows - 1) / 2));
      S.cy = OS.clamp(S.cy, Math.min(S.top + so, S.lines.length - 1), Math.max(0, Math.min(S.lines.length - 1, S.top + S.rows - 1 - so)));
      clampX();
      render();
    }, { passive: false });
    layer.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const a = el.dataset.act;
      if (a === 'dash') DASH[Number(el.dataset.i)]?.run();
      else if (a === 'rec') openPath(el.dataset.p);
      else if (a === 'fz') { const p = S.finder?.items[Number(el.dataset.i)]?.p; closeFinder(); if (p) openPath(p); }
      else if (a === 'fzclose') closeFinder();
      if (!win.closed) { render(); focusInput(); }
    });
    tabs.addEventListener('click', (e) => { if (e.target.closest('[data-act=close]')) { ex('q'); if (!win.closed) render(); } });

    root.addEventListener('pointerup', () => win.after(0, focusInput));
    win.on('focus', () => { focusInput(); render(); });
    win.on('blur', () => render());
    win.every(20000, render);

    if (arg && arg.path) {
      if (!load(arg.path, arg.line)) S.mode = 'dashboard';
    } else {
      updateTitle();
    }
    S.render = render;
    render();
    return { render, focus: focusInput, state: S };
  }

  if (!OS.fs.exists('/usr/share/doc/labvim/help.md')) {
    OS.fs.seed({
      '/usr/share/doc/labvim/help.md': [
        '# labvim help. LazyLabs edition: 47 plugins, 46 idle.',
        '',
        '# Modes',
        '',
        '- Normal: Esc. Moves and operators.',
        '- Insert: i a I A o O. Type. Esc to leave.',
        '- Command: `:` then a command and Enter.',
        '- Search: `/` or `?` then a pattern and Enter. n and N repeat it.',
        '',
        '# Keys',
        '',
        '- Move: h j k l, w b e, 0 ^ $, gg G, Ctrl+D Ctrl+U, :<line>',
        '- Edit: x X r ~, dd D dw d$, cc C cw, yy Y yw, p P, J, u Ctrl+R',
        '- Counts work: 3dd, 5j, 2p.',
        '',
        '# Commands',
        '',
        '- `:w` `:w <path>` `:q` `:q!` `:wq` `:x` `:e <path>` `:e!` `:enew`',
        '- `:%s/old/new/g` `:s/old/new/` `:set number` `:set relativenumber`',
        '- `:noh` `:Gristle` `:Lazy` `:checkhealth` `:Dashboard` `:help`',
        '',
        '# Leader (Space)',
        '',
        '- Space f f: find files. Space f r: recent files. Space f n: new file.',
        '- Space g: Gristle reviews this buffer. Space w: write. Space q: quit.',
        '',
        '# Not here',
        '',
        '- Visual mode. It is booked for design review round 6.',
        '- Plugins that do something. One of them shows Bricky.',
        '',
        'To exit, type :q and press Enter.',
        '',
      ].join('\n'),
    });
  }

  registerApp({
    id: 'labvim', title: 'labvim', icon: 'files-outline', multi: true,
    desc: 'A modal editor. To exit, type :q and press Enter',
    keywords: ['vim', 'vi', 'editor', 'text', 'modal'],
    mount(win, arg) {
      if (!document.getElementById('labvim-css')) document.head.append(h('style', { id: 'labvim-css', text: CSS }));
      win.body.style.overflow = 'hidden';
      createEditor(win, arg);
    },
    unmount(win) { win.state.offFs?.(); },
    onResize(win) { win.state.render?.(); },
  });
})();
