// r3d: a tiny flat-shaded 3D renderer on a 2D canvas. Painter's algorithm, no library.
// Faces: {pts: [[x,y,z],...], color: '#rrggbb', tag?, alpha?, emissive?, edge?: false | '#hex'}.
// Units are metres, y is up. Shapes in OS.r3d.shapes return arrays of faces.
(() => {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const centroid = (pts) => pts.reduce((c, p) => [c[0] + p[0] / pts.length, c[1] + p[1] / pts.length, c[2] + p[2] / pts.length], [0, 0, 0]);
  const newell = (pts) => {
    const n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; const b = pts[(i + 1) % pts.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return norm(n);
  };
  const rgb = (hex) => { const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
  const LIGHT = norm([-0.45, 0.85, 0.38]);

  // Give every face of a convex solid an outward normal, whatever order its points came in.
  function solid(faces, opts = {}) {
    const all = faces.flatMap((f) => f.pts);
    const c = centroid(all);
    for (const f of faces) {
      let n = newell(f.pts);
      if (dot(n, sub(centroid(f.pts), c)) < 0) n = [-n[0], -n[1], -n[2]];
      f.n = n;
      Object.assign(f, opts, { color: f.color || opts.color });
    }
    return faces;
  }

  const shapes = {
    box(x, y, z, w, h, d, color, opts = {}) {
      const [x1, y1, z1] = [x + w, y + h, z + d];
      const faces = [
        { pts: [[x, y1, z], [x, y1, z1], [x1, y1, z1], [x1, y1, z]], side: 'top' },
        { pts: [[x, y, z], [x1, y, z], [x1, y, z1], [x, y, z1]], side: 'bottom' },
        { pts: [[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]], side: 'front' },
        { pts: [[x1, y, z], [x, y, z], [x, y1, z], [x1, y1, z]], side: 'back' },
        { pts: [[x1, y, z1], [x1, y, z], [x1, y1, z], [x1, y1, z1]], side: 'right' },
        { pts: [[x, y, z], [x, y, z1], [x, y1, z1], [x, y1, z]], side: 'left' },
      ].filter((f) => !(opts.skip || []).includes(f.side));
      return solid(faces, { color, ...opts });
    },
    // Gable roof on the rectangle (x..x+w, z..z+d) at height y, ridge h above it. axis 'x' or 'z' is the ridge direction.
    gable(x, y, z, w, h, d, color, axis = 'x', opts = {}) {
      const [x1, z1, yr] = [x + w, z + d, y + h];
      const faces = axis === 'x'
        ? [
          { pts: [[x, y, z1], [x1, y, z1], [x1, yr, z + d / 2], [x, yr, z + d / 2]], kind: 'slope' },
          { pts: [[x, y, z], [x, yr, z + d / 2], [x1, yr, z + d / 2], [x1, y, z]], kind: 'slope' },
          { pts: [[x, y, z], [x, y, z1], [x, yr, z + d / 2]], kind: 'gable' },
          { pts: [[x1, y, z], [x1, yr, z + d / 2], [x1, y, z1]], kind: 'gable' },
        ]
        : [
          { pts: [[x1, y, z], [x1, y, z1], [x + w / 2, yr, z1], [x + w / 2, yr, z]], kind: 'slope' },
          { pts: [[x, y, z], [x + w / 2, yr, z], [x + w / 2, yr, z1], [x, y, z1]], kind: 'slope' },
          { pts: [[x, y, z1], [x1, y, z1], [x + w / 2, yr, z1]], kind: 'gable' },
          { pts: [[x, y, z], [x + w / 2, yr, z], [x1, y, z]], kind: 'gable' },
        ];
      const f = solid(faces, { color, ...opts });
      if (opts.gableColor) f.filter((q) => q.kind === 'gable').forEach((q) => { q.color = opts.gableColor; });
      return f;
    },
    // Hipped roof: every side slopes. Ridge runs along the longer side.
    hip(x, y, z, w, h, d, color, opts = {}) {
      const [x1, z1, yr] = [x + w, z + d, y + h];
      if (w >= d) {
        const i = d / 2;
        return solid([
          { pts: [[x, y, z1], [x1, y, z1], [x1 - i, yr, z + i], [x + i, yr, z + i]] },
          { pts: [[x, y, z], [x + i, yr, z + i], [x1 - i, yr, z + i], [x1, y, z]] },
          { pts: [[x, y, z], [x, y, z1], [x + i, yr, z + i]] },
          { pts: [[x1, y, z], [x1 - i, yr, z + i], [x1, y, z1]] },
        ].filter((f) => new Set(f.pts.map(String)).size >= 3), { color, ...opts });
      }
      const i = w / 2;
      return solid([
        { pts: [[x1, y, z], [x1, y, z1], [x + i, yr, z1 - i], [x + i, yr, z + i]] },
        { pts: [[x, y, z], [x + i, yr, z + i], [x + i, yr, z1 - i], [x, y, z1]] },
        { pts: [[x, y, z1], [x1, y, z1], [x + i, yr, z1 - i]] },
        { pts: [[x, y, z], [x + i, yr, z + i], [x1, y, z]] },
      ].filter((f) => new Set(f.pts.map(String)).size >= 3), { color, ...opts });
    },
    // Mono-pitch roof. high: 'z0' | 'z1' | 'x0' | 'x1' is the edge that sits h above y.
    lean(x, y, z, w, h, d, color, high = 'z0', opts = {}) {
      const [x1, z1] = [x + w, z + d];
      const H = (px, pz) => {
        if (high === 'z0') return pz === z ? y + h : y;
        if (high === 'z1') return pz === z1 ? y + h : y;
        if (high === 'x0') return px === x ? y + h : y;
        return px === x1 ? y + h : y;
      };
      const P = (px, pz) => [px, H(px, pz), pz];
      const faces = [{ pts: [P(x, z), P(x, z1), P(x1, z1), P(x1, z)], kind: 'slope' }];
      const sides = { z0: [[x, z], [x1, z]], z1: [[x1, z1], [x, z1]], x0: [[x, z1], [x, z]], x1: [[x1, z], [x1, z1]] };
      for (const [a, b] of Object.values(sides)) {
        const pa = P(...a); const pb = P(...b);
        if (pa[1] === y && pb[1] === y) continue;
        if (pa[1] > y && pb[1] > y) faces.push({ pts: [[a[0], y, a[1]], [b[0], y, b[1]], pb, pa], kind: 'wall' });
        else faces.push({ pts: [[a[0], y, a[1]], [b[0], y, b[1]], pa[1] > y ? pa : pb], kind: 'gable' });
      }
      return solid(faces, { color, ...opts });
    },
    // A flat rectangle at height y, facing up (or down with opts.down).
    flat(x, y, z, w, d, color, opts = {}) {
      const f = { pts: [[x, y, z], [x, y, z + d], [x + w, y, z + d], [x + w, y, z]], color, ...opts };
      f.n = opts.down ? [0, -1, 0] : [0, 1, 0];
      return [f];
    },
    // A vertical panel (window, door) on a wall. face: 'front'|'back'|'left'|'right'. Pushed out by 2 cm so it wins the sort.
    panel(face, a, y, b, w, h, color, opts = {}) {
      const o = 0.02;
      let pts; let n;
      if (face === 'front') { pts = [[a, y, b + o], [a + w, y, b + o], [a + w, y + h, b + o], [a, y + h, b + o]]; n = [0, 0, 1]; }
      else if (face === 'back') { pts = [[a + w, y, b - o], [a, y, b - o], [a, y + h, b - o], [a + w, y + h, b - o]]; n = [0, 0, -1]; }
      else if (face === 'right') { pts = [[b + o, y, a + w], [b + o, y, a], [b + o, y + h, a], [b + o, y + h, a + w]]; n = [1, 0, 0]; }
      else { pts = [[b - o, y, a], [b - o, y, a + w], [b - o, y + h, a + w], [b - o, y + h, a]]; n = [-1, 0, 0]; }
      return [{ pts, n, color, panel: true, ...opts }];
    },
  };

  function create(canvas, options = {}) {
    const ctx = canvas.getContext('2d');
    const shadowCanvas = document.createElement('canvas');
    const sctx = shadowCanvas.getContext('2d');
    const cam = { yaw: -0.65, pitch: 0.42, dist: 22, target: [0, 2.5, 0], fov: 0.8, ...options.camera };
    let faces = [];
    let lines = [];
    let labels = [];
    let drawn = [];
    let pending = false;
    let disposed = false;
    let rotating = options.autoRotate || 0;
    let lastT = 0;
    const opts = {
      grid: true, gridStep: OS.data.gridM, gridExtent: 12, shadows: true, edges: true, ground: null,
      background: null, orbit: true, zoom: true, minDist: 4, maxDist: 80, ...options,
    };

    const view = {
      camera: cam,
      options: opts,
      set(newFaces, extra = {}) {
        faces = newFaces || [];
        lines = extra.lines || [];
        labels = extra.labels || [];
        this.request();
      },
      faces: () => faces,
      request() {
        if (pending || disposed) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; if (!disposed) view.render(); });
      },
      fit(pad = 1.15) {
        const pts = faces.flatMap((f) => f.pts);
        if (!pts.length) return;
        const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])));
        const max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])));
        cam.target = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2 * 0.85, (min[2] + max[2]) / 2];
        const r = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
        const aspect = Math.max(0.5, Math.min(1, (canvas.clientWidth || 1) / (canvas.clientHeight || 1)));
        cam.dist = OS.clamp((r / Math.sin(cam.fov / 2)) * pad / aspect, opts.minDist, opts.maxDist);
        this.request();
      },
      autoRotate(speed) { const was = rotating; rotating = speed; if (speed && !was) { lastT = 0; requestAnimationFrame(loop); } },
      pick(clientX, clientY) {
        const r = canvas.getBoundingClientRect();
        const dpr = canvas.width / (r.width || 1);
        const px = (clientX - r.left) * dpr; const py = (clientY - r.top) * dpr;
        for (let i = drawn.length - 1; i >= 0; i--) {
          const poly = drawn[i].p2;
          let inside = false;
          for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
            if ((poly[a][1] > py) !== (poly[b][1] > py) && px < ((poly[b][0] - poly[a][0]) * (py - poly[a][1])) / (poly[b][1] - poly[a][1]) + poly[a][0]) inside = !inside;
          }
          if (inside) return drawn[i].face;
        }
        return null;
      },
      // Screen position (CSS px, relative to the canvas) of a world point, or null when behind the camera.
      project(p) {
        const P = basis();
        const v = toView(P, p);
        if (v[2] < 0.1) return null;
        const s = screen(P, v);
        return [s[0] / P.dpr, s[1] / P.dpr];
      },
      dispose() { disposed = true; canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('dblclick', onDbl); },
      render,
    };

    function basis() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = canvas.clientWidth; const ch = canvas.clientHeight;
      const cp = Math.cos(cam.pitch);
      const eye = [cam.target[0] + cam.dist * cp * Math.sin(cam.yaw), cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * cp * Math.cos(cam.yaw)];
      const f = norm(sub(cam.target, eye));
      const r = norm(cross(f, [0, 1, 0]));
      const u = cross(r, f);
      const W = Math.round(cw * dpr); const H = Math.round(ch * dpr);
      return { dpr, eye, f, r, u, W, H, focal: (H / 2) / Math.tan(cam.fov / 2) };
    }
    const toView = (P, p) => { const d = sub(p, P.eye); return [dot(d, P.r), dot(d, P.u), dot(d, P.f)]; };
    const screen = (P, v) => [P.W / 2 + (v[0] * P.focal) / v[2], P.H / 2 - (v[1] * P.focal) / v[2]];

    function segment(P, a, b) {
      let va = toView(P, a); let vb = toView(P, b);
      const near = 0.15;
      if (va[2] < near && vb[2] < near) return null;
      if (va[2] < near || vb[2] < near) {
        const t = (near - va[2]) / (vb[2] - va[2]);
        const m = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, near];
        if (va[2] < near) va = m; else vb = m;
      }
      return [screen(P, va), screen(P, vb)];
    }

    function render() {
      if (disposed) return;
      const cw = canvas.clientWidth; const ch = canvas.clientHeight;
      if (!cw || !ch) return;
      const P = basis();
      if (canvas.width !== P.W || canvas.height !== P.H) { canvas.width = P.W; canvas.height = P.H; }
      const th = OS.theme.colors();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (opts.background) { ctx.fillStyle = opts.background === 'theme' ? th.bg : opts.background; ctx.fillRect(0, 0, P.W, P.H); }
      else ctx.clearRect(0, 0, P.W, P.H);

      // Ground and grid
      if (opts.ground) {
        const E = opts.gridExtent;
        const g = [[-E, 0, -E], [E, 0, -E], [E, 0, E], [-E, 0, E]].map((p) => toView(P, p));
        if (g.every((v) => v[2] > 0.1)) {
          ctx.beginPath(); g.map((v) => screen(P, v)).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.fillStyle = opts.ground === 'theme' ? th.surface2 : opts.ground; ctx.fill();
        }
      }
      if (opts.grid) {
        const E = opts.gridExtent; const s = opts.gridStep;
        ctx.lineWidth = P.dpr;
        for (let k = -E; k <= E + 1e-9; k += s) {
          const major = Math.abs(Math.round(k) - k) < 1e-6 && Math.round(k) % 2 === 0;
          ctx.strokeStyle = major ? OS.theme.mix(th.bg, th.muted, 0.35) : OS.theme.mix(th.bg, th.muted, 0.16);
          for (const [a, b] of [[[k, 0, -E], [k, 0, E]], [[-E, 0, k], [E, 0, k]]]) {
            const seg = segment(P, a, b);
            if (!seg) continue;
            ctx.beginPath(); ctx.moveTo(...seg[0]); ctx.lineTo(...seg[1]); ctx.stroke();
          }
        }
      }

      // Faces, far to near. Faces marked ground: true (lawns, paths, plan tiles) go under the shadows.
      const list = [];
      for (const f of faces) {
        const c = centroid(f.pts);
        if (!f.double && f.n && dot(f.n, sub(P.eye, c)) <= 0) continue;
        const v = f.pts.map((p) => toView(P, p));
        if (v.some((q) => q[2] < 0.1)) continue;
        let depth = v.reduce((s, q) => s + q[2], 0) / v.length;
        if (f.panel) depth -= 0.05;
        if (f.bias) depth -= f.bias;
        list.push({ f, v, depth });
      }
      list.sort((a, b) => b.depth - a.depth);
      drawn = [];
      const edgeDefault = th.dark ? 'rgba(0,0,0,.35)' : 'rgba(40,30,60,.28)';
      const paint = ({ f, v }) => {
        const p2 = v.map((q) => screen(P, q));
        let col = rgb(f.color || '#888888');
        if (!f.emissive) {
          const k = 0.52 + 0.48 * Math.max(0, f.n ? dot(f.n, LIGHT) : 0.6);
          col = col.map((x) => Math.min(255, Math.round(x * k)));
        }
        ctx.globalAlpha = f.alpha ?? 1;
        ctx.beginPath(); p2.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.fill();
        if (opts.edges && f.edge !== false) { ctx.strokeStyle = f.edge || edgeDefault; ctx.lineWidth = P.dpr * (f.edgeWidth || 1); ctx.stroke(); }
        if (f.glow) { ctx.strokeStyle = f.glow; ctx.lineWidth = 2 * P.dpr; ctx.stroke(); }
        ctx.globalAlpha = 1;
        drawn.push({ face: f, p2 });
      };
      list.filter((x) => x.f.ground).forEach(paint);

      // Shadows: every face projected to the ground along the light, drawn solid then composited once.
      if (opts.shadows && faces.length) {
        if (shadowCanvas.width !== P.W || shadowCanvas.height !== P.H) { shadowCanvas.width = P.W; shadowCanvas.height = P.H; }
        sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, P.W, P.H); sctx.fillStyle = '#000';
        for (const f of faces) {
          if (f.noShadow || f.ground || f.alpha === 0) continue;
          const v = f.pts.map((p) => toView(P, [p[0] - (LIGHT[0] * p[1]) / LIGHT[1], 0.001, p[2] - (LIGHT[2] * p[1]) / LIGHT[1]]));
          if (v.some((q) => q[2] < 0.1)) continue;
          sctx.beginPath(); v.map((q) => screen(P, q)).forEach(([x, y], i) => (i ? sctx.lineTo(x, y) : sctx.moveTo(x, y))); sctx.fill();
        }
        ctx.globalAlpha = th.dark ? 0.32 : 0.16; ctx.drawImage(shadowCanvas, 0, 0); ctx.globalAlpha = 1;
      }

      list.filter((x) => !x.f.ground).forEach(paint);

      // Overlay lines and labels, always on top
      for (const l of lines) {
        const seg = segment(P, l.a, l.b);
        if (!seg) continue;
        ctx.strokeStyle = l.color || th.accent; ctx.lineWidth = (l.width || 2) * P.dpr;
        ctx.setLineDash(l.dash ? l.dash.map((x) => x * P.dpr) : []);
        ctx.beginPath(); ctx.moveTo(...seg[0]); ctx.lineTo(...seg[1]); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.font = `${11 * P.dpr}px ${getComputedStyle(document.body).fontFamily}`;
      for (const lb of labels) {
        const v = toView(P, lb.pos);
        if (v[2] < 0.1) continue;
        const [x, y] = screen(P, v);
        const w = ctx.measureText(lb.text).width + 8 * P.dpr;
        ctx.fillStyle = lb.bg || OS.theme.mix(th.bg, th.surface, 0.5); ctx.globalAlpha = 0.85;
        ctx.fillRect(x - w / 2, y - 9 * P.dpr, w, 16 * P.dpr); ctx.globalAlpha = 1;
        ctx.fillStyle = lb.color || th.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lb.text, x, y);
      }
      if (opts.onRender) opts.onRender(ctx, P);
    }

    function loop(t) {
      if (disposed || !rotating) return;
      if (!canvas.isConnected) { disposed = true; return; }
      const dt = lastT ? Math.min(64, t - lastT) : 16;
      lastT = t;
      cam.yaw += rotating * dt * 0.001 * OS.speed;
      render();
      requestAnimationFrame(loop);
    }

    let drag = null;
    function onDown(e) {
      if (!opts.orbit || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture?.(e.pointerId);
      const move = (ev) => {
        const dx = ev.clientX - drag.x; const dy = ev.clientY - drag.y;
        drag.x = ev.clientX; drag.y = ev.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        cam.yaw -= dx * 0.008; cam.pitch = OS.clamp(cam.pitch + dy * 0.006, 0.04, 1.45);
        view.request(); opts.onCamera?.(cam);
      };
      const up = () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); };
      canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    }
    function onWheel(e) {
      if (!opts.zoom) return;
      e.preventDefault();
      cam.dist = OS.clamp(cam.dist * Math.pow(1.0015, e.deltaY), opts.minDist, opts.maxDist);
      view.request(); opts.onCamera?.(cam);
    }
    function onDbl() { if (opts.dblclickFit !== false) view.fit(); }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);
    canvas.style.touchAction = 'none';
    if (rotating) requestAnimationFrame(loop);
    return view;
  }

  OS.r3d = { create, shapes, solid, light: LIGHT };
})();
