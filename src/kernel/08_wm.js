// brickland: the tiling window manager. Dwindle, master and monocle layouts, nine workspaces, floating windows.
(() => {
  const { h } = OS;
  const desk = document.getElementById('desk');
  const empty = document.getElementById('empty');
  const wins = new Map();
  const WS = Array.from({ length: 9 }, (_, i) => ({ n: i + 1, order: [], layout: 'dwindle', ratio: 0.5, full: null, history: [] }));
  const cfg = { gapsIn: 6, gapsOut: 10 };
  let cur = 1;
  let focused = null;
  let nextId = 1;
  let zTop = 30;
  const rafs = new Set();

  const W = (n) => WS[n - 1];
  const live = (n) => W(n).order.map((id) => wins.get(id)).filter(Boolean);

  // ---------- frame loop for win.raf ----------
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(100, t - last) * OS.speed; last = t;
    OS.frameMs = Math.min(100, t - (OS._lastFrame || t)); OS._lastFrame = t;
    for (const r of [...rafs]) {
      if (r.win.closed) { rafs.delete(r); continue; }
      if (!r.win.visible) continue;
      try { r.fn(dt, t); } catch (err) { rafs.delete(r); console.error(`[OS] raf in '${r.win.app.id}' threw and was stopped`, err); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- windows ----------
  function makeWin(app) {
    const id = nextId++;
    const title = h('span', { class: 't' }, app.title);
    const meta = h('span', { class: 'meta' });
    const btn = (label, tip, fn, cls = '') => h('button', { class: cls, title: tip, 'aria-label': tip, onclick: (e) => { e.stopPropagation(); fn(); } }, label);
    const header = h('div', { class: 'whd' });
    const body = h('div', { class: 'wbd' });
    const el = h('div', { class: 'win opening', dataset: { app: app.id, id: String(id) }, role: 'dialog', 'aria-label': app.title }, header, body);
    const win = {
      id, app, el, body, header, ws: cur, floating: false, rect: null, state: {}, closed: false, title: app.title,
      _timers: new Set(), _h: {},
      setTitle(t) { this.title = t; title.textContent = t; el.setAttribute('aria-label', t); OS.emit('win:title', this); },
      setMeta(t) { meta.textContent = t || ''; },
      close() { close(this); },
      focus() { focus(this); },
      isFocused() { return focused === this && !OS.overlayOpen(); },
      get visible() { return !this.closed && this.ws === cur && !el.classList.contains('hidden'); },
      get width() { return body.clientWidth; },
      get height() { return body.clientHeight; },
      every(ms, fn) { const t = setInterval(() => { if (!this.closed) fn(); }, ms / OS.speed); this._timers.add(() => clearInterval(t)); return t; },
      after(ms, fn) {
        const cancel = () => clearTimeout(t);
        const t = setTimeout(() => { this._timers.delete(cancel); if (!this.closed) fn(); }, ms / OS.speed);
        this._timers.add(cancel); return t;
      },
      // Resolves after ms, or straight away when the window closes. Check win.closed after every await.
      sleep(ms) {
        return new Promise((r) => {
          const cancel = () => { clearTimeout(t); r(); };
          const t = setTimeout(() => { this._timers.delete(cancel); r(); }, ms / OS.speed);
          this._timers.add(cancel);
        });
      },
      raf(fn) { const r = { win: this, fn }; rafs.add(r); return () => rafs.delete(r); },
      on(evt, fn) { (this._h[evt] ||= []).push(fn); return () => { this._h[evt] = this._h[evt].filter((f) => f !== fn); }; },
      emit(evt, data) { for (const fn of this._h[evt] || []) { try { fn(data); } catch (err) { console.error(`[OS] '${evt}' handler in '${app.id}' threw`, err); } } },
      flash() { el.classList.remove('urgent'); void el.offsetWidth; el.classList.add('urgent'); this.urgent = this.ws !== cur; OS.emit('ws', cur); },
      crash(spec) { return OS.crash(this, spec); },
    };
    header.append(
      h('span', { html: OS.icon(app.icon) }).firstChild,
      title, meta,
      btn('⧉', 'Float (SUPER+T)', () => toggleFloat(win)),
      btn('□', 'Fullscreen (SUPER+F)', () => toggleFull(win)),
      btn('✕', 'Close (SUPER+W)', () => close(win), 'x'),
    );
    el.addEventListener('pointerdown', () => { if (focused !== win) focus(win); }, true);
    header.addEventListener('dblclick', () => toggleFull(win));
    header.addEventListener('pointerdown', (e) => headerDrag(win, e));
    let pend = false;
    const ro = new ResizeObserver(() => {
      if (pend) return; pend = true;
      requestAnimationFrame(() => { pend = false; if (!win.closed) { win.emit('resize'); try { app.onResize?.(win); } catch (err) { console.error(err); } } });
    });
    ro.observe(body);
    win._timers.add(() => ro.disconnect());
    return win;
  }

  function open(appId, arg, opt = {}) {
    const app = OS.apps[appId];
    if (!app) {
      OS.notify({ app: 'brickland', title: 'No such app', body: `There is no app called '${appId}'. Bricky checked twice.`, urgency: 'critical' });
      return null;
    }
    if (!app.multi) {
      const existing = [...wins.values()].find((w) => w.app.id === appId);
      if (existing) {
        if (existing.ws !== cur) switchWs(existing.ws);
        focus(existing);
        if (arg !== undefined) { try { app.onArg?.(existing, arg); } catch (err) { console.error(err); } }
        return existing;
      }
    }
    const win = makeWin(app);
    win.ws = opt.ws || cur;
    wins.set(win.id, win);
    desk.append(win.el);
    if (app.float || opt.float) {
      win.floating = true;
      win.rect = centred(app.size[0], app.size[1]);
    }
    W(win.ws).order.push(win.id);
    try { app.mount(win, arg); } catch (err) {
      console.error(`[OS] mount of '${appId}' threw`, err);
      OS.crash(win, { title: 'Segmentation fault (core composed)', code: 'APP-0xDEAD MOUNT_THREW', lines: [String(err.message || err)], details: String(err.stack || '').split('\n').slice(0, 6) });
    }
    if (win.ws !== cur) win.el.classList.add('hidden');
    layout(win.ws);
    if (win.ws === cur) focus(win); else win.flash();
    requestAnimationFrame(() => requestAnimationFrame(() => win.el.classList.remove('opening')));
    updateEmpty();
    OS.emit('win:open', win);
    return win;
  }

  function close(win) {
    if (!win || win.closed) return;
    try { win.app.unmount?.(win); } catch (err) { console.error(err); }
    win.emit('close');
    win.closed = true;
    win._timers.forEach((f) => f());
    const w = W(win.ws);
    w.order = w.order.filter((id) => id !== win.id);
    w.history = w.history.filter((id) => id !== win.id);
    if (w.full === win.id) w.full = null;
    wins.delete(win.id);
    win.el.classList.add('closing');
    setTimeout(() => win.el.remove(), 220);
    if (focused === win) {
      focused = null;
      const next = wins.get(w.history[w.history.length - 1]) || live(win.ws).slice(-1)[0];
      if (next && next.ws === cur) focus(next);
    }
    layout(win.ws);
    updateEmpty();
    OS.emit('win:close', win);
  }

  function focus(win) {
    if (!win || win.closed) return;
    if (win.ws !== cur) switchWs(win.ws);
    const prev = focused;
    if (prev && prev !== win) { prev.el.classList.remove('focused'); prev.emit('blur'); }
    focused = win;
    win.el.classList.add('focused');
    win.urgent = false;
    const w = W(win.ws);
    if (w.full && w.full !== win.id && !win.floating) {
      const fw = wins.get(w.full); w.full = null;
      if (fw) fw.el.style.zIndex = '';
      layout(win.ws);
    }
    w.history = [...w.history.filter((id) => id !== win.id), win.id];
    if (win.floating) win.el.style.zIndex = String(++zTop);
    if (w.layout === 'monocle' || narrow()) layout(win.ws);
    const a = document.activeElement;
    if (a && a !== document.body && !win.el.contains(a)) a.blur();
    if (prev !== win) { win.emit('focus'); OS.emit('win:focus', win); }
  }

  function centred(w, hgt) {
    const dw = desk.clientWidth; const dh = desk.clientHeight;
    const ww = Math.min(w, dw - 40); const hh = Math.min(hgt, dh - 40);
    const off = (wins.size % 5) * 18;
    return { x: Math.round((dw - ww) / 2) + off, y: Math.round((dh - hh) / 2.4) + off, w: ww, h: hh };
  }

  // ---------- layout ----------
  const narrow = () => desk.clientWidth < 720;

  function dwindle(r, n, ratio) {
    const out = []; const g = cfg.gapsIn;
    let rest = { ...r };
    for (let i = 0; i < n; i++) {
      if (i === n - 1) { out.push(rest); break; }
      const t = i === 0 ? ratio : 0.5;
      if (rest.w >= rest.h) {
        const a = Math.round((rest.w - g) * t);
        out.push({ x: rest.x, y: rest.y, w: a, h: rest.h });
        rest = { x: rest.x + a + g, y: rest.y, w: rest.w - a - g, h: rest.h };
      } else {
        const a = Math.round((rest.h - g) * t);
        out.push({ x: rest.x, y: rest.y, w: rest.w, h: a });
        rest = { x: rest.x, y: rest.y + a + g, w: rest.w, h: rest.h - a - g };
      }
    }
    return out;
  }

  function master(r, n, ratio) {
    if (n === 1) return [r];
    const g = cfg.gapsIn; const mw = Math.round((r.w - g) * ratio);
    const out = [{ x: r.x, y: r.y, w: mw, h: r.h }];
    const sh = (r.h - g * (n - 2)) / (n - 1);
    for (let i = 0; i < n - 1; i++) out.push({ x: r.x + mw + g, y: Math.round(r.y + i * (sh + g)), w: r.w - mw - g, h: Math.round(sh) });
    return out;
  }

  function place(win, r) {
    const s = win.el.style;
    s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = Math.max(120, r.w) + 'px'; s.height = Math.max(80, r.h) + 'px';
  }

  function layout(n = cur) {
    const w = W(n);
    const all = live(n);
    const dw = desk.clientWidth; const dh = desk.clientHeight;
    const outer = { x: cfg.gapsOut, y: cfg.gapsOut, w: dw - cfg.gapsOut * 2, h: dh - cfg.gapsOut * 2 };
    const tiled = all.filter((x) => !x.floating);
    const mode = narrow() ? 'monocle' : w.layout;
    let rects;
    if (mode === 'monocle') rects = tiled.map(() => outer);
    else if (mode === 'master') rects = master(outer, tiled.length, w.ratio);
    else rects = dwindle(outer, tiled.length, w.ratio);
    const showId = w.history.filter((id) => tiled.some((t) => t.id === id)).slice(-1)[0] ?? tiled[tiled.length - 1]?.id;
    tiled.forEach((win, i) => {
      place(win, rects[i]);
      win.el.classList.toggle('hidden', n !== cur || (mode === 'monocle' && win.id !== showId));
      win.el.style.zIndex = '';
    });
    for (const win of all.filter((x) => x.floating)) {
      const r = win.rect;
      r.w = Math.min(r.w, dw - 8); r.h = Math.min(r.h, dh - 8);
      r.x = OS.clamp(r.x, 4 - r.w + 80, dw - 80); r.y = OS.clamp(r.y, 0, dh - 30);
      place(win, r);
      win.el.classList.add('floating');
      win.el.classList.toggle('hidden', n !== cur);
    }
    for (const win of all.filter((x) => !x.floating)) win.el.classList.remove('floating');
    if (w.full) {
      const fw = wins.get(w.full);
      if (fw) { place(fw, { x: 0, y: 0, w: dw, h: dh }); fw.el.style.zIndex = '25'; fw.el.classList.toggle('hidden', n !== cur); }
    }
  }

  function switchWs(n) {
    if (n < 1 || n > 9) return;
    cur = n;
    for (const win of wins.values()) win.el.classList.toggle('hidden', win.ws !== cur);
    layout(cur);
    const w = W(cur);
    const next = wins.get(w.history[w.history.length - 1]) || live(cur).slice(-1)[0];
    if (next) focus(next);
    else if (focused) { focused.el.classList.remove('focused'); focused.emit('blur'); focused = null; }
    updateEmpty();
    OS.emit('ws', cur);
  }

  function moveToWs(win, n) {
    if (!win || n === win.ws || n < 1 || n > 9) return;
    const from = win.ws;
    W(from).order = W(from).order.filter((id) => id !== win.id);
    W(from).history = W(from).history.filter((id) => id !== win.id);
    if (W(from).full === win.id) W(from).full = null;
    win.ws = n; W(n).order.push(win.id); W(n).history.push(win.id);
    win.el.classList.toggle('hidden', n !== cur);
    if (focused === win) { win.el.classList.remove('focused'); focused = null; const next = live(from).slice(-1)[0]; if (next) focus(next); }
    layout(from); layout(n); updateEmpty();
    OS.emit('ws', cur);
  }

  function toggleFloat(win = focused) {
    if (!win) return;
    win.floating = !win.floating;
    if (win.floating) { const r = win.el.getBoundingClientRect(); win.rect = centred(Math.max(420, r.width * 0.8), Math.max(300, r.height * 0.8)); win.el.style.zIndex = String(++zTop); }
    layout(win.ws);
  }
  function toggleFull(win = focused) {
    if (!win) return;
    const w = W(win.ws); w.full = w.full === win.id ? null : win.id;
    if (!w.full) win.el.style.zIndex = '';
    layout(win.ws);
  }
  function cycleLayout() {
    const w = W(cur); const order = ['dwindle', 'master', 'monocle'];
    w.layout = order[(order.indexOf(w.layout) + 1) % order.length];
    layout(cur);
    OS.osd?.(`layout: ${w.layout}`);
    OS.emit('ws', cur);
  }
  function resize(delta) { const w = W(cur); w.ratio = OS.clamp(w.ratio + delta, 0.2, 0.8); layout(cur); }
  function setRatio(r, n = cur) { W(n).ratio = OS.clamp(r, 0.2, 0.8); layout(n); }

  function neighbour(dir) {
    if (!focused) return null;
    const r0 = focused.el.getBoundingClientRect();
    const c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
    let best = null; let bestD = Infinity;
    for (const win of live(cur)) {
      if (win === focused || win.el.classList.contains('hidden')) continue;
      const r = win.el.getBoundingClientRect(); const c = [r.left + r.width / 2, r.top + r.height / 2];
      const dx = c[0] - c0[0]; const dy = c[1] - c0[1];
      const ok = { left: dx < -10, right: dx > 10, up: dy < -10, down: dy > 10 }[dir];
      if (!ok) continue;
      const d = (dir === 'left' || dir === 'right') ? Math.abs(dx) + Math.abs(dy) * 2 : Math.abs(dy) + Math.abs(dx) * 2;
      if (d < bestD) { bestD = d; best = win; }
    }
    return best;
  }
  function focusDir(dir) {
    const w = W(cur);
    if (w.layout === 'monocle' || narrow()) {
      const list = live(cur).filter((x) => !x.floating); if (!list.length) return;
      const i = list.indexOf(focused); const step = dir === 'left' || dir === 'up' ? -1 : 1;
      focus(list[(i + step + list.length) % list.length]); return;
    }
    const n = neighbour(dir); if (n) focus(n);
  }
  function swap(a, b) {
    if (!a || !b || a.ws !== b.ws) return;
    const o = W(a.ws).order; const i = o.indexOf(a.id); const j = o.indexOf(b.id);
    if (i < 0 || j < 0) return;
    [o[i], o[j]] = [o[j], o[i]];
    layout(a.ws);
  }
  function swapDir(dir) { const n = neighbour(dir); if (n && !n.floating && focused && !focused.floating) swap(focused, n); }

  // Floating windows move with their header. Tiled windows swap places when dropped on another tile.
  function headerDrag(win, e) {
    if (e.button !== 0 || e.target.closest('button')) return;
    const sx = e.clientX; const sy = e.clientY;
    const start = win.rect ? { ...win.rect } : null;
    let moved = false;
    win.el.classList.add('dragging');
    const move = (ev) => {
      const dx = ev.clientX - sx; const dy = ev.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (win.floating && start) { win.rect.x = start.x + dx; win.rect.y = start.y + dy; place(win, win.rect); }
      else if (moved) win.el.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
      win.el.classList.remove('dragging');
      if (!win.floating && moved) {
        win.el.style.transform = '';
        win.el.style.pointerEvents = 'none';
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.win');
        win.el.style.pointerEvents = '';
        const other = target && wins.get(Number(target.dataset.id));
        if (other && other !== win && !other.floating) swap(win, other); else layout(win.ws);
      } else if (win.floating) layout(win.ws);
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  }

  // ---------- empty workspace ----------
  function updateEmpty() {
    const has = live(cur).length > 0;
    empty.classList.toggle('off', has);
    if (!has) {
      const lines = [
        'Nothing here yet. That is the most composed this workspace will ever be.',
        'An empty workspace. No design review has found it yet.',
        'Workspace ' + cur + ' is empty. Not worse than main.',
        'Nothing is open. Nothing is costing money. Enjoy it.',
      ];
      empty.innerHTML = '';
      empty.append(
        h('img', { class: 'pixel', src: OS.bricky(), alt: '' }),
        h('div', { class: 'say' }, lines[cur % lines.length]),
        h('div', { class: 'hint', html: `<span class="ui-kbd">Alt</span>+<span class="ui-kbd">Space</span> launcher &nbsp; <span class="ui-kbd">Alt</span>+<span class="ui-kbd">Enter</span> terminal &nbsp; <span class="ui-kbd">Alt</span>+<span class="ui-kbd">/</span> every key<br><span class="ui-faint">SUPER is Alt (Option on a Mac). Your browser kept the real one.</span>` }),
      );
    }
  }

  window.addEventListener('resize', () => { for (let n = 1; n <= 9; n++) layout(n); });

  OS.wm = {
    cfg, open, close, focus, layout, switchWs, moveToWs, toggleFloat, toggleFull, cycleLayout, resize, setRatio, focusDir, swapDir, updateEmpty,
    list: () => [...wins.values()],
    focused: () => focused,
    current: () => cur,
    workspace: (n = cur) => ({ ...W(n), windows: live(n) }),
    occupied: () => WS.filter((w) => w.order.length).map((w) => w.n),
    urgent: () => [...new Set([...wins.values()].filter((w) => w.urgent).map((w) => w.ws))],
  };
  OS.open = open;
})();
