// lanetop: a btop-style monitor of agent lanes. A canvas character grid: box drawing, braille graphs and meters are drawn
// as shapes, not font glyphs, so every border joins and every graph lines up whatever monospace font the machine has.
(() => {
  const { h } = OS;

  // ---------- the character grid ----------
  // Box-drawing characters as segments: l r u d, and c for a rounded corner.
  const BOX = { '─': 'lr', '│': 'ud', '┌': 'rd', '┐': 'ld', '└': 'ru', '┘': 'lu', '├': 'udr', '┤': 'udl', '┬': 'lrd', '┴': 'lru', '┼': 'udlr', '╭': 'rdc', '╮': 'ldc', '╰': 'ruc', '╯': 'luc' };
  const BRAILLE = [[0, 0, 0x01], [0, 1, 0x02], [0, 2, 0x04], [1, 0, 0x08], [1, 1, 0x10], [1, 2, 0x20], [0, 3, 0x40], [1, 3, 0x80]];
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

  function makeGrid() {
    const g = { cols: 0, rows: 0, ch: [], fg: [], bg: [], bold: new Uint8Array(0), hits: [] };
    g.resize = (c, r) => {
      g.cols = c; g.rows = r; const n = c * r;
      g.ch = new Array(n).fill(' '); g.fg = new Array(n).fill(null); g.bg = new Array(n).fill(null); g.bold = new Uint8Array(n);
    };
    g.clear = () => { g.ch.fill(' '); g.fg.fill(null); g.bg.fill(null); g.bold.fill(0); g.hits.length = 0; };
    // Write s at (x, y). bg undefined keeps the cell's background. Returns the x after the text.
    g.put = (x, y, s, fg, bg, bold) => {
      s = String(s);
      if (y < 0 || y >= g.rows) return x + s.length;
      for (let i = 0; i < s.length; i++, x++) {
        if (x < 0 || x >= g.cols) continue;
        const k = y * g.cols + x;
        g.ch[k] = s[i]; g.fg[k] = fg; g.bold[k] = bold ? 1 : 0;
        if (bg !== undefined) g.bg[k] = bg;
      }
      return x;
    };
    g.fillBg = (x, y, w, hh, bg) => {
      for (let yy = Math.max(0, y); yy < Math.min(g.rows, y + hh); yy++) {
        for (let xx = Math.max(0, x); xx < Math.min(g.cols, x + w); xx++) g.bg[yy * g.cols + xx] = bg;
      }
    };
    g.hit = (x, y, w, hh, fn, key) => g.hits.push({ x, y, w, h: hh, fn, key });
    return g;
  }

  const fit = (s, n) => { s = String(s); if (n <= 0) return ''; return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s.padEnd(n); };
  const rfit = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n) : s.padStart(n); };

  function measure(win, S) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(win.body.clientWidth * dpr)); const H = Math.max(1, Math.round(win.body.clientHeight * dpr));
    const css = win.body.clientWidth < 1000 ? 12 : 13;
    const fontPx = Math.round(css * dpr);
    const family = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace';
    const ctx = S.ctx;
    ctx.font = `400 ${fontPx}px ${family}`;
    const adv = ctx.measureText('MMMMMMMMMM').width / 10;
    const cw = Math.ceil(adv); const chh = Math.round(fontPx * 1.42);
    const lw = Math.max(1, Math.round(dpr));
    const d = Math.max(1, Math.round(cw * 0.26));
    const sq = Math.max(2, Math.round(cw * 0.66));
    const cols = Math.floor(W / cw); const rows = Math.floor(H / chh);
    return {
      dpr, W, H, fontPx, family, cw, chh, lw, cols, rows, adv,
      ox: Math.floor((W - cols * cw) / 2), oy: Math.floor((H - rows * chh) / 2),
      ls: 'letterSpacing' in ctx ? `${(cw - adv).toFixed(3)}px` : null,
      dot: d, bx: [Math.round(cw * 0.27 - d / 2), Math.round(cw * 0.73 - d / 2)],
      by: [0, 1, 2, 3].map((r) => Math.round(chh * (0.14 + r * 0.24) - d / 2)),
      sq: { x: Math.round((cw - sq) / 2), y: Math.round((chh - sq) / 2), w: sq, h: sq },
      band: { y: Math.round(chh * 0.36), h: Math.max(2, Math.round(chh * 0.28)) },
      tyOff: Math.round(dpr), widths: new Map(),
    };
  }

  function drawBox(ctx, spec, px, py, m, fg) {
    const { cw, chh, lw } = m;
    const cx = px + Math.floor((cw - lw) / 2); const cy = py + Math.floor((chh - lw) / 2);
    if (spec.endsWith('c')) {
      const r = Math.max(2, Math.floor(Math.min(cw, chh) / 2));
      const hx = cx + lw / 2; const hy = cy + lw / 2;
      const ex = spec.includes('r') ? px + cw : px; const ey = spec.includes('d') ? py + chh : py;
      ctx.strokeStyle = fg; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(hx, ey); ctx.arcTo(hx, hy, ex, hy, r); ctx.lineTo(ex, hy); ctx.stroke();
      return;
    }
    if (spec.includes('l')) ctx.fillRect(px, cy, cx - px + lw, lw);
    if (spec.includes('r')) ctx.fillRect(cx, cy, px + cw - cx, lw);
    if (spec.includes('u')) ctx.fillRect(cx, py, lw, cy - py + lw);
    if (spec.includes('d')) ctx.fillRect(cx, cy, lw, py + chh - cy);
  }

  function paint(ctx, g, m, C) {
    const { cw, chh, ox, oy } = m;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, m.W, m.H);
    for (let y = 0; y < g.rows; y++) {
      let x = 0;
      while (x < g.cols) {
        const b = g.bg[y * g.cols + x];
        if (!b) { x++; continue; }
        let x2 = x + 1; while (x2 < g.cols && g.bg[y * g.cols + x2] === b) x2++;
        ctx.fillStyle = b; ctx.fillRect(ox + x * cw, oy + y * chh, (x2 - x) * cw, chh);
        x = x2;
      }
    }
    let font = -1;
    const setFont = (b) => { if (font !== b) { ctx.font = `${b ? 700 : 400} ${m.fontPx}px ${m.family}`; font = b; } };
    ctx.textBaseline = 'middle';
    if (m.ls) ctx.letterSpacing = m.ls;
    for (let y = 0; y < g.rows; y++) {
      const py = oy + y * chh; const ty = py + chh / 2 + m.tyOff;
      let x = 0;
      while (x < g.cols) {
        const k = y * g.cols + x; const c = g.ch[k];
        if (c === ' ') { x++; continue; }
        const code = c.charCodeAt(0); const fg = g.fg[k] || C.fg; const px = ox + x * cw;
        if (code > 0x20 && code < 0x7f) {
          const b = g.bold[k]; let x2 = x + 1;
          while (x2 < g.cols) {
            const k2 = y * g.cols + x2; const cc = g.ch[k2].charCodeAt(0);
            if (cc < 0x20 || cc >= 0x7f || g.fg[k2] !== g.fg[k] || g.bold[k2] !== b) break;
            x2++;
          }
          setFont(b); ctx.fillStyle = fg;
          let s = ''; for (let i = x; i < x2; i++) s += g.ch[y * g.cols + i];
          if (m.ls) ctx.fillText(s.trimEnd(), px, ty);
          else for (let i = 0; i < s.length; i++) if (s[i] !== ' ') ctx.fillText(s[i], px + i * cw, ty);
          x = x2; continue;
        }
        ctx.fillStyle = fg;
        if (BOX[c]) drawBox(ctx, BOX[c], px, py, m, fg);
        else if (code >= 0x2800 && code <= 0x28ff) {
          const bits = code - 0x2800;
          for (const [bc, br, bit] of BRAILLE) if (bits & bit) ctx.fillRect(px + m.bx[bc], py + m.by[br], m.dot, m.dot);
        } else if (c === '■') ctx.fillRect(px + m.sq.x, py + m.sq.y, m.sq.w, m.sq.h);
        else if (c === '▬') ctx.fillRect(px, py + m.band.y, cw, m.band.h);
        else if (code >= 0x2581 && code <= 0x2588) { const hh = Math.round(chh * (code - 0x2580) / 8); ctx.fillRect(px, py + chh - hh, cw, hh); } else {
          const b = g.bold[k]; setFont(b);
          const key = c + b; let w = m.widths.get(key);
          if (w == null) { if (m.ls) ctx.letterSpacing = '0px'; w = ctx.measureText(c).width; if (m.ls) ctx.letterSpacing = m.ls; m.widths.set(key, w); }
          if (m.ls) ctx.letterSpacing = '0px';
          ctx.fillText(c, px + (cw - w) / 2, ty);
          if (m.ls) ctx.letterSpacing = m.ls;
        }
        x++;
      }
    }
    if (m.ls) ctx.letterSpacing = '0px';
  }

  // ---------- colours ----------
  function gradient(stops, n = 24) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1); const seg = t * (stops.length - 1); const j = Math.min(stops.length - 2, Math.floor(seg));
      arr.push(OS.theme.mix(stops[j], stops[j + 1], seg - j));
    }
    return (t) => arr[Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))))];
  }
  function colours() {
    const t = OS.theme.colors(); const mix = OS.theme.mix;
    const C = { ...t };
    C.hot = gradient([t.good, t.warn, t.bad]);
    C.cool = gradient([t.info, t.accent, t.accent2]);
    C.empty = mix(t.faint, t.bg, 0.55);
    C.rule = mix(t.border, t.faint, 0.35);
    C.edge = (c) => mix(c, t.bg, 0.38);
    C.hover = mix(t.sel, t.bg, 0.45);
    C.state = { spawning: t.info, building: t.accent, reviewing: t.accent2, ci: t.warn, stalled: t.bad, done: t.good, killed: t.faint };
    return C;
  }

  // ---------- facts and lines ----------
  const STATE_LABEL = { spawning: 'spawning', building: 'building', reviewing: 'reviewing', ci: 'waiting on CI', stalled: 'stalled', done: 'done', killed: 'killed' };
  const TOK = { spawning: [45, 20], building: [95, 40], reviewing: [185, 70], ci: [2, 2], stalled: [0, 0], done: [0, 0], killed: [0, 0] };
  const DUR = { spawning: [3, 5], building: [10, 22], reviewing: [7, 14], ci: [8, 16], done: [24, 30], killed: [1.4, 1.4], stalled: [Infinity, Infinity] };
  const WAITS = ['gh pr checks --watch', 'bin/rspec_all, in the background', 'a reviewer subagent', 'npm run check:ci', 'a CI watch on a cancelled run', 'sleep 300 && gh pr view'];
  const SAYS = {
    spawning: ['Reading AGENTS.md.', 'Reading CLAUDE.md, which says to read AGENTS.md.'],
    building: ['Running only the specs for the files I changed.', 'Rebasing on main. No merge commits.', 'craft cleanup', 'Writing the failing test first.', 'bundle exec standardrb --fix', 'Touching only what the card asks for.'],
    reviewing: ['Spec compliance: passed.', 'Craft review: one comment restates the code.', 'Production review: no blocking findings.', 'Gristle: 4 findings, 1 of them grumpy.'],
    ci: ['Frontend Checks: 14 of 15. The 15th is the design-sync gate.', 'RSpec: 2 of 8 shards done.', 'Waiting for the Lookbook coverage check.'],
    stalled: ['I will check back when CI finishes.', 'I will continue once the specs finish.', 'Waiting for the background job to report back.'],
    done: ['Merged by rebase. Not worse than main.'],
    killed: ['(no reply)'],
  };
  const COMPACT = [
    ['the card number', 'why'], ['the Build spec', 'the three things it had already tried'], ['AGENTS.md', 'the reason it was reading it'],
    ['the branch name', 'which branch it is on'], ['a summary of the summary', 'the summary'], ['the acceptance criteria', 'which ones pass'],
  ];
  const REVIEW_BACK = ['the craft review found 3 things. Back to building.', 'Gristle had notes. Some of them were fair.', 'spec review says one acceptance criterion is untested.', 'production review wants a test, not a comment.'];
  const CI_BACK = ['Frontend Checks failed: the design system is out of date.', 'one flaky spec. It will pass on retry. Nobody will learn anything.', 'Lookbook coverage: a component has no preview.', 'a merge commit blocks the merge button. Rebasing.'];
  const titles = () => OS.data.commits.filter((c) => !/^(craft cleanup|record the design system sync|drop a confusing spec comment)$/.test(c) && !/^Bump /.test(c) && c.length <= 76);
  const slug = (s) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 4).join('-');
  const fmtAge = (s) => { s = Math.max(0, Math.floor(s)); if (s < 60) return s + 's'; if (s < 3600) return Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0'); return Math.floor(s / 3600) + 'h' + String(Math.floor(s / 60) % 60).padStart(2, '0'); };
  const fmtTok = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n)));
  const clock = () => OS.now().toTimeString().slice(0, 8);
  const CTX_MAX = 200000;
  const DISK_GB = 200;

  // ---------- the simulation ----------
  function makeSim(rnd) {
    const S = {
      t: 0, rate: 1000, lanes: [], sel: 0, scroll: 0, log: [], total: [], peak: 0, nextCard: 2750, nextPr: 2604,
      disk: 74.2, diskShown: 74.2, alert80: false, alert90: false, pruning: null, full: false, reaped: 0, reportedGone: 0, hover: null,
      titlePool: titles(), lastAuto: 0,
    };
    const between = ([a, b]) => a + rnd() * (b - a);
    S.say = (lane) => OS.pick(SAYS[lane.state], rnd);
    S.enter = (lane, state) => {
      lane.prev = lane.state; lane.state = state; lane.since = S.t; lane.dur = between(DUR[state]);
      lane.msg = S.say(lane);
      if (state === 'stalled') { lane.wait = OS.pick(WAITS, rnd); lane.stalledAt = S.t; }
      if (state === 'reviewing' && !lane.pr) lane.pr = S.nextPr++;
    };
    S.newLane = (n, state, age) => {
      if (!S.titlePool.length) S.titlePool = titles();
      const title = S.titlePool.splice(Math.floor(rnd() * S.titlePool.length), 1)[0];
      const lane = {
        pid: 30000 + Math.floor(rnd() * 39000), n, name: 'lane-' + n, card: 'RL-' + n, title,
        state, prev: null, since: S.t - rnd() * 6, dur: 0, tok: TOK[state][0], tokT: TOK[state][0], hist: [], ctx: CTX_MAX * (0.12 + rnd() * 0.6),
        ctxShown: 0, compactUntil: 0, states: [], spent: age * 0.0016 * (0.6 + rnd()), born: S.t - age, pr: null, msg: '', wait: '', stalledAt: S.t,
      };
      lane.ctxShown = lane.ctx;
      S.enter(lane, state);
      lane.since = S.t - rnd() * 5;
      if (state === 'stalled') lane.stalledAt = S.t - 60 - rnd() * 600;
      if (state !== 'building' && state !== 'spawning') lane.pr ||= S.nextPr++;
      return lane;
    };
    S.push = (text, col = 'muted') => { S.log.push({ t: clock(), text, col }); if (S.log.length > 120) S.log.shift(); };
    S.active = () => S.lanes.filter((l) => !['stalled', 'done', 'killed'].includes(l.state));

    // Start with seven lanes, some already stuck, as found.
    const cards = new Set();
    while (cards.size < 7) cards.add(2731 + Math.floor(rnd() * 19));
    const start = ['building', 'building', 'reviewing', 'ci', 'stalled', 'stalled', 'done'];
    [...cards].sort((a, b) => a - b).forEach((n, i) => S.lanes.push(S.newLane(n, start[(i * 3) % 7], 300 + rnd() * 4800)));
    S.push('mastermind: 7 lanes found. 2 of them have been waiting a while.', 'info');
    return S;
  }

  function stepTokens(S, rnd, dt) {
    let total = 0;
    for (const l of S.lanes) {
      const [base, spread] = TOK[l.state];
      if (rnd() < 0.3 * dt) l.tokT = Math.max(0, base + (rnd() * 2 - 1) * spread);
      if (base === 0) l.tokT = 0;
      l.tok = Math.max(0, l.tok + (l.tokT - l.tok) * Math.min(1, 0.55 * dt) + (base ? (rnd() - 0.5) * spread * 0.35 : 0));
      if (!base) l.tok *= 0.4;
      l.hist.push(l.tok); if (l.hist.length > 240) l.hist.shift();
      l.states.push(l.compactUntil ? 'compacting' : l.state); if (l.states.length > 240) l.states.shift();
      total += l.tok;
    }
    S.total.push(total); if (S.total.length > 900) S.total.shift();
    return total;
  }

  // A believable past for a lane found already running: segments back in time, ending in its state now.
  function pastStates(state, len, rnd) {
    const before = { spawning: [], building: ['reviewing', 'ci', 'spawning'], reviewing: ['building'], ci: ['reviewing'], stalled: ['building', 'reviewing', 'ci'], done: ['ci'] };
    const out = []; let cur = state; let first = true;
    while (out.length < len && cur) {
      const seg = first ? (cur === 'stalled' ? 50 + rnd() * 120 : 6 + rnd() * 18) : (cur === 'spawning' ? 4 : 8 + rnd() * 16);
      for (let i = 0; i < seg; i++) out.unshift(cur);
      first = false;
      const opts = before[cur] || []; cur = opts.length ? OS.pick(opts, rnd) : null;
    }
    return out.slice(-len);
  }

  // ---------- the app ----------
  registerApp({
    id: 'lanetop', title: 'lanetop', icon: 'lanes',
    desc: 'Agent lanes, tokens per second, spend and the dev-runner disk. Like btop.',
    keywords: ['btop', 'htop', 'top', 'monitor', 'lanes', 'agents', 'mastermind', 'processes', 'tokens'],
    size: [1100, 700],
    mount(win) {
      const canvas = h('canvas', { style: { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' }, 'aria-label': 'lanetop: agent lanes monitor' });
      win.body.style.overflow = 'hidden';
      win.body.append(canvas);
      const rnd = OS.rng((Date.now() ^ 0x5eed) >>> 0);
      const S = makeSim(rnd);
      win.state.S = S;
      S.ctx = canvas.getContext('2d');
      S.grid = makeGrid();
      S.C = colours();
      S.dirty = true;
      // History before lanetop opened: the lanes were already thinking.
      for (let i = 0; i < 400; i++) stepTokens(S, rnd, 1);
      S.peak = Math.max(...S.total);
      for (const l of S.lanes) l.states = pastStates(l.state, 240, rnd);

      const charge = (usd, label) => {
        const r = OS.spend.add(usd, label, 'lanetop');
        if (!r.ok) {
          OS.crash(win, { title: 'The mastermind cannot pay for that', code: 'LANE-0x64 DAILY_CAP', icon: 'coins-outline', lines: [r.message, 'Lanes already running keep running. They were paid for earlier.'] });
          S.push('refused by the daily cap.', 'bad');
        }
        return r.ok;
      };
      const selected = () => S.lanes[S.sel];
      const removeLane = (lane) => {
        const i = S.lanes.indexOf(lane); if (i < 0) return;
        S.reportedGone += lane.spent;
        S.lanes.splice(i, 1);
        S.sel = OS.clamp(S.sel, 0, Math.max(0, S.lanes.length - 1));
      };

      const A = {
        up() { S.sel = Math.max(0, S.sel - 1); S.dirty = true; },
        down() { S.sel = Math.min(S.lanes.length - 1, S.sel + 1); S.dirty = true; },
        kill() {
          const l = selected(); if (!l || l.state === 'killed') return;
          const after = { building: `Its branch keeps ${2 + Math.floor(rnd() * 4)} commits called craft cleanup.`, spawning: 'It had not finished reading AGENTS.md.', done: 'It had already finished. It was killed anyway.' }[l.state] || 'The PR stays open. Nobody will close it.';
          S.push(`SIGTERM ${l.name} (${l.card}). ${after}`, 'bad');
          S.enter(l, 'killed'); l.msg = '(no reply)'; l.tok = 0; l.tokT = 0;
          OS.sound.beep(220, 80, 'square', 0.03);
          S.dirty = true;
        },
        nudge() {
          const l = selected(); if (!l) return;
          if (l.state !== 'stalled') { S.push(`${l.name} is ${STATE_LABEL[l.state]}, not stalled. A nudge would only make it apologise.`, 'faint'); S.dirty = true; return; }
          if (!charge(0.03, `nudge ${l.name}: "CI finished a while ago"`)) return;
          const ago = fmtAge(Math.max(5, S.t - l.stalledAt - 8));
          S.enter(l, 'reviewing');
          l.msg = `Sorry. CI finished ${ago} ago. Reading the result now.`;
          S.push(`nudged ${l.name}: "${l.wait} finished ${ago} ago." It is reading the result now.`, 'good');
          S.dirty = true;
        },
        spawn() {
          if (S.lanes.length >= 12) { S.push('The mastermind runs 12 lanes at most. It has read the note about parallel siblings.', 'warn'); S.dirty = true; return; }
          if (S.full) return;
          const n = S.nextCard++;
          if (!charge(0.18, `spawn lane-${n}: read AGENTS.md, CLAUDE.md and RL-${n}`)) { S.nextCard--; return; }
          const lane = S.newLane(n, 'spawning', 0);
          lane.ctx = lane.ctxShown = CTX_MAX * 0.06; lane.spent = 0; lane.born = S.t; lane.since = S.t; lane.pr = null; lane.tok = 0;
          S.lanes.push(lane); S.sel = S.lanes.length - 1;
          S.push(`spawned ${lane.name} for ${lane.card}: "${lane.title}". It read AGENTS.md first.`, 'info');
          S.dirty = true;
        },
        prune() {
          if (S.pruning) return;
          const from = S.disk; const to = Math.min(from, 51 + rnd() * 4);
          const gb = (from - to) * DISK_GB / 100;
          const images = Math.max(1, Math.round(gb / 0.9));
          S.pruning = { from, to, t0: performance.now(), dur: 1800 / OS.speed, gb, images, label: 'docker image prune -a' };
          S.push(`docker image prune -a on dev-runner: ${images} images, ${gb.toFixed(1)} GB reclaimed.`, 'good');
          S.full = false;
          S.alert90Note?.dismiss?.();
          S.alert90Note = null;
          S.dirty = true;
        },
        quit() { win.close(); },
        faster() { S.rate = Math.max(250, S.rate / 2); S.push(`refresh ${S.rate}ms. The lanes do not go faster. You see them more often.`, 'faint'); S.dirty = true; },
        slower() { S.rate = Math.min(4000, S.rate * 2); S.push(`refresh ${S.rate}ms`, 'faint'); S.dirty = true; },
      };
      win.state.A = A; S.A = A;

      // ----- simulation tick -----
      const tick = () => {
        if (S.full) return;
        const dt = S.rate / 1000;
        S.t += dt;
        const total = stepTokens(S, rnd, dt);
        S.peak = Math.max(S.peak * 0.999, total);
        for (const l of [...S.lanes]) {
          // context grows with every token, and compacts near the top
          if (l.compactUntil) {
            if (S.t >= l.compactUntil) {
              const a = l.ctx; l.ctx = CTX_MAX * (0.16 + rnd() * 0.1); l.compactUntil = 0;
              const [kept, lost] = OS.pick(COMPACT, rnd);
              S.push(`${l.name} compacted ${fmtTok(a)} → ${fmtTok(l.ctx)} tokens. Kept: ${kept}. Lost: ${lost}.`, 'accent');
            }
          } else {
            l.ctx = Math.min(CTX_MAX, l.ctx + l.tok * dt * 14);
            if (l.ctx > CTX_MAX * 0.94) l.compactUntil = S.t + 1.6;
          }
          l.spent += l.tok * dt * 0.000018;
          if (S.t - l.since < l.dur) continue;
          const r = rnd();
          switch (l.state) {
            case 'spawning': S.enter(l, 'building'); break;
            case 'building':
              if (r < 0.9) { S.enter(l, 'reviewing'); S.push(`${l.name} opened PR #${l.pr} and started the review gates.`, 'accent2'); } else { S.enter(l, 'stalled'); S.push(`${l.name} started a background wait: ${l.wait}. Nothing will wake it.`, 'bad'); }
              break;
            case 'reviewing':
              if (r < 0.55) { S.enter(l, 'ci'); S.push(`${l.name}: reviews passed. Waiting on CI.`, 'warn'); } else if (r < 0.94) { S.enter(l, 'building'); S.push(`${l.name}: ${OS.pick(REVIEW_BACK, rnd)}`, 'muted'); } else { S.enter(l, 'stalled'); S.push(`${l.name} started a background wait: ${l.wait}. Nothing will wake it.`, 'bad'); }
              break;
            case 'ci':
              if (r < 0.5) { S.enter(l, 'done'); S.push(`${l.name}: CI green. Merged by rebase. Not worse than main.`, 'good'); } else if (r < 0.7) { S.enter(l, 'stalled'); S.push(`${l.name} started a background wait: ${l.wait}. Nothing will wake it.`, 'bad'); } else { S.enter(l, 'building'); S.push(`${l.name}: ${OS.pick(CI_BACK, rnd)}`, 'muted'); }
              break;
            case 'done': S.push(`${l.name} exited 0. ${l.card} moved to Done.`, 'faint'); removeLane(l); S.reaped++; break;
            case 'killed': removeLane(l); break;
            default: break;
          }
        }
        // The mastermind keeps two lanes busy on its own, for free, and slowly.
        if (S.active().length < 2 && S.lanes.length < 12 && S.t - S.lastAuto > 20) {
          S.lastAuto = S.t;
          const lane = S.newLane(S.nextCard++, 'spawning', 0);
          lane.ctx = lane.ctxShown = CTX_MAX * 0.06; lane.spent = 0; lane.born = S.t; lane.pr = null; lane.tok = 0;
          S.lanes.push(lane);
          S.push(`mastermind picked up ${lane.card} from Ready for Build.`, 'info');
        }
        // The dev runner fills with CI images.
        if (!S.pruning) {
          const busy = S.lanes.filter((l) => ['building', 'reviewing', 'ci'].includes(l.state)).length;
          S.disk = Math.min(100, S.disk + dt * (0.02 + 0.06 * busy));
          if (S.disk >= 80 && !S.alert80) {
            S.alert80 = true;
            S.push('dev-runner / passed 80%. The daily prune has not run today.', 'warn');
            OS.notify({ app: 'dev-runner', icon: 'desk-computer', title: 'dev-runner: root disk passed 80%', body: 'A daily job prunes unused Docker images. It is not daily yet.' });
          }
          if (S.disk >= 90 && !S.alert90) {
            S.alert90 = true;
            S.push('dev-runner / passed 90%. CI builds images faster than anyone deletes them.', 'bad');
            S.alert90Note = OS.notify({ app: 'dev-runner', icon: 'desk-computer', urgency: 'critical', title: 'dev-runner: root disk passed 90%', body: 'Press p in lanetop to prune Docker images.', actions: [{ label: 'Prune', run: () => A.prune() }] });
            win.flash();
          }
          if (S.disk >= 100 && !S.full) {
            S.full = true;
            S.push('dev-runner: no space left on device.', 'bad');
            OS.crash(win, {
              title: 'dev-runner: no space left on device', code: 'ENOSPC 0x1C DOCKER_IMAGES', icon: 'desk-computer',
              lines: ['The root disk is at 100%. 0 bytes free.', 'Every lane is now waiting on CI. CI is waiting on disk.'],
              details: [`$ df -h /`, `/dev/root  ${DISK_GB}G  ${DISK_GB}G  0  100% /`, `$ docker images --filter dangling=true | wc -l`, `${Math.round((S.disk - 46) * 2.2)}`],
              actions: [{ label: 'Prune Docker images', primary: true, run: () => A.prune() }, { label: 'Close app', run: () => win.close() }],
            });
          }
        }
        S.dirty = true;
      };
      let acc = 0;
      win.every(250, () => { acc += 250; if (acc >= S.rate) { acc = 0; tick(); } else if (S.pruning || S.lanes.some((l) => l.compactUntil)) S.dirty = true; });

      // ----- pointer -----
      const cellAt = (e) => {
        const m = S.m; if (!m) return null;
        const r = canvas.getBoundingClientRect();
        const x = Math.floor(((e.clientX - r.left) * m.dpr - m.ox) / m.cw); const y = Math.floor(((e.clientY - r.top) * m.dpr - m.oy) / m.chh);
        return { x, y };
      };
      const hitAt = (c) => c && [...S.grid.hits].reverse().find((r) => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h);
      canvas.addEventListener('pointermove', (e) => {
        const hit = hitAt(cellAt(e)); const key = hit?.key || null;
        canvas.style.cursor = hit ? 'pointer' : 'default';
        if (key !== S.hover) { S.hover = key; S.dirty = true; }
      });
      canvas.addEventListener('pointerleave', () => { if (S.hover) { S.hover = null; S.dirty = true; } });
      canvas.addEventListener('click', (e) => { const hit = hitAt(cellAt(e)); if (hit) { OS.sound.click(); hit.fn(); S.dirty = true; } });
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (e.deltaY > 0) A.down(); else A.up(); }, { passive: false });

      win.state.offs = [
        OS.on('theme', () => { S.C = colours(); S.dirty = true; }),
        OS.on('spend', () => { S.dirty = true; }),
      ];

      // ----- frame -----
      let last = 0;
      win.raf(() => {
        const now = performance.now();
        // smooth meters
        let moving = false;
        for (const l of S.lanes) {
          const d = l.ctx - l.ctxShown;
          if (Math.abs(d) > 50) { l.ctxShown += d * 0.18; moving = true; } else l.ctxShown = l.ctx;
        }
        if (S.pruning) {
          const p = S.pruning; const t = Math.min(1, (now - p.t0) / p.dur);
          S.disk = p.from + (p.to - p.from) * (1 - (1 - t) ** 3);
          if (t >= 1) { S.pruning = null; S.disk = p.to; if (S.disk < 80) S.alert80 = false; if (S.disk < 90) S.alert90 = false; }
          moving = true;
        }
        S.diskShown = S.disk;
        if (!(S.dirty || moving) || now - last < 33) return;
        last = now; S.dirty = false;
        render(win, S);
      });
      render(win, S);
    },
    onResize(win) { if (win.state.S) { win.state.S.m = null; win.state.S.dirty = true; } },
    onKey(win, e) {
      const A = win.state.A; if (!A || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const map = { ArrowUp: A.up, ArrowDown: A.down, k: A.kill, K: A.kill, n: A.nudge, N: A.nudge, s: A.spawn, S: A.spawn, p: A.prune, P: A.prune, q: A.quit, Q: A.quit, '+': A.faster, '=': A.faster, '-': A.slower };
      const fn = map[k];
      if (fn) { e.preventDefault(); fn(); }
    },
    unmount(win) { (win.state.offs || []).forEach((f) => f()); },
  });

  // ---------- drawing the screen ----------
  function render(win, S) {
    if (win.closed) return;
    const canvas = S.ctx.canvas;
    if (!S.m || S.m.W !== Math.round(win.body.clientWidth * Math.min(3, window.devicePixelRatio || 1))) {
      S.m = measure(win, S);
      canvas.width = S.m.W; canvas.height = S.m.H;
      S.grid.resize(S.m.cols, S.m.rows);
    }
    if (canvas.height !== S.m.H || S.m.H !== Math.round(win.body.clientHeight * S.m.dpr)) {
      S.m = measure(win, S); canvas.width = S.m.W; canvas.height = S.m.H; S.grid.resize(S.m.cols, S.m.rows);
    }
    const g = S.grid; const C = S.C; const m = S.m;
    g.clear();
    S.sel = OS.clamp(S.sel, 0, Math.max(0, S.lanes.length - 1));
    const W = m.cols; const R = m.rows;
    if (W < 40 || R < 12) {
      const msg = `lanetop needs 40 × 12. It has ${W} × ${R}.`;
      g.put(Math.max(0, Math.floor((W - msg.length) / 2)), Math.floor(R / 2), msg, C.muted);
      paint(S.ctx, g, m, C);
      return;
    }
    const P = layoutPanels(S, W, R);
    drawTok(S, g, C, P.tok, P.wide);
    if (P.spend) drawSpend(S, g, C, P.spend);
    if (P.ctx) drawCtx(S, g, C, P.ctx);
    if (P.disk) drawDisk(S, g, C, P.disk);
    if (P.log) drawLog(S, g, C, P.log);
    drawLanes(S, g, C, P.lanes, P.wide);
    paint(S.ctx, g, m, C);
    const stalled = S.lanes.filter((l) => l.state === 'stalled').length;
    win.setMeta(`${S.lanes.length} lanes · ${stalled} stalled · disk ${Math.round(S.disk)}%`);
  }

  function layoutPanels(S, W, R) {
    const P = {};
    const n = S.lanes.length;
    if (W >= 100 && R >= 28) {
      P.wide = true;
      const topH = OS.clamp(Math.round(R * 0.3), 9, 15);
      P.tok = { x: 0, y: 0, w: W, h: topH };
      const leftW = OS.clamp(Math.round(W * 0.3), 38, 56);
      const restH = R - topH;
      const diskH = 7;
      const ctxH = OS.clamp(n + 2, 5, Math.max(5, restH - diskH - 7));
      P.ctx = { x: 0, y: topH, w: leftW, h: ctxH };
      P.disk = { x: 0, y: topH + ctxH, w: leftW, h: diskH };
      const spendY = topH + ctxH + diskH;
      if (R - spendY >= 5) P.spend = { x: 0, y: spendY, w: leftW, h: R - spendY };
      else P.disk.h = R - topH - ctxH;
      // lanes take what they need (two lines a lane when they fit); the mastermind log gets the rest
      const lanesNeed = 2 + 1 + n * 2 + 4;
      const lanesH = restH - lanesNeed >= 6 ? lanesNeed : restH;
      P.lanes = { x: leftW, y: topH, w: W - leftW, h: lanesH };
      if (restH - lanesH >= 6) P.log = { x: leftW, y: topH + lanesH, w: W - leftW, h: restH - lanesH };
      return P;
    }
    P.wide = false;
    let y = 0;
    const tokH = OS.clamp(Math.round(R * 0.2), 5, 9);
    P.tok = { x: 0, y, w: W, h: tokH }; y += tokH;
    let bottom = 0;
    if (R >= 30) bottom = W >= 80 ? 8 : 14; else if (R >= 22) bottom = 6;
    P.lanes = { x: 0, y, w: W, h: R - y - bottom };
    // room to spare under the lanes: give it to the mastermind log
    const lanesNeed = 2 + 1 + n * 2 + 4;
    if (P.lanes.h - lanesNeed >= 6) { P.log = { x: 0, y: y + lanesNeed, w: W, h: P.lanes.h - lanesNeed }; P.lanes.h = lanesNeed; }
    y += P.lanes.h + (P.log ? P.log.h : 0);
    if (bottom >= 14) { P.disk = { x: 0, y, w: W, h: 6 }; P.spend = { x: 0, y: y + 6, w: W, h: bottom - 6 }; } else if (bottom === 8) { const half = Math.floor(W / 2); P.disk = { x: 0, y, w: half, h: 8 }; P.spend = { x: half, y, w: W - half, h: 8 }; } else if (bottom) P.disk = { x: 0, y, w: W, h: bottom };
    return P;
  }

  // A rounded box with btop's ┐title┌ tabs. Returns the inner rect.
  function box(g, C, r, colour, num, title, rightLabel) {
    const { x, y, w, h: hh } = r;
    const e = C.edge(colour);
    g.put(x, y, '╭' + '─'.repeat(Math.max(0, w - 2)) + '╮', e);
    for (let i = 1; i < hh - 1; i++) { g.put(x, y + i, '│', e); g.put(x + w - 1, y + i, '│', e); }
    g.put(x, y + hh - 1, '╰' + '─'.repeat(Math.max(0, w - 2)) + '╯', e);
    let cx = g.put(x + 1, y, '┐', e);
    if (num != null) cx = g.put(cx, y, SUP[num], colour, undefined, true);
    cx = g.put(cx, y, title, C.fg, undefined, true);
    g.put(cx, y, '┌', e);
    if (rightLabel) tab(g, C, x + w - 2 - tabLen(rightLabel), y, rightLabel, e, 'top');
    return { x: x + 1, y: y + 1, w: w - 2, h: hh - 2 };
  }
  const tabLen = (parts) => 2 + parts.reduce((a, p) => a + p[0].length, 0);
  // A label sitting in a border: parts = [[text, colour, bold]]. Returns the x after it.
  function tab(g, C, x, y, parts, edge, side = 'bottom', hit, S) {
    const [l, r] = side === 'top' ? ['┐', '┌'] : ['┘', '└'];
    const x0 = x;
    let cx = g.put(x, y, l, edge);
    const hover = hit && S && S.hover === hit.key;
    for (const [text, col, bold] of parts) cx = g.put(cx, y, text, col, hover ? C.sel : undefined, bold);
    cx = g.put(cx, y, r, edge);
    if (hit) g.hit(x0, y, cx - x0, 1, hit.fn, hit.key);
    return cx;
  }
  // A row of keyboard hints along a border. Each is [key, word, action].
  function hints(g, C, S, x, y, maxX, edge, items) {
    let cx = x;
    for (const [key, word, fn] of items) {
      const len = 2 + key.length + 1 + word.length;
      if (cx + len > maxX) break;
      cx = tab(g, C, cx, y, [[key, C.accent2, true], [' ' + word, C.fg]], edge, 'bottom', { fn, key: 'h:' + key }, S);
    }
    return cx;
  }

  function graph(g, x, y, w, hh, samples, max, colourAt) {
    if (w <= 0 || hh <= 0) return;
    const dots = hh * 4;
    for (let cx = 0; cx < w; cx++) {
      const i1 = samples.length - (w - cx) * 2 + 1; const i0 = i1 - 1;
      const v = [samples[i0], samples[i1]].map((s) => (s == null ? -1 : Math.round(OS.clamp(s / max, 0, 1) * dots)));
      for (let ry = 0; ry < hh; ry++) {
        const base = (hh - 1 - ry) * 4;
        let bits = 0;
        for (let side = 0; side < 2; side++) {
          let fill = OS.clamp(v[side] - base, 0, 4);
          if (v[side] === 0 && ry === hh - 1 && samples[side ? i1 : i0] != null) fill = 1;
          if (side === 0) { if (fill > 0) bits |= 0x40; if (fill > 1) bits |= 0x04; if (fill > 2) bits |= 0x02; if (fill > 3) bits |= 0x01; } else { if (fill > 0) bits |= 0x80; if (fill > 1) bits |= 0x20; if (fill > 2) bits |= 0x10; if (fill > 3) bits |= 0x08; }
        }
        if (bits) g.put(x + cx, y + ry, String.fromCharCode(0x2800 + bits), colourAt((hh - 1 - ry + 0.5) / hh));
      }
    }
  }
  function meter(g, C, x, y, w, frac, colourAt) {
    const n = Math.round(OS.clamp(frac, 0, 1) * w);
    for (let i = 0; i < w; i++) g.put(x + i, y, '■', i < n ? colourAt(i / Math.max(1, w - 1)) : C.empty);
  }

  function drawTok(S, g, C, r, wide) {
    const now = clock();
    const rateLabel = [['- ', C.accent2, true], [`${S.rate}ms`, C.fg], [' +', C.accent2, true]];
    const inner = box(g, C, r, C.accent, 1, 'tokens/s');
    const e = C.edge(C.accent);
    // clock in the middle of the top border, refresh rate on the right
    const cxClock = r.x + Math.floor((r.w - now.length - 2) / 2);
    if (r.w > 44) tab(g, C, cxClock, r.y, [[now, C.fg, true]], e, 'top');
    const rx = r.x + r.w - 2 - tabLen(rateLabel);
    tab(g, C, rx, r.y, rateLabel, e, 'top');
    g.hit(rx + 1, r.y, 2, 1, () => S.A?.slower?.(), 'rate-');
    g.hit(rx + rateLabel[0][0].length + rateLabel[1][0].length + 1, r.y, 2, 1, () => S.A?.faster?.(), 'rate+');
    const lanes = S.lanes;
    const listW = r.w >= 70 ? OS.clamp(Math.round(r.w * 0.36), 30, 44) : 0;
    const gw = inner.w - (listW ? listW + 1 : 0);
    const total = S.total[S.total.length - 1] || 0;
    const max = Math.max(200, ...S.total.slice(-gw * 2)) * 1.1;
    graph(g, inner.x, inner.y, gw, inner.h, S.total, max, C.hot);
    g.put(inner.x, inner.y, fmtTok(max), C.faint);
    if (listW) {
      const lx = inner.x + gw + 1;
      for (let i = 0; i < inner.h; i++) g.put(lx - 1, inner.y + i, '│', C.rule);
      const rows = Math.min(lanes.length, inner.h);
      for (let i = 0; i < rows; i++) {
        const l = lanes[i]; const yy = inner.y + i;
        g.put(lx + 1, yy, fit(l.name, 10), i === S.sel ? C.fg : C.muted, undefined, i === S.sel);
        const sw = listW - 18;
        const lmax = Math.max(60, ...l.hist.slice(-sw * 2));
        graph(g, lx + 12, yy, sw, 1, l.hist, lmax, () => C.state[l.state]);
        g.put(lx + listW - 5, yy, rfit(fmtTok(l.tok), 4), l.tok > 1 ? C.fg : C.faint);
      }
      if (lanes.length > rows) g.put(lx + 1, inner.y + inner.h - 1, fit(`+${lanes.length - rows + 1} more lanes`, listW - 2), C.faint);
    }
    const thinking = lanes.filter((l) => l.tok > 5).length;
    const by = r.y + r.h - 1;
    let cx = tab(g, C, r.x + 2, by, [['total ', C.muted], [fmtTok(total), C.fg, true], [' tok/s', C.muted]], e);
    if (wide || r.w > 60) cx = tab(g, C, cx + 1, by, [['peak ', C.muted], [fmtTok(S.peak), C.fg]], e);
    if (cx + 22 < r.x + r.w) tab(g, C, cx + 1, by, [[String(thinking), C.fg, true], [` of ${lanes.length} lanes thinking`, C.muted]], e);
  }

  function drawSpend(S, g, C, r) {
    const inner = box(g, C, r, C.warn, 4, 'spend', [['ledger, UTC', C.muted]]);
    const s = OS.spend.summary(); const f = s.usd / s.cap;
    const lane = S.lanes.reduce((a, l) => a + l.spent, S.reportedGone);
    let y = inner.y;
    const line = (fn) => { if (y < inner.y + inner.h) { fn(y); y++; } };
    line((yy) => { const x = g.put(inner.x + 1, yy, 'today     ', C.muted); const x2 = g.put(x, yy, OS.usd(s.usd), f >= 1 ? C.bad : f > 0.8 ? C.warn : C.fg, undefined, true); g.put(x2, yy, ` of ${OS.usd(s.cap)}`, C.muted); });
    line((yy) => { const mw = inner.w - 8; meter(g, C, inner.x + 1, yy, mw, f, C.hot); g.put(inner.x + 2 + mw, yy, rfit(Math.round(f * 100) + '%', 4), C.fg); });
    if (inner.h >= 5) line((yy) => { const x = g.put(inner.x + 1, yy, 'remaining ', C.muted); g.put(x, yy, OS.usd(s.remaining), C.fg); });
    if (inner.h >= 6) line((yy) => { const x = g.put(inner.x + 1, yy, 'lanes say ', C.muted); const x2 = g.put(x, yy, OS.usd(lane), C.fg); g.put(x2, yy, fit(' (unaudited)', inner.w - (x2 - inner.x) - 1), C.faint); });
    if (y < inner.y + inner.h - 1) {
      line((yy) => { const e = C.edge(C.warn); g.put(r.x, yy, '├' + '─'.repeat(r.w - 2) + '┤', e); tab(g, C, r.x + 2, yy, [['recent', C.muted]], e, 'top'); });
      const ledger = OS.spend.rows();
      if (!ledger.length) line((yy) => g.put(inner.x + 1, yy, fit('Nothing has thought yet today. Suspicious.', inner.w - 2), C.faint));
      for (const row of ledger) {
        if (y >= inner.y + inner.h) break;
        line((yy) => {
          let x = g.put(inner.x + 1, yy, row.t.slice(0, 5) + ' ', C.faint);
          x = g.put(x, yy, rfit(OS.usd(row.usd), 6) + ' ', C.fg);
          x = g.put(x, yy, fit(row.source, 9) + ' ', C.warn);
          g.put(x, yy, fit(row.label, inner.x + inner.w - x - 1), C.muted);
        });
      }
    }
  }

  function drawCtx(S, g, C, r) {
    const inner = box(g, C, r, C.info, 2, 'context', [['200k each', C.muted]]);
    const rows = inner.h; const lanes = S.lanes;
    const mw = Math.max(4, inner.w - 22);
    for (let i = 0; i < Math.min(rows, lanes.length); i++) {
      const l = lanes[i]; const yy = inner.y + i;
      const last = rows < lanes.length && i === rows - 1;
      if (last) { g.put(inner.x + 1, yy, `+${lanes.length - i} more`, C.faint); break; }
      const f = l.ctxShown / CTX_MAX;
      g.put(inner.x + 1, yy, fit(l.name, 10), i === S.sel ? C.fg : C.muted, undefined, i === S.sel);
      meter(g, C, inner.x + 12, yy, mw, f, C.cool);
      if (l.compactUntil) g.put(inner.x + 13 + mw, yy, fit('compacting', 9), C.warn, undefined, true);
      else g.put(inner.x + 13 + mw, yy, rfit(Math.round(f * 100) + '%', 4) + ' ' + rfit(fmtTok(l.ctxShown), 4), C.fg);
    }
  }

  function drawDisk(S, g, C, r) {
    const inner = box(g, C, r, C.good, 3, 'dev-runner', [['/', C.muted]]);
    const pct = S.diskShown; const used = pct * DISK_GB / 100;
    const col = pct >= 90 ? C.bad : pct >= 80 ? C.warn : C.fg;
    let y = inner.y;
    const mw = Math.max(4, inner.w - 9);
    if (y < inner.y + inner.h) { meter(g, C, inner.x + 1, y, mw, pct / 100, C.hot); g.put(inner.x + 2 + mw, y, rfit(pct.toFixed(0) + '%', 4), col, undefined, true); y++; }
    if (y < inner.y + inner.h) { g.put(inner.x + 1, y, fit(`used ${used.toFixed(1)} of ${DISK_GB} GB · free ${(DISK_GB - used).toFixed(1)} GB`, inner.w - 2), C.muted); y++; }
    const images = Math.max(0, used - 92);
    if (y < inner.y + inner.h) {
      const text = S.pruning ? `pruning… ${((S.pruning.from - S.disk) * DISK_GB / 100).toFixed(1)} GB reclaimed` : `docker images ${images.toFixed(1)} GB · ${Math.max(0, Math.round(images / 0.9 - 6))} unused`;
      g.put(inner.x + 1, y, fit(text, inner.w - 2), S.pruning ? C.good : C.muted); y++;
    }
    if (y < inner.y + inner.h) {
      let x = g.put(inner.x + 1, y, 'alerts ', C.muted);
      x = g.put(x, y, '80% ', C.muted); x = g.put(x, y, S.alert80 ? 'sent' : 'armed', S.alert80 ? C.warn : C.faint, undefined, S.alert80);
      x = g.put(x, y, ' · 90% ', C.muted); g.put(x, y, S.alert90 ? 'sent' : 'armed', S.alert90 ? C.bad : C.faint, undefined, S.alert90); y++;
    }
    if (y < inner.y + inner.h) g.put(inner.x + 1, y, fit('daily prune: scheduled, not yet daily', inner.w - 2), C.faint);
    hints(g, C, S, r.x + 2, r.y + r.h - 1, r.x + r.w - 2, C.edge(C.good), [['p', 'prune images', () => S.A.prune()]]);
  }

  function drawLog(S, g, C, r) {
    const inner = box(g, C, r, C.muted, 6, 'mastermind');
    const lines = [];
    for (let i = S.log.length - 1; i >= 0 && lines.length < inner.h; i--) {
      const ent = S.log[i]; const w = inner.w - 11;
      // wrap each entry into at most three lines, newest at the bottom
      const words = ent.text.split(' '); const parts = []; let cur = '';
      for (const wd of words) { if ((cur + ' ' + wd).trim().length > w) { parts.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); }
      if (cur) parts.push(cur);
      const keep = parts.slice(0, 3);
      if (parts.length > 3) keep[2] = fit(keep[2] + ' ' + parts.slice(3).join(' '), w);
      for (let j = keep.length - 1; j >= 0; j--) lines.unshift({ t: j === 0 ? ent.t : '', text: keep[j], col: ent.col });
    }
    const show = lines.slice(-inner.h);
    show.forEach((ln, i) => {
      const yy = inner.y + i;
      g.put(inner.x + 1, yy, ln.t.padEnd(9), C.faint);
      g.put(inner.x + 10, yy, ln.text, C[ln.col] || C.muted);
    });
  }

  function drawLanes(S, g, C, r, wide) {
    const lanes = S.lanes;
    const stalled = lanes.filter((l) => l.state === 'stalled').length;
    const inner = box(g, C, r, C.accent2, 5, 'lanes', [[`${lanes.length} lanes`, C.fg, true], [stalled ? ` · ${stalled} stalled` : ' · none stalled', stalled ? C.bad : C.muted]]);
    const e = C.edge(C.accent2);
    // columns: [key, header, width, align]
    const all = [
      ['pid', 'pid', 6, 'l', 5], ['lane', 'lane', 10, 'l', 0], ['card', 'card', 8, 'l', 6], ['state', 'state', 15, 'l', 0], ['tok', 'tok/s', 6, 'r', 1],
      ['ctx', 'ctx', 10, 'l', wide ? 99 : 2], ['spent', 'spent', 7, 'r', 4], ['age', 'age', 6, 'r', 3],
    ];
    let cols = all.filter((c) => c[4] < 99);
    const need = (cs) => cs.reduce((a, c) => a + c[2] + 1, 0);
    while (need(cols) > inner.w - 2 && cols.some((c) => c[4] > 0)) {
      const drop = cols.filter((c) => c[4] > 0).sort((a, b) => b[4] - a[4])[0];
      cols = cols.filter((c) => c !== drop);
    }
    const titleW = inner.w - 2 - need(cols);
    const showTitle = titleW >= 12;
    const detailH = inner.h >= 12 ? 4 : inner.h >= 9 ? 3 : 0;
    const listH = inner.h - 1 - detailH;
    const two = listH >= lanes.length * 2 && inner.w >= 50;
    const rh = two ? 2 : 1;
    const fitN = Math.max(1, Math.floor(listH / rh));
    // header
    let x = inner.x + 1;
    for (const c of cols) { g.put(x, inner.y, c[3] === 'r' ? rfit(c[1], c[2]) : fit(c[1], c[2]), C.muted, undefined, true); x += c[2] + 1; }
    if (showTitle) g.put(x, inner.y, 'title', C.muted, undefined, true);
    // keep the selection visible
    if (S.sel < S.scroll) S.scroll = S.sel;
    if (S.sel >= S.scroll + fitN) S.scroll = S.sel - fitN + 1;
    S.scroll = OS.clamp(S.scroll, 0, Math.max(0, lanes.length - fitN));
    for (let i = 0; i < fitN; i++) {
      const idx = S.scroll + i; const l = lanes[idx]; if (!l) break;
      const yy = inner.y + 1 + i * rh;
      const sel = idx === S.sel; const hover = S.hover === 'row:' + l.pid;
      const bg = sel ? C.sel : hover ? C.hover : undefined;
      if (bg) g.fillBg(inner.x, yy, inner.w, rh, bg);
      const dim = l.state === 'killed' || l.state === 'done';
      const tc = dim ? C.faint : C.fg;
      x = inner.x + 1;
      for (const c of cols) {
        const w = c[2];
        switch (c[0]) {
          case 'pid': g.put(x, yy, fit(l.pid, w), C.faint); break;
          case 'lane': g.put(x, yy, fit(l.name, w), sel ? C.fg : tc, undefined, sel); break;
          case 'card': g.put(x, yy, fit(l.card, w), C.info); break;
          case 'state': {
            const st = l.compactUntil ? 'compacting' : STATE_LABEL[l.state];
            g.put(x, yy, '●', l.compactUntil ? C.warn : C.state[l.state]);
            g.put(x + 2, yy, fit(st, w - 2), l.compactUntil ? C.warn : C.state[l.state], undefined, l.state === 'stalled');
            break;
          }
          case 'tok': g.put(x, yy, rfit(l.tok < 0.5 ? '0' : l.tok < 10 ? l.tok.toFixed(1) : Math.round(l.tok), w), l.tok > 1 ? C.fg : C.faint); break;
          case 'ctx': { const f = l.ctxShown / CTX_MAX; meter(g, C, x, yy, w - 5, f, C.cool); g.put(x + w - 4, yy, rfit(Math.round(f * 100) + '%', 4), C.muted); break; }
          case 'spent': g.put(x, yy, rfit(OS.usd(l.spent), w), tc); break;
          case 'age': g.put(x, yy, rfit(fmtAge(S.t - l.born), w), C.muted); break;
          default: break;
        }
        x += w + 1;
      }
      if (showTitle) g.put(x, yy, fit(l.title, titleW), dim ? C.faint : C.muted);
      if (two) {
        // the lane's state over time, oldest left, one cell a tick, then what it last said
        const tw = OS.clamp(Math.round(inner.w * 0.42), 16, 64);
        const x0 = inner.x + 1;
        g.put(x0, yy + 1, '╰', C.rule);
        for (let k = 0; k < tw; k++) {
          const st = l.states[l.states.length - tw + k];
          g.put(x0 + 2 + k, yy + 1, st ? '▬' : '·', st ? (st === 'compacting' ? C.warn : C.state[st]) : C.empty);
        }
        const mx = x0 + 3 + tw;
        g.put(mx, yy + 1, fit(`"${l.msg}"`, inner.x + inner.w - mx - 1), dim ? C.faint : C.muted);
      }
      g.hit(inner.x, yy, inner.w, rh, () => { S.sel = idx; }, 'row:' + l.pid);
    }
    if (lanes.length > S.scroll + fitN) g.put(inner.x + inner.w - 12, inner.y + inner.h - detailH - 1, `↓ ${lanes.length - S.scroll - fitN} more`, C.faint);
    if (!lanes.length) g.put(inner.x + 2, inner.y + 2, 'No lanes. Press s to spawn one. It costs $0.18 and reads AGENTS.md.', C.muted);
    // the selected lane, in detail
    const l = lanes[S.sel];
    if (detailH && l) {
      const dy = inner.y + inner.h - detailH;
      g.put(r.x, dy, '├' + '─'.repeat(r.w - 2) + '┤', e);
      tab(g, C, r.x + 2, dy, [[l.name, C.fg, true], [' · ', C.muted], [l.card, C.info]], e, 'top');
      const ago = fmtAge(S.t - l.stalledAt);
      const finished = fmtAge(Math.max(0, S.t - l.stalledAt - 9));
      const line = {
        spawning: 'reading AGENTS.md, then CLAUDE.md, which says to read AGENTS.md',
        building: `building on ${l.card.toLowerCase()}-${slug(l.title)} · touching only what the card asks for`,
        reviewing: `PR #${l.pr} · review gates: spec compliance, craft, production`,
        ci: `PR #${l.pr} · Frontend Checks 14 of 15 · the 15th is the design-sync gate`,
        stalled: `stalled on a background wait: ${l.wait} · started ${ago} ago · it finished ${finished} ago · nothing will wake it`,
        done: `PR #${l.pr} merged by rebase · not worse than main`,
        killed: 'SIGTERM sent · exit 143',
      }[l.state];
      const rows = [
        [[l.title, C.fg, true]],
        [[line, l.state === 'stalled' ? C.bad : C.muted]],
        [['last: ', C.faint], [`"${l.msg}"`, C.muted]],
      ].slice(0, detailH - 1);
      rows.forEach((parts, i) => {
        let cx = inner.x + 1; const end = inner.x + inner.w - 1;
        for (const [text, col, bold] of parts) { if (cx >= end) break; cx = g.put(cx, dy + 1 + i, fit(text, Math.min(text.length, end - cx)), col, undefined, bold); }
      });
    }
    hints(g, C, S, r.x + 2, r.y + r.h - 1, r.x + r.w - 2, e, [
      ['↑↓', 'select', () => S.A.down()], ['k', 'kill', () => S.A.kill()], ['n', 'nudge', () => S.A.nudge()],
      ['s', 'spawn', () => S.A.spawn()], ['p', 'prune', () => S.A.prune()], ['q', 'quit', () => S.A.quit()],
    ]);
  }
})();
