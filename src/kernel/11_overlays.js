// surveyor (launcher), the Labs menu, the key-binding sheet and the notification list. One overlay at a time.
(() => {
  const { h, esc } = OS;
  const root = document.getElementById('overlay');
  let current = null;

  OS.overlayOpen = () => !!current;
  function closeOverlay() {
    if (!current) return;
    const c = current; current = null;
    c.el.remove(); c.onClose?.();
    OS.emit('overlay', null);
    const f = OS.wm.focused(); if (f) f.emit('focus');
  }
  function show(el, handler, onClose) {
    if (current) closeOverlay();
    root.append(el);
    current = { el, handler, onClose };
    OS.emit('overlay', el);
  }
  // The key handler of whatever overlay is open. Returns true when it used the key.
  OS.overlayKey = (e) => current?.handler?.(e) ?? false;

  // Subsequence match. Returns {score, hits} or null.
  function fuzzy(q, text) {
    if (!q) return { score: 0, hits: [] };
    const t = text.toLowerCase(); const s = q.toLowerCase();
    let ti = 0; let score = 0; let prev = -2; const hits = [];
    for (const ch of s) {
      const i = t.indexOf(ch, ti);
      if (i < 0) return null;
      score += 1 + (i === prev + 1 ? 3 : 0) + (i === 0 || /[\s_\-./]/.test(t[i - 1]) ? 2 : 0);
      hits.push(i); prev = i; ti = i + 1;
    }
    return { score: score - text.length * 0.01, hits };
  }
  const mark = (text, hits) => {
    const set = new Set(hits); let out = '';
    [...text].forEach((ch, i) => { out += set.has(i) ? `<mark>${esc(ch)}</mark>` : esc(ch); });
    return out;
  };

  // A searchable list. source(query, stack) -> [{icon, name, desc, key, run, sub, keep}]
  function palette({ placeholder, prompt = '›', source, foot, crumbs: rootCrumb = [] }) {
    const stack = [...rootCrumb];
    const input = h('input', { placeholder, spellcheck: false, autocomplete: 'off', 'aria-label': placeholder });
    const list = h('div', { class: 'list', role: 'listbox' });
    const crumbs = h('div', { class: 'crumbs' });
    const pal = h('div', { class: 'pal', role: 'dialog' },
      h('div', { class: 'q' }, h('span', null, prompt), input), crumbs, list,
      foot ? h('div', { class: 'foot', html: foot }) : null);
    const scrim = h('div', { class: 'scrim', onpointerdown: (e) => { if (e.target === scrim) closeOverlay(); } }, pal);
    let items = []; let sel = 0;

    function render() {
      const q = input.value.trim();
      crumbs.textContent = stack.length ? 'Labs › ' + stack.join(' › ') + '   (Backspace to go back)' : '';
      crumbs.style.display = stack.length ? '' : 'none';
      const raw = source(q, stack);
      items = q ? raw.map((it) => ({ it, m: fuzzy(q, it.name + ' ' + (it.match || '')) })).filter((x) => x.m).sort((a, b) => b.m.score - a.m.score).map((x) => ({ ...x.it, hits: x.m.hits.filter((i) => i < x.it.name.length) })) : raw;
      if (q && !items.length) items = [{ icon: 'bricky-filled', name: `Ask Bricky about "${q}"`, desc: 'He is a brick. He will try.', run: () => OS.brickySay(`"${q}"? I don't know. I'm a brick. Try Alt+Enter and type help.`) }];
      sel = OS.clamp(sel, 0, Math.max(0, items.length - 1));
      list.innerHTML = '';
      items.forEach((it, i) => {
        const row = h('div', { class: 'it' + (i === sel ? ' sel' : ''), role: 'option', onclick: () => { sel = i; choose(); }, onpointermove: () => { if (sel !== i) { sel = i; paintSel(); } } },
          h('span', { html: OS.icon(it.icon || 'question') }).firstChild,
          h('div', { style: { minWidth: 0 } }, h('div', { class: 'n', html: mark(it.name, it.hits || []) }), it.desc ? h('div', { class: 'd' }, it.desc) : null),
          h('span', { class: 'k' }, it.sub ? '›' : (it.key || '')));
        list.append(row);
      });
    }
    function paintSel() { [...list.children].forEach((r, i) => r.classList.toggle('sel', i === sel)); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
    function choose() {
      const it = items[sel]; if (!it) return;
      if (it.sub) { stack.push(it.sub); input.value = ''; sel = 0; render(); return; }
      if (!it.keep) closeOverlay();
      try { it.run?.(); } catch (err) { console.error(err); }
      if (it.keep) render();
    }
    input.addEventListener('input', () => { sel = 0; render(); });
    show(scrim, (e) => {
      if (e.key === 'Escape') { closeOverlay(); return true; }
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) || (e.ctrlKey && e.key === 'n')) { sel = (sel + 1) % Math.max(1, items.length); paintSel(); return true; }
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) || (e.ctrlKey && e.key === 'p')) { sel = (sel - 1 + items.length) % Math.max(1, items.length); paintSel(); return true; }
      if (e.key === 'Enter') { choose(); return true; }
      if (e.key === 'Backspace' && !input.value && stack.length) { stack.pop(); sel = 0; render(); return true; }
      if (document.activeElement !== input) input.focus();
      return false;
    });
    render();
    setTimeout(() => input.focus(), 0);
  }

  // ---------- surveyor: the launcher ----------
  const appItems = () => Object.values(OS.apps).filter((a) => !a.hidden).sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({ icon: a.icon, name: a.name, desc: a.desc, match: (a.keywords || []).join(' ') + ' ' + a.title, run: () => OS.open(a.id) }));
  const actionItems = () => [
    ...OS.theme.list().map((t) => ({ icon: 'paint-brush', name: `Theme: ${t.label}`, desc: t.blurb, run: () => setTheme(t.name) })),
    ...OS.theme.wallpapers.map((w) => ({ icon: 'layers', name: `Wallpaper: ${w}`, desc: 'Drawn by hand, by code, at your screen size', run: () => OS.theme.setWallpaper(w) })),
    { icon: 'padlock', name: 'Lock screen', desc: 'deadlock', key: 'Alt Esc', run: () => OS.lock() },
    { icon: 'magic-wand', name: 'Screensaver', desc: 'kiln', run: () => OS.kiln() },
    { icon: 'grid', name: 'Key bindings', desc: 'Every SUPER shortcut', key: 'Alt /', run: () => OS.ui.keys() },
    { icon: 'coins-outline', name: 'Wait until tomorrow (UTC)', desc: 'Resets the daily spend cap. Moves the clock. Fixes nothing else.', run: () => { OS.spend.tomorrow(); OS.osd('It is tomorrow.'); } },
    { icon: 'exit', name: 'Shut down', desc: 'It is now safe to close your tab', run: () => OS.shutdown() },
    { icon: 'process', name: 'Reboot', desc: 'Again, from the BIOS', run: () => OS.reboot() },
  ];
  function setTheme(name) { OS.theme.set(name); OS.osd(`theme: ${OS.theme.get().label}`); }

  function launcher() {
    palette({
      placeholder: 'Search apps and actions. Start with > to run a command.',
      source: (q) => {
        if (q.startsWith('>')) {
          const cmd = q.slice(1).trim();
          return [{ icon: 'terminal', name: cmd ? `Run: ${cmd}` : 'Type a command after >', desc: 'Opens brickty and runs it', run: () => cmd && OS.exec(cmd) }];
        }
        return q ? [...appItems(), ...actionItems()] : appItems();
      },
      foot: '<span><span class="ui-kbd">↑↓</span> move</span><span><span class="ui-kbd">Enter</span> open</span><span><span class="ui-kbd">&gt;</span> run a command</span><span><span class="ui-kbd">Esc</span> close</span>',
    });
  }

  // ---------- the Labs menu ----------
  const gaps = { Tight: [3, 6], Normal: [6, 10], Generous: [12, 22], None: [0, 0] };
  function menuTree(path) {
    const at = path[path.length - 1];
    const on = (v) => (v ? 'on' : 'off');
    switch (at) {
      case 'Apps': return appItems();
      case 'Learn': return [
        { icon: 'grid', name: 'Key bindings', key: 'Alt /', run: () => OS.ui.keys() },
        { icon: 'labs', name: 'About Labs OS', run: () => OS.open('about') },
        { icon: 'files-outline', name: 'Read the README', run: () => OS.exec('cat ~/README.md') },
        { icon: 'stonehenge', name: 'Run Labs OS 3.1 (legacy)', desc: 'Through brine, the compatibility layer', run: () => OS.open('brine') },
      ];
      case 'Style': return [
        { icon: 'paint-brush', name: 'Theme', sub: 'Theme', desc: OS.theme.get().label },
        { icon: 'layers', name: 'Wallpaper', sub: 'Wallpaper', desc: OS.theme.wallpaper() },
        { icon: 'grid', name: 'Gaps', sub: 'Gaps', desc: `${OS.wm.cfg.gapsIn}/${OS.wm.cfg.gapsOut}` },
        { icon: 'sliders', name: 'Style settings', desc: 'Every theme, side by side', run: () => OS.open('style') },
      ];
      case 'Theme': return OS.theme.list().map((t) => ({ icon: t === OS.theme.get() ? 'status-complete' : 'paint-brush', name: t.label, desc: t.blurb, keep: true, run: () => setTheme(t.name) }));
      case 'Wallpaper': return OS.theme.wallpapers.map((w) => ({ icon: w === OS.theme.wallpaper() ? 'status-complete' : 'layers', name: w, keep: true, run: () => OS.theme.setWallpaper(w) }));
      case 'Gaps': return Object.entries(gaps).map(([k, [i, o]]) => ({ icon: 'grid', name: k, desc: `inner ${i}px, outer ${o}px`, keep: true, run: () => { OS.wm.cfg.gapsIn = i; OS.wm.cfg.gapsOut = o; OS.store.set('gaps', [i, o]); for (let n = 1; n <= 9; n++) OS.wm.layout(n); } }));
      case 'Setup': return [
        { icon: 'bricky-filled', name: `Bricky tips: ${on(OS.brickyOn())}`, desc: 'He has a lot to say', keep: true, run: () => OS.brickyOn(!OS.brickyOn()) },
        { icon: 'bell', name: `Do not disturb: ${on(OS.notifications.dnd())}`, keep: true, run: () => OS.notifications.setDnd(!OS.notifications.dnd()) },
        { icon: 'volume', name: `Sound: ${on(OS.sound.on)}`, keep: true, run: () => { OS.sound.set(!OS.sound.on); OS.bar.redraw(); } },
        { icon: 'magic-wand', name: `Animations: ${on(!document.body.classList.contains('no-anim'))}`, keep: true, run: () => { document.body.classList.toggle('no-anim'); OS.store.set('noanim', document.body.classList.contains('no-anim')); } },
        { icon: 'hourglass', name: `Screensaver after: ${OS.idle.label()}`, keep: true, run: () => OS.idle.cycle() },
        { icon: 'toxic-sign', name: 'Reset the filesystem', desc: 'Throws away every file you saved', run: () => { OS.fs.reset(); OS.notify({ app: 'fs', title: 'Filesystem reset', body: 'Your files are gone. Reload to see the seed again.' }); } },
      ];
      case 'Spend': return [
        { icon: 'coins-outline', name: `Today: ${OS.usd(OS.spend.today())} of ${OS.usd(OS.spend.cap)}`, desc: 'UTC, like the real one', run: () => OS.open('lanetop') },
        { icon: 'hourglass', name: 'Wait until tomorrow (UTC)', run: () => { OS.spend.tomorrow(); OS.osd('It is tomorrow.'); } },
      ];
      case 'System': return [
        { icon: 'padlock', name: 'Lock', key: 'Alt Esc', run: () => OS.lock() },
        { icon: 'magic-wand', name: 'Screensaver', run: () => OS.kiln() },
        { icon: 'process', name: 'Reboot', run: () => OS.reboot() },
        { icon: 'exit', name: 'Shut down', run: () => OS.shutdown() },
      ];
      default: return [
        { icon: 'grid', name: 'Apps', sub: 'Apps' },
        { icon: 'labs', name: 'Learn', sub: 'Learn' },
        { icon: 'paint-brush', name: 'Style', sub: 'Style' },
        { icon: 'sliders', name: 'Setup', sub: 'Setup' },
        { icon: 'rocket', name: 'Update', desc: 'brick -Syu', run: () => OS.exec('brick -Syu') },
        { icon: 'coins-outline', name: 'Spend', sub: 'Spend' },
        { icon: 'power', name: 'System', sub: 'System' },
      ];
    }
  }
  function menu(path = []) {
    palette({ placeholder: 'Labs menu', prompt: '◆', crumbs: path, source: (q, stack) => menuTree(stack), foot: '<span><span class="ui-kbd">Enter</span> open</span><span><span class="ui-kbd">Backspace</span> back</span><span><span class="ui-kbd">Esc</span> close</span>' });
  }

  // ---------- key bindings ----------
  function keys() {
    const grid = h('div', { class: 'grid' }, (OS.keybindings || []).map(([k, d]) => h('div', null, h('span', { html: k.split('+').map((p) => `<span class="ui-kbd">${esc(p)}</span>`).join('+') }), h('em', null, d))));
    const pal = h('div', { class: 'pal keys' }, h('h2', null, 'Key bindings. SUPER is Alt (Option on a Mac).'), grid,
      h('p', { class: 'ui-faint', style: { marginBottom: 0 } }, 'Config: /etc/brickland/brickland.conf. Changing the file changes nothing. This is also true of most config files.'));
    const scrim = h('div', { class: 'scrim', onpointerdown: (e) => { if (e.target === scrim) closeOverlay(); } }, pal);
    show(scrim, (e) => { if (e.key === 'Escape' || e.key === 'Enter' || (e.altKey && e.code === 'Slash')) { closeOverlay(); return true; } return true; });
  }

  // ---------- notification list ----------
  function notifications() {
    palette({
      placeholder: 'Notifications. Type to filter.', prompt: '🔔',
      source: () => {
        const list = OS.notifications.history().map((n) => ({ icon: n.icon || (n.app === 'bricky' ? 'bricky-filled' : 'bell'), name: n.title || '(no title)', desc: `${n.at.toLocaleTimeString('en-GB')} · ${n.app} · ${Array.isArray(n.body) ? n.body.join(' ') : (n.body || '')}`, run: () => {} }));
        return [{ icon: 'bell', name: `Do not disturb: ${OS.notifications.dnd() ? 'on' : 'off'}`, keep: true, run: () => OS.notifications.setDnd(!OS.notifications.dnd()) }, ...list];
      },
    });
  }

  const g = OS.store.get('gaps', null); if (g) { OS.wm.cfg.gapsIn = g[0]; OS.wm.cfg.gapsOut = g[1]; }
  if (OS.store.get('noanim', false)) document.body.classList.add('no-anim');
  OS.ui = { launcher, menu, keys, notifications, close: closeOverlay, palette, show };
})();
