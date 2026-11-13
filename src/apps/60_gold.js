// Gold Labeller: label a house for gold, one question at a time, against a second labeller (a bot).
(() => {
  const { h } = OS;
  const PW = 800; const PH = 560; const SS = 2;
  const OVR_DIR = OS.fs.home + '/gold-overrides';
  const SET_FILE = '/gold/dev_sets/smoke.yml';
  const DEF_SMOKE = [117, 126, 135, 141, 152, 158, 164, 172, 178, 199, 203, 211];
  const DEF_HELD = [163, 189, 207];
  const PLAN = {
    117: ['victorian', 'terrace', 'front', 2, 'gable', true, false, 'painted_brick'], 126: ['thirties', 'semi', 'front', 2, 'hip', false, false, 'pebbledash'],
    135: ['postwar', 'detached', 'rear', 1, 'gable', false, true, 'brick'], 141: ['modern', 'detached', 'front', 3, 'flat', false, false, 'render'],
    152: ['victorian', 'terrace', 'front', 3, 'flat', true, false, 'brick'], 158: ['thirties', 'semi', 'front', 2, 'front_gable', false, false, 'render'],
    164: ['postwar', 'semi', 'front', 1, 'chalet', false, true, 'pebbledash'], 172: ['victorian', 'terrace', 'rear', 2, 'gable', false, true, 'brick'],
    178: ['postwar', 'detached', 'front', 1, 'hip', false, false, 'brick'], 199: ['thirties', 'semi', 'front', 2, 'hip', false, true, 'render'],
    203: ['modern', 'detached', 'rear', 2, 'gable', false, false, 'timber_cladding'], 211: ['victorian', 'semi', 'front', 3, 'gable', false, false, 'painted_brick'],
  };
  const STREETS = ['Pargeter Road', 'Quoin Lane', 'Lintel Street', 'Soffit Close', 'Purlin Avenue', 'Gable Terrace', 'Mortar Mews', 'Corbel Way',
    'Fascia Gardens', 'Plinth Road', 'Dormer Rise', 'Transom Street', 'Mullion Grove', 'Coping Lane', 'Ridge Way', 'Eaves Crescent', 'Flashing Row', 'Sash Walk'];

  if (!OS.fs.exists(SET_FILE)) {
    OS.fs.seed({
      [SET_FILE]: '# The smoke dev set. smoke is the seeded dev set, the MD5 pick is gone.\n' +
        `houses: [${DEF_SMOKE.join(', ')}]\n` +
        `held_out: [${DEF_HELD.join(', ')}]   # never shown to tuning\n`,
    });
  }
  function devSet() {
    const nums = (re, def) => {
      try {
        const m = OS.fs.read(SET_FILE).match(re);
        const out = m ? m[1].split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0 && n < 100000) : [];
        return out.length ? [...new Set(out)] : def;
      } catch { return def; }
    };
    const held = nums(/held_out:\s*\[([^\]]*)\]/, DEF_HELD);
    const houses = nums(/houses:\s*\[([^\]]*)\]/, DEF_SMOKE).filter((n) => !held.includes(n)).sort((a, b) => a - b);
    return { houses, held: held.sort((a, b) => a - b) };
  }

  // ---------- colour ----------
  const hx2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  const rgbHex = (r, g, b) => '#' + hx2(r) + hx2(g) + hx2(b);
  const hexRgb = (hx) => { const v = parseInt(hx.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const shade = (hx, t) => {
    const [r, g, b] = hexRgb(hx);
    return t >= 0 ? rgbHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t) : rgbHex(r * (1 + t), g * (1 + t), b * (1 + t));
  };
  const jit = (hx, rnd, a) => shade(hx, (rnd() * 2 - 1) * a);
  function lab(hx) {
    const [r, g, b] = hexRgb(hx).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
    const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.072175);
    const z = f((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  // CIEDE2000 with lightness at half weight (kL = 2): exposure moves lightness far more than hue.
  function deltaE(c1, c2, kL = 2) {
    const [L1, a1, b1] = lab(c1); const [L2, a2, b2] = lab(c2);
    const rad = Math.PI / 180;
    const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
    const a1p = a1 * (1 + G); const a2p = a2 * (1 + G);
    const C1 = Math.hypot(a1p, b1); const C2 = Math.hypot(a2p, b2);
    const hue = (b, a) => { if (!a && !b) return 0; const d = Math.atan2(b, a) / rad; return d < 0 ? d + 360 : d; };
    const h1 = hue(b1, a1p); const h2 = hue(b2, a2p);
    let dh = 0;
    if (C1 * C2) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
    const dL = L2 - L1; const dC = C2 - C1; const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(dh * rad / 2);
    const Lb = (L1 + L2) / 2; const Cbp = (C1 + C2) / 2;
    let hb = h1 + h2;
    if (C1 * C2) { if (Math.abs(h1 - h2) > 180) hb += h1 + h2 < 360 ? 360 : -360; hb /= 2; }
    const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
    const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
    const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
    const SL = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2);
    const SC = 1 + 0.045 * Cbp; const SH = 1 + 0.015 * Cbp * T;
    const RT = -Math.sin(2 * dTh * rad) * RC;
    return Math.sqrt((dL / (kL * SL)) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
  }

  // ---------- the questions ----------
  const WALL_SW = [['white', 'White', '#f2f2f2'], ['magnolia', 'Magnolia', '#f3e5c0'], ['light_grey', 'Light grey', '#c0c0c0'], ['mid_grey', 'Mid grey', '#989ca7'],
    ['pink', 'Pink', '#e8b9ad'], ['blue', 'Blue', '#b5c9d8'], ['green', 'Green', '#b8c6a0']];
  const DOOR_SW = [['white', 'White', '#f2f2f2'], ['dark_grey', 'Dark grey', '#333333'], ['wood', 'Wood', '#885840']];
  const SW_HEX = Object.fromEntries([...WALL_SW, ...DOOR_SW].map(([k, , hx]) => [k, hx]));
  const SW_NAME = Object.fromEntries([...WALL_SW, ...DOOR_SW].map(([k, n]) => [k, n]));
  const VARIES = new Set(['painted_brick', 'render', 'pebbledash', 'timber_cladding', 'none_fits', 'cant_tell']);
  const Q = [
    { key: 'front', label: 'Front', q: 'Does this photo show the front?',
      hint: 'The street side. Photo order is not evidence: with no front photo, photo 1 is the earliest outside one.',
      opts: [['front', 'Yes, the front'], ['rear', 'No, the rear'], ['side', 'No, a side']] },
    { key: 'storeys', label: 'Storeys', q: 'Which storeys does it show?',
      hint: 'Ground = 0, first = 1, lower ground = -1. A storey in the roof counts.',
      opts: [['0', '0'], ['0,1', '0, 1'], ['0,1,2', '0, 1, 2'], ['0,1r', '0 + 1 in the roof'], ['0,1,2r', '0, 1 + 2 in the roof'], ['-1,0,1', '-1, 0, 1'], ['-1,0,1,2', '-1, 0, 1, 2']] },
    { key: 'finish', label: 'Finish', q: 'What is the main wall finish?',
      hint: 'The face in the photo. Pebbledash and roughcast are one answer.',
      opts: [['brick', 'Brick'], ['painted_brick', 'Painted brick'], ['render', 'Render'], ['pebbledash', 'Pebbledash or roughcast'], ['stone', 'Stone'],
        ['tile_hung', 'Tile-hung'], ['timber_cladding', 'Timber cladding'], ['none_fits', 'None fits']] },
    { key: 'wall', label: 'Wall colour', q: 'What colour is the wall?', colour: true, sw: WALL_SW,
      hint: 'Asked only where the finish\'s colour varies. Pick from the photo when no swatch is near.',
      asked: (a) => VARIES.has(a.finish) },
    { key: 'door', label: 'Door colour', q: 'What colour is the front door?', colour: true, sw: DOOR_SW,
      hint: 'White, Dark grey and Wood stand for white uPVC, black or anthracite, and wood. Pick custom colours, such as a red door, from the photo.' },
    { key: 'roof', label: 'Roof', q: 'What type is the main roof?',
      hint: 'The main roof, as this photo shows it. A gap in a gable line is valid.',
      opts: [['gable', 'Gable'], ['hip', 'Hip'], ['front_gable', 'Front gable'], ['flat', 'Flat'], ['chalet', 'Chalet'], ['mansard', 'Mansard'], ['none_fits', 'None fits']] },
    { key: 'facade', label: 'Facade', q: 'Mark the facade', marks: true,
      hint: 'Drag a box round every window and door of this house. Neighbours, garden walls and fences are left out.' },
  ];
  const QI = Object.fromEntries(Q.map((q, i) => [q.key, i]));
  const isAsked = (q, ans) => !q.asked || q.asked(ans);
  const optText = (key, v) => {
    if (v === 'cant_tell') return 'Can\'t tell';
    const q = Q[QI[key]];
    return q.opts?.find(([k]) => k === v)?.[1] ?? String(v);
  };
  const storeyLevels = (v) => v.split(',').map((s) => ({ lvl: parseInt(s, 10), roof: s.endsWith('r') }));

  // ---------- the house ----------
  function makeHouse(id) {
    const rnd = OS.rng('gold-house:' + id);
    const R = (a, b) => a + (b - a) * rnd();
    const C = (p) => rnd() < p;
    const P = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
    const plan = PLAN[id];
    const view = plan ? plan[2] : C(0.3) ? 'rear' : 'front';
    const era = plan ? plan[0] : P(['victorian', 'thirties', 'postwar', 'modern']);
    const form = plan ? plan[1] : { victorian: P(['terrace', 'terrace', 'semi']), thirties: P(['semi', 'semi', 'detached']), postwar: P(['semi', 'detached', 'terrace']), modern: P(['detached', 'semi', 'detached']) }[era];
    let n = 2; let roof = 'gable'; let lower = false; let inRoof = false;
    if (era === 'victorian') { n = C(0.35) ? 3 : 2; roof = n === 3 && C(0.5) ? 'flat' : 'gable'; lower = form === 'terrace' && view === 'front' && C(0.5); inRoof = !lower && n === 2 && roof === 'gable' && C(0.4); }
    else if (era === 'thirties') { roof = P(['hip', 'hip', 'front_gable', 'gable']); inRoof = roof !== 'front_gable' && C(0.3); }
    else if (era === 'postwar') { n = C(0.45) ? 1 : 2; if (n === 1 && C(0.65)) { roof = 'chalet'; inRoof = true; } else roof = P(['gable', 'hip', 'gable']); }
    else { n = C(0.3) ? 3 : 2; roof = n === 3 || C(0.35) ? 'flat' : 'gable'; }
    if (roof === 'flat' || n === 3) inRoof = roof === 'chalet';
    if (plan) [, , , n, roof, lower, inRoof] = plan;
    const storeys = (lower ? '-1,' : '') + Array.from({ length: n }, (_, i) => i).join(',') + (inRoof ? `,${n}r` : '');

    const finish = plan ? plan[7] : { victorian: P(['brick', 'brick', 'painted_brick', 'painted_brick', 'render']), thirties: P(['pebbledash', 'render', 'brick', 'pebbledash']),
      postwar: P(['brick', 'brick', 'render', 'pebbledash', 'timber_cladding']), modern: P(['render', 'render', 'brick', 'timber_cladding']) }[era];
    const brickHex = { victorian: P(['#9a4b3c', '#b89d68', '#a3553d']), thirties: P(['#7a4b38', '#9a5a40']), postwar: P(['#c49a62', '#7a5040', '#b37a52']), modern: P(['#c8b48a', '#8a8580']) }[era];
    const PAINT = [['swatch', 'white'], ['swatch', 'magnolia'], ['swatch', 'light_grey'], ['swatch', 'pink'], ['swatch', 'blue'], ['swatch', 'green'], ['pick', '#c87f5c'], ['pick', '#e2c27a'], ['pick', '#c3b3d3'], ['swatch', 'mid_grey']];
    let wallPick = null;
    if (finish === 'pebbledash') wallPick = P([['swatch', 'magnolia'], ['swatch', 'light_grey'], ['swatch', 'white'], ['pick', '#cfc6b0']]);
    else if (finish === 'timber_cladding') wallPick = P([['pick', '#9a7352'], ['swatch', 'mid_grey'], ['pick', '#5f6f5c'], ['swatch', 'white']]);
    else if (finish !== 'brick') wallPick = P(PAINT);
    const wallHex = !wallPick ? brickHex : wallPick[0] === 'swatch' ? SW_HEX[wallPick[1]] : wallPick[1];
    const wallTruth = !wallPick ? null : wallPick[0] === 'swatch' ? { swatch: wallPick[1], hex: wallHex } : { pick: true, hex: wallHex };

    const doorPick = {
      victorian: P([['pick', '#8b1e1e'], ['pick', '#1f2d4f'], ['pick', '#23483a'], ['swatch', 'dark_grey'], ['pick', '#5e1f2b'], ['pick', '#d9a925'], ['pick', '#2f6f73']]),
      thirties: P([['swatch', 'white'], ['swatch', 'wood'], ['pick', '#8b1e1e'], ['pick', '#23483a'], ['swatch', 'white']]),
      postwar: P([['swatch', 'white'], ['swatch', 'white'], ['swatch', 'wood'], ['swatch', 'dark_grey'], ['pick', '#1f2d4f']]),
      modern: P([['swatch', 'dark_grey'], ['swatch', 'wood'], ['pick', '#c8a24a'], ['swatch', 'dark_grey']]),
    }[era];
    const doorHex = doorPick[0] === 'swatch' ? SW_HEX[doorPick[1]] : doorPick[1];
    const doorTruth = view === 'rear' ? 'cant_tell' : doorPick[0] === 'swatch' ? { swatch: doorPick[1], hex: doorHex } : { pick: true, hex: doorHex };
    const roofHex = { victorian: '#4a4f58', thirties: P(['#8a4a36', '#7c4434']), postwar: P(['#6b4a3a', '#5d5f62']), modern: '#45484d' }[era];
    const frameHex = { victorian: P(['#f4f4f0', '#f4f4f0', '#1d1e20']), thirties: '#f4f4f0', postwar: '#f4f4f0', modern: '#34383d' }[era];
    const winStyle = { victorian: 'sash', thirties: 'case', postwar: 'case', modern: 'pane' }[era];

    // metres to photo pixels
    const widthM = form === 'detached' ? R(8.6, 10.6) : form === 'semi' ? R(6.4, 7.6) : R(5.1, 6.1);
    const rise = roof === 'flat' ? 0.6 : roof === 'chalet' ? R(4.4, 5.0) : roof === 'front_gable' ? R(3.1, 3.7) : R(2.7, 3.3);
    const lowerM = lower ? 1.25 : 0;
    const hM = lowerM + n * 2.7 + rise + (roof === 'flat' ? 0.3 : 1.2);
    const G = view === 'front' ? 468 : 428;
    const pxm = Math.min((G - 50) / hM, (form === 'detached' ? 540 : 420) / widthM, 64);
    const fw = widthM * pxm; const SH = 2.7 * pxm;
    const nbSide = P(['left', 'right']);
    let x0 = (PW - fw) / 2 + R(-20, 20);
    if (form === 'semi') x0 = (PW - fw) / 2 + (nbSide === 'left' ? fw * 0.22 : -fw * 0.22);
    const x1 = x0 + fw;
    const base = G - lowerM * pxm;
    const stTop = (k) => base - (k + 1) * SH;
    const eaves = base - n * SH;
    const ridge = eaves - rise * pxm;
    const cols = form === 'detached' ? 3 : 2;
    const colW = fw / cols;
    const doorCol = form === 'detached' ? 1 : (C(0.5) ? 0 : cols - 1);
    const cx = (c) => x0 + colW * (c + 0.5);
    const M = (m) => m * pxm;

    const wins = []; const marks = []; let door = null; let bay = null; let porch = null; const dormers = []; let ext = null; const steps = [];
    const addWin = (w) => { wins.push(w); marks.push({ kind: 'window', x: w.x, y: w.y, w: w.w, h: w.h, lvl: w.lvl }); return w; };
    const winSize = (lvl) => {
      if (winStyle === 'sash') return lvl === 0 ? [0.95, 1.65] : lvl === 1 ? [0.95, 1.5] : [0.85, 1.1];
      if (winStyle === 'case') return [1.3, 1.2];
      return lvl === 0 ? [1.5, 1.7] : [1.3, 1.4];
    };
    const mkWin = (c, lvl, scale = 1, type = winStyle) => {
      const [wm, hm] = winSize(lvl);
      const w = Math.min(M(wm) * scale, colW * 0.78); const hh = M(hm) * (scale < 1 ? 0.8 : 1);
      const yTop = stTop(lvl) + M(lvl === 0 ? 0.5 : 0.45);
      return { x: cx(c) - w / 2, y: yTop, w, h: hh, lvl, type, bars: winStyle === 'sash' ? (C(0.5) ? 2 : 1) : 0, curtain: C(0.45) ? P(['#c9b9a0', '#8d6b6b', '#e8e2d4', '#6d7d8a']) : null };
    };

    const ex = view === 'rear' && C(0.6);
    let exX0 = 0; let exX1 = 0;
    if (ex) {
      const ew = Math.min(fw, M(R(3.6, 5.2)));
      exX0 = C(0.5) ? x0 : x1 - ew; exX1 = exX0 + ew;
      const roofKind = P(['flat', 'lean']);
      const gy = G - M(2.25); const gx0 = exX0 + M(0.45); const gx1 = exX1 - M(0.45);
      ext = { x0: exX0, x1: exX1, topY: G - M(2.95), roof: roofKind, finish: P(['render', 'match']), glass: { x: gx0, y: gy, w: gx1 - gx0, h: G - M(0.05) - gy } };
      marks.push({ kind: 'door', x: gx0, y: gy, w: gx1 - gx0, h: ext.glass.h, lvl: 0 });
    }
    const hidden = (x, w) => ex && x + w > exX0 - 2 && x < exX1 + 2;

    for (let lvl = 0; lvl < n; lvl++) {
      for (let c = 0; c < cols; c++) {
        if (lvl === 0 && c === doorCol) continue;
        if (view === 'front' && lvl === 0 && !bay && (era === 'victorian' || era === 'thirties') && C(0.75)) {
          const bw = Math.min(colW * 0.9, M(2.6)); const bx = cx(c) - bw / 2;
          const gTop = stTop(0) + M(0.45); const gBot = base - M(0.6);
          bay = { x: bx, w: bw, roofY: gTop - M(0.5), glass: { x: bx + 2, y: gTop, w: bw - 4, h: gBot - gTop } };
          marks.push({ kind: 'window', ...bay.glass, lvl: 0, bay: true });
          continue;
        }
        let w;
        if (view === 'rear') {
          if (lvl === 0) w = { ...mkWin(c, 0), type: winStyle === 'pane' ? 'pane' : 'case' };
          else if (c === doorCol) w = { ...mkWin(c, lvl, 0.55), type: 'obscure', curtain: null };
          else w = mkWin(c, lvl);
          if (lvl === 0) { w.h = M(1.05); w.w = Math.min(colW * 0.8, M(1.7)); w.x = cx(c) - w.w / 2; }
        } else {
          w = c === doorCol && lvl > 0 ? mkWin(c, lvl, 0.6) : mkWin(c, lvl);
        }
        if (lvl === 0 && hidden(w.x, w.w)) continue;
        addWin(w);
      }
    }
    // the door (front door, or back door when not behind an extension)
    const dW = M(0.95); const fan = view === 'front' && (era === 'victorian' || (era === 'thirties' && C(0.4)));
    const dH = M(2.05) + (fan ? M(0.4) : 0);
    const dx = cx(doorCol) - dW / 2;
    if (!(view === 'rear' && hidden(dx, dW))) {
      door = { x: dx, y: base - dH, w: dW, h: dH, fan, num: 1 + Math.floor(rnd() * 64), hex: view === 'rear' ? P(['#f2f2f2', '#f2f2f2', '#333333']) : doorHex, rear: view === 'rear',
        style: view === 'rear' ? 'upvc' : era === 'modern' ? 'slab' : era === 'victorian' ? 'panel' : P(['panel', 'upvc']) };
      marks.push({ kind: 'door', x: door.x, y: door.y, w: door.w, h: door.h, lvl: 0 });
      if (view === 'front' && (era === 'thirties' || era === 'postwar') && C(0.55)) porch = { x: door.x - M(0.35), w: door.w + M(0.7), y: door.y - M(0.12), kind: P(['pitch', 'flat']) };
    }
    if (lower) {
      for (let c = 0; c < cols; c++) {
        if (c === doorCol) continue;
        const w = M(0.95); addWin({ x: cx(c) - w / 2, y: base + M(0.12), w, h: G - M(0.08) - base - M(0.12), lvl: -1, type: winStyle, bars: 1, curtain: null });
      }
      for (let k = 0; k < 5; k++) steps.push(k);
    }
    // a storey in the roof
    if (inRoof) {
      if (roof === 'front_gable') {
        const w = M(0.8); addWin({ x: (x0 + x1) / 2 - w / 2, y: ridge + (eaves - ridge) * 0.42, w, h: M(0.9), lvl: n, type: winStyle, bars: 0, curtain: null });
      } else if (view === 'rear' && roof !== 'chalet') {
        const dw = fw * 0.72; const dX = x0 + (fw - dw) / 2; const dTop = ridge + M(0.35); const dBot = eaves - M(0.25);
        const ds = { x: dX, w: dw, y: dTop, h: dBot - dTop, box: true, wins: [] };
        for (const f of [0.25, 0.72]) {
          const w = M(1.1); const win = { x: dX + dw * f - w / 2, y: dTop + M(0.5), w, h: M(1.0), lvl: n, type: 'case', bars: 0, curtain: null };
          ds.wins.push(win); marks.push({ kind: 'window', x: win.x, y: win.y, w: win.w, h: win.h, lvl: n });
        }
        dormers.push(ds);
      } else {
        const count = roof === 'chalet' && fw > M(8) ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const ccx = count === 1 ? (x0 + x1) / 2 + (form === 'detached' ? 0 : (doorCol === 0 ? colW * 0.5 : -colW * 0.5)) : x0 + fw * (i ? 0.72 : 0.28);
          const dw = M(1.8); const dTop = ridge + (eaves - ridge) * 0.18; const dBot = eaves - (eaves - ridge) * 0.12;
          const win = { x: ccx - M(0.6), y: dTop + M(0.45), w: M(1.2), h: Math.min(M(1.05), dBot - dTop - M(0.6)), lvl: n, type: 'case', bars: 0, curtain: null };
          dormers.push({ x: ccx - dw / 2, w: dw, y: dTop, h: dBot - dTop, box: false, wins: [win] });
          marks.push({ kind: 'window', x: win.x, y: win.y, w: win.w, h: win.h, lvl: n });
        }
      }
    }
    // chimneys
    const chimneys = [];
    if ((roof !== 'flat' || era === 'victorian') && roof !== 'front_gable') {
      const cw = M(0.75); const ch = M(roof === 'flat' ? 1.1 : 1.2);
      const ry = roof === 'flat' ? eaves - M(0.6) : roof === 'front_gable' ? ridge + (eaves - ridge) * 0.3 : ridge;
      const inset = roof === 'hip' ? (eaves - ridge) * 0.95 + M(0.3) : M(0.1);
      if (form === 'detached') { if (C(0.7)) chimneys.push({ x: x0 + inset, y: ry - ch, w: cw, h: ch + 2 }); if (C(0.6)) chimneys.push({ x: x1 - inset - cw, y: ry - ch, w: cw, h: ch + 2 }); }
      else if (form === 'semi') chimneys.push({ x: nbSide === 'left' ? x0 - cw / 2 : x1 - cw / 2, y: ry - ch, w: cw, h: ch + 2 });
      else { chimneys.push({ x: x0 - cw / 2, y: ry - ch, w: cw, h: ch + 2 }); if (C(0.5)) chimneys.push({ x: x1 - cw / 2, y: ry - ch, w: cw, h: ch + 2 }); }
    }

    // neighbours, which are never this house
    const neighbours = [];
    const nbWins = [];
    const nbFinish = () => (era === 'victorian' ? P(['brick', 'brick', 'painted']) : era === 'thirties' ? P(['pebbledash', 'render', 'brick']) : P(['brick', 'render']));
    const nbPaint = () => P(['#efe9dc', '#e6d2b0', '#cfd6d8', '#e3c1b5', '#d9d9d2']);
    const mkNb = (nx0) => {
      const nf = nbFinish();
      const nb = { x0: nx0, x1: nx0 + fw, finish: nf, hex: nf === 'brick' ? jit(brickHex, rnd, 0.08) : nbPaint(), wins: [], door: null };
      for (let lvl = 0; lvl < n; lvl++) {
        for (let c = 0; c < cols; c++) {
          const ncx = nx0 + colW * (c + 0.5);
          const [wm, hm] = winSize(lvl);
          const w = Math.min(M(wm), colW * 0.78); const hh = M(hm);
          const nDoorCol = cols - 1 - doorCol;
          if (lvl === 0 && c === nDoorCol) {
            if (view === 'front') nb.door = { x: ncx - dW / 2, y: base - dH, w: dW, h: dH, hex: P(['#1d1f22', '#f2f2f2', '#6b2a2a', '#2b3f5c']) };
            continue;
          }
          const win = { x: ncx - w / 2, y: stTop(lvl) + M(lvl === 0 ? 0.5 : 0.45), w, h: view === 'rear' && lvl === 0 ? M(1.05) : hh, lvl, type: winStyle, bars: winStyle === 'sash' ? 1 : 0, curtain: null };
          nb.wins.push(win);
          if (win.x > 4 && win.x + win.w < PW - 4) nbWins.push(win);
        }
      }
      neighbours.push(nb);
    };
    if (form === 'semi') mkNb(nbSide === 'left' ? x0 - fw : x1);
    if (form === 'terrace') { for (let k = 1; x0 - fw * (k - 1) > 0; k++) mkNb(x0 - fw * k); for (let k = 0; x1 + fw * k < PW; k++) mkNb(x1 + fw * k); }

    const levels = [];
    if (lower) levels.push({ lvl: -1, y0: base, y1: G });
    for (let k = 0; k < n; k++) levels.push({ lvl: k, y0: stTop(k), y1: stTop(k) + SH });
    if (inRoof) levels.push({ lvl: n, y0: ridge - 4, y1: eaves });

    const num = 1 + (OS.hash('addr:' + id) % 63);
    const photoOf = 8 + (OS.hash('photos:' + id) % 11);
    return {
      id, era, view, form, n, roof, lower, inRoof, storeys, finish, brickHex, wallHex, wallTruth, doorHex, doorTruth, roofHex, frameHex, winStyle,
      pxm, G, x0, x1, fw, SH, base, eaves, ridge, rise, cols, colW, doorCol, nbSide, wins, door, bay, porch, dormers, chimneys, ext, steps, neighbours, nbWins, levels,
      marks: marks.map((m) => ({ ...m, x: Math.round(m.x), y: Math.round(m.y), w: Math.round(m.w), h: Math.round(m.h) })),
      address: `${num} ${STREETS[OS.hash('street:' + id) % STREETS.length]}`,
      photoNo: 1, photoOf,
      sky: C(0.55) ? 'overcast' : 'clear', sun: C(0.5) ? -1 : 1,
      truth: { front: view, storeys, finish, wall: wallTruth, door: doorTruth, roof },
    };
  }

  // ---------- painting the photo ----------
  function brickTex(ctx, x, y, w, hh, hex, rnd, pxm, painted) {
    const course = Math.max(2.6, 0.075 * pxm); const len = Math.max(7, 0.225 * pxm);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip();
    if (painted) {
      ctx.fillStyle = hex; ctx.fillRect(x, y, w, hh);
      ctx.strokeStyle = 'rgba(0,0,0,.09)'; ctx.lineWidth = 0.6; ctx.beginPath();
      for (let row = 0, yy = y + hh; yy > y; row++, yy -= course) {
        ctx.moveTo(x, yy); ctx.lineTo(x + w, yy);
        for (let xx = x - (row % 2) * len / 2; xx < x + w; xx += len) { ctx.moveTo(xx, yy); ctx.lineTo(xx, yy - course); }
      }
      ctx.stroke();
      for (let i = 0; i < w * hh / 900; i++) { ctx.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.04})`; ctx.fillRect(x + rnd() * w, y + rnd() * hh, len * (0.5 + rnd()), course * 0.8); }
    } else {
      ctx.fillStyle = shade(hex, 0.32); ctx.fillRect(x, y, w, hh);
      for (let row = 0, yy = y + hh; yy > y - course; row++, yy -= course) {
        for (let xx = x - (row % 2) * len / 2 - len; xx < x + w; xx += len) {
          ctx.fillStyle = jit(hex, rnd, 0.1);
          ctx.fillRect(xx + 0.4, yy - course + 0.4, len - 0.8, course - 0.8);
        }
      }
    }
    ctx.restore();
  }
  function wallTex(ctx, kind, x, y, w, hh, hex, H, rnd) {
    if (w <= 0 || hh <= 0) return;
    if (kind === 'brick') return brickTex(ctx, x, y, w, hh, hex, rnd, H.pxm, false);
    if (kind === 'painted_brick' || kind === 'painted') return brickTex(ctx, x, y, w, hh, hex, rnd, H.pxm, true);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip();
    ctx.fillStyle = hex; ctx.fillRect(x, y, w, hh);
    if (kind === 'pebbledash') {
      for (let i = 0; i < w * hh / 7; i++) { ctx.fillStyle = jit(hex, rnd, 0.16); ctx.fillRect(x + rnd() * w, y + rnd() * hh, 0.9 + rnd() * 0.9, 0.9 + rnd() * 0.9); }
    } else if (kind === 'timber_cladding') {
      const bh = Math.max(4, 0.16 * H.pxm);
      for (let yy = y + hh; yy > y; yy -= bh) {
        ctx.fillStyle = jit(hex, rnd, 0.06); ctx.fillRect(x, yy - bh, w, bh);
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x, yy - 1.1, w, 1.1);
        ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, yy - bh, w, 0.8);
      }
    } else {
      for (let i = 0; i < 14; i++) {
        const gx = x + rnd() * w; const gy = y + rnd() * hh; const r = 20 + rnd() * 70;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        g.addColorStop(0, rnd() < 0.5 ? 'rgba(0,0,0,.035)' : 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
      }
      for (let i = 0; i < w * hh / 60; i++) { ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.035})`; ctx.fillRect(x + rnd() * w, y + rnd() * hh, 1, 1); }
    }
    ctx.restore();
  }

  function glass(ctx, x, y, w, hh, rnd, obscure) {
    const g = ctx.createLinearGradient(x, y, x, y + hh);
    if (obscure) { g.addColorStop(0, '#d5dde0'); g.addColorStop(1, '#aeb9bf'); } else { g.addColorStop(0, '#9fb3c2'); g.addColorStop(0.55, '#55666f'); g.addColorStop(1, '#2c363d'); }
    ctx.fillStyle = g; ctx.fillRect(x, y, w, hh);
    if (obscure) { ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < w * hh / 10; i++) ctx.fillRect(x + rnd() * w, y + rnd() * hh, 1, 1); return; }
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.13)';
    ctx.beginPath(); ctx.moveTo(x + w * 0.15, y); ctx.lineTo(x + w * 0.55, y); ctx.lineTo(x + w * 0.05, y + hh); ctx.lineTo(x - w * 0.35, y + hh); ctx.fill();
    ctx.restore();
  }
  function windowAt(ctx, wn, frame, wallHex, rnd, H, isBrick) {
    const { x, y, w, h: hh } = wn;
    const ft = Math.max(1.6, w * 0.05);
    if (isBrick) { ctx.fillStyle = shade(H.brickHex, -0.12); ctx.fillRect(x - 2, y - M2(H, 0.2), w + 4, M2(H, 0.2)); ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let xx = x - 2; xx < x + w + 2; xx += 2.4) ctx.fillRect(xx, y - M2(H, 0.2), 0.5, M2(H, 0.2)); }
    ctx.fillStyle = shade(wallHex, -0.45); ctx.fillRect(x - 1.5, y - 1.5, w + 3, hh + 3);
    ctx.fillStyle = shade('#d8d2c4', -0.05); ctx.fillRect(x - 3, y + hh, w + 6, Math.max(2.5, M2(H, 0.09)));
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x - 3, y + hh + Math.max(2.5, M2(H, 0.09)), w + 6, 1.2);
    ctx.fillStyle = frame; ctx.fillRect(x, y, w, hh);
    const gx = x + ft; const gy = y + ft; const gw = w - ft * 2; const gh = hh - ft * 2;
    glass(ctx, gx, gy, gw, gh, rnd, wn.type === 'obscure');
    if (wn.curtain) { ctx.fillStyle = wn.curtain; ctx.globalAlpha = 0.7; ctx.fillRect(gx, gy, gw * 0.22, gh); ctx.fillRect(gx + gw * 0.78, gy, gw * 0.22, gh); ctx.globalAlpha = 1; }
    ctx.fillStyle = frame;
    if (wn.type === 'sash') {
      ctx.fillRect(x, y + hh / 2 - ft * 0.6, w, ft * 1.2);
      if (wn.bars === 2) { ctx.fillRect(x + w / 2 - 0.6, y, 1.2, hh); ctx.fillRect(x, y + hh / 4, w, 1); ctx.fillRect(x, y + hh * 0.75, w, 1); }
    } else if (wn.type === 'case' || wn.type === 'obscure') {
      const lights = w > H.pxm * 1.1 ? 3 : 2;
      for (let i = 1; i < lights; i++) ctx.fillRect(x + (w * i) / lights - ft / 2, y, ft, hh);
      if (wn.type === 'case') ctx.fillRect(x, y + hh * 0.3 - ft / 2, w, ft);
    } else if (wn.type === 'pane' && w > H.pxm * 1.2) {
      ctx.fillRect(x + w * 0.62, y, ft, hh);
    }
  }
  const M2 = (H, m) => m * H.pxm;

  function doorAt(ctx, d, frame, H, rnd) {
    const { x, y, w, h: hh } = d;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x - 2, y - 2, w + 4, hh + 2);
    ctx.fillStyle = d.style === 'panel' ? '#f1efe8' : frame; ctx.fillRect(x, y, w, hh);
    const ft = Math.max(1.8, w * 0.06);
    let ly = y + ft;
    if (d.fan) {
      const fh = M2(H, 0.36);
      glass(ctx, x + ft, y + ft, w - ft * 2, fh - ft, rnd);
      ctx.fillStyle = '#f1efe8'; ctx.font = `bold ${Math.round(fh * 0.55)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(d.num), x + w / 2, y + ft + (fh - ft) / 2 + 1);
      ly = y + fh + ft * 0.5;
    }
    const lw = w - ft * 2; const lh = y + hh - ly;
    ctx.fillStyle = d.hex; ctx.fillRect(x + ft, ly, lw, lh);
    if (d.style === 'panel') {
      ctx.strokeStyle = shade(d.hex, -0.3); ctx.lineWidth = 1.1;
      const pw = lw * 0.32; const ph = lh * 0.3;
      for (const [px, py, pph] of [[0.12, 0.08, ph], [0.56, 0.08, ph], [0.12, 0.55, lh * 0.37], [0.56, 0.55, lh * 0.37]]) ctx.strokeRect(x + ft + lw * px, ly + lh * py, pw, pph);
      ctx.fillStyle = '#c9b37a'; ctx.fillRect(x + ft + lw * 0.3, ly + lh * 0.46, lw * 0.4, 2.2); ctx.beginPath(); ctx.arc(x + ft + lw * 0.5, ly + lh * 0.32, 1.8, 0, 7); ctx.fill();
    } else if (d.style === 'upvc') {
      glass(ctx, x + ft + lw * 0.15, ly + lh * 0.08, lw * 0.7, lh * 0.36, rnd, true);
      ctx.strokeStyle = shade(d.hex, -0.18); ctx.lineWidth = 1; ctx.strokeRect(x + ft + lw * 0.15, ly + lh * 0.55, lw * 0.7, lh * 0.36);
      ctx.fillStyle = '#9a9a9a'; ctx.fillRect(x + ft + lw * 0.8, ly + lh * 0.5, 2, lh * 0.08);
    } else {
      glass(ctx, x + ft + lw * 0.1, ly + lh * 0.06, lw * 0.14, lh * 0.88, rnd);
      ctx.fillStyle = '#b8b8b8'; ctx.fillRect(x + ft + lw * 0.78, ly + lh * 0.3, 2.4, lh * 0.4);
    }
    if (!d.fan && d.num && !d.rear) {
      ctx.fillStyle = '#f1efe8'; ctx.fillRect(x + w + 4, y + hh * 0.35, M2(H, 0.28), M2(H, 0.2));
      ctx.fillStyle = '#222'; ctx.font = `bold ${Math.max(7, Math.round(M2(H, 0.15)))}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(d.num), x + w + 4 + M2(H, 0.14), y + hh * 0.35 + M2(H, 0.1) + 0.5);
    }
  }

  function roofTex(ctx, hex, rnd, x, y, w, hh, pxm) {
    ctx.fillStyle = hex; ctx.fillRect(x, y, w, hh);
    const row = Math.max(3, 0.2 * pxm); const tile = Math.max(5, 0.3 * pxm);
    for (let yy = y + hh, r = 0; yy > y; yy -= row, r++) {
      for (let xx = x - (r % 2) * tile / 2; xx < x + w; xx += tile) { ctx.fillStyle = jit(hex, rnd, 0.07); ctx.fillRect(xx + 0.3, yy - row + 0.3, tile - 0.6, row - 0.4); }
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x, yy - 0.8, w, 0.8);
    }
  }

  function unitWalls(ctx, H, u, rnd) {
    const wallTop = H.roof === 'flat' ? H.eaves - M2(H, 0.6) : H.eaves;
    wallTex(ctx, u.finish, u.x0, wallTop, u.x1 - u.x0, H.G - wallTop, u.hex, H, rnd);
    if (H.roof === 'front_gable') {
      ctx.save(); ctx.beginPath(); ctx.moveTo(u.x0, H.eaves + 0.5); ctx.lineTo((u.x0 + u.x1) / 2, H.ridge); ctx.lineTo(u.x1, H.eaves + 0.5); ctx.closePath(); ctx.clip();
      wallTex(ctx, u.finish, u.x0, H.ridge, u.x1 - u.x0, H.eaves - H.ridge + 1, u.hex, H, rnd); ctx.restore();
    }
    // light: sun from one side, shadow under the eaves
    const lg = ctx.createLinearGradient(u.x0, 0, u.x1, 0);
    lg.addColorStop(0, H.sky === 'overcast' ? 'rgba(0,0,0,.02)' : H.sun < 0 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)');
    lg.addColorStop(1, H.sky === 'overcast' ? 'rgba(0,0,0,.05)' : H.sun < 0 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.06)');
    ctx.fillStyle = lg; ctx.fillRect(u.x0, wallTop, u.x1 - u.x0, H.G - wallTop);
    if (H.roof !== 'flat') { const sg = ctx.createLinearGradient(0, H.eaves, 0, H.eaves + M2(H, 0.45)); sg.addColorStop(0, 'rgba(0,0,0,.32)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sg; ctx.fillRect(u.x0, H.eaves, u.x1 - u.x0, M2(H, 0.45)); }
    // plinth
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(u.x0, H.G - M2(H, 0.25), u.x1 - u.x0, M2(H, 0.25));
  }
  function unitRoof(ctx, H, u, rnd, ov) {
    const x0 = u.x0 - ov; const x1 = u.x1 + ov;
    const rh = H.eaves - H.ridge;
    if (H.roof === 'flat') {
      const py = H.eaves - M2(H, 0.6);
      ctx.fillStyle = '#d9d4c6'; ctx.fillRect(u.x0 - 1, py - M2(H, 0.12), u.x1 - u.x0 + 2, M2(H, 0.14));
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(u.x0, py + 1, u.x1 - u.x0, 1.2);
      ctx.fillStyle = '#e6e1d6'; ctx.fillRect(u.x0, H.eaves - M2(H, 0.08), u.x1 - u.x0, M2(H, 0.16));
      return;
    }
    if (H.roof === 'front_gable') {
      ctx.fillStyle = shade(H.roofHex, -0.1);
      ctx.beginPath(); ctx.moveTo(x0 - 3, H.eaves + 3); ctx.lineTo((u.x0 + u.x1) / 2, H.ridge - 6); ctx.lineTo(x1 + 3, H.eaves + 3); ctx.lineTo(x1 - 4, H.eaves + 3); ctx.lineTo((u.x0 + u.x1) / 2, H.ridge + 2); ctx.lineTo(x0 + 4, H.eaves + 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = H.frameHex === '#34383d' ? '#34383d' : '#efece4'; ctx.lineWidth = M2(H, 0.14);
      ctx.beginPath(); ctx.moveTo(x0 + 2, H.eaves + 2); ctx.lineTo((u.x0 + u.x1) / 2, H.ridge); ctx.lineTo(x1 - 2, H.eaves + 2); ctx.stroke();
      return;
    }
    const ins = H.roof === 'hip' ? Math.min(rh * 0.95, (x1 - x0) / 2 - 2) : 0;
    ctx.save(); ctx.beginPath();
    if (H.roof === 'hip') {
      ctx.moveTo(x0, H.eaves); ctx.lineTo(x0 + ins, H.ridge); ctx.lineTo(x1 - ins, H.ridge); ctx.lineTo(x1, H.eaves); ctx.closePath();
    } else ctx.rect(x0, H.ridge, x1 - x0, rh);
    ctx.clip();
    roofTex(ctx, H.roofHex, rnd, x0, H.ridge, x1 - x0, rh, H.pxm);
    const gg = ctx.createLinearGradient(0, H.ridge, 0, H.eaves); gg.addColorStop(0, 'rgba(255,255,255,.07)'); gg.addColorStop(1, 'rgba(0,0,0,.12)');
    ctx.fillStyle = gg; ctx.fillRect(x0, H.ridge, x1 - x0, rh);
    ctx.restore();
    ctx.fillStyle = shade(H.roofHex, -0.25); ctx.fillRect(x0 + ins, H.ridge - 1.5, x1 - x0 - ins * 2, M2(H, 0.13));
    if (H.roof === 'hip') {
      ctx.strokeStyle = shade(H.roofHex, -0.3); ctx.lineWidth = M2(H, 0.1);
      ctx.beginPath(); ctx.moveTo(x0, H.eaves); ctx.lineTo(x0 + ins, H.ridge); ctx.moveTo(x1, H.eaves); ctx.lineTo(x1 - ins, H.ridge); ctx.stroke();
    }
    ctx.fillStyle = H.frameHex === '#34383d' ? '#2b2e33' : '#efece4'; ctx.fillRect(x0, H.eaves - 1, x1 - x0, M2(H, 0.16));
    ctx.fillStyle = '#26282b'; ctx.fillRect(x0, H.eaves + M2(H, 0.14), x1 - x0, M2(H, 0.08));
  }
  function chimney(ctx, H, c, rnd) {
    brickTex(ctx, c.x, c.y, c.w, c.h, H.brickHex, rnd, H.pxm, false);
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(c.x + c.w * 0.6, c.y, c.w * 0.4, c.h);
    ctx.fillStyle = '#cfc8b8'; ctx.fillRect(c.x - 2, c.y, c.w + 4, M2(H, 0.12));
    const pots = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < pots; i++) {
      const pw = M2(H, 0.16); const px = c.x + (c.w * (i + 1)) / (pots + 1) - pw / 2;
      ctx.fillStyle = '#a8553a'; ctx.fillRect(px, c.y - M2(H, 0.38), pw, M2(H, 0.38));
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + pw * 0.6, c.y - M2(H, 0.38), pw * 0.4, M2(H, 0.38));
    }
  }

  function paint(ctx, H) {
    const rnd = OS.rng('gold-paint:' + H.id);
    // sky
    const sk = ctx.createLinearGradient(0, 0, 0, H.G);
    if (H.sky === 'overcast') { sk.addColorStop(0, '#b9bfc6'); sk.addColorStop(1, '#e2e4e3'); } else { sk.addColorStop(0, '#6f9fcf'); sk.addColorStop(1, '#d2e1ec'); }
    ctx.fillStyle = sk; ctx.fillRect(0, 0, PW, PH);
    for (let i = 0; i < (H.sky === 'overcast' ? 9 : 4); i++) {
      const cx = rnd() * PW; const cy = 20 + rnd() * 150; const r = 50 + rnd() * 90;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, H.sky === 'overcast' ? 'rgba(240,241,242,.55)' : 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.save(); ctx.translate(cx, cy); ctx.scale(1.8, 0.6); ctx.translate(-cx, -cy); ctx.fillRect(cx - r, cy - r, r * 2, r * 2); ctx.restore();
    }
    // trees behind
    for (let i = 0; i < 7; i++) {
      const tx = rnd() * PW; const ty = H.G - 60 - rnd() * 140; const r = 26 + rnd() * 40;
      for (let j = 0; j < 7; j++) { ctx.fillStyle = jit(H.view === 'rear' ? '#4f6b3c' : '#55703f', rnd, 0.18); ctx.beginPath(); ctx.arc(tx + (rnd() - 0.5) * r * 1.4, ty + (rnd() - 0.5) * r, r * (0.45 + rnd() * 0.35), 0, 7); ctx.fill(); }
    }
    const isBrick = H.finish === 'brick';
    const main = { x0: H.x0, x1: H.x1, finish: H.finish, hex: H.finish === 'brick' ? H.brickHex : H.wallHex };
    for (const nb of H.neighbours) unitWalls(ctx, H, nb, rnd);
    unitWalls(ctx, H, main, rnd);
    const ov = H.form === 'detached' ? M2(H, 0.25) : 0;
    if (H.roof === 'front_gable') { for (const nb of H.neighbours) unitRoof(ctx, H, nb, rnd, 0); unitRoof(ctx, H, main, rnd, M2(H, 0.2)); }
    else {
      const all = [main, ...H.neighbours];
      unitRoof(ctx, H, { x0: Math.min(...all.map((u) => u.x0)), x1: Math.max(...all.map((u) => u.x1)) }, rnd, ov);
    }
    for (const nb of H.neighbours) {
      for (const w of nb.wins) windowAt(ctx, w, H.frameHex, nb.hex, rnd, H, nb.finish === 'brick');
      if (nb.door) { if (H.lower) steps(ctx, H, nb.door, rnd); doorAt(ctx, { ...nb.door, style: 'panel', fan: false, num: 0, rear: true }, '#f1efe8', H, rnd); }
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(nb.x0 - 0.5, H.eaves, 1, H.G - H.eaves); ctx.fillRect(nb.x1 - 0.5, H.eaves, 1, H.G - H.eaves);
    }
    // dormers
    for (const d of H.dormers) {
      if (d.box) {
        ctx.fillStyle = '#e9e6de'; ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.fillStyle = 'rgba(0,0,0,.08)'; for (let yy = d.y + 4; yy < d.y + d.h; yy += 4) ctx.fillRect(d.x, yy, d.w, 0.6);
        ctx.fillStyle = '#2f3134'; ctx.fillRect(d.x - 2, d.y - 3, d.w + 4, 4);
      } else {
        ctx.fillStyle = H.finish === 'brick' ? '#ece8df' : shade(H.wallHex, -0.04); ctx.fillRect(d.x, d.y + M2(H, 0.3), d.w, d.h - M2(H, 0.3));
        ctx.fillStyle = H.roofHex; ctx.beginPath(); ctx.moveTo(d.x - 4, d.y + M2(H, 0.4)); ctx.lineTo(d.x + d.w / 2, d.y - M2(H, 0.3)); ctx.lineTo(d.x + d.w + 4, d.y + M2(H, 0.4)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#efece4'; ctx.lineWidth = 1.6; ctx.stroke();
      }
      for (const w of d.wins) windowAt(ctx, w, H.frameHex, '#e9e6de', rnd, H, false);
    }
    for (const c of H.chimneys) chimney(ctx, H, c, rnd);
    for (const w of H.wins) windowAt(ctx, w, H.frameHex, main.hex, rnd, H, isBrick && w.lvl >= 0);
    if (H.bay) {
      const b = H.bay; const gl = b.glass;
      wallTex(ctx, H.finish === 'brick' ? 'brick' : 'render', b.x, gl.y + gl.h, b.w, H.base - gl.y - gl.h, H.finish === 'brick' ? H.brickHex : '#efece4', H, rnd);
      ctx.fillStyle = H.frameHex; ctx.fillRect(b.x, gl.y - 2, b.w, gl.h + 4);
      const parts = [[0, 0.22, -0.18], [0.22, 0.78, 0], [0.78, 1, -0.18]];
      for (const [a, z, dk] of parts) {
        glass(ctx, b.x + b.w * a + 2, gl.y + 1, b.w * (z - a) - 4, gl.h - 2, rnd);
        if (dk) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(b.x + b.w * a + 2, gl.y + 1, b.w * (z - a) - 4, gl.h - 2); }
        ctx.fillStyle = H.frameHex; ctx.fillRect(b.x + b.w * a + 2, gl.y + gl.h * 0.3, b.w * (z - a) - 4, 1.4);
      }
      ctx.fillStyle = shade(H.roofHex, 0.05);
      ctx.beginPath(); ctx.moveTo(b.x - 3, gl.y - 1); ctx.lineTo(b.x + b.w * 0.18, b.roofY); ctx.lineTo(b.x + b.w * 0.82, b.roofY); ctx.lineTo(b.x + b.w + 3, gl.y - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#efece4'; ctx.fillRect(b.x - 3, gl.y - 3, b.w + 6, 2.6);
      ctx.fillStyle = '#d8d2c4'; ctx.fillRect(b.x - 2, gl.y + gl.h, b.w + 4, 3);
    }
    if (H.door) {
      if (H.lower) steps(ctx, H, H.door, rnd);
      else {
        ctx.fillStyle = '#cfcabd'; ctx.fillRect(H.door.x - M2(H, 0.2), H.base - 1, H.door.w + M2(H, 0.4), M2(H, 0.12));
      }
      doorAt(ctx, H.door, H.frameHex, H, rnd);
      if (H.porch) {
        const p = H.porch;
        if (p.kind === 'pitch') {
          ctx.fillStyle = H.roofHex; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w / 2, p.y - M2(H, 0.55)); ctx.lineTo(p.x + p.w, p.y); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#efece4'; ctx.lineWidth = 1.8; ctx.stroke();
        } else { ctx.fillStyle = '#3d4044'; ctx.fillRect(p.x, p.y - M2(H, 0.14), p.w, M2(H, 0.14)); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(p.x + 2, p.y, p.w - 4, M2(H, 0.2)); }
      }
    }
    // gutter downpipe from the main roof front gutter
    if (H.roof !== 'flat') {
      const dpx = H.door && H.door.x - H.x0 < H.fw / 2 ? H.x1 - M2(H, 0.25) : H.x0 + M2(H, 0.15);
      ctx.fillStyle = '#26282b'; ctx.fillRect(dpx, H.eaves + M2(H, 0.18), M2(H, 0.08), H.G - H.eaves - M2(H, 0.18));
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(dpx, H.eaves + M2(H, 0.18), 0.8, H.G - H.eaves);
    }
    if (H.ext) {
      const e = H.ext;
      wallTex(ctx, e.finish === 'render' ? 'render' : H.finish, e.x0, e.topY, e.x1 - e.x0, H.G - e.topY, e.finish === 'render' ? '#efede7' : main.hex, H, rnd);
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(e.x1 - 3, e.topY, 3, H.G - e.topY);
      if (e.roof === 'lean') {
        const ry0 = e.topY - M2(H, 0.95);
        ctx.save(); ctx.beginPath(); ctx.rect(e.x0 - 4, ry0, e.x1 - e.x0 + 8, e.topY - ry0); ctx.clip();
        roofTex(ctx, H.roofHex, rnd, e.x0 - 4, ry0, e.x1 - e.x0 + 8, e.topY - ry0, H.pxm); ctx.restore();
        for (const f of [0.3, 0.7]) { ctx.fillStyle = '#2b3036'; ctx.fillRect(e.x0 + (e.x1 - e.x0) * f - M2(H, 0.35), ry0 + M2(H, 0.2), M2(H, 0.7), M2(H, 0.5)); glass(ctx, e.x0 + (e.x1 - e.x0) * f - M2(H, 0.3), ry0 + M2(H, 0.24), M2(H, 0.6), M2(H, 0.42), rnd); }
        ctx.fillStyle = '#26282b'; ctx.fillRect(e.x0 - 4, e.topY, e.x1 - e.x0 + 8, M2(H, 0.1));
      } else {
        ctx.fillStyle = '#d9d4c6'; ctx.fillRect(e.x0 - 2, e.topY - M2(H, 0.1), e.x1 - e.x0 + 4, M2(H, 0.12));
        const lx = (e.x0 + e.x1) / 2; ctx.fillStyle = 'rgba(160,185,200,.85)';
        ctx.beginPath(); ctx.moveTo(lx - M2(H, 0.8), e.topY - M2(H, 0.1)); ctx.lineTo(lx, e.topY - M2(H, 0.65)); ctx.lineTo(lx + M2(H, 0.8), e.topY - M2(H, 0.1)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#33373c'; ctx.lineWidth = 1.2; ctx.stroke();
      }
      const g = e.glass;
      ctx.fillStyle = '#2e3236'; ctx.fillRect(g.x - 2, g.y - 2, g.w + 4, g.h + 2);
      glass(ctx, g.x, g.y, g.w, g.h, rnd);
      const panes = Math.max(2, Math.round(g.w / M2(H, 0.85)));
      ctx.fillStyle = '#2e3236'; for (let i = 1; i < panes; i++) ctx.fillRect(g.x + (g.w * i) / panes - 1.2, g.y, 2.4, g.h);
    }
    // foreground
    if (H.view === 'front') {
      const fy = H.G; const wy = H.G + 16; const py = H.G + 44;
      ctx.fillStyle = '#a99f8c'; ctx.fillRect(0, fy, PW, wy - fy + 2);
      for (let i = 0; i < 900; i++) { ctx.fillStyle = jit('#a99f8c', rnd, 0.2); ctx.fillRect(rnd() * PW, fy + rnd() * (wy - fy), 1.4, 1.4); }
      const doorCx = H.door ? H.door.x + H.door.w / 2 : PW / 2;
      ctx.fillStyle = '#c8c1b2'; ctx.beginPath(); ctx.moveTo(doorCx - M2(H, 0.55), fy); ctx.lineTo(doorCx + M2(H, 0.55), fy); ctx.lineTo(doorCx + M2(H, 0.75), PH); ctx.lineTo(doorCx - M2(H, 0.75), PH); ctx.fill();
      ctx.fillStyle = '#9a9a95'; ctx.fillRect(0, py, PW, PH - py);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = -20; x < PW; x += 46) { ctx.moveTo(x, py); ctx.lineTo(x - 18, PH); }
      ctx.moveTo(0, py + 32); ctx.lineTo(PW, py + 32); ctx.stroke();
      const gapL = doorCx - M2(H, 0.7); const gapR = doorCx + M2(H, 0.7);
      const hedge = H.era === 'thirties' || H.era === 'postwar' ? rnd() < 0.5 : false;
      for (const [a, b] of [[0, gapL], [gapR, PW]]) {
        if (b <= a) continue;
        if (hedge) { for (let x = a; x < b; x += 7) { ctx.fillStyle = jit('#3f5a2e', rnd, 0.2); ctx.beginPath(); ctx.arc(x + 3, wy + 6 + rnd() * 4, 8 + rnd() * 4, 0, 7); ctx.fill(); } ctx.fillStyle = '#3a5229'; ctx.fillRect(a, wy + 8, b - a, py - wy - 8); }
        else { brickTex(ctx, a, wy, b - a, py - wy, H.finish === 'brick' ? H.brickHex : '#9c5a44', rnd, H.pxm * 1.25, false); ctx.fillStyle = '#d4cfc2'; ctx.fillRect(a, wy - 3, b - a, 4); }
      }
      if (H.lower) {
        ctx.fillStyle = '#16171a';
        for (let x = 0; x < PW; x += 7) { if (x > gapL - 4 && x < gapR + 4) continue; ctx.fillRect(x, wy - M2(H, 0.95), 1.4, M2(H, 0.95)); ctx.beginPath(); ctx.moveTo(x - 1.4, wy - M2(H, 0.95)); ctx.lineTo(x + 0.7, wy - M2(H, 1.08)); ctx.lineTo(x + 2.8, wy - M2(H, 0.95)); ctx.fill(); }
        ctx.fillRect(0, wy - M2(H, 0.82), gapL - 4, 1.6); ctx.fillRect(gapR + 4, wy - M2(H, 0.82), PW, 1.6);
      }
      if (H.form !== 'terrace' && rnd() < 0.8) {
        const bx = H.x1 + 14 < PW - 40 && H.form === 'detached' ? H.x1 + 14 : H.x0 - 50 > 10 && H.form === 'detached' ? H.x0 - 50 : null;
        if (bx != null) for (const [i, col] of [[0, '#2f5a3a'], [1, '#3a4045']]) {
          const x = bx + i * 22; const bh = M2(H, 1.05);
          ctx.fillStyle = col; ctx.fillRect(x, wy - bh, 19, bh); ctx.fillStyle = shade(col, -0.25); ctx.fillRect(x - 1, wy - bh - 3, 21, 4);
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + 4, wy - 2, 3, 0, 7); ctx.fill();
        }
      }
    } else {
      const py = H.G + 22;
      ctx.fillStyle = '#b9b6ad'; ctx.fillRect(0, H.G, PW, py - H.G);
      ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x < PW; x += 38) { ctx.moveTo(x, H.G); ctx.lineTo(x - 4, py); } ctx.moveTo(0, H.G + 11); ctx.lineTo(PW, H.G + 11); ctx.stroke();
      for (let i = 0, y = py; y < PH; i++) { const bh = 16 + i * 3; ctx.fillStyle = i % 2 ? '#6f8e47' : '#7c9b52'; ctx.fillRect(0, y, PW, bh + 1); y += bh; }
      for (let i = 0; i < 2600; i++) { ctx.fillStyle = jit('#728f4a', rnd, 0.22); ctx.fillRect(rnd() * PW, py + rnd() * (PH - py), 1, 2); }
      const fenceL = Math.max(0, Math.min(H.x0 - 6, 120)); const fenceR = Math.min(PW, Math.max(H.x1 + 6, PW - 120));
      for (const [farX, nearX] of [[fenceL, 0], [fenceR, PW]]) {
        if (Math.abs(farX - nearX) < 4) continue;
        ctx.save(); ctx.beginPath(); ctx.moveTo(farX, H.G - M2(H, 1.7)); ctx.lineTo(nearX, H.G - M2(H, 3.2)); ctx.lineTo(nearX, PH); ctx.lineTo(farX, H.G + 2); ctx.closePath(); ctx.clip();
        ctx.fillStyle = '#7a5b3e'; ctx.fillRect(0, 0, PW, PH);
        const step = farX > nearX ? -9 : 9;
        for (let x = farX; step < 0 ? x > nearX : x < nearX; x += step) { ctx.fillStyle = jit('#7a5b3e', rnd, 0.12); ctx.fillRect(Math.min(x, x + step), 0, Math.abs(step) - 1, PH); }
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, PW, PH);
        ctx.restore();
      }
      const lx = rnd() < 0.5 ? 70 + rnd() * 50 : PW - 120 + rnd() * 50; const ly = PH - 30;
      ctx.strokeStyle = '#8d9092'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - 150); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(210,212,214,.9)';
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(lx - 80, ly - 150 + 6 + Math.abs(i) * 2); ctx.quadraticCurveTo(lx, ly - 150 + 14 + i * 3, lx + 80, ly - 150 + 6 + Math.abs(i) * 2); ctx.stroke(); }
      ctx.strokeStyle = '#8d9092'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx - 82, ly - 142); ctx.lineTo(lx, ly - 156); ctx.lineTo(lx + 82, ly - 142); ctx.stroke();
      ctx.fillStyle = '#c96f4a'; ctx.fillRect(lx + 14, ly - 46 + 30, 16, 14);
    }
    // photo: vignette, then the listing's photo number
    const vg = ctx.createRadialGradient(PW / 2, PH / 2, PH * 0.45, PW / 2, PH / 2, PW * 0.65);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.22)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, PW, PH);
    ctx.font = '600 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const label = `Photo ${H.photoNo} of ${H.photoOf}`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; roundRect(ctx, PW - tw - 26, PH - 30, tw + 16, 20, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, PW - tw - 18, PH - 20);
  }
  function steps(ctx, H, d, rnd) {
    for (let k = 0; k < 5; k++) {
      const sh = (H.G - H.base) / 5; const sw = d.w + M2(H, 0.5) + k * M2(H, 0.14);
      ctx.fillStyle = jit('#cfcabd', rnd, 0.05); ctx.fillRect(d.x + d.w / 2 - sw / 2, H.base + k * sh, sw, sh);
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(d.x + d.w / 2 - sw / 2, H.base + k * sh, sw, 1);
    }
  }
  function roundRect(ctx, x, y, w, hh, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function photoOf(H) {
    const c = document.createElement('canvas');
    c.width = PW * SS; c.height = PH * SS;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.scale(SS, SS);
    paint(ctx, H);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const rnd = OS.rng('gold-grain:' + H.id);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, data: d };
  }
  const sampleHex = (P, x, y) => {
    const sx = OS.clamp(Math.floor(x * SS), 0, PW * SS - 1); const sy = OS.clamp(Math.floor(y * SS), 0, PH * SS - 1);
    const i = (sy * PW * SS + sx) * 4;
    return rgbHex(P.data[i], P.data[i + 1], P.data[i + 2]);
  };

  // ---------- the second labeller ----------
  function botCopy(H, P) {
    const rnd = OS.rng('gold-bot:' + H.id);
    const C = (p) => rnd() < p;
    const R = (a, b) => a + (b - a) * rnd();
    const pickOf = (x, y) => ({ pick: true, hex: sampleHex(P, x, y), x: Math.round(x), y: Math.round(y) });
    const inside = (x, y) => H.marks.some((m) => x > m.x - 6 && x < m.x + m.w + 6 && y > m.y - 6 && y < m.y + m.h + 6);
    const wallPoint = () => {
      for (let i = 0; i < 60; i++) {
        const x = H.x0 + 8 + rnd() * (H.fw - 16); const y = H.eaves + 14 + rnd() * (H.G - H.eaves - 30);
        if (!inside(x, y) && !(H.ext && x > H.ext.x0 - 4 && x < H.ext.x1 + 4 && y > H.ext.topY - 30)) return [x, y];
      }
      return [H.x0 + 10, H.eaves + 20];
    };
    const t = H.truth; const a = {}; const u = {}; const log = [];
    a.front = t.front === 'rear' ? (C(0.65) ? 'front' : 'rear') : (C(0.96) ? 'front' : 'rear');
    log.push(a.front === 'front' ? `Photo 1 of ${H.photoOf}. Photo 1 is the front.` : 'A garden and a washing line. The rear.');
    if (C(0.72)) a.storeys = t.storeys;
    else a.storeys = t.storeys.endsWith('r') ? t.storeys.replace(/,\d+r$/, '') : t.storeys.startsWith('-1') ? t.storeys.slice(3) : t.storeys === '0,1' ? '0,1,2' : '0,1';
    log.push(`Storeys ${a.storeys.replace(/r/g, ' in the roof').replace(/,/g, ', ')}, counted from ground = 0.`);
    const conf = { pebbledash: 'render', render: 'pebbledash', painted_brick: 'render', brick: 'painted_brick', timber_cladding: 'render' };
    a.finish = C(0.78) ? t.finish : conf[t.finish] || 'render';
    if (VARIES.has(a.finish)) {
      const [x, y] = wallPoint();
      if (t.wall?.swatch && C(0.55)) a.wall = { swatch: t.wall.swatch, hex: SW_HEX[t.wall.swatch] };
      else if (C(0.82)) a.wall = pickOf(x, y);
      else { const s = WALL_SW[Math.floor(rnd() * WALL_SW.length)]; a.wall = { swatch: s[0], hex: s[2] }; }
      log.push(`Finish ${optText('finish', a.finish).toLowerCase()}. Wall colour ${a.wall.swatch ? SW_NAME[a.wall.swatch].toLowerCase() : `picked at (${a.wall.x}, ${a.wall.y}): ${a.wall.hex}`}.`);
    } else log.push(`Finish ${optText('finish', a.finish).toLowerCase()}. Wall colour not asked.`);
    const d = H.door || (H.ext && { x: H.ext.glass.x, y: H.ext.glass.y, w: H.ext.glass.w, h: H.ext.glass.h });
    if (t.door === 'cant_tell') a.door = C(0.4) || !d ? 'cant_tell' : pickOf(d.x + d.w * 0.06, d.y + d.h * 0.6);
    else if (t.door.swatch) a.door = C(0.72) ? { swatch: t.door.swatch, hex: SW_HEX[t.door.swatch] } : pickOf(d.x + d.w * 0.5, d.y + d.h * (d.fan ? 0.62 : 0.55));
    else if (C(0.7)) a.door = pickOf(d.x + d.w * 0.5, d.y + d.h * (d.fan ? 0.62 : 0.55));
    else { const near = DOOR_SW.map(([k, , hx]) => [k, hx, deltaE(hx, t.door.hex)]).sort((p, q) => p[2] - q[2])[0]; a.door = { swatch: near[0], hex: near[1] }; }
    log.push(a.door === 'cant_tell' ? 'Front door: can\'t tell.' : `Front door ${a.door.swatch ? SW_NAME[a.door.swatch].toLowerCase() : a.door.hex}.`);
    const rconf = { gable: 'front_gable', hip: 'gable', front_gable: 'gable', chalet: 'gable', flat: 'flat' };
    a.roof = C(0.84) ? t.roof : rconf[t.roof];
    log.push(`Roof ${optText('roof', a.roof).toLowerCase()}.`);
    let boxes = [];
    for (const m of H.marks) {
      if (m.bay && C(0.45)) { for (const [p, q] of [[0, 0.22], [0.22, 0.78], [0.78, 1]]) boxes.push({ kind: 'window', x: m.x + m.w * p, y: m.y, w: m.w * (q - p), h: m.h }); continue; }
      boxes.push({ kind: m.kind, x: m.x + R(-3, 3), y: m.y + R(-3, 3), w: m.w + R(-4, 4), h: m.h + R(-4, 4) });
    }
    if (boxes.length > 2 && C(0.22)) { const small = boxes.reduce((p, q) => (q.w * q.h < p.w * p.h ? q : p)); boxes = boxes.filter((b) => b !== small); }
    if (H.nbWins.length && C(0.4)) {
      const nb = H.nbWins.slice().sort((p, q) => Math.abs(p.x - H.x0) - Math.abs(q.x - H.x0))[0];
      boxes.push({ kind: 'window', x: nb.x + R(-2, 2), y: nb.y + R(-2, 2), w: nb.w, h: nb.h });
    }
    a.facade = boxes.map((b, i) => ({ id: 'b' + i, kind: b.kind, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }));
    log.push(`Boxed ${a.facade.length} openings, with confidence.`);
    for (const q of Q) if (C(0.1) && a[q.key] !== undefined) u[q.key] = true;
    const cost = Math.round((0.03 + rnd() * 0.07) * 100) / 100;
    return { ans: a, unsure: u, log, cost };
  }

  // ---------- agreement, using the gold rules ----------
  const iou = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)); const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const i = ix * iy; return i / (a.w * a.h + b.w * b.h - i || 1);
  };
  function matchBoxes(A, B) {
    const cand = [];
    A.forEach((a, i) => B.forEach((b, j) => { const v = iou(a, b); if (v >= 0.5 && a.kind === b.kind) cand.push([v, i, j]); }));
    cand.sort((p, q) => q[0] - p[0]);
    const ua = new Set(); const ub = new Set(); const pairs = [];
    for (const [v, i, j] of cand) if (!ua.has(i) && !ub.has(j)) { ua.add(i); ub.add(j); pairs.push({ i, j, v }); }
    return { pairs, onlyA: A.map((_, i) => i).filter((i) => !ua.has(i)), onlyB: B.map((_, j) => j).filter((j) => !ub.has(j)) };
  }
  function compareVals(key, a, b) {
    if (key === 'facade') {
      const m = matchBoxes(a, b);
      return { eq: !m.onlyA.length && !m.onlyB.length, detail: `${m.pairs.length} of ${Math.max(a.length, b.length)} boxes match at overlap 0.5`, match: m };
    }
    if (Q[QI[key]].colour) {
      if (a === 'cant_tell' || b === 'cant_tell') return { eq: a === b, detail: a === b ? 'both can\'t tell' : 'a colour against can\'t tell' };
      const de = deltaE(a.hex, b.hex);
      return { eq: de <= 10, detail: `ΔE ${de.toFixed(1)}`, de };
    }
    return { eq: a === b, detail: '' };
  }
  function goldFinishes(items, dec) {
    const f = items.finish;
    if (!f) return null;
    if (dec.finish) { const d = dec.finish; return d === 'drop' ? [] : d === 'either' ? [f.a, f.b] : d === 'copy2' ? [f.b] : [f.a]; }
    if (f.stat === 'gold' || f.stat === 'single') return [f.a ?? f.b];
    return null;
  }
  function classify(st) {
    const A = st.ans; const B = st.bot.ans; const items = {};
    for (const q of Q) {
      let a = q.key === 'facade' ? st.marks : A[q.key]; let b = B[q.key];
      if (q.key === 'wall') {
        if (!VARIES.has(A.finish)) a = undefined;
        if (!VARIES.has(B.finish)) b = undefined;
      }
      const it = { key: q.key, label: q.label, a, b, ua: !!st.unsure[q.key], ub: !!st.bot.unsure[q.key] };
      const has = (v) => v !== undefined && v !== null;
      if (q.key === 'wall') {
        const gf = goldFinishes(items, st.dec);
        if (!gf) { it.stat = 'blocked'; items[q.key] = it; continue; }
        if (!gf.some((v) => VARIES.has(v))) { it.stat = 'not_asked'; items[q.key] = it; continue; }
      }
      if (!has(a) && !has(b)) it.stat = 'unanswered';
      else if (a === 'none_fits' || b === 'none_fits') it.stat = 'none_fits';
      else if (!has(a) || !has(b)) it.stat = 'single';
      else {
        const c = compareVals(q.key, a, b); it.cmp = c;
        it.stat = !c.eq ? 'disagreement' : it.ua || it.ub ? 'flag' : 'gold';
      }
      items[q.key] = it;
    }
    return items;
  }
  const NEEDS = new Set(['disagreement', 'flag', 'none_fits']);
  const STAT = {
    gold: ['good', 'gold (auto)', 'gold'], flag: ['warn', 'flag', 'flag'], disagreement: ['bad', 'disagreement', 'disagree'], none_fits: ['warn', 'none fits', 'none fits'],
    single: ['info', 'single-sourced', 'single'], not_asked: ['', 'not asked', 'n/a'], blocked: ['info', 'blocked', 'blocked'], unanswered: ['', 'unanswered', 'none'],
  };
  const RULE = {
    disagreement: 'Different values, can\'t tell against a value included, are a disagreement. A person resolves it.',
    flag: 'Equal values, but a copy was unsure. That is a flag, not gold.',
    none_fits: 'Either value is None fits. One item per house and field.',
    colour: 'Two colours are the same within ΔE 10 (CIEDE2000, lightness at half weight). A white door photographed off-grey is still a white door.',
    facade: 'Boxes agree when every box has a partner of the same kind at overlap 0.5 or more. Neighbours, garden walls and fences are left out.',
    storeys: 'Storeys compare as sets. Ground = 0, first = 1, lower ground = -1.',
  };
  function goldOf(it, d) {
    if (d === 'drop') return { dropped: true };
    if (d === 'either') return { accepted: [it.a, it.b] };
    if (d === 'copy2') return { value: it.b, copy: 2 };
    if (d === 'copy1' || d === 'stands') return { value: it.a, copy: 1 };
    if (it.stat === 'single') return { value: it.a ?? it.b, copy: it.a != null ? 1 : 2 };
    if (it.stat === 'gold') {
      if (Q[QI[it.key]].colour && it.a !== 'cant_tell') {
        const sw = it.a.swatch ? it.a : it.b.swatch ? it.b : null;
        return { value: sw ? { swatch: sw.swatch, hex: SW_HEX[sw.swatch] } : it.a, copy: sw === it.b ? 2 : 1 };
      }
      return { value: it.a, copy: 1 };
    }
    return null;
  }

  // ---------- YAML ----------
  const yv = (key, v) => {
    if (v === 'cant_tell') return 'unknown';
    if (key === 'storeys') return `[${storeyLevels(v).map((l) => l.lvl).join(', ')}]`;
    if (Q[QI[key]].colour) return v.swatch ? `{hex: "${v.hex}", swatch: ${v.swatch}}` : `{hex: "${v.hex}", x: ${v.x}, y: ${v.y}}`;
    return v;
  };
  function toYaml(st, reason) {
    const H = st.H; const items = classify(st); const lines = [];
    const agr = agreement(items);
    lines.push(`# ~/gold-overrides/${H.id}.yml`, '# Gold is never stored, and never edited. This override sits over it.',
      `house: ${H.id}`, `address: "${H.address}"`, 'set: development', 'dev_set: smoke', `photo: "${H.photoNo} of ${H.photoOf}"`,
      `saved_at: ${OS.now().toISOString().slice(0, 19)}Z`, `reason: "${String(reason).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`, 'copies: [researcher, labeller-2]',
      `agreement: ${agr.compared ? (agr.agreed / agr.compared).toFixed(2) : 'n/a'}   # ${agr.agreed} of ${agr.compared} compared`, 'fields:');
    for (const q of Q) {
      const it = items[q.key]; const d = st.dec[q.key]; const g = goldOf(it, d);
      const src = d ? `resolution: ${d === 'copy1' ? 'copy 1' : d === 'copy2' ? 'copy 2' : d}` : it.stat === 'gold' ? 'auto' : it.stat === 'single' ? `single-sourced, copy ${g?.copy}` : it.stat;
      if (!g) { lines.push(`  ${q.key}: ${it.stat}`); continue; }
      if (g.dropped) { lines.push(`  ${q.key}: {dropped: true, source: "${src}"}`); continue; }
      if (q.key === 'facade') {
        const list = g.accepted ? g.accepted[0] : g.value;
        lines.push(`  facade:   # ${src}`);
        if (!list.length) lines.push('    []');
        for (const m of list) lines.push(`    - {kind: ${m.kind}, storey: ${storeyOf(H, m) ?? 'none'}, x: ${Math.round(m.x)}, y: ${Math.round(m.y)}, w: ${Math.round(m.w)}, h: ${Math.round(m.h)}}`);
        continue;
      }
      if (g.accepted) { lines.push(`  ${q.key}:   # ${src}: both count`); for (const v of g.accepted) lines.push(`    - ${yv(q.key, v)}`); continue; }
      const inRoof = q.key === 'storeys' && g.value !== 'cant_tell' ? storeyLevels(g.value).filter((l) => l.roof).map((l) => `; ${l.lvl} in the roof`).join('') : '';
      lines.push(`  ${q.key}: ${yv(q.key, g.value)}   # ${src}${inRoof}`);
    }
    return lines.join('\n') + '\n';
  }
  function storeyOf(H, m) {
    const cy = m.y + m.h / 2;
    if (m.x + m.w < H.x0 - 4 || m.x > H.x1 + 4) return null;
    const hit = H.levels.filter((l) => cy >= l.y0 - 2 && cy <= l.y1 + 2);
    return hit.length ? hit[hit.length - 1].lvl : null;
  }
  function agreement(items) {
    let compared = 0; let agreed = 0;
    for (const it of Object.values(items)) if (['gold', 'flag', 'disagreement'].includes(it.stat)) { compared++; if (it.stat !== 'disagreement') agreed++; }
    return { compared, agreed };
  }

  // ---------- writing ----------
  function writeGold(path, text) {
    // /gold is mounted read-only (the boot log says so). The disk does not refuse writes there yet, so the labeller does.
    if (path === '/gold' || path.startsWith('/gold/')) { const e = new Error(`${path}: Read-only file system`); e.code = 'EPERM'; throw e; }
    OS.fs.write(path, text);
  }

  // ---------- styles ----------
  function css() {
    if (document.getElementById('gold-css')) return;
    document.head.append(h('style', { id: 'gold-css', text: `
.gold { position: absolute; inset: 0; display: grid; grid-template-columns: 214px minmax(0, 1fr) 340px; font-size: 12px; background: var(--surface); }
.gold.m { grid-template-columns: minmax(0, 1fr) 300px; }
.gold.n { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(190px, 46%) minmax(0, 1fr); }
.gold-q { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border); background: var(--surface); }
.gold.m .gold-q, .gold.n .gold-q { display: none; }
.gold.qopen .gold-q { display: flex; position: absolute; left: 0; top: 33px; bottom: 0; width: min(240px, 92%); z-index: 4; box-shadow: 8px 0 30px rgba(0,0,0,.35); }
.gold-qh { padding: 9px 10px 6px; border-bottom: 1px solid var(--border); }
.gold-qh .ui-title { display: flex; align-items: center; gap: 6px; }
.gold-qh select { width: 100%; margin-top: 6px; }
.gold-ql { flex: 1; overflow: auto; padding: 4px 0; }
.gold-qsec { padding: 8px 10px 3px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); font-weight: 700; display: flex; align-items: center; gap: 5px; }
.gold-qr { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1px 6px; align-items: center; padding: 4px 10px 5px; cursor: pointer; border-left: 2px solid transparent; }
.gold-qr .ad { grid-column: 1 / -1; }
.gold-qr .ui-tag { height: 17px; font-size: 10px; padding: 0 5px; }
.gold-qr:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
.gold-qr.cur { background: var(--sel); border-left-color: var(--accent); }
.gold-qr b { font-weight: 800; }
.gold-qr .ad { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.gold-qr.held { color: var(--faint); }
.gold-qr.held .ad { color: var(--faint); }
.gold-qr .icon { width: 12px; height: 12px; }
.gold-qs { border-top: 1px solid var(--border); padding: 8px 10px; display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; font-size: 11px; }
.gold-qs span { color: var(--muted); }
.gold-qs b { text-align: right; font-weight: 700; }
.gold-qs .ui-bar { grid-column: 1 / -1; margin: 2px 0 4px; }
.gold-mid { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.gold-tb { height: 33px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 8px; border-bottom: 1px solid var(--border); background: var(--surface2); min-width: 0; }
.gold-tb .ui-btn { min-height: 22px; padding: 1px 8px; font-size: 11px; }
.gold-ti { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gold-ti b { font-weight: 800; }
.gold-ro { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); white-space: nowrap; }
.gold.m .gold-ro.idle, .gold.n .gold-ro.idle, .gold.n .gold-tb .lbl { display: none; }
.gold-ro i { width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--border); display: inline-block; }
.gold-stage { position: relative; flex: 1; min-height: 0; background: var(--bg); background-image: radial-gradient(color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 1px); background-size: 14px 14px; }
.gold-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
.gold-keys { flex: none; padding: 4px 10px; border-top: 1px solid var(--border); font-size: 10.5px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: var(--surface); }
.gold-keys .ui-kbd { font-size: 10px; padding: 0 4px; min-width: 14px; color: var(--muted); }
.gold-p { display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--border); background: var(--surface); }
.gold.n .gold-p { border-left: 0; border-top: 1px solid var(--border); }
.gold-steps { display: flex; gap: 3px; padding: 10px 12px 8px; flex: none; }
.gold-steps i { flex: 1; height: 5px; border-radius: 3px; background: var(--border); position: relative; }
.gold-steps i.done { background: color-mix(in srgb, var(--good) 70%, var(--border)); }
.gold-steps i.skip { background: repeating-linear-gradient(90deg, var(--border) 0 3px, transparent 3px 5px); }
.gold-steps i.cur { background: linear-gradient(90deg, var(--accent), var(--accent2)); }
.gold-steps i.gap { margin-left: 5px; }
.gold-body { flex: 1; overflow: auto; padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.gold-qn { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 11px; }
.gold-qt { font-size: 15px; font-weight: 800; color: var(--fg); line-height: 1.3; }
.gold-hint { color: var(--muted); font-size: 11.5px; line-height: 1.45; }
.gold-opts { display: flex; flex-direction: column; gap: 4px; }
.gold-opt { display: grid; grid-template-columns: 20px auto minmax(0, 1fr) auto; gap: 8px; align-items: center; text-align: left; width: 100%; padding: 5px 8px; min-height: 30px;
  background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); cursor: pointer; }
.gold-opt:hover { border-color: var(--accent); }
.gold-opt.on { background: var(--sel); border-color: var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
.gold-opt .ui-kbd { justify-self: start; }
.gold-opt .sw { width: 16px; height: 16px; border-radius: 4px; border: 1px solid color-mix(in srgb, var(--fg) 25%, transparent); }
.gold-opt .nosw { width: 0; }
.gold-opt .mt { color: var(--faint); font-size: 11px; }
.gold-opt.ct { background: transparent; border-style: dashed; }
.gold-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.gold-row .grow { flex: 1; }
.gold-foot { display: flex; gap: 6px; align-items: center; padding: 8px 12px; border-top: 1px solid var(--border); flex: none; flex-wrap: wrap; }
.gold-foot .grow { flex: 1; }
.gold-marks { display: flex; flex-direction: column; gap: 2px; }
.gold-mk { display: grid; grid-template-columns: 30px 58px minmax(0, 1fr) 22px; gap: 6px; align-items: center; padding: 3px 6px; border-radius: 5px; border: 1px solid transparent; cursor: pointer; font-size: 11px; }
.gold-mk:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
.gold-mk.sel { border-color: var(--accent); background: var(--sel); }
.gold-mk b { font-weight: 800; }
.gold-mk .k-window { color: var(--accent); } .gold-mk .k-door { color: var(--warn); }
.gold-mk .dim { color: var(--muted); }
.gold-mk button { border: 0; background: none; color: var(--faint); cursor: pointer; padding: 0; height: 18px; border-radius: 4px; }
.gold-mk button:hover { color: var(--bad); background: var(--border); }
.gold-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.gold-seg button { border: 0; background: var(--surface2); color: var(--muted); padding: 3px 9px; cursor: pointer; font-size: 11px; }
.gold-seg button.on { background: var(--sel); color: var(--fg); box-shadow: inset 0 -2px 0 var(--accent); }
.gold-log { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 7px 9px; font-size: 11px; color: var(--muted); line-height: 1.6; }
.gold-log div::before { content: '› '; color: var(--faint); }
.gold-cmp { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
.gold-cmp th { text-align: left; color: var(--faint); font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; padding: 3px 4px; border-bottom: 1px solid var(--border); }
.gold-cmp td { padding: 4px 4px; border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent); vertical-align: top; overflow: hidden; text-overflow: ellipsis; }
.gold-cmp td:first-child { color: var(--muted); }
.gold-cmp .v { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; }
.gold-cmp .v i, .gold-ans i { width: 11px; height: 11px; border-radius: 3px; display: inline-block; flex: none; border: 1px solid color-mix(in srgb, var(--fg) 25%, transparent); }
.gold-cmp .d { display: block; color: var(--faint); font-size: 10px; }
.gold-st { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; color: var(--muted); white-space: nowrap; }
.gold-st::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--faint); flex: none; }
.gold-st.good { color: var(--good); } .gold-st.good::before { background: var(--good); }
.gold-st.bad { color: var(--bad); } .gold-st.bad::before { background: var(--bad); }
.gold-st.warn { color: var(--warn); } .gold-st.warn::before { background: var(--warn); }
.gold-st.info { color: var(--info); } .gold-st.info::before { background: var(--info); }
.gold-ans .v { display: inline-flex; align-items: center; gap: 6px; }
.gold-big { display: flex; align-items: baseline; gap: 8px; }
.gold-big b { font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
.gold-two { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.gold-ans { border: 1px solid var(--border); border-radius: 6px; padding: 7px 8px; background: var(--surface2); min-width: 0; }
.gold-ans .who { font-size: 10px; color: var(--faint); text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
.gold-ans .val { display: flex; align-items: center; gap: 5px; font-weight: 700; margin-top: 3px; overflow-wrap: anywhere; }
.gold-ans.c1 { box-shadow: inset 3px 0 0 var(--accent); } .gold-ans.c2 { box-shadow: inset 3px 0 0 var(--info); }
.gold-rule { border-left: 2px solid var(--warn); padding: 4px 9px; color: var(--muted); font-size: 11.5px; background: color-mix(in srgb, var(--warn) 7%, transparent); border-radius: 0 6px 6px 0; }
.gold-pre { margin: 0; padding: 8px 9px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 10.5px; line-height: 1.5; color: var(--muted); white-space: pre; overflow: auto; max-height: 260px; }
.gold-pre .k { color: var(--accent); } .gold-pre .c { color: var(--faint); }
.gold-ok { border: 1px solid color-mix(in srgb, var(--good) 50%, var(--border)); background: color-mix(in srgb, var(--good) 8%, transparent); border-radius: 6px; padding: 9px 10px; }
.gold-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.gold-chips button { font-size: 10.5px; padding: 1px 7px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface2); color: var(--muted); cursor: pointer; }
.gold-chips button:hover { color: var(--fg); border-color: var(--accent); }
.gold-empty { margin: auto; text-align: center; color: var(--muted); max-width: 260px; display: flex; flex-direction: column; gap: 8px; align-items: center; padding: 20px; }
` }));
  }

  // ---------- the app ----------
  registerApp({
    id: 'gold', title: 'Gold Labeller', icon: 'trophy', desc: 'Label houses for gold. Gold is never edited, only overridden.',
    keywords: ['gold', 'label', 'labeller', 'benchmark', 'smoke', 'held-out', 'override', 'eyedropper'],
    size: [1180, 720],
    mount(win, arg) {
      css();
      const st = win.state;
      win.body.style.overflow = 'hidden';
      Object.assign(st, {
        H: null, P: null, step: 'q', qi: 0, ans: {}, unsure: {}, marks: [], sel: null, kind: 'window', seq: 1, undo: [],
        tool: null, hover: null, drag: null, bot: null, botBusy: false, botErr: null, dec: {}, resKey: null, saved: null, reason: '',
        view: { k: 1, ox: 0, oy: 0 }, dirty: true, layout: 'w', queueOpen: false, offs: [], session: null,
      });
      const stats = () => OS.store.get('gold.stats', { houses: {}, eperm: 0, botUsd: 0, overrides: 0 });

      const root = h('div', { class: 'gold' });
      const qList = h('div', { class: 'gold-ql' });
      const qStats = h('div', { class: 'gold-qs' });
      const queue = h('div', { class: 'gold-q' },
        h('div', { class: 'gold-qh' },
          h('div', { class: 'ui-title' }, OS.iconEl('trophy'), 'Queue'),
          h('select', { class: 'ui-select', 'aria-label': 'Dev set', onchange: (e) => { e.target.value = 'smoke'; OS.osd('The MD5 pick is gone.'); } },
            h('option', { value: 'smoke' }, 'smoke (seeded dev set)'), h('option', { value: 'md5', disabled: true }, 'md5 pick (gone)'))),
        qList, qStats);
      const btnQueue = h('button', { class: 'ui-btn ghost', onclick: () => { st.queueOpen = !st.queueOpen; layoutClass(); } }, OS.iconEl('lanes'), h('span', { class: 'lbl' }, 'Queue'));
      const tbInfo = h('div', { class: 'gold-ti' });
      const readout = h('div', { class: 'gold-ro' });
      const btnDrop = h('button', { class: 'ui-btn', title: 'Eyedropper (I)', onclick: () => toggleDropper() }, OS.iconEl('eye'), h('span', { class: 'lbl' }, 'Eyedropper'));
      const tb = h('div', { class: 'gold-tb' }, btnQueue, tbInfo, h('div', { class: 'grow' }), readout, btnDrop);
      const canvas = h('canvas', { class: 'gold-cv', 'aria-label': 'House photo' });
      const stage = h('div', { class: 'gold-stage' }, canvas);
      const keysLine = h('div', { class: 'gold-keys' });
      const mid = h('div', { class: 'gold-mid' }, tb, stage, keysLine);
      const panel = h('div', { class: 'gold-p' });
      root.append(queue, mid, panel);
      win.body.append(root);
      // a button clicked with a pointer gives focus back, so Enter and the number keys stay with the labeller
      root.addEventListener('click', (e) => { if (e.detail > 0) e.target.closest('button')?.blur(); });
      const ctx = canvas.getContext('2d');

      // ----- layout -----
      function layoutClass() {
        const w = win.width;
        st.layout = w >= 1020 ? 'w' : w >= 700 ? 'm' : 'n';
        root.classList.toggle('m', st.layout === 'm');
        root.classList.toggle('n', st.layout === 'n');
        if (st.layout === 'w') st.queueOpen = false;
        root.classList.toggle('qopen', st.queueOpen);
        btnQueue.style.display = st.layout === 'w' ? 'none' : '';
        st.dirty = true;
      }
      st.resize = () => { layoutClass(); sizeCanvas(); };
      function sizeCanvas() {
        const r = stage.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(r.width * dpr)); const hh = Math.max(1, Math.round(r.height * dpr));
        if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
        st.dirty = true;
      }

      // ----- session and queue -----
      const overridePath = (id) => `${OVR_DIR}/${id}.yml`;
      const labelled = (id) => OS.fs.exists(overridePath(id));
      function session() {
        const { houses } = devSet();
        const saved = OS.store.get('gold.session', null);
        let list = Array.isArray(saved) ? saved.filter((id) => houses.includes(id)) : [];
        for (const id of houses) if (!list.includes(id)) list.push(id);
        st.session = list;
        return list;
      }
      function nextHouse(from) {
        const list = st.session || session();
        const todo = list.filter((id) => !labelled(id) && id !== from);
        if (todo.length) return todo[0];
        return null;
      }
      function renderQueue() {
        const { houses, held } = devSet();
        const s = stats();
        qList.innerHTML = '';
        const row = (id, heldOut) => {
          const H = makeHouseCached(id);
          const done = labelled(id);
          const chip = heldOut ? h('span', { class: 'ui-tag', title: 'Held-out' }, OS.iconEl('padlock'), 'held-out')
            : done ? h('span', { class: 'ui-tag good' }, '✓ override') : OS.data.goldHouses.includes(id) ? h('span', { class: 'ui-tag accent' }, 'reliable') : h('span', { class: 'ui-tag' }, 'not yet');
          return h('div', { class: 'gold-qr' + (st.H?.id === id ? ' cur' : '') + (heldOut ? ' held' : ''), onclick: () => { openHouse(id); if (st.layout !== 'w') { st.queueOpen = false; layoutClass(); } } },
            h('b', null, String(id)), chip, h('span', { class: 'ad' }, heldOut ? 'images hidden from builders' : H.address));
        };
        qList.append(h('div', { class: 'gold-qsec' }, `smoke · ${houses.length}, lowest first`));
        for (const id of houses) qList.append(row(id, false));
        qList.append(h('div', { class: 'gold-qsec' }, OS.iconEl('padlock'), `Held-out · ${held.length}`));
        for (const id of held) qList.append(row(id, true));
        const done = houses.filter(labelled).length;
        const ag = Object.values(s.houses).filter((x) => x.compared);
        const ceil = ag.length ? ag.reduce((t, x) => t + x.agreed, 0) / ag.reduce((t, x) => t + x.compared, 0) : null;
        qStats.innerHTML = '';
        qStats.append(
          h('span', null, 'Labelled'), h('b', null, `${done} of ${houses.length}`),
          h('div', { class: 'ui-bar good' }, h('i', { style: { width: `${(done / Math.max(1, houses.length)) * 100}%` } })),
          h('span', null, 'Agreement ceiling'), h('b', null, ceil == null ? '-' : `${Math.round(ceil * 100)}%`),
          h('span', null, 'Overrides written'), h('b', null, String(s.overrides)),
          h('span', null, 'EPERM from /gold'), h('b', { class: s.eperm ? 'ui-bad' : '' }, String(s.eperm)),
          h('span', null, 'labeller-2 spend'), h('b', null, OS.usd(s.botUsd)),
        );
        win.setMeta(`smoke · ${done}/${houses.length}`);
      }
      const cache = new Map();
      function makeHouseCached(id) { if (!cache.has(id)) cache.set(id, makeHouse(id)); return cache.get(id); }

      // ----- drafts: one per house, so moving between houses loses nothing -----
      const drafts = () => OS.store.get('gold.drafts', {});
      function saveDraft() {
        if (!st.H) return;
        const all = drafts();
        all[st.H.id] = { qi: st.step === 'q' ? st.qi : Q.length - 1, ans: st.ans, unsure: st.unsure, marks: st.marks, seq: st.seq };
        OS.store.set('gold.drafts', all);
      }
      function dropDraft(id) { const all = drafts(); delete all[id]; OS.store.set('gold.drafts', all); }
      function openHouse(id) {
        const { held } = devSet();
        if (held.includes(id)) { refuseHeld(id); return false; }
        if (st.H?.id === id) { renderQueue(); return true; }
        const H = makeHouseCached(id);
        st.H = H; st.P = photoOf(H);
        Object.assign(st, { step: 'q', qi: 0, ans: {}, unsure: {}, marks: [], sel: null, seq: 1, undo: [], tool: null, bot: null, botErr: null, botBusy: false, dec: {}, saved: null, reason: '', drag: null });
        const dr = drafts()[id];
        if (dr) Object.assign(st, { qi: OS.clamp(dr.qi | 0, 0, Q.length - 1), ans: dr.ans || {}, unsure: dr.unsure || {}, marks: Array.isArray(dr.marks) ? dr.marks : [], seq: dr.seq || 1 });
        OS.store.set('gold.current', id);
        renderQueue(); renderAll();
        return true;
      }
      function refuseHeld(id) {
        OS.sound.error();
        win.crash({
          title: 'Held-out house', icon: 'padlock', code: `404 · house ${id} · set: held-out`,
          lines: [`House ${id} is in the held-out set. Held-out houses are never shown to tuning.`, 'This window has been tuning since it opened.'],
          details: [`house: ${id}`, 'set: held-out', 'images: hidden', 'answers: hidden', 'gold: hidden', 'shown to builders as: its number, set and labelling status'],
          actions: [{ label: 'Next house', primary: true, run: () => { const n = nextHouse(st.H?.id); if (n) openHouse(n); } }, { label: 'OK' }],
        });
      }

      // ----- canvas -----
      const C = () => OS.theme.colors();
      const toPhoto = (cx, cy) => { const r = canvas.getBoundingClientRect(); const v = st.view; return [(cx - r.left - v.ox) / v.k, (cy - r.top - v.oy) / v.k]; };
      st.toScreen = (px, py) => { const r = canvas.getBoundingClientRect(); const v = st.view; return [r.left + v.ox + px * v.k, r.top + v.oy + py * v.k]; };
      const inPhoto = (px, py) => px >= 0 && py >= 0 && px < PW && py < PH;
      const facadeStep = () => st.step === 'q' && Q[st.qi].marks;
      const colourStep = () => st.step === 'q' && Q[st.qi].colour && isAsked(Q[st.qi], st.ans);
      function draw() {
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr; const ch = canvas.height / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        const c = C();
        const pad = st.layout === 'n' ? 8 : 14;
        const k = Math.max(0.05, Math.min((cw - pad * 2) / PW, (ch - pad * 2) / PH));
        const ox = Math.round((cw - PW * k) / 2); const oy = Math.round((ch - PH * k) / 2);
        st.view = { k, ox, oy };
        if (!st.H) return;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
        ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, PW * k, PH * k); ctx.restore();
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(st.P.canvas, ox, oy, PW * k, PH * k);
        ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.strokeRect(ox - 0.5, oy - 0.5, PW * k + 1, PH * k + 1);
        const T = (x, y) => [ox + x * k, oy + y * k];
        const font = '700 10px ' + getComputedStyle(document.body).fontFamily;
        const box = (m, col, opt = {}) => {
          const [x, y] = T(m.x, m.y); const w = m.w * k; const hh = m.h * k;
          ctx.save();
          if (opt.fill !== false) { ctx.fillStyle = col; ctx.globalAlpha = opt.sel ? 0.18 : 0.1; ctx.fillRect(x, y, w, hh); ctx.globalAlpha = 1; }
          ctx.strokeStyle = col; ctx.lineWidth = opt.sel ? 2.4 : 1.8; if (opt.dash) ctx.setLineDash([5, 3]);
          ctx.strokeRect(x, y, w, hh);
          if (opt.label) {
            ctx.font = font; const tw = ctx.measureText(opt.label).width + 8;
            const ly = opt.below ? (y + hh + 15 <= oy + PH * k ? y + hh + 1 : y + hh - 15) : y - 15 >= oy ? y - 15 : y + 1;
            ctx.setLineDash([]); ctx.fillStyle = col; ctx.fillRect(opt.right ? x + w - tw : x, ly, tw, 14);
            ctx.fillStyle = c.onAccent; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(opt.label, (opt.right ? x + w - tw : x) + 4, ly + 7.5);
          }
          if (opt.sel) {
            ctx.setLineDash([]); ctx.fillStyle = c.surface; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
            for (const [hx, hy] of handles(m)) { const [sx, sy] = T(hx, hy); ctx.fillRect(sx - 4, sy - 4, 8, 8); ctx.strokeRect(sx - 4, sy - 4, 8, 8); }
          }
          ctx.restore();
        };
        const kindCol = (kd) => (kd === 'door' ? c.warn : c.accent);
        const labels = (list) => { const n = { window: 0, door: 0 }; return list.map((m) => `${m.kind === 'door' ? 'D' : 'W'}${++n[m.kind]}`); };
        const showCompare = (st.step === 'compare' && st.bot && !st.botBusy) || (st.step === 'resolve' && st.resKey === 'facade');
        if (facadeStep()) {
          const lb = labels(st.marks);
          st.marks.forEach((m, i) => box(m, kindCol(m.kind), { sel: m.id === st.sel, label: lb[i] }));
          if (st.drag?.mode === 'new' && st.drag.rect) box({ ...st.drag.rect }, kindCol(st.kind), { dash: true });
        } else if (showCompare) {
          const m = matchBoxes(st.marks, st.bot.ans.facade);
          const la = labels(st.marks); const lbb = labels(st.bot.ans.facade);
          st.marks.forEach((b, i) => box(b, m.onlyA.includes(i) ? c.bad : kindCol(b.kind), { label: m.onlyA.includes(i) ? `only 1 · ${la[i]}` : null, fill: false }));
          st.bot.ans.facade.forEach((b, j) => box(b, m.onlyB.includes(j) ? c.bad : c.info, { dash: true, fill: m.onlyB.includes(j), label: m.onlyB.includes(j) ? `only 2 · ${lbb[j]}` : null, right: true, below: true }));
        } else if (st.step === 'q' && st.qi > QI.facade - 1 && st.marks.length) {
          st.marks.forEach((m) => box(m, kindCol(m.kind), { fill: false }));
        }
        const pickMark = (v, col, tag) => {
          if (!v || !v.pick) return;
          const [x, y] = T(v.x, v.y);
          ctx.save(); ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke();
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 14, y); ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 14); ctx.stroke();
          ctx.font = font; ctx.fillStyle = col; ctx.fillRect(x + 10, y - 22, 14, 13); ctx.fillStyle = c.onAccent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tag, x + 17, y - 15);
          ctx.restore();
        };
        if (st.step === 'q' && Q[st.qi].colour) pickMark(st.ans[Q[st.qi].key], c.accent, '1');
        if ((st.step === 'compare' && st.bot && !st.botBusy) || st.step === 'resolve') {
          const keys = st.step === 'resolve' ? [st.resKey] : ['wall', 'door'];
          for (const kk of keys) { if (!Q[QI[kk]]?.colour) continue; pickMark(st.ans[kk], c.accent, '1'); pickMark(st.bot.ans[kk], c.info, '2'); }
        }
        if (st.tool === 'eyedropper' && st.hover && inPhoto(st.hover.x, st.hover.y)) {
          const [px, py] = T(st.hover.x, st.hover.y); const R = 52; const N = 11;
          let lx = px + 70; let ly = py - 70;
          if (lx + R > cw - 4) lx = px - 70; if (ly - R < 4) ly = py + 70;
          ctx.save();
          ctx.beginPath(); ctx.arc(lx, ly, R + 3, 0, 7); ctx.fillStyle = c.surface; ctx.fill();
          ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.clip();
          ctx.imageSmoothingEnabled = false;
          const sx = Math.floor(st.hover.x * SS) - (N >> 1); const sy = Math.floor(st.hover.y * SS) - (N >> 1);
          const cell = (R * 2) / N;
          ctx.drawImage(st.P.canvas, sx, sy, N, N, lx - R, ly - R, R * 2, R * 2);
          ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
          for (let i = 1; i < N; i++) { ctx.beginPath(); ctx.moveTo(lx - R + i * cell, ly - R); ctx.lineTo(lx - R + i * cell, ly + R); ctx.moveTo(lx - R, ly - R + i * cell); ctx.lineTo(lx + R, ly - R + i * cell); ctx.stroke(); }
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(lx - cell / 2, ly - cell / 2, cell, cell);
          ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(lx - cell / 2 - 1.5, ly - cell / 2 - 1.5, cell + 3, cell + 3);
          ctx.restore();
          ctx.save(); ctx.beginPath(); ctx.arc(lx, ly, R + 1.5, 0, 7); ctx.strokeStyle = c.accent; ctx.lineWidth = 3; ctx.stroke();
          ctx.font = font; const hx = st.hover.hex; const tw = ctx.measureText(hx).width + 26;
          ctx.fillStyle = c.surface; ctx.fillRect(lx - tw / 2, ly + R + 6, tw, 17); ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.strokeRect(lx - tw / 2 + 0.5, ly + R + 6.5, tw - 1, 16);
          ctx.fillStyle = hx; ctx.fillRect(lx - tw / 2 + 5, ly + R + 10, 10, 9);
          ctx.fillStyle = c.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(hx, lx - tw / 2 + 19, ly + R + 15);
          ctx.strokeStyle = c.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.stroke();
          ctx.restore();
        }
      }
      win.raf(() => { if (st.dirty) { st.dirty = false; draw(); } });
      const handles = (m) => [[m.x, m.y, 'nw'], [m.x + m.w / 2, m.y, 'n'], [m.x + m.w, m.y, 'ne'], [m.x + m.w, m.y + m.h / 2, 'e'], [m.x + m.w, m.y + m.h, 'se'], [m.x + m.w / 2, m.y + m.h, 's'], [m.x, m.y + m.h, 'sw'], [m.x, m.y + m.h / 2, 'w']];
      const CURS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
      function hitHandle(px, py) {
        const m = st.marks.find((x) => x.id === st.sel); if (!m) return null;
        const tol = 7 / st.view.k;
        for (const [hx, hy, id] of handles(m)) if (Math.abs(px - hx) <= tol && Math.abs(py - hy) <= tol) return { m, id };
        return null;
      }
      const hitMark = (px, py) => [...st.marks].reverse().find((m) => px >= m.x && px <= m.x + m.w && py >= m.y && py <= m.y + m.h);
      const snap = () => JSON.stringify(st.marks);
      const pushUndo = () => { st.undo.push(snap()); if (st.undo.length > 60) st.undo.shift(); };
      const clampBox = (b) => {
        let { x, y, w, h: hh } = b;
        if (w < 0) { x += w; w = -w; } if (hh < 0) { y += hh; hh = -hh; }
        x = OS.clamp(x, 0, PW - 2); y = OS.clamp(y, 0, PH - 2); w = Math.min(w, PW - x); hh = Math.min(hh, PH - y);
        return { ...b, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) };
      };

      canvas.addEventListener('pointermove', (e) => {
        if (!st.H) return;
        const [px, py] = toPhoto(e.clientX, e.clientY);
        st.hover = inPhoto(px, py) ? { x: px, y: py, hex: sampleHex(st.P, px, py) } : null;
        updateReadout();
        const d = st.drag;
        if (d) {
          if (d.mode === 'new') d.rect = clampBox({ x: d.x, y: d.y, w: px - d.x, h: py - d.y });
          else if (d.mode === 'move') { const m = st.marks.find((x) => x.id === d.id); if (m) { m.x = Math.round(OS.clamp(px - d.dx, 0, PW - m.w)); m.y = Math.round(OS.clamp(py - d.dy, 0, PH - m.h)); d.moved = true; } }
          else if (d.mode === 'resize') {
            const m = st.marks.find((x) => x.id === d.id); const o = d.orig;
            if (m) {
              let x0 = o.x; let y0 = o.y; let x1 = o.x + o.w; let y1 = o.y + o.h;
              if (d.h.includes('w')) x0 = px; if (d.h.includes('e')) x1 = px; if (d.h.includes('n')) y0 = py; if (d.h.includes('s')) y1 = py;
              Object.assign(m, clampBox({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) })); d.moved = true;
            }
          }
          st.dirty = true; return;
        }
        let cur = 'default';
        if (st.tool === 'eyedropper') cur = st.hover ? 'crosshair' : 'default';
        else if (facadeStep()) { const hh = hitHandle(px, py); cur = hh ? CURS[hh.id] : hitMark(px, py) ? 'move' : 'crosshair'; }
        canvas.style.cursor = cur;
        st.dirty = true;
      });
      canvas.addEventListener('pointerleave', () => { if (!st.drag) { st.hover = null; updateReadout(); st.dirty = true; } });
      canvas.addEventListener('pointerdown', (e) => {
        if (!st.H || e.button !== 0) return;
        const [px, py] = toPhoto(e.clientX, e.clientY);
        if (st.tool === 'eyedropper') {
          if (!inPhoto(px, py) || !colourStep()) return;
          const q = Q[st.qi];
          st.ans[q.key] = { pick: true, hex: sampleHex(st.P, px, py), x: Math.round(px), y: Math.round(py) };
          st.tool = null; OS.sound.click(); saveDraft(); renderAll(); return;
        }
        if (!facadeStep() || !inPhoto(px, py)) return;
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        const hh = hitHandle(px, py);
        if (hh) { pushUndo(); st.drag = { mode: 'resize', id: hh.m.id, h: hh.id, orig: { ...hh.m } }; return; }
        const m = hitMark(px, py);
        if (m) { pushUndo(); st.sel = m.id; st.drag = { mode: 'move', id: m.id, dx: px - m.x, dy: py - m.y }; renderPanel(); st.dirty = true; return; }
        st.drag = { mode: 'new', x: px, y: py, rect: null };
      });
      const endDrag = (e) => {
        const d = st.drag; if (!d) return;
        st.drag = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        if (d.mode === 'new') {
          if (d.rect && d.rect.w >= 5 && d.rect.h >= 5) {
            pushUndo();
            const m = { id: 'm' + st.seq++, kind: st.kind, ...d.rect };
            st.marks.push(m); st.sel = null; OS.sound.click();
          } else st.sel = null;
        } else if (!d.moved) st.undo.pop();
        saveDraft(); renderPanel(); st.dirty = true;
      };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);

      function updateReadout() {
        readout.innerHTML = '';
        readout.classList.toggle('idle', !st.hover);
        if (st.hover) readout.append(h('i', { style: { background: st.hover.hex } }), `${Math.round(st.hover.x)}, ${Math.round(st.hover.y)}`, h('b', { style: { color: 'var(--fg)' } }, st.hover.hex));
        else readout.append(h('span', { class: 'ui-faint' }, `${PW} × ${PH} photo`));
      }
      function toggleDropper(force) {
        if (!colourStep()) { OS.osd('The eyedropper is for colour questions'); return; }
        st.tool = (force ?? st.tool !== 'eyedropper') ? 'eyedropper' : null;
        renderAll();
      }

      // ----- panel -----
      const kbd = (t) => h('span', { class: 'ui-kbd' }, t);
      const swatch = (hx) => h('i', { style: { background: hx } });
      function valView(key, v, opt = {}) {
        if (v === undefined || v === null) return h('span', { class: 'ui-faint' }, opt.empty || '-');
        if (v === 'cant_tell') return h('span', { class: 'v' }, 'Can\'t tell');
        if (key === 'facade') { const w = v.filter((m) => m.kind === 'window').length; const d = v.length - w; return h('span', { class: 'v' }, `${w} window${w === 1 ? '' : 's'}, ${d} door${d === 1 ? '' : 's'}`); }
        if (Q[QI[key]].colour) return h('span', { class: 'v' }, swatch(v.hex), v.swatch ? SW_NAME[v.swatch] : v.hex);
        return h('span', { class: 'v' }, optText(key, v));
      }
      function stepsBar() {
        const bar = h('div', { class: 'gold-steps' });
        Q.forEach((q, i) => {
          let cls = '';
          if (st.step === 'q' && i === st.qi) cls = 'cur';
          else if (!isAsked(q, st.ans) && (st.step !== 'q' || i < st.qi)) cls = 'skip';
          else if (st.step !== 'q' || i < st.qi) cls = 'done';
          bar.append(h('i', { class: cls, title: q.label }));
        });
        const later = ['compare', 'resolve', 'save'];
        const at = later.indexOf(st.step === 'saved' ? 'save' : st.step);
        later.forEach((s, i) => bar.append(h('i', { class: (i === 0 ? 'gap ' : '') + (st.step === 'saved' ? 'done' : i === at ? 'cur' : i < at ? 'done' : ''), title: s })));
        return bar;
      }
      function renderKeys() {
        const parts = [];
        const k = (keys, what) => parts.push(h('span', null, ...keys.map((x) => kbd(x)), ' ', what));
        if (st.step === 'q' && Q[st.qi].marks) { k(['drag'], 'box'); k(['W', 'D'], 'kind'); k(['⌫'], 'delete'); k(['Z'], 'undo'); k(['←↑→↓'], 'nudge'); k(['↵'], 'done'); }
        else if (st.step === 'q') { k(['1-9'], 'answer'); k(['0'], 'can\'t tell'); if (Q[st.qi].colour) k(['I'], 'eyedropper'); k(['U'], 'unsure'); k(['↵'], 'confirm'); k(['Esc'], 'back'); }
        else if (st.step === 'resolve') { k(['1-4'], 'decide'); k(['Esc'], 'back'); }
        else k(['↵'], 'continue');
        k(['S'], 'skip house'); k(['[', ']'], 'house');
        keysLine.innerHTML = '';
        parts.forEach((p, i) => { if (i) keysLine.append('   '); keysLine.append(p); });
      }
      function renderTb() {
        tbInfo.innerHTML = '';
        if (!st.H) { tbInfo.append(h('span', { class: 'ui-muted' }, 'No house open')); return; }
        tbInfo.append(h('b', null, `House ${st.H.id}`), h('span', { class: 'ui-muted' }, ` · ${st.H.address} · photo ${st.H.photoNo} of ${st.H.photoOf}`));
        btnDrop.classList.toggle('on', st.tool === 'eyedropper');
        btnDrop.disabled = !colourStep();
        updateReadout();
      }
      function renderAll() { renderTb(); renderPanel(); renderKeys(); st.dirty = true; }
      function renderPanel() {
        panel.innerHTML = '';
        if (!st.H) {
          panel.append(h('div', { class: 'gold-body' }, h('div', { class: 'gold-empty' }, OS.iconEl('trophy'), h('b', null, 'Every house in smoke has an override.'),
            h('span', null, 'The held-out houses remain, and will continue to.'))));
          return;
        }
        if (st.step === 'resolve' && !pending().some((x) => x.key === st.resKey)) {
          const p = pending();
          if (p.length) st.resKey = p[0].key; else { st.step = 'save'; st.resKey = null; }
        }
        panel.append(stepsBar());
        const body = h('div', { class: 'gold-body' });
        const foot = h('div', { class: 'gold-foot' });
        panel.append(body, foot);
        if (st.step === 'q') questionView(body, foot);
        else if (st.step === 'compare') compareView(body, foot);
        else if (st.step === 'resolve') resolveView(body, foot);
        else if (st.step === 'save') saveView(body, foot);
        else savedView(body, foot);
        renderKeys();
      }
      function optBtn(n, label, on, run, extra = {}) {
        return h('button', { class: 'gold-opt' + (on ? ' on' : '') + (extra.ct ? ' ct' : ''), onclick: () => { run(); }, dataset: { n: String(n) } },
          kbd(String(n)), extra.sw ? h('i', { class: 'sw', style: { background: extra.sw } }) : h('i', { class: 'nosw' }), h('span', null, label), extra.meta ? h('span', { class: 'mt' }, extra.meta) : null);
      }
      function questionView(body, foot) {
        const q = Q[st.qi]; const key = q.key; const v = st.ans[key];
        body.append(h('div', { class: 'gold-qn' }, `Question ${st.qi + 1} of ${Q.length}`, h('span', { class: 'ui-tag' }, q.label), st.unsure[key] ? h('span', { class: 'ui-tag warn' }, 'unsure') : null),
          h('div', { class: 'gold-qt' }, q.q), h('div', { class: 'gold-hint' }, q.hint));
        if (!isAsked(q, st.ans)) {
          body.append(h('div', { class: 'gold-rule' }, `Not asked. Wall colour is asked only where the finish's colour varies, and ${optText('finish', st.ans.finish).toLowerCase()} is the colour it is.`));
        } else if (q.marks) {
          const seg = h('div', { class: 'gold-seg' },
            h('button', { class: st.kind === 'window' ? 'on' : '', onclick: () => setKind('window') }, 'W window'),
            h('button', { class: st.kind === 'door' ? 'on' : '', onclick: () => setKind('door') }, 'D door'));
          body.append(h('div', { class: 'gold-row' }, h('span', { class: 'ui-muted' }, 'New boxes are'), seg));
          const list = h('div', { class: 'gold-marks' });
          const n = { window: 0, door: 0 };
          for (const m of st.marks) {
            const lb = `${m.kind === 'door' ? 'D' : 'W'}${++n[m.kind]}`;
            const lvl = storeyOf(st.H, m);
            list.append(h('div', { class: 'gold-mk' + (m.id === st.sel ? ' sel' : ''), onclick: () => { st.sel = m.id; renderPanel(); st.dirty = true; } },
              h('b', { class: 'k-' + m.kind }, lb), h('span', { class: 'dim' }, `${m.w}×${m.h}`), h('span', { class: 'dim' }, lvl == null ? 'not on this house' : `storey ${lvl}, x ${m.x}`),
              h('button', { title: 'Delete (Backspace)', 'aria-label': 'Delete box', onclick: (e) => { e.stopPropagation(); delMark(m.id); } }, '✕')));
          }
          if (!st.marks.length) list.append(h('div', { class: 'ui-faint', style: { padding: '6px 2px' } }, 'No boxes yet. Drag on the photo.'));
          const w = st.marks.filter((m) => m.kind === 'window').length;
          body.append(h('div', { class: 'gold-row' }, h('span', { class: 'ui-title' }, 'Boxes'), h('span', { class: 'grow' }), h('span', { class: 'ui-muted' }, `${w} windows · ${st.marks.length - w} doors`)), list);
        } else {
          const opts = h('div', { class: 'gold-opts' });
          if (q.colour) {
            q.sw.forEach(([k, label, hx], i) => opts.append(optBtn(i + 1, label, v?.swatch === k, () => answer({ swatch: k, hex: hx }), { sw: hx, meta: hx })));
            const n = q.sw.length + 1; const picked = v?.pick;
            opts.append(optBtn(n, st.tool === 'eyedropper' ? 'Click the photo to pick' : picked ? 'Picked from the photo' : 'Another colour', picked || st.tool === 'eyedropper', () => toggleDropper(true),
              { sw: picked ? v.hex : undefined, meta: picked ? `${v.hex} at ${v.x}, ${v.y}` : 'eyedropper (I)' }));
          } else q.opts.forEach(([k, label], i) => opts.append(optBtn(i + 1, label, v === k, () => answer(k))));
          opts.append(optBtn(0, 'Can\'t tell', v === 'cant_tell', () => answer('cant_tell'), { ct: true, meta: 'becomes unknown' }));
          body.append(opts);
        }
        const unsure = h('button', { class: 'ui-btn ghost' + (st.unsure[key] ? ' on' : ''), onclick: () => toggleUnsure() }, kbd('U'), 'Unsure');
        const back = h('button', { class: 'ui-btn ghost', disabled: st.qi === 0, onclick: () => back1() }, 'Back');
        const ok = h('button', { class: 'ui-btn primary', disabled: !answered(), onclick: () => confirm() }, q.marks ? 'Done marking' : 'Confirm', kbd('↵'));
        foot.append(unsure, back, h('span', { class: 'grow' }), ok);
      }
      const answered = () => { const q = Q[st.qi]; return !isAsked(q, st.ans) || q.marks || st.ans[q.key] !== undefined; };
      function answer(v) {
        const q = Q[st.qi];
        st.ans[q.key] = v; st.tool = null;
        OS.sound.click(); saveDraft(); renderAll();
      }
      function toggleUnsure() { const k = Q[st.qi].key; st.unsure[k] = !st.unsure[k]; saveDraft(); renderPanel(); }
      function setKind(kd) {
        st.kind = kd;
        const m = st.marks.find((x) => x.id === st.sel);
        if (m && m.kind !== kd) { pushUndo(); m.kind = kd; saveDraft(); }
        renderPanel(); st.dirty = true;
      }
      function delMark(id) { pushUndo(); st.marks = st.marks.filter((m) => m.id !== id); if (st.sel === id) st.sel = null; saveDraft(); renderPanel(); st.dirty = true; }
      function back1() {
        if (st.step !== 'q') return;
        let i = st.qi - 1;
        while (i > 0 && !isAsked(Q[i], st.ans)) i--;
        if (i < 0) return;
        st.qi = i; st.tool = null; st.sel = null; saveDraft(); renderAll();
      }
      function confirm() {
        if (!answered()) { panel.classList.remove('ui-shake'); void panel.offsetWidth; panel.classList.add('ui-shake'); OS.sound.error(); return; }
        st.tool = null; st.sel = null;
        let i = st.qi + 1;
        while (i < Q.length && !isAsked(Q[i], st.ans)) i++;
        if (i >= Q.length) { startCompare(); return; }
        st.qi = i; saveDraft(); renderAll();
      }

      // ----- compare -----
      async function startCompare() {
        st.step = 'compare'; st.dec = {}; st.botErr = null;
        if (!st.bot || st.bot.house !== st.H.id) {
          const H = st.H;
          const b = botCopy(H, st.P);
          const r = OS.spend.add(b.cost, `gold labeller-2, house ${H.id}`, 'gold');
          if (!r.ok) { st.botErr = r.message; st.bot = null; renderAll(); return; }
          const s = stats(); s.botUsd = Math.round((s.botUsd + b.cost) * 100) / 100; OS.store.set('gold.stats', s);
          const bot = { ...b, house: H.id, shown: 0 };
          st.bot = bot; st.botBusy = true; renderAll();
          for (let i = 0; i < b.log.length; i++) {
            await win.sleep(260);
            if (win.closed || st.bot !== bot) return;
            bot.shown = i + 1; renderPanel();
          }
          await win.sleep(200);
          if (win.closed || st.bot !== bot) return;
          st.botBusy = false; renderQueue();
        }
        if (st.step === 'compare') renderAll();
      }
      function backToMarks() { st.step = 'q'; st.qi = Q.length - 1; renderAll(); }
      function compareView(body, foot) {
        if (st.botErr) {
          body.append(h('div', { class: 'gold-qt' }, 'labeller-2 did not answer'), h('div', { class: 'gold-rule' }, st.botErr),
            h('div', { class: 'gold-hint' }, 'Agreement needs two copies. One of them is out of money.'));
          foot.append(h('button', { class: 'ui-btn ghost', onclick: backToMarks }, 'Back'), h('span', { class: 'grow' }),
            h('button', { class: 'ui-btn primary', onclick: () => startCompare() }, 'Try again'));
          return;
        }
        const b = st.bot;
        body.append(h('div', { class: 'gold-qn' }, 'Copy 2', h('span', { class: 'ui-tag info' }, 'labeller-2 · a bot'), h('span', { class: 'grow' }), h('span', { class: 'ui-muted' }, OS.usd(b.cost))));
        body.append(h('div', { class: 'gold-log' }, b.log.slice(0, b.shown).map((l) => h('div', null, l)), st.botBusy ? h('div', { class: 'ui-faint' }, h('span', { class: 'ui-spin' }, '◐'), ' labelling') : null));
        if (st.botBusy) return;
        const items = classify(st); const ag = agreement(items);
        const pct = ag.compared ? Math.round((ag.agreed / ag.compared) * 100) : 0;
        body.append(h('div', { class: 'gold-big' }, h('b', null, `${ag.agreed} of ${ag.compared}`), h('span', { class: 'ui-muted' }, `agree (${pct}%)`)),
          h('div', { class: 'ui-bar ' + (pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad') }, h('i', { style: { width: pct + '%' } })));
        const tbl = h('table', { class: 'gold-cmp' }, h('colgroup', null, h('col', { style: { width: '21%' } }), h('col', { style: { width: '27%' } }), h('col', { style: { width: '27%' } }), h('col', { style: { width: '25%' } })),
          h('tr', null, h('th', null, 'Field'), h('th', null, '1 · you'), h('th', null, '2 · bot'), h('th', null, 'Status')));
        for (const q of Q) {
          const it = items[q.key]; const [cls, full, txt] = STAT[it.stat];
          tbl.append(h('tr', null, h('td', null, q.label, it.ua ? h('span', { class: 'd' }, 'you: unsure') : null, it.ub ? h('span', { class: 'd' }, 'bot: unsure') : null),
            h('td', null, valView(q.key, it.a, { empty: it.stat === 'not_asked' || q.key === 'wall' ? 'not asked' : '-' })),
            h('td', null, valView(q.key, it.b, { empty: it.stat === 'not_asked' || q.key === 'wall' ? 'not asked' : '-' })),
            h('td', { title: full }, h('span', { class: 'gold-st ' + cls }, txt), it.cmp?.detail ? h('span', { class: 'd' }, it.cmp.de != null ? it.cmp.detail : it.cmp.match ? `${it.cmp.match.pairs.length}/${Math.max(it.a.length, it.b.length)} match` : it.cmp.detail) : null)));
        }
        body.append(tbl);
        const pend = pending();
        body.append(h('div', { class: 'gold-hint' }, pend.length ? `${pend.length} item${pend.length === 1 ? '' : 's'} go${pend.length === 1 ? 'es' : ''} to Resolution. A person decides; the rules say how.` : 'Nothing to resolve. Equal values with no unsure are gold, automatically.'));
        foot.append(h('button', { class: 'ui-btn ghost', onclick: backToMarks }, 'Back to marks'), h('span', { class: 'grow' }),
          h('button', { class: 'ui-btn primary', onclick: () => afterCompare() }, pend.length ? `Resolve ${pend.length}` : 'Save', kbd('↵')));
      }
      function pending() {
        const items = classify(st);
        return Q.map((q) => items[q.key]).filter((it) => NEEDS.has(it.stat) && !st.dec[it.key]);
      }
      function afterCompare() {
        if (st.botBusy || !st.bot) return;
        const p = pending();
        if (p.length) { st.step = 'resolve'; st.resKey = p[0].key; } else st.step = 'save';
        renderAll();
      }

      // ----- resolution -----
      function resolveView(body, foot) {
        const items = classify(st); const it = items[st.resKey];
        if (!it) return;
        const all = Q.map((q) => items[q.key]).filter((x) => NEEDS.has(x.stat) || st.dec[x.key]);
        const idx = all.findIndex((x) => x.key === it.key) + 1;
        const [cls, txt] = STAT[it.stat];
        body.append(h('div', { class: 'gold-qn' }, `Resolution ${idx} of ${all.length}`, h('span', { class: 'ui-tag ' + cls }, txt)),
          h('div', { class: 'gold-qt' }, it.label));
        const ans = (who, v, c) => h('div', { class: 'gold-ans ' + c }, h('div', { class: 'who' }, who), h('div', { class: 'val' }, valView(it.key, v)),
          it.key === 'facade' && v ? h('div', { class: 'ui-faint', style: { fontSize: '10.5px', marginTop: '2px' } }, `${v.length} boxes`) : null,
          v?.pick ? h('div', { class: 'ui-faint', style: { fontSize: '10.5px', marginTop: '2px' } }, `picked at ${v.x}, ${v.y}`) : null);
        body.append(h('div', { class: 'gold-two' }, ans('Copy 1 · you' + (it.ua ? ' · unsure' : ''), it.a, 'c1'), ans('Copy 2 · labeller-2' + (it.ub ? ' · unsure' : ''), it.b, 'c2')));
        if (it.cmp?.detail) body.append(h('div', { class: 'ui-muted' }, it.cmp.detail + (it.cmp.de != null ? (it.cmp.eq ? ': the same colour' : ': different colours') : '')));
        const rule = Q[QI[it.key]].colour ? RULE.colour : RULE[it.key] || '';
        body.append(h('div', { class: 'gold-rule' }, RULE[it.stat]), rule ? h('div', { class: 'gold-rule' }, rule) : null);
        const opts = h('div', { class: 'gold-opts' });
        const choices = it.stat === 'flag'
          ? [[1, 'stands', 'Stands', 'the answer as given'], [4, 'drop', 'Drop', 'left out of scoring']]
          : [[1, 'copy1', 'Copy 1', 'your answer'], [2, 'copy2', 'Copy 2', 'labeller-2\'s answer'], ...(it.key === 'facade' ? [] : [[3, 'either', 'Either', 'both count']]), [4, 'drop', 'Drop', 'left out of scoring']];
        st.resChoices = choices;
        for (const [n, d, label, meta] of choices) opts.append(optBtn(n, label, st.dec[it.key] === d, () => decide(d), { meta }));
        body.append(h('div', { class: 'ui-title' }, 'Decision'), opts);
        foot.append(h('button', { class: 'ui-btn ghost', onclick: () => { st.step = 'compare'; renderAll(); } }, 'Back to compare'), h('span', { class: 'grow' }),
          h('span', { class: 'ui-faint' }, 'Gold is never averaged.'));
      }
      function decide(d) {
        st.dec[st.resKey] = d; OS.sound.click();
        for (const k of Object.keys(st.dec)) { const it = classify(st)[k]; if (!NEEDS.has(it.stat)) delete st.dec[k]; }
        st.dec[st.resKey] = d;
        const p = pending();
        if (p.length) st.resKey = p[0].key; else { st.step = 'save'; st.resKey = null; }
        renderAll();
      }

      // ----- saving -----
      function hl(text) {
        const pre = h('pre', { class: 'gold-pre' });
        for (const line of text.split('\n')) {
          const m = line.match(/^(\s*)([\w-]+)(:)(.*)$/);
          if (line.trim().startsWith('#')) pre.append(h('span', { class: 'c' }, line), '\n');
          else if (m) { const [, sp, k, col, rest] = m; const ci = rest.indexOf('   #'); pre.append(sp, h('span', { class: 'k' }, k), col, ci >= 0 ? rest.slice(0, ci) : rest, ci >= 0 ? h('span', { class: 'c' }, rest.slice(ci)) : '', '\n'); }
          else pre.append(line, '\n');
        }
        return pre;
      }
      function saveView(body, foot) {
        const s = stats();
        body.append(h('div', { class: 'gold-qn' }, 'Save', h('span', { class: 'ui-tag accent' }, 'override')), h('div', { class: 'gold-qt' }, `Save house ${st.H.id} as gold`));
        const reason = h('input', { class: 'ui-input', placeholder: 'Why? Every save asks why.', value: st.reason, 'aria-label': 'Reason',
          oninput: (e) => { st.reason = e.target.value; preview(); }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave(s.eperm ? 'override' : 'gold'); } else if (e.key === 'Escape') e.target.blur(); } });
        st.reasonEl = reason;
        body.append(h('div', { class: 'ui-title' }, 'Reason'), reason,
          h('div', { class: 'gold-chips' }, ['Labelled, two copies', 'Resolved disagreements', 'Not worse than main'].map((t) => h('button', { onclick: () => { st.reason = t; reason.value = t; preview(); } }, t))));
        const pv = h('div');
        const preview = () => { pv.replaceChildren(hl(toYaml(st, st.reason.trim() || 'TBD'))); };
        preview();
        body.append(h('div', { class: 'ui-title' }, 'Preview'), pv);
        const toGold = h('button', { class: 'ui-btn ' + (s.eperm ? 'ghost' : 'primary'), onclick: () => doSave('gold') }, s.eperm ? 'Try /gold again' : 'Save to /gold', s.eperm ? null : kbd('↵'));
        const toOvr = h('button', { class: 'ui-btn ' + (s.eperm ? 'primary' : 'ghost'), onclick: () => doSave('override') }, 'Write override', s.eperm ? kbd('↵') : null);
        foot.append(h('button', { class: 'ui-btn ghost', onclick: () => { st.step = 'compare'; renderAll(); } }, 'Back'), h('span', { class: 'grow' }), toGold, toOvr);
        if (s.eperm) body.append(h('div', { class: 'ui-faint' }, `Saving to /gold has failed ${s.eperm} time${s.eperm === 1 ? '' : 's'}. It will fail again.`));
      }
      function doSave(where) {
        if (!st.reason.trim()) {
          OS.sound.error(); st.reasonEl?.focus(); st.reasonEl?.classList.add('ui-shake'); win.after(400, () => st.reasonEl?.classList.remove('ui-shake'));
          OS.osd('Every save asks why.'); return;
        }
        const yml = toYaml(st, st.reason.trim());
        if (where === 'gold') {
          const p = `/gold/houses/${st.H.id}/answers.yml`;
          try { writeGold(p, yml); } catch (err) {
            const s = stats(); s.eperm++; OS.store.set('gold.stats', s); renderQueue();
            win.crash({
              title: 'Read-only file system', icon: 'padlock', code: `${err.code || 'EPERM'} · ${p}`,
              lines: [`open('${p}', O_WRONLY): Operation not permitted.`, 'Gold is never stored. It is derived on every read.', 'Gold is never edited, only overridden.'],
              details: [`$ mount | grep gold`, `gold on /gold type goldfs (ro,nosuid,derived-on-read)`, `$ ls ${OVR_DIR.replace(OS.fs.home, '~')}/`, OS.fs.exists(OVR_DIR) ? OS.fs.ls(OVR_DIR).map((f) => f.name).join('  ') || '(empty)' : 'ls: cannot access: No such file or directory'],
              actions: [{ label: `Write ~/gold-overrides/${st.H.id}.yml`, primary: true, run: () => { doSave('override'); } }, { label: 'Cancel', run: () => renderPanel() }],
            });
            renderPanel();
            return;
          }
        }
        try {
          OS.fs.mkdir(OVR_DIR, { parents: true });
          const p = `${OVR_DIR}/${st.H.id}.yml`;
          const had = OS.fs.exists(p);
          OS.fs.write(p, yml);
          const items = classify(st); const ag = agreement(items);
          const s = stats(); s.overrides++; s.houses[st.H.id] = { compared: ag.compared, agreed: ag.agreed, at: OS.now().toISOString() }; OS.store.set('gold.stats', s);
          st.saved = { path: p, size: yml.length, replaced: had, back: OS.fs.read(p) === yml };
          st.step = 'saved'; dropDraft(st.H.id); OS.sound.ding();
          renderQueue(); renderAll();
        } catch (err) {
          win.crash({ title: 'Could not write the override', code: err.code || 'EIO', lines: [String(err.message)] });
        }
      }
      function savedView(body, foot) {
        const sv = st.saved; const short = sv.path.replace(OS.fs.home, '~');
        body.append(h('div', { class: 'gold-qn' }, 'Saved', h('span', { class: 'ui-tag good' }, '✓ override written')),
          h('div', { class: 'gold-ok' }, h('div', { style: { fontWeight: 800 } }, short), h('div', { class: 'ui-muted' }, `${sv.size.toLocaleString('en-GB')} bytes${sv.replaced ? '. It undoes the earlier override: the latest marks stand.' : '. Read back and checked.'}`)),
          h('div', { class: 'gold-hint' }, 'The labellers\' copies are untouched. Gold is derived from them on every read, with this override on top.'));
        body.append(hl(OS.fs.read(sv.path)));
        const nx = nextHouse(st.H.id);
        const tools = [];
        if (OS.apps.labvim) tools.push(h('button', { class: 'ui-btn ghost', onclick: () => OS.open('labvim', { path: sv.path }) }, 'Open in labvim'));
        if (OS.apps.terminal && OS.exec) tools.push(h('button', { class: 'ui-btn ghost', onclick: () => OS.exec(`cat ${short}`) }, 'cat'));
        foot.append(...tools, h('span', { class: 'grow' }), nx ? h('button', { class: 'ui-btn primary', onclick: () => openHouse(nx) }, `Next house: ${nx}`, kbd('↵')) : h('span', { class: 'ui-muted' }, 'smoke is done.'));
      }

      // ----- keys -----
      st.key = (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const ae = document.activeElement;
        if (e.key === 'Enter' && ae?.tagName === 'BUTTON' && win.body.contains(ae) && ae.matches(':focus-visible')) return;
        const crash = win.body.querySelector('.ui-crash');
        if (crash) {
          if (e.key === 'Enter') { e.preventDefault(); crash.querySelector('.ui-btn.primary')?.click(); }
          else if (e.key === 'Escape') { e.preventDefault(); const b = crash.querySelectorAll('.ui-btn'); b[b.length - 1]?.click(); }
          return;
        }
        const k = e.key; const lk = k.toLowerCase();
        const done = () => e.preventDefault();
        if (k === '[' || k === ']') { done(); stepHouse(k === ']' ? 1 : -1); return; }
        if (lk === 's' && st.step !== 'saved') { done(); skipHouse(); return; }
        if (!st.H) return;
        if (st.step === 'q') {
          const q = Q[st.qi];
          if (q.marks) {
            const m = st.marks.find((x) => x.id === st.sel);
            if (k === 'Backspace' || k === 'Delete') { done(); if (m) delMark(m.id); return; }
            if (lk === 'w' || lk === 'd') { done(); setKind(lk === 'w' ? 'window' : 'door'); return; }
            if (lk === 'z') { done(); if (st.undo.length) { st.marks = JSON.parse(st.undo.pop()); if (!st.marks.some((x) => x.id === st.sel)) st.sel = null; saveDraft(); renderPanel(); st.dirty = true; } return; }
            if (k === 'Tab') { done(); if (st.marks.length) { const i = st.marks.findIndex((x) => x.id === st.sel); st.sel = st.marks[(i + (e.shiftKey ? -1 : 1) + st.marks.length) % st.marks.length].id; renderPanel(); st.dirty = true; } return; }
            if (m && k.startsWith('Arrow')) {
              done(); pushUndo(); const s = e.shiftKey ? 10 : 1;
              if (k === 'ArrowLeft') m.x -= s; if (k === 'ArrowRight') m.x += s; if (k === 'ArrowUp') m.y -= s; if (k === 'ArrowDown') m.y += s;
              Object.assign(m, clampBox(m)); saveDraft(); renderPanel(); st.dirty = true; return;
            }
            if (k === 'Escape') { done(); if (st.sel) { st.sel = null; renderPanel(); st.dirty = true; } else back1(); return; }
            if (k === 'Enter') { done(); confirm(); return; }
            return;
          }
          if (/^[0-9]$/.test(k)) {
            done();
            const n = Number(k);
            if (!isAsked(q, st.ans)) return;
            if (n === 0) { answer('cant_tell'); return; }
            if (q.colour) { if (n <= q.sw.length) { const s = q.sw[n - 1]; answer({ swatch: s[0], hex: s[2] }); } else if (n === q.sw.length + 1) toggleDropper(true); return; }
            if (n <= q.opts.length) answer(q.opts[n - 1][0]);
            return;
          }
          if (lk === 'i') { done(); toggleDropper(); return; }
          if (lk === 'u') { done(); toggleUnsure(); return; }
          if (k === 'Enter') { done(); confirm(); return; }
          if (k === 'Escape') { done(); if (st.tool) { st.tool = null; renderAll(); } else back1(); return; }
          return;
        }
        if (st.step === 'compare') { if (k === 'Enter') { done(); if (st.botErr) startCompare(); else afterCompare(); } else if (k === 'Escape') { done(); backToMarks(); } return; }
        if (st.step === 'resolve') {
          if (/^[1-4]$/.test(k)) { const c = (st.resChoices || []).find(([n]) => n === Number(k)); if (c) { done(); decide(c[1]); } return; }
          if (k === 'Escape') { done(); st.step = 'compare'; renderAll(); }
          return;
        }
        if (st.step === 'save') {
          if (k === 'Enter') { done(); doSave(stats().eperm ? 'override' : 'gold'); }
          else if (k === 'Escape') { done(); st.step = 'compare'; renderAll(); }
          return;
        }
        if (st.step === 'saved' && k === 'Enter') { done(); const nx = nextHouse(st.H.id); if (nx) openHouse(nx); }
      };
      function stepHouse(dir) {
        const { houses } = devSet();
        const i = houses.indexOf(st.H?.id);
        openHouse(houses[(i + dir + houses.length) % houses.length]);
      }
      function skipHouse() {
        if (!st.H) return;
        const list = st.session || session();
        st.session = [...list.filter((id) => id !== st.H.id), st.H.id];
        OS.store.set('gold.session', st.session);
        OS.osd(`House ${st.H.id} goes to the back of the list`);
        const nx = nextHouse(st.H.id);
        if (nx) openHouse(nx);
      }

      st.offs.push(OS.on('theme', () => { st.dirty = true; }));
      let fsT = 0;
      st.offs.push(OS.on('fs', (ev) => { if (ev?.path?.startsWith(OVR_DIR) || ev?.path === SET_FILE) { clearTimeout(fsT); fsT = win.after(60, renderQueue); } }));
      st.openHouse = (id) => openHouse(id);
      st.api = { makeHouse: makeHouseCached, photo: (id) => photoOf(makeHouseCached(id)).canvas, classify: () => classify(st), deltaE, sampleHex: (x, y) => sampleHex(st.P, x, y) };

      layoutClass();
      session();
      const last = OS.store.get('gold.current', null);
      const resume = last && devSet().houses.includes(last) && (!labelled(last) || drafts()[last]) ? last : null;
      const first = (arg?.house ? Number(arg.house) : null) ?? resume ?? nextHouse(null) ?? devSet().houses[0];
      if (first) openHouse(first); else { renderQueue(); renderAll(); }
      win.after(30, () => { sizeCanvas(); st.dirty = true; });
    },
    onArg(win, arg) { if (arg?.house) win.state.openHouse?.(Number(arg.house)); },
    onKey(win, e) { win.state.key?.(e); },
    onResize(win) { win.state.resize?.(); },
    unmount(win) { for (const f of win.state.offs || []) f(); },
  });
})();
