// The OS namespace: events, DOM helper, maths, storage, sound, icons, app registry.
const OS = (() => {
  const handlers = {};
  const params = new URLSearchParams(location.search);

  const os = {
    version: '2.0',
    codename: 'Composed',
    build: '2026.11.13-not-worse-than-main',
    apps: {},
    params,
    speed: Math.max(0.1, Math.min(50, Number(params.get('speed')) || 1)),
    ready: false,
  };

  // ---------- events ----------
  os.on = (evt, fn) => { (handlers[evt] ||= new Set()).add(fn); return () => handlers[evt].delete(fn); };
  os.off = (evt, fn) => handlers[evt]?.delete(fn);
  os.emit = (evt, data) => {
    for (const fn of [...(handlers[evt] || [])]) {
      try { fn(data); } catch (err) { console.error(`[OS] handler for '${evt}' threw`, err); }
    }
  };

  // ---------- DOM ----------
  // h('div', {class: 'x', onclick: fn, style: {color: 'red'}}, 'text', child, [more])
  os.h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) k.forEach(add);
      else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  };
  os.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- maths ----------
  os.hash = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  };
  os.rng = (seed) => {
    let a = (typeof seed === 'string' ? os.hash(seed) : seed >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  os.pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length) % arr.length];
  os.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  os.lerp = (a, b, t) => a + (b - a) * t;
  os.money = (n) => (n < 0 ? '-£' : '£') + Math.round(Math.abs(n)).toLocaleString('en-GB');
  os.usd = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  os.pad = (s, n, ch = ' ') => String(s).padEnd(n, ch).slice(0, Math.max(n, String(s).length));

  // ---------- time ----------
  // A day offset lets the spend ledger "wait until tomorrow".
  os.dayOffset = 0;
  os.now = () => new Date(Date.now() + os.dayOffset * 86400000);
  os.today = () => os.now().toISOString().slice(0, 10);
  os.sleep = (ms) => new Promise((r) => setTimeout(r, ms / os.speed));

  // ---------- storage (every access may throw: private windows, blocked storage) ----------
  os.store = {
    get(key, def) {
      try { const v = localStorage.getItem('labsos2.' + key); return v == null ? def : JSON.parse(v); } catch { return def; }
    },
    set(key, val) {
      try { localStorage.setItem('labsos2.' + key, JSON.stringify(val)); return true; } catch { return false; }
    },
    del(key) { try { localStorage.removeItem('labsos2.' + key); } catch { /* storage unavailable */ } },
  };

  // ---------- sound (off by default; Style menu turns it on) ----------
  let actx = null;
  os.sound = {
    on: os.store.get('sound', false),
    set(v) { this.on = !!v; os.store.set('sound', this.on); },
    beep(freq = 660, ms = 60, type = 'square', vol = 0.03) {
      if (!this.on) return;
      try {
        actx ||= new (window.AudioContext || window.webkitAudioContext)();
        const o = actx.createOscillator(); const g = actx.createGain();
        o.type = type; o.frequency.value = freq; g.gain.value = vol;
        o.connect(g); g.connect(actx.destination);
        o.start(); o.stop(actx.currentTime + ms / 1000);
      } catch { /* no audio */ }
    },
    click() { this.beep(1200, 18, 'square', 0.015); },
    ding() { this.beep(880, 90, 'sine', 0.05); setTimeout(() => this.beep(1320, 120, 'sine', 0.04), 90); },
    error() { this.beep(140, 220, 'sawtooth', 0.04); },
  };

  // ---------- icons ----------
  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const custom = {
    terminal: S('<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>'),
    octopus: S('<path d="M6 11a6 6 0 0 1 12 0c0 2-1 3-2 3.5"/><path d="M8 14.5c-1 .5-2 1.8-2.6 4M10.5 15c-.3 1.6-.4 3-.2 4.8M13.5 15c.3 1.6.4 3 .2 4.8M16 14.5c1 .5 2 1.8 2.6 4M8 14.5c-.5-.3-1.4-1.3-2-3.5"/><circle cx="9.7" cy="10" r="1.1" fill="currentColor"/><circle cx="14.3" cy="10" r="1.1" fill="currentColor"/>'),
    cpu: S('<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3"/>'),
    floppy: S('<path d="M4 4h12.5L20 7.5V20H4z"/><path d="M8 4v5h7V4M7.5 20v-6h9v6"/>'),
    search: S('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
    branch: S('<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 5-6 4-11 8.5"/>'),
    kanban: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M5.5 8h1.5M11.5 8h1.5M11.5 11h1.5M17.5 8h1.5"/>'),
    eye: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    grid: S('<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>'),
    power: S('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
    volume: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
    mute: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
    dollar: S('<path d="M12 3v18M16.5 7.5c-.7-1.4-2.3-2.2-4.5-2.2-2.6 0-4.3 1.3-4.3 3.2 0 4.6 9 2.4 9 7 0 2-1.9 3.3-4.6 3.3-2.3 0-4-.9-4.8-2.5"/>'),
    wifi: S('<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19.3" r="1" fill="currentColor"/>'),
    lanes: S('<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="1.6" fill="currentColor"/><circle cx="15" cy="12" r="1.6" fill="currentColor"/><circle cx="11" cy="18" r="1.6" fill="currentColor"/>'),
    flask: S('<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>'),
  };
  const resi = (typeof OS_ASSETS !== 'undefined' && OS_ASSETS.icons) || {};
  os.icons = { ...resi, ...custom };
  os.logoSvg = '<svg viewBox="0 0 100 100" aria-label="Labs"><g transform="rotate(-1.4 50 50)"><rect x="3" y="3" width="94" height="94" rx="17" fill="#6656D2"/></g><path fill="#fff" d="M25.4 28.4L48.4 23.2L50.7 33.4L66.2 29.9L74.8 67.8L36.4 76.6Z"/></svg>';
  os.icon = (name, cls = '') => `<span class="icon ${cls}">${os.icons[name] || os.icons.question || ''}</span>`;
  os.iconEl = (name, cls = '') => { const s = document.createElement('span'); s.className = 'icon ' + cls; s.innerHTML = os.icons[name] || os.icons.question || ''; return s; };
  os.bricky = (blink = false) => (typeof OS_ASSETS !== 'undefined' ? (blink ? OS_ASSETS.brickyBlink : OS_ASSETS.bricky) : '');

  // ---------- app registry ----------
  os.registerApp = (spec) => {
    if (!spec || !spec.id || typeof spec.mount !== 'function') {
      console.error('[OS] registerApp needs at least {id, mount}', spec);
      return;
    }
    if (os.apps[spec.id]) console.warn(`[OS] app '${spec.id}' registered twice; the second one replaces the first`);
    os.apps[spec.id] = {
      name: spec.title || spec.id, title: spec.title || spec.id, icon: 'question', desc: '', keywords: [],
      multi: false, float: false, size: [720, 480], hidden: false, ...spec,
    };
  };

  return os;
})();
const registerApp = OS.registerApp;
window.OS = OS; // for tools/shot.mjs and the console
