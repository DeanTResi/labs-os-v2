// ridgebar: the top bar. Workspaces left, clock centre, modules right.
(() => {
  const { h } = OS;
  const bar = document.getElementById('bar');
  const L = h('div', { class: 'l' }); const M = h('div', { class: 'm' }); const R = h('div', { class: 'r' });
  bar.append(L, M, R);

  const mod = (cls, title, onclick, ...kids) => h('button', { class: 'bm ' + cls, title, 'aria-label': title, onclick }, ...kids);
  const icon = (name) => h('span', { html: OS.icon(name) }).firstChild;

  // ---- left: logo, workspaces, layout, window title
  const logo = mod('logo', 'Labs menu (SUPER+SHIFT+SPACE)', () => OS.ui.menu());
  logo.innerHTML = OS.logoSvg;
  const wsBox = h('span', { class: 'ws' });
  const layoutBtn = mod('dim hide-narrow', 'Cycle layout (SUPER+M)', () => OS.wm.cycleLayout());
  const titleEl = h('span', { class: 'bm dim hide-narrow', style: { cursor: 'default', maxWidth: '28vw', overflow: 'hidden', textOverflow: 'ellipsis' } });
  L.append(logo, wsBox, layoutBtn, titleEl);

  function drawWs() {
    const cur = OS.wm.current(); const occ = new Set(OS.wm.occupied()); const urg = new Set(OS.wm.urgent());
    const show = [...new Set([1, 2, 3, 4, 5, ...occ, cur])].sort((a, b) => a - b);
    wsBox.innerHTML = '';
    for (const n of show) {
      wsBox.append(h('b', { class: [n === cur && 'cur', occ.has(n) && 'occ', urg.has(n) && 'urgent'].filter(Boolean).join(' '), title: `Workspace ${n} (SUPER+${n})`, onclick: () => OS.wm.switchWs(n) }, String(n)));
    }
    const lay = OS.wm.workspace().layout;
    layoutBtn.textContent = { dwindle: '[]=', master: '[M]', monocle: '[1]' }[lay] || lay;
    const f = OS.wm.focused();
    titleEl.textContent = f ? f.title : '';
  }
  ['ws', 'win:open', 'win:close', 'win:focus', 'win:title'].forEach((e) => OS.on(e, drawWs));

  // ---- centre: clock
  let clockMode = 0;
  const clock = mod('clock', 'Click for the other clock', () => { clockMode = (clockMode + 1) % 2; tick(); });
  M.append(clock);
  function tick() {
    const d = OS.now();
    if (clockMode === 0) {
      clock.textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + '  ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } else {
      const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((d - start) / 86400000 + start.getUTCDay() + 1) / 7);
      clock.textContent = `Q${Math.floor(d.getUTCMonth() / 3) + 1} · week ${week} · later than you think`;
    }
  }
  setInterval(tick, 1000);

  // ---- right: modules
  const spend = mod('', 'Daily model spend (UTC). Click for the ledger.', () => {
    const rows = OS.spend.rows().slice(0, 5);
    OS.notify({
      app: 'spend', icon: 'coins-outline', title: `${OS.usd(OS.spend.today())} of ${OS.usd(OS.spend.cap)} today (UTC)`,
      body: rows.length ? rows.map((r) => `${r.t}  ${OS.usd(r.usd).padStart(7)}  ${r.label}`).join('\n') : 'Nothing has thought yet today. Suspicious.',
      actions: [{ label: 'Wait until tomorrow', run: () => { OS.spend.tomorrow(); OS.osd('It is tomorrow. The cap has reset. Nothing else has.'); } }],
    });
  });
  function drawSpend() {
    const s = OS.spend.summary(); const f = s.usd / s.cap;
    spend.className = 'bm ' + (f >= 1 ? 'bad' : f > 0.8 ? 'warn' : '');
    spend.innerHTML = '';
    spend.append(icon('dollar'), `${s.usd.toFixed(2)}/${s.cap}`);
  }
  OS.on('spend', drawSpend);

  const ciStates = [
    { cls: 'good', icon: 'status-complete', text: 'CI', msg: 'All checks passed. Not worse than main.' },
    { cls: 'warn', icon: 'hourglass', text: 'CI', msg: 'Frontend Checks: 14 of 15 done. The 15th is the design-sync gate. It is thinking about it.' },
    { cls: 'good', icon: 'status-complete', text: 'CI', msg: 'Green. A spec that was flaky is now only shy.' },
    { cls: 'bad', icon: 'status-error', text: 'CI', msg: 'Failed: 1 flaky spec. Re-run it. It will pass. Nobody will learn anything.' },
  ];
  let ci = 0;
  const ciBtn = mod('hide-narrow', 'CI status', () => OS.notify({ app: 'ci', icon: ciStates[ci].icon, title: `CI on main: ${ciStates[ci].cls === 'good' ? 'passing' : ciStates[ci].cls === 'bad' ? 'failing' : 'running'}`, body: ciStates[ci].msg }));
  function drawCi() { const s = ciStates[ci]; ciBtn.className = 'bm hide-narrow ' + s.cls; ciBtn.innerHTML = ''; ciBtn.append(icon(s.icon), s.text); }
  setInterval(() => { ci = (ci + 1) % ciStates.length; drawCi(); }, 41000 / OS.speed);

  const cpu = mod('hide-narrow', 'Frame time. Lower is calmer.', () => OS.open('lanetop'));
  const spark = h('span', { class: 'spark' });
  cpu.append(icon('cpu'), spark);
  const samples = Array(10).fill(16);
  setInterval(() => {
    samples.push(OS.frameMs || 16); samples.shift();
    spark.innerHTML = '';
    for (const s of samples) spark.append(h('i', { style: { height: Math.max(2, Math.min(12, (s / 33) * 12)) + 'px' } }));
  }, 700);

  const net = mod('dim hide-narrow', 'Network', () => OS.notify({ app: 'network', icon: 'wave', title: 'Connected: planning-portal (5 GHz)', body: 'Signal: strong. Latency: eight weeks. Determination period: also eight weeks.' }));
  net.append(icon('wifi'), 'planning-portal');

  const snd = mod('dim', 'Sound', () => { OS.sound.set(!OS.sound.on); drawSnd(); OS.osd(OS.sound.on ? 'sound on' : 'sound off'); });
  function drawSnd() { snd.innerHTML = ''; snd.append(icon(OS.sound.on ? 'volume' : 'mute')); }

  const brickyBtn = mod('', 'Bricky', () => OS.brickySay());
  const brickyImg = h('img', { class: 'pixel bricky-tray', src: OS.bricky(), alt: 'Bricky' });
  brickyBtn.append(brickyImg);
  setInterval(() => { brickyImg.src = OS.bricky(true); setTimeout(() => { brickyImg.src = OS.bricky(); }, 160); }, 4300);

  let unseen = 0;
  const bell = mod('dim', 'Notifications', () => { unseen = 0; drawBell(); OS.ui.notifications(); });
  function drawBell() { bell.innerHTML = ''; bell.append(icon('bell')); if (unseen) bell.append(h('span', { class: 'ui-accent', style: { fontWeight: 800 } }, String(unseen))); bell.classList.toggle('dim', !unseen); }
  OS.on('notify', (n) => { if (n) { unseen++; drawBell(); } });

  const power = mod('', 'Power and session', () => OS.ui.menu(['System']));
  power.append(icon('power'));

  R.append(spend, ciBtn, cpu, net, snd, brickyBtn, bell, power);

  OS.bar = { redraw() { drawWs(); drawSpend(); drawCi(); drawSnd(); drawBell(); tick(); } };
  OS.bar.redraw();
})();
