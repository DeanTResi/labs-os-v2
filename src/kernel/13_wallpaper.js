// Wallpapers, drawn in code at the screen's size. Redrawn on theme, wallpaper and resize.
(() => {
  const canvas = document.getElementById('wall');
  const ctx = canvas.getContext('2d');
  const brickyImg = new Image();
  brickyImg.onload = () => draw();
  brickyImg.src = OS.bricky();

  function streets(W, H, rnd, s) {
    // A street plan from above: rows of houses. Returns [{x,y,w,h}].
    const out = [];
    const rowH = 120 * s; const road = 46 * s;
    for (let y = 30 * s; y < H; y += rowH + road) {
      let x = -rnd() * 60 * s;
      while (x < W) {
        const w = (48 + rnd() * 70) * s;
        const hh = (rowH * (0.55 + rnd() * 0.4));
        if (rnd() > 0.1) out.push({ x, y: y + (rowH - hh) * (rnd() > 0.5 ? 0 : 1), w: w - 6 * s, h: hh });
        x += w + (rnd() > 0.8 ? 30 * s : 0);
      }
    }
    return out;
  }

  const painters = {
    aurora(W, H, th, s, rnd) {
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const blobs = [[0.15, 0.25, th.accent, 0.55], [0.85, 0.2, th.accent2, 0.38], [0.65, 0.95, th.info, 0.22], [0.3, 0.85, th.accent, 0.2]];
      for (const [bx, by, col, a] of blobs) {
        const g = ctx.createRadialGradient(bx * W, by * H, 0, bx * W, by * H, Math.max(W, H) * 0.55);
        g.addColorStop(0, col + Math.round(a * 255 * 0.5).toString(16).padStart(2, '0'));
        g.addColorStop(1, col + '00');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.strokeStyle = th.fg + '0b'; ctx.lineWidth = s;
      const step = 24 * s;
      for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      for (let i = 0; i < 140; i++) { ctx.fillStyle = th.fg + (rnd() > 0.8 ? '30' : '14'); ctx.fillRect(rnd() * W, rnd() * H, s * 1.5, s * 1.5); }
    },
    ridges(W, H, th, s, rnd) {
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      for (const r of streets(W, H, rnd, s)) {
        const hi = rnd() > 0.93;
        ctx.strokeStyle = hi ? th.accent2 + 'aa' : th.accent + '38'; ctx.lineWidth = (hi ? 1.6 : 1) * s;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        // hip roof plan: ridge along the longer side, hips to the corners
        const i = Math.min(r.w, r.h) / 2;
        ctx.beginPath();
        if (r.w >= r.h) {
          const yy = r.y + r.h / 2;
          ctx.moveTo(r.x + i, yy); ctx.lineTo(r.x + r.w - i, yy);
          [[r.x, r.y], [r.x, r.y + r.h]].forEach(([px, py]) => { ctx.moveTo(px, py); ctx.lineTo(r.x + i, yy); });
          [[r.x + r.w, r.y], [r.x + r.w, r.y + r.h]].forEach(([px, py]) => { ctx.moveTo(px, py); ctx.lineTo(r.x + r.w - i, yy); });
        } else {
          const xx = r.x + r.w / 2;
          ctx.moveTo(xx, r.y + i); ctx.lineTo(xx, r.y + r.h - i);
          [[r.x, r.y], [r.x + r.w, r.y]].forEach(([px, py]) => { ctx.moveTo(px, py); ctx.lineTo(xx, r.y + i); });
          [[r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].forEach(([px, py]) => { ctx.moveTo(px, py); ctx.lineTo(xx, r.y + r.h - i); });
        }
        ctx.stroke();
      }
      ctx.fillStyle = th.muted + '88'; ctx.font = `${10 * s}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText('ridge, hip and valley lines (formerly contour lines)', 16 * s, H - 40 * s);
    },
    heightmap(W, H, th, s, rnd) {
      // Black is low (eaves), white is high (ridge). Drawn small, scaled up without smoothing.
      const k = 4 * s; const w = Math.ceil(W / k); const hgt = Math.ceil(H / k);
      const img = ctx.createImageData(w, hgt);
      const rects = streets(w, hgt, rnd, 1 / k * s * 1.4);
      for (const r of rects) {
        for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(hgt, r.y + r.h); y++) {
          for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(w, r.x + r.w); x++) {
            const d = Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y);
            const v = Math.round(40 + 215 * Math.min(1, d / (Math.min(r.w, r.h) / 2)));
            const o = (y * w + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
          }
        }
      }
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = hgt; tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false; ctx.globalAlpha = th.name === 'heightmap' ? 0.55 : 0.32;
      ctx.drawImage(tmp, 0, 0, w * k, hgt * k); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = '#ffffffaa'; ctx.font = `${10 * s}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText('black is low · white is high · no exceptions', 16 * s, H - 40 * s);
    },
    blueprint(W, H, th, s) {
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const minor = 12 * s; // 0.5 m
      ctx.lineWidth = s;
      for (let x = 0; x < W; x += minor) { ctx.strokeStyle = (Math.round(x / minor) % 10 === 0) ? th.accent + '40' : th.accent + '16'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += minor) { ctx.strokeStyle = (Math.round(y / minor) % 10 === 0) ? th.accent + '40' : th.accent + '16'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // A plan: house 6 x 8 m, rear extension 3 m wide (always 3 m), depth 4.5 m
      const ox = Math.round(W * 0.58 / minor) * minor; const oy = Math.round(H * 0.22 / minor) * minor;
      const m = minor * 2;
      ctx.strokeStyle = th.accent2 + 'cc'; ctx.lineWidth = 3 * s;
      ctx.strokeRect(ox, oy, 6 * m, 8 * m);
      ctx.strokeRect(ox, oy + 8 * m, 3 * m, 4.5 * m);
      ctx.lineWidth = 1.5 * s; ctx.strokeStyle = th.accent2 + '88';
      ctx.beginPath(); ctx.moveTo(ox, oy + 4 * m); ctx.lineTo(ox + 6 * m, oy + 4 * m); ctx.moveTo(ox + 3 * m, oy); ctx.lineTo(ox + 3 * m, oy + 4 * m); ctx.stroke();
      ctx.beginPath(); ctx.arc(ox + 3 * m, oy + 8 * m, m * 0.9, Math.PI, Math.PI * 1.5); ctx.stroke();
      ctx.fillStyle = th.accent2 + 'cc'; ctx.font = `${11 * s}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.fillText('3 × 4.5m', ox + 3.2 * m, oy + 10.4 * m);
      ctx.fillText('(width is always 3)', ox + 3.2 * m, oy + 10.4 * m + 14 * s);
      ctx.fillText('GROUND FLOOR (0)', ox, oy - 10 * s);
      ctx.beginPath(); ctx.moveTo(ox - 2 * m, oy + 2 * m); ctx.lineTo(ox - 2 * m, oy); ctx.lineTo(ox - 2.3 * m, oy + 0.6 * m); ctx.stroke();
      ctx.fillText('N', ox - 2.2 * m, oy - 6 * s);
    },
    hazard(W, H, th, s) {
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const band = 34 * s;
      for (const y0 of [H - band * 2.2]) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, band); ctx.clip();
        for (let x = -band * 2; x < W + band * 2; x += band) { ctx.fillStyle = (Math.round(x / band) % 2) ? th.accent + 'cc' : '#00000000'; ctx.beginPath(); ctx.moveTo(x, y0 + band); ctx.lineTo(x + band, y0); ctx.lineTo(x + band * 1.6, y0); ctx.lineTo(x + band * 0.6, y0 + band); ctx.fill(); }
        ctx.restore();
      }
      ctx.fillStyle = th.accent + '22'; ctx.font = `800 ${Math.round(W / 14)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = 'center'; ctx.fillText('SKIP HIRE', W / 2, H / 2); ctx.textAlign = 'left';
      ctx.fillStyle = th.accent + '66'; ctx.font = `${12 * s}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = 'center'; ctx.fillText('permit valid for 28 days · do not overfill · no plasterboard', W / 2, H / 2 + 30 * s); ctx.textAlign = 'left';
    },
    bricky(W, H, th, s) {
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      // running bond, 215 x 65 mm with 10 mm joints, drawn large
      const bw = 64 * s; const bh = 22 * s;
      ctx.strokeStyle = th.fg + '0d'; ctx.lineWidth = s;
      for (let r = 0, y = 0; y < H; r++, y += bh) {
        for (let x = (r % 2 ? -bw / 2 : 0); x < W; x += bw) ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
      }
      if (brickyImg.complete && brickyImg.naturalWidth) {
        const size = Math.min(W, H) * 0.5; ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 0.16;
        ctx.drawImage(brickyImg, (W - size) / 2, (H - size) / 2, size, size); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
      }
    },
  };

  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(canvas.clientWidth * dpr); const H = Math.round(canvas.clientHeight * dpr);
    if (!W || !H) return;
    canvas.width = W; canvas.height = H;
    const th = OS.theme.colors();
    const name = OS.theme.wallpaper();
    const rnd = OS.rng('wallpaper:' + name + ':' + Math.round(W / 200));
    (painters[name] || painters.aurora)(W, H, th, dpr, rnd);
    // watermark, a nod to 3.1's licence lines
    ctx.font = `${10 * dpr}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillStyle = th.faint; ctx.textAlign = 'right';
    ctx.fillText('Labs OS 2.0 (Composed)', W - 14 * dpr, H - 34 * dpr);
    ctx.fillText('This copy of Labs OS is not worse than main.', W - 14 * dpr, H - 20 * dpr);
    ctx.textAlign = 'left';
  }

  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(draw, 120); });
  OS.on('theme', draw); OS.on('wallpaper', draw);
  OS.wallpaper = { draw, names: Object.keys(painters) };
})();
