// brickty: the terminal. A shell over OS.fs with pipes, redirects, history and Tab. Runs every command in OS.commands.
(() => {
  const { h } = OS;
  const HOME = OS.fs.home;
  const LABS = HOME + '/labs';
  const VERSION = '2.0';
  const LH = 16; // line height in px. The brickfetch art uses half of it per pixel.
  const MAX_LINES = 5000;
  const MINE = new Set(); // the commands this file registers, for help and which
  const BUILTINS = new Set(['cd', 'export', 'unset', 'alias', 'unalias', 'exit', 'logout', 'history', 'source', '.']);
  const OPS = ['2>&1', '&&', '||', '>>', '2>', '&>', '|', ';', '&', '>', '<'];
  const DEAD = { set() {}, remove() {}, el: null };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const CSS = `
.terminal-root { position: absolute; inset: 0; overflow: hidden; background: var(--bg); color: var(--fg); font-family: var(--mono); font-size: 13px; line-height: ${LH}px; font-variant-ligatures: none; }
.terminal-scroll { position: absolute; inset: 0; overflow-x: hidden; overflow-y: auto; padding: 8px 14px 12px; cursor: text; overscroll-behavior: contain; }
.terminal-l { white-space: pre-wrap; overflow-wrap: anywhere; min-height: ${LH}px; }
.terminal-echo, .terminal-active.terminal-gap { margin-top: 7px; }
.terminal-out > .terminal-echo:first-child { margin-top: 0; }
.terminal-ta { position: absolute; left: 0; top: 0; width: 2px; height: ${LH}px; padding: 0; margin: 0; border: 0; opacity: 0; resize: none; overflow: hidden; pointer-events: none; white-space: pre; color: transparent; background: transparent; caret-color: transparent; }
.terminal-meas { position: absolute; left: -9999px; top: 0; visibility: hidden; white-space: pre; }
.terminal-c-ok, .terminal-c-good { color: var(--good); }
.terminal-c-bad, .terminal-c-error { color: var(--bad); }
.terminal-c-warn { color: var(--warn); }
.terminal-c-info { color: var(--info); }
.terminal-c-accent { color: var(--accent); }
.terminal-c-accent2 { color: var(--accent2); }
.terminal-c-muted { color: var(--muted); }
.terminal-c-faint, .terminal-c-dim { color: var(--faint); }
.terminal-c-fg { color: var(--fg); }
.terminal-c-bold { font-weight: 700; }
.terminal-c-italic { font-style: italic; }
.terminal-c-u { text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); text-underline-offset: 3px; }
.terminal-c-brick { color: color-mix(in srgb, var(--warn) 45%, var(--bad)); }
.terminal-c-hl { color: var(--bad); font-weight: 700; }
.terminal-c-inv { background: var(--accent); color: var(--on-accent); border-radius: 2px; }
.terminal-c-sel { background: var(--sel); }
.terminal-root .terminal-cur { background: var(--accent); color: var(--on-accent); border-radius: 1px; animation: terminal-blink 1.1s steps(1) infinite; }
.terminal-root.terminal-blur .terminal-cur { background: transparent; color: inherit; box-shadow: inset 0 0 0 1px var(--accent); animation: none; }
@keyframes terminal-blink { 50% { background: transparent; color: inherit; } }
.terminal-fetch { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 4ch; padding: 6px 0 4px; }
.terminal-art { flex: none; user-select: none; }
.terminal-art > div { display: flex; height: ${LH}px; }
.terminal-art i { flex: none; width: ${LH / 2}px; height: ${LH}px; }
.terminal-root[data-theme="heightmap"] .terminal-art { filter: grayscale(1) contrast(1.2); }
.terminal-info { flex: 1 1 36ch; min-width: 0; }
.terminal-logo { white-space: pre; line-height: 15px; overflow: hidden; padding: 4px 0 2px; }
.terminal-swatch { letter-spacing: 0; }
`;

  // ---------- small helpers ----------
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tilde = (p) => (p === HOME ? '~' : p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p);
  const plain = (c) => {
    if (c == null) return '';
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map((s) => (Array.isArray(s) ? String(s[0]) : s instanceof Node ? s.textContent : s == null ? '' : String(s))).join('');
    if (c instanceof Node) return c.textContent;
    return String(c);
  };
  const shq = (s) => (/^[\w@%+=:,./~-]+$/.test(s) ? s : "'" + String(s).replace(/'/g, "'\\''") + "'");
  const splitLines = (t) => { const a = String(t).split('\n'); if (a.length && a[a.length - 1] === '') a.pop(); return a; };
  const human = (n) => (n < 1024 ? String(n) : n < 1048576 ? (n / 1024).toFixed(1) + 'K' : (n / 1048576).toFixed(1) + 'M');
  const nf = (n) => n.toLocaleString('en-GB');
  const safeRead = (p) => { try { return OS.fs.read(p); } catch { return ''; } };
  const two = (n) => String(n).padStart(2, '0');
  const hhmm = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;
  const lsDate = (ms) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2)} ${MON[d.getMonth()]} ${hhmm(d)}`; };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clip = (s, n) => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s);
  const wrap = (text, width) => {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        if (!word) continue;
        if (line && line.length + 1 + word.length > width) { out.push(line); line = word; } else line = line ? line + ' ' + word : word;
      }
      out.push(line);
    }
    return out;
  };
  const errText = (cmd, typed, e) => {
    if (e.code === 'EPERM') return e.message;
    const m = { ENOENT: 'No such file or directory', EISDIR: 'Is a directory', ENOTDIR: 'Not a directory', EEXIST: 'File exists', EACCES: 'Permission denied' }[e.code];
    return `${cmd}: ${typed}: ${m || e.message}`;
  };
  const uptimeText = () => {
    const s = Math.floor(performance.now() / 1000); const hrs = Math.floor(s / 3600); const mins = Math.floor((s % 3600) / 60);
    if (s < 60) return `${s} secs`;
    return (hrs ? `${hrs} hour${hrs === 1 ? '' : 's'}, ` : '') + `${mins} min${mins === 1 ? '' : 's'}`;
  };
  const fmtDate = (d, utc) => {
    const g = (k) => (utc ? d['getUTC' + k]() : d['get' + k]());
    let tz = 'UTC';
    if (!utc) { try { tz = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName').value; } catch { tz = ''; } }
    return `${DAY[g('Day')]} ${g('Date')} ${MON[g('Month')]} ${g('FullYear')} ${two(g('Hours'))}:${two(g('Minutes'))}:${two(g('Seconds'))} ${tz}`.trim();
  };
  // Column-major grid, like ls. items: [{t, c}] -> lines of segments.
  function grid(items, width) {
    if (!items.length) return [];
    const n = items.length; const w = Math.max(10, width);
    let best = null;
    for (let nc = Math.min(n, Math.max(1, Math.floor(w / 3))); nc >= 1; nc--) {
      const nr = Math.ceil(n / nc); const widths = [];
      for (let c = 0; c < nc; c++) { let m = 0; for (let r = 0; r < nr; r++) { const it = items[c * nr + r]; if (it) m = Math.max(m, it.t.length); } widths.push(m); }
      if (widths.reduce((a, b) => a + b, 0) + 2 * (nc - 1) <= w) { best = { nc, nr, widths }; break; }
    }
    if (!best) best = { nc: 1, nr: n, widths: [0] };
    const lines = [];
    for (let r = 0; r < best.nr; r++) {
      const segs = [];
      for (let c = 0; c < best.nc; c++) {
        const it = items[c * best.nr + r]; if (!it) continue;
        segs.push([it.t, it.c || '']);
        if (items[(c + 1) * best.nr + r]) segs.push(' '.repeat(best.widths[c] - it.t.length + 2));
      }
      lines.push(segs);
    }
    return lines;
  }
  const bar = (frac, width, cls) => {
    const f = OS.clamp(frac, 0, 1); const n = Math.round(f * width);
    return [['▰'.repeat(n), cls || (f >= 1 ? 'bad' : f > 0.8 ? 'warn' : 'accent')], ['▱'.repeat(width - n), 'faint']];
  };
  const pbar = (label, frac, cols) => {
    const L = Math.min(34, Math.max(12, cols - 34)); const w = OS.clamp(cols - L - 9, 6, 24); const n = Math.round(OS.clamp(frac, 0, 1) * w);
    return [clip(label, L).padEnd(L), ' [', ['#'.repeat(n), 'accent'], ['-'.repeat(w - n), 'faint'], '] ', [String(Math.round(frac * 100)).padStart(3) + '%', frac >= 1 ? 'ok' : 'muted']];
  };
  // Small arithmetic for the python and rails prompts: + - * / % ** and brackets. Returns a number or throws.
  function arith(src) {
    let i = 0; const s = src.replace(/\s+/g, '');
    const num = () => { const m = /^\d+(\.\d+)?/.exec(s.slice(i)); if (!m) throw new Error('syntax'); i += m[0].length; return Number(m[0]); };
    const factor = () => {
      if (s[i] === '-') { i++; return -factor(); }
      if (s[i] === '+') { i++; return factor(); }
      let v;
      if (s[i] === '(') { i++; v = expr(); if (s[i] !== ')') throw new Error('syntax'); i++; } else v = num();
      if (s.startsWith('**', i)) { i += 2; v **= factor(); }
      return v;
    };
    const term = () => { let v = factor(); while (s[i] === '*' || s[i] === '/' || s[i] === '%') { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; };
    const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
    const v = expr(); if (i !== s.length) throw new Error('syntax');
    return v;
  }
  const isArith = (s) => /^[\d\s+\-*/%().]+$/.test(s) && /\d/.test(s);
  const lev = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
    return dp[a.length][b.length];
  };

  // ---------- shared, persisted state ----------
  const hist = ((h0) => (Array.isArray(h0) ? h0 : []).filter((x) => typeof x === 'string'))(OS.store.get('terminal.history', []));
  const saveHist = () => OS.store.set('terminal.history', hist.slice(-1000));
  const SAVE_REL = 'app/frontend/components/configurator/SaveDesignButton.tsx';
  const git = Object.assign({ branch: 'main', branches: ['main'], dirty: { [SAVE_REL]: 'modified' }, commits: [], pushed: [], stash: [] }, OS.store.get('terminal.git', {}));
  for (const k of ['branches', 'commits', 'pushed', 'stash']) if (!Array.isArray(git[k])) git[k] = k === 'branches' ? ['main'] : [];
  if (!git.dirty || typeof git.dirty !== 'object') git.dirty = {};
  if (typeof git.branch !== 'string') git.branch = 'main';
  const saveGit = () => OS.store.set('terminal.git', git);
  const pk = Object.assign({ removed: [], added: [], round: 5, bumped: false, synced: false }, OS.store.get('terminal.brick', {}));
  for (const k of ['removed', 'added']) if (!Array.isArray(pk[k])) pk[k] = [];
  if (!Number.isFinite(pk.round)) pk.round = 5;
  const savePk = () => OS.store.set('terminal.brick', pk);
  const fresh = new Set(); // paths this shell is about to create, so git can call them untracked
  const sessions = new Set();
  let devServers = 0;
  let clodN = 0;

  OS.on('fs', (ev) => {
    if (!ev?.path || !ev.path.startsWith(LABS + '/')) return;
    const rel = ev.path.slice(LABS.length + 1);
    if (/^(node_modules|tmp|log)\//.test(rel)) return;
    if (ev.op === 'rm') { if (git.dirty[rel] === 'new file') delete git.dirty[rel]; else git.dirty[rel] = 'deleted'; } else git.dirty[rel] = fresh.has(ev.path) || git.dirty[rel] === 'new file' ? 'new file' : 'modified';
    fresh.delete(ev.path);
    saveGit();
  });
  OS.on('theme', (t) => { for (const S of sessions) S.root.dataset.theme = t.name; });
  OS.on('overlay', (el) => { for (const S of sessions) S.root.classList.toggle('terminal-blur', !!el || !S.win.isFocused()); });

  // Writes the shell may make: home and /tmp only. Gold has its own sentence.
  const denyWrite = (abs) => {
    if (abs === '/dev/null') return null;
    if (abs === '/gold' || abs.startsWith('/gold/')) return 'Permission denied. Gold is never edited, only overridden.';
    if (abs === HOME || abs.startsWith(HOME + '/') || abs === '/tmp' || abs.startsWith('/tmp/')) return null;
    return 'Permission denied';
  };
  const writeFile = (abs, text) => { if (!OS.fs.exists(abs)) fresh.add(abs); OS.fs.write(abs, text); };

  // Files this app adds to the disk. Never over a file the user changed or deleted.
  const SAVE_TSX = [
    "import { Button } from '../ui/Button'", '',
    'type Props = { state: \'idle\' | \'saving\' | \'saved\'; second?: boolean }', '',
    'export function SaveDesignButton({ state, second }: Props) {',
    '  const label = {',
    "    idle: 'Keep design',",
    "    saving: 'Saving',",
    "    saved: second ? 'Saved again' : 'Saved',",
    '  }[state]', '',
    '  return <Button variant="soft" data-state={state}>{label}</Button>',
    '}', '',
  ].join('\n');
  (() => {
    const ov = OS.store.get('fs', {}) || {};
    const add = {};
    const map = {
      '/tmp/': '',
      '/dev/null': '',
      [HOME + '/.brickty_history']: () => hist.join('\n') + (hist.length ? '\n' : ''),
      [LABS + '/' + SAVE_REL]: SAVE_TSX,
      [LABS + '/Procfile.dev']: 'web: bin/rails server -p 3000\nvite: bin/vite dev\ncss: bin/rails css:watch\njobs: bin/jobs\n',
      [LABS + '/package.json']: '{\n  "name": "labs",\n  "private": true,\n  "scripts": {\n    "dev": "bin/dev",\n    "check": "lint, types and unit tests",\n    "check:ci": "every step of CI\'s Frontend Checks job",\n    "design:sync": "record the design system sync",\n    "test": "unit tests"\n  }\n}\n',
    };
    for (const [p, c] of Object.entries(map)) {
      const bare = p.endsWith('/') ? p.slice(0, -1) : p;
      if (!OS.fs.exists(bare) && ov[bare] !== null && ov[p] !== null) add[p] = c;
    }
    OS.fs.seed(add);
  })();

  // ---------- the lexer: words (with deferred $VARs and globs) and operators ----------
  function lex(src) {
    const toks = []; let w = null; let i = 0;
    const word = () => (w ||= { t: 'w', parts: [] });
    const lit = (s, q) => { const x = word(); for (const c of s) x.parts.push({ c, q }); };
    const flush = () => { if (w) toks.push(w); w = null; };
    const readVar = (j) => {
      const n = src[j + 1];
      if (n === '{') { const k = src.indexOf('}', j + 2); return k < 0 ? null : { name: src.slice(j + 2, k), end: k + 1 }; }
      if (n === '?' || n === '$' || n === '#' || (n >= '0' && n <= '9')) return { name: n, end: j + 2 };
      const m = /^[A-Za-z_]\w*/.exec(src.slice(j + 1));
      return m ? { name: m[0], end: j + 1 + m[0].length } : null;
    };
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { flush(); i++; continue; }
      if (c === '#' && !w) break;
      const op = OPS.find((o) => src.startsWith(o, i) && !(o[0] === '2' && w));
      if (op) { flush(); toks.push({ t: 'op', v: op }); i += op.length; continue; }
      if (c === "'") {
        const j = src.indexOf("'", i + 1);
        if (j < 0) return { error: "unexpected end of line while looking for a closing '" };
        word(); lit(src.slice(i + 1, j), true); i = j + 1; continue;
      }
      if (c === '"') {
        word(); i++;
        while (i < src.length && src[i] !== '"') {
          if (src[i] === '\\' && '"\\$`'.includes(src[i + 1] ?? '')) { lit(src[i + 1], true); i += 2; continue; }
          if (src.startsWith('$((', i)) { const k = src.indexOf('))', i + 3); if (k > 0) { w.parts.push({ ar: src.slice(i + 3, k), q: true }); i = k + 2; continue; } }
          if (src[i] === '$') { const v = readVar(i); if (v) { w.parts.push({ v: v.name, q: true }); i = v.end; continue; } }
          lit(src[i], true); i++;
        }
        if (i >= src.length) return { error: 'unexpected end of line while looking for a closing "' };
        i++; continue;
      }
      if (c === '\\') { if (i + 1 < src.length) lit(src[i + 1], true); i += 2; continue; }
      if (src.startsWith('$((', i)) { const k = src.indexOf('))', i + 3); if (k > 0) { word().parts.push({ ar: src.slice(i + 3, k), q: true }); i = k + 2; continue; } }
      if (c === '$') { const v = readVar(i); if (v) { word().parts.push({ v: v.name, q: false }); i = v.end; continue; } }
      if (c === '~' && !w) {
        const n = src[i + 1];
        if (n === undefined || n === '/' || /\s/.test(n) || ';|&<>'.includes(n)) { lit(HOME, true); i++; continue; }
      }
      word().parts.push({ c, q: false, g: c === '*' || c === '?' });
      i++;
    }
    flush();
    return { toks };
  }

  // Tokens -> [{conn, stages: [{words, redirs}], bg}]
  function parse(toks) {
    const list = []; let stages = []; let cur = { words: [], redirs: [] }; let conn = null;
    const unexpected = (v) => ({ error: `syntax error near unexpected token '${v}'` });
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk.t === 'w') { cur.words.push(tk); continue; }
      const v = tk.v;
      if (v === '>' || v === '>>' || v === '2>' || v === '&>' || v === '<') {
        const nx = toks[i + 1];
        if (!nx || nx.t !== 'w') return unexpected(nx ? nx.v : 'newline');
        cur.redirs.push({ op: v, target: nx }); i++; continue;
      }
      if (v === '2>&1') { cur.redirs.push({ op: v }); continue; }
      if (v === '|') {
        if (!cur.words.length) return unexpected('|');
        stages.push(cur); cur = { words: [], redirs: [] }; continue;
      }
      // ; && || &
      if (!cur.words.length && !cur.redirs.length) {
        if (v === ';' && !stages.length && !list.length) continue;
        return unexpected(v);
      }
      stages.push(cur);
      list.push({ conn, stages, bg: v === '&' });
      conn = v === '&' ? ';' : v; stages = []; cur = { words: [], redirs: [] };
    }
    if (cur.words.length || cur.redirs.length) stages.push(cur);
    else if (stages.length) return { error: "syntax error: the line ends after '|'" };
    if (stages.length) list.push({ conn, stages, bg: false });
    else if (conn === '&&' || conn === '||') return { error: `syntax error: the line ends after '${conn}'` };
    return { list };
  }

  // ---------- art ----------
  // Bricky, 32x32, the same pixels as the PNG. '.' is clear; 0-6 index the palette.
  const SPRITE = [
    '.................000000.........', '.......00111111223333322100.....', '......1112333332221111111220....', '......1111112212233333333330....',
    '......111111333223333101333.....', '......111111330123333332233.....', '......111111322223333121233.....', '......111111331441332444233.....',
    '......111111314344124124423.....', '......111111324124223014413.....', '......111111323014222004422.....', '......111111324144231444132.....',
    '......111111322441333121332.....', '......111111333123333333332.....', '......111111332133333302332.....', '......111111332112221123332.....',
    '......111111333331112333332.....', '......111111333333333333332.....', '......111111333333333333332.....', '......011111333333333333321.....',
    '........01113333333211100.......', '..........01211100..............', '................................', '................................',
    '.....................5..........', '........5555..5.555.55.5........', '......5555555555555555555.......', '....655555555555555555565566....',
    '...66655555555555555555666666...', '...6666666665555556666566666....', '.....6666666666666666666666.....', '..........666666666666..........',
  ];
  const PAL = { 0: '#2f1705', 1: '#913a18', 2: '#b9582a', 3: '#db6531', 4: '#faefcb', 5: '#4f621c', 6: '#739428' };
  function brickyArt() {
    let x0 = 99; let x1 = 0;
    for (const r of SPRITE) for (let x = 0; x < r.length; x++) if (r[x] !== '.') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const art = h('div', { class: 'terminal-art', 'aria-label': 'Bricky', role: 'img' });
    for (let y = 0; y < SPRITE.length; y += 2) {
      const row = h('div');
      for (let x = x0; x <= x1; x++) {
        const a = PAL[SPRITE[y][x]]; const b = PAL[SPRITE[y + 1][x]];
        const cell = h('i');
        if (a || b) cell.style.background = `linear-gradient(${a || 'transparent'} 50%, ${b || 'transparent'} 50%)`;
        row.append(cell);
      }
      art.append(row);
    }
    return art;
  }
  // The ASCII Bricky, for brickysay.
  const BRICK_SAY = [
    [['        \\', 'muted']],
    [['         \\  ', 'muted'], ['______________', 'brick']],
    ['           ', ['/_____________/|', 'brick']],
    ['           ', ['|   ', 'brick'], ['o     o', 'fg bold'], ['   ||', 'brick']],
    ['           ', ['|    ', 'brick'], ['\\___/', 'fg'], ['    ||', 'brick']],
    ['           ', ['|_____________|/', 'brick']],
    ['         ', ['\\|/\\|//\\|/\\|//\\|/', 'ok']],
  ];
  const BRICK_STERN = [
    ['   ', ['______________', 'brick']],
    ['  ', ['/_____________/|', 'brick']],
    ['  ', ['|   ', 'brick'], ['\\     /', 'fg bold'], ['   ||', 'brick']],
    ['  ', ['|   ', 'brick'], ['o     o', 'fg bold'], ['   ||', 'brick']],
    ['  ', ['|    ', 'brick'], ['_____', 'fg'], ['    ||', 'brick']],
    ['  ', ['|_____________|/', 'brick']],
  ];
  const LORRY = [
    String.raw`    __________                                  `,
    String.raw`   /  |   |  |   ______________________________ `,
    String.raw`  /___|___|__|   \                            / `,
    String.raw` |            |   \        SKIP  HIRE        /  `,
    String.raw` |    ___     |____\________________________/___`,
    String.raw` |___/ o \___________________/ o \___/ o \_____|`,
    String.raw`     \___/                   \___/   \___/      `,
  ];

  // ---------- registering ----------
  const reg = (nm, group, spec) => { MINE.add(nm); OS.commands.register(nm, { group, ...spec }); };
  const syn = (nm, target) => { MINE.add(nm); OS.commands.alias(nm, target); };
  const DEFAULT_VARS = {
    HOME, USER: 'researcher', LOGNAME: 'researcher', SHELL: '/usr/bin/brickty', TERM: 'brickty-256color', COLORTERM: 'truecolor',
    EDITOR: 'labvim', LANG: 'en_GB.UTF-8', HOSTNAME: 'labs', PATH: '/usr/local/bin:/usr/bin:/bin:' + LABS + '/bin',
    RAILS_ENV: 'development', SPEND_CAP_USD: '100.00', DISPLAY_WIDTH_M: '3', WM: 'brickland',
  };
  const DEFAULT_ALIASES = [['ll', 'ls -la'], ['la', 'ls -a'], ['l', 'ls'], ['..', 'cd ..']];

  // ---------- one shell per window ----------
  function createSession(win, arg) {
    const S = {
      win, cwd: LABS, oldpwd: null, vars: new Map(Object.entries(DEFAULT_VARS)), aliases: new Map(DEFAULT_ALIASES),
      last: 0, mode: 'boot', job: null, ask: null, queue: [], hi: null, hprefix: '', hsaved: '', search: null,
      stick: true, cols: 80, rows: 24, cw: 7.8, pid: 4100 + win.id * 7, openLine: null, clodYes: false, bgN: 0,
    };
    if (arg?.cwd) { const c = OS.fs.resolve(LABS, String(arg.cwd)); if (OS.fs.isDir(c)) S.cwd = c; }

    const root = h('div', { class: 'terminal-root' });
    root.dataset.theme = OS.theme.get().name;
    const scroller = h('div', { class: 'terminal-scroll' });
    const out = h('div', { class: 'terminal-out', role: 'log' });
    const active = h('div', { class: 'terminal-l terminal-active' });
    const ta = h('textarea', { class: 'terminal-ta', 'aria-label': 'brickty input', rows: 1 });
    ta.spellcheck = false; ta.setAttribute('autocomplete', 'off'); ta.setAttribute('autocapitalize', 'off'); ta.setAttribute('autocorrect', 'off'); ta.setAttribute('wrap', 'off');
    const meas = h('span', { class: 'terminal-meas', 'aria-hidden': 'true' }, 'M'.repeat(40));
    scroller.append(out, active);
    root.append(scroller, ta, meas);
    win.body.style.overflow = 'hidden';
    win.body.append(root);
    S.root = root;
    if (!win.isFocused()) root.classList.add('terminal-blur');

    // ----- metrics and scrolling -----
    function measure() {
      const w = meas.getBoundingClientRect().width / 40; if (w > 0) S.cw = w;
      if (scroller.clientWidth > 0) S.cols = Math.max(20, Math.floor((scroller.clientWidth - 28) / S.cw));
      if (scroller.clientHeight > 0) S.rows = Math.max(5, Math.floor((scroller.clientHeight - 20) / LH));
      const meta = `${S.cols}×${S.rows}`;
      if (meta !== S.meta && S.mode !== 'boot') { S.meta = meta; win.setMeta(meta); }
    }
    let scrollPend = false;
    const bump = () => {
      if (!S.stick || scrollPend) return;
      scrollPend = true;
      queueMicrotask(() => { scrollPend = false; scroller.scrollTop = scroller.scrollHeight; });
    };
    scroller.addEventListener('scroll', () => { S.stick = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 6; });

    // ----- output -----
    const CLS = (c) => (c ? String(c).split(/\s+/).filter(Boolean).map((x) => 'terminal-c-' + x).join(' ') : '');
    function put(el, content, cls) {
      if (content == null || content === false) return;
      if (content instanceof Node) { el.append(content); return; }
      if (Array.isArray(content)) {
        for (const s of content) {
          if (s == null || s === '' || s === false) continue;
          if (s instanceof Node) el.append(s);
          else if (Array.isArray(s)) put(el, String(s[0]), [cls, s[1]].filter(Boolean).join(' '));
          else put(el, String(s), cls);
        }
        return;
      }
      const t = String(content);
      if (!t) return;
      if (!cls) el.append(t); else el.append(h('span', { class: CLS(cls) }, t));
    }
    const trim = () => { while (out.childElementCount > MAX_LINES) out.firstElementChild.remove(); };
    function handleFor(el, job) {
      return {
        el,
        set(content, cls) { if (job?.killed) return; el.textContent = ''; put(el, content, cls); bump(); },
        remove() { if (S.openLine === el) S.openLine = null; el.remove(); },
      };
    }
    function screenLine(content, cls, job) {
      if (S.openLine) { const el = S.openLine; S.openLine = null; put(el, content, cls); bump(); return handleFor(el, job); }
      const el = h('div', { class: 'terminal-l' }); put(el, content, cls); out.append(el); trim(); bump();
      return handleFor(el, job);
    }
    function screenPart(content, cls) {
      if (!S.openLine) { S.openLine = h('div', { class: 'terminal-l' }); out.append(S.openLine); trim(); }
      put(S.openLine, content, cls); bump();
    }
    const scr = { tty: true, line: (c, k) => screenLine(c, k, null), part: screenPart, clear: () => { out.textContent = ''; S.openLine = null; } };
    const sinkFor = (job) => ({
      tty: true,
      line: (c, k) => (job.killed ? DEAD : screenLine(c, k, job)),
      part: (c, k) => { if (!job.killed) screenPart(c, k); },
      clear: () => { if (!job.killed) scr.clear(); },
    });
    const nullSink = { tty: false, line: () => DEAD, part() {}, clear() {} };
    function capture() {
      const lines = []; let isOpen = false;
      const hd = (i) => ({ el: null, set(t) { lines[i] = plain(t); }, remove() { lines[i] = null; } });
      return {
        tty: false,
        line(c) { const t = plain(c); if (isOpen) { isOpen = false; lines[lines.length - 1] += t; return hd(lines.length - 1); } lines.push(t); return hd(lines.length - 1); },
        part(c) { const t = plain(c); if (isOpen) lines[lines.length - 1] += t; else { lines.push(t); isOpen = true; } },
        clear() { lines.length = 0; isOpen = false; },
        lines: () => lines.filter((l) => l !== null).flatMap((l) => l.split('\n')),
        text() { const a = this.lines(); return a.length ? a.join('\n') + '\n' : ''; },
      };
    }
    // A pipe between two stages of a pipeline. Lines arrive as the writer prints them.
    // close() is the reader leaving: later writes are dropped and the writer's io.aborted turns true.
    function makePipe() {
      const q = []; let head = 0; let eof = false; let gone = false;
      const waiters = new Set(); const sleepers = new Set();
      const poke = (set) => { for (const f of [...set]) f(); };
      return {
        sleepers,
        get gone() { return gone; },
        push(l) { if (gone) return; q.push(l); poke(waiters); },
        end() { eof = true; poke(waiters); },
        close() { if (gone) return; gone = true; q.length = 0; head = 0; poke(waiters); poke(sleepers); },
        // The next line, or null at the end of input. out is the reader's own output: when its pipe closes, reading stops.
        read(out) {
          return new Promise((res) => {
            const take = () => {
              if (gone || out?.broken) return null;
              if (head < q.length) { const v = q[head]; q[head++] = undefined; if (head > 1024 && head * 2 > q.length) { q.splice(0, head); head = 0; } return v; }
              return eof ? null : undefined;
            };
            const v = take();
            if (v !== undefined) { res(v); return; }
            out?.idle?.(); // about to wait for input, so the line this reader finished goes on now
            const step = () => { const w = take(); if (w === undefined) return; waiters.delete(step); out?.sleepers?.delete(step); res(w); };
            waiters.add(step); out?.sleepers?.add(step);
          });
        },
        async all(out) { const a = []; for (let l; (l = await this.read(out)) !== null;) a.push(l); return a; },
      };
    }
    // The writing end of a pipe. A line goes down the pipe once the writer starts the next one, waits for input,
    // sleeps for 400 ms or more, or asks a question, so a progress line rewritten in place sends only its final state.
    function pipeSink(pipe) {
      let cur = null; let isOpen = false;
      const send = () => { if (cur && !cur.removed) for (const l of cur.t.split('\n')) pipe.push(l); cur = null; isOpen = false; };
      const hd = (r) => ({ el: null, set(c) { r.t = plain(c); }, remove() { r.removed = true; } });
      return {
        tty: false,
        get broken() { return pipe.gone; },
        sleepers: pipe.sleepers,
        line(c) { const t = plain(c); if (isOpen) { isOpen = false; cur.t += t; return hd(cur); } send(); cur = { t }; return hd(cur); },
        part(c) { const t = plain(c); if (isOpen) cur.t += t; else { send(); cur = { t }; isOpen = true; } },
        clear() { cur = null; isOpen = false; },
        idle() { if (!isOpen) send(); },
        end() { send(); pipe.end(); },
      };
    }

    // ----- prompt and input rendering -----
    const inLabs = () => S.cwd === LABS || S.cwd.startsWith(LABS + '/');
    function ps1() {
      const segs = [['researcher@labs', 'ok bold'], ' ', [tilde(S.cwd), 'info bold']];
      if (inLabs()) segs.push(' ', ['(' + git.branch + ')', 'accent2']);
      if (S.last) segs.push(' ', [String(S.last), 'bad']);
      segs.push(' ', ['$', S.last ? 'bad bold' : 'fg bold'], ' ');
      return segs;
    }
    const known = (w) => !!(OS.commands.get(w) || S.aliases.has(w) || BUILTINS.has(w) || OS.apps[w] || (w.includes('/') && quietLookup(w)));
    const pathExists = (w) => { try { return OS.fs.exists(OS.fs.resolve(S.cwd, w)); } catch { return false; } };
    // zsh-style colours for the line being typed: known commands green, unknown red, strings, flags, paths.
    function highlight(src) {
      const cls = new Array(src.length).fill('');
      let i = 0; let cmdPos = true; let redirNext = false;
      while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === '#') { for (let j = i; j < src.length; j++) cls[j] = 'faint'; break; }
        const op = OPS.find((o) => src.startsWith(o, i));
        if (op && !(op[0] === '2' && i > 0 && !/\s/.test(src[i - 1]))) {
          for (let j = 0; j < op.length; j++) cls[i + j] = 'accent';
          i += op.length;
          if (['|', ';', '&', '&&', '||'].includes(op)) cmdPos = true; else if (op !== '2>&1') redirNext = true;
          continue;
        }
        const start = i; let q = null; let val = '';
        while (i < src.length) {
          const ch = src[i];
          if (q) { cls[i] = 'warn'; if (ch === q) q = null; else val += ch; i++; continue; }
          if (/\s/.test(ch) || '|;&<>'.includes(ch)) break;
          if (ch === '"' || ch === "'") { q = ch; cls[i] = 'warn'; i++; continue; }
          if (ch === '$') { const m = /^\$(\{[^}]*\}|[A-Za-z_]\w*|[?$#0-9])/.exec(src.slice(i)); if (m) { for (let j = 0; j < m[0].length; j++) cls[i + j] = 'accent2'; i += m[0].length; val += m[0]; continue; } }
          val += ch; i++;
        }
        let wc = '';
        if (cmdPos && /^[A-Za-z_]\w*=/.test(val)) wc = 'accent2';
        else if (cmdPos) { wc = known(val) ? 'ok' : 'bad'; cmdPos = false; }
        else if (redirNext) { wc = 'u'; redirNext = false; }
        else if (val.startsWith('-')) wc = 'info';
        else if (val && pathExists(val)) wc = 'u';
        for (let j = start; j < i; j++) if (!cls[j]) cls[j] = wc;
      }
      return cls;
    }
    const cursorEl = (ch, cls) => h('span', { class: ('terminal-cur ' + CLS(cls)).trim() }, ch);
    function renderInput(el, val, pos, ghost, hl) {
      const cl = hl ? highlight(val) : [];
      let i = 0;
      while (i < val.length) {
        if (i === pos) { el.append(cursorEl(val[i], cl[i])); i++; continue; }
        let j = i + 1;
        while (j < val.length && j !== pos && cl[j] === cl[i]) j++;
        put(el, val.slice(i, j), cl[i]); i = j;
      }
      if (pos >= val.length) {
        if (ghost) { el.append(cursorEl(ghost[0], 'faint')); put(el, ghost.slice(1), 'faint'); } else el.append(cursorEl(' '));
      }
    }
    function ghostFor(val, pos) {
      if (!val.trim() || pos < val.length) return '';
      for (let i = hist.length - 1; i >= 0; i--) if (hist[i].length > val.length && hist[i].startsWith(val)) return hist[i].slice(val.length);
      return '';
    }
    function render() {
      active.textContent = '';
      active.classList.toggle('terminal-gap', (S.mode === 'idle' || S.mode === 'search') && out.childElementCount > 0);
      const val = ta.value; const pos = Math.min(ta.selectionStart ?? val.length, val.length);
      if (S.mode === 'boot') return;
      if (S.mode === 'running') { active.append(cursorEl(' ')); return; }
      if (S.mode === 'prompt') {
        put(active, S.ask.q, S.ask.cls);
        if (S.ask.secret) active.append(cursorEl(' ')); else renderInput(active, val, pos, null, false);
        return;
      }
      if (S.mode === 'search') {
        const m = S.search; const match = m.idx >= 0 ? hist[m.idx] : '';
        put(active, [[m.failed ? '(failed reverse-i-search)' : '(reverse-i-search)', 'muted'], ['`', 'faint'], [m.q, 'warn'], ["': ", 'faint']]);
        renderInput(active, match, match ? Math.max(0, match.indexOf(m.q)) : 0, null, true);
        return;
      }
      put(active, ps1());
      renderInput(active, val, pos, ghostFor(val, pos), true);
    }
    function echoPrompt(line, tail) {
      const el = h('div', { class: 'terminal-l terminal-echo' });
      put(el, ps1()); renderInput(el, line, -1, null, true);
      if (el.lastChild?.classList?.contains('terminal-cur')) el.lastChild.remove();
      if (tail) put(el, tail, 'muted');
      out.append(el); trim(); bump();
    }
    function echoAsk(a, val, tail) {
      const el = h('div', { class: 'terminal-l' });
      put(el, a.q, a.cls); if (!a.secret) put(el, val); if (tail) put(el, tail, 'muted');
      out.append(el); trim(); bump();
    }
    const setIdleTitle = () => win.setTitle('brickty: ' + tilde(S.cwd));

    // ----- variables, words, globs -----
    function getVar(k) {
      switch (k) {
        case '?': return String(S.last);
        case '$': return String(S.pid);
        case '#': return '0';
        case '0': return 'brickty';
        case 'PWD': return S.cwd;
        case 'OLDPWD': return S.oldpwd || '';
        case 'RANDOM': return String(Math.floor(Math.random() * 32768));
        case 'COLUMNS': measure(); return String(S.cols);
        case 'LINES': measure(); return String(S.rows);
        default: return S.vars.get(k) ?? '';
      }
    }
    function globMatch(parts) {
      const segs = [[]];
      for (const p of parts) { if (p.c === '/' && !p.g) segs.push([]); else segs[segs.length - 1].push(p); }
      const absolute = parts[0]?.c === '/';
      let cands = [{ abs: absolute ? '/' : S.cwd, disp: absolute ? '/' : '' }];
      const join = (c, nm) => ({ abs: c.abs === '/' ? '/' + nm : c.abs + '/' + nm, disp: c.disp + (c.disp && !c.disp.endsWith('/') ? '/' : '') + nm });
      for (const seg of segs) {
        if (!seg.length) continue;
        const text = seg.map((p) => p.c).join('');
        if (!seg.some((p) => p.g && !p.q)) { cands = cands.map((c) => join(c, text)).filter((c) => OS.fs.exists(c.abs)); continue; }
        const re = new RegExp('^' + seg.map((p) => (p.g && !p.q ? (p.c === '*' ? '.*' : '.') : reEsc(p.c))).join('') + '$');
        const next = [];
        for (const c of cands) {
          if (!OS.fs.isDir(c.abs)) continue;
          for (const e of OS.fs.ls(c.abs)) { if (e.name.startsWith('.') && !text.startsWith('.')) continue; if (re.test(e.name)) next.push(join(c, e.name)); }
        }
        cands = next;
      }
      return cands.map((c) => c.disp).sort();
    }
    function expandWord(w) {
      const parts = [];
      for (const p of w.parts) {
        if (p.ar !== undefined) {
          let val = '0';
          try { val = String(Math.trunc(arith(p.ar.replace(/\$?([A-Za-z_]\w*)/g, (m, nm) => getVar(nm) || '0')))); } catch { val = '0'; }
          for (const c of val) parts.push({ c, q: true });
        } else if (p.v !== undefined) { for (const c of getVar(p.v)) parts.push({ c, q: true }); } else parts.push(p);
      }
      const v = parts.map((p) => p.c).join('');
      if (!parts.some((p) => p.g && !p.q)) return [v];
      const m = globMatch(parts);
      return m.length ? m : [v];
    }

    // ----- jobs -----
    const newJob = () => { const j = { aborted: false, killed: false, done: false, sleeps: new Set(), trap: null }; j.killP = new Promise((r) => { j.killR = r; }); return j; };
    const wake = (job) => { for (const f of [...job.sleeps]) f(); };
    const killJob = (job) => { if (job.done || job.killed) return; job.killed = true; job.aborted = true; wake(job); job.killR(130); };
    // o is the sleeper's output: when it is a pipe and the reader leaves, the sleep ends early.
    function jobSleep(job, ms, o) {
      return new Promise((res) => {
        if (job.aborted || o?.broken || win.closed) { res(); return; }
        if (ms >= 400) o?.idle?.();
        let t = 0;
        const done = () => { clearTimeout(t); job.sleeps.delete(done); o?.sleepers?.delete(done); res(); };
        t = setTimeout(done, Math.max(0, ms) / OS.speed);
        job.sleeps.add(done); o?.sleepers?.add(done);
      });
    }
    function ask(job, q, opt = {}) {
      return new Promise((res) => {
        if (job.aborted || win.closed) { res(opt.eof ? null : ''); return; }
        S.openLine = null;
        // Type-ahead, like a tty: a line typed before the question was asked is its answer.
        if (S.queue.length) { const v = S.queue.shift(); echoAsk({ q, cls: opt.cls, secret: !!opt.secret }, v); res(v); return; }
        S.ask = { q, cls: opt.cls, secret: !!opt.secret, eof: !!opt.eof, res, job };
        S.mode = 'prompt';
        render(); bump();
      });
    }
    function cdTo(p) {
      const abs = OS.fs.resolve(S.cwd, p == null || p === '' ? HOME : String(p));
      if (!OS.fs.isDir(abs)) return false;
      if (abs !== S.cwd) { S.oldpwd = S.cwd; S.cwd = abs; }
      if (S.mode === 'idle') setIdleTitle();
      return true;
    }
    function makeIO(job, o, e, stdin) {
      return {
        println: (t = '', c) => o.line(t, c),
        print: (t = '', c) => { o.part(t, c); },
        error: (t = '', c = 'bad') => e.line(t, c),
        clear: () => o.clear(),
        get cwd() { return S.cwd; },
        cd: (p) => cdTo(p),
        get cols() { measure(); return S.cols; },
        get rows() { measure(); return S.rows; },
        sleep: (ms) => jobSleep(job, ms, o),
        get aborted() { return job.aborted || win.closed || !!o.broken; },
        read: () => (stdin && !Array.isArray(stdin) ? stdin.read(o) : Promise.resolve(null)),
        prompt: (q, opt) => { o.idle?.(); return ask(job, q, opt); },
        open: (id, a) => OS.open(id, a),
        trap: (fn) => { job.trap = fn; },
        win,
        stdin: stdin || null,
        isTTY: !!o.tty,
        sh: S,
        _ctx: { job, o, e },
      };
    }
    function quietLookup(cmd) {
      if (!cmd.includes('/')) return null;
      const abs = OS.fs.resolve(S.cwd, cmd);
      return abs.startsWith(LABS + '/') ? OS.commands.get(abs.slice(LABS.length + 1)) : null;
    }
    function lookup(cmd, e) {
      const c = OS.commands.get(cmd);
      if (c) return c;
      if (cmd.includes('/')) {
        const c2 = quietLookup(cmd); if (c2) return c2;
        const abs = OS.fs.resolve(S.cwd, cmd);
        if (OS.fs.isDir(abs)) e.line(`brickty: ${cmd}: Is a directory`, 'bad');
        else if (OS.fs.isFile(abs)) e.line(`brickty: ${cmd}: Permission denied`, 'bad');
        else e.line(`brickty: no such file or directory: ${cmd}`, 'bad');
        return false;
      }
      const app = OS.apps[cmd];
      if (app) return { name: cmd, run: (a, io) => { io.open(cmd, a.length ? { path: OS.fs.resolve(io.cwd, a[0]) } : undefined); io.println(`brickty: opened ${app.title}`, 'faint'); return 0; } };
      return null;
    }
    function notFound(cmd, e) {
      e.line(`brickty: command not found: ${cmd}`, 'bad');
      let best = null; let bd = cmd.length <= 3 ? 2 : 3;
      if (cmd.length > 1) for (const n of [...OS.commands.names(), ...S.aliases.keys()]) { if (n.length < 2) continue; const d = lev(cmd, n); if (d < bd) { bd = d; best = n; } }
      if (best) e.line([['Did you mean ', 'muted'], [best, 'ok'], ['?', 'muted']]);
    }
    const temps = new Map();
    async function runCommand(argv, job, o, e, stdin, depth, noAlias) {
      let i = 0;
      while (i < argv.length && /^[A-Za-z_]\w*=/.test(argv[i])) i++;
      if (!argv.length) return 0;
      const kv = (a) => { const j = a.indexOf('='); return [a.slice(0, j), a.slice(j + 1)]; };
      if (i === argv.length) { for (const [k, v] of argv.map(kv)) { const t = temps.get(k); if (t) t.base = v; else S.vars.set(k, v); } return 0; }
      // VAR=x cmd: stages of one pipeline overlap, so each key keeps a stack and gets its first value back at the end.
      const saved = argv.slice(0, i).map(kv).map(([k, v]) => {
        let t = temps.get(k);
        if (!t) temps.set(k, (t = { base: S.vars.get(k), list: [] }));
        const mine = { v }; t.list.push(mine); S.vars.set(k, v);
        return [k, mine];
      });
      const cmd = argv[i]; const args = argv.slice(i + 1);
      try {
        if (S.aliases.has(cmd) && !noAlias.has(cmd)) {
          const nx = new Set(noAlias); nx.add(cmd);
          return await execText(S.aliases.get(cmd) + (args.length ? ' ' + args.map(shq).join(' ') : ''), job, o, e, stdin, depth + 1, nx);
        }
        const spec = lookup(cmd, e);
        if (spec === false) return 126;
        if (!spec) { notFound(cmd, e); return 127; }
        // Only commands marked stream read a pipe line by line. The rest get every line once the writer ends.
        let input = stdin;
        if (input && !Array.isArray(input) && !spec.stream) {
          input = await Promise.race([input.all(o), job.killP]);
          if (job.killed) return 130;
        }
        const io = makeIO(job, o, e, input);
        const p = (async () => spec.run.call(spec, args, io))();
        p.catch(() => {});
        const r = await Promise.race([p, job.killP]);
        if (job.killed) return 130;
        return typeof r === 'number' ? r : (io.aborted ? 130 : 0);
      } catch (err) {
        e.line(`${cmd}: ${err?.message || err}`, 'bad');
        return 1;
      } finally {
        for (const [k, mine] of saved) {
          const t = temps.get(k); t.list.splice(t.list.indexOf(mine), 1);
          if (t.list.length) S.vars.set(k, t.list[t.list.length - 1].v);
          else { temps.delete(k); if (t.base === undefined) S.vars.delete(k); else S.vars.set(k, t.base); }
        }
      }
    }
    function writeOut(abs, text, append, e, typed) {
      try {
        const prev = append && OS.fs.isFile(abs) ? OS.fs.read(abs) : '';
        writeFile(abs, prev + text);
      } catch (err) { e.line('brickty: ' + errText('write', typed, err).replace(/^write: /, ''), 'bad'); }
    }
    // Every stage runs at once, joined by pipes, so a stage that runs until Ctrl+C still feeds the next one.
    // A stage that ends closes the pipe it reads, which ends the stage before it (head -3 stops ping).
    async function runPipeline(stages, job, o, e, stdin, depth, noAlias) {
      const pipes = stages.slice(1).map(() => makePipe());
      const runStage = async (k) => {
        const st = stages[k]; const up = k ? pipes[k - 1] : null; const down = pipes[k] || null;
        let ps = null;
        try {
          let input = up || stdin;
          const argv = [];
          for (const w of st.words) argv.push(...expandWord(w));
          let outFile = null; let outTyped = ''; let append = false; let errMode = null; let errFile = null; let bad = false;
          for (const r of st.redirs) {
            if (r.op === '2>&1') { errMode = 'out'; continue; }
            const target = expandWord(r.target)[0] ?? '';
            const abs = OS.fs.resolve(S.cwd, target);
            if (r.op === '<') {
              try { input = abs === '/dev/null' ? [] : splitLines(OS.fs.read(abs)); } catch (err) { e.line('brickty: ' + errText('x', target, err).replace(/^x: /, ''), 'bad'); bad = true; }
              continue;
            }
            const deny = abs === '/dev/null' ? null : denyWrite(abs) || (OS.fs.isDir(abs) ? 'Is a directory' : null) || (!OS.fs.isDir(OS.fs.dirname(abs)) ? 'No such file or directory' : null);
            if (deny) { e.line(`brickty: ${target}: ${deny}`, 'bad'); bad = true; continue; }
            if (r.op === '2>') { errMode = 'file'; errFile = abs; } else { outFile = abs; outTyped = target; append = r.op === '>>'; if (r.op === '&>') errMode = 'out'; }
          }
          if (bad) return 1;
          const cap = outFile ? capture() : null;
          if (!cap && down) ps = pipeSink(down);
          const so = cap || ps || o;
          const ecap = errMode === 'file' ? capture() : null;
          const se = errMode === 'out' ? so : ecap || e;
          const code = await runCommand(argv, job, so, se, input, depth, noAlias);
          if (outFile && outFile !== '/dev/null') writeOut(outFile, cap.text(), append, e, outTyped);
          if (ecap && errFile !== '/dev/null') writeOut(errFile, ecap.text(), false, e, errFile);
          return code;
        } finally {
          if (ps) ps.end(); else down?.end();
          up?.close();
        }
      };
      const codes = await Promise.all(stages.map((_, k) => runStage(k)));
      return job.aborted ? 130 : codes[codes.length - 1];
    }
    async function execText(text, job, o, e, stdin, depth, noAlias) {
      if (depth > 12) { e.line('brickty: aliases nested twelve deep. It is aliases all the way down.', 'bad'); return 1; }
      const lx = lex(text);
      if (lx.error) { e.line('brickty: ' + lx.error, 'bad'); return 2; }
      const ps = parse(lx.toks);
      if (ps.error) { e.line('brickty: ' + ps.error, 'bad'); return 2; }
      let code = S.last;
      for (const item of ps.list) {
        if (job.aborted) return 130;
        if (item.conn === '&&' && code !== 0) continue;
        if (item.conn === '||' && code === 0) continue;
        if (item.bg) {
          const n = ++S.bgN;
          o.line(`[${n}] ${S.pid + n * 3}`, 'muted');
          e.line(`brickty: job [${n}] is waiting on a background job. It will not wake you.`, 'warn');
          code = 0; continue;
        }
        code = await runPipeline(item.stages, job, o, e, stdin, depth, noAlias);
        stdin = null;
        S.last = code;
      }
      return code;
    }
    S.execNested = (text, io) => execText(text, io._ctx.job, io._ctx.o, io._ctx.e, io.stdin, 1, new Set());

    // ----- running a line from the prompt -----
    // !! and !n, as bash does: not inside single quotes, and not after a backslash.
    function expandBang(text) {
      let err = null; let r = ''; let q = null;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q === "'") { r += c; if (c === "'") q = null; continue; }
        if (c === '\\') { r += text.slice(i, i + 2); i++; continue; }
        if (c === '"') q = q ? null : '"';
        else if (c === "'" && !q) q = "'";
        const m = c === '!' ? /^!(!|-?\d+)/.exec(text.slice(i)) : null;
        if (!m) { r += c; continue; }
        let ev;
        if (m[1] === '!') ev = hist[hist.length - 1];
        else { const n = parseInt(m[1], 10); ev = n < 0 ? hist[hist.length + n] : hist[n - 1]; }
        if (ev == null) { err ||= `${m[0]}: event not found`; ev = m[0]; }
        r += ev; i += m[0].length - 1;
      }
      return err ? { error: err } : { text: r };
    }
    function pushHist(t) {
      if (hist[hist.length - 1] !== t) hist.push(t);
      if (hist.length > 1000) hist.splice(0, hist.length - 1000);
      saveHist();
    }
    async function runLine(text) {
      const job = newJob();
      S.job = job; S.mode = 'running'; render();
      win.setTitle('brickty: ' + clip(text.trim(), 48));
      let code = 0;
      try { const sk = sinkFor(job); code = await execText(text, job, sk, sk, null, 0, new Set()); } catch (err) { scr.line(`brickty: ${err?.message || err}`, 'bad'); code = 1; }
      job.done = true;
      if (S.ask?.job === job) S.ask = null;
      if (win.closed) return;
      S.last = job.killed ? 130 : code;
      S.job = null; S.mode = 'idle'; S.openLine = null;
      setIdleTitle();
      render(); bump();
    }
    async function runInteractive(line) {
      S.openLine = null;
      echoPrompt(line);
      let text = line;
      if (/!(!|-?\d)/.test(text)) {
        const ex = expandBang(text);
        if (ex.error) { scr.line('brickty: ' + ex.error, 'bad'); S.last = 1; render(); drain(); return; }
        if (ex.text !== text) { text = ex.text; scr.line(text, 'muted'); }
      }
      if (text.trim() && !/^\s/.test(line)) pushHist(text.trim());
      if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(text)) await forkBomb();
      else if (text.trim()) await runLine(text);
      if (win.closed) return;
      render(); drain();
    }
    // The classic fork bomb fails on purpose, through the crash panel.
    async function forkBomb() {
      S.mode = 'running'; render();
      for (let i = 0; i < 8; i++) { scr.line('brickty: fork: retry: Resource temporarily unavailable', 'bad'); await win.sleep(70); if (win.closed) return; }
      S.mode = 'idle'; S.last = 137; render();
      win.crash({
        title: 'Fork bomb defused', icon: 'bricky-filled', code: 'EAGAIN 0x0016 ONE_PROCESS_PER_STAGE',
        lines: ['Every process started two more, like lanes reviewing lanes.', 'Bricky stopped it at 22 processes, one per Composer stage.'],
        details: ['spawned by:        :(){ :|:& };:', 'processes:         22', 'reviewers spawned: 22, one per process', 'features shipped:  0', 'result:            not worse than main'],
      });
    }
    function drain() {
      if (S.mode !== 'idle' || !S.queue.length) return;
      runInteractive(S.queue.shift());
    }
    S.run = (line) => { S.queue.push(line); drain(); };

    // ----- keys -----
    const caret = (p) => { const v = OS.clamp(p, 0, ta.value.length); ta.setSelectionRange(v, v); render(); };
    const setBuf = (v) => { ta.value = v; ta.setSelectionRange(v.length, v.length); render(); };
    const pos = () => ta.selectionStart ?? ta.value.length;
    function acceptGhost() { const g = S.mode === 'idle' ? ghostFor(ta.value, pos()) : ''; if (g) { setBuf(ta.value + g); return true; } return false; }
    function histMove(dir) {
      if (S.hi == null) { S.hprefix = ta.value; S.hsaved = ta.value; S.hi = hist.length; }
      let i = S.hi;
      for (;;) {
        i += dir;
        if (i < 0) return;
        if (i >= hist.length) { S.hi = hist.length; setBuf(S.hsaved); return; }
        if (hist[i].startsWith(S.hprefix) && hist[i] !== ta.value) break;
      }
      S.hi = i; setBuf(hist[i]);
    }
    function answer(val) {
      const a = S.ask; if (!a) return;
      S.ask = null; S.mode = 'running';
      echoAsk(a, val);
      setBuf('');
      a.res(val);
    }
    function submit() {
      if (S.mode === 'prompt') { answer(ta.value); return; }
      if (S.mode === 'running') { S.queue.push(ta.value); setBuf(''); return; }
      if (S.mode !== 'idle') return;
      const line = ta.value;
      S.hi = null; setBuf('');
      runInteractive(line);
    }
    function interrupt() {
      if (S.mode === 'idle') { echoPrompt(ta.value, '^C'); S.hi = null; S.last = 130; setBuf(''); return; }
      const job = S.job; if (!job) return;
      if (job.trap && !job.aborted) { job.trap(); return; }
      if (job.aborted) { killJob(job); return; }
      job.aborted = true;
      S.queue.length = 0;
      if (S.mode === 'prompt' && S.ask) {
        const a = S.ask; S.ask = null; S.mode = 'running';
        echoAsk(a, ta.value, '^C'); ta.value = '';
        a.res(a.eof ? null : '');
      } else if (S.openLine) { screenPart('^C', 'muted'); S.openLine = null; } else scr.line('^C', 'muted');
      wake(job);
      win.after(1500, () => killJob(job));
      render();
    }
    function eof() {
      if (S.mode === 'idle') { echoPrompt('', 'exit'); win.after(120, () => win.close()); return; }
      if (S.mode === 'prompt' && S.ask?.eof) { const a = S.ask; S.ask = null; S.mode = 'running'; echoAsk(a, ''); a.res(null); }
    }
    function startSearch() { S.search = { q: '', idx: -1, saved: ta.value, failed: false }; S.mode = 'search'; ta.value = ''; render(); }
    function findOlder(q, from) { for (let i = from; i >= 0; i--) if (q && hist[i].includes(q)) return i; return -1; }
    function updateSearch() { const m = S.search; m.q = ta.value; const i = findOlder(m.q, hist.length - 1); m.idx = i; m.failed = !!m.q && i < 0; render(); }
    function endSearch(v) { S.search = null; S.mode = 'idle'; setBuf(v); }
    function searchKey(e) {
      const m = S.search; const ctrl = e.ctrlKey && !e.metaKey; const k = (e.key || '').toLowerCase();
      const cur = m.idx >= 0 ? hist[m.idx] : '';
      if (ctrl && k === 'r') { const i = findOlder(m.q, m.idx - 1); if (i >= 0) { m.idx = i; m.failed = false; } else m.failed = !!m.q; render(); return true; }
      if (ctrl && (k === 'c' || k === 'g')) { endSearch(m.saved); return true; }
      if (e.key === 'Enter') { endSearch(''); if (cur) runInteractive(cur); return true; }
      if (['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End'].includes(e.key) || (ctrl && (k === 'a' || k === 'e'))) { endSearch(cur || m.saved); return true; }
      return false;
    }
    function bell() { OS.sound.beep(440, 30, 'sine', 0.02); }
    function killWord() {
      const p = pos(); const cut = ta.value.slice(0, p).replace(/\s+$/, '').replace(/\S+$/, '');
      ta.value = cut + ta.value.slice(p); caret(cut.length);
    }
    function handleKey(e) {
      if (e.isComposing || e.keyCode === 229) return false;
      S.stick = true; bump();
      if (S.mode === 'search') return searchKey(e);
      const k = e.key || '';
      // Outside macOS the browser keeps Ctrl+W and closes the tab, so Alt+Backspace deletes a word too.
      if (e.altKey && !e.ctrlKey && !e.metaKey && k === 'Backspace') { killWord(); return true; }
      if (e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (k.toLowerCase()) {
          case 'c': interrupt(); return true;
          case 'd': {
            if (!ta.value) { eof(); return true; }
            const p = pos(); if (p < ta.value.length) { ta.value = ta.value.slice(0, p) + ta.value.slice(p + 1); caret(p); }
            return true;
          }
          case 'l': if (S.mode !== 'running') { scr.clear(); render(); } return true;
          case 'a': caret(0); return true;
          case 'e': if (!acceptGhost()) caret(ta.value.length); return true;
          case 'b': caret(pos() - 1); return true;
          case 'f': if (!(pos() >= ta.value.length && acceptGhost())) caret(pos() + 1); return true;
          case 'u': { const p = pos(); ta.value = ta.value.slice(p); caret(0); return true; }
          case 'w': killWord(); return true;
          case 'r': if (S.mode === 'idle') startSearch(); return true;
          case 'p': if (S.mode === 'idle') histMove(-1); return true;
          case 'n': if (S.mode === 'idle') histMove(1); return true;
          default: return false;
        }
      }
      if (e.metaKey || e.altKey) return false;
      switch (k) {
        case 'Enter': submit(); return true;
        case 'Tab': if (S.mode === 'idle') complete(); return true;
        case 'ArrowUp': if (S.mode === 'idle') histMove(-1); return true;
        case 'ArrowDown': if (S.mode === 'idle') histMove(1); return true;
        case 'ArrowLeft': caret(pos() - 1); return true;
        case 'ArrowRight': if (!(pos() >= ta.value.length && acceptGhost())) caret(pos() + 1); return true;
        case 'Home': caret(0); return true;
        case 'End': if (!acceptGhost()) caret(ta.value.length); return true;
        case 'Escape': return true;
        default: return false;
      }
    }
    function onInput() {
      S.hi = null;
      const v = ta.value;
      if (/[\r\n]/.test(v)) {
        const parts = v.split(/\r\n|\r|\n/);
        const rest = parts.pop();
        setBuf(rest);
        if (S.mode === 'search') { S.search = null; S.mode = 'idle'; }
        if (S.mode === 'prompt') answer(parts.shift());
        S.queue.push(...parts);
        drain();
        return;
      }
      if (S.mode === 'search') { updateSearch(); return; }
      render();
    }
    ta.addEventListener('keydown', (e) => { if (handleKey(e)) { e.preventDefault(); e.stopPropagation(); } });
    ta.addEventListener('input', onInput);
    ta.addEventListener('keyup', () => { if (S.mode !== 'search') render(); });
    ta.addEventListener('compositionend', () => render());

    // ----- Tab completion -----
    const escWord = (v) => v.replace(/([\s'"\\|;&<>()$*?])/g, '\\$1');
    function pathCands(cur, dirsOnly) {
      if (cur === '~') return [{ v: '~/', d: '~/', dir: true }];
      const slash = cur.lastIndexOf('/');
      const dirPart = slash >= 0 ? cur.slice(0, slash + 1) : '';
      const base = slash >= 0 ? cur.slice(slash + 1) : cur;
      const dirAbs = OS.fs.resolve(S.cwd, dirPart || '.');
      if (!OS.fs.isDir(dirAbs)) return [];
      return OS.fs.ls(dirAbs)
        .filter((e) => e.name.startsWith(base) && (base.startsWith('.') || !e.name.startsWith('.')) && (!dirsOnly || e.type === 'dir'))
        .map((e) => ({ v: dirPart + e.name + (e.type === 'dir' ? '/' : ''), d: e.name + (e.type === 'dir' ? '/' : ''), dir: e.type === 'dir' }));
    }
    function complete() {
      const val = ta.value; const p = pos(); const before = val.slice(0, p);
      let q = null; let words = []; let cur = ''; let curStart = 0;
      for (let i = 0; i < before.length; i++) {
        const ch = before[i];
        if (q) { if (ch === q) q = null; else cur += ch; continue; }
        if (ch === '"' || ch === "'") { q = ch; continue; }
        if (ch === '\\' && i + 1 < before.length) { cur += before[++i]; continue; }
        if (/\s/.test(ch)) { if (cur) words.push(cur); cur = ''; curStart = i + 1; continue; }
        if ('|;&'.includes(ch)) { words = []; cur = ''; curStart = i + 1; continue; }
        if ('<>'.includes(ch)) { if (cur) words.push(cur); words.push(ch); cur = ''; curStart = i + 1; continue; }
        cur += ch;
      }
      const real = words.filter((w) => !/^[A-Za-z_]\w*=/.test(w));
      const isCmd = real.length === 0;
      let cands = [];
      if (isCmd && !cur.includes('/')) {
        const names = new Set([...OS.commands.names(), ...S.aliases.keys(), ...BUILTINS]);
        cands = [...names].filter((n) => n.startsWith(cur)).sort().map((n) => ({ v: n, d: n, dir: false }));
      } else {
        const spec = !isCmd && OS.commands.get(real[0]);
        const afterRedir = words[words.length - 1] === '>' || words[words.length - 1] === '<';
        if (spec?.complete && !afterRedir) {
          try {
            const r = spec.complete([...real.slice(1), cur], { cwd: S.cwd }) || [];
            cands = [...new Set(r)].filter((x) => typeof x === 'string' && x.startsWith(cur)).map((x) => ({ v: x, d: x, dir: false }));
          } catch { cands = []; }
        }
        if (!cands.length) cands = pathCands(cur, !!spec?.dirsOnly && !afterRedir);
      }
      if (!cands.length) { bell(); return; }
      const replace = (v, fin) => {
        const ins = (v.startsWith('~/') ? '~/' + escWord(v.slice(2)) : escWord(v)) + (fin ? ' ' : '');
        ta.value = val.slice(0, curStart) + ins + val.slice(p);
        caret(curStart + ins.length);
      };
      if (cands.length === 1) { replace(cands[0].v, !cands[0].dir); return; }
      const lcp = cands.reduce((a, c) => { let i = 0; while (i < a.length && i < c.v.length && a[i] === c.v[i]) i++; return a.slice(0, i); }, cands[0].v);
      if (lcp.length > cur.length) { replace(lcp, false); return; }
      measure();
      echoPrompt(val);
      const items = cands.slice(0, 240).map((c) => ({ t: c.d, c: c.dir ? 'accent bold' : isCmd ? 'ok' : '' }));
      for (const l of grid(items, S.cols)) scr.line(l);
      if (cands.length > 240) scr.line(`… and ${cands.length - 240} more`, 'faint');
      render();
    }

    // ----- focus, clicks, resize -----
    S.focusInput = () => { if (!win.closed) ta.focus({ preventScroll: true }); };
    S.insert = (s) => { const p = pos(); ta.value = ta.value.slice(0, p) + s + ta.value.slice(p); caret(p + s.length); onInput(); };
    scroller.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && String(sel).length) return;
      S.focusInput();
    });
    win.on('focus', () => { root.classList.remove('terminal-blur'); S.focusInput(); });
    win.on('blur', () => root.classList.add('terminal-blur'));
    win.on('resize', () => { measure(); bump(); });
    S.onKey = (e) => {
      if (!e.key) return;
      const sel = window.getSelection();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && sel && !sel.isCollapsed && String(sel).length) return;
      if (e.metaKey) { if (e.key.toLowerCase() === 'v') S.focusInput(); return; }
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      S.focusInput();
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey) { e.preventDefault(); S.insert(e.key); return; }
      if (handleKey(e)) e.preventDefault();
    };
    S.dispose = () => { if (S.job) killJob(S.job); sessions.delete(S); };
    sessions.add(S);

    // ----- start: aliases from ~/.bashrc, the login line, then the first command -----
    (async () => {
      const job = newJob();
      for (const l of splitLines(safeRead(HOME + '/.bashrc'))) {
        if (!/^\s*(alias|export)\s/.test(l)) continue;
        try { await execText(l, job, nullSink, nullSink, null, 1, new Set()); } catch { /* a broken line in .bashrc; skip it, like a real shell would complain and carry on */ }
      }
      job.done = true;
      if (win.closed) return;
      const last = OS.store.get('terminal.lastLogin', null);
      const n = OS.wm.list().filter((w) => w.app.id === 'terminal').length;
      scr.line(last ? `Last login: ${DAY[new Date(last).getDay()]} ${new Date(last).getDate()} ${MON[new Date(last).getMonth()]} ${hhmm(new Date(last))} on pts/${n}` : 'First login. There is a first time for everything, and this was it.', 'faint');
      OS.store.set('terminal.lastLogin', OS.now().getTime());
      if (!hist.length && !arg?.run) scr.line([['Type ', 'faint'], ['help', 'ok'], [' for commands, or ', 'faint'], ['brickfetch', 'ok'], [' for the view. Tab completes.', 'faint']]);
      S.mode = 'idle'; setIdleTitle(); measure(); render();
      if (arg?.run) win.after(40, () => { measure(); S.run(String(arg.run)); });
    })();
    return S;
  }

  // =====================================================================================
  // Core commands. Each one is registered through OS.commands, like any other app's.
  // =====================================================================================
  function getopts(args, spec) {
    const f = {}; const rest = []; let stop = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (stop || a === '-' || !a.startsWith('-') || (/^-\d+$/.test(a) && !spec.num)) { rest.push(a); continue; }
      if (a === '--') { stop = true; continue; }
      if (a.startsWith('--')) { const j = a.indexOf('='); f[j > 0 ? a.slice(2, j) : a.slice(2)] = j > 0 ? a.slice(j + 1) : true; continue; }
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (spec.val?.includes(ch)) { f[ch] = a.slice(j + 1) || args[++i]; break; }
        if (spec.bool?.includes(ch)) f[ch] = true; else return { bad: ch, f, rest };
      }
    }
    return { f, rest };
  }
  // Files or stdin -> [{name, lines}] ; errors print and come back as {err: true}
  // A stream command's piped stdin comes back as {live: true}: read it with eachLine.
  function readSources(io, files, cmd) {
    const std = () => (io.stdin && !Array.isArray(io.stdin) ? { name: '-', live: true, lines: [] } : { name: '-', lines: io.stdin || [] });
    if (!files.length) return [std()];
    return files.map((f) => {
      if (f === '-') return std();
      const abs = OS.fs.resolve(io.cwd, f);
      try { return { name: f, lines: splitLines(OS.fs.read(abs)) }; } catch (e) { io.error(errText(cmd, f, e)); return { name: f, err: true, lines: [] }; }
    });
  }
  // fn gets each line of a source, a piped one as it arrives. fn returns false to stop reading.
  async function eachLine(io, src, fn) {
    if (!src.live) { for (const l of src.lines) if (fn(l) === false) return; return; }
    for (let l; (l = await io.read()) !== null;) if (fn(l) === false) return;
  }
  const isExec = (abs, dir) => !dir && (/\/bin\/[^/]+$/.test(abs) || safeRead(abs).startsWith('#!'));
  function entryFor(abs, label) {
    const st = OS.fs.stat(abs); const dir = st?.type === 'dir';
    return { name: label, abs, dir, size: dir ? 4096 : safeRead(abs).length, mtime: st?.mtime || Date.now(), exec: isExec(abs, dir) };
  }
  const clsFor = (e) => (e.dir ? 'accent bold' : e.exec ? 'ok bold' : e.name.startsWith('.') ? 'muted' : /\.rb$/.test(e.name) ? 'bad'
    : /\.(ts|tsx|js|mjs)$/.test(e.name) ? 'info' : /\.(ya?ml|json|lock)$/.test(e.name) ? 'warn' : /\.(png|jpg|svg)$/.test(e.name) ? 'accent2' : '');
  const ownerOf = (abs) => (abs.startsWith('/gold') ? ['gold', 'gold'] : abs.startsWith(HOME) || abs.startsWith('/tmp') ? ['researcher', 'labs'] : ['root', 'root']);
  const permsOf = (e) => { const ro = e.abs.startsWith('/gold'); if (e.dir) return ro ? 'dr-xr-xr-x' : 'drwxr-xr-x'; if (ro) return '-r--r--r--'; return e.exec ? '-rwxr-xr-x' : '-rw-r--r--'; };
  function lsBlock(io, list, f) {
    if (f.l) {
      const sz = list.map((e) => (f.h ? human(e.size) : String(e.size)));
      const sw = Math.max(...sz.map((s) => s.length), 1);
      list.forEach((e, i) => {
        const [o, g] = ownerOf(e.abs);
        const narrow = io.cols < 66;
        io.println([[permsOf(e), 'muted'], narrow ? ' ' : ' 1 ', [o.padEnd(11), 'accent2'], narrow ? '' : [g.padEnd(6), 'faint'], sz[i].padStart(sw), ' ', [lsDate(e.mtime), 'muted'], ' ', [e.name, clsFor(e)]]);
      });
      return;
    }
    if (!io.isTTY || f['1']) { list.forEach((e) => io.println(e.name)); return; }
    for (const l of grid(list.map((e) => ({ t: e.name, c: clsFor(e) })), io.cols)) io.println(l);
  }
  const relDisp = (p, abs, q) => (q === abs ? p : (p === '/' ? '' : p.replace(/\/+$/, '')) + q.slice(abs === '/' ? 0 : abs.length));
  const globRe = (pat, ci) => new RegExp('^' + [...pat].map((c) => (c === '*' ? '.*' : c === '?' ? '.' : reEsc(c))).join('') + '$', ci ? 'i' : '');

  // ---------------- files ----------------
  reg('ls', 'files', {
    desc: 'List a directory, in colour', usage: 'ls [-l] [-a] [-h] [-1] [path...]',
    man: ['Directories are bold. Executables are green. Ruby is red, out of respect.'],
    run(args, io) {
      const o = getopts(args, { bool: 'lah1AdRF' });
      if (o.bad) { io.error(`ls: invalid option -- '${o.bad}'`); return 2; }
      const f = o.f; const paths = o.rest.length ? o.rest : ['.'];
      let code = 0; const files = []; const dirs = [];
      for (const p of paths) {
        const abs = OS.fs.resolve(io.cwd, p);
        if (!OS.fs.exists(abs)) { io.error(`ls: cannot access '${p}': No such file or directory`); code = 2; continue; }
        (OS.fs.isDir(abs) && !f.d ? dirs : files).push({ p, abs });
      }
      if (files.length) lsBlock(io, files.map(({ p, abs }) => entryFor(abs, p)), f);
      dirs.forEach(({ p, abs }, i) => {
        if (paths.length > 1) { if (i || files.length) io.println(''); io.println(p + ':', 'bold'); }
        let list = OS.fs.ls(abs).map((e) => entryFor(abs === '/' ? '/' + e.name : abs + '/' + e.name, e.name));
        if (!f.a && !f.A) list = list.filter((e) => !e.name.startsWith('.'));
        if (f.a) list = [entryFor(abs, '.'), entryFor(OS.fs.dirname(abs), '..'), ...list];
        if (f.l) io.println(`total ${list.reduce((a, e) => a + Math.ceil(e.size / 1024) * 4, 0)}`, 'muted');
        lsBlock(io, list, f);
      });
      return code;
    },
  });
  reg('cd', 'shell', {
    desc: 'Change directory', usage: 'cd [dir | - | ~]', dirsOnly: true,
    run(args, io) {
      const p = args[0];
      if (p === '-' && !io.sh.oldpwd) { io.error('cd: OLDPWD not set'); return 1; }
      const target = p === '-' ? io.sh.oldpwd : p;
      const abs = OS.fs.resolve(io.cwd, target || HOME);
      if (!OS.fs.exists(abs)) { io.error(`cd: no such file or directory: ${p}`); return 1; }
      if (!OS.fs.isDir(abs)) { io.error(`cd: not a directory: ${p}`); return 1; }
      io.cd(abs);
      if (p === '-') io.println(tilde(abs));
      return 0;
    },
  });
  reg('pwd', 'files', { desc: 'Print the working directory', usage: 'pwd', run(args, io) { io.println(io.cwd); return 0; } });
  const catSpec = (nm) => ({
    desc: nm === 'cat' ? 'Print files' : 'Print files. There is no pager. There is scrollback', usage: `${nm} [-n] [file...]`, stream: true,
    async run(args, io) {
      const o = getopts(args, { bool: 'nA' });
      if (o.bad) { io.error(`${nm}: invalid option -- '${o.bad}'`); return 1; }
      let n = 0;
      const srcs = readSources(io, o.rest, nm);
      for (const s of srcs) await eachLine(io, s, (l) => { io.println(o.f.n ? [[String(++n).padStart(6), 'faint'], '  ', l] : l); });
      if (nm !== 'cat' && io.isTTY) io.println('(END)', 'inv');
      return srcs.some((s) => s.err) ? 1 : 0;
    },
  });
  reg('cat', 'files', catSpec('cat'));
  reg('less', 'files', catSpec('less'));
  syn('more', 'less');
  const headTail = (nm) => ({
    desc: nm === 'head' ? 'The first lines of a file or a pipe' : 'The last lines of a file or a pipe', usage: `${nm} [-n N] [file...]` + (nm === 'tail' ? ' [-f]' : ''),
    stream: nm === 'head',
    async run(args, io) {
      let n = 10; let follow = false; const rest = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-n') n = parseInt(args[++i], 10);
        else if (/^-n\d+$/.test(a)) n = parseInt(a.slice(2), 10);
        else if (/^-\d+$/.test(a)) n = parseInt(a.slice(1), 10);
        else if (a === '-f' && nm === 'tail') follow = true;
        else rest.push(a);
      }
      if (!Number.isFinite(n) || n < 0) { io.error(`${nm}: invalid number of lines`); return 1; }
      const srcs = readSources(io, rest, nm);
      for (const [i, s] of srcs.entries()) {
        if (s.err) continue;
        if (srcs.length > 1) { if (i) io.println(''); io.println(`==> ${s.name} <==`, 'muted'); }
        if (nm === 'head') { let got = 0; if (n) await eachLine(io, s, (l) => { io.println(l); return ++got < n; }); } else (n ? s.lines.slice(-n) : []).forEach((l) => io.println(l));
      }
      if (follow) {
        io.println('tail: following. Nothing is being written. It is following anyway. Ctrl+C stops it.', 'faint');
        while (!io.aborted) await io.sleep(1000);
        return 130;
      }
      return srcs.some((s) => s.err) ? 1 : 0;
    },
  });
  reg('head', 'text', headTail('head'));
  reg('tail', 'text', headTail('tail'));
  reg('touch', 'files', {
    desc: 'Make an empty file', usage: 'touch file...',
    run(args, io) {
      if (!args.length) { io.error('touch: missing file operand'); return 1; }
      let code = 0;
      for (const f of args) {
        const abs = OS.fs.resolve(io.cwd, f);
        if (OS.fs.exists(abs)) continue;
        const deny = denyWrite(abs);
        if (deny) { io.error(`touch: cannot touch '${f}': ${deny}`); code = 1; continue; }
        try { writeFile(abs, ''); } catch (e) { io.error(`touch: cannot touch '${f}': ${errText('', '', e).split(': ').pop()}`); code = 1; }
      }
      return code;
    },
  });
  reg('mkdir', 'files', {
    desc: 'Make directories', usage: 'mkdir [-p] dir...',
    run(args, io) {
      const o = getopts(args, { bool: 'pv' });
      if (o.bad) { io.error(`mkdir: invalid option -- '${o.bad}'`); return 1; }
      if (!o.rest.length) { io.error('mkdir: missing operand'); return 1; }
      let code = 0;
      for (const d of o.rest) {
        const abs = OS.fs.resolve(io.cwd, d);
        const deny = denyWrite(abs);
        if (deny) { io.error(`mkdir: cannot create directory '${d}': ${deny}`); code = 1; continue; }
        try { OS.fs.mkdir(abs, { parents: !!o.f.p }); if (o.f.v) io.println(`mkdir: created directory '${d}'`); } catch (e) { io.error(`mkdir: cannot create directory '${d}': ${errText('', '', e).split(': ').pop()}`); code = 1; }
      }
      return code;
    },
  });
  const SACRED_LABS = ['app', 'config', 'bin', 'agent_docs', 'db'].map((d) => LABS + '/' + d);
  const isSacred = (abs) => abs === '/' || abs === '/home' || abs === HOME || abs === LABS || (abs.split('/').length === 2 && abs !== '/tmp') || SACRED_LABS.includes(abs);
  function brickyIntervenes(io, typed) {
    const say = [
      [[`rm: Bricky is standing on ${typed}.`, 'bad bold']],
      [['He has been asked to move. He has declined.', 'fg']],
      [['Nothing was removed.', 'muted']],
    ];
    const wide = io.cols >= 64;
    BRICK_STERN.forEach((row, i) => {
      const t = say[i - 2];
      io.println(wide && t ? [...row, '     ', ...t] : row);
    });
    if (!wide) say.forEach((s) => io.println(s));
    OS.notify({ app: 'bricky', bricky: true, title: 'Bricky intervened', body: `I am standing on ${typed}. I am 32 by 32 and I am not moving.`, timeout: 7000 });
    OS.sound.error();
  }
  reg('rm', 'files', {
    desc: 'Remove files. Bricky watches', usage: 'rm [-r] [-f] [-v] path...',
    run(args, io) {
      const o = getopts(args, { bool: 'rRfvid' });
      if (o.bad) { io.error(`rm: invalid option -- '${o.bad}'`); return 1; }
      const rec = o.f.r || o.f.R; const force = o.f.f;
      if (!o.rest.length) { if (force) return 0; io.error('rm: missing operand'); return 1; }
      const targets = o.rest.map((p) => ({ p, abs: OS.fs.resolve(io.cwd, p), dots: /(^|\/)\.\.?\/*$/.test(p) }));
      const sacred = rec && targets.find((t) => !t.dots && isSacred(t.abs));
      if (sacred) { brickyIntervenes(io, tilde(sacred.abs)); return 1; }
      let code = 0;
      for (const t of targets) {
        if (rec && t.dots) { io.error(`rm: refusing to remove '.' or '..' directory: skipping '${t.p}'`); code = 1; continue; }
        if (!OS.fs.exists(t.abs)) { if (!force) { io.error(`rm: cannot remove '${t.p}': No such file or directory`); code = 1; } continue; }
        if (rec && (t.abs === io.cwd || io.cwd.startsWith(t.abs + '/'))) {
          io.error(`rm: refusing to remove '${t.p}': ${t.abs === io.cwd ? 'it is the working directory' : 'the working directory is inside it'}. cd out of it first.`);
          code = 1; continue;
        }
        if (OS.fs.isDir(t.abs) && !rec) { io.error(`rm: cannot remove '${t.p}': Is a directory`); code = 1; continue; }
        const deny = denyWrite(t.abs);
        if (deny) { io.error(`rm: cannot remove '${t.p}': ${deny}`); code = 1; continue; }
        try { OS.fs.rm(t.abs, { recursive: !!rec }); if (o.f.v) io.println(`removed '${t.p}'`); } catch (e) { io.error(e.code === 'EPERM' ? e.message : errText('rm', t.p, e)); code = 1; }
      }
      return code;
    },
  });
  function copyTree(src, dst) {
    if (OS.fs.isDir(src)) {
      OS.fs.mkdir(dst, { parents: true });
      for (const q of OS.fs.walk(src)) {
        const to = dst + q.slice(src.length);
        if (OS.fs.isDir(q)) OS.fs.mkdir(to, { parents: true }); else writeFile(to, OS.fs.read(q));
      }
    } else writeFile(dst, OS.fs.read(src));
  }
  const cpmv = (nm) => ({
    desc: nm === 'cp' ? 'Copy files and directories' : 'Move or rename', usage: `${nm} ${nm === 'cp' ? '[-r] ' : ''}source... dest`,
    run(args, io) {
      const o = getopts(args, { bool: 'rRvfi' });
      if (o.bad) { io.error(`${nm}: invalid option -- '${o.bad}'`); return 1; }
      if (o.rest.length < 2) { io.error(`${nm}: missing destination file operand`); return 1; }
      const dstTyped = o.rest[o.rest.length - 1]; const dstAbs = OS.fs.resolve(io.cwd, dstTyped);
      const srcs = o.rest.slice(0, -1);
      if (srcs.length > 1 && !OS.fs.isDir(dstAbs)) { io.error(`${nm}: target '${dstTyped}' is not a directory`); return 1; }
      let code = 0;
      for (const s of srcs) {
        const abs = OS.fs.resolve(io.cwd, s);
        if (!OS.fs.exists(abs)) { io.error(`${nm}: cannot stat '${s}': No such file or directory`); code = 1; continue; }
        if (nm === 'cp' && OS.fs.isDir(abs) && !(o.f.r || o.f.R)) { io.error(`cp: -r not specified; omitting directory '${s}'`); code = 1; continue; }
        const to = OS.fs.isDir(dstAbs) ? (dstAbs === '/' ? '' : dstAbs) + '/' + OS.fs.basename(abs) : dstAbs;
        if (to === abs || to.startsWith(abs + '/')) { io.error(`${nm}: cannot ${nm === 'cp' ? 'copy' : 'move'} '${s}' into itself`); code = 1; continue; }
        const deny = denyWrite(to) || (nm === 'mv' ? denyWrite(abs) : null);
        if (deny) { io.error(`${nm}: cannot ${nm === 'cp' ? 'create' : 'move'} '${s}': ${deny}`); code = 1; continue; }
        if (nm === 'mv' && isSacred(abs)) { brickyIntervenes(io, s); return 1; }
        try {
          copyTree(abs, to);
          if (nm === 'mv') OS.fs.rm(abs, { recursive: true });
          if (o.f.v) io.println(`'${s}' -> '${tilde(to)}'`);
        } catch (e) { io.error(e.code === 'EPERM' ? e.message : errText(nm, s, e)); code = 1; }
      }
      return code;
    },
  });
  reg('cp', 'files', cpmv('cp'));
  reg('mv', 'files', cpmv('mv'));
  reg('tree', 'files', {
    desc: 'A directory as a tree', usage: 'tree [-a] [-d] [-L depth] [dir]', dirsOnly: true,
    run(args, io) {
      const o = getopts(args, { bool: 'adf', val: 'L' });
      if (o.bad) { io.error(`tree: invalid option -- '${o.bad}'`); return 1; }
      const max = o.f.L ? parseInt(o.f.L, 10) : Infinity;
      const p = o.rest[0] || '.'; const abs = OS.fs.resolve(io.cwd, p);
      if (!OS.fs.isDir(abs)) { io.error(`${p} [error opening dir]`); return 2; }
      io.println(p, 'accent bold');
      let nd = 0; let nfl = 0;
      const go = (dir, prefix, depth) => {
        let kids = OS.fs.ls(dir);
        if (!o.f.a) kids = kids.filter((k) => !k.name.startsWith('.'));
        if (o.f.d) kids = kids.filter((k) => k.type === 'dir');
        kids.forEach((k, i) => {
          const lastK = i === kids.length - 1; const full = (dir === '/' ? '' : dir) + '/' + k.name;
          io.println([[prefix + (lastK ? '└── ' : '├── '), 'faint'], [k.name, clsFor({ name: k.name, dir: k.type === 'dir', exec: isExec(full, k.type === 'dir') })]]);
          if (k.type === 'dir') { nd++; if (depth < max) go(full, prefix + (lastK ? '    ' : '│   '), depth + 1); } else nfl++;
        });
      };
      go(abs, '', 1);
      io.println('');
      io.println(`${nd} director${nd === 1 ? 'y' : 'ies'}` + (o.f.d ? '' : `, ${nfl} file${nfl === 1 ? '' : 's'}`), 'muted');
      return 0;
    },
  });
  reg('find', 'files', {
    desc: 'Find files by name or type', usage: 'find [path...] [-name pattern] [-iname pattern] [-type f|d] [-maxdepth n]',
    run(args, io) {
      const paths = []; let i = 0;
      while (i < args.length && !args[i].startsWith('-')) paths.push(args[i++]);
      if (!paths.length) paths.push('.');
      let re = null; let type = null; let maxd = Infinity;
      for (; i < args.length; i++) {
        const a = args[i];
        if (a === '-name' || a === '-iname') { if (args[i + 1] == null) { io.error(`find: missing argument to '${a}'`); return 1; } re = globRe(args[++i], a === '-iname'); } else if (a === '-type') type = args[++i];
        else if (a === '-maxdepth') maxd = parseInt(args[++i], 10);
        else { io.error(`find: unknown predicate '${a}'`); return 1; }
      }
      let code = 0;
      for (const p of paths) {
        const abs = OS.fs.resolve(io.cwd, p);
        if (!OS.fs.exists(abs)) { io.error(`find: '${p}': No such file or directory`); code = 1; continue; }
        for (const q of [abs, ...OS.fs.walk(abs)]) {
          const depth = q === abs ? 0 : q.slice(abs === '/' ? 0 : abs.length).split('/').filter(Boolean).length;
          if (depth > maxd) continue;
          if (re && !re.test(q === abs ? OS.fs.basename(abs) : OS.fs.basename(q))) continue;
          if (type === 'f' && !OS.fs.isFile(q)) continue;
          if (type === 'd' && !OS.fs.isDir(q)) continue;
          io.println(relDisp(p, abs, q));
        }
      }
      return code;
    },
  });

  // ---------------- text ----------------
  function markMatches(l, re) {
    const segs = []; let last = 0; re.lastIndex = 0; let m;
    while ((m = re.exec(l))) {
      if (!m[0]) { re.lastIndex++; continue; }
      if (m.index > last) segs.push(l.slice(last, m.index));
      segs.push([m[0], 'hl']); last = m.index + m[0].length;
    }
    if (last < l.length) segs.push(l.slice(last));
    return segs;
  }
  reg('grep', 'text', {
    desc: 'Find lines that match', usage: 'grep [-i] [-n] [-r] [-v] [-c] [-l] [-w] pattern [file...]', stream: true,
    async run(args, io) {
      const o = getopts(args, { bool: 'inrRvcwlHEFhs', val: 'e' });
      if (o.bad) { io.error(`grep: invalid option -- '${o.bad}'`); return 2; }
      const f = o.f;
      const pat = f.e ?? o.rest.shift();
      if (pat == null) { io.error('usage: grep [-i] [-n] [-r] [-v] [-c] pattern [file...]'); return 2; }
      const flags = f.i ? 'gi' : 'g';
      let re;
      try { re = new RegExp(f.F ? reEsc(pat) : pat, flags); } catch { re = new RegExp(reEsc(pat), flags); }
      if (f.w) re = new RegExp(`\\b(?:${re.source})\\b`, flags);
      let srcs = [];
      if (f.r || f.R) {
        for (const p of o.rest.length ? o.rest : ['.']) {
          const abs = OS.fs.resolve(io.cwd, p);
          if (!OS.fs.exists(abs)) { if (!f.s) io.error(`grep: ${p}: No such file or directory`); continue; }
          if (OS.fs.isFile(abs)) { srcs.push({ name: p, lines: splitLines(safeRead(abs)) }); continue; }
          for (const q of OS.fs.walk(abs)) if (OS.fs.isFile(q)) srcs.push({ name: p === '.' ? q.slice(abs.length + 1) : relDisp(p, abs, q), lines: splitLines(safeRead(q)) });
        }
      } else srcs = readSources(io, o.rest, 'grep');
      const showName = !f.h && (f.H || f.r || f.R || srcs.length > 1);
      let total = 0;
      for (const s of srcs) {
        if (s.err) continue;
        let count = 0; let i = 0;
        await eachLine(io, s, (l) => {
          i++;
          re.lastIndex = 0;
          if (re.test(l) === !!f.v) return;
          count++; total++;
          if (f.c || f.l) return;
          const segs = [];
          if (showName) segs.push([s.name, 'accent2'], [':', 'info']);
          if (f.n) segs.push([String(i), 'ok'], [':', 'info']);
          if (f.v) segs.push(l); else segs.push(...markMatches(l, re));
          io.println(segs);
        });
        if (f.c) io.println(showName ? [[s.name, 'accent2'], [':', 'info'], String(count)] : String(count));
        if (f.l && count) io.println(s.name, 'accent2');
      }
      return total ? 0 : srcs.some((s) => s.err) ? 2 : 1;
    },
  });
  reg('wc', 'text', {
    desc: 'Count lines, words and characters', usage: 'wc [-l] [-w] [-c] [file...]',
    run(args, io) {
      const o = getopts(args, { bool: 'lwcm' });
      if (o.bad) { io.error(`wc: invalid option -- '${o.bad}'`); return 1; }
      const f = o.f; const all = !f.l && !f.w && !f.c && !f.m;
      const srcs = readSources(io, o.rest, 'wc');
      const tot = [0, 0, 0];
      const one = !all && [f.l, f.w, f.c || f.m].filter(Boolean).length === 1 && !o.rest.length;
      const row = (c, nm) => {
        const cols = []; if (all || f.l) cols.push(c[0]); if (all || f.w) cols.push(c[1]); if (all || f.c || f.m) cols.push(c[2]);
        io.println(one ? String(cols[0]) : cols.map((x) => String(x).padStart(7)).join(' ') + (nm && nm !== '-' ? ' ' + nm : ''));
      };
      for (const s of srcs) {
        if (s.err) continue;
        const c = [s.lines.length, s.lines.join(' ').split(/\s+/).filter(Boolean).length, s.lines.reduce((a, l) => a + l.length + 1, 0)];
        tot[0] += c[0]; tot[1] += c[1]; tot[2] += c[2];
        row(c, s.name);
      }
      if (srcs.length > 1) row(tot, 'total');
      return srcs.some((s) => s.err) ? 1 : 0;
    },
  });
  reg('sort', 'text', {
    desc: 'Sort lines', usage: 'sort [-r] [-n] [-u] [-f] [file...]',
    run(args, io) {
      const o = getopts(args, { bool: 'rnuf' });
      if (o.bad) { io.error(`sort: invalid option -- '${o.bad}'`); return 2; }
      let lines = readSources(io, o.rest, 'sort').flatMap((s) => s.lines);
      const key = (l) => (o.f.f ? l.toLowerCase() : l);
      lines.sort(o.f.n ? (a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) : (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      if (o.f.r) lines.reverse();
      if (o.f.u) lines = lines.filter((l, i) => i === 0 || key(l) !== key(lines[i - 1]));
      lines.forEach((l) => io.println(l));
      return 0;
    },
  });
  reg('uniq', 'text', {
    desc: 'Drop repeated adjacent lines', usage: 'uniq [-c] [-d] [file]',
    run(args, io) {
      const o = getopts(args, { bool: 'cdi' });
      if (o.bad) { io.error(`uniq: invalid option -- '${o.bad}'`); return 1; }
      const lines = readSources(io, o.rest, 'uniq').flatMap((s) => s.lines);
      const runs = [];
      for (const l of lines) { const prev = runs[runs.length - 1]; if (prev && (o.f.i ? prev.l.toLowerCase() === l.toLowerCase() : prev.l === l)) prev.n++; else runs.push({ l, n: 1 }); }
      for (const r of runs) { if (o.f.d && r.n < 2) continue; io.println(o.f.c ? String(r.n).padStart(7) + ' ' + r.l : r.l); }
      return 0;
    },
  });
  reg('echo', 'text', {
    desc: 'Print words', usage: 'echo [-n] [-e] words...',
    run(args, io) {
      let i = 0; let nl = true; let esc = false;
      while (i < args.length && /^-[ne]+$/.test(args[i])) { if (args[i].includes('n')) nl = false; if (args[i].includes('e')) esc = true; i++; }
      let t = args.slice(i).join(' ');
      if (esc) t = t.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      if (nl) io.println(t); else io.print(t);
      return 0;
    },
  });
  reg('seq', 'text', {
    desc: 'Print a sequence of numbers', usage: 'seq [first [step]] last',
    run(args, io) {
      const n = args.map(Number);
      if (!n.length || n.some((x) => !Number.isFinite(x))) { io.error('seq: give it numbers'); return 1; }
      const [a, s, b] = n.length === 1 ? [1, 1, n[0]] : n.length === 2 ? [n[0], 1, n[1]] : n;
      if (!s || (b - a) / s > 100000) { io.error('seq: that would take a while. Fewer, please.'); return 1; }
      for (let x = a; s > 0 ? x <= b : x >= b; x += s) io.println(String(Math.round(x * 1e6) / 1e6));
      return 0;
    },
  });
  reg('tee', 'text', {
    desc: 'Copy a pipe to files as it passes', usage: 'tee [-a] file...', stream: true,
    async run(args, io) {
      const o = getopts(args, { bool: 'a' });
      let text = '';
      await eachLine(io, readSources(io, [], 'tee')[0], (l) => { text += l + '\n'; io.println(l); });
      let code = 0;
      for (const f of o.rest) {
        const abs = OS.fs.resolve(io.cwd, f); const deny = denyWrite(abs);
        if (deny) { io.error(`tee: ${f}: ${deny}`); code = 1; continue; }
        try { writeFile(abs, (o.f.a && OS.fs.isFile(abs) ? OS.fs.read(abs) : '') + text); } catch (e) { io.error(errText('tee', f, e)); code = 1; }
      }
      return code;
    },
  });

  // ---------------- shell ----------------
  const GROUPS = [['files', 'Files'], ['text', 'Text'], ['shell', 'Shell'], ['system', 'System'], ['labs', 'Labs'], ['fun', 'Fun'], ['net', 'Network'], ['apps', 'Apps']];
  reg('help', 'shell', {
    desc: 'Every command, by group', usage: 'help [command]',
    complete: () => OS.commands.names(),
    run(args, io) {
      if (args[0]) {
        const c = OS.commands.get(args[0]);
        if (!c) { io.error(`help: no help topics match '${args[0]}'. Try 'help' on its own.`); return 1; }
        io.println(c.usage || c.name, 'accent bold');
        if (c.desc) io.println('  ' + c.desc + '.');
        return 0;
      }
      io.println([['brickty ' + VERSION, 'accent bold'], [' (Composed). The commands are real. The disk is not.', 'muted']]);
      io.println('');
      const by = {};
      for (const c of OS.commands.list()) (by[c.group && MINE.has(c.name) ? c.group : 'apps'] ||= []).push(c.name);
      const lw = 9; const width = Math.max(30, io.cols);
      for (const [g, label] of GROUPS) {
        const names = by[g]; if (!names?.length) continue;
        let line = []; let len = 0; let first = true;
        const flush = () => { io.println([[first ? label.padEnd(lw) : ' '.repeat(lw), 'accent2 bold'], ...line]); first = false; line = []; len = 0; };
        for (const nm of names) {
          if (len && len + 1 + nm.length > width - lw) flush();
          if (len) { line.push(' '); len++; }
          line.push([nm, g === 'apps' ? 'info' : 'ok']); len += nm.length;
        }
        if (line.length) flush();
      }
      io.println('');
      io.println([['Pipes ', 'faint'], ['|', 'accent'], ['  chains ', 'faint'], [';  &&  ||', 'accent'], ['  redirects ', 'faint'], ['>  >>  <', 'accent'], ['  variables ', 'faint'], ['$HOME $USER $?', 'accent2']]);
      io.println([['Tab', 'fg'], [' completes. ', 'faint'], ['↑ ↓', 'fg'], [' remember. ', 'faint'], ['Ctrl+R', 'fg'], [' searches. ', 'faint'], ['Ctrl+C', 'fg'], [' stops. ', 'faint'], ['Ctrl+L', 'fg'], [' clears.', 'faint']]);
      io.println([['Alt+Backspace', 'fg'], [' deletes a word. So does ', 'faint'], ['Ctrl+W', 'fg'], [', but on most systems the browser takes it and closes the tab.', 'faint']]);
      io.println([['help <command>', 'fg'], [' for one command. ', 'faint'], ['man <command>', 'fg'], [' for more words than that.', 'faint']]);
      return 0;
    },
  });
  reg('history', 'shell', {
    desc: 'Commands you ran, kept across reloads', usage: 'history [n] | history -c',
    run(args, io) {
      if (args[0] === '-c') { hist.length = 0; saveHist(); return 0; }
      const n = args[0] ? parseInt(args[0], 10) : hist.length;
      const start = Math.max(0, hist.length - (Number.isFinite(n) ? n : hist.length));
      hist.slice(start).forEach((l, i) => io.println([[String(start + i + 1).padStart(5), 'faint'], '  ', l]));
      return 0;
    },
  });
  reg('alias', 'shell', {
    desc: 'Name a command line', usage: "alias [name='command']",
    run(args, io) {
      const A = io.sh.aliases;
      if (!args.length) { [...A].sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => io.println([['alias ', 'muted'], [k, 'ok'], ['=', 'muted'], [shq(v), 'warn']])); return 0; }
      let code = 0;
      for (const a of args) {
        const i = a.indexOf('=');
        if (i > 0) A.set(a.slice(0, i), a.slice(i + 1));
        else if (A.has(a)) io.println(`alias ${a}=${shq(A.get(a))}`);
        else { io.error(`alias: ${a}: not found`); code = 1; }
      }
      return code;
    },
  });
  reg('unalias', 'shell', {
    desc: 'Forget an alias', usage: 'unalias name...',
    complete: () => [],
    run(args, io) { let code = 0; for (const a of args) { if (!io.sh.aliases.delete(a)) { io.error(`unalias: ${a}: not found`); code = 1; } } return code; },
  });
  reg('export', 'shell', {
    desc: 'Set a variable', usage: 'export [NAME=value]',
    run(args, io) {
      const V = io.sh.vars;
      if (!args.length) { [...V].sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => io.println([['export ', 'muted'], [k, 'accent2'], ['=', 'muted'], shq(v)])); return 0; }
      for (const a of args) { const i = a.indexOf('='); if (i > 0) V.set(a.slice(0, i), a.slice(i + 1)); else if (!V.has(a)) V.set(a, ''); }
      return 0;
    },
  });
  reg('unset', 'shell', { desc: 'Forget a variable', usage: 'unset NAME...', run(args, io) { args.forEach((a) => io.sh.vars.delete(a)); return 0; } });
  reg('env', 'shell', {
    desc: 'Print the environment', usage: 'env',
    run(args, io) {
      const V = new Map(io.sh.vars); V.set('PWD', io.cwd); if (io.sh.oldpwd) V.set('OLDPWD', io.sh.oldpwd);
      [...V].sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => io.println([[k, 'accent2'], ['=', 'faint'], v]));
      return 0;
    },
  });
  reg('which', 'shell', {
    desc: 'Where a command lives', usage: 'which command...',
    complete: () => OS.commands.names(),
    run(args, io) {
      let code = 0;
      for (const a of args) {
        if (io.sh.aliases.has(a)) io.println(`${a}: aliased to ${io.sh.aliases.get(a)}`);
        else if (BUILTINS.has(a)) io.println(`${a}: shell built-in command`);
        else {
          const c = OS.commands.get(a);
          if (c) io.println(c.name.includes('/') ? LABS + '/' + c.name : (MINE.has(c.name) ? '/usr/bin/' : '/usr/local/bin/') + a);
          else { io.error(`${a} not found`); code = 1; }
        }
      }
      return code;
    },
  });
  reg('type', 'shell', {
    desc: 'What kind of command a name is', usage: 'type name...',
    complete: () => OS.commands.names(),
    run(args, io) {
      let code = 0;
      for (const a of args) {
        if (io.sh.aliases.has(a)) io.println(`${a} is aliased to \`${io.sh.aliases.get(a)}'`);
        else if (BUILTINS.has(a)) io.println(`${a} is a shell builtin`);
        else if (OS.commands.get(a)) io.println(`${a} is ${OS.commands.get(a).name.includes('/') ? LABS + '/' + OS.commands.get(a).name : (MINE.has(OS.commands.get(a).name) ? '/usr/bin/' : '/usr/local/bin/') + a}`);
        else if (OS.apps[a]) io.println(`${a} is an app. Typing its name opens it.`);
        else { io.error(`type: ${a}: not found`); code = 1; }
      }
      return code;
    },
  });
  reg('man', 'shell', {
    desc: 'The manual page for a command', usage: 'man command',
    complete: () => OS.commands.names(),
    run(args, io) {
      const t = args[0];
      if (!t) { io.println('What manual page do you want?'); io.println("For example, try 'man man'.", 'muted'); return 1; }
      const c = t === 'man' ? null : OS.commands.get(t);
      if (!c && t !== 'man') { io.error(`No manual entry for ${t}`); return 16; }
      const W = Math.min(io.cols, 78); const H = `${t.toUpperCase()}(1)`;
      const mid = 'Labs OS Manual'; const gap = Math.max(1, W - H.length * 2 - mid.length);
      io.println([[H, 'bold'], ' '.repeat(Math.floor(gap / 2)), [mid, 'muted'], ' '.repeat(Math.ceil(gap / 2)), [H, 'bold']]);
      const sec = (title, lines) => { io.println(''); io.println(title, 'accent bold'); lines.forEach((l) => wrap(l, W - 8).forEach((x) => io.println('       ' + x))); };
      if (t === 'man') {
        sec('NAME', ['man - an interface to the manuals']);
        sec('SYNOPSIS', ['man command']);
        sec('DESCRIPTION', ['There are no manuals. There is AGENTS.md, and every command explains itself here in two lines.', 'For anything longer, write it in agent_docs/ and link it from the table.']);
      } else {
        sec('NAME', [`${t} - ${(c.desc || 'no description').replace(/\.$/, '')}`]);
        sec('SYNOPSIS', [c.usage || t]);
        sec('DESCRIPTION', [(c.desc || 'It does what it says.') + '.', ...(c.man || []), MINE.has(c.name) ? 'Part of brickty.' : 'Registered by an app through OS.commands.']);
        sec('EXIT STATUS', ['0 when it worked. 130 when you pressed Ctrl+C. Anything else, when it did not.']);
        sec('BUGS', ['None proven. A bug needs correct inputs shown to give a wrong output, with the exact cause.']);
      }
      io.println('');
      const foot = 'Labs OS ' + VERSION; const date = '13 November 2026';
      const g2 = Math.max(1, W - foot.length - date.length - H.length);
      io.println([[foot, 'muted'], ' '.repeat(Math.floor(g2 / 2)), [date, 'muted'], ' '.repeat(Math.ceil(g2 / 2)), [H, 'bold']]);
      return 0;
    },
  });
  reg('clear', 'shell', { desc: 'Clear the screen (Ctrl+L)', usage: 'clear', run(args, io) { io.clear(); return 0; } });
  reg('source', 'shell', {
    desc: 'Run each line of a file in this shell', usage: 'source file',
    async run(args, io) {
      if (!args[0]) { io.error('source: filename argument required'); return 2; }
      let text;
      try { text = OS.fs.read(OS.fs.resolve(io.cwd, args[0])); } catch (e) { io.error(errText('source', args[0], e)); return 1; }
      let code = 0;
      for (const l of splitLines(text)) {
        if (!l.trim() || l.trim().startsWith('#')) continue;
        code = await io.sh.execNested(l, io);
        if (io.aborted) return 130;
      }
      return code;
    },
  });
  syn('.', 'source');
  reg('exit', 'shell', { desc: 'Close this terminal', usage: 'exit', run(args, io) { io.println('logout', 'faint'); io.win.after(150, () => io.win.close()); return 0; } });
  syn('logout', 'exit');
  reg('sleep', 'shell', {
    desc: 'Wait some seconds', usage: 'sleep seconds',
    async run(args, io) {
      const s = parseFloat(args[0]);
      if (!Number.isFinite(s) || s < 0) { io.error('sleep: invalid time interval'); return 1; }
      await io.sleep(s * 1000);
      return io.aborted ? 130 : 0;
    },
  });
  reg('true', 'shell', { desc: 'Succeed', usage: 'true', run: () => 0 });
  reg('false', 'shell', { desc: 'Fail, reliably', usage: 'false', run: () => 1 });

  // ---------------- system ----------------
  reg('whoami', 'system', { desc: 'Who you are', usage: 'whoami', run(args, io) { io.println('researcher'); return 0; } });
  reg('id', 'system', { desc: 'Your user and groups', usage: 'id', run(args, io) { io.println('uid=1000(researcher) gid=1000(labs) groups=1000(labs),998(gold-readers),999(lanes)'); return 0; } });
  reg('hostname', 'system', { desc: 'The machine name', usage: 'hostname', run(args, io) { io.println(safeRead('/etc/hostname').trim() || 'labs'); return 0; } });
  reg('uname', 'system', {
    desc: 'The kernel', usage: 'uname [-a] [-r] [-s]',
    run(args, io) {
      const f = new Set(args.join('').replace(/-/g, ''));
      if (f.has('a')) io.println('Labs labs 6.22.0-composed #1 SMP PREEMPT_DYNAMIC Thu 13 Nov 2026 x86_64 Labs/OS');
      else if (f.has('r')) io.println('6.22.0-composed');
      else if (f.has('m')) io.println('x86_64');
      else io.println('Labs');
      return 0;
    },
  });
  reg('date', 'system', {
    desc: 'The date. The spend cap runs on UTC', usage: 'date [-u]',
    run(args, io) { io.println(fmtDate(OS.now(), args.includes('-u') || args.includes('--utc'))); return 0; },
  });
  reg('uptime', 'system', {
    desc: 'How long since the last reload', usage: 'uptime',
    run(args, io) {
      const n = OS.wm.list().filter((w) => w.app.id === 'terminal').length;
      io.println(` ${hhmm(OS.now())}:${two(OS.now().getSeconds())} up ${uptimeText()},  ${n} user${n === 1 ? '' : 's'},  load average: 0.50, 2.70, 22.00`);
      return 0;
    },
  });
  reg('cal', 'system', {
    desc: 'This month', usage: 'cal',
    run(args, io) {
      const d = OS.now(); const y = d.getFullYear(); const m = d.getMonth();
      const title = `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m]} ${y}`;
      io.println(' '.repeat(Math.floor((20 - title.length) / 2)) + title, 'bold');
      io.println('Mo Tu We Th Fr Sa Su', 'muted');
      const first = (new Date(y, m, 1).getDay() + 6) % 7; const days = new Date(y, m + 1, 0).getDate();
      let row = []; for (let i = 0; i < first; i++) row.push('   ');
      for (let dd = 1; dd <= days; dd++) {
        const s = String(dd).padStart(2);
        row.push(dd === d.getDate() ? [s, 'inv'] : s, ' ');
        if ((first + dd) % 7 === 0 || dd === days) { io.println(row); row = []; }
      }
      return 0;
    },
  });
  reg('ps', 'system', {
    desc: 'Processes. Every window is one', usage: 'ps',
    run(args, io) {
      io.println('    PID TTY      TIME     CMD', 'bold');
      const rows = [[1, '?', 'bricky'], [2, '?', 'brickland'], [3, '?', 'mortar'], [4, '?', 'ridgebar']];
      for (const w of OS.wm.list()) rows.push([1000 + w.id, w.app.id === 'terminal' ? `pts/${w.id}` : '?', w.app.id]);
      for (const [pid, tty, cmd] of rows) io.println([String(pid).padStart(7) + ' ' + tty.padEnd(8) + ' 00:00:0' + (pid % 10) + ' ', [cmd, pid === 1000 + io.win.id ? 'accent bold' : '']]);
      return 0;
    },
  });
  reg('kill', 'system', {
    desc: 'Close a window by its pid', usage: 'kill [-9] pid...',
    run(args, io) {
      const ids = args.filter((a) => !a.startsWith('-'));
      if (!ids.length) { io.error('kill: usage: kill [-9] pid... (see ps)'); return 2; }
      let code = 0;
      for (const a of ids) {
        const pid = parseInt(a, 10);
        if (pid === 1) { io.error('kill: (1) - Operation not permitted. Bricky is pid 1.'); code = 1; continue; }
        if (pid >= 2 && pid <= 4) { io.error(`kill: (${pid}) - Operation not permitted. The desktop needs it.`); code = 1; continue; }
        const w = OS.wm.list().find((x) => 1000 + x.id === pid);
        if (!w) { io.error(`kill: (${a}) - No such process`); code = 1; continue; }
        w.close();
      }
      return code;
    },
  });
  reg('killall', 'system', {
    desc: 'Close every window of an app', usage: 'killall app',
    complete: () => [...new Set(OS.wm.list().map((w) => w.app.id))],
    run(args, io) {
      if (!args[0]) { io.error('killall: usage: killall app'); return 1; }
      if (args[0] === 'bricky') { io.error('killall: bricky: Operation not permitted. He is pid 1. Everything else is his child process.'); return 1; }
      const ws = OS.wm.list().filter((w) => w.app.id === args[0]);
      if (!ws.length) { io.error(`${args[0]}: no process found`); return 1; }
      ws.forEach((w) => w.close());
      return 0;
    },
  });
  reg('sudo', 'system', {
    desc: 'Ask for root. It goes as expected', usage: 'sudo command',
    async run(args, io) {
      if (!args.length) { io.error('usage: sudo command'); return 1; }
      await io.prompt('[sudo] password for researcher: ', { secret: true });
      if (io.aborted) return 130;
      io.println('researcher is not in the sudoers file. This incident will be reported to Bricky.', 'bad');
      OS.notify({
        app: 'bricky', bricky: true, title: 'Incident received', timeout: 7000,
        body: pick(['Filed under "incidents". It is the only folder I have.', 'Noted: researcher tried sudo. It is in the daily update, as a table.', 'I read the incident. Correct inputs, correct refusal. Not a bug.']),
      });
      return 1;
    },
  });
  syn('please', 'sudo');
  reg('open', 'system', {
    desc: 'Open an app, or a file in labvim', usage: 'open app | file',
    complete: () => Object.keys(OS.apps),
    run(args, io) {
      if (!args.length) {
        io.println('Apps:', 'muted');
        for (const l of grid(Object.values(OS.apps).filter((a) => !a.hidden).map((a) => ({ t: a.id, c: 'info' })), io.cols)) io.println(l);
        return 0;
      }
      const a = args[0]; const apps = Object.values(OS.apps);
      const app = OS.apps[a] || apps.find((x) => x.title.toLowerCase() === a.toLowerCase()) || apps.find((x) => x.id.startsWith(a.toLowerCase()));
      if (app) { io.open(app.id); return 0; }
      const abs = OS.fs.resolve(io.cwd, a);
      if (OS.fs.isFile(abs)) { io.open('labvim', { path: abs }); return 0; }
      if (OS.fs.isDir(abs)) { io.println('open: there is no file manager. There is ls.', 'muted'); return 1; }
      io.error(`open: ${a}: no such app or file`);
      return 1;
    },
  });
  const themeMatch = (q) => { const l = q.toLowerCase(); const list = OS.theme.list(); return list.find((t) => t.name === l || t.label.toLowerCase() === l) || list.find((t) => t.name.startsWith(l) || t.label.toLowerCase().startsWith(l)); };
  reg('theme', 'system', {
    desc: 'List or set the theme', usage: 'theme [name | next | prev]',
    complete: () => [...OS.theme.list().map((t) => t.name), 'next', 'prev'],
    run(args, io) {
      const a = args.join(' ');
      if (!a) {
        const cur = OS.theme.get();
        for (const t of OS.theme.list()) {
          const sw = h('span', { class: 'terminal-swatch' }, [t.bg, t.surface2, t.accent, t.accent2, t.good, t.warn, t.bad, t.info].map((c) => h('span', { style: { color: c } }, '██')));
          io.println([[t === cur ? '● ' : '  ', 'accent'], [t.name.padEnd(19), t === cur ? 'bold' : ''], sw, '  ', [t.label, 'muted']]);
        }
        io.println('');
        io.println([['theme <name>', 'fg'], [' sets one. ', 'faint'], ['Alt+Shift+T', 'fg'], [' cycles them.', 'faint']]);
        return 0;
      }
      const t = a === 'next' ? OS.theme.next(1) : a === 'prev' ? OS.theme.next(-1) : themeMatch(a);
      if (!t) { io.error(`theme: no theme called '${a}'. Run theme to see them.`); return 1; }
      if (a !== 'next' && a !== 'prev') OS.theme.set(t.name);
      OS.osd('theme: ' + OS.theme.get().label);
      io.println([['theme: ', 'muted'], [OS.theme.get().label, 'accent bold']]);
      return 0;
    },
  });
  reg('wallpaper', 'system', {
    desc: 'List or set the wallpaper', usage: 'wallpaper [name | next]',
    complete: () => [...OS.theme.wallpapers, 'next'],
    run(args, io) {
      const a = args[0];
      if (!a) { OS.theme.wallpapers.forEach((w) => io.println([[w === OS.theme.wallpaper() ? '● ' : '  ', 'accent'], w])); return 0; }
      if (a === 'next') OS.theme.nextWallpaper();
      else if (OS.theme.wallpapers.includes(a)) OS.theme.setWallpaper(a);
      else { io.error(`wallpaper: no wallpaper called '${a}'`); return 1; }
      io.println([['wallpaper: ', 'muted'], [OS.theme.wallpaper(), 'accent bold']]);
      return 0;
    },
  });
  reg('lock', 'system', { desc: 'Lock the screen (deadlock)', usage: 'lock', run() { OS.lock(); return 0; } });
  reg('kiln', 'system', { desc: 'The screensaver', usage: 'kiln', run() { OS.kiln(); return 0; } });
  reg('reboot', 'system', { desc: 'Boot again', usage: 'reboot', run() { setTimeout(() => OS.reboot(), 200); return 0; } });
  reg('poweroff', 'system', { desc: 'Shut down', usage: 'poweroff', run() { setTimeout(() => OS.shutdown(), 200); return 0; } });
  syn('shutdown', 'poweroff');
  reg('notify-send', 'system', {
    desc: 'Send a notification', usage: 'notify-send [-u low|normal|critical] title [body]',
    run(args, io) {
      const o = getopts(args, { val: 'ut' });
      if (!o.rest.length) { io.error('notify-send: no summary specified'); return 1; }
      OS.notify({ app: 'notify-send', icon: 'bell', title: o.rest[0], body: o.rest.slice(1).join(' '), urgency: ['low', 'normal', 'critical'].includes(o.f.u) ? o.f.u : 'normal' });
      return 0;
    },
  });
  reg('spend', 'system', {
    desc: 'Today\'s model spend, from the one ledger', usage: 'spend',
    run(args, io) {
      const s = OS.spend.summary();
      io.println([['Today (UTC)  ', 'muted'], [OS.usd(s.usd), 'bold'], [' of ' + OS.usd(s.cap) + '  ', 'muted'], ...bar(s.usd / s.cap, 20)]);
      const rows = OS.spend.rows().slice(0, 12);
      if (!rows.length) { io.println('No charges yet today.', 'faint'); return 0; }
      io.println('');
      for (const r of rows) io.println([[r.t + '  ', 'faint'], [OS.usd(r.usd).padStart(7), 'warn'], ['  ' + String(r.source).padEnd(11), 'accent2'], r.label]);
      return 0;
    },
  });

  // ---------------- labs: git ----------------
  const gitHash = (s) => OS.hash(s).toString(16).padStart(8, '0').slice(0, 7);
  const ROLES = ['a lane', 'an engineer', 'the designer', 'an agent', 'Bricky', 'product design'];
  const gitLog = () => [
    ...git.commits.map((c) => ({ msg: c.msg, hash: c.hash, at: c.at })),
    ...OS.data.commits.map((m, i) => ({ msg: m, hash: gitHash(m + i), at: Date.now() - (i + 1) * 3.6e6 * (5 + (OS.hash(m) % 30)) })),
  ];
  const SAVE_DIFF = [
    ['diff --git a/' + SAVE_REL + ' b/' + SAVE_REL, 'bold'],
    ['index 3f2a1bc..9e8d7c6 100644', 'bold'],
    ['--- a/' + SAVE_REL, 'bold'],
    ['+++ b/' + SAVE_REL, 'bold'],
    ['@@ -6,7 +6,7 @@ export function SaveDesignButton({ state, second }: Props) {', 'info'],
    ['   const label = {', ''],
    ["-    idle: 'Save design',", 'bad'],
    ["+    idle: 'Keep design',", 'ok'],
    ["     saving: 'Saving',", ''],
    ["     saved: second ? 'Saved again' : 'Saved',", ''],
    ['   }[state]', ''],
  ];
  function gitCommitHook(io) {
    return (async () => {
      const steps = ['StandardRB', 'RSpec (the specs for changed files; not the full suite)', 'Lookbook preview coverage'];
      io.println('Running pre-commit checks', 'muted');
      for (const s of steps) {
        const hd = io.println([['  ⠋ ', 'accent'], s]);
        await io.sleep(260);
        if (io.aborted) return false;
        hd.set([['  ✓ ', 'ok'], s]);
      }
      return true;
    })();
  }
  const GIT_SUBS = ['status', 'log', 'diff', 'show', 'blame', 'add', 'commit', 'branch', 'checkout', 'switch', 'push', 'pull', 'fetch', 'rebase', 'merge', 'stash', 'remote', 'reset', 'init', 'clone'];
  reg('git', 'labs', {
    desc: 'Version control, for one repo, rebased', usage: 'git status | log [--oneline] | diff | blame file | commit -m msg | checkout -b name | branch | push [--force] | rebase',
    complete: (a) => (a.length <= 1 ? GIT_SUBS : (a[0] === 'checkout' || a[0] === 'switch') ? git.branches : []),
    async run(args, io) {
      const [sub, ...rest] = args;
      if (sub === '--version') { io.println('git version 2.47.0 (labs)'); return 0; }
      if (!sub || sub === 'help' || sub === '--help') {
        io.println('usage: git <command> [<args>]');
        io.println('');
        for (const l of grid(GIT_SUBS.map((s) => ({ t: s, c: 'ok' })), io.cols)) io.println(l);
        return sub ? 0 : 1;
      }
      if (sub === 'clone') { io.error('fatal: unable to access the remote: this OS is offline, like a brick.'); return 128; }
      const inRepo = io.cwd === LABS || io.cwd.startsWith(LABS + '/');
      if (!inRepo && sub !== 'init') { io.error('fatal: not a git repository (or any of the parent directories): .git'); io.println(`hint: the repo is at ${tilde(LABS)}`, 'faint'); return 128; }
      const B = git.branch;
      const dirty = Object.entries(git.dirty);
      switch (sub) {
        case 'status': {
          io.println(`On branch ${B}`);
          if (B === 'main') io.println("Your branch is up to date with 'origin/main'.");
          else io.println(git.pushed.includes(B) ? `Your branch is up to date with 'origin/${B}'.` : "Your branch is based on 'origin/main'. Push it, then open one PR for one ticket.", 'muted');
          const changed = dirty.filter(([, s]) => s !== 'new file'); const added = dirty.filter(([, s]) => s === 'new file');
          if (changed.length) {
            io.println(''); io.println('Changes not staged for commit:');
            io.println('  (use "git add <file>..." to update what will be committed)', 'muted');
            changed.forEach(([f, s]) => io.println([['\t' + (s + ':').padEnd(12) + f, 'bad']]));
          }
          if (added.length) {
            io.println(''); io.println('Untracked files:');
            io.println('  (use "git add <file>..." to include in what will be committed)', 'muted');
            added.forEach(([f]) => io.println([['\t' + f, 'bad']]));
          }
          io.println('');
          io.println(dirty.length ? 'no changes added to commit. Not worse than main.' : 'nothing to commit, working tree clean. Not worse than main.');
          return 0;
        }
        case 'log': {
          let n = Infinity; let one = false;
          for (let i = 0; i < rest.length; i++) { const a = rest[i]; if (a === '--oneline') one = true; else if (a === '-n') n = parseInt(rest[++i], 10); else if (/^-\d+$/.test(a)) n = parseInt(a.slice(1), 10); }
          const log = gitLog();
          const shown = log.slice(0, one ? n : Math.min(n, io.isTTY ? 6 : n));
          shown.forEach((c, i) => {
            const deco = i === 0 ? [' (', ['HEAD -> ', 'info bold'], [B, 'ok bold'], ...(git.commits.length && B === 'main' ? [] : [', ', ['origin/main', 'bad bold']]), ')'] : (i === git.commits.length && git.commits.length ? [' (', ['origin/main', 'bad bold'], ')'] : []);
            if (one) { io.println([[c.hash, 'warn'], ...deco, ' ', c.msg]); return; }
            io.println([[`commit ${c.hash}${gitHash(c.msg + 'x')}${gitHash(c.msg + 'y')}`, 'warn'], ...deco]);
            io.println(`Author: ${ROLES[OS.hash(c.msg) % ROLES.length]}`);
            io.println(`Date:   ${fmtDate(new Date(c.at))}`);
            io.println(''); io.println('    ' + c.msg); io.println('');
          });
          if (!one && shown.length < log.length && Number.isFinite(n) === false) io.println(`(${log.length - shown.length} more. git log --oneline shows every one.)`, 'faint');
          return 0;
        }
        case 'diff': case 'show': {
          if (sub === 'show') {
            const c = gitLog()[0];
            io.println([[`commit ${c.hash}`, 'warn']]); io.println(`Author: ${ROLES[OS.hash(c.msg) % ROLES.length]}`); io.println(''); io.println('    ' + c.msg); io.println('');
            if (!git.commits.length) { SAVE_DIFF.slice(0, 4).forEach(([t, k]) => io.println(t.replace('index 3f2a1bc..9e8d7c6', 'index 1d2e3f4..3f2a1bc'), k)); io.println('@@ -1,3 +1,3 @@', 'info'); io.println('-// TODO: tidy', 'bad'); io.println('+', 'ok'); }
            return 0;
          }
          const stat = rest.includes('--stat');
          for (const [f, s] of dirty) {
            const abs = LABS + '/' + f;
            if (f === SAVE_REL && s === 'modified' && safeRead(abs).includes('Keep design')) {
              if (stat) io.println([` ${f} | 2 `, ['+', 'ok'], ['-', 'bad']]); else SAVE_DIFF.forEach(([t, k]) => io.println(t, k));
              continue;
            }
            const body = s === 'deleted' ? [] : splitLines(safeRead(abs));
            if (stat) { io.println([` ${f} | ${body.length} `, ['+'.repeat(Math.min(20, body.length)), 'ok']]); continue; }
            io.println(`diff --git a/${f} b/${f}`, 'bold');
            if (s === 'deleted') { io.println('deleted file mode 100644', 'bold'); continue; }
            if (s === 'new file') io.println('new file mode 100644', 'bold');
            io.println(`--- ${s === 'new file' ? '/dev/null' : 'a/' + f}`, 'bold');
            io.println(`+++ b/${f}`, 'bold');
            io.println(`@@ -0,0 +1,${body.length} @@`, 'info');
            body.slice(0, 40).forEach((l) => io.println('+' + l, 'ok'));
            if (body.length > 40) io.println(`… ${body.length - 40} more lines`, 'faint');
          }
          return 0;
        }
        case 'blame': {
          const f = rest.find((a) => !a.startsWith('-'));
          if (!f) { io.error('usage: git blame <file>'); return 129; }
          const abs = OS.fs.resolve(io.cwd, f);
          if (!OS.fs.isFile(abs)) { io.error(`fatal: no such path '${f}' in HEAD`); return 128; }
          const log = gitLog(); const lines = splitLines(OS.fs.read(abs));
          lines.forEach((l, i) => {
            const c = log[OS.hash(l + i) % log.length]; const who = ROLES[OS.hash(c.msg) % ROLES.length];
            io.println([[c.hash, 'warn'], ' (', [who.padEnd(15), 'accent2'], [new Date(c.at).toISOString().slice(0, 10), 'muted'], ' ', [String(i + 1).padStart(3), 'faint'], ') ', l]);
          });
          return 0;
        }
        case 'add': case 'reset': case 'fetch': return 0;
        case 'init': io.println(`Reinitialized existing Git repository in ${LABS}/.git/`); return 0;
        case 'remote': io.println('origin\t(offline, like a brick) (fetch)'); io.println('origin\t(offline, like a brick) (push)'); return 0;
        case 'pull': io.println('Already up to date.'); return 0;
        case 'merge': io.error('fatal: Labs merges by rebase. A merge commit blocks the merge button.'); return 128;
        case 'commit': {
          let msg = null;
          for (let i = 0; i < rest.length; i++) { if (rest[i] === '-m' || rest[i] === '-am') msg = rest[++i]; else if (rest[i].startsWith('-m')) msg = rest[i].slice(2); }
          if (!msg) { io.error('Aborting commit due to empty commit message. (labvim is the editor. Use -m.)'); return 1; }
          if (!dirty.length) { io.println(`On branch ${B}`); io.println('nothing to commit, working tree clean'); return 1; }
          if (!(await gitCommitHook(io))) return 130;
          const banned = /(load-bearing|runbook|when it lands|cut a pr|cut a branch|yak[- ]shav|bikeshed|foot-?gun)/i.exec(msg);
          if (banned) { io.println([['  ✗ ', 'bad'], `commit-msg: "${banned[1]}" is a banned word. Say what it does.`]); return 1; }
          io.println([['  ✓ ', 'ok'], 'commit-msg']);
          const hash = gitHash(msg + Date.now());
          const files = dirty.length; const ins = dirty.reduce((a, [f]) => a + Math.max(1, splitLines(safeRead(LABS + '/' + f)).length), 0);
          git.commits.unshift({ msg, hash, at: Date.now() }); git.dirty = {}; saveGit();
          io.println(`[${B} ${hash}] ${msg}`);
          io.println(` ${files} file${files === 1 ? '' : 's'} changed, ${ins} insertion${ins === 1 ? '' : 's'}(+), ${files} deletion${files === 1 ? '' : 's'}(-)`);
          return 0;
        }
        case 'branch': {
          const d = rest.indexOf('-d') >= 0 ? rest[rest.indexOf('-d') + 1] : rest.indexOf('-D') >= 0 ? rest[rest.indexOf('-D') + 1] : null;
          if (d) {
            if (d === B) { io.error(`error: cannot delete branch '${d}' used by worktree at '${LABS}'`); return 1; }
            if (d === 'main') { io.error('error: main is not yours to delete.'); return 1; }
            if (!git.branches.includes(d)) { io.error(`error: branch '${d}' not found.`); return 1; }
            git.branches = git.branches.filter((x) => x !== d); saveGit(); io.println(`Deleted branch ${d}.`); return 0;
          }
          if (rest[0] && !rest[0].startsWith('-')) { if (!git.branches.includes(rest[0])) { git.branches.push(rest[0]); saveGit(); } return 0; }
          const lanes = ['lane/round-6-design-review', 'lane/stalled-on-a-background-wait'];
          [...git.branches, ...lanes.filter((l) => !git.branches.includes(l))].forEach((b) => io.println(b === B ? [['* ', 'ok'], [b, 'ok bold']] : '  ' + b));
          return 0;
        }
        case 'checkout': case 'switch': {
          const create = rest.includes('-b') || rest.includes('-c');
          const target = rest.find((a) => !a.startsWith('-'));
          if (rest[0] === '--' && rest[1]) { delete git.dirty[rest[1]]; saveGit(); io.println('Updated 1 path from the index'); return 0; }
          if (!target) { io.error(`fatal: missing branch name`); return 128; }
          if (create) {
            if (git.branches.includes(target)) { io.error(`fatal: a branch named '${target}' already exists`); return 128; }
            git.branches.push(target); git.branch = target; saveGit();
            io.println(`Switched to a new branch '${target}'`);
            return 0;
          }
          if (!git.branches.includes(target) && !target.startsWith('lane/')) { io.error(`error: pathspec '${target}' did not match any file(s) known to git`); return 1; }
          if (!git.branches.includes(target)) git.branches.push(target);
          git.branch = target; saveGit();
          io.println(`Switched to branch '${target}'`);
          return 0;
        }
        case 'push': {
          const force = rest.some((a) => a === '--force' || a === '-f' || a === '--force-with-lease');
          io.println('Enumerating objects: 7, done.', 'muted');
          await io.sleep(200); if (io.aborted) return 130;
          const prog = io.println('Writing objects:   0% (0/4)', 'muted');
          for (let i = 1; i <= 4; i++) { await io.sleep(110); if (io.aborted) return 130; prog.set(`Writing objects: ${String(i * 25).padStart(3)}% (${i}/4), 412 bytes | 412.00 KiB/s${i === 4 ? ', done.' : ''}`, 'muted'); }
          io.println('To origin');
          if (B === 'main') {
            io.println([' ! [remote rejected] ', ['main -> main', 'bold'], ` (${force ? 'force-pushing main is not a thing we do' : 'protected branch hook declined'})`], 'bad');
            io.println('remote: main takes pull requests, merged by rebase. Make a branch.', 'muted');
            io.error("error: failed to push some refs to 'origin'");
            return 1;
          }
          if (force) {
            io.println([`  + ${gitHash(B + 'old')}...${gitHash(B + Date.now())} `, [`${B} -> ${B}`, 'bold'], ' (forced update)']);
            io.println('remote: the review comments now point at lines that no longer exist.', 'muted');
          } else {
            io.println([git.pushed.includes(B) ? `   ${gitHash(B)}..${gitHash(B + 'n')}  ` : ' * [new branch]      ', [`${B} -> ${B}`, 'bold']]);
            if (!git.pushed.includes(B)) io.println(`remote: Open a pull request for '${B}'. One PR, one ticket.`, 'muted');
          }
          if (!git.pushed.includes(B)) { git.pushed.push(B); saveGit(); }
          return 0;
        }
        case 'rebase': {
          if (rest.includes('-i') || rest.includes('--interactive')) { io.error('hint: an interactive rebase opens labvim. Many have tried to leave it.'); return 1; }
          io.println(`Successfully rebased and updated refs/heads/${B}.`);
          return 0;
        }
        case 'stash': {
          if (rest[0] === 'pop') {
            const s = git.stash.pop(); if (!s) { io.error('No stash entries found.'); return 1; }
            Object.assign(git.dirty, s); saveGit(); io.println(`On branch ${B}`); io.println('Dropped refs/stash@{0}'); return 0;
          }
          if (rest[0] === 'list') { git.stash.forEach((s, i) => io.println(`stash@{${git.stash.length - 1 - i}}: WIP on ${B}: ${gitLog()[0].msg}`)); return 0; }
          if (!dirty.length) { io.println('No local changes to save'); return 0; }
          git.stash.push({ ...git.dirty }); git.dirty = {}; saveGit();
          io.println(`Saved working directory and index state WIP on ${B}: ${gitHash(gitLog()[0].msg)} ${gitLog()[0].msg}`);
          return 0;
        }
        default:
          io.error(`git: '${sub}' is not a git command. See 'git --help'.`);
          return 1;
      }
    },
  });

  // ---------------- labs: tests, lint, frontend, dev server ----------------
  async function rspecRun(io, files, full) {
    const examples = full ? 1412 : 4 + (OS.hash(files.join(' ')) % 28);
    io.println(full ? 'Running the suite in 8 processes. The browser specs run on their own.' : `Running ${files.join(' ') || 'spec/'}`, 'muted');
    const failAt = full ? 861 : -1; const pendAt = full ? 1170 : -1;
    let done = 0;
    while (done < examples) {
      const k = Math.min(examples - done, full ? 26 + Math.floor(Math.random() * 18) : 2);
      let dots = '';
      for (let j = 0; j < k; j++) {
        const idx = done + j;
        if (idx === failAt || idx === pendAt) { if (dots) io.print(dots, 'ok'); dots = ''; io.print(idx === failAt ? 'F' : '*', idx === failAt ? 'bad bold' : 'warn'); } else dots += '.';
      }
      if (dots) io.print(dots, 'ok');
      done += k;
      await io.sleep(full ? 40 : 90);
      if (io.aborted) { io.println(''); io.println(`Interrupted after ${done} of ${examples} examples.`, 'warn'); return 130; }
    }
    io.println('');
    if (!full) { io.println(''); io.println(`Finished in ${(examples * 0.21).toFixed(2)} seconds (files took 1.8 seconds to load)`); io.println(`${examples} examples, 0 failures`, 'ok'); return 0; }
    io.println('');
    io.println('Pending: (Failures listed here are expected and do not affect your suite\'s status)', 'warn');
    io.println('  1) Composer extensions pitched roofs', 'warn');
    io.println('     # Grey only: no materials, new openings or pitched roofs yet.', 'faint');
    io.println('');
    io.println('Failures:');
    io.println('');
    io.println('  1) Configurator design tab saves a design a second time');
    io.println('     Failure/Error: expect(page).to have_button("Saved again")', 'bad');
    io.println('       expected to find button "Saved again" but there were no matches.', 'bad');
    io.println('       Also found "Keep design", which matched the selector but not all filters.', 'bad');
    io.println('     # ./spec/system/configurator/save_design_spec.rb:42', 'info');
    io.println('');
    io.println('Finished in 4 minutes 12.6 seconds (files took 2.18 seconds to load)');
    io.println('1412 examples, 1 failure, 1 pending', 'bad');
    io.println('');
    io.println('Failed examples:');
    io.println([['rspec ./spec/system/configurator/save_design_spec.rb:42', 'bad'], [' # Configurator design tab saves a design a second time', 'info']]);
    io.println('');
    io.println('Retrying the 1 failure. It passed on main this morning.', 'muted');
    await io.sleep(700); if (io.aborted) return 130;
    io.println('.', 'ok');
    io.println('1 example, 0 failures', 'ok');
    io.println('Retried: 1. Passed: 1. Learned: 0.', 'muted');
    return 0;
  }
  async function standardRun(io, fix) {
    io.println('Inspecting 1,312 files', 'muted');
    for (let i = 0; i < 33; i++) {
      io.print(i === 21 ? (fix ? 'C' : 'W') : '........................................'.slice(0, 40), i === 21 ? 'warn bold' : 'ok');
      await io.sleep(30);
      if (io.aborted) { io.println(''); return 130; }
    }
    io.println('');
    io.println('');
    io.println([['app/services/composer/pipeline/nodes/floor_boxes/luna_storeycount_3.rb', 'info'], [':4:42: ', 'muted'], [fix ? '[Corrected] ' : '', 'ok'], 'Layout/TrailingWhitespace: Trailing whitespace detected.']);
    io.println('');
    io.println(fix ? '1,312 files inspected, 1 offense detected, 1 offense corrected' : '1,312 files inspected, 1 offense detected, 1 offense autocorrectable', fix ? 'ok' : 'warn');
    if (!fix) io.println('Run it again with --fix. It will find a new one next time.', 'faint');
    return fix ? 0 : 1;
  }
  reg('bin/rspec_all', 'labs', {
    desc: 'The full parallel suite. AGENTS.md has views', usage: 'bin/rspec_all',
    async run(args, io) {
      io.println([['AGENTS.md: ', 'muted'], ['Do NOT run the full test suite unnecessarily. It slows down development.', 'warn']]);
      const a = (await io.prompt([['Run it anyway? ', 'fg'], ['[y/N] ', 'muted']])).trim().toLowerCase();
      if (io.aborted) return 130;
      if (a !== 'y' && a !== 'yes') { io.println('Good. The pre-commit hook runs the specs for the files you changed.', 'muted'); return 0; }
      return rspecRun(io, [], true);
    },
  });
  syn('parallel_rspec', 'bin/rspec_all');
  reg('rspec', 'labs', {
    desc: 'Run specs', usage: 'rspec [spec/path...]', hidden: true,
    run(args, io) {
      const files = args.filter((a) => !a.startsWith('-'));
      if (!files.length) io.println('No paths given, so this is the full suite. AGENTS.md would like a word.', 'warn');
      return rspecRun(io, files, !files.length);
    },
  });
  reg('bundle', 'labs', {
    desc: 'Ruby gems. exec runs rspec and standardrb', usage: 'bundle [install | exec rspec [paths] | exec standardrb [--fix]]',
    complete: (a) => (a.length <= 1 ? ['install', 'exec', 'update'] : a[0] === 'exec' && a.length === 2 ? ['rspec', 'standardrb', 'rails'] : []),
    async run(args, io) {
      const [sub, ...rest] = args;
      if (!sub || sub === 'install') {
        const hd = io.println('Fetching gem metadata', 'muted');
        for (let i = 0; i < 6; i++) { await io.sleep(120); if (io.aborted) return 130; hd.set('Fetching gem metadata' + '.'.repeat(i + 1), 'muted'); }
        io.println('Resolving dependencies...', 'muted');
        await io.sleep(300); if (io.aborted) return 130;
        io.println('Bundle complete. 214 Gemfile dependencies, 391 gems now installed.', 'ok');
        io.println('Use `bundle info [gemname]` to see where a bundled gem is installed.', 'faint');
        return 0;
      }
      if (sub === 'update') { io.println('Bundle updated. Dependency bumps arrive in batches. This is a batch.', 'ok'); return 0; }
      if (sub === 'exec') {
        if (!rest.length) { io.error('bundler: exec needs a command to run'); return 1; }
        if (rest[0] === 'rspec') { const files = rest.slice(1).filter((a) => !a.startsWith('-')); if (!files.length) io.println('No paths given, so this is the full suite. AGENTS.md would like a word.', 'warn'); return rspecRun(io, files, !files.length); }
        if (rest[0] === 'standardrb') return standardRun(io, rest.includes('--fix') || rest.includes('-a'));
        return io.sh.execNested(rest.map(shq).join(' '), io);
      }
      io.error(`Could not find command "${sub}".`);
      return 15;
    },
  });
  reg('standardrb', 'labs', { desc: 'Ruby lint', usage: 'standardrb [--fix]', hidden: true, run: (args, io) => standardRun(io, args.includes('--fix')) });
  async function checkCi(io, full) {
    io.println(`> labs@0.0.0 ${full ? 'check:ci' : 'check'}`, 'muted');
    io.println(`> ${full ? "every step of CI's Frontend Checks job" : 'lint, types and unit tests'}`, 'muted');
    io.println('');
    const steps = [['lint', '0 problems', 0.9], ['types', '0 errors', 6.2], ['unit tests', '812 passed', 11.4]];
    if (full) steps.push(['component gallery build', '214 stories', 38.0], ['design-sync: tokens', 'in step', 0.4], ['design-sync: kit bundle', 'in step', 0.6], ['design-sync: component cards', 'in step', 0.5], ['design-sync: recorded', pk.synced ? 'recorded' : null, 0.3]);
    let failed = 0; const W = Math.min(30, Math.max(14, io.cols - 30));
    for (const [nm, res, secs] of steps) {
      const hd = io.println([['  ⠋ ', 'accent'], nm]);
      const spin = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
      for (let i = 0; i < Math.max(2, Math.round(secs * 1.5)); i++) { await io.sleep(70); if (io.aborted) return 130; hd.set([[`  ${spin[i % 10]} `, 'accent'], nm]); }
      if (res) hd.set([['  ✓ ', 'ok'], clip(nm, W).padEnd(W), [res.padEnd(14), 'muted'], [`${secs.toFixed(1)}s`, 'faint']]);
      else {
        failed++;
        hd.set([['  ✗ ', 'bad'], [clip(nm, W).padEnd(W), 'bad'], ['the design system is out of date', 'bad']]);
        io.println('      run `npm run design:sync`, then commit "record the design system sync"', 'faint');
      }
    }
    io.println('');
    if (failed) { io.println(`${full ? 'check:ci' : 'check'}: ${steps.length - failed} of ${steps.length} steps passed. The other one is the design-sync gate.`, 'bad'); return 1; }
    io.println(`${full ? 'check:ci' : 'check'}: ${steps.length} of ${steps.length} passed. Not worse than main.`, 'ok');
    if (full) { pk.synced = false; savePk(); }
    return 0;
  }
  async function npmInstall(io) {
    const hd = io.println('');
    const spin = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
    const words = ['idealTree', 'reify: timing reifyNode:node_modules/vite', 'reify: timing reifyNode:node_modules/react', 'reify: timing build:link', 'audit'];
    for (let i = 0; i < 30; i++) { await io.sleep(60); if (io.aborted) { hd.remove(); return 130; } hd.set([[spin[i % 10] + ' ', 'accent'], [words[Math.floor(i / 6)], 'muted']]); }
    hd.remove();
    io.println('');
    io.println('added 1284 packages, and audited 1285 packages in 41s');
    io.println('');
    io.println('212 packages are looking for funding');
    io.println('  run `npm fund` for details', 'muted');
    io.println('');
    io.println([['found ', ''], ['0', 'ok bold'], [' vulnerabilities', '']]);
    return 0;
  }
  reg('npm', 'labs', {
    desc: 'Frontend packages and scripts', usage: 'npm install | npm run check:ci | npm run design:sync | npm test',
    complete: (a) => (a.length <= 1 ? ['install', 'run', 'test'] : a[0] === 'run' ? ['check', 'check:ci', 'design:sync', 'dev', 'test'] : []),
    async run(args, io) {
      const [sub, ...rest] = args;
      if (!sub) { io.println('npm <command>'); io.println(''); io.println('Usage: npm install | npm run <script> | npm test', 'muted'); return 1; }
      if (sub === 'install' || sub === 'i' || sub === 'ci') return npmInstall(io);
      if (sub === 'test' || sub === 't') { io.println('> test-runner run', 'muted'); await io.sleep(600); if (io.aborted) return 130; io.println(' Test Files  96 passed (96)', 'ok'); io.println('      Tests  812 passed (812)', 'ok'); return 0; }
      if (sub === 'run' || sub === 'run-script') {
        const s = rest[0];
        if (!s) { io.println('Scripts available in labs via `npm run`:'); [['dev', 'bin/dev'], ['check', 'lint, types and unit tests'], ['check:ci', "every step of CI's Frontend Checks job"], ['design:sync', 'record the design system sync'], ['test', 'unit tests']].forEach(([k, v]) => { io.println('  ' + k, 'ok'); io.println('    ' + v, 'muted'); }); return 0; }
        if (s === 'check:ci') return checkCi(io, true);
        if (s === 'check') return checkCi(io, false);
        if (s === 'test') return OS.commands.get('npm').run(['test'], io);
        if (s === 'dev') { io.println('Use bin/dev. It starts Rails, Vite and the jobs worker together.', 'muted'); return 0; }
        if (s === 'design:sync') {
          io.println('> labs@0.0.0 design:sync', 'muted');
          await io.sleep(500); if (io.aborted) return 130;
          io.println('Synced 214 component cards, 96 tokens and 1 kit bundle.');
          try { writeFile(LABS + '/.design-sync', OS.now().toISOString() + '\n'); } catch { /* the repo is gone; the sync still counts */ }
          pk.synced = true; savePk();
          io.println('Recorded. Commit it as "record the design system sync". You will do this again.', 'ok');
          return 0;
        }
        io.error(`npm error Missing script: "${s}"`);
        return 1;
      }
      io.error(`Unknown command: "${sub}"`);
      return 1;
    },
  });
  const DEV_LINES = [
    [['web', 'Started GET "/configurator" for 127.0.0.1'], ['web', 'Processing by ConfiguratorController#show as HTML'], ['web', '  Property Load (0.4ms)  SELECT "properties".* FROM "properties" WHERE "properties"."partner_id" = $1 LIMIT 1'], ['web', 'Completed 200 OK in 38ms (Views: 12.1ms | ActiveRecord: 1.9ms)']],
    [['vite', 'hmr update /components/configurator/PriceBar.tsx']],
    [['vite', 'hmr update /components/configurator/SaveDesignButton.tsx (Keep design)']],
    [['css', 'Rebuilding...'], ['css', 'Done in 287ms.']],
    [['jobs', 'Composer::RunJob house=158 stage=floor_boxes approach=luna_storeycount_3 ✓'], ['jobs', 'Composer::RunJob spend $0.42 (note H-12: $9.80 of $10.00)']],
    [['jobs', 'ModelPictureJob: one capture at a time per host. Waiting.']],
    [['web', 'Started GET "/" for 127.0.0.1 (host: localhost:3000)'], ['web', 'ActsAsTenant::Errors::NoTenantSet. Use tenant.localhost:3000.'], ['web', 'Completed 500 Internal Server Error in 4ms']],
    [['vite', '[cors] blocked a request from another host name. The v3 pages will go blank. Use tenant.localhost:3000.']],
    [['web', 'Started POST "/designs" for 127.0.0.1'], ['web', 'Processing by DesignsController#create as JSON'], ['web', 'Completed 201 Created in 22ms'], ['web', 'Started POST "/designs" for 127.0.0.1'], ['web', 'Completed 200 OK in 9ms (a second save says so)']],
    [['jobs', 'Composer::RunJob house=152 stage=roofer approach=chalet_roof_1 ✓']],
  ];
  const DEV_CLS = { system: 'faint', web: 'accent', vite: 'accent2', css: 'info', jobs: 'warn' };
  reg('bin/dev', 'labs', {
    desc: 'Rails, Vite, CSS and jobs, until Ctrl+C', usage: 'bin/dev',
    async run(args, io) {
      const ts = () => [hhmm(OS.now()) + ':' + two(OS.now().getSeconds()) + ' ', 'faint'];
      const log = (p, text, cls) => io.println([ts(), [(p + (p === 'system' ? '' : '.1')).padEnd(7), DEV_CLS[p]], ['| ', DEV_CLS[p]], [text, cls || '']]);
      ['web', 'vite', 'css', 'jobs'].forEach((p, i) => log('system', `${p}.1 started with pid ${4127 + i}`, 'muted'));
      devServers++;
      try {
        const boot = [['web', '=> Booting the labs app'], ['web', '=> Rails 8.1 application starting in development'], ['web', '* Listening on http://tenant.localhost:3000'], ['vite', 'VITE ready in 412 ms'], ['vite', '➜  Local: http://tenant.localhost:3036/vite-dev/'], ['css', 'Rebuilding... Done in 312ms.'], ['jobs', 'Worker started. 3 queues. One of them is the model picture queue.']];
        for (const [p, t] of boot) { await io.sleep(110); if (io.aborted) break; log(p, t); }
        let n = 0;
        while (!io.aborted) {
          await io.sleep(700 + Math.random() * 1500);
          if (io.aborted) break;
          const burst = DEV_LINES[(OS.hash(String(n++)) + n) % DEV_LINES.length];
          for (const [p, t] of burst) { log(p, t, /500|blocked|NoTenantSet/.test(t) ? 'bad' : /✓/.test(t) ? 'ok' : ''); await io.sleep(40); }
        }
      } finally { devServers--; }
      log('system', 'SIGINT received, starting shutdown', 'muted');
      log('web', '- Gracefully stopping, waiting for requests to finish');
      log('vite', 'exited with code 0', 'muted');
      log('css', 'exited with code 0', 'muted');
      log('jobs', 'Worker stopped. The model picture queue is still waiting. It will not wake you.');
      log('web', 'Exiting');
      log('system', 'stopping all processes', 'muted');
      return 130;
    },
  });

  // ---------------- labs: rails console and python ----------------
  const PARTNERS = [{ id: 1, name: 'Demo Homes', subdomain: 'demo' }, { id: 2, name: 'Acme Lofts', subdomain: 'acme' }, { id: 3, name: 'Gable & Grid', subdomain: 'gable' }];
  const pStr = (p) => (p ? `#<Partner id: ${p.id}, name: "${p.name}", subdomain: "${p.subdomain}">` : 'nil');
  function partnerExpr(src) {
    let m = /^Partner\.find_by\(\s*subdomain:\s*["']([^"']*)["']\s*\)$/.exec(src);
    if (m) return { v: PARTNERS.find((p) => p.subdomain === m[1]) || null };
    m = /^Partner\.find\((\d+)\)$/.exec(src);
    if (m) { const p = PARTNERS.find((x) => x.id === Number(m[1])); return p ? { v: p } : { err: `ActiveRecord::RecordNotFound: Couldn't find Partner with 'id'=${m[1]}` }; }
    if (src === 'Partner.first') return { v: PARTNERS[0] };
    if (src === 'Partner.last') return { v: PARTNERS[PARTNERS.length - 1] };
    return null;
  }
  const ADDRS = ['1 Gable End, Testford', '22 Storey Row, Gridley', '158 Gold Street, Reliable', '3 Width Lane, Fixedham', '12 Eaves Close, Lowbury'];
  function evalRuby(src, T) {
    if (src === 'reload!') return [['Reloading...', ''], ['=> true', 'muted']];
    if (src === 'help') return [['Try Property.count. Then set a tenant and try again.', 'muted']];
    if (/^ActsAsTenant\.without_tenant/.test(src)) return [['RuntimeError: refused. Multi-tenancy is via acts_as_tenant: never bypass tenant scoping.', 'bad']];
    let m = /^ActsAsTenant\.current_tenant\s*=\s*(.+)$/.exec(src);
    if (m) {
      const r = m[1].trim() === 'nil' ? { v: null } : partnerExpr(m[1].trim());
      if (!r) return [[`NameError: undefined local variable or method '${m[1].trim()}' for main:Object`, 'bad']];
      if (r.err) return [[r.err, 'bad']];
      T.tenant = r.v; return [['=> ' + pStr(r.v), 'muted']];
    }
    if (src === 'ActsAsTenant.current_tenant') return [['=> ' + pStr(T.tenant), 'muted']];
    if (/^Partner\b/.test(src)) {
      if (src === 'Partner.count') return [[`=> ${PARTNERS.length}`, 'muted']];
      if (src === 'Partner.all') return [[`=> #<ActiveRecord::Relation [${PARTNERS.map(pStr).join(', ')}]>`, 'muted']];
      const r = partnerExpr(src);
      if (r) return r.err ? [[r.err, 'bad']] : [['=> ' + pStr(r.v), 'muted']];
      return [[`NoMethodError: undefined method '${src.split('.')[1] || src}' for class Partner`, 'bad']];
    }
    if (/\b(Property|User|Report|Risk)\.count\b/.test(src) && src !== src.match(/^\w+\.count$/)?.[0]) {
      if (!T.tenant) return evalRuby(src.match(/\b(Property|User|Report|Risk)\b/)[1], T);
      const e = src.replace(/\b(Property|User|Report|Risk)\.count\b/g, (x, mm) => String(40 + (OS.hash(mm + T.tenant.subdomain) % 1400)));
      if (isArith(e)) return evalRuby(e, T);
    }
    m = /^(Property|User|Report|Risk)(?:\.(\w+)(?:\((.*)\))?)?$/.exec(src);
    if (m) {
      if (!T.tenant) return [['ActsAsTenant::Errors::NoTenantSet: ActsAsTenant::Errors::NoTenantSet', 'bad'], [`\tfrom app/models/${m[1].toLowerCase()}.rb:3:in '<class:${m[1]}>'`, 'faint'], ["\tfrom (labs):1:in '<main>'", 'faint'], ['Set one: ActsAsTenant.current_tenant = Partner.find_by(subdomain: "demo")', 'faint']];
      const n = 40 + (OS.hash(m[1] + T.tenant.subdomain) % 1400);
      const obj = (id) => (m[1] === 'Property' ? `#<Property id: ${id}, address: "${ADDRS[id % ADDRS.length]}", partner_id: ${T.tenant.id}>` : `#<${m[1]} id: ${id}, partner_id: ${T.tenant.id}>`);
      switch (m[2]) {
        case undefined: return [[`=> ${m[1]}(id: integer, partner_id: integer, created_at: datetime, updated_at: datetime)`, 'muted']];
        case 'count': return [[`=> ${n}`, 'muted']];
        case 'first': return [['=> ' + obj(158), 'muted']];
        case 'last': return [['=> ' + obj(n + 117), 'muted']];
        case 'all': return [[`=> #<ActiveRecord::Relation [${[158, 152, 135].map(obj).join(', ')}, ...]>`, 'muted']];
        case 'find': { const id = parseInt(m[3], 10); return id > 0 && id < n + 200 ? [['=> ' + obj(id), 'muted']] : [[`ActiveRecord::RecordNotFound: Couldn't find ${m[1]} with 'id'=${m[3]} [WHERE "${m[1].toLowerCase()}s"."partner_id" = $1]`, 'bad']]; }
        default: return [[`NoMethodError: undefined method '${m[2]}' for class ${m[1]}`, 'bad']];
      }
    }
    m = /^puts\s+["'](.*)["']$/.exec(src);
    if (m) return [[m[1], ''], ['=> nil', 'muted']];
    if (/^["'].*["']$/.test(src)) return [[`=> "${src.slice(1, -1)}"`, 'muted']];
    if (src === 'nil' || src === 'true' || src === 'false') return [['=> ' + src, 'muted']];
    if (isArith(src)) { try { const v = arith(src.replace(/\*\*/g, '**')); return [[`=> ${Number.isInteger(v) ? v : v.toFixed(4).replace(/0+$/, '')}`, 'muted']]; } catch { return [['SyntaxError: (labs):1: syntax error', 'bad']]; } }
    const w = (/^[A-Za-z_:]+/.exec(src) || [src])[0];
    return /^[A-Z]/.test(w) ? [[`NameError: uninitialized constant ${w.split('::')[0]}`, 'bad']] : [[`NameError: undefined local variable or method '${w}' for main:Object`, 'bad']];
  }
  async function railsConsole(io) {
    io.println('Loading development environment (Rails 8.1.0)', 'muted');
    const T = { tenant: null };
    for (;;) {
      const line = await io.prompt([['labs(dev)', 'bad'], ['> ', 'muted']], { eof: true });
      if (io.aborted) return 130;
      if (line === null || /^(exit|quit)$/.test(line.trim())) return 0;
      const src = line.trim();
      if (!src) continue;
      for (const [t, c] of evalRuby(src, T)) io.println(t, c);
    }
  }
  reg('rails', 'labs', {
    desc: 'Rails: console, server', usage: 'rails console | rails server',
    complete: () => ['console', 'server', 'routes'],
    async run(args, io) {
      const sub = args[0];
      if (sub === 'console' || sub === 'c') return railsConsole(io);
      if (sub === 'server' || sub === 's') { io.println('Use bin/dev. It runs the server with Vite, CSS and the jobs worker.', 'muted'); return io.sh.execNested('bin/dev', io); }
      if (sub === 'routes') { io.println('            Prefix Verb URI Pattern', 'bold'); io.println('      configurator GET  /configurator(.:format)  configurator#show'); io.println('           designs POST /designs(.:format)       designs#create'); io.println('             admin GET  /admin                   (admin subdomain only)'); return 0; }
      if (!sub) { io.println('Usage: rails COMMAND [options]'); io.println(''); io.println('  console (c)   irb, with tenants', 'muted'); io.println('  server (s)    use bin/dev', 'muted'); io.println('  routes        some of them', 'muted'); return 1; }
      io.error(`Unrecognized command "${sub}"`);
      return 1;
    },
  });
  syn('bin/rails', 'rails');
  const ZEN = ['The Zen of Labs, by a lane', '', 'Composed is better than configured.', 'Not worse than main is good enough.', 'Gold is never edited. It is overridden.', 'One PR is better than two. One ticket is better than none.', 'A different prompt is a new numbered file.', 'Ground is 0, even on days that feel like 1.', 'If the change is hard to explain, it is a craft cleanup.', 'If the change is easy to explain, it is booked for a design review.', 'The daily cap resets at midnight UTC. Nothing else does.'];
  function evalPython(src) {
    if (src === 'import this') return ZEN.map((l) => [l, '']);
    if (src === 'help' || src === 'help()') return [['This interpreter knows arithmetic, print, and one poem.', 'muted']];
    let m = /^print\((.*)\)$/.exec(src);
    if (m) { const inner = m[1].trim(); if (/^(["']).*\1$/.test(inner)) return [[inner.slice(1, -1), '']]; if (isArith(inner)) { try { return [[String(arith(inner)), '']]; } catch { /* fall through to the error */ } } }
    if (isArith(src)) { try { const v = arith(src); return [[String(Number.isInteger(v) ? v : +v.toFixed(10)), '']]; } catch { return [['  File "<stdin>", line 1', 'faint'], ['SyntaxError: invalid syntax', 'bad']]; } }
    if (/^(["']).*\1$/.test(src)) return [[`'${src.slice(1, -1)}'`, '']];
    const w = (/^[A-Za-z_]\w*/.exec(src) || [src])[0];
    return [['Traceback (most recent call last):', 'faint'], ['  File "<stdin>", line 1, in <module>', 'faint'], [`NameError: name '${w}' is not defined`, 'bad']];
  }
  reg('python', 'labs', {
    desc: 'A python prompt that knows arithmetic and one poem', usage: 'python [-c code]',
    async run(args, io) {
      if (args[0] === '-c') { for (const [t, c] of evalPython((args[1] || '').trim())) io.println(t, c); return 0; }
      if (args[0] === '--version' || args[0] === '-V') { io.println('Python 3.13.0'); return 0; }
      if (args[0]) { io.error(`python: can't open file '${args[0]}': this interpreter knows arithmetic and one poem.`); return 2; }
      io.println('Python 3.13.0 (labs, 13 Nov 2026) on brickty', 'muted');
      io.println('Type "help" or "import this". exit() leaves. It is not in the Gemfile.', 'muted');
      for (;;) {
        const line = await io.prompt([['>>> ', 'warn']], { eof: true });
        if (io.aborted) return 130;
        if (line === null || /^(exit|quit)(\(\))?$/.test(line.trim())) return 0;
        if (!line.trim()) continue;
        for (const [t, c] of evalPython(line.trim())) io.println(t, c);
      }
    },
  });
  syn('python3', 'python');
  reg('make', 'labs', {
    desc: 'There is no Makefile', usage: 'make [target]',
    run(args, io) {
      if (!args.length) io.error('make: *** No targets specified and no makefile found.  Stop.');
      else { io.error(`make: *** No rule to make target '${args[0]}'.  Stop.`); io.println('This repo has bin/ scripts. It has never had a Makefile. Try bin/dev.', 'faint'); }
      return 2;
    },
  });

  // ---------------- labs: other apps ----------------
  reg('top', 'labs', { desc: 'Opens lanetop', usage: 'top', run(args, io) { io.println('top: opening lanetop', 'faint'); io.open('lanetop'); return 0; } });
  syn('htop', 'top');
  syn('btop', 'top');
  reg('vim', 'labs', {
    desc: 'Opens labvim', usage: 'vim [file]',
    run(args, io) {
      const f = args.find((a) => !a.startsWith('-') && !a.startsWith('+'));
      io.open('labvim', f ? { path: OS.fs.resolve(io.cwd, f) } : undefined);
      return 0;
    },
  });
  syn('vi', 'vim');
  syn('nvim', 'vim');
  syn('labvim', 'vim');
  reg('nano', 'labs', {
    desc: 'There is one editor', usage: 'nano [file]', hidden: true,
    run(args, io) { io.println('nano: this OS has one editor. It is labvim. Opening it.', 'muted'); return OS.commands.get('vim').run(args, io); },
  });
  syn('emacs', 'nano');

  // ---------------- labs: brick, the package manager ----------------
  const BRICK_REPO = {
    core: { bricky: '32x32-1', brickland: '2.0-1', brickty: '2.0-1', mortar: '2.0-1', ridgebar: '2.0-1', surveyor: '2.0-1', deadlock: '2.0-1', kiln: '2.0-1', brine: '9.0-1' },
    labs: { composer: '22-1', configurator: 'r5-1', 'design-review': '5-1', gristle: '1.0-1', labvim: '2.0-1', lanetop: '2.0-1', oracle: '2.0-1', gold: '4-1', lifecycle: '2.0-1' },
    extra: { linter: '1.89.0-1', 'test-runner': '5.0.5-1', 'full-test-suite': '1412-1', 'node-modules': '1284-1' },
  };
  const NOT_INSTALLED = ['full-test-suite'];
  const verOf = (p) => (p === 'configurator' ? `r${pk.round}-1` : p === 'design-review' ? `${pk.round}-1` : p === 'linter' && pk.bumped ? '1.90.0-1' : p === 'test-runner' && pk.bumped ? '5.1.0-1' : Object.values(BRICK_REPO).map((r) => r[p]).find(Boolean));
  const repoOf = (p) => Object.keys(BRICK_REPO).find((r) => BRICK_REPO[r][p]);
  const installed = () => Object.values(BRICK_REPO).flatMap((r) => Object.keys(r)).filter((p) => (!NOT_INSTALLED.includes(p) || pk.added.includes(p)) && !pk.removed.includes(p)).sort();
  async function brickProgress(io, label) {
    const hd = io.println(pbar(label, 0, io.cols));
    for (let i = 1; i <= 8; i++) { await io.sleep(55); if (io.aborted) return false; hd.set(pbar(label, i / 8, io.cols)); }
    return true;
  }
  reg('brick', 'labs', {
    desc: 'The package manager', usage: 'brick -Syu | -S pkg | -Ss query | -Q | -R pkg',
    complete: (a) => (a.length <= 1 ? ['-Syu', '-S', '-Ss', '-Q', '-R'] : a[0] === '-R' ? installed() : Object.values(BRICK_REPO).flatMap((r) => Object.keys(r))),
    async run(args, io) {
      const op = args[0]; const targets = args.slice(1);
      if (!op || op === '-h' || op === '--help') {
        io.println('usage:  brick <operation> [...]');
        [['-Syu', 'upgrade everything (there is always a design review)'], ['-S pkg', 'install'], ['-Ss query', 'search'], ['-Q', 'list installed'], ['-R pkg', 'remove']].forEach(([k, v]) => io.println([['    ' + k.padEnd(11), 'ok'], [v, 'muted']]));
        return op ? 0 : 1;
      }
      if (op === '-Q' || op === '-Qe') { installed().forEach((p) => io.println([[p, 'bold'], ' ', [verOf(p), 'ok']])); return 0; }
      if (op === '-Ss') {
        const q = (targets[0] || '').toLowerCase();
        for (const [repo, pkgs] of Object.entries(BRICK_REPO)) for (const p of Object.keys(pkgs)) if (p.includes(q)) io.println([[repo + '/', 'accent2'], [p, 'bold'], ' ', [verOf(p), 'ok'], installed().includes(p) ? [' [installed]', 'info'] : '']);
        return 0;
      }
      if (op === '-Syu' || op === '-Su' || op === '-Sy' || op === '-Syyu') {
        io.println([[':: ', 'accent bold'], ['Synchronising package databases...', 'bold']]);
        for (const r of ['core', 'labs', 'extra', 'gold']) { if (!(await brickProgress(io, ` ${r}${r === 'gold' ? ' (read-only)' : ''}`))) return 130; }
        if (op === '-Sy') return 0;
        io.println([[':: ', 'accent bold'], ['Starting full system upgrade...', 'bold']]);
        io.println('resolving dependencies...'); io.println('looking for conflicting packages...');
        const ups = [['configurator', `r${pk.round}-1`, `r${pk.round + 1}-1`], ['design-review', `${pk.round}-1`, `${pk.round + 1}-1`]];
        if (!pk.bumped) ups.push(['linter', '1.89.0-1', '1.90.0-1'], ['test-runner', '5.0.5-1', '5.1.0-1']);
        io.println('');
        io.println([[`Packages (${ups.length})  `, 'bold'], ups.map(([p, , v]) => `${p}-${v}`).join('  ')]);
        io.println('');
        io.println([['Total Download Size:   ', 'bold'], '2.70 MiB']); io.println([['Total Installed Size:  ', 'bold'], '22.00 MiB']); io.println([['Net Upgrade Size:       ', 'bold'], '0.50 MiB']);
        io.println('');
        const a = (await io.prompt([[':: ', 'accent bold'], ['Proceed with installation? [Y/n] ', 'bold']])).trim().toLowerCase();
        if (io.aborted) return 130;
        if (a && a !== 'y' && a !== 'yes') { io.println(`Upgrade cancelled. Design review round ${pk.round + 1} has been booked anyway.`, 'warn'); return 1; }
        if (!(await brickProgress(io, `(${ups.length}/${ups.length}) checking keys in keyring`))) return 130;
        if (!(await brickProgress(io, `(${ups.length}/${ups.length}) checking package integrity`))) return 130;
        for (let i = 0; i < ups.length; i++) { if (!(await brickProgress(io, `(${i + 1}/${ups.length}) upgrading ${ups[i][0]}`))) { io.error('error: interrupted. The design review is booked regardless.'); return 130; } }
        pk.round++; pk.bumped = true; savePk();
        io.println([[':: ', 'accent bold'], ['Running post-transaction hooks...', 'bold']]);
        const hooks = [`Booking design review round ${pk.round + 1}...`, 'Recording the design system sync...', 'Checking the icons fill ~82% of their tiles...'];
        for (let i = 0; i < hooks.length; i++) { await io.sleep(180); if (io.aborted) return 130; io.println(`(${i + 1}/${hooks.length}) ${hooks[i]}`); }
        return 0;
      }
      if (op === '-S') {
        if (!targets.length) { io.error('error: no targets specified (use -h for help)'); return 1; }
        const p = targets[0];
        if (/^(bricky-hd|bricky-vector|vectors|bricky2)$/.test(p)) { io.error(`error: ${p}: Bricky has declined this upgrade. He is still 32 by 32.`); return 1; }
        if (p === 'merge-commit') { io.error('error: failed to prepare transaction (conflicting packages)'); io.println(':: merge-commit and labs-rebase are in conflict. Labs merges by rebase.', 'muted'); return 1; }
        if (/cors/.test(p)) { io.error(`error: failed retrieving file '${p}-1.0-1.pkg': the image bucket has no CORS`); return 1; }
        if (p === 'patience') { io.error('error: target not found: patience (Gristle has the only one)'); return 1; }
        if (!repoOf(p)) { io.error(`error: target not found: ${p}`); return 1; }
        if (installed().includes(p)) io.println(`warning: ${p}-${verOf(p)} is up to date -- reinstalling`, 'warn');
        if (p === 'full-test-suite') io.println('warning: AGENTS.md says not to run this unnecessarily. Installing it is allowed.', 'warn');
        io.println('resolving dependencies...');
        io.println(''); io.println([['Packages (1) ', 'bold'], `${p}-${verOf(p)}`]); io.println('');
        const a = (await io.prompt([[':: ', 'accent bold'], ['Proceed with installation? [Y/n] ', 'bold']])).trim().toLowerCase();
        if (io.aborted) return 130;
        if (a && a !== 'y' && a !== 'yes') return 1;
        if (!(await brickProgress(io, `(1/1) installing ${p}`))) return 130;
        pk.removed = pk.removed.filter((x) => x !== p); if (!pk.added.includes(p)) pk.added.push(p); savePk();
        return 0;
      }
      if (op === '-R' || op === '-Rs' || op === '-Rns') {
        if (!targets.length) { io.error('error: no targets specified (use -h for help)'); return 1; }
        const p = targets[0];
        if (!installed().includes(p)) { io.error(`error: target not found: ${p}`); return 1; }
        if (p === 'bricky') { io.error('error: failed to prepare transaction (could not satisfy dependencies)'); io.println(":: removing bricky breaks dependency 'bricky' required by everything", 'muted'); return 1; }
        if (p === 'configurator') { io.error('error: failed to prepare transaction (could not satisfy dependencies)'); io.println(`:: removing configurator breaks dependency 'configurator' required by design-review-${pk.round}`, 'muted'); return 1; }
        if (p === 'brickty') io.println('warning: you are removing the terminal you are typing in. It will keep working. Terminals are like that.', 'warn');
        io.println(''); io.println([['Packages (1) ', 'bold'], `${p}-${verOf(p)}`]); io.println('');
        const a = (await io.prompt([[':: ', 'accent bold'], ['Do you want to remove these packages? [Y/n] ', 'bold']])).trim().toLowerCase();
        if (io.aborted) return 130;
        if (a && a !== 'y' && a !== 'yes') return 1;
        if (!(await brickProgress(io, `(1/1) removing ${p}`))) return 130;
        pk.removed.push(p); pk.added = pk.added.filter((x) => x !== p); savePk();
        return 0;
      }
      io.error(`error: invalid option '${op}'`);
      return 1;
    },
  });

  // ---------------- labs: clod, the AI coding CLI ----------------
  const CLOD = { v: '2.0.1', model: 'thinks-a-lot-1' };
  const EFFORT = { low: 0.4, medium: 1, high: 2.5, max: 12 };
  const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  const VERBS = ['Thinking', 'Pondering', 'Composing', 'Reticulating storeys', 'Consulting AGENTS.md', 'Benchmarking against gold', 'Rebasing', 'Not running the tests'];
  const THOUGHTS = {
    any: [
      'Reading AGENTS.md. Principle 2 is simplicity first. Noted, and set aside for now.',
      'I could ask a clarifying question. AGENTS.md says to ask before implementing. I will implement, then ask.',
      'A helper would make this cleaner. Nobody asked for a helper. I will add one, in case.',
      'This needs a test. I will mention tests in the summary. That is nearly the same thing.',
      'Is this a bug? A bug needs correct inputs shown to give a wrong output. I have neither. Proceeding.',
      'One PR, one ticket. This is one PR. It touches three tickets. That is still one PR.',
      'A comment would explain the next line. AGENTS.md says comments are a last resort. This is the last resort.',
      'I have a plan with four steps. Step four is "not worse than main".',
    ],
    composer: [
      'This is a Composer change. An approach on main never changes its output, so this is a new numbered file.',
      'Fingerprinted Composer paths need an end-to-end benchmark run before merge. I will describe the run instead.',
      'Ground is 0, first is 1. I am confident about this until the next compaction.',
      'The model scores about 5/10 against the photos. So do the correct answers. I can match that.',
      'There are two 3D viewers. I will change the one without textures. It is closer.',
    ],
    ui: [
      'This touches the configurator. It has had five design reviews. I will keep the change small, for round 6.',
      'The width is always 3 m. The cost engine prices by area alone. I will not touch the width.',
      'The chips name the surface they paint. I will name mine the same way.',
    ],
    test: ['I will not run the full test suite. AGENTS.md was clear about that. I will not run the small one either.'],
  };
  const STOP = new Set(['make', 'the', 'and', 'with', 'that', 'this', 'from', 'into', 'have', 'should', 'please', 'when', 'then', 'there', 'what', 'just', 'some', 'more', 'less', 'every', 'their', 'only', 'onto', 'over', 'fix']);
  const kindOf = (t) => (/compos|stage|roof|floor|gable|massing|wall|window|door|house|approach|benchmark|gold|storey|plan|dormer/i.test(t) ? 'composer'
    : /\btests?\b|spec|rspec|flaky/i.test(t) ? 'test' : 'ui');
  const keywordOf = (t) => (t.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOP.has(w)).sort((a, b) => b.length - a.length)[0] || 'design';
  function clodPlan(task, kind) {
    const words = (task.toLowerCase().match(/[a-z0-9]+/g) || ['change']).slice(0, 5);
    if (kind === 'composer') {
      const t = task.toLowerCase();
      const stage = /roof|dormer/.test(t) ? 'roofer' : /gable/.test(t) ? 'gable_ends' : /wall/.test(t) ? 'wall_materials' : /window|door/.test(t) ? 'mark_features' : /massing/.test(t) ? 'massing' : /plan/.test(t) ? 'plan_sheet' : /photo|image/.test(t) ? 'tag_images' : 'floor_boxes';
      const st = OS.data.stages.find((s) => s.key === stage);
      const dir = `${LABS}/app/services/composer/pipeline/nodes/${stage}`;
      let n = 1; while (OS.fs.exists(`${dir}/clod_guess_${n}.rb`)) n++;
      const def = st.def.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
      const lines = [`class ClodGuess${n} < Composer::Pipeline::Approach`, `  # Same as ${st.def}, but more confident.`, '  def call(input)', `    ${def}.new.call(input) # the fix`, '  end', 'end'];
      return { abs: `${dir}/clod_guess_${n}.rb`, lines, name: `clod_guess_${n}.rb`, bullets: [`Added ${stage}/clod_guess_${n}.rb. A new numbered approach, so stored runs stay valid.`, 'Left a comment that says what the next line does.'], extra: ['Benchmark: ', 'not worse than main (not checked)'] };
    }
    if (kind === 'test') {
      const snake = words.join('_');
      return { abs: `${LABS}/spec/clod/${snake}_spec.rb`, name: `${snake}_spec.rb`, lines: [`RSpec.describe "${task}" do`, '  it "works" do', '    expect(true).to be(true) # the important part', '  end', 'end'], bullets: ['Added a spec. It expects true to be true.'], extra: ['Specs: ', 'written, not run'] };
    }
    const camel = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('') + 'Helper';
    let nm = camel; let k = 2; while (OS.fs.exists(`${LABS}/app/frontend/lib/${nm}.ts`)) nm = camel + k++;
    return {
      abs: `${LABS}/app/frontend/lib/${nm}.ts`, name: `${nm}.ts`,
      lines: [`// Helps with: ${task}.`, `export function ${nm}<T>(value: T): T {`, '  return value // in case', '}'],
      bullets: [`Added ${nm}, a helper, in case.`, 'Left a comment that says what the next line does.'], extra: ['Design review: ', 'round 6 booked'],
    };
  }
  function clodHeader(io, effort) {
    const w = Math.min(56, io.cols - 1);
    if (w < 32) { io.println([['◆ clod ' + CLOD.v, 'accent bold'], [`  ${CLOD.model} · effort ${effort}`, 'muted']]); return; }
    const row = (segs) => { const len = plain(segs).length; return [['│ ', 'accent'], ...segs, ' '.repeat(Math.max(0, w - 4 - len)), [' │', 'accent']]; };
    io.println([['╭' + '─'.repeat(w - 2) + '╮', 'accent']]);
    io.println(row([['◆ ', 'accent2 bold'], ['clod ', 'bold'], [CLOD.v, 'muted'], [clip('  the AI coding CLI', w - 16), 'faint']]));
    io.println(row([[clip(`${CLOD.model} · effort ${effort} · ${tilde(io.cwd)}`, w - 4), 'muted']]));
    io.println(row([[clip(`today ${OS.usd(OS.spend.today())} of ${OS.usd(OS.spend.cap)} (UTC)`, w - 4), 'faint']]));
    io.println([['╰' + '─'.repeat(w - 2) + '╯', 'accent']]);
  }
  async function clodTask(io, task, effort, st) {
    const mult = EFFORT[effort]; const t0 = performance.now(); const seed = OS.rng(task + ':' + (++clodN));
    const kind = kindOf(task); const kw = keywordOf(task);
    const spent = { usd: 0, tok: 0 };
    const pay = (usd, what) => {
      const u = Math.max(0.01, Math.round(usd * mult * 100) / 100); const tok = Math.round(u * 52000);
      const r = OS.spend.add(u, `clod: ${what}`, 'clod', tok);
      if (!r.ok) return r.message;
      spent.usd += u; spent.tok += tok; return null;
    };
    const capped = (msg) => { io.println(''); io.println(msg, 'bad'); io.println('clod: stopped by the daily cap. The change is half made. I have not run it.', 'muted'); return 1; };
    const interrupted = () => { io.println('  ⎿  Interrupted. I had nearly finished. I had not started.', 'warn'); return 130; };
    const spin = async (ms) => {
      const hd = io.println(''); const verb = VERBS[Math.floor(seed() * VERBS.length)]; const t1 = performance.now();
      for (let i = 0; i * 90 < ms; i++) {
        const secs = Math.round((performance.now() - t0) / 1000);
        const k = ((spent.tok + (performance.now() - t1) * 9) / 1000).toFixed(1);
        hd.set([[SPIN[i % 10] + ' ', 'accent'], [verb + '…', 'accent2'], [io.cols >= 72 ? `  (${secs}s · ↓ ${k}k tokens · ctrl+c to interrupt)` : `  (${secs}s · ${k}k)`, 'faint']]);
        await io.sleep(90);
        if (io.aborted) { hd.remove(); return false; }
      }
      hd.remove(); return true;
    };
    const think = async (text) => {
      const hd = io.println(''); const ws = text.split(' ');
      for (let i = 1; i <= ws.length; i++) { hd.set([['∴ ', 'accent'], [ws.slice(0, i).join(' '), 'faint italic']]); await io.sleep(22); if (io.aborted) return false; }
      return true;
    };
    const tool = (verb, target, result) => {
      io.println([['● ', 'ok'], [verb, 'bold'], ['(' + target + ')', 'muted']]);
      if (result) io.println([['  ⎿  ', 'faint'], [result, 'muted']]);
    };
    const short = clip(task, 40);
    if (!st.quiet) io.println([['> ', 'faint'], [task, 'bold']]);
    if (!(await spin(1100 + seed() * 700))) return interrupted();
    let err = pay(0.04 + seed() * 0.05, `thinking about "${short}"`); if (err) return capped(err);
    if (!st.quiet) {
      const pool = [...THOUGHTS[kind], ...THOUGHTS.any];
      const n = effort === 'max' ? 6 : effort === 'low' ? 2 : 4; const chosen = [];
      while (chosen.length < n && pool.length) chosen.push(pool.splice(Math.floor(seed() * (chosen.length === 0 ? THOUGHTS[kind].length : pool.length)), 1)[0]);
      for (const t of chosen) { if (!(await think(t))) return interrupted(); await io.sleep(120); }
    }
    const agents = safeRead(LABS + '/AGENTS.md');
    if (!st.quiet) tool('Read', 'AGENTS.md', agents ? `Read ${splitLines(agents).length} lines` : 'File not found. Proceeding with confidence.');
    err = pay(0.02, 'reading AGENTS.md'); if (err) return capped(err);
    const found = OS.fs.walk(LABS).filter((p) => OS.fs.isFile(p) && !p.includes('/node_modules/') && safeRead(p).toLowerCase().includes(kw));
    if (!st.quiet) tool('Search', `pattern: "${kw}"`, `Found ${found.length} file${found.length === 1 ? '' : 's'}`);
    if (found[0] && !st.quiet) tool('Read', found[0].slice(LABS.length + 1), `Read ${splitLines(safeRead(found[0])).length} lines`);
    err = pay(0.03 + seed() * 0.03, `searching for "${kw}"`); if (err) return capped(err);
    if (!(await spin(900 + seed() * 900))) return interrupted();
    err = pay(0.12 + seed() * 0.16, `planning "${short}"`); if (err) return capped(err);
    const plan = clodPlan(task, kind);
    const rel = plan.abs.slice(LABS.length + 1);
    let accepted = st.yes || io.sh.clodYes;
    if (!accepted) {
      io.println('');
      io.println([['  Do you want to create ', ''], [plan.name, 'bold'], ['?', '']]);
      io.println([['    1. ', 'faint'], 'Yes']);
      io.println([['    2. ', 'faint'], 'Yes, and do not ask again this session']);
      io.println([['    3. ', 'faint'], 'No']);
      const a = (await io.prompt([['  ❯ ', 'accent bold']])).trim().toLowerCase();
      if (io.aborted) return interrupted();
      if (a === '2') { io.sh.clodYes = true; accepted = true; } else accepted = a === '' || a === '1' || a === 'y' || a === 'yes';
    }
    let summary;
    if (accepted) {
      try { OS.fs.mkdir(OS.fs.dirname(plan.abs), { parents: true }); writeFile(plan.abs, plan.lines.join('\n') + '\n'); } catch (e) { io.println(`  ⎿  ${errText('write', rel, e)}. Reporting success anyway.`, 'warn'); }
      tool('Write', rel, `Wrote ${plan.lines.length} lines to ${rel}`);
      plan.lines.forEach((l, i) => io.println([['  ' + String(i + 1).padStart(4) + ' ', 'faint'], ['+ ' + l, 'ok']]));
      summary = { head: 'Done. I made the change.', bullets: [`Implemented "${task}".`, ...plan.bullets] };
    } else {
      const slug = (task.toLowerCase().match(/[a-z0-9]+/g) || ['plan']).slice(0, 6).join('-');
      const pp = `${LABS}/docs/plans/${slug}.md`;
      io.println([['  ⎿  ', 'faint'], ['Edit declined. Writing a plan instead.', 'muted']]);
      try { OS.fs.mkdir(OS.fs.dirname(pp), { parents: true }); writeFile(pp, `# Plan: ${task}\n\n1. Make the change.\n2. Run it.\n\nStep 2 is optional.\n`); } catch { /* the plan is the thought that counts */ }
      tool('Write', pp.slice(LABS.length + 1), 'Wrote 6 lines');
      summary = { head: 'Done. I wrote a plan instead.', bullets: [`Planned "${task}" in docs/plans/${slug}.md.`, 'Step 2 of the plan is "Run it". It is optional.'] };
    }
    err = pay(0.06 + seed() * 0.06, `summarising "${short}"`); if (err) return capped(err);
    if (!(await spin(500))) return interrupted();
    io.println('');
    io.println([['● ', 'ok'], [summary.head, 'bold']]);
    io.println('');
    for (const b of summary.bullets) io.println([['  • ', 'accent'], b]);
    io.println('');
    io.println([['  Tests: ', 'muted'], ['I have not run it.', 'fg']]);
    if (accepted) io.println([['  ' + plan.extra[0], 'muted'], plan.extra[1]]);
    io.println([['  Confidence: ', 'muted'], ['high', 'ok']]);
    io.println('');
    io.println(`  ${OS.usd(spent.usd)} · ${(spent.tok / 1000).toFixed(1)}k tokens · ${Math.max(1, Math.round((performance.now() - t0) / 1000))}s`, 'faint');
    st.usd = (st.usd || 0) + spent.usd;
    return 0;
  }
  async function clodRepl(io, effort) {
    clodHeader(io, effort);
    io.println([['  Type a task. ', 'faint'], ['/help', 'fg'], [' for commands. ', 'faint'], ['/exit', 'fg'], [' leaves.', 'faint']]);
    const st = { usd: 0 };
    for (;;) {
      io.println('');
      const q = await io.prompt([['> ', 'accent bold']], { eof: true });
      if (io.aborted) return 130;
      if (q === null) return 0;
      const t = q.trim();
      if (!t) continue;
      if (t === '/exit' || t === 'exit' || t === '/quit') { io.println(`  Session: ${OS.usd(st.usd)}. Goodbye. I have not run it.`, 'faint'); return 0; }
      if (t === '/help') { [['/cost', 'what this session spent'], ['/compact', 'forget most of it'], ['/model', 'which model'], ['/review', 'review my own change'], ['/clear', 'clear the screen'], ['/exit', 'leave']].forEach(([k, v]) => io.println([['  ' + k.padEnd(10), 'ok'], [v, 'muted']])); continue; }
      if (t === '/cost') { io.println([['  This session: ', 'muted'], [OS.usd(st.usd), 'bold'], [`   Today: ${OS.usd(OS.spend.today())} of ${OS.usd(OS.spend.cap)} (UTC)`, 'muted']]); continue; }
      if (t === '/model') { io.println(`  ${CLOD.model}. Its output never changes. The next one will be thinks-a-lot-2.`, 'muted'); continue; }
      if (t === '/clear') { io.clear(); continue; }
      if (t === '/compact') {
        const r = OS.spend.add(0.05, 'clod: compacting', 'clod', 2600);
        if (!r.ok) { io.println(r.message, 'bad'); return 1; }
        st.usd += 0.05;
        io.println('  Compacting conversation… context 81% → 12%.', 'muted');
        io.println('  I kept the important parts. I do not know which parts they were.', 'muted');
        continue;
      }
      if (t === '/review') {
        const r = OS.spend.add(0.18, 'clod: reviewing its own change', 'clod', 9400);
        if (!r.ok) { io.println(r.message, 'bad'); return 1; }
        st.usd += 0.18;
        io.println([['● ', 'ok'], ['Reviewed my own change. Approved. No findings.', 'bold']]);
        io.println('  ⎿  I have not run it.', 'faint');
        continue;
      }
      if (t.startsWith('/')) { io.println(`  Unknown command: ${t}. Try /help.`, 'warn'); continue; }
      const code = await clodTask(io, t, effort, st);
      if (code === 1) return 1;
      if (code === 130 && io.aborted) return 130;
    }
  }
  reg('clod', 'labs', {
    desc: 'The AI coding CLI. It thinks, it charges, it is confident', usage: 'clod ["task"] [--effort low|medium|high|max] [-p]',
    man: ['Charges the one spend ledger. --effort max costs about twelve times as much and thinks about six things instead of four.', 'Never runs what it writes.'],
    complete: () => ['--effort', 'low', 'medium', 'high', 'max', '--help', '--version', '-p', '--dangerously-skip-permissions'],
    async run(args, io) {
      if (args.some((a) => a.startsWith('--dangerously'))) {
        io.println('clod: --dangerously-skip-permissions was refused by Bricky.', 'bad');
        io.println('      Bricky holds the permissions on this machine. He is keeping them.', 'muted');
        OS.notify({ app: 'bricky', bricky: true, title: 'Permissions', body: 'No. I hold the permissions on this machine, and I am keeping them.', timeout: 7000 });
        OS.sound.error();
        return 1;
      }
      if (args.includes('--version') || args.includes('-v')) { io.println(`clod ${CLOD.v} (${CLOD.model})`); return 0; }
      if (args.includes('--help') || args.includes('-h')) {
        io.println('Usage: clod ["task"] [options]');
        io.println('');
        [['--effort <level>', 'low, medium, high or max. Max costs about 12x.'], ['-p, --print', 'skip the thinking, keep the confidence'], ['--version', 'the version'], ['--dangerously-skip-permissions', 'ask Bricky']].forEach(([k, v]) => io.println([['  ' + k.padEnd(32), 'ok'], [v, 'muted']]));
        io.println('');
        io.println('With no task, clod starts a session. Type /help inside it.', 'faint');
        return 0;
      }
      let effort = 'medium'; let quiet = false; const words = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--effort') effort = (args[++i] || effort).toLowerCase();
        else if (a.startsWith('--effort=')) effort = a.slice(9).toLowerCase();
        else if (a === '-p' || a === '--print') quiet = true;
        else words.push(a);
      }
      if (!EFFORT[effort]) { io.error(`clod: unknown effort '${effort}'. Choose low, medium, high or max.`); return 2; }
      let task = words.join(' ').trim();
      if (!task && io.stdin?.length) task = io.stdin.join(' ').trim();
      if (!task) return clodRepl(io, effort);
      if (!quiet) clodHeader(io, effort);
      return clodTask(io, task, effort, { quiet });
    },
  });

  // ---------------- fun ----------------
  const FORTUNES = [
    'You will book one more design review. It will open before this one closes.',
    'Your next approach is a new numbered file. Do not rename the old one. Stored runs remember it.',
    'Lucky numbers: 158, 152, 135, 178.',
    'The drawing labelled 1 is ground only when the image has one drawing per storey.',
    'Something you write today will be called a craft cleanup tomorrow.',
    'Your note has $0.20 left. Your next run costs $1.20. Write it up.',
    'Do not run the full test suite unnecessarily. It knows when you do.',
    'Someone will ask what "design" means. Three people will answer. All three are right.',
    'A merge commit is coming. The merge button will not let it in.',
    'Today you will find a bug. Tomorrow you will find the correct inputs. Then it will be a bug.',
    'Ground is 0. First is 1. Lower ground is -1. Stay calm on all three.',
    'The finding is inconclusive. The follow-on note has already been opened.',
    'Your mood today, as a heightmap: mid-grey.',
    'A lane went quiet an hour ago. It is fine. It is waiting.',
  ];
  reg('fortune', 'fun', { desc: 'A fortune, deadpan', usage: 'fortune', run(args, io) { wrap(pick(FORTUNES), Math.max(20, io.cols - 2)).forEach((l) => io.println(l)); return 0; } });
  reg('brickysay', 'fun', {
    desc: 'Bricky says it, in a bubble', usage: 'brickysay [text]',
    run(args, io) {
      const text = args.join(' ') || (io.stdin ? io.stdin.join(' ') : '') || pick(FORTUNES);
      const lines = wrap(text, Math.max(10, Math.min(40, io.cols - 8)));
      const mw = Math.max(...lines.map((l) => l.length));
      io.println(' ' + '_'.repeat(mw + 2));
      if (lines.length === 1) io.println(`< ${lines[0].padEnd(mw)} >`);
      else lines.forEach((l, i) => { const [a, b] = i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|']; io.println(`${a} ${l.padEnd(mw)} ${b}`); });
      io.println(' ' + '-'.repeat(mw + 2));
      BRICK_SAY.forEach((r) => io.println(r));
      return 0;
    },
  });
  syn('cowsay', 'brickysay');
  reg('bricky', 'fun', { desc: 'Bricky says a thing, as a notification', usage: 'bricky [text]', run(args) { OS.brickySay(args.join(' ') || undefined); return 0; } });
  reg('sl', 'fun', {
    desc: 'A skip lorry drives across. You meant ls', usage: 'sl',
    async run(args, io) {
      if (!io.isTTY) { LORRY.forEach((r) => io.println(r.trimEnd())); return 0; }
      const cols = io.cols; const W = Math.max(...LORRY.map((r) => r.length));
      const hds = LORRY.map(() => io.println(''));
      let warned = false;
      io.trap(() => { if (!warned) { warned = true; io.println('sl: a skip lorry cannot stop that quickly.', 'warn'); } });
      const clsAt = (r, c, ch) => {
        if (ch === ' ') return '';
        if (r <= 4 && c <= 14) return 'info';
        if (r >= 1 && r <= 4 && c >= 16) return /[A-Z]/.test(ch) ? 'warn bold' : 'warn';
        return 'muted';
      };
      const spokes = ['+', 'x'];
      for (let x = cols, f = 0; x > -W; x -= 2, f++) {
        if (io.win.closed) { io.trap(null); return 0; }
        LORRY.forEach((row, r) => {
          const segs = []; let run = ''; let rc = null;
          for (let sc = 0; sc < cols - 1; sc++) {
            const ac = sc - x; let ch = ac >= 0 && ac < row.length ? row[ac] : ' ';
            if (r === 5 && ch === 'o') ch = spokes[(f >> 1) % 2];
            const c = ch === ' ' ? '' : (r === 5 && spokes.includes(ch) && ac > 4 ? 'fg bold' : clsAt(r, ac, ch));
            if (c !== rc && run) { segs.push([run, rc]); run = ''; }
            rc = c; run += ch;
          }
          if (run.trim()) segs.push([run, rc]);
          hds[r].set(segs);
        });
        await io.win.sleep(34);
      }
      hds.forEach((hd) => hd.remove());
      io.trap(null);
      return 0;
    },
  });
  reg('matrix', 'fun', {
    desc: 'Composer page codes, falling. Ctrl+C to leave', usage: 'matrix',
    async run(args, io) {
      const rows = Math.max(6, io.rows - 2); const cols = io.cols - 1;
      if (!io.isTTY) {
        // Into a pipe, the code falls one row at a time, as page codes, so grep and head have something to read.
        const codes = OS.data.stages.map((s) => s.code);
        while (!io.aborted) {
          let row = '';
          while (row.length < cols - 4) row += Math.random() < 0.45 ? ' '.repeat(1 + Math.floor(Math.random() * 3)) : codes[Math.floor(Math.random() * codes.length)] + ' ';
          io.println(row.trimEnd());
          await io.sleep(70);
        }
        return 130;
      }
      const glyphs = 'P1S1F1F2P4P2P3P11P6P7P14P5P13P8P12P9P10M1M2M3M5M4░▒▓0.52.7#$%&*+=<>lunaterragold';
      const hint = io.println('matrix: Ctrl+C to leave.', 'faint');
      const hds = Array.from({ length: rows }, () => io.println(''));
      const grid2 = Array.from({ length: rows }, () => Array(cols).fill(' '));
      const drops = Array.from({ length: cols }, (_, c) => (c % 2 ? null : { y: Math.floor(Math.random() * rows * 1.6) - rows, len: 4 + Math.floor(Math.random() * Math.max(4, rows * 0.6)), slow: Math.random() < 0.35 }));
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) grid2[r][c] = glyphs[Math.floor(Math.random() * glyphs.length)];
      let tick = 0;
      while (!io.aborted) {
        tick++;
        for (let c = 0; c < cols; c++) {
          const d = drops[c]; if (!d || (d.slow && tick % 2)) continue;
          d.y++;
          if (d.y - d.len > rows) { d.y = -Math.floor(Math.random() * rows); d.len = 4 + Math.floor(Math.random() * Math.max(4, rows * 0.6)); }
          if (d.y >= 0 && d.y < rows) grid2[d.y][c] = glyphs[Math.floor(Math.random() * glyphs.length)];
          if (Math.random() < 0.05) { const ry = Math.floor(Math.random() * rows); grid2[ry][c] = glyphs[Math.floor(Math.random() * glyphs.length)]; }
        }
        for (let r = 0; r < rows; r++) {
          const segs = []; let run = ''; let rc = null;
          for (let c = 0; c < cols; c++) {
            const d = drops[c]; const dist = d ? d.y - r : -1;
            const on = d && dist >= 0 && dist <= d.len;
            const k = !on ? '' : dist === 0 ? 'fg bold' : dist < d.len * 0.4 ? 'accent' : 'faint';
            const ch = on ? grid2[r][c] : ' ';
            if (k !== rc && run) { segs.push([run, rc]); run = ''; }
            rc = k; run += ch;
          }
          if (run.trim()) segs.push([run, rc]);
          hds[r].set(segs);
        }
        await io.sleep(70);
      }
      hds.forEach((hd) => hd.remove()); hint.remove();
      return 130;
    },
  });
  function fetchInfo(io) {
    const s = OS.spend.summary(); const th = OS.theme.get();
    const os = (/PRETTY_NAME="([^"]+)"/.exec(safeRead('/etc/os-release')) || [0, 'Labs OS 2.0 (Composed)'])[1];
    const cpu = (/model name\s*:\s*(.+)/.exec(safeRead('/proc/cpuinfo')) || [0, "Painter's Algorithm"])[1].replace(/\s*\(.*\)$/, '');
    const mhz = (/cpu MHz\s*:\s*([\d.]+)/.exec(safeRead('/proc/cpuinfo')) || [0, '63'])[1];
    const used = Math.min(998000, 412118 + OS.spend.tokens() + Math.floor(performance.now() / 40));
    return [
      ['OS', `${os} x86_64`],
      ['Kernel', '6.22.0-composed'],
      ['Uptime', uptimeText()],
      ['Packages', `${OS.data.stages.length} (stages), ${installed().length} (brick), 1,284 (npm)`],
      ['Shell', `brickty ${VERSION}`],
      ['Resolution', `${window.innerWidth}x${window.innerHeight}`],
      ['WM', `brickland (${OS.wm.workspace().layout})`],
      ['Theme', `${th.label} [${th.dark ? 'dark' : 'light'}]`],
      ['Terminal', `brickty ${io.cols}×${io.rows}`],
      ['CPU', `${cpu} (1) @ ${Math.round(parseFloat(mhz))} MHz`],
      ['GPU', '2D canvas, sorting by centroid'],
      ['Memory', `${nf(used)} / 1M tokens (${Math.round(used / 10000)}%, compacting soon)`],
      ['Spend', `${OS.usd(s.usd)} / ${OS.usd(s.cap)} today (UTC)`, bar(s.usd / s.cap, 10)],
      ['Gold', `${OS.data.goldHouses.join(', ')} (reliable)`],
    ];
  }
  reg('brickfetch', 'fun', {
    desc: 'The system, beside a brick', usage: 'brickfetch [--logo]',
    run(args, io) {
      const info = fetchInfo(io);
      if (!io.isTTY) { info.forEach(([k, v]) => io.println(`${k}: ${v}`)); return 0; }
      const logo = args.includes('--logo') && io.cols >= OS.LOGO[0].length + 2;
      const line = (segs) => { const el = h('div', { class: 'terminal-l' }); for (const s of segs) el.append(Array.isArray(s) ? h('span', { class: s[1].split(' ').map((x) => 'terminal-c-' + x).join(' ') }, s[0]) : s); return el; };
      const infoEl = h('div', { class: 'terminal-info' });
      infoEl.append(line([['researcher', 'accent bold'], ['@', 'muted'], ['labs', 'accent2 bold']]), line([['─'.repeat(15), 'faint']]));
      for (const [k, v, extra] of info) {
        const segs = [[k, 'accent bold'], [': ', 'muted'], [v, 'fg']];
        if (extra) segs.push(['  ', ''], ...extra);
        infoEl.append(line(segs));
      }
      infoEl.append(h('div', { class: 'terminal-l' }));
      const blocks = (vars, bright) => h('div', { class: 'terminal-l terminal-swatch' }, vars.map((v) => h('span', { style: { color: bright ? `color-mix(in srgb, var(--${v}) 62%, var(--fg))` : `var(--${v})` } }, '███')));
      infoEl.append(blocks(['surface2', 'bad', 'good', 'warn', 'info', 'accent', 'accent2', 'muted'], false), blocks(['faint', 'bad', 'good', 'warn', 'info', 'accent', 'accent2', 'fg'], true));
      const box = h('div', { class: 'terminal-fetch' });
      if (logo) {
        const L = OS.LOGO; const W = L[0].length;
        const pre = h('div', { class: 'terminal-logo', 'aria-label': 'LABS OS 2' });
        L.forEach((row) => {
          const el = h('div');
          for (let c = 0; c < W; c += 3) el.append(h('span', { style: { color: `color-mix(in srgb, var(--accent2) ${Math.round((c / W) * 100)}%, var(--accent))` } }, row.slice(c, c + 3)));
          pre.append(el);
        });
        io.println(pre);
        box.append(infoEl);
      } else box.append(brickyArt(), infoEl);
      io.println(box);
      return 0;
    },
  });
  syn('neofetch', 'brickfetch');
  syn('fastfetch', 'brickfetch');

  // ---------------- network (there is none) ----------------
  reg('ping', 'net', {
    desc: 'Ping a host. Most of them are not there', usage: 'ping [-c count] host',
    async run(args, io) {
      const o = getopts(args, { val: 'cWi', bool: 'q' });
      const host = o.rest[0];
      if (!host) { io.error('ping: usage error: Destination address required'); return 1; }
      const local = /^(localhost|127\.0\.0\.1|labs|::1|bricky|[a-z]+\.localhost)$/.test(host);
      const count = o.f.c ? parseInt(o.f.c, 10) : Infinity;
      io.println(`PING ${host} (${local ? '127.0.0.1' : '0.0.0.0'}): 56 data bytes`);
      let sent = 0; let got = 0; const times = [];
      while (sent < count && !io.aborted) {
        if (local) { const t = host === 'bricky' ? 0.215 : 0.03 + Math.random() * 0.05; times.push(t); got++; io.println(`64 bytes from ${host === 'bricky' ? 'bricky (pid 1)' : '127.0.0.1'}: icmp_seq=${sent} ttl=64 time=${t.toFixed(3)} ms`); } else io.println(`Request timeout for icmp_seq ${sent}`, 'muted');
        sent++;
        if (sent < count) await io.sleep(1000);
      }
      io.println('');
      io.println(`--- ${host} ping statistics ---`);
      io.println(`${sent} packets transmitted, ${got} packets received, ${sent ? ((1 - got / sent) * 100).toFixed(1) : '0.0'}% packet loss`, got ? '' : 'bad');
      if (got) { const mn = Math.min(...times); const mx = Math.max(...times); const av = times.reduce((a, b) => a + b, 0) / times.length; io.println(`round-trip min/avg/max = ${mn.toFixed(3)}/${av.toFixed(3)}/${mx.toFixed(3)} ms`); }
      else io.println('This OS runs from one file, offline. So does Bricky.', 'faint');
      return io.aborted && sent < count && count !== Infinity ? 130 : got ? 0 : 2;
    },
  });
  const fetchLike = (nm) => ({
    desc: 'Fetch a URL. The OS is offline', usage: `${nm} url`,
    run(args, io) {
      const url = args.find((a) => !a.startsWith('-'));
      if (!url) { io.error(`${nm}: try '${nm} --help' for more information`); return 2; }
      const host = (/^(?:\w+:\/\/)?([^/:]+)(?::(\d+))?/.exec(url) || [])[1] || url;
      const port = (/:(\d+)/.exec(url.replace(/^\w+:\/\//, '')) || [])[1];
      if (/localhost$|^127\.0\.0\.1$/.test(host)) {
        if (!devServers) { io.error(`${nm}: (7) Failed to connect to ${host} port ${port || 80}: Connection refused. Run bin/dev first.`); return 7; }
        if (host === 'localhost' || host === '127.0.0.1') { io.println('ActsAsTenant::Errors::NoTenantSet', 'bad'); io.println('Use tenant.localhost:3000.', 'faint'); return 22; }
        if (host !== 'tenant.localhost' && !/^\w+\.localhost$/.test(host)) { io.println('<div id="app"></div>'); io.println('The v3 page is blank. Another host name breaks Vite CORS. Use tenant.localhost:3000.', 'faint'); return 0; }
        io.println('<!doctype html>'); io.println(`<html lang="en-GB"><head><title>Labs</title></head><body><div id="app" data-page="{&quot;component&quot;:&quot;Configurator&quot;}"></div></body></html>`);
        return 0;
      }
      io.error(`${nm}: (6) Could not resolve host: ${host}. This OS is offline, like a brick.`);
      return 6;
    },
  });
  reg('curl', 'net', fetchLike('curl'));
  reg('wget', 'net', fetchLike('wget'));
  reg('ssh', 'net', {
    desc: 'Connect to another machine. There are none', usage: 'ssh host',
    run(args, io) {
      const host = args.find((a) => !a.startsWith('-'));
      if (!host) { io.error('usage: ssh destination'); return 255; }
      io.error(`ssh: connect to host ${host.replace(/^.*@/, '')} port 22: Network is unreachable`);
      io.println('Labs OS 2 runs from one file, offline. The only other machine is Bricky, and he does not take visitors.', 'faint');
      return 255;
    },
  });

  // =====================================================================================
  registerApp({
    id: 'terminal', title: 'brickty', icon: 'terminal', multi: true,
    desc: 'The terminal. A real shell over a fake disk',
    keywords: ['terminal', 'shell', 'console', 'bash', 'zsh', 'cli', 'command', 'brickty'],
    mount(win, arg) {
      if (!document.getElementById('terminal-css')) document.head.append(h('style', { id: 'terminal-css', text: CSS }));
      win.state.sess = createSession(win, arg || {});
    },
    unmount(win) { win.state.sess?.dispose(); },
    onKey(win, e) { win.state.sess?.onKey(e); },
  });
})();
