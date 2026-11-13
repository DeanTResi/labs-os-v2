// Session: Bricky, deadlock (lock screen), kiln (screensaver), idle timer, boot, reboot, shut down.
(() => {
  const { h } = OS;
  const overlayRoot = document.getElementById('overlay');
  let sessionLayer = null; // lock, kiln, boot and halt sit above everything, outside OS.ui

  OS.sessionOpen = () => !!sessionLayer;
  OS.sessionKey = (e) => sessionLayer?.key?.(e) ?? false;
  // While a session layer is up, the desktop behind it takes no input at all.
  const behind = () => ['bar', 'desk', 'notes', 'empty'].map((id) => document.getElementById(id));
  function layer(el, key, onClose) {
    closeLayer();
    behind().forEach((n) => n?.setAttribute('inert', ''));
    overlayRoot.append(el);
    sessionLayer = { el, key, onClose };
    return sessionLayer;
  }
  function closeLayer() {
    if (!sessionLayer) return;
    const s = sessionLayer; sessionLayer = null;
    behind().forEach((n) => n?.removeAttribute('inert'));
    s.el.remove(); s.onClose?.();
    const f = OS.wm.focused(); if (f) f.emit('focus');
  }

  // ---------- Bricky ----------
  const B = {
    toasts: [
      ['Design review', 'Round 6 has been booked. Round 5 is still open. Round 7 will revert round 6.'],
      ['Craft cleanup', 'I tidied a comment. It now says less, more precisely.'],
      ['Approach naming', 'I changed one thing about myself, so I am now bricky_2. Never rename me.'],
      ['Ground floor', 'Ground is 0. First is 1. Lower ground is -1. I am on 0. I am always on 0.'],
      ['Heightmap', 'Black is low. White is high. I am orange, so I am not on the scale.'],
      ['Gold', 'Houses 158, 152, 135 and 178 are reliable. I visit them at weekends.'],
      ['Not worse than main', 'I checked. You are not worse than main. Nobody said better.'],
      ['Two viewers', 'There are two 3D viewers. They have never met. One of them has textures.'],
      ['Width', 'Every extension is 3 m wide. No width exists anywhere in the payload. Both are true.'],
      ['Dependencies', 'A linter moved from 1.89.0 to 1.90.0. Life goes on.'],
      ['Partial gables', 'A gap in a gable line is valid. I looked it up. Twice.'],
      ['Context window', 'I am at 81%. I will compact soon. I will not remember this. Neither will you.'],
      ['Lanes', 'A lane has been quiet for 40 minutes. It is waiting on a background job that will never wake it.'],
      ['Unsaved work', 'You still have unsaved work. Some of it is from 1996.'],
      ['Benchmark', 'The model scored 5 out of 10 against the photos. So did the correct answers.'],
      ['Storage', 'The image bucket has no CORS. I have accepted this. You should too.'],
      ['Agents', 'One agent has opened a PR to review another agent\'s PR. Both approve. Neither ran it.'],
      ['Rebase', 'Labs merges by rebase. I have never seen a merge commit. I have heard stories.'],
      ['Daily update', 'Nothing to report. That has been written up as three paragraphs and a table.'],
      ['Command palette', 'Ctrl+K opens the launcher. It is the same launcher. It feels different.'],
    ],
    quips: [
      'I am still 32 by 32. They offered me vectors. I said no.',
      'Everyone else got a redesign. I got a tiling window manager.',
      'SUPER is Alt. The browser kept the real Super key. I was not consulted.',
      'I was composed. Twenty-two stages. I came out as a brick.',
      'Ask me about the daily cap. Actually, don\'t. It costs money.',
      'My approach is luna_brick_1. Its output never changes.',
      'I fit a 0.5 m grid with room to spare. I am 0.215 m. Rounding is kind.',
      'I am not a bug. Correct inputs, correct output. I checked.',
      'I don\'t sleep. I settle. Mortar sets slowly.',
      'Click me again. It is free. Nothing else here is.',
      'Gristle reviewed me. One finding: "is a brick". Severity: Low.',
      'I sat on a tuft of grass for seven years. Now I sit in a bar. Progress.',
      'I am load-bearing. They told me not to say that any more.',
      'Try Alt+Enter. Then type sudo. Then watch me.',
    ],
  };
  let brickyOn = OS.store.get('bricky', true);
  OS.brickyOn = (v) => { if (v !== undefined) { brickyOn = !!v; OS.store.set('bricky', brickyOn); } return brickyOn; };
  OS.brickySay = (text) => {
    OS.notify({ app: 'bricky', bricky: true, title: 'Bricky', body: text || OS.pick(B.quips), timeout: 5000 });
  };
  function scheduleBricky() {
    const wait = (60000 + Math.random() * 70000) / OS.speed;
    setTimeout(() => {
      if (brickyOn && !sessionLayer && !document.hidden) {
        const [title, body] = OS.pick(B.toasts);
        OS.notify({ app: 'bricky', bricky: true, title, body, timeout: 8000 });
      }
      scheduleBricky();
    }, wait);
  }

  // ---------- deadlock: the lock screen ----------
  OS.lock = () => {
    let tries = 0;
    const time = h('div', { class: 'time' });
    const date = h('div', { class: 'date' });
    const input = h('input', { type: 'password', placeholder: 'Passphrase', 'aria-label': 'Passphrase', autocomplete: 'off' });
    const msg = h('div', { class: 'msg' }, 'Locked by deadlock. Any passphrase works, eventually.');
    const el = h('div', { class: 'lock' }, h('img', { class: 'pixel', src: OS.bricky(), alt: '' }), time, date, input, msg);
    const draw = () => {
      const d = OS.now();
      time.textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      date.textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    };
    draw();
    const t = setInterval(draw, 1000);
    const replies = [
      'Incorrect. That was password_1. Once on main, a password\'s output never changes, so it is now password_2.',
      'Correct. Welcome back. Your unsaved work is exactly where you left it, unsaved.',
    ];
    layer(el, (e) => {
      if (e.key === 'Enter') {
        if (!input.value) { input.classList.remove('ui-shake'); void input.offsetWidth; input.classList.add('ui-shake'); return true; }
        if (tries++ === 0) { msg.textContent = replies[0]; msg.className = 'msg bad'; input.value = ''; OS.sound.error(); return true; }
        msg.textContent = replies[1]; msg.className = 'msg';
        setTimeout(closeLayer, 600);
        return true;
      }
      if (document.activeElement !== input) input.focus();
      return false;
    }, () => clearInterval(t));
    setTimeout(() => input.focus(), 50);
  };

  // ---------- kiln: the screensaver ----------
  const LOGO = [
    '██╗      █████╗ ██████╗ ███████╗     ██████╗ ███████╗    ██████╗ ',
    '██║     ██╔══██╗██╔══██╗██╔════╝    ██╔═══██╗██╔════╝    ╚════██╗',
    '██║     ███████║██████╔╝███████╗    ██║   ██║███████╗     █████╔╝',
    '██║     ██╔══██║██╔══██╗╚════██║    ██║   ██║╚════██║    ██╔═══╝ ',
    '███████╗██║  ██║██████╔╝███████║    ╚██████╔╝███████║    ███████╗',
    '╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝     ╚═════╝ ╚══════╝    ╚══════╝',
  ];
  OS.LOGO = LOGO;
  OS.kiln = () => {
    const canvas = h('canvas');
    const el = h('div', { class: 'kiln' }, canvas);
    const ctx = canvas.getContext('2d');
    const glyphs = '01░▒▓<>/\\{}[]#$%&*+=~^gold_luna_terra_P1S1F1M4';
    const tags = ['composed, not configured', 'not worse than main', 'press any key to re-align', 'twenty-two stages, one brick', 'the daily cap resets at midnight UTC'];
    const start = performance.now();
    let alive = true;
    const drops = [];
    function frame(t) {
      if (!alive) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth * dpr; const H = canvas.clientHeight * dpr;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const th = OS.theme.colors();
      const fs = Math.max(10, Math.min(18, Math.floor(canvas.clientWidth / 72))) * dpr;
      ctx.font = `${fs}px ${getComputedStyle(document.body).fontFamily}`;
      const cw = ctx.measureText('█').width; const lh = fs * 1.05;
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, 0, W, H);
      // falling glyphs
      if (drops.length < W / cw / 3) drops.push({ x: Math.floor(Math.random() * (W / cw)) * cw, y: -lh, v: (0.5 + Math.random()) * lh * 0.35 });
      ctx.fillStyle = th.accent; ctx.globalAlpha = 0.35;
      for (const d of drops) { ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], d.x, d.y); d.y += d.v; if (d.y > H) { d.y = -lh; d.x = Math.floor(Math.random() * (W / cw)) * cw; } }
      ctx.globalAlpha = 1;
      // logo, decrypting
      const el2 = (t - start) / 1000;
      const lw = LOGO[0].length * cw; const x0 = (W - lw) / 2; const y0 = H / 2 - lh * 4;
      ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(x0 - cw * 2, y0 - lh * 1.2, lw + cw * 4, lh * 9.5);
      LOGO.forEach((row, r) => {
        [...row].forEach((ch, c) => {
          if (ch === ' ') return;
          const settle = 0.4 + ((c * 7 + r * 13) % 40) / 25;
          const done = el2 > settle;
          ctx.fillStyle = done ? OS.theme.mix(th.accent, th.accent2, c / row.length) : th.faint;
          ctx.fillText(done ? ch : glyphs[Math.floor(Math.random() * glyphs.length)], x0 + c * cw, y0 + r * lh);
        });
      });
      const tag = tags[Math.floor(el2 / 4) % tags.length];
      ctx.fillStyle = th.muted; ctx.textAlign = 'center';
      ctx.fillText(tag, W / 2, y0 + lh * 7.5);
      ctx.textAlign = 'left';
      requestAnimationFrame(frame);
    }
    const stop = () => { if (performance.now() - start > 600) closeLayer(); };
    el.addEventListener('pointermove', stop); el.addEventListener('pointerdown', stop);
    layer(el, () => { stop(); return true; }, () => { alive = false; });
    requestAnimationFrame(frame);
  };

  // ---------- idle ----------
  const idleSteps = [[60, '1 minute'], [180, '3 minutes'], [600, '10 minutes'], [0, 'never']];
  let idleIdx = OS.store.get('idleIdx', 1);
  if (OS.params.get('idle')) { idleSteps.unshift([Number(OS.params.get('idle')), OS.params.get('idle') + ' s']); idleIdx = 0; }
  let lastInput = performance.now();
  ['keydown', 'pointermove', 'pointerdown', 'wheel'].forEach((e) => window.addEventListener(e, () => { lastInput = performance.now(); }, { passive: true, capture: true }));
  setInterval(() => {
    const secs = idleSteps[idleIdx][0];
    if (!secs || sessionLayer || OS.overlayOpen() || document.hidden || !OS.ready) return;
    if ((performance.now() - lastInput) / 1000 > secs) OS.kiln();
  }, 2000);
  OS.idle = {
    label: () => idleSteps[idleIdx][1],
    cycle() { idleIdx = (idleIdx + 1) % idleSteps.length; OS.store.set('idleIdx', idleIdx); OS.osd('screensaver: ' + this.label()); },
  };

  // ---------- boot ----------
  const BOOT = [
    ['hi', 'Labs OS 2.0 (Composed) · kernel 6.22.0-composed · x86_64'],
    ['dim', 'Upgrading from Labs OS 3.1 (Evaluation). Version numbers are display numbers. They renumber.'],
    ['dim', 'Loading initial ramdisk (four houses you can trust)...'],
    ['ok', 'Reached target Local File Systems. /gold mounted read-only.'],
    ['ok', 'Started Journal Service. Every approach recorded. None renamed.'],
    ['ok', 'Started Spend Ledger Daemon ($100.00 a day, UTC).'],
    ['ok', 'Started Composer Pipeline Manager (22 stages, P1 to M4, two 3D viewers, one with textures).'],
    ['ok', 'Started Configurator v3 (Vite, Inertia, React).'],
    ['wait', 'A start job is running for Configurator redesign, round 6 (5 of ∞)'],
    ['ok', 'Deferred Configurator redesign, round 6. Round 5 is still open.'],
    ['ok', 'Started Gristle Review Daemon (patience: 1).'],
    ['fail', 'Failed to start bucket-cors.service. The image bucket has no CORS. See \'brickctl status bucket-cors\'.'],
    ['ok', 'Started Bricky (pid 1, 32x32, unupgraded by choice).'],
    ['ok', 'Started Lane Supervisor (3 lanes waiting on a background job).'],
    ['ok', 'Mounted /home/researcher/labs (6,363 commits, every one rebased).'],
    ['ok', 'Reached target Not Worse Than Main.'],
    ['ok', 'Started brickland compositor (dwindle, gaps 6/10, SUPER is Alt).'],
    ['', ''],
    ['', 'labs login: researcher (automatic login)'],
  ];
  OS.boot = (done) => {
    const el = h('div', { class: 'boot' });
    const skipEl = h('div', { class: 'skip' }, 'any key to skip');
    el.append(skipEl);
    let i = 0; let finished = false;
    const tagFor = { ok: '[  <span class="ok">OK</span>  ] ', fail: '[<span class="fail">FAILED</span>] ', wait: '[ <span class="wait">WAIT</span> ] ' };
    const finish = () => {
      if (finished) return; finished = true;
      el.style.transition = 'opacity .35s'; el.style.opacity = '0';
      setTimeout(() => { closeLayer(); document.getElementById('os').classList.remove('booting'); done?.(); }, 350);
    };
    const step = () => {
      if (finished) return;
      if (i >= BOOT.length) { setTimeout(finish, 450 / OS.speed); return; }
      const [k, text] = BOOT[i++];
      const line = h('div', { html: (tagFor[k] || '') + `<span class="${k === 'hi' || k === 'dim' ? k : ''}">${OS.esc(text)}</span>` });
      el.insertBefore(line, skipEl);
      setTimeout(step, (k === 'wait' ? 520 : 70 + Math.random() * 90) / OS.speed);
    };
    // The boot menu first: three entries, a countdown, arrows and Enter. Any other key boots the default.
    const entries = [
      ['Labs OS 2.0 (Composed)', 'default'],
      ['Labs OS 3.1 (Evaluation)', 'boots inside 2.0 anyway, through brine'],
      ['Advanced options for Labs OS 2.0', 'there are no advanced options. there is one option'],
    ];
    let sel = 0; let count = 3; let menuOn = true;
    const menuEl = h('div', { style: { position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#000' } });
    const rows = h('div', { style: { border: '1px solid #555', padding: '8px 0', width: 'min(640px, 90vw)' } });
    const foot = h('div', { class: 'dim', style: { width: 'min(640px, 90vw)', whiteSpace: 'pre-wrap' } });
    menuEl.append(h('div', { class: 'hi', style: { marginBottom: '6px' } }, 'BRICK boot loader 2.06'), rows, foot);
    const paint = () => {
      rows.innerHTML = '';
      entries.forEach(([t, d], i) => rows.append(h('div', { style: { padding: '1px 14px', background: i === sel ? '#d6d6d6' : 'none', color: i === sel ? '#000' : '#d6d6d6' } }, (i === sel ? '* ' : '  ') + t + (i === sel ? `   (${d})` : ''))));
      foot.textContent = `Use ↑ and ↓ to choose, Enter to boot.\nThe highlighted entry boots automatically in ${count}s.`;
    };
    const go = () => {
      if (!menuOn) return;
      menuOn = false; clearInterval(timer); menuEl.remove();
      if (sel === 1) { const off = OS.on('ready', () => { off(); setTimeout(() => OS.open('brine'), 300); }); }
      setTimeout(step, 120 / OS.speed);
    };
    const timer = setInterval(() => { count -= 1; if (count <= 0) go(); else paint(); }, 450 / OS.speed);
    paint();
    el.append(menuEl);
    layer(el, (e) => {
      if (!menuOn) { finish(); return true; }
      if (e.key === 'ArrowDown') { sel = (sel + 1) % entries.length; count = 9; paint(); return true; }
      if (e.key === 'ArrowUp') { sel = (sel + entries.length - 1) % entries.length; count = 9; paint(); return true; }
      go(); return true;
    });
    el.addEventListener('pointerdown', () => { if (menuOn) go(); else finish(); });
    document.getElementById('os').classList.add('booting');
  };

  OS.shutdown = () => {
    const el = h('div', { class: 'halt' },
      h('img', { class: 'pixel', src: OS.bricky(), alt: '' }),
      h('div', { class: 'big' }, 'It is now safe to close your tab.'),
      h('div', { style: { color: '#777' } }, 'Unsaved potential: 1. Bricky will look after it.'),
      h('button', { onclick: () => OS.reboot() }, 'Turn it back on'));
    for (const w of OS.wm.list()) w.close();
    layer(el, () => true);
  };
  OS.reboot = () => {
    for (const w of OS.wm.list()) w.close();
    OS.boot(() => OS.startSession?.());
  };

  let brickyStarted = false;
  OS.startBricky = () => { if (!brickyStarted) { brickyStarted = true; scheduleBricky(); } };
})();
