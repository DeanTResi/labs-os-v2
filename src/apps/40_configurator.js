// Configurator (id configurator): the v3 extension configurator, after five design reviews, booked for a sixth.
// Left: a 3D view with its own house builder on OS.r3d (it never shares Composer's). Right: the Design panel.
//
// THE DESIGN REVIEW CONTRACT. This block is its only definition: 41_design_review.js emits, this file applies.
//   OS.emit('design-review:apply', fixes)   fixes: an array of plain objects, applied in order and literally.
//     {kind: 'radius', delta}             corner radius of cards, tiles and buttons, px (4..20)
//     {kind: 'gap', delta}                gap between tiles, px (4..14)
//     {kind: 'priceBarOffset', delta}     the price bar moves by delta px; negative is up (-12..8)
//     {kind: 'priceSize', delta}          price text size, px (18..24)
//     {kind: 'iconScale', value}          share of its tile a type icon fills (0.5..0.9)
//     {kind: 'tileCols', value}           extension type tile columns: 2 or 3
//     {kind: 'selected', value}           the selected tile: 'ring' or 'fill'
//     {kind: 'headingCase', value}        'sentence', 'title' or 'upper'
//     {kind: 'headingWeight', delta}      section heading weight (500..800)
//     {kind: 'rename', from, to}          any label whose current text is `from` becomes `to`
//     {kind: 'vatTick', value}            where the VAT tick sits: 'bar', 'heading' or 'both'
//     {kind: 'frames', value}             extension window frames: 'white', 'anthracite' or 'black'
//     {kind: 'roofPitch', delta}          pitched extension roofs, degrees (10..30)
//     {kind: 'option', ext, option, on}   shows (on: true) or removes a roof option, e.g. ext 'side', option 'gabled'
//     {kind: 'none'}                      no change
//     {kind: 'reset'}                     every fix undone: the design as it was before round 1
//   OS.store 'design-review.round'   the round the board holds next, 1..10 (default 6). The board writes it, then emits.
//   OS.store 'configurator.style'    the style after every fix so far. Written here, by a listener that runs with
//                                     no window open. Nothing else reads it.
//   OS.emit('configurator:style-request', reply)   answered at once: reply({...style, text: {save, breakdown}, frameHex}).
//                                     The board's miniature draws from this, so it keeps no copy of the defaults.
//   OS.emit('configurator:feedback', {rating, part, reason, round})   the one feedback prompt's answer.
(() => {
  const { h } = OS;
  const P = 'configurator-';
  const K = (s) => s.split(' ').filter(Boolean).map((c) => P + c).join(' ');
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ====================================================================== style: what the design reviews change

  const BASE_STYLE = {
    radius: 12, gap: 8, priceBarOffset: 0, priceSize: 20, iconScale: 0.72, tileCols: 3, selected: 'ring',
    headingCase: 'sentence', headingWeight: 650, vatTick: 'both', frames: 'anthracite', roofPitch: 15,
    removed: { 'side:gabled': true }, labels: {},
  };
  const LIMITS = { radius: [4, 20], gap: [4, 14], priceBarOffset: [-12, 8], priceSize: [18, 24], iconScale: [0.5, 0.9], headingWeight: [500, 800], roofPitch: [10, 30] };
  const ENUMS = { tileCols: [2, 3], selected: ['ring', 'fill'], headingCase: ['sentence', 'title', 'upper'], vatTick: ['bar', 'heading', 'both'], frames: ['white', 'anthracite', 'black'] };
  const LABELS = {
    save: 'Save design', saving: 'Saving…', saved: 'Design saved', breakdown: 'See breakdown',
    homeTitle: 'This home', editHome: 'Edit home', type: 'Extension type', size: 'Size', roof: 'Roof', wall: 'Wall material',
    roofMat: 'Roof material', cost: 'Cost estimate', loan: 'Loan calculator', part: 'Which part are you referring to?',
  };

  function applyFix(s, f) {
    if (!f || typeof f !== 'object') return s;
    const k = f.kind;
    if (k === 'reset') return clone(BASE_STYLE);
    if (LIMITS[k]) {
      const v = typeof f.delta === 'number' ? s[k] + f.delta : typeof f.value === 'number' ? f.value : s[k];
      s[k] = OS.clamp(Math.round(v * 100) / 100, LIMITS[k][0], LIMITS[k][1]);
    } else if (ENUMS[k]) {
      if (ENUMS[k].includes(f.value)) s[k] = f.value;
    } else if (k === 'rename') {
      for (const key of Object.keys(LABELS)) {
        if ((s.labels[key] ?? LABELS[key]) !== f.from) continue;
        if (f.to === LABELS[key]) delete s.labels[key]; else s.labels[key] = String(f.to);
      }
    } else if (k === 'option') {
      const id = `${f.ext}:${f.option}`;
      if (f.on) delete s.removed[id]; else s.removed[id] = true;
    }
    return s;
  }
  const loadStyle = () => {
    const s = { ...clone(BASE_STYLE), ...OS.store.get('configurator.style', {}) };
    s.labels = { ...s.labels }; s.removed = { ...s.removed };
    return s;
  };
  const roundNow = () => OS.clamp(Number(OS.store.get('design-review.round', 6)) || 6, 1, 10);
  const label = (s, key) => s.labels[key] ?? LABELS[key];

  // Runs with no configurator open, so the board's fixes are never lost.
  const live = new Set();
  OS.on('design-review:apply', (fixes) => {
    if (!Array.isArray(fixes)) return;
    const before = loadStyle();
    let after = clone(before);
    for (const f of fixes) after = applyFix(after, f);
    OS.store.set('configurator.style', after);
    for (const w of live) w.state.onReview?.(fixes, before, after);
  });
  OS.on('configurator:style-request', (reply) => {
    if (typeof reply !== 'function') return;
    const s = loadStyle();
    reply({ ...s, text: { save: label(s, 'save'), breakdown: label(s, 'breakdown') }, frameHex: FRAME3[s.frames] });
  });

  // ====================================================================== catalogue and pricing

  const TYPES = [
    { key: 'existing', label: 'Existing' },
    { key: 'rear', label: 'Rear extension' },
    { key: 'side', label: 'Side extension' },
    { key: 'infill', label: 'Side infill' },
    { key: 'loft', label: 'Loft' },
    { key: 'wrap', label: 'Wraparound' },
  ];
  const HOME_TYPES = { semi: 'Semi-detached', end: 'End terrace', terrace: 'Terraced' };
  const HOME_WALLS = { 'brick-render': 'Brick + render', 'red-brick': 'Red brick', 'london-stock': 'London stock', render: 'Render' };
  const ADDRESS = '12 Purlin Road, Eavesham';
  const AREAS = { rear: [18, 24, 30], side: [12, 15, 18], infill: [8, 10, 12], loft: [20, 26, 32], wrap: [28, 36, 44] };
  const SIZE_NAMES = ['Small', 'Medium', 'Large'];
  const ROOF_SHAPES = { rear: ['flat', 'pitched'], side: ['flat', 'pitched', 'gabled'] };
  const ROOF_LABELS = { flat: 'Flat roof', pitched: 'Pitched roof', gabled: 'Gabled roof' };
  const WALL_OPTIONS = [['red-brick', 'Red brick'], ['yellow-brick', 'Yellow brick'], ['white-render', 'White render'], ['zinc', 'Zinc'], ['timber', 'Timber']];
  const ROOF_OPTIONS = [['clay', 'Clay tiles'], ['concrete', 'Concrete tiles'], ['slate', 'Slate tiles']];
  const LOFT_EXTRA = [['zinc', 'Zinc'], ['timber', 'Timber']];
  const MAT_NAMES = Object.fromEntries([...WALL_OPTIONS, ...ROOF_OPTIONS]);

  // £ per m² of floor, low and high. The cost engine prices by area alone.
  const RATE = { rear: [2050, 2750], side: [1950, 2650], infill: [2350, 3150], loft: [1650, 2250], wrap: [2250, 3000] };
  const FACADE = { rear: 0.9, side: 1.15, infill: 0.55, wrap: 0.85, loft: 0.45 };
  const WALL_DELTA = { 'red-brick': [0, 0], 'yellow-brick': [10, 25], 'white-render': [-15, 0], zinc: [110, 170], timber: [35, 65] };
  const ROOF_DELTA = { slate: [0, 0], clay: [18, 30], concrete: [-12, -4], zinc: [95, 150], timber: [30, 55] };
  const GLAZING = { rear: [180, 520], side: [120, 340], infill: [420, 980], wrap: [260, 650], loft: [110, 300] };
  const APR = 0.079;

  const ROWS = [
    { key: 'shell', label: 'Shell construction', locked: true, note: 'Foundations, external walls, roof structure and covering, structural openings.' },
    { key: 'glazing', label: 'Glazing', note: 'A single rooflight is much less than a full wall of bifolds.' },
    { key: 'kitchen', label: 'Kitchen', note: 'Laminate to quartz to natural stone is roughly a 5× spread.' },
    { key: 'bathroom', label: 'Bathroom', note: 'A single WC versus a full ensuite plus family bathroom.' },
    { key: 'fees', label: 'Professional fees', note: 'Architectural designs, structural engineering, building control, party wall notices.' },
    { key: 'contingency', label: '10% contingency', note: 'Small spec choices that compound.' },
    { key: 'vat', label: 'VAT · 20%', note: 'Added to everything ticked above.' },
  ];

  const r500 = (v) => Math.round(v / 500) * 500;
  function estimate(d) {
    if (d.ext === 'existing') return null;
    const A = AREAS[d.ext][d.size];
    const fac = A * FACADE[d.ext];
    const [rl, rh] = RATE[d.ext];
    const wall = d.ext === 'loft' ? [0, 0] : WALL_DELTA[d.wall] || [0, 0];
    const roof = ROOF_DELTA[d.roofMat] || [0, 0];
    const roofArea = d.ext === 'loft' ? fac : A;
    const v = {
      shell: [A * rl + fac * wall[0] + roofArea * roof[0], A * rh + fac * wall[1] + roofArea * roof[1]],
      glazing: [A * GLAZING[d.ext][0], A * GLAZING[d.ext][1]],
      kitchen: [9000, 28000],
      bathroom: [6000, 15000],
    };
    v.fees = [v.shell[0] * 0.11, v.shell[1] * 0.15];
    const on = (k) => k === 'shell' || d.ticks[k];
    const sum = (keys, i) => keys.filter(on).reduce((s, k) => s + v[k][i], 0);
    const base = ['shell', 'glazing', 'kitchen', 'bathroom', 'fees'];
    v.contingency = [sum(base, 0) * 0.1, sum(base, 1) * 0.1];
    const pre = [...base, 'contingency'];
    v.vat = [sum(pre, 0) * 0.2, sum(pre, 1) * 0.2];
    const rows = ROWS.map((r) => ({ ...r, low: r500(v[r.key][0]), high: r500(v[r.key][1]), on: on(r.key) }));
    const all = [...pre, 'vat'];
    return { area: A, rows, low: r500(sum(all, 0)), high: r500(sum(all, 1)) };
  }
  const money = (n) => '£' + Math.round(n).toLocaleString('en-GB');
  const range = (lo, hi) => `${money(lo)} – ${money(hi)}`;
  const sizeMeasure = (ext, i) => {
    const A = AREAS[ext][i];
    if (ext === 'loft') return `${A} m²`;
    return `${OS.data.displayWidthM} × ${Math.round((A / OS.data.displayWidthM) * 2) / 2}m`;
  };
  function available(ext, home) {
    if (ext === 'side' && home.type === 'terrace') return 'Needs a side';
    if (ext === 'infill' && home.type === 'semi') return 'Needs a side return';
    return '';
  }

  // ====================================================================== 3D: the house builder

  const D2R = Math.PI / 180;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const hexOf = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, t) => hexOf(rgbOf(a).map((v, i) => v + (rgbOf(b)[i] - v) * t));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const GEO = { DM: 7.6, EH: 5.4, OV: 0.28, PITCH: 40, OW: 2.8, DO: 4.4, OUT_EH: 4.75, OUT_RISE: 0.5, SW: 2.6, FLAT: 2.8, SLAB: 0.26 };
  const HOME_W = { semi: 6.0, end: 5.3, terrace: 5.3 };
  const MAT3 = {
    'red-brick': '#a85b42', 'yellow-brick': '#d2b27c', 'white-render': '#efebe2', zinc: '#808b95', timber: '#ab7c50',
    clay: '#ae6141', concrete: '#7b766f', slate: '#46505b',
  };
  const WALLS3 = { 'brick-render': ['#a2583f', '#ece5d6'], 'red-brick': ['#a45c44', '#a45c44'], 'london-stock': ['#c8a777', '#c8a777'], render: ['#e8e2d4', '#e8e2d4'] };
  const FRAME3 = { white: '#f1f0ea', anthracite: '#3b3f45', black: '#222428' };
  const OURS = { frame: '#f2f0ea', glass: '#6c8398', door: '#2f5b4d', lintel: '#cdc5b6', sill: '#d8d1c3', gutter: '#3d4045', membrane: '#4a4d52', fascia: '#3a3c40', kerb: '#d8d5ce', lantern: '#9fbad0' };
  const CLAY = { low: '#d9d4cb', up: '#d9d4cb', roof: '#b5aea4', frame: '#ebe8e2', glass: '#bcc3ca', door: '#cdc7bd', lintel: '#d2ccc2', sill: '#d2ccc2' };
  const GROUND = { lawn: '#8ea873', soil: '#6f5a48', pave: '#cbc6bc', kerb: '#b3aea4', road: '#5e6064', line: '#e6e2d8', path: '#c4baa8', fence: '#a98c6c', trunk: '#6e5643', leaf: '#6c8e55', leaf2: '#7f9c5e' };
  const EDGE = 'rgba(28,22,18,.2)';
  const UP = [0, 1, 0];
  const KEY = norm([0.42, 0.92, 0.3]);

  function makeBuilder() {
    const faces = [];
    let g = 0;
    const hero = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    const B = {
      faces, hero,
      group: () => ++g,
      add(fs, o = {}) {
        const grp = o.group ?? ++g;
        for (const f of fs) {
          f.base = f.color; f.rgb = rgbOf(f.color); f.emissive = true; f.group = grp;
          f.cast = o.cast ?? !f.panel;
          f.edge = o.edge !== undefined ? o.edge : f.panel ? false : EDGE;
          if (o.sticker || (f.panel && o.sticker !== false)) { f.sticker = true; f.eps = 0.01 + (o.bias || 0); } else if (o.bias) f.bias = (f.bias || 0) + o.bias;
          if (o.attachTo) { f.attachTo = o.attachTo; f.eps = o.eps ?? 0.03; }
          if (o.tag) f.tag = o.tag;
          if (o.k != null) f.flatK = o.k;
          if (o.hero) for (const p of f.pts) for (let i = 0; i < 3; i++) { hero.min[i] = Math.min(hero.min[i], p[i]); hero.max[i] = Math.max(hero.max[i], p[i]); }
          faces.push(f);
        }
        return fs;
      },
      poly(pts, color, n, o = {}) { return B.add([{ pts, color, n }], o); },
    };
    return B;
  }
  const S = () => OS.r3d.shapes;

  // Windows and doors are panels on a wall face. a runs along the wall, b is the wall plane.
  function pane(B, face, a, y, b, w, hh, col, o = {}) { return B.add(S().panel(face, a, y, b, w, hh, col), { cast: false, edge: false, ...o }); }
  function windowAt(B, face, a, y, b, w, hh, C, o = {}) {
    const t = 0.06;
    const tag = o.tag;
    if (C.lintel && !o.plain) {
      pane(B, face, a - 0.06, y + hh, b, w + 0.12, 0.16, C.lintel, { tag });
      pane(B, face, a - 0.05, y - 0.07, b, w + 0.1, 0.07, C.sill, { tag });
    }
    pane(B, face, a, y, b, w, hh, C.frame, { tag });
    const cols = w > 1.25 ? 2 : 1;
    const rows = o.rows ?? (hh > 1.1 && !o.plain ? 2 : 1);
    const gw = (w - 2 * t - (cols - 1) * 0.05) / cols;
    const gh = (hh - 2 * t - (rows - 1) * 0.05) / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) pane(B, face, a + t + c * (gw + 0.05), y + t + r * (gh + 0.05), b, gw, gh, C.glass, { bias: 0.012, tag });
    }
  }
  function glazing(B, face, a, y, b, w, hh, leaves, frame, glass, tag) {
    pane(B, face, a, y, b, w, hh, frame, { tag });
    const t = 0.05; const gap = 0.045;
    const gw = (w - 2 * t - (leaves - 1) * gap) / leaves;
    for (let i = 0; i < leaves; i++) pane(B, face, a + t + i * (gw + gap), y + t, b, gw, hh - 2 * t, glass, { bias: 0.012, tag });
  }

  // A sloped surface (a lean-to's top) as a function, so rooflights can sit on it.
  function leanSurface(x, z, w, d, y0, rise, high) {
    if (high === 'z1') return { Y: (px, pz) => y0 + (rise * (pz - z)) / d, n: norm([0, d, -rise]) };
    if (high === 'z0') return { Y: (px, pz) => y0 + (rise * (z + d - pz)) / d, n: norm([0, d, rise]) };
    if (high === 'x0') return { Y: (px) => y0 + (rise * (x + w - px)) / w, n: norm([rise, w, 0]) };
    return { Y: (px) => y0 + (rise * (px - x)) / w, n: norm([-rise, w, 0]) };
  }
  function onSlope(B, surf, x0, z0, x1, z1, col, lift, o = {}) {
    const p = (x, z) => [x + surf.n[0] * lift, surf.Y(x, z) + surf.n[1] * lift, z + surf.n[2] * lift];
    return B.poly([p(x0, z0), p(x1, z0), p(x1, z1), p(x0, z1)], col, surf.n, { cast: false, edge: false, sticker: true, ...o });
  }
  function rooflight(B, surf, x0, z0, x1, z1, frame, glass, tag) {
    onSlope(B, surf, x0, z0, x1, z1, frame, 0.03, { tag });
    const ix = Math.min(0.07, (x1 - x0) / 4); const iz = Math.min(0.07, (z1 - z0) / 4);
    onSlope(B, surf, x0 + ix, z0 + iz, x1 - ix, z1 - iz, glass, 0.04, { bias: 0.012, tag });
  }

  // A lean-to volume: slope in the roof colour, the triangles and the high wall in the wall colour.
  function lean(B, x, y, z, w, rise, d, high, roofCol, wallCol, o = {}) {
    const fs = S().lean(x, y, z, w, rise, d, roofCol, high);
    for (const f of fs) if (f.kind !== 'slope') f.color = wallCol;
    const g = B.group();
    B.add(fs.filter((f) => f.kind !== 'slope'), { group: g, ...o, tag: o.wallTag || o.tag });
    B.add(fs.filter((f) => f.kind === 'slope'), { group: g, ...o });
    return leanSurface(x, z, w, d, y, rise, high);
  }

  function octa(B, cx, cy, cz, r, ry, col, o = {}) {
    const P6 = [[cx + r, cy, cz], [cx, cy, cz + r], [cx - r, cy, cz], [cx, cy, cz - r]];
    const T = [cx, cy + ry, cz]; const D = [cx, cy - ry * 0.7, cz];
    const fs = [];
    for (let i = 0; i < 4; i++) {
      const a = P6[i]; const b = P6[(i + 1) % 4];
      fs.push({ pts: [a, b, T] }, { pts: [b, a, D] });
    }
    return B.add(OS.r3d.solid(fs, { color: col }), o);
  }

  // One house of the row. Local u runs from 0 (the party side, where the outrigger sits) to W (the outer side).
  function houseUnit(B, u, ctx) {
    const { W, home } = ctx;
    const { DM, EH, OV } = GEO;
    const zF = DM / 2; const zR = -DM / 2;
    const XS = (a, w) => (u.mirror ? u.x0 + W - a - w : u.x0 + a);
    const X = (a) => (u.mirror ? u.x0 + W - a : u.x0 + a);
    const side = (s) => (u.mirror ? (s === 'left' ? 'right' : 'left') : s);
    const ours = u.ours;
    const C = ours ? { ...OURS, low: WALLS3[home.walls][0], up: WALLS3[home.walls][1], roof: home.type === 'semi' ? '#8f513e' : '#4b525d' } : { ...CLAY };
    const tag = ours ? 'home' : 'neighbour';
    const hero = ours;
    const ext = ours ? ctx.ext : 'existing';
    const terrace = home.type !== 'semi';

    // Walls: brick below and render above for "Brick + render", one box otherwise.
    const skip = ['top', 'bottom'];
    if (u.left) skip.push('left');
    if (u.right) skip.push('right');
    const gw = B.group();
    const body = C.low !== C.up
      ? [...B.add(S().box(u.x0, 0, zR, W, 2.7, DM, C.low, { skip }), { group: gw, tag, hero }), ...B.add(S().box(u.x0, 2.7, zR, W, EH - 2.7, DM, C.up, { skip }), { group: gw, tag, hero })]
      : B.add(S().box(u.x0, 0, zR, W, EH, DM, C.low, { skip }), { group: gw, tag, hero });
    const fa = { attachTo: body.filter((f) => f.side === 'front') };

    // Front: door by the party wall, a bay on the outer side.
    const doorA = terrace ? 0.45 : 0.55; const doorW = 0.95;
    const dx = XS(doorA, doorW);
    pane(B, 'front', dx - 0.07, 0, zF, doorW + 0.14, 2.52, C.frame, { tag });
    pane(B, 'front', dx, 0, zF, doorW, 2.12, C.door, { bias: 0.012, tag });
    pane(B, 'front', dx + 0.06, 2.17, zF, doorW - 0.12, 0.29, C.glass, { bias: 0.012, tag });
    if (ours) B.add(S().box(dx - 0.18, 0, zF, doorW + 0.36, 0.12, 0.38, '#bdb5a6', { skip: ['bottom'] }), { tag, cast: false, ...fa });
    if (!terrace) B.add(S().box(dx - 0.28, 2.6, zF, doorW + 0.56, 0.1, 0.78, ours ? '#3c3f44' : CLAY.roof, { skip: ['bottom'] }), { tag, ...fa });

    const bayW = terrace ? 2.3 : 2.4; const bayA = W - bayW - (terrace ? 0.45 : 0.6); const bayD = terrace ? 0.65 : 0.75;
    const bx = XS(bayA, bayW);
    const bayH = terrace ? 2.95 : 5.0;
    const gb = B.group();
    if (C.low !== C.up && bayH > 2.7) {
      B.add(S().box(bx, 0, zF, bayW, 2.7, bayD, C.low, { skip: ['back', 'bottom', 'top'] }), { group: gb, tag, hero, ...fa });
      B.add(S().box(bx, 2.7, zF, bayW, bayH - 2.7, bayD, C.up, { skip: ['back', 'bottom'] }), { group: gb, tag, hero, ...fa });
    } else B.add(S().box(bx, 0, zF, bayW, bayH, bayD, C.low, { skip: ['back', 'bottom'] }), { group: gb, tag, hero, ...fa });
    if (terrace) lean(B, bx - 0.1, bayH, zF, bayW + 0.2, 0.42, bayD + 0.12, 'z0', C.roof, C.roof, { tag, ...fa, eps: 0.04 });
    else B.add(S().hip(bx - 0.12, bayH, zF - 0.02, bayW + 0.24, 0.36, bayD + 0.16, C.roof), { tag, ...fa, eps: 0.04 });
    const bz = zF + bayD;
    windowAt(B, 'front', bx + 0.22, 0.85, bz, bayW - 0.44, 1.45, C, { tag, plain: !ours });
    pane(B, 'left', zF + 0.17, 0.85, bx, 0.4, 1.45, C.glass, { tag });
    pane(B, 'right', zF + 0.17, 0.85, bx + bayW, 0.4, 1.45, C.glass, { tag });
    if (!terrace) {
      windowAt(B, 'front', bx + 0.22, 3.45, bz, bayW - 0.44, 1.2, C, { tag, plain: !ours });
      pane(B, 'left', zF + 0.17, 3.45, bx, 0.4, 1.2, C.glass, { tag });
      pane(B, 'right', zF + 0.17, 3.45, bx + bayW, 0.4, 1.2, C.glass, { tag });
      windowAt(B, 'front', XS(0.62, 0.8), 3.85, zF, 0.8, 0.95, C, { tag, plain: !ours, rows: 1 });
    } else {
      windowAt(B, 'front', XS(0.45, 0.95), 3.5, zF, 0.95, 1.45, C, { tag, plain: !ours });
      windowAt(B, 'front', XS(W - 2.55, 1.9), 3.5, zF, 1.9, 1.45, C, { tag, plain: !ours });
    }

    // Rear and the outrigger.
    const coverRear = ext === 'rear' || ext === 'wrap';
    if (!terrace) {
      if (!coverRear) {
        windowAt(B, 'back', XS(0.65, 1.5), 0.9, zR, 1.5, 1.2, C, { tag, plain: !ours });
        glazing(B, 'back', XS(3.1, 1.0), 0, zR, 1.0, 2.15, 1, C.frame, C.glass, tag);
      }
      windowAt(B, 'back', XS(0.75, 1.25), 3.95, zR, 1.25, 1.1, C, { tag, plain: !ours });
      windowAt(B, 'back', XS(3.35, 1.25), 3.95, zR, 1.25, 1.1, C, { tag, plain: !ours });
      if (!u.right && !(ours && (ext === 'side' || ext === 'wrap'))) windowAt(B, side('right'), -0.55, 3.0, X(W), 0.85, 1.15, C, { tag, plain: !ours, rows: 1 });
    } else {
      const coverReturn = ext === 'infill' || ext === 'wrap';
      if (!coverReturn) windowAt(B, 'back', XS(GEO.OW + 0.45, W - GEO.OW - 0.9), 0.9, zR, W - GEO.OW - 0.9, 1.25, C, { tag, plain: !ours });
      windowAt(B, 'back', XS(GEO.OW + 0.45, W - GEO.OW - 0.9), 3.6, zR, W - GEO.OW - 0.9, 1.25, C, { tag, plain: !ours });
      const OW = GEO.OW; const DO = GEO.DO;
      const zo = zR - DO;
      const oskip = ['top', 'bottom', 'front'];
      if (u.left && !u.mirror) oskip.push('left');
      if (u.right && u.mirror) oskip.push('right');
      const go = B.group();
      if (C.low !== C.up) {
        B.add(S().box(XS(0, OW), 0, zo, OW, 2.7, DO, C.low, { skip: oskip }), { group: go, tag, hero });
        B.add(S().box(XS(0, OW), 2.7, zo, OW, GEO.OUT_EH - 2.7, DO, C.up, { skip: oskip }), { group: go, tag, hero });
      } else B.add(S().box(XS(0, OW), 0, zo, OW, GEO.OUT_EH, DO, C.low, { skip: oskip }), { group: go, tag, hero });
      lean(B, XS(0, OW), GEO.OUT_EH, zo, OW, GEO.OUT_RISE, DO, u.mirror ? 'x1' : 'x0', C.roof, C.up, { tag, hero });
      const rs = side('right'); const rx = X(OW);
      if (!coverReturn) windowAt(B, rs, zR - 3.35, 0.9, rx, 1.1, 1.2, C, { tag, plain: !ours });
      windowAt(B, rs, zR - 3.35, 3.3, rx, 1.1, 1.1, C, { tag, plain: !ours, rows: 1 });
      if (!coverRear) windowAt(B, 'back', XS(0.65, 1.3), 0.9, zo, 1.3, 1.2, C, { tag, plain: !ours });
      windowAt(B, 'back', XS(0.7, 1.2), 3.3, zo, 1.2, 1.1, C, { tag, plain: !ours, rows: 1 });
    }

    // Main roof. Ends are 'party' (another house continues the roof), 'hip' or 'gable'.
    const p = GEO.PITCH * D2R; const tp = Math.tan(p);
    const rise = (DM / 2 + OV) * tp; const ridge = EH + rise;
    const xl = u.x0; const xr = u.x0 + W;
    const eavesX = (end, x, dir) => (end === 'party' ? x : end === 'hip' ? x + dir * OV : x + dir * 0.12);
    const ridgeX = (end, x, dir) => (end === 'party' ? x : end === 'hip' ? x + dir * OV - dir * (DM / 2 + OV) : x + dir * 0.12);
    const eL = eavesX(u.endL, xl, -1); const eR = eavesX(u.endR, xr, 1);
    const rL = ridgeX(u.endL, xl, -1); const rR = ridgeX(u.endR, xr, 1);
    const zEf = zF + OV; const zEr = zR - OV;
    const nF = [0, Math.cos(p), Math.sin(p)]; const nB = [0, Math.cos(p), -Math.sin(p)];
    const gr = B.group();
    const ro = { group: gr, tag, hero };
    B.poly([[eL, EH, zEf], [eR, EH, zEf], [rR, ridge, 0], [rL, ridge, 0]], C.roof, nF, ro);
    const slopeY = (z) => EH + (z - zEr) * tp;
    if (ours && ext === 'loft') {
      // A rear box dormer: the slope is cut into pieces round it, so the painter sorts them well.
      const dw = Math.min(W - 0.65, [0.55, 0.75, 0.92][Math.round(ctx.sizeT)] * W);
      const a = xl + 0.3; const b = a + dw;
      const zd = zR + 0.95; const zt = -0.3;
      const SP = (x, z) => [x, slopeY(z), z];
      B.poly([SP(eR, zEr), SP(eL, zEr), SP(eL, zd), SP(eR, zd)], C.roof, nB, ro);
      B.poly([SP(a, zd), SP(eL, zd), SP(rL, 0), SP(a, 0)], C.roof, nB, ro);
      B.poly([SP(eR, zd), SP(b, zd), SP(b, 0), SP(rR, 0)], C.roof, nB, ro);
      B.poly([SP(b, zt), SP(a, zt), SP(a, 0), SP(b, 0)], C.roof, nB, ro);
      ctx.dormer = { a, b, zd, zt, yb: slopeY(zd) - 0.04, yt: ridge - 0.14 };
    } else {
      B.poly([[eR, EH, zEr], [eL, EH, zEr], [rL, ridge, 0], [rR, ridge, 0]], C.roof, nB, ro);
    }
    if (u.endR === 'hip') B.poly([[eR, EH, zEf], [eR, EH, zEr], [rR, ridge, 0]], C.roof, [Math.sin(p), Math.cos(p), 0], ro);
    if (u.endL === 'hip') B.poly([[eL, EH, zEr], [eL, EH, zEf], [rL, ridge, 0]], C.roof, [-Math.sin(p), Math.cos(p), 0], ro);
    const gableTop = EH + (DM / 2) * tp;
    if (u.endR === 'gable') B.poly([[xr, EH, zF], [xr, EH, zR], [xr, gableTop, 0]], C.up, [1, 0, 0], { group: gw, tag, hero });
    if (u.endL === 'gable') B.poly([[xl, EH, zR], [xl, EH, zF], [xl, gableTop, 0]], C.up, [-1, 0, 0], { group: gw, tag, hero });
    B.poly([[eL, EH - 0.002, zEr], [eR, EH - 0.002, zEr], [eR, EH - 0.002, zEf], [eL, EH - 0.002, zEf]], ours ? '#e9e4da' : CLAY.frame, [0, -1, 0], { cast: false, tag });

    if (ours) {
      B.add(S().box(eL, EH - 0.1, zEf - 0.03, eR - eL, 0.09, 0.09, C.gutter, { skip: ['bottom'] }), { tag, cast: false, edge: false });
      B.add(S().box(eL, EH - 0.1, zEr - 0.06, eR - eL, 0.09, 0.09, C.gutter, { skip: ['bottom'] }), { tag, cast: false, edge: false });
      B.add(S().box(X(0.12) - (u.mirror ? 0.08 : 0), 0, zF + 0.02, 0.08, EH - 0.12, 0.08, C.gutter), { tag, cast: false, edge: false });
      ctx.roofInfo = { ridge, rise, tp, slopeY, zEf, zEr, xl, xr, gableTop };
    }
    return { ridge };
  }

  function chimney(B, x, ridge, col, ours) {
    const g = B.group();
    B.add(S().box(x - 0.42, ridge - 0.85, -0.55, 0.84, 1.75, 1.1, col, { skip: ['bottom'] }), { group: g, tag: ours ? 'home' : 'neighbour' });
    for (const dz of [-0.25, 0.25]) B.add(S().box(x - 0.09, ridge + 0.9, dz - 0.09, 0.18, 0.34, 0.18, ours ? '#b5653f' : CLAY.roof, { skip: ['bottom'] }), { group: g });
  }

  // The proposed extension. Every coordinate is in metres; the appearing animation scales y afterwards.
  function extension(B, ctx, d, a, style) {
    const { W, home } = ctx;
    const { DM, OW, DO, SW, FLAT, SLAB } = GEO;
    const zF = DM / 2; const zR = -DM / 2;
    const terrace = home.type !== 'semi';
    const wallCol = hexOf(a.wall); const roofCol = hexOf(a.roof);
    const fr = FRAME3[style.frames] || FRAME3.anthracite; const gl = OURS.glass;
    const C = { frame: fr, glass: gl, lintel: null, sill: null };
    const k = a.sizeT;
    const pick = (arr) => { const i = Math.floor(k); const f = k - i; return i >= arr.length - 1 ? arr[arr.length - 1] : arr[i] + (arr[i + 1] - arr[i]) * f; };
    const tW = { tag: 'ext-wall', hero: true }; const tR = { tag: 'ext-roof', hero: true };
    const pitch = a.pitch * D2R;
    const shape = d.roofShape[d.ext] || 'flat';

    const flatBlock = (x, z, w, dd, skip, over) => {
      B.add(S().box(x, 0, z, w, FLAT, dd, wallCol, { skip: [...skip, 'bottom', 'top'] }), tW);
      const o = { l: 0.06, r: 0.06, b: 0.06, f: 0.06, ...over };
      const slab = S().box(x - o.l, FLAT, z - o.b, w + o.l + o.r, SLAB, dd + o.b + o.f, OURS.fascia, { skip: [...skip, 'bottom'] });
      for (const f of slab) if (f.side === 'top') f.color = roofCol;
      B.add(slab, tR);
    };
    const lanternOn = (cx, cz, lw, ld) => {
      const y = FLAT + SLAB;
      B.add(S().box(cx - lw / 2, y, cz - ld / 2, lw, 0.16, ld, OURS.kerb, { skip: ['bottom', 'top'] }), { tag: 'ext-roof', bias: 0.1 });
      B.add(S().hip(cx - lw / 2 + 0.02, y + 0.16, cz - ld / 2 + 0.02, lw - 0.04, 0.42, ld - 0.04, OURS.lantern), { tag: 'ext-roof', edge: fr, bias: 0.12 });
    };

    if (d.ext === 'rear') {
      const D = pick([3, 4, 5]);
      const z1 = terrace ? zR - DO : zR; const z0 = z1 - D;
      const x = 0; const w = W;
      if (shape === 'pitched') {
        const maxTop = terrace ? 3.15 : 3.85;
        const run = D; const want = run * Math.tan(pitch);
        const eave = Math.max(2.1, maxTop - want); const rise = Math.min(want, maxTop - eave);
        B.add(S().box(x, 0, z0, w, eave, D, wallCol, { skip: ['bottom', 'top', 'front'] }), tW);
        const surf = lean(B, x - 0.04, eave, z0 - 0.1, w + 0.04, rise, D + 0.1, 'z1', roofCol, wallCol, { tag: 'ext-roof', wallTag: 'ext-wall', hero: true });
        B.add(S().box(x - 0.04, eave - 0.16, z0 - 0.14, w + 0.04, 0.14, 0.12, OURS.gutter, { skip: ['bottom'] }), { tag: 'ext-roof', cast: false, edge: false });
        const n = Math.max(1, Math.round(w / 2.6));
        for (let i = 0; i < n; i++) {
          const cx = x + (w * (i + 0.5)) / n;
          rooflight(B, surf, cx - 0.42, z0 + D * 0.3, cx + 0.42, z0 + D * 0.3 + Math.min(1.3, D * 0.4), fr, OURS.lantern, 'ext-roof');
        }
        glazing(B, 'back', x + 0.45, 0, z0, Math.min(w - 0.9, 4.2), Math.min(2.15, eave - 0.15), 4, fr, gl, 'ext-wall');
      } else {
        flatBlock(x, z0, w, D, ['front'], { l: 0, f: 0 });
        lanternOn(x + w / 2, z0 + D / 2, Math.min(2.2, w * 0.4), Math.min(1.7, D * 0.45));
        glazing(B, 'back', x + 0.45, 0, z0, Math.min(w - 0.9, 4.2), 2.2, 4, fr, gl, 'ext-wall');
      }
      if (!terrace) windowAt(B, 'right', z0 + D / 2 - 0.6, 0.95, W, 1.2, 1.15, C, { tag: 'ext-wall', rows: 1 });
      else glazing(B, 'front', OW + 0.35, 0, z1, W - OW - 0.7, 2.1, 2, fr, gl, 'ext-wall');
    } else if (d.ext === 'side') {
      const Ds = pick([4.6, 5.8, 7.0]);
      const z1 = zF - 0.4; const z0 = z1 - Ds;
      const x = W; const w = SW;
      if (shape === 'pitched' || shape === 'gabled') {
        const eave = 2.55;
        B.add(S().box(x, 0, z0, w, eave, Ds, wallCol, { skip: ['bottom', 'top', 'left'] }), tW);
        if (shape === 'pitched') {
          const rise = Math.min(w * Math.tan(pitch), 1.05);
          const surf = lean(B, x, eave, z0 - 0.1, w + 0.12, rise, Ds + 0.2, 'x0', roofCol, wallCol, { tag: 'ext-roof', wallTag: 'ext-wall', hero: true });
          rooflight(B, surf, x + 0.5, z0 + Ds * 0.45, x + w - 0.5, z0 + Ds * 0.45 + 1.0, fr, OURS.lantern, 'ext-roof');
        } else {
          const rise = (w / 2 + 0.1) * Math.tan(pitch + 22 * D2R);
          B.add(S().gable(x - 0.02, eave, z0 - 0.15, w + 0.14, rise, Ds + 0.3, roofCol, 'z', { gableColor: wallCol }), tR);
        }
      } else {
        flatBlock(x, z0, w, Ds, ['left'], { l: 0 });
      }
      const eaveTop = shape === 'flat' ? FLAT : 2.55;
      windowAt(B, 'front', x + 0.5, 0.95, z1, w - 1.0, Math.min(1.25, eaveTop - 1.15), C, { tag: 'ext-wall', rows: 1 });
      windowAt(B, 'right', z0 + Ds / 2 - 0.5, 0.95, x + w, 1.0, Math.min(1.15, eaveTop - 1.2), C, { tag: 'ext-wall', rows: 1 });
      glazing(B, 'back', x + 0.4, 0, z0, w - 0.8, 2.1, 2, fr, gl, 'ext-wall');
    } else if (d.ext === 'infill') {
      const Di = pick([3.2, 3.9, 4.4]);
      const x = OW; const w = W - OW; const z0 = zR - Di;
      const eave = 2.35; const rise = Math.min(w * Math.tan(pitch + 5 * D2R), 0.8);
      B.add(S().box(x, 0, z0, w, eave, Di, wallCol, { skip: ['bottom', 'top', 'front', 'left'] }), tW);
      const surf = lean(B, x, eave, z0 - 0.08, w + 0.06, rise, Di + 0.08, 'x0', roofCol, wallCol, { tag: 'ext-roof', wallTag: 'ext-wall', hero: true });
      const panes = Math.max(2, Math.round(Di / 1.4));
      const pd = (Di - 0.5) / panes;
      for (let i = 0; i < panes; i++) rooflight(B, surf, x + 0.18, z0 + 0.25 + i * pd + 0.04, x + w - 0.22, z0 + 0.25 + (i + 1) * pd - 0.04, fr, OURS.lantern, 'ext-roof');
      glazing(B, 'back', x + 0.3, 0, z0, w - 0.6, 2.1, 3, fr, gl, 'ext-wall');
    } else if (d.ext === 'wrap') {
      const D = pick([3, 4, 5]);
      if (!terrace) {
        const z0 = zR - D;
        flatBlock(0, z0, W + SW, D, ['front'], { f: 0, l: 0 });
        const zs1 = zF - 1.4;
        flatBlock(W, zR, SW, zs1 - zR, ['back', 'left'], { l: 0, b: 0 });
        lanternOn((W + SW) / 2, z0 + D / 2, Math.min(2.4, W * 0.4), Math.min(1.7, D * 0.45));
        glazing(B, 'back', 0.5, 0, z0, W - 0.6, 2.2, 4, fr, gl, 'ext-wall');
        windowAt(B, 'right', z0 + D / 2 - 0.55, 0.95, W + SW, 1.1, 1.15, C, { tag: 'ext-wall', rows: 1 });
        windowAt(B, 'right', zR + (zs1 - zR) / 2 - 0.55, 0.95, W + SW, 1.1, 1.15, C, { tag: 'ext-wall', rows: 1 });
        windowAt(B, 'front', W + 0.5, 0.95, zs1, SW - 1.0, 1.15, C, { tag: 'ext-wall', rows: 1 });
      } else {
        const z1 = zR - DO; const z0 = z1 - D;
        flatBlock(0, z0, W, D, ['front'], { f: 0, l: 0, r: 0 });
        flatBlock(OW, z1, W - OW, DO, ['front', 'back', 'left'], { l: 0, b: 0, f: 0, r: 0 });
        lanternOn(W / 2, z0 + D / 2, Math.min(2.2, W * 0.4), Math.min(1.6, D * 0.45));
        const sy = FLAT + SLAB;
        const surf = { Y: () => sy, n: UP };
        rooflight(B, surf, OW + 0.35, z1 + 0.35, W - 0.35, zR - 0.35, fr, OURS.lantern, 'ext-roof');
        glazing(B, 'back', 0.45, 0, z0, W - 0.9, 2.2, 4, fr, gl, 'ext-wall');
      }
    } else if (d.ext === 'loft' && ctx.dormer) {
      const dm = ctx.dormer;
      const clad = roofCol;
      const box = S().box(dm.a, dm.yb, dm.zd, dm.b - dm.a, dm.yt - dm.yb, dm.zt - dm.zd, clad, { skip: ['front', 'bottom'] });
      for (const f of box) if (f.side === 'top') f.color = OURS.membrane;
      B.add(box, { tag: 'ext-roof', hero: true, bias: 0.35 });
      B.add(S().box(dm.a - 0.07, dm.yt - 0.1, dm.zd - 0.08, dm.b - dm.a + 0.14, 0.14, dm.zt - dm.zd + 0.08, OURS.fascia, { skip: ['bottom', 'front'] }), { tag: 'ext-roof', bias: 0.4, cast: false });
      const ww = dm.b - dm.a;
      const wy = dm.yb + 0.5; const wh = Math.min(1.25, dm.yt - wy - 0.35);
      if (ww > 3.6) {
        glazing(B, 'back', dm.a + 0.35, dm.yb + 0.12, dm.zd, 1.5, wh + 0.38, 2, fr, gl, 'ext-roof');
        windowAt(B, 'back', dm.b - 1.75, wy, dm.zd, 1.35, wh, C, { tag: 'ext-roof', rows: 1 });
      } else {
        windowAt(B, 'back', dm.a + 0.35, wy, dm.zd, Math.min(1.2, ww / 2 - 0.5), wh, C, { tag: 'ext-roof', rows: 1 });
        windowAt(B, 'back', dm.b - 0.35 - Math.min(1.2, ww / 2 - 0.5), wy, dm.zd, Math.min(1.2, ww / 2 - 0.5), wh, C, { tag: 'ext-roof', rows: 1 });
      }
      const ri = ctx.roofInfo;
      const nF = [0, Math.cos(GEO.PITCH * D2R), Math.sin(GEO.PITCH * D2R)];
      const fy = (z) => GEO.EH + (ri.zEf - z) * ri.tp;
      const surf = { Y: (px, pz) => fy(pz), n: nF };
      rooflight(B, surf, 1.0, 1.0, 1.75, 2.15, OURS.frame, OURS.lantern, 'ext-roof');
      rooflight(B, surf, W - 2.4, 1.0, W - 1.65, 2.15, OURS.frame, OURS.lantern, 'ext-roof');
    }
  }
  // The whole scene: the row of houses, gardens, street, our extension and the shadows.
  function buildScene(d, a, style) {
    const home = d.home;
    const W = HOME_W[home.type];
    const B = makeBuilder();
    const ctx = { W, home, ext: a.ext, sizeT: a.sizeT };
    const units = home.type === 'semi'
      ? [{ x0: -W, mirror: true }, { x0: 0, mirror: false, ours: true }]
      : home.type === 'terrace'
        ? [{ x0: -W, mirror: true }, { x0: 0, mirror: false, ours: true }, { x0: W, mirror: true }]
        : [{ x0: -2 * W, mirror: false }, { x0: -W, mirror: true }, { x0: 0, mirror: false, ours: true }];
    const at = (x) => units.some((q) => Math.abs(q.x0 - x) < 1e-6);
    const outerEnd = (q) => (home.type === 'semi' ? (q.ours && a.ext === 'loft' ? 'gable' : home.roof) : 'gable');
    for (const q of units) {
      q.left = at(q.x0 - W);
      q.right = at(q.x0 + W);
      // Outer (local u = W) is the world right unless mirrored.
      const worldOuter = q.mirror ? 'L' : 'R';
      q.endL = q.left ? 'party' : worldOuter === 'L' ? outerEnd(q) : 'gable';
      q.endR = q.right ? 'party' : worldOuter === 'R' ? outerEnd(q) : 'gable';
    }
    let ridge = 0;
    for (const q of units) ridge = houseUnit(B, q, ctx).ridge;
    const walls = new Set();
    for (const q of units) if (q.right) walls.add(q.x0 + W);
    for (const x of walls) chimney(B, x, ridge, x === 0 || x === W ? '#9c5a44' : CLAY.low, x === 0 || x === W);

    // The extension, in its own list, so it can grow out of the ground.
    if (a.ext !== 'existing') {
      const XB = makeBuilder();
      extension(XB, ctx, d, a, style);
      const g = Math.max(0.02, a.grow);
      for (const f of XB.faces) {
        if (g < 1) f.pts = f.pts.map((p) => [p[0], p[1] * g, p[2]]);
        f.group = 'x' + f.group;
        B.faces.push(f);
        if (f.tag && f.tag.startsWith('ext')) for (const p of f.pts) for (let i = 0; i < 3; i++) { B.hero.min[i] = Math.min(B.hero.min[i], p[i]); B.hero.max[i] = Math.max(B.hero.max[i], p[i]); }
      }
    }

    // Plots: fences, the garden wall, the path, the pavement and the road.
    const zF = GEO.DM / 2; const zR = -GEO.DM / 2; const E = 14;
    const back = -12.6; const frontWall = zF + 4.0;
    const xs = units.map((q) => q.x0);
    const xMin = Math.min(...xs); const xMax = Math.max(...xs) + W;
    const plotR = home.type === 'terrace' ? xMax : xMax + 3.4;
    const rearStart = home.type === 'semi' ? zR : zR - GEO.DO;
    const fence = (x0, z0, x1, z1) => B.add(S().box(Math.min(x0, x1) - 0.03, 0, Math.min(z0, z1) - 0.03, Math.abs(x1 - x0) + 0.06, 1.25, Math.abs(z1 - z0) + 0.06, GROUND.fence, { skip: ['bottom'] }), { tag: 'garden', edge: 'rgba(40,28,18,.22)' });
    for (const q of units) if (q.x0 - xMin > 1e-6) fence(q.x0, rearStart, q.x0, back);
    fence(xMin, rearStart, xMin, back);
    fence(xMin, back, plotR, back);
    fence(plotR, back, plotR, home.type === 'terrace' ? rearStart : zF);
    const wallCol = WALLS3[home.walls][0];
    for (const q of units) {
      const doorA = home.type === 'semi' ? 0.55 : 0.45;
      const dx = q.mirror ? q.x0 + W - doorA - 0.95 : q.x0 + doorA;
      const col = q.ours ? wallCol : CLAY.low;
      const lw = (x0, x1) => { if (x1 - x0 > 0.6) B.add(S().box(x0, 0, frontWall, x1 - x0, 0.75, 0.24, col, { skip: ['bottom'] }), { tag: q.ours ? 'home' : 'neighbour' }); };
      lw(q.x0, dx - 0.25);
      lw(dx + 1.2, q.x0 + W);
      B.poly([[dx - 0.1, 0.004, frontWall + 0.24], [dx + 1.05, 0.004, frontWall + 0.24], [dx + 1.05, 0.004, zF + 0.4], [dx - 0.1, 0.004, zF + 0.4]], GROUND.path, UP, { cast: false, edge: false, bias: -800, k: 1 });
    }
    if (home.type !== 'terrace') B.poly([[xMax, 0.004, frontWall + 0.24], [plotR, 0.004, frontWall + 0.24], [plotR, 0.004, zF - 0.6], [xMax, 0.004, zF - 0.6]], GROUND.path, UP, { cast: false, edge: false, bias: -800, k: 0.97 });
    const pv0 = frontWall + 0.24; const pv1 = pv0 + 2.2; const rd = pv1 + 0.18;
    B.poly([[-E, 0.003, pv1], [E, 0.003, pv1], [E, 0.003, pv0], [-E, 0.003, pv0]], GROUND.pave, UP, { cast: false, edge: false, bias: -800, k: 1 });
    B.poly([[-E, 0.003, rd], [E, 0.003, rd], [E, 0.003, pv1], [-E, 0.003, pv1]], GROUND.kerb, UP, { cast: false, edge: false, bias: -800, k: 1 });
    B.poly([[-E, 0.003, E], [E, 0.003, E], [E, 0.003, rd], [-E, 0.003, rd]], GROUND.road, UP, { cast: false, edge: false, bias: -800, k: 1 });
    for (let x = -E + 1; x < E - 1; x += 3) B.poly([[x, 0.005, (rd + E) / 2 + 0.06], [x + 1.6, 0.005, (rd + E) / 2 + 0.06], [x + 1.6, 0.005, (rd + E) / 2 - 0.06], [x, 0.005, (rd + E) / 2 - 0.06]], GROUND.line, UP, { cast: false, edge: false, bias: -790, k: 1 });

    // Trees at the end of the gardens.
    const tree = (x, z, s, col) => {
      const g = B.group();
      B.add(S().box(x - 0.13, 0, z - 0.13, 0.26, 2.3 * s, 0.26, GROUND.trunk), { group: g, tag: 'garden' });
      octa(B, x, 3.3 * s, z, 1.55 * s, 1.9 * s, col, { group: g, tag: 'garden' });
    };
    tree(xMin + 1.6, back + 1.7, 1.0, GROUND.leaf2);
    tree(xMin + 3.6, frontWall - 1.6, 0.72, GROUND.leaf);

    // The plot as a slab, so the ground has an edge.
    const slab = S().box(-E, -0.55, -E, 2 * E, 0.55, 2 * E, GROUND.soil, { skip: ['top', 'bottom'] });
    B.add(slab, { cast: false, edge: 'rgba(0,0,0,.18)', bias: -900 });

    // Shadows: one opaque hull per solid, cast along the fixed key light onto the lawn.
    const shadowCol = mixHex(GROUND.lawn, '#1f2a18', 0.3);
    const groups = new Map();
    for (const f of B.faces) {
      if (!f.cast) continue;
      if (!groups.has(f.group)) groups.set(f.group, []);
      groups.get(f.group).push(...f.pts);
    }
    const shadows = [];
    for (const pts of groups.values()) {
      const proj = pts.map((p) => [OS.clamp(p[0] - (KEY[0] * p[1]) / KEY[1], -E, E), OS.clamp(p[2] - (KEY[2] * p[1]) / KEY[1], -E, E)]);
      const hull = convexHull(proj);
      if (hull.length >= 3) shadows.push({ pts: hull.map(([x, z]) => [x, 0.002, z]), color: shadowCol, n: UP, base: shadowCol, rgb: rgbOf(shadowCol), emissive: true, flatK: 1, edge: false, bias: -850, cast: false });
    }
    B.faces.push(...shadows);
    linkHosts(B.faces);
    return B;
  }
  function convexHull(P) {
    const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const crossZ = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = []; const upper = [];
    for (const p of pts) { while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  // Painter's sort fix. Each window, door or rooflight ("sticker") sorts just after the wall or slope it sits on,
  // and each bay or canopy just after its facade, whatever the camera. Hosts are found once per build.
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const centre = (f) => { const n = f.pts.length; let x = 0; let y = 0; let z = 0; for (const p of f.pts) { x += p[0]; y += p[1]; z += p[2]; } return [x / n, y / n, z / n]; };
  function linkHosts(faces) {
    const solids = faces.filter((f) => !f.sticker && f.n && f.pts.length >= 3);
    for (const f of solids) {
      const mn = [Infinity, Infinity, Infinity]; const mx = [-Infinity, -Infinity, -Infinity];
      for (const p of f.pts) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
      f._mn = mn; f._mx = mx; f._area = Math.max(1e-3, (mx[0] - mn[0]) + 1e-3) * Math.max(1e-3, (mx[1] - mn[1]) + 1e-3) * Math.max(1e-3, (mx[2] - mn[2]) + 1e-3);
    }
    for (const f of faces) f._c = centre(f);
    for (const s of faces) {
      if (!s.sticker) continue;
      let best = null;
      for (const hf of solids) {
        if (dot(s.n, hf.n) < 0.99) continue;
        if (Math.abs(dot(hf.n, sub3(s._c, hf.pts[0]))) > 0.09) continue;
        const c = s._c; let inside = true;
        for (let i = 0; i < 3; i++) if (c[i] < hf._mn[i] - 0.05 || c[i] > hf._mx[i] + 0.05) { inside = false; break; }
        if (inside && (!best || hf._area < best._area)) best = hf;
      }
      s.host = best;
    }
  }
  function eyeOf(cam) {
    const cp = Math.cos(cam.pitch);
    return [cam.target[0] + cam.dist * cp * Math.sin(cam.yaw), cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * cp * Math.cos(cam.yaw)];
  }
  function rebias(faces, cam) {
    const eye = eyeOf(cam); const fw = norm(sub3(cam.target, eye));
    const raw = (f) => dot(sub3(f._c, eye), fw);
    const key = (f) => raw(f) - (f.panel ? 0.05 : 0) - (f.bias || 0);
    for (const f of faces) if (f.attachTo) f.bias = raw(f) - (f.panel ? 0.05 : 0) - Math.min(...f.attachTo.map(key)) + f.eps;
    for (const f of faces) if (f.sticker && f.host) f.bias = raw(f) - (f.panel ? 0.05 : 0) - key(f.host) + f.eps;
  }

  // A key light fixed to the world (it casts the shadows) and a fill that follows the camera.
  function shadeFaces(faces, yaw) {
    const fill = norm([Math.sin(yaw - 0.7), 0.5, Math.cos(yaw - 0.7)]);
    for (const f of faces) {
      if (!f.rgb) continue;
      let k;
      if (f.flatK != null) k = f.flatK;
      else {
        const n = f.n || UP;
        k = 0.5 + 0.3 * Math.max(0, dot(n, KEY)) + 0.28 * Math.max(0, dot(n, fill)) + 0.04 * Math.max(0, n[1]);
      }
      f.color = hexOf([f.rgb[0] * k, f.rgb[1] * k, f.rgb[2] * k]);
    }
  }

  // ====================================================================== small isometric icons (SVG)

  const ICON_V = norm([1, 1.05, -1.1]);
  function isoSvg(parts) {
    const F = ICON_V.map((v) => -v);
    const R = norm(cross(F, UP)); const U = cross(R, F);
    const list = [];
    for (const [fs, cls] of parts) {
      for (const f of fs) {
        const n = f.n || UP;
        if (dot(n, ICON_V) <= 1e-3) continue;
        const c = f.pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / f.pts.length);
        const tone = n[1] > 0.55 ? 0 : Math.abs(n[0]) >= Math.abs(n[2]) ? 1 : 2;
        list.push({ d: dot(c, ICON_V) + (f.lift || 0), p: f.pts.map((q) => [-dot(q, R), -dot(q, U)]), cls: P + cls + tone });
      }
    }
    list.sort((a, b) => a.d - b.d);
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const it of list) for (const [x, y] of it.p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const pad = 0.4;
    const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].map((v) => v.toFixed(2)).join(' ');
    const polys = list.map((it) => `<polygon class="${it.cls}" points="${it.p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}"/>`).join('');
    return `<svg viewBox="${vb}" aria-hidden="true">${polys}</svg>`;
  }
  const ICONS = {};
  function icon(key) {
    if (ICONS[key]) return ICONS[key];
    const s = OS.r3d.shapes;
    const house = (x = 0, cls = 'h', rcls = 'r', W = 6) => [[s.box(x, 0, -3.8, W, 5.2, 7.6, '#000', { skip: ['bottom'] }), cls], [s.gable(x - 0.1, 5.2, -4.0, W + 0.2, 3.0, 8.0, '#000', 'x'), rcls]];
    const ext = (x, z, w, d, hh = 2.8) => [[s.box(x, 0, z, w, hh, d, '#000', { skip: ['bottom'] }), 'e']];
    const outrigger = [[s.box(0, 0, -8.2, 2.8, 4.6, 4.4, '#000', { skip: ['bottom'] }), 'h'], [s.lean(0, 4.6, -8.2, 2.8, 0.6, 4.4, '#000', 'x0'), 'r']];
    const defs = {
      existing: () => [...house()],
      rear: () => [...house(), ...ext(0, -7.9, 6, 4.1)],
      side: () => [...house(), ...ext(6, -3.4, 2.7, 6.6)],
      infill: () => [...house(), ...outrigger, ...ext(2.8, -8.2, 3.2, 4.4, 2.6)],
      loft: () => { const p = house(); p.push([s.box(0.4, 5.9, -2.9, 4.6, 2.0, 2.7, '#000', { skip: ['bottom', 'front'] }).map((f) => Object.assign(f, { lift: 2 })), 'e']); return p; },
      wrap: () => [...house(), ...ext(0, -7.9, 8.7, 4.1), ...ext(6, -3.8, 2.7, 5.4)],
      flat: () => [...ext(0, 0, 4, 4, 2.6), [s.box(-0.1, 2.6, -0.1, 4.2, 0.3, 4.2, '#000', { skip: ['bottom'] }), 'x']],
      pitched: () => [...ext(0, 0, 4, 4, 2.4), [s.lean(-0.1, 2.4, -0.1, 4.2, 1.3, 4.2, '#000', 'z1'), 'x']],
      gabled: () => [...ext(0, 0, 4, 4, 2.4), [s.gable(-0.1, 2.4, -0.1, 4.2, 1.6, 4.2, '#000', 'z'), 'x']],
      semi: () => [...house(-6, 'h', 'r'), ...house(0, 'e', 'x')],
      terrace: () => [...house(-5.4, 'h', 'r', 5.4), ...house(0, 'e', 'x', 5.4), ...house(5.4, 'h', 'r', 5.4)],
      end: () => [...house(-10.8, 'h', 'r', 5.4), ...house(-5.4, 'h', 'r', 5.4), ...house(0, 'e', 'x', 5.4)],
    };
    ICONS[key] = isoSvg(defs[key]());
    return ICONS[key];
  }

  // Material swatches as small SVG patterns.
  function swatch(key) {
    const r = OS.rng('swatch-' + key);
    const svg = (body, bg) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect width='48' height='48' fill='${bg}'/>${body}</svg>`)}")`;
    const shadeOf = (hex, k) => hexOf(rgbOf(hex).map((v) => v * k));
    if (key === 'red-brick' || key === 'yellow-brick' || key === 'london-stock') {
      const base = key === 'red-brick' ? '#a85b42' : '#d2b27c';
      let b = '';
      for (let row = 0; row < 8; row++) {
        for (let col = -1; col < 4; col++) {
          const x = col * 14 + (row % 2 ? 7 : 0);
          b += `<rect x='${x + 0.6}' y='${row * 6 + 0.6}' width='12.8' height='4.8' fill='${shadeOf(base, 0.86 + r() * 0.24)}'/>`;
        }
      }
      return svg(b, '#d9d1c4');
    }
    if (key === 'white-render') { let b = ''; for (let i = 0; i < 40; i++) b += `<circle cx='${r() * 48}' cy='${r() * 48}' r='${0.4 + r() * 0.7}' fill='#d8d2c6' opacity='.6'/>`; return svg(b, '#efebe2'); }
    if (key === 'zinc') { let b = ''; for (let x = 4; x < 48; x += 9) b += `<rect x='${x}' y='0' width='1.4' height='48' fill='#66717b'/><rect x='${x + 1.4}' y='0' width='0.8' height='48' fill='#a7b1ba'/>`; return svg(b, '#838e98'); }
    if (key === 'timber') { let b = ''; for (let x = 0; x < 48; x += 8) b += `<rect x='${x}' y='0' width='7.2' height='48' fill='${shadeOf('#ab7c50', 0.85 + r() * 0.25)}'/><path d='M${x + 2 + r() * 3} 0 V48' stroke='#8a5f3a' stroke-width='.5' opacity='.6'/>`; return svg(b, '#6d4c30'); }
    if (key === 'clay' || key === 'concrete' || key === 'slate') {
      const base = MAT3[key];
      let b = '';
      for (let row = 0; row < 6; row++) {
        for (let col = -1; col < 6; col++) {
          const x = col * 9 + (row % 2 ? 4.5 : 0); const y = row * 8;
          const c = shadeOf(base, 0.84 + r() * 0.26);
          b += key === 'clay' ? `<path d='M${x} ${y} h8.4 v6 q-4.2 3 -8.4 0z' fill='${c}'/>` : `<rect x='${x}' y='${y}' width='8.4' height='7.2' rx='${key === 'concrete' ? 1.5 : 0.3}' fill='${c}'/>`;
        }
      }
      return svg(b, shadeOf(base, 0.6));
    }
    return svg('', '#999999');
  }

  // ====================================================================== line icons

  const L = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const IC = {
    heart: L('<path d="M12 20s-7.2-4.4-7.2-10.1A4.1 4.1 0 0 1 12 7.3a4.1 4.1 0 0 1 7.2 2.6C19.2 15.6 12 20 12 20z"/>'),
    heartSolid: L('<path d="M12 20s-7.2-4.4-7.2-10.1A4.1 4.1 0 0 1 12 7.3a4.1 4.1 0 0 1 7.2 2.6C19.2 15.6 12 20 12 20z" fill="currentColor"/>'),
    check: L('<path d="M5 12.5l4.3 4.3L19 7.4"/>', 'stroke-width="2.4"'),
    chev: L('<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>'),
    info: L('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.9v.1"/>'),
    undo: L('<path d="M8.5 6.5L4 11l4.5 4.5"/><path d="M4 11h10.5a5 5 0 0 1 0 10H12"/>'),
    back: L('<path d="M14.5 6l-6 6 6 6"/>'),
    pencil: L('<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="M13 7l4 4"/>'),
    up: L('<path d="M7 11v8.5H4.5V11zM7 11l4.2-6.8c1-.1 1.8.7 1.8 1.7V9.5h5.3a1.7 1.7 0 0 1 1.7 2l-1.2 6.4a2 2 0 0 1-2 1.6H7"/>'),
    down: L('<path d="M7 13V4.5H4.5V13zM7 13l4.2 6.8c1 .1 1.8-.7 1.8-1.7V14.5h5.3a1.7 1.7 0 0 0 1.7-2l-1.2-6.4a2 2 0 0 0-2-1.6H7"/>'),
    shell: L('<rect x="3.5" y="5" width="17" height="14" rx="1"/><path d="M3.5 9.7h17M3.5 14.3h17M9 5v4.7M15 5v4.7M6.2 9.7v4.6M12 9.7v4.6M17.8 9.7v4.6M9 14.3V19M15 14.3V19"/>'),
    glazing: L('<rect x="4.5" y="3.5" width="15" height="17" rx="1"/><path d="M12 3.5v17M4.5 12h15"/>'),
    kitchen: L('<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><circle cx="8.5" cy="9" r="2"/><circle cx="15.5" cy="9" r="2"/><path d="M3.5 13.5h17"/>'),
    bathroom: L('<path d="M3.5 12h17v2a5 5 0 0 1-5 5h-7a5 5 0 0 1-5-5z"/><path d="M6.5 12V6.5a2 2 0 0 1 3.7-1"/><path d="M7.5 19l-1 2M16.5 19l1 2"/>'),
    fees: L('<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>'),
    contingency: L('<path d="M12 3.5l7 2.8v5.8c0 4.3-2.9 7.3-7 8.6-4.1-1.3-7-4.3-7-8.6V6.3z"/>'),
    vat: L('<circle cx="7.5" cy="7.5" r="2.3"/><circle cx="16.5" cy="16.5" r="2.3"/><path d="M18 6L6 18"/>'),
    orbit: L('<path d="M4.5 12a7.5 7.5 0 0 1 13.2-4.9M19.5 12a7.5 7.5 0 0 1-13.2 4.9"/><path d="M18 3.8V7.5h-3.7M6 20.2v-3.7h3.7"/>'),
    sparkle: L('<path d="M12 4l1.6 4.6L18 10l-4.4 1.5L12 16l-1.6-4.5L6 10l4.4-1.4z"/>'),
  };

  // ====================================================================== CSS

  const CSS = `
.$root{position:absolute;inset:0;display:flex;overflow:hidden;background:var(--surface);color:var(--fg);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,"Helvetica Neue",Arial,sans-serif;--r:12px;--g:8px;--icon:.72;--hw:650;--price:20px;--cols:3;--bar-y:0px;--case:none;--hls:0;--hsize:15px}
.$root *{box-sizing:border-box}
.$root button{font-family:inherit}
.$stage{position:relative;flex:1 1 auto;min-width:0;min-height:0;overflow:hidden;background:radial-gradient(120% 95% at 50% 6%,color-mix(in srgb,var(--surface2) 76%,var(--accent) 7%) 0%,color-mix(in srgb,var(--bg) 94%,var(--accent) 3%) 74%)}
.$stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;opacity:0;transition:opacity .5s}
.$stage.$ready canvas{opacity:1}
.$stage canvas:active{cursor:grabbing}
.$panel{flex:0 0 392px;width:392px;display:flex;flex-direction:column;min-height:0;background:var(--surface);border-left:1px solid var(--border);position:relative;z-index:2;overflow:hidden}
.$mid .$panel{flex-basis:336px;width:336px}
.$scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:20px 20px 28px;scroll-behavior:smooth}
.$barSlot{position:absolute;left:0;right:0;bottom:0;z-index:3}
.$barSlot:has(.$bar.$float:not(.$hidden)){background:var(--surface)}
.$mid .$scroll{padding:16px 16px 24px}
.$mid .$savedLbl{display:none}
.$mid .$title{font-size:18px}
.$narrow{flex-direction:column}
.$narrow .$stage{flex:0 0 var(--stage-h,44%)}
.$narrow .$panel{flex:1 1 auto;width:auto;border-left:0;border-top:1px solid var(--border);border-radius:16px 16px 0 0;margin-top:-14px;box-shadow:0 -10px 30px rgba(0,0,0,.18)}
.$grab{display:none;flex:none;justify-content:center;padding:8px 0 0;cursor:ns-resize;touch-action:none}
.$narrow .$grab{display:flex}
.$grab i{width:40px;height:4px;border-radius:2px;background:var(--border)}
.$fade{animation:configurator-in .45s ease-out both}
@keyframes configurator-in{from{opacity:0;transform:translateY(6px)}}
.$head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.$title{font-size:20px;font-weight:700;letter-spacing:-.015em;line-height:1.2}
.$kicker{font-size:12px;color:var(--muted);margin-top:4px}
.$kicker b{font-weight:600;color:var(--accent)}
.$pill{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--fg);font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:border-color .15s,background .15s}
.$pill:hover{border-color:color-mix(in srgb,var(--accent) 60%,var(--border))}
.$pill svg{width:15px;height:15px}
.$pill[disabled]{opacity:.5;cursor:default}
.$card{border:1px solid var(--border);border-radius:var(--r);background:color-mix(in srgb,var(--surface2) 42%,var(--surface));padding:14px;transition:border-radius .35s}
.$home{display:grid;grid-template-columns:52px minmax(0,1fr);gap:4px 12px;align-items:center}
.$home .$pill{grid-column:1/3;justify-self:start;margin-top:8px}
.$homeIco{width:52px;height:52px;border-radius:calc(var(--r) * .75);background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;transition:border-radius .35s}
.$homeIco svg{width:40px;height:auto}
.$eyebrow{font-size:11.5px;color:var(--muted);font-weight:600;letter-spacing:.02em}
.$addr{font-weight:650;font-size:14px;line-height:1.3}
.$facts{font-size:12px;color:var(--muted);line-height:1.35}
.$sec{margin-top:24px}
.$h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 0 10px;font-size:var(--hsize);font-weight:var(--hw);text-transform:var(--case);letter-spacing:var(--hls);line-height:1.25;transition:font-weight .3s}
.$h small{font-size:12px;font-weight:450;color:var(--muted);text-transform:none;letter-spacing:0;white-space:nowrap}
.$tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--g);transition:gap .3s}
.$types{grid-template-columns:repeat(var(--cols),minmax(0,1fr))}
.$mats{grid-template-columns:repeat(5,minmax(0,1fr))}
.$mats.$n3{grid-template-columns:repeat(3,minmax(0,1fr))}
.$tile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:5px;min-width:0;padding:8px 6px 10px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface);color:var(--fg);cursor:pointer;text-align:center;transition:border-color .15s,box-shadow .15s,background .2s,border-radius .35s,color .2s}
.$tile:hover:not([disabled]):not(.$sel){border-color:color-mix(in srgb,var(--accent) 50%,var(--border))}
.$tile:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.$tile.$sel{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--surface))}
.$fill .$tile.$sel{background:var(--accent);color:var(--on-accent);box-shadow:none}
.$tile[disabled]{cursor:default;opacity:.48}
.$tile.$removed{border-style:dashed;background:transparent;cursor:default;opacity:.7}
.$tl{font-size:12.5px;font-weight:600;line-height:1.2;max-width:100%}
.$ts{font-size:11.5px;color:var(--muted);line-height:1.2;max-width:100%;font-variant-numeric:tabular-nums}
.$fill .$sel .$ts{color:color-mix(in srgb,var(--on-accent) 72%,transparent)}
.$ico{width:100%;height:50px;display:flex;align-items:center;justify-content:center}
.$ico svg{height:calc(var(--icon) * 100%);width:auto;max-width:100%;overflow:visible;transition:height .35s}
.$ico.$sm{height:40px}
.$ico.$sm svg{height:78%}
.$ico polygon{stroke:color-mix(in srgb,var(--fg) 42%,transparent);stroke-width:1px;vector-effect:non-scaling-stroke;stroke-linejoin:round}
.$h0,.$h1,.$h2{fill:color-mix(in srgb,var(--fg) 12%,var(--surface))}
.$h2{fill:color-mix(in srgb,var(--fg) 22%,var(--surface))}
.$r0,.$r1,.$r2{fill:color-mix(in srgb,var(--fg) 32%,var(--surface))}
.$r1{fill:color-mix(in srgb,var(--fg) 40%,var(--surface))}
.$e0{fill:color-mix(in srgb,var(--accent) 42%,var(--surface))}
.$e1{fill:color-mix(in srgb,var(--accent) 62%,var(--surface))}
.$e2{fill:color-mix(in srgb,var(--accent) 86%,var(--surface))}
.$x0,.$x2{fill:var(--accent)}
.$x1{fill:color-mix(in srgb,var(--accent) 78%,var(--fg))}
.$fill .$sel .$ico polygon{stroke:color-mix(in srgb,var(--on-accent) 55%,transparent)}
.$fill .$sel .$h0,.$fill .$sel .$h1{fill:color-mix(in srgb,var(--on-accent) 26%,var(--accent))}
.$fill .$sel .$h2{fill:color-mix(in srgb,var(--on-accent) 40%,var(--accent))}
.$fill .$sel .$r0,.$fill .$sel .$r1,.$fill .$sel .$r2{fill:color-mix(in srgb,var(--on-accent) 55%,var(--accent))}
.$fill .$sel .$e0,.$fill .$sel .$e1,.$fill .$sel .$e2,.$fill .$sel .$x0,.$fill .$sel .$x1,.$fill .$sel .$x2{fill:var(--on-accent)}
.$tile.$plain{padding-top:14px}
.$tick{position:absolute;top:5px;right:5px;width:16px;height:16px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:none;align-items:center;justify-content:center}
.$tick svg{width:11px;height:11px}
.$sel .$tick{display:flex}
.$fill .$sel .$tick{background:var(--on-accent);color:var(--accent)}
.$sw{width:100%;max-width:44px;aspect-ratio:1;border-radius:calc(var(--r) * .6);box-shadow:inset 0 0 0 1px rgba(0,0,0,.14);background-size:cover;transition:border-radius .35s}
.$note{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:12px;color:var(--muted);line-height:1.4}
.$note svg{width:15px;height:15px;flex:none;margin-top:1px}
.$empty{padding:16px;text-align:center;color:var(--muted);font-size:13px}
.$card.$empty{margin-top:16px}
.$empty b{display:block;color:var(--fg);font-weight:650;margin-bottom:4px;font-size:14px}
.$costHead{display:flex;align-items:center;justify-content:space-between;gap:10px}
.$costSum{font-size:20px;font-weight:750;letter-spacing:-.015em;font-variant-numeric:tabular-nums;margin-top:8px;line-height:1.2}
.$costSub{font-size:12px;color:var(--muted);margin-top:3px}
.$rows{list-style:none;margin:10px 0 0;padding:0}
.$row{border-bottom:1px solid color-mix(in srgb,var(--border) 75%,transparent)}
.$rowMain{display:grid;grid-template-columns:20px minmax(0,1fr) auto 22px;gap:8px;align-items:center;min-height:44px;padding:4px 0}
.$rowIco{width:20px;height:20px;color:var(--muted)}
.$rowIco svg{width:20px;height:20px}
.$rowName{display:flex;align-items:center;gap:4px;min-width:0;background:none;border:0;padding:0;color:var(--fg);font-size:13px;text-align:left;cursor:pointer}
.$rowName span{line-height:1.3}
.$mid .$rowMain{grid-template-columns:minmax(0,1fr) auto 22px}
.$mid .$rowIco{display:none}
.$mid .$rowNote{padding-left:0}
.$rowName svg{width:15px;height:15px;color:var(--faint);flex:none;transition:transform .24s}
.$row.$open .$rowName svg{transform:rotate(180deg)}
.$rowAmt{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.$row.$off .$rowAmt{text-decoration:line-through;opacity:.65}
.$rowNote{display:none;padding:0 0 12px 32px;font-size:12px;color:var(--muted)}
.$row.$open .$rowNote{display:block;animation:configurator-in .25s ease-out}
.$cb{appearance:none;-webkit-appearance:none;width:20px;height:20px;margin:0;border-radius:6px;border:1.5px solid color-mix(in srgb,var(--fg) 35%,var(--surface));background:var(--surface);display:grid;place-items:center;cursor:pointer;transition:background .15s,border-color .15s}
.$cb:checked{background:var(--fg);border-color:var(--fg)}
.$cb:checked::after{content:"";width:9px;height:5px;border-left:2px solid var(--surface);border-bottom:2px solid var(--surface);transform:translateY(-1px) rotate(-45deg)}
.$cb:disabled{cursor:default;opacity:.45}
.$cb:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.$vat{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);cursor:pointer;white-space:nowrap;user-select:none}
.$vat .$cb{width:17px;height:17px;border-radius:5px}
.$vat .$cb:checked::after{width:8px;height:4px}
.$fold{background:none;border:0;padding:0;margin-top:10px;display:inline-flex;align-items:center;gap:4px;color:var(--fg);font-size:12.5px;font-weight:600;cursor:pointer}
.$fold svg{width:15px;height:15px;color:var(--faint);transition:transform .24s}
.$fold.$open svg{transform:rotate(180deg)}
.$foldBody{display:none;font-size:12px;color:var(--muted);margin-top:6px;line-height:1.45}
.$fold.$open + .$foldBody{display:block}
.$loanBig{font-size:22px;font-weight:750;letter-spacing:-.015em;font-variant-numeric:tabular-nums}
.$loanBig small{font-size:13px;font-weight:500;color:var(--muted);letter-spacing:0}
.$field{margin-top:12px}
.$fieldTop{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;color:var(--muted);margin-bottom:4px}
.$fieldTop b{color:var(--fg);font-weight:650;font-variant-numeric:tabular-nums}
.$range{width:100%;margin:0;accent-color:var(--accent);height:18px;cursor:pointer}
.$grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-top:14px;font-size:12.5px}
.$grid2 span{color:var(--muted)}
.$grid2 b{font-weight:650;font-variant-numeric:tabular-nums;text-align:right}
.$small{font-size:11.5px;color:var(--faint);margin-top:12px}
.$mini{background:none;border:0;padding:0;font-size:12px;color:var(--accent);cursor:pointer;font-weight:600}
.$fb .$q{font-weight:650;font-size:14px}
.$opts{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.$opts.$two{flex-direction:row}
.$opt{flex:1 1 0;display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 12px;border-radius:calc(var(--r) * .8);border:1px solid var(--border);background:var(--surface);color:var(--fg);font-size:13px;text-align:left;cursor:pointer;transition:border-color .15s,background .15s,border-radius .35s}
.$opt svg{width:17px;height:17px;flex:none}
.$opt:hover{border-color:color-mix(in srgb,var(--accent) 50%,var(--border))}
.$opt.$sel{border-color:var(--fg);background:color-mix(in srgb,var(--fg) 6%,var(--surface))}
.$btns{display:flex;gap:8px;margin-top:12px}
.$btn{flex:1;height:40px;border-radius:calc(var(--r) * .8);border:1px solid var(--border);background:var(--surface);color:var(--fg);font-size:13px;font-weight:650;cursor:pointer;transition:border-radius .35s}
.$btn.$pri{background:var(--fg);color:var(--surface);border-color:var(--fg)}
.$btn[disabled]{opacity:.4;cursor:default}
.$thanks{display:flex;align-items:center;gap:10px}
.$thanks i{width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,var(--good) 22%,var(--surface));color:var(--good);display:grid;place-items:center;flex:none}
.$thanks i svg{width:16px;height:16px}
.$bar{flex:none;position:relative;display:flex;align-items:center;gap:12px;padding:14px 20px 16px;background:var(--surface);border-top:1px solid var(--border);box-shadow:0 -14px 26px -16px rgba(0,0,0,.4);margin-bottom:calc(-1 * var(--bar-y));transition:margin .35s,opacity .2s,border-radius .35s,box-shadow .3s;z-index:3}
.$mid .$bar{padding:12px 16px 14px}
.$bar.$float{margin-left:12px;margin-right:12px;border:1px solid var(--border);border-radius:var(--r);box-shadow:0 10px 26px -10px rgba(0,0,0,.45)}
.$bar.$hidden{opacity:0;pointer-events:none}
.$barL{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.$priceLine{display:flex;align-items:baseline;gap:8px;max-width:100%}
.$linkLine{display:flex;align-items:center;gap:14px;flex-wrap:wrap;row-gap:4px}
.$bar.$stacked{flex-direction:column;align-items:stretch;gap:10px}
.$bar.$compact .$priceLine{flex-direction:column;align-items:flex-start;gap:0}
.$bar.$stacked .$save{width:100%}
.$price{font-size:var(--price);font-weight:760;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;line-height:1.2;transition:font-size .3s}
.$vatTxt{font-size:12.5px;color:var(--muted);white-space:nowrap}
.$link{background:none;border:0;padding:0;color:var(--fg);font-size:13px;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px;cursor:pointer;white-space:nowrap}
.$link:hover{text-decoration-thickness:2px}
.$noPrice{font-size:14px;font-weight:600}
.$save{display:inline-flex;align-items:center;gap:8px;min-width:148px;justify-content:center;height:46px;padding:0 16px;border-radius:var(--r);border:1px solid transparent;font-size:14px;font-weight:650;cursor:pointer;background:color-mix(in srgb,var(--accent) 17%,var(--surface));color:var(--fg);transition:border-radius .35s,background .2s,transform .08s}
.$save:active{transform:scale(.97)}
.$save svg{width:19px;height:19px;color:var(--accent)}
.$save.$solid{background:var(--accent);color:var(--on-accent)}
.$save.$solid svg{color:var(--on-accent)}
.$save.$outline{background:transparent;border-color:var(--border)}
.$save[disabled]{opacity:.45;cursor:default;transform:none}
.$mid .$save{min-width:118px;padding:0 12px}
.$save.$short{min-width:100px}
.$save.$pop svg{animation:configurator-pop .45s cubic-bezier(.3,1.6,.5,1)}
@keyframes configurator-pop{40%{transform:scale(1.35)}}
.$save.$rise span{animation:configurator-rise .35s ease-out}
@keyframes configurator-rise{from{transform:translateY(8px);opacity:0}}
.$saveNote{position:absolute;left:20px;right:20px;bottom:calc(100% + 8px);padding:8px 12px;border-radius:10px;background:var(--fg);color:var(--surface);font-size:12.5px;opacity:0;transform:translateY(4px);transition:opacity .2s,transform .2s;pointer-events:none}
.$saveNote.$on{opacity:1;transform:none}
.$savedBtn svg{color:var(--accent)}
.$pop2{position:absolute;right:20px;top:58px;width:330px;max-width:calc(100% - 40px);z-index:6;border:1px solid var(--border);border-radius:var(--r);background:var(--surface);box-shadow:0 18px 40px rgba(0,0,0,.35);padding:6px;display:none}
.$pop2.$on{display:block;animation:configurator-in .2s ease-out}
.$saveRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;padding:9px 10px;border-radius:8px;cursor:pointer;align-items:baseline}
.$saveRow:hover{background:var(--surface2)}
.$saveRow b{font-size:13px;font-weight:650;grid-column:1/3}
.$saveRow span{font-size:11.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$saveRow em{font-style:normal;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--fg)}
.$vctl{position:absolute;top:14px;left:14px;display:flex;gap:2px;padding:3px;border-radius:999px;background:color-mix(in srgb,var(--surface) 86%,transparent);border:1px solid var(--border);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:2}
.$vctl button{border:0;background:none;color:var(--muted);font-size:12px;font-weight:600;padding:5px 12px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.$vctl button svg{width:14px;height:14px}
.$vctl button.$on{background:var(--surface2);color:var(--fg);box-shadow:0 1px 2px rgba(0,0,0,.18)}
.$hint,.$legend{position:absolute;bottom:12px;font-size:11.5px;color:var(--muted);pointer-events:none;z-index:2;padding:5px 11px;border-radius:999px;background:color-mix(in srgb,var(--surface) 86%,transparent);border:1px solid var(--border);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.$hint{left:14px}
.$legend{right:14px;display:flex;gap:12px}
.$legend:empty{display:none}
.$legend span{display:inline-flex;align-items:center;gap:6px}
.$legend i{width:10px;height:10px;border-radius:3px;display:inline-block;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
.$narrow .$hint,.$mid .$hint{display:none}
.$narrow .$legend{bottom:26px}
.$toast{position:absolute;top:14px;left:50%;transform:translate(-50%,-10px);opacity:0;width:max-content;max-width:min(520px,calc(100% - 28px));padding:9px 15px;border-radius:14px;background:color-mix(in srgb,var(--surface) 94%,transparent);border:1px solid var(--border);box-shadow:0 10px 30px rgba(0,0,0,.28);font-size:12.5px;transition:opacity .25s,transform .25s;pointer-events:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;gap:9px;align-items:center;z-index:4}
.$toast svg{width:16px;height:16px;color:var(--accent);flex:none}
.$toast.$on{opacity:1;transform:translate(-50%,0)}
.$narrow .$toast,.$mid .$toast{top:56px}
.$loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--muted);font-size:12.5px;transition:opacity .4s;z-index:1}
.$ready .$loading{opacity:0;pointer-events:none}
.$prog{width:150px;height:3px;border-radius:2px;background:var(--border);overflow:hidden}
.$prog i{display:block;height:100%;width:40%;background:var(--accent);animation:configurator-indet 1.15s ease-in-out infinite}
@keyframes configurator-indet{from{transform:translateX(-100%)}to{transform:translateX(260%)}}
.$sk{position:relative;overflow:hidden;background:color-mix(in srgb,var(--fg) 7%,var(--surface));border-radius:10px}
.$sk::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--fg) 10%,transparent),transparent);animation:configurator-sheen 1.35s ease-in-out infinite}
@keyframes configurator-sheen{to{transform:translateX(100%)}}
.$pulse{animation:configurator-pulse 1.7s ease-out 1}
@keyframes configurator-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 70%,transparent)}70%{box-shadow:0 0 0 9px transparent}100%{box-shadow:0 0 0 0 transparent}}
.$edit .$h{margin-top:22px}
.$editTop{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.$iconBtn{width:34px;height:34px;border-radius:50%;border:1px solid var(--border);background:var(--surface);color:var(--fg);display:grid;place-items:center;cursor:pointer;flex:none}
.$iconBtn svg{width:17px;height:17px}
.$snack{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:10px 12px 10px 14px;border-radius:12px;background:var(--fg);color:var(--surface);font-size:12.5px;margin:0 20px 10px;animation:configurator-in .25s ease-out}
.$snack button{background:none;border:0;color:var(--surface);font-weight:700;display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:12.5px;padding:4px 6px;border-radius:6px}
.$snack button:hover{background:color-mix(in srgb,var(--surface) 15%,transparent)}
.$snack svg{width:15px;height:15px}
.$done{flex:none;padding:12px 20px 16px;border-top:1px solid var(--border);background:var(--surface)}
.$done .$btn{width:100%;height:46px;font-size:14px}
`;
  function injectCss() {
    if (document.getElementById('configurator-css')) return;
    document.head.append(h('style', { id: 'configurator-css' }, CSS.replace(/\.\$/g, '.' + P)));
  }

  // ====================================================================== the app

  const DEFAULT_DESIGN = {
    home: { type: 'semi', roof: 'hip', walls: 'brick-render' },
    ext: 'rear', size: 1, roofShape: { rear: 'pitched', side: 'flat' }, wall: 'red-brick', roofMat: 'slate',
    ticks: { glazing: true, kitchen: false, bathroom: false, fees: true, contingency: true, vat: false },
    loan: { years: 10, amount: null },
  };
  function loadDesign() {
    const s = OS.store.get('configurator.design', null) || {};
    const d = clone(DEFAULT_DESIGN);
    if (s.home && HOME_TYPES[s.home.type]) d.home = { ...d.home, ...s.home };
    if (!HOME_WALLS[d.home.walls]) d.home.walls = 'brick-render';
    if (d.home.type === 'terrace') d.home.roof = 'gable';
    if (TYPES.some((t) => t.key === s.ext)) d.ext = s.ext;
    if ([0, 1, 2].includes(s.size)) d.size = s.size;
    if (s.roofShape) d.roofShape = { ...d.roofShape, ...s.roofShape };
    if (MAT3[s.wall]) d.wall = s.wall;
    if (MAT3[s.roofMat]) d.roofMat = s.roofMat;
    if (s.ticks) d.ticks = { ...d.ticks, ...s.ticks };
    if (s.loan) d.loan = { ...d.loan, ...s.loan };
    if (available(d.ext, d.home)) d.ext = 'rear';
    return d;
  }
  const typeLabel = (k) => TYPES.find((t) => t.key === k).label;
  const homeFacts = (home) => `${HOME_TYPES[home.type]} · ${home.roof === 'hip' ? 'hipped' : 'gabled'} roof · ${HOME_WALLS[home.walls].toLowerCase()}`;
  const PRESETS = {
    front: { yaw: 0.58, pitch: 0.3 }, rear: { yaw: 2.5, pitch: 0.42 }, side: { yaw: 1.0, pitch: 0.34 },
    infill: { yaw: 2.72, pitch: 0.62 }, loft: { yaw: 2.62, pitch: 0.4 }, wrap: { yaw: 2.28, pitch: 0.46 },
  };
  const presetFor = (ext) => (ext === 'existing' ? 'front' : ext === 'rear' ? 'rear' : ext);
  const titleFor = (n) => `Configurator · design review round ${n}`;

  registerApp({
    id: 'configurator',
    title: 'Configurator',
    icon: 'house-with-extension',
    desc: 'The v3 extension configurator. Five design reviews in, round six booked.',
    keywords: ['extension', 'v3', 'design', 'price', 'loft', 'rear', 'wraparound', 'react'],
    size: [1180, 760],
    mount(win) {
      injectCss();
      const st = win.state;
      st.style = loadStyle();
      st.d = loadDesign();
      st.round = roundNow();
      win.setTitle(titleFor(st.round));
      live.add(win);
      win.body.style.overflow = 'hidden';

      const root = h('div', { class: K('root') });
      const canvas = h('canvas', { 'aria-label': 'The house and the proposed extension, in 3D' });
      const toast = h('div', { class: K('toast'), role: 'status' });
      const camBtns = {};
      const vctl = h('div', { class: K('vctl') },
        ...[['front', 'Front'], ['rear', 'Rear']].map(([k, t]) => (camBtns[k] = h('button', { dataset: { cfg: 'cam-' + k }, onclick: () => goCam(k, true) }, t))),
        h('button', { title: 'Re-frame the house', 'aria-label': 'Re-frame the house', dataset: { cfg: 'cam-fit' }, html: IC.orbit, onclick: () => goCam(presetFor(st.d.ext), true) }));
      const legend = h('div', { class: K('legend') });
      const stage = h('div', { class: K('stage') }, canvas,
        h('div', { class: K('loading') }, h('div', null, 'Loading the model'), h('div', { class: K('prog') }, h('i'))),
        vctl, toast, legend,
        h('div', { class: K('hint') }, 'Drag to orbit · scroll to zoom · click a surface'));
      const scroll = h('div', { class: K('scroll') });
      const grab = h('div', { class: K('grab'), title: 'Drag to resize' }, h('i'));
      const barSlot = h('div', { class: K('barSlot') });
      const panel = h('div', { class: K('panel') }, grab, scroll, barSlot);
      root.append(stage, panel);
      win.body.append(root);

      // ---------------------------------------------------------------- style
      function applyStyle() {
        const s = st.style;
        const v = root.style;
        v.setProperty('--r', s.radius + 'px');
        v.setProperty('--g', s.gap + 'px');
        v.setProperty('--icon', String(s.iconScale));
        v.setProperty('--hw', String(s.headingWeight));
        v.setProperty('--price', s.priceSize + 'px');
        v.setProperty('--cols', String(s.tileCols));
        v.setProperty('--bar-y', s.priceBarOffset + 'px');
        v.setProperty('--case', s.headingCase === 'title' ? 'capitalize' : s.headingCase === 'upper' ? 'uppercase' : 'none');
        v.setProperty('--hls', s.headingCase === 'upper' ? '.06em' : '0');
        v.setProperty('--hsize', s.headingCase === 'upper' ? '12.5px' : '15px');
        root.classList.toggle(P + 'fill', s.selected === 'fill');
      }
      applyStyle();
      const lab = (k) => label(st.style, k);

      // ---------------------------------------------------------------- 3D
      const view = OS.r3d.create(canvas, {
        camera: { yaw: PRESETS.front.yaw, pitch: PRESETS.front.pitch, dist: 30, target: [2, 3, -1], fov: 0.72 },
        grid: false, shadows: false, ground: GROUND.lawn, gridExtent: 14, minDist: 15, maxDist: 62, edges: true,
        onCamera: (cam) => { st.camTw = null; if (st.scene) rebias(st.scene.faces, cam); reshade(cam.yaw); },
      });
      st.view = view;
      const a = st.anim = {
        ext: st.d.ext, sizeT: st.d.size, grow: 1, pitch: st.style.roofPitch,
        wall: rgbOf(MAT3[st.d.wall]), roof: rgbOf(MAT3[st.d.roofMat]),
      };
      let lastShadeYaw = null;
      function reshade(yaw) {
        if (lastShadeYaw !== null && Math.abs(yaw - lastShadeYaw) < 0.015) return;
        lastShadeYaw = yaw;
        if (st.scene) shadeFaces(st.scene.faces, yaw);
      }
      function rebuild() {
        st.scene = buildScene(st.d, a, st.style);
        rebias(st.scene.faces, view.camera);
        lastShadeYaw = null;
        shadeFaces(st.scene.faces, view.camera.yaw);
        lastShadeYaw = view.camera.yaw;
        view.set(st.scene.faces);
      }
      function syncLegend() {
        legend.replaceChildren(...[
          h('span', null, h('i', { style: { background: '#d9d4cb' } }), 'Next door'),
          h('span', null, h('i', { style: { background: WALLS3[st.d.home.walls][0] } }), 'Your home'),
          st.d.ext !== 'existing' ? h('span', null, h('i', { style: { background: MAT3[st.d.ext === 'loft' ? st.d.roofMat : st.d.wall] } }), 'Proposed') : null,
        ].filter(Boolean));
      }
      function camGoal(key) {
        const p = PRESETS[key];
        const hb = st.scene.hero;
        const c = [(hb.min[0] + hb.max[0]) / 2, ((hb.min[1] + hb.max[1]) / 2) * 0.82, (hb.min[2] + hb.max[2]) / 2];
        const r = Math.hypot(hb.max[0] - hb.min[0], hb.max[1] - hb.min[1], hb.max[2] - hb.min[2]) / 2;
        const aspect = OS.clamp((canvas.clientWidth || 1) / (canvas.clientHeight || 1), 0.5, 1);
        const dist = OS.clamp(((r / Math.sin(view.camera.fov / 2)) * 1.42) / aspect, 15, 60);
        return { yaw: p.yaw, pitch: p.pitch, dist, target: c };
      }
      function goCam(key, animate) {
        if (!st.scene) return;
        st.camKey = key;
        for (const [k, b] of Object.entries(camBtns)) b.classList.toggle(P + 'on', k === key || (k === 'rear' && key !== 'front' && key !== 'side'));
        const to = camGoal(key);
        const cam = view.camera;
        if (!animate) { Object.assign(cam, { yaw: to.yaw, pitch: to.pitch, dist: to.dist, target: to.target }); rebias(st.scene.faces, cam); reshade(cam.yaw); view.request(); return; }
        let dy = to.yaw - cam.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        st.camTw = { t: 0, dur: 1000, from: { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, target: cam.target.slice() }, to: { ...to, yaw: cam.yaw + dy } };
      }
      // Re-frame for a new size without turning the camera.
      function refit() {
        if (!st.scene || st.camTw) return;
        const to = camGoal(st.camKey || 'front');
        view.camera.dist = to.dist; view.camera.target = to.target;
        rebias(st.scene.faces, view.camera);
        view.request();
      }

      // Click a surface: it opens the part of the panel that paints it.
      let downAt = null;
      canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; st.camTw = null; });
      let pickT = 0;
      canvas.addEventListener('pointerup', (e) => {
        if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
        const tg = view.pick(e.clientX, e.clientY)?.tag;
        clearTimeout(pickT);
        pickT = win.after(260, () => {
          if (tg === 'ext-wall') focusSection(st.d.ext === 'loft' ? 'roofMat' : 'wall');
          else if (tg === 'ext-roof') focusSection('roofMat');
          else if (tg === 'home') { flashToast(`Your home, ${ADDRESS}. Edit home changes it.`); pulse(homeCard.editBtn); }
          else if (tg === 'neighbour') flashToast('That is next door. It is not part of the design.');
          else if (tg === 'garden') flashToast('The garden. The cost engine does not price gardens.');
        });
      });
      // Captured on the stage, so r3d's own fit (which frames the whole plot) never runs.
      stage.addEventListener('dblclick', (e) => {
        if (e.target !== canvas) return;
        e.stopPropagation();
        clearTimeout(pickT);
        goCam(st.camKey || presetFor(st.d.ext), true);
      }, true);

      // ---------------------------------------------------------------- panel pieces
      const pulse = (el) => { if (!el) return; el.classList.remove(P + 'pulse'); void el.offsetWidth; el.classList.add(P + 'pulse'); win.after(1800, () => el.classList.remove(P + 'pulse')); };
      let toastT = 0;
      function flashToast(text, ms = 2600) {
        toast.replaceChildren(h('span', { html: IC.sparkle }).firstChild, h('span', null, text));
        toast.classList.add(P + 'on');
        clearTimeout(toastT);
        toastT = win.after(ms, () => toast.classList.remove(P + 'on'));
      }

      function heading(key, extra) {
        const el = h('div', { class: K('h'), dataset: { fx: 'headingCase headingWeight' } }, h('span', null, lab(key)), extra || null);
        el._key = key;
        return el;
      }
      function tileGroup(cls, items, value, onPick) {
        const el = h('div', { class: K('tiles ' + cls), role: 'group' });
        let sig = '';
        const btns = new Map();
        return {
          el,
          sync() {
            const list = items();
            const s = JSON.stringify(list.map((i) => [i.key, i.label, i.sub, i.disabled, i.removed, i.icon, i.sw]));
            if (s !== sig) {
              sig = s; btns.clear();
              el.replaceChildren(...list.map((i) => {
                const b = h('button', {
                  class: K('tile' + (i.removed ? ' removed' : '') + (i.icon || i.sw ? '' : ' plain')), type: 'button', disabled: !!(i.disabled || i.removed),
                  dataset: { cfg: i.cfg }, title: i.title || null, onclick: () => { OS.sound.click(); onPick(i.key); },
                },
                h('span', { class: K('tick'), html: IC.check }),
                i.icon ? h('span', { class: K('ico' + (i.smallIcon ? ' sm' : '')), html: icon(i.icon) }) : null,
                i.sw ? h('span', { class: K('sw'), style: { backgroundImage: swatch(i.sw) } }) : null,
                h('span', { class: K('tl') }, i.label),
                i.sub ? h('span', { class: K('ts') }, i.sub) : null);
                btns.set(i.key, b);
                return b;
              }));
            }
            const v = value();
            for (const [k, b] of btns) { b.classList.toggle(P + 'sel', k === v); b.setAttribute('aria-pressed', String(k === v)); }
          },
        };
      }

      // This home
      const homeCard = (() => {
        const ico = h('div', { class: K('homeIco') });
        const facts = h('div', { class: K('facts') });
        const eyebrow = h('div', { class: K('eyebrow') });
        const editBtn = h('button', { class: K('pill'), dataset: { cfg: 'edit-home', fx: 'rename' }, onclick: () => openEdit() }, h('span', { html: IC.pencil }).firstChild, h('span', null, ''));
        const el = h('div', { class: K('card home'), dataset: { fx: 'radius' } }, ico, h('div', { style: { minWidth: 0 } }, eyebrow, h('div', { class: K('addr') }, ADDRESS), facts), editBtn);
        return {
          el, editBtn,
          sync() {
            ico.innerHTML = icon(st.d.home.type);
            facts.textContent = homeFacts(st.d.home);
            eyebrow.textContent = lab('homeTitle');
            editBtn.lastChild.textContent = lab('editHome');
          },
        };
      })();

      const types = tileGroup('types', () => TYPES.map((t) => {
        const why = available(t.key, st.d.home);
        return { key: t.key, label: t.label, icon: t.key, disabled: !!why, sub: why || null, cfg: 'type-' + t.key, title: why || null };
      }), () => st.d.ext, (k) => setDesign({ ext: k }));
      types.el.dataset.fx = 'radius gap iconScale tileCols selected';

      const sizes = tileGroup('', () => SIZE_NAMES.map((n, i) => ({ key: i, label: n, sub: st.d.ext === 'existing' ? '' : sizeMeasure(st.d.ext, i), cfg: 'size-' + i })), () => st.d.size, (k) => setDesign({ size: k }));
      sizes.el.dataset.fx = 'radius gap selected';
      const roofs = tileGroup('', () => (ROOF_SHAPES[st.d.ext] || []).map((k) => {
        const removed = !!st.style.removed[`${st.d.ext}:${k}`];
        return { key: k, label: ROOF_LABELS[k], icon: k, smallIcon: true, removed, sub: removed ? 'Removed in review' : 'Same price', cfg: 'roof-' + k };
      }), () => st.d.roofShape[st.d.ext], (k) => setDesign({ roofShape: { ...st.d.roofShape, [st.d.ext]: k } }));
      roofs.el.dataset.fx = 'radius gap selected option';
      const walls = tileGroup('mats', () => WALL_OPTIONS.map(([k, n]) => ({ key: k, label: n, sw: k, cfg: 'wall-' + k })), () => st.d.wall, (k) => setDesign({ wall: k }));
      walls.el.dataset.fx = 'radius gap selected';
      const roofMats = tileGroup('mats', () => [...ROOF_OPTIONS, ...(st.d.ext === 'loft' ? LOFT_EXTRA : [])].map(([k, n]) => ({ key: k, label: n.replace(' tiles', ''), sw: k, cfg: 'roofmat-' + k })), () => st.d.roofMat, (k) => setDesign({ roofMat: k }));
      roofMats.el.dataset.fx = 'radius gap selected';

      const sizeInfo = h('div', { class: K('note') }, h('span', { html: IC.info }).firstChild,
        h('span', null, 'The cost engine prices by area alone. No width or depth exists anywhere in the payload, so the m × m readout is a display convention, not a quoted spec.'));
      const roofNote = h('div', { class: K('note') }, h('span', { html: IC.info }).firstChild, h('span'));
      const roofMatNote = h('div', { class: K('note') }, h('span', { html: IC.info }).firstChild, h('span', null, 'On a loft, the roof material paints the loft walls. Chips name the surface they paint.'));
      const sec = {};
      const mkSec = (key, headKey, body, extra, small) => {
        const hd = heading(headKey, small ? h('small', null, small) : null);
        const el = h('section', { class: K('sec'), dataset: { section: key } }, hd, body, ...(extra || []));
        sec[key] = { el, hd };
        return el;
      };
      const noExt = h('div', { class: K('card empty') }, h('b', null, 'This is your home as it is'), 'Pick an extension type to start a design. Nothing is priced until you do.');

      // Cost estimate
      const cost = (() => {
        const vatCb = h('input', { type: 'checkbox', class: K('cb'), dataset: { cfg: 'vat-heading' }, onchange: () => setTick('vat', vatCb.checked) });
        const vatHead = h('label', { class: K('vat') }, vatCb, 'Include VAT');
        const sum = h('div', { class: K('costSum') });
        const sub = h('div', { class: K('costSub') });
        const rows = h('ul', { class: K('rows') });
        const foldBtn = h('button', { class: K('fold'), type: 'button', onclick: () => foldBtn.classList.toggle(P + 'open') }, 'How costs are estimated', h('span', { html: IC.chev }).firstChild);
        const foldBody = h('div', { class: K('foldBody') }, 'Estimated ranges from our cost data, excluding VAT unless you add it. The build work is always included; tick anything else you plan to do to add it. Not a quote.');
        const hd = heading('cost', vatHead);
        hd.dataset.fx += ' vatTick';
        const card = h('div', { class: K('card'), dataset: { fx: 'radius' } }, sum, sub, rows, foldBtn, foldBody);
        const el = h('section', { class: K('sec'), dataset: { section: 'cost' } }, hd, card);
        const openRows = new Set();
        return {
          el, hd, vatHead,
          sync(est) {
            vatHead.style.display = st.style.vatTick === 'bar' ? 'none' : '';
            vatCb.checked = !!st.d.ticks.vat;
            if (!est) { el.style.display = 'none'; return; }
            el.style.display = '';
            sum.textContent = range(est.low, est.high);
            sub.textContent = `${st.d.ticks.vat ? 'Includes' : 'Excludes'} VAT · for a ${typeLabel(st.d.ext).toLowerCase()} on ${ADDRESS.split(',')[0]}`;
            rows.replaceChildren(...est.rows.map((r) => {
              const cb = h('input', { type: 'checkbox', class: K('cb'), checked: r.on, disabled: !!r.locked, 'aria-label': `Include ${r.label}`, dataset: { cfg: 'tick-' + r.key }, onchange: () => setTick(r.key, cb.checked) });
              const li = h('li', { class: K('row' + (r.on ? '' : ' off') + (openRows.has(r.key) ? ' open' : '')) },
                h('div', { class: K('rowMain') },
                  h('span', { class: K('rowIco'), html: IC[r.key] || IC.shell }),
                  h('button', { class: K('rowName'), type: 'button', onclick: () => { if (openRows.has(r.key)) openRows.delete(r.key); else openRows.add(r.key); li.classList.toggle(P + 'open'); } }, h('span', null, r.label), h('span', { html: IC.chev }).firstChild),
                  h('span', { class: K('rowAmt') }, range(r.low, r.high)),
                  cb),
                h('div', { class: K('rowNote') }, r.locked ? `${r.note} Always included.` : r.note));
              return li;
            }));
          },
        };
      })();

      // Loan calculator
      const loan = (() => {
        const big = h('div', { class: K('loanBig') });
        const amtOut = h('b'); const yrsOut = h('b');
        const amt = h('input', { type: 'range', class: K('range'), min: 5000, max: 250000, step: 1000, dataset: { cfg: 'loan-amount' }, oninput: () => { st.d.loan.amount = Number(amt.value); saveDesign(); sync(); } });
        const yrs = h('input', { type: 'range', class: K('range'), min: 2, max: 25, step: 1, dataset: { cfg: 'loan-years' }, oninput: () => { st.d.loan.years = Number(yrs.value); saveDesign(); sync(); } });
        const reset = h('button', { class: K('mini'), type: 'button', dataset: { cfg: 'loan-reset' }, onclick: () => { st.d.loan.amount = null; saveDesign(); sync(); } }, 'Use my estimate');
        const total = h('b'); const interest = h('b'); const aprOut = h('b');
        const card = h('div', { class: K('card'), dataset: { fx: 'radius' } },
          big,
          h('div', { class: K('field') }, h('div', { class: K('fieldTop') }, h('span', null, 'Borrow ', reset), amtOut), amt),
          h('div', { class: K('field') }, h('div', { class: K('fieldTop') }, h('span', null, 'Over'), yrsOut), yrs),
          h('div', { class: K('grid2') }, h('span', null, 'Representative APR'), aprOut, h('span', null, 'Total to repay'), total, h('span', null, 'Cost of credit'), interest),
          h('div', { class: K('small') }, 'Representative example. Not an offer.'));
        const hd = heading('loan');
        const el = h('section', { class: K('sec'), dataset: { section: 'loan' } }, hd, card);
        function sync() {
          const est = st.est;
          if (!est) { el.style.display = 'none'; return; }
          el.style.display = '';
          const mid = Math.round((est.low + est.high) / 2 / 1000) * 1000;
          const P0 = OS.clamp(st.d.loan.amount ?? mid, 5000, 250000);
          const n = st.d.loan.years * 12;
          const r = Math.pow(1 + APR, 1 / 12) - 1;
          const m = (P0 * r) / (1 - Math.pow(1 + r, -n));
          amt.value = String(P0); yrs.value = String(st.d.loan.years);
          amtOut.textContent = money(P0);
          yrsOut.textContent = `${st.d.loan.years} years`;
          reset.style.visibility = st.d.loan.amount == null ? 'hidden' : 'visible';
          big.replaceChildren(money(m), h('small', null, ' a month'));
          aprOut.textContent = (APR * 100).toFixed(1) + '%';
          total.textContent = money(m * n);
          interest.textContent = money(m * n - P0);
        }
        return { el, hd, sync };
      })();

      // One feedback prompt
      const feedback = (() => {
        const stored = OS.store.get('configurator.feedback', null);
        const fb = { step: stored?.done ? 'gone' : 'ask', rating: null, part: null, reason: null };
        const el = h('section', { class: K('sec'), dataset: { section: 'feedback' } });
        const PARTS = ['Extension type', 'Size', 'Materials', 'The price', 'The 3D model', 'Something else'];
        const REASONS = { up: ['Easy to use', 'Looks good', 'The price is useful'], down: ['Hard to find things', 'Looks different every time', 'The price seems off'] };
        function render() {
          if (fb.step === 'gone') { el.style.display = 'none'; return; }
          const card = h('div', { class: K('card fb'), dataset: { fx: 'radius' } });
          if (fb.step === 'done') {
            card.append(h('div', { class: K('thanks') }, h('i', { html: IC.check }), h('div', null, h('div', { class: K('q') }, 'Thanks for your feedback'), h('div', { class: K('costSub') }, `It has been added to the round ${roundNow()} design review.`))));
          } else {
            card.append(h('div', { class: K('q') }, 'How is designing your extension going?'));
            card.append(h('div', { class: K('opts two') }, ...[['up', 'Good'], ['down', 'Not great']].map(([k, t]) => h('button', { class: K('opt' + (fb.rating === k ? ' sel' : '')), type: 'button', dataset: { cfg: 'fb-' + k }, onclick: () => { fb.rating = k; fb.reason = null; fb.step = 'part'; render(); } }, h('span', { html: IC[k] }).firstChild, t))));
            if (fb.rating) {
              card.append(h('div', { class: K('eyebrow'), style: { marginTop: '14px' } }, lab('part')));
              card.append(h('div', { class: K('opts') }, ...PARTS.map((p) => h('button', { class: K('opt' + (fb.part === p ? ' sel' : '')), type: 'button', dataset: { cfg: 'fb-part' }, onclick: () => { fb.part = p; render(); } }, p))));
              if (fb.part) {
                card.append(h('div', { class: K('eyebrow'), style: { marginTop: '14px' } }, fb.rating === 'up' ? 'What went well?' : 'What could be better?'));
                card.append(h('div', { class: K('opts') }, ...REASONS[fb.rating].map((p) => h('button', { class: K('opt' + (fb.reason === p ? ' sel' : '')), type: 'button', dataset: { cfg: 'fb-reason' }, onclick: () => { fb.reason = p; render(); } }, p))));
              }
              card.append(h('div', { class: K('btns') },
                h('button', { class: K('btn'), type: 'button', onclick: () => { fb.rating = null; fb.part = null; fb.reason = null; fb.step = 'ask'; render(); } }, 'Cancel'),
                h('button', { class: K('btn pri'), type: 'button', disabled: !(fb.part && fb.reason), dataset: { cfg: 'fb-submit' }, onclick: submit }, 'Submit')));
            }
          }
          el.replaceChildren(card);
        }
        function submit() {
          fb.step = 'done';
          const answer = { rating: fb.rating === 'up' ? 'positive' : 'negative', part: fb.part, reason: fb.reason, round: roundNow() };
          OS.store.set('configurator.feedback', { done: true, ...answer });
          OS.emit('configurator:feedback', answer);
          render();
        }
        render();
        return { el, render };
      })();

      // The price bar
      const bar = (() => {
        const price = h('span', { class: K('price'), 'aria-live': 'polite', dataset: { fx: 'priceSize' } });
        const vatCb = h('input', { type: 'checkbox', class: K('cb'), dataset: { cfg: 'vat-bar' }, onchange: () => setTick('vat', vatCb.checked) });
        const vatTick = h('label', { class: K('vat') }, vatCb, 'incl. VAT');
        const vatTxt = h('span', { class: K('vatTxt') });
        const link = h('button', { class: K('link'), type: 'button', dataset: { cfg: 'see-breakdown', fx: 'rename' }, onclick: () => focusSection('cost') });
        const noPrice = h('div', { class: K('noPrice') }, 'No extension yet');
        const priceLine = h('div', { class: K('priceLine') }, price, vatTxt);
        const left = h('div', { class: K('barL') }, priceLine, noPrice, h('div', { class: K('linkLine') }, link, vatTick));
        const saveLbl = h('span');
        const saveIco = h('span', { style: { display: 'inline-flex' } });
        const save = h('button', { class: K('save'), type: 'button', dataset: { cfg: 'save', fx: 'radius rename' }, onclick: () => doSave() }, saveIco, saveLbl);
        const note = h('div', { class: K('saveNote'), role: 'status' });
        const el = h('div', { class: K('bar'), dataset: { fx: 'priceBarOffset vatTick' } }, note, left, save);
        let noteT = 0;
        // Like the real bar: one line beside Save, then one line beside the short Save, then stacked.
        function fit() {
          const shown = price.textContent;
          if (st.priceTo) price.textContent = range(st.priceTo[0], st.priceTo[1]);
          el.classList.remove(P + 'stacked', P + 'compact'); st.shortSave = false; setLabel();
          const over = () => priceLine.scrollWidth > left.clientWidth + 1;
          if (over()) el.classList.add(P + 'compact');
          if (over()) { st.shortSave = true; setLabel(); }
          if (over()) { el.classList.add(P + 'stacked'); st.shortSave = false; setLabel(); }
          price.textContent = shown;
        }
        function setLabel() {
          const sv = st.saveState;
          const full = sv === 'saving' ? lab('saving') : sv === 'saved' ? lab('saved') : lab('save');
          saveLbl.textContent = st.shortSave && sv !== 'saving' ? (sv === 'saved' ? 'Saved' : 'Save') : full;
          save.classList.toggle(P + 'short', !!st.shortSave);
        }
        return {
          el, price, save, fit,
          note(text) { note.textContent = text; note.classList.add(P + 'on'); clearTimeout(noteT); noteT = win.after(2800, () => note.classList.remove(P + 'on')); },
          sync() {
            const s = st.style;
            el.classList.toggle(P + 'float', s.priceBarOffset < 0);
            const has = !!st.est;
            price.style.display = has ? '' : 'none';
            noPrice.style.display = has ? 'none' : '';
            vatTick.style.display = has && s.vatTick !== 'heading' ? '' : 'none';
            vatTxt.style.display = has && s.vatTick === 'heading' ? '' : 'none';
            vatTxt.textContent = st.d.ticks.vat ? 'incl. VAT' : 'excl. VAT';
            vatCb.checked = !!st.d.ticks.vat;
            link.textContent = lab('breakdown');
            link.style.display = has ? '' : 'none';
            const sv = st.saveState;
            save.disabled = !has;
            saveIco.innerHTML = sv === 'saved' || sv === 'saving' ? IC.heartSolid : IC.heart;
            setLabel();
            if (has && el.isConnected) fit();
          },
        };
      })();

      // Saved designs
      const savedBtn = h('button', { class: K('pill savedBtn'), type: 'button', dataset: { cfg: 'saved' }, onclick: () => togglePop() });
      const pop = h('div', { class: K('pop2') });
      const kicker = h('div', { class: K('kicker'), dataset: { cfg: 'round' } });
      function syncHeader() {
        const n = (OS.store.get('configurator.saves', []) || []).length;
        savedBtn.innerHTML = IC.heart + `<span><span class="${P}savedLbl">Saved · </span>${n}</span>`;
        const held = st.round - 1;
        kicker.innerHTML = `${held === 0 ? 'No design reviews yet' : held === 1 ? 'One design review in' : `${['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][held]} design reviews in`} · <b>round ${st.round} booked</b>`;
      }
      function togglePop(force) {
        const on = force ?? !pop.classList.contains(P + 'on');
        pop.classList.toggle(P + 'on', on);
        if (!on) return;
        const saves = OS.store.get('configurator.saves', []) || [];
        pop.replaceChildren(...(saves.length ? saves.map((sv) => h('div', { class: K('saveRow'), onclick: () => { loadSaved(sv); togglePop(false); } },
          h('b', null, sv.title), h('span', null, sv.sub), h('em', null, range(sv.low, sv.high)))) : [h('div', { class: K('empty') }, 'Nothing saved yet. Saves live on this device.')]));
      }

      // ---------------------------------------------------------------- design view and edit view
      const design = h('div', { class: K('fade') },
        h('div', { class: K('head') }, h('div', null, h('div', { class: K('title') }, 'Design your extension'), kicker), savedBtn),
        homeCard.el,
        mkSec('type', 'type', types.el),
        noExt,
        mkSec('size', 'size', sizes.el, [sizeInfo]),
        mkSec('roof', 'roof', roofs.el, [roofNote]),
        mkSec('wall', 'wall', walls.el),
        mkSec('roofMat', 'roofMat', roofMats.el, [roofMatNote]),
        cost.el, loan.el, feedback.el);
      sec.cost = { el: cost.el, hd: cost.hd };
      sec.loan = { el: loan.el, hd: loan.hd };

      function focusSection(key) {
        const s = sec[key];
        if (!s || s.el.style.display === 'none') return;
        if (st.editing) closeEdit();
        scroll.scrollTo({ top: s.el.offsetTop - 12, behavior: 'smooth' });
        pulse(s.el.querySelector('.' + P + 'tiles, .' + P + 'card'));
      }

      // The price bar hides while the cost section is on screen, or scrolled past above it.
      const io = new IntersectionObserver((entries) => {
        const e = entries[entries.length - 1];
        if (!e) return;
        const hide = !!st.est && (e.isIntersecting || e.boundingClientRect.bottom <= (e.rootBounds?.top ?? 0));
        bar.el.classList.toggle(P + 'hidden', hide);
      }, { root: scroll, threshold: 0 });
      io.observe(cost.el);
      win.on('close', () => io.disconnect());
      // The bar floats over the end of the scroll area, so the content needs room to clear it.
      const ro = new ResizeObserver(() => { scroll.style.paddingBottom = `${barSlot.offsetHeight + 24}px`; });
      ro.observe(barSlot);
      win.on('close', () => ro.disconnect());

      // Edit home, with Undo.
      st.undo = [];
      const editView = h('div', { class: K('edit fade') });
      const snackSlot = h('div');
      const doneBar = h('div', { class: K('done') }, h('button', { class: K('btn pri'), type: 'button', dataset: { cfg: 'edit-done' }, onclick: () => closeEdit() }, 'Done'));
      function renderEdit() {
        const hm = st.d.home;
        const group = (title, items, cur, field) => {
          const g = tileGroup('', () => items, () => cur, (k) => changeHome({ [field]: k }));
          g.el.style.gridTemplateColumns = `repeat(${items.length},minmax(0,1fr))`;
          g.sync();
          return [h('div', { class: K('h') }, h('span', null, title)), g.el];
        };
        editView.replaceChildren(
          h('div', { class: K('editTop') }, h('button', { class: K('iconBtn'), type: 'button', 'aria-label': 'Back', onclick: () => closeEdit(), html: IC.back }), h('div', null, h('div', { class: K('title') }, lab('editHome')), h('div', { class: K('kicker') }, ADDRESS))),
          ...group('Property type', Object.entries(HOME_TYPES).map(([k, n]) => ({ key: k, label: n, icon: k, cfg: 'home-' + k })), hm.type, 'type'),
          ...group('Main roof', [['hip', 'Hipped'], ['gable', 'Gabled']].map(([k, n]) => ({ key: k, label: n, cfg: 'homeroof-' + k, disabled: k === 'hip' && hm.type === 'terrace', sub: k === 'hip' && hm.type === 'terrace' ? 'A terrace has no end to hip' : null })), hm.roof, 'roof'),
          ...group('Existing walls', Object.entries(HOME_WALLS).map(([k, n]) => ({ key: k, label: n, sw: k === 'brick-render' || k === 'red-brick' ? 'red-brick' : k === 'london-stock' ? 'yellow-brick' : 'white-render', cfg: 'homewall-' + k })), hm.walls, 'walls'),
          h('div', { class: K('note') }, h('span', { html: IC.info }).firstChild, h('span', null, 'Changes show on the model straight away. Undo puts each one back.')));
        const last = st.undo[st.undo.length - 1];
        snackSlot.replaceChildren(last ? h('div', { class: K('snack') }, h('span', null, last.text), h('button', { type: 'button', dataset: { cfg: 'undo' }, onclick: () => undoHome() }, h('span', { html: IC.undo }).firstChild, st.undo.length > 1 ? `Undo (${st.undo.length})` : 'Undo')) : '');
      }
      function openEdit() {
        st.editing = true;
        st.undo = [];
        togglePop(false);
        renderEdit();
        scroll.replaceChildren(editView);
        scroll.scrollTop = 0;
        barSlot.replaceChildren(snackSlot, doneBar);
        goCam('front', true);
      }
      function closeEdit() {
        st.editing = false;
        scroll.replaceChildren(design);
        barSlot.replaceChildren(bar.el);
        refresh();
        goCam(presetFor(st.d.ext), true);
      }
      function changeHome(patch) {
        const prev = { home: { ...st.d.home }, ext: st.d.ext };
        const next = { ...st.d.home, ...patch };
        if (next.type === 'terrace') next.roof = 'gable';
        if (JSON.stringify(next) === JSON.stringify(st.d.home)) return;
        const field = Object.keys(patch)[0];
        const text = field === 'type' ? `Property type: ${HOME_TYPES[next.type]}` : field === 'roof' ? `Main roof: ${next.roof === 'hip' ? 'Hipped' : 'Gabled'}` : `Existing walls: ${HOME_WALLS[next.walls]}`;
        st.undo.push({ ...prev, text });
        st.d.home = next;
        if (available(st.d.ext, next)) st.d.ext = 'existing';
        saveDesign();
        afterChange(prev.ext !== st.d.ext);
        renderEdit();
      }
      function undoHome() {
        const u = st.undo.pop();
        if (!u) return;
        const prevExt = st.d.ext;
        st.d.home = u.home; st.d.ext = u.ext;
        saveDesign();
        afterChange(prevExt !== st.d.ext);
        renderEdit();
      }

      // ---------------------------------------------------------------- state changes
      function saveDesign() { OS.store.set('configurator.design', st.d); }
      const sigOf = (d) => JSON.stringify([d.home, d.ext, d.size, d.roofShape[d.ext] || '', d.wall, d.roofMat, d.ticks]);
      const designSig = () => sigOf(st.d);
      // Saved means this exact design is in Saved, however it got there.
      const isSaved = () => (OS.store.get('configurator.saves', []) || []).some((sv) => sv.design && sigOf(sv.design) === designSig());
      function setDesign(patch) {
        const prevExt = st.d.ext;
        Object.assign(st.d, patch);
        if (st.d.ext === 'loft' && !MAT3[st.d.roofMat]) st.d.roofMat = 'slate';
        if (st.d.ext !== 'loft' && !ROOF_OPTIONS.some(([k]) => k === st.d.roofMat)) st.d.roofMat = 'slate';
        saveDesign();
        afterChange(prevExt !== st.d.ext);
      }
      function setTick(key, on) { st.d.ticks[key] = on; saveDesign(); refresh(); }
      function afterChange(extChanged) {
        if (extChanged) {
          a.ext = st.d.ext; a.grow = st.d.ext === 'existing' ? 1 : 0; a.sizeT = st.d.size;
        }
        refresh();
        rebuild();
        if (extChanged && !st.editing) goCam(presetFor(st.d.ext), true);
      }
      function syncRoofOption() {
        const shapes = ROOF_SHAPES[st.d.ext];
        if (!shapes) return;
        const cur = st.d.roofShape[st.d.ext];
        if (!shapes.includes(cur) || st.style.removed[`${st.d.ext}:${cur}`]) {
          st.d.roofShape[st.d.ext] = shapes.find((k) => !st.style.removed[`${st.d.ext}:${k}`]) || 'flat';
          saveDesign();
        }
      }
      function refresh() {
        syncRoofOption();
        if (st.saveState !== 'saving') st.saveState = isSaved() ? 'saved' : 'idle';
        st.est = estimate(st.d);
        if (st.est) { st.priceTo = [st.est.low, st.est.high]; if (!st.priceNow) st.priceNow = st.priceTo.slice(); }
        else { st.priceTo = null; st.priceNow = null; }
        const ext = st.d.ext;
        const has = ext !== 'existing';
        syncHeader();
        syncLegend();
        homeCard.sync();
        types.sync(); sizes.sync(); roofs.sync(); walls.sync(); roofMats.sync();
        noExt.style.display = has ? 'none' : '';
        sec.size.el.style.display = has ? '' : 'none';
        sec.roof.el.style.display = ROOF_SHAPES[ext] ? '' : 'none';
        sec.wall.el.style.display = has && ext !== 'loft' ? '' : 'none';
        sec.roofMat.el.style.display = has ? '' : 'none';
        roofMatNote.style.display = ext === 'loft' ? '' : 'none';
        roofMats.el.classList.toggle(P + 'n3', ext !== 'loft');
        const removedHere = (ROOF_SHAPES[ext] || []).filter((k) => st.style.removed[`${ext}:${k}`]);
        roofNote.style.display = ROOF_SHAPES[ext] ? '' : 'none';
        roofNote.lastChild.textContent = removedHere.length
          ? `${removedHere.map((k) => ROOF_LABELS[k]).join(', ')} was removed in a design review. The cost engine prices by area alone, so the roof does not change the price.`
          : 'The cost engine prices by area alone, so the roof does not change the price.';
        sec.size.hd.querySelector('small')?.remove();
        if (has) sec.size.hd.append(h('small', null, `${AREAS[ext][st.d.size]} m²`));
        for (const s of Object.values(sec)) { const sp = s.hd.firstChild; if (s.hd._key) sp.textContent = lab(s.hd._key); }
        cost.sync(st.est);
        loan.sync();
        bar.sync();
        if (!st.est) bar.price.textContent = '';
      }

      // ---------------------------------------------------------------- saving
      st.saveState = 'idle';
      async function doSave() {
        if (!st.est || st.saveState === 'saving') return;
        if (isSaved()) { bar.note('This design is already saved. Saving it again keeps one copy.'); return; }
        // The design is copied now: it may change while the save is in flight.
        const ext = st.d.ext;
        const entry = {
          id: Date.now(), title: `${typeLabel(ext)} · ${SIZE_NAMES[st.d.size]}`,
          sub: ext === 'loft' ? `${MAT_NAMES[st.d.roofMat]} loft walls · ${AREAS[ext][st.d.size]} m²` : `${MAT_NAMES[st.d.wall]} · ${MAT_NAMES[st.d.roofMat]} · ${sizeMeasure(ext, st.d.size)}`,
          low: st.est.low, high: st.est.high, design: clone(st.d),
        };
        st.saveState = 'saving';
        bar.save.classList.remove(P + 'rise'); bar.save.classList.add(P + 'pop');
        bar.sync();
        await win.sleep(750);
        if (win.closed) return;
        const saves = OS.store.get('configurator.saves', []) || [];
        saves.unshift(entry);
        saves.length = Math.min(saves.length, 12);
        OS.store.set('configurator.saves', saves);
        st.saveState = isSaved() ? 'saved' : 'idle';
        bar.save.classList.remove(P + 'pop'); bar.save.classList.add(P + 'rise');
        bar.sync(); syncHeader();
        if (saves.length === 2) bar.note('Your second design is saved. Both are in Saved, on this device.');
        else if (saves.length === 1) bar.note('Saved on this device.');
        OS.sound.ding();
      }
      function loadSaved(sv) {
        const prevExt = st.d.ext;
        const keepLoan = st.d.loan;
        st.d = { ...clone(DEFAULT_DESIGN), ...clone(sv.design), loan: keepLoan };
        if (available(st.d.ext, st.d.home)) st.d.ext = 'existing';
        saveDesign();
        afterChange(prevExt !== st.d.ext);
        flashToast(`Loaded: ${sv.title}`);
      }

      // ---------------------------------------------------------------- design review
      st.onReview = (fixes, before, after) => {
        st.style = after;
        st.round = roundNow();
        win.setTitle(titleFor(st.round));
        applyStyle();
        refresh();
        rebuild();
        if (st.editing) renderEdit();
        feedback.render();
        const field = (f) => (f.kind === 'rename' ? 'labels' : f.kind === 'option' ? 'removed' : f.kind);
        if (fixes.some((f) => f.kind === 'reset')) {
          flashToast('Round 10 agreed: back to round 1. Every fix since has been undone.', 4200);
        } else {
          const real = fixes.filter((f) => f.kind !== 'none');
          const undone = real.filter((f) => JSON.stringify(before[field(f)]) === JSON.stringify(after[field(f)])).length;
          const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
          const n = (k) => words[k] ?? String(k);
          const tail = undone === 1 ? ' One of them changes nothing.' : undone > 1 ? ` ${n(undone)[0].toUpperCase() + n(undone).slice(1)} of them cancel out.` : '';
          flashToast(`Applied ${n(real.length)} ${real.length === 1 ? 'fix' : 'fixes'} from the round ${st.round - 1} design review.${tail}`, 4200);
        }
        const kinds = new Set(fixes.map((f) => f.kind));
        for (const k of kinds) for (const el of root.querySelectorAll(`[data-fx~="${k}"]`)) if (el.offsetParent) pulse(el);
        if (kinds.has('reset')) for (const el of root.querySelectorAll('[data-fx]')) if (el.offsetParent) pulse(el);
      };

      // ---------------------------------------------------------------- frame loop: price tween, model tween, camera
      win.raf((dt) => {
        if (st.priceTo && st.priceNow) {
          const k = 1 - Math.exp(-dt / 110);
          let moving = false;
          for (let i = 0; i < 2; i++) {
            const diff = st.priceTo[i] - st.priceNow[i];
            if (Math.abs(diff) < 40) st.priceNow[i] = st.priceTo[i]; else { st.priceNow[i] += diff * k; moving = true; }
          }
          const r100 = (v) => (moving ? Math.round(v / 100) * 100 : v);
          const txt = range(r100(st.priceNow[0]), r100(st.priceNow[1]));
          if (bar.price.textContent !== txt) bar.price.textContent = txt;
        }
        if (!st.scene) return;
        let dirty = false;
        const k = 1 - Math.exp(-dt / 90);
        if (a.grow < 1) { a.grow = Math.min(1, a.grow + dt / 420); dirty = true; }
        if (Math.abs(a.sizeT - st.d.size) > 0.002) { a.sizeT += (st.d.size - a.sizeT) * k; if (Math.abs(a.sizeT - st.d.size) < 0.004) a.sizeT = st.d.size; dirty = true; }
        if (Math.abs(a.pitch - st.style.roofPitch) > 0.05) { a.pitch += (st.style.roofPitch - a.pitch) * k; if (Math.abs(a.pitch - st.style.roofPitch) < 0.08) a.pitch = st.style.roofPitch; dirty = true; }
        for (const [key, mat] of [['wall', st.d.wall], ['roof', st.d.roofMat]]) {
          const to = rgbOf(MAT3[mat]);
          if (a[key].some((v, i) => Math.abs(v - to[i]) > 0.6)) { a[key] = a[key].map((v, i) => v + (to[i] - v) * k); dirty = true; }
          else if (a[key].some((v, i) => v !== to[i])) { a[key] = to; dirty = true; }
        }
        if (dirty) {
          const g = a.grow; const growE = g >= 1 ? 1 : easeOut(g);
          const keep = a.grow; a.grow = growE;
          rebuild();
          a.grow = keep;
        }
        if (st.camTw) {
          const tw = st.camTw;
          tw.t += dt;
          const e = ease(Math.min(1, tw.t / tw.dur));
          const cam = view.camera;
          cam.yaw = OS.lerp(tw.from.yaw, tw.to.yaw, e);
          cam.pitch = OS.lerp(tw.from.pitch, tw.to.pitch, e);
          cam.dist = OS.lerp(tw.from.dist, tw.to.dist, e);
          cam.target = tw.from.target.map((v, i) => OS.lerp(v, tw.to.target[i], e));
          rebias(st.scene.faces, cam);
          reshade(cam.yaw);
          view.request();
          if (tw.t >= tw.dur) st.camTw = null;
        }
      });

      // ---------------------------------------------------------------- layout
      const sheetH = (px) => { const total = root.clientHeight; return OS.clamp(px, total * 0.22, total * 0.7); };
      st.resize = () => {
        const w = win.width;
        root.classList.toggle(P + 'narrow', w < 700);
        root.classList.toggle(P + 'mid', w >= 700 && w < 1060);
        if (st.sheetPx) { st.sheetPx = sheetH(st.sheetPx); root.style.setProperty('--stage-h', st.sheetPx + 'px'); }
        view.request();
        refit();
        if (st.booted && !st.editing) bar.sync();
      };
      let sheet = null;
      grab.addEventListener('pointerdown', (e) => {
        sheet = { y: e.clientY, h: stage.getBoundingClientRect().height };
        grab.setPointerCapture?.(e.pointerId);
      });
      grab.addEventListener('pointermove', (e) => {
        if (!sheet) return;
        if (!e.buttons) { sheet = null; return; }
        st.sheetPx = sheetH(sheet.h + (e.clientY - sheet.y));
        root.style.setProperty('--stage-h', st.sheetPx + 'px');
        view.request();
        refit();
      });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) grab.addEventListener(t, () => { sheet = null; });

      // ---------------------------------------------------------------- boot: skeleton, then the model, front first
      const skeleton = h('div', null,
        h('div', { class: K('sk'), style: { height: '24px', width: '62%' } }),
        h('div', { class: K('sk'), style: { height: '13px', width: '45%', marginTop: '8px' } }),
        h('div', { class: K('sk'), style: { height: '78px', marginTop: '18px', borderRadius: 'var(--r)' } }),
        h('div', { class: K('sk'), style: { height: '16px', width: '38%', marginTop: '26px' } }),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginTop: '12px' } }, ...Array.from({ length: 6 }, () => h('div', { class: K('sk'), style: { height: '92px', borderRadius: 'var(--r)' } }))),
        h('div', { class: K('sk'), style: { height: '16px', width: '22%', marginTop: '26px' } }),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginTop: '12px' } }, ...Array.from({ length: 3 }, () => h('div', { class: K('sk'), style: { height: '58px', borderRadius: 'var(--r)' } }))));
      const skBar = h('div', { class: K('bar') }, h('div', { class: K('barL') }, h('div', { class: K('sk'), style: { height: '24px', width: '170px' } }), h('div', { class: K('sk'), style: { height: '13px', width: '90px', marginTop: '6px' } })), h('div', { class: K('sk'), style: { height: '46px', width: '150px', borderRadius: 'var(--r)' } }));
      scroll.append(skeleton);
      barSlot.append(skBar);
      st.resize();
      (async () => {
        await win.sleep(1100);
        if (win.closed) return;
        scroll.replaceChildren(design);
        barSlot.replaceChildren(bar.el);
        refresh();
        rebuild();
        st.camKey = 'front';
        goCam('front', false);
        stage.classList.add(P + 'ready');
        st.booted = true;
        await win.sleep(900);
        if (win.closed) return;
        if (st.d.ext !== 'existing' && !st.camTw && st.camKey === 'front') goCam(presetFor(st.d.ext), true);
      })();

      st.offTheme = OS.on('theme', () => { view.request(); });
      document.addEventListener('pointerdown', st.docDown = (e) => { if (!pop.contains(e.target) && !savedBtn.contains(e.target)) togglePop(false); }, true);
      panel.append(pop);
      st.keys = (e) => {
        if (!st.booted || st.editing || e.ctrlKey || e.metaKey || e.altKey) return;
        const order = TYPES.filter((t) => !available(t.key, st.d.home)).map((t) => t.key);
        const i = order.indexOf(st.d.ext);
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setDesign({ ext: order[(i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length] }); }
        else if (e.key === 'f') goCam('front', true);
        else if (e.key === 'r') goCam(presetFor(st.d.ext === 'existing' ? 'rear' : st.d.ext), true);
      };
    },
    unmount(win) {
      live.delete(win);
      win.state.offTheme?.();
      if (win.state.docDown) document.removeEventListener('pointerdown', win.state.docDown, true);
      win.state.view?.dispose();
    },
    onResize(win) { win.state.resize?.(); },
    onKey(win, e) { win.state.keys?.(e); },
  });
})();
