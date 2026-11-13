// mortar: notifications, the on-screen display, the crash panel, and Bricky's voice.
(() => {
  const { h } = OS;
  const box = document.getElementById('notes');
  const history = [];
  let dnd = OS.store.get('dnd', false);

  // OS.notify({title, body, app, icon, urgency: 'low'|'normal'|'critical', timeout, actions: [{label, run}], bricky})
  OS.notify = (n) => {
    const note = { app: 'labs', urgency: 'normal', timeout: 6500, ...n, at: OS.now() };
    history.unshift(note); history.length = Math.min(history.length, 60);
    OS.emit('notify', note);
    note.dismiss = () => {};
    if (dnd && note.urgency !== 'critical') return note;
    const av = note.bricky || (!note.icon && note.app === 'bricky')
      ? h('img', { class: 'pixel', src: OS.bricky(), alt: '' })
      : h('span', { html: OS.icon(note.icon || 'bell') }).firstChild;
    const life = h('div', { class: 'life' });
    const el = h('div', { class: `os-note ${note.urgency}`, role: 'status' },
      h('div', { class: 'av' }, av),
      h('div', null,
        h('div', { class: 'ap' }, note.app),
        h('div', { class: 'tt' }, note.title || ''),
        note.body ? h('div', { class: 'bd' }, Array.isArray(note.body) ? note.body.join('\n') : note.body) : null,
        note.actions?.length ? h('div', { class: 'acts' }, note.actions.map((a) => h('button', { class: 'ui-btn', onclick: (e) => { e.stopPropagation(); try { a.run(); } finally { dismiss(); } } }, a.label))) : null,
      ),
      life,
    );
    let gone = false;
    const dismiss = () => { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => el.remove(), 240); };
    el.addEventListener('click', dismiss);
    note.dismiss = dismiss;
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    if (note.urgency !== 'critical' && note.timeout > 0) {
      life.animate([{ width: '100%' }, { width: '0%' }], { duration: note.timeout / OS.speed, easing: 'linear' });
      setTimeout(dismiss, note.timeout / OS.speed);
    }
    if (note.urgency === 'critical') OS.sound.error(); else OS.sound.ding();
    return note;
  };
  OS.notifications = {
    history: () => history.slice(),
    dnd: () => dnd,
    setDnd(v) { dnd = !!v; OS.store.set('dnd', dnd); OS.emit('notify', null); },
    clear() { box.innerHTML = ''; },
  };

  // Brief centred text, for layout and theme changes.
  let osdEl = null; let osdT = 0;
  OS.osd = (text) => {
    if (!osdEl) {
      osdEl = h('div', { style: { position: 'absolute', left: '50%', bottom: '12%', transform: 'translateX(-50%)', zIndex: 70, padding: '8px 16px', borderRadius: '999px', background: 'var(--surface)', border: '2px solid var(--accent)', fontWeight: 800, pointerEvents: 'none', transition: 'opacity .25s', boxShadow: '0 10px 30px rgba(0,0,0,.4)' } });
      document.getElementById('os').append(osdEl);
    }
    osdEl.textContent = text; osdEl.style.opacity = '1';
    clearTimeout(osdT); osdT = setTimeout(() => { osdEl.style.opacity = '0'; }, 1100);
  };

  // The fail-on-purpose panel. Shown inside a window. Returns the panel element.
  // spec: {title, code, lines: [], details: [], icon, actions: [{label, run, primary}]}
  OS.crash = (win, spec = {}) => {
    const panel = h('div', { class: 'ui-crash' });
    const close = () => panel.remove();
    const actions = spec.actions?.length ? spec.actions : [{ label: 'OK', primary: true, run: close }, { label: 'Close app', run: () => win.close() }];
    panel.append(h('div', { class: 'box' },
      h('div', { class: 'hd' }, h('span', { html: OS.icon(spec.icon || 'status-error') }).firstChild, spec.title || 'Something went wrong on purpose'),
      h('div', { class: 'bd' },
        (spec.lines || []).map((l) => h('div', null, l)),
        spec.code ? h('div', { class: 'code' }, spec.code) : null,
        spec.details?.length ? h('pre', null, spec.details.join('\n')) : null,
      ),
      h('div', { class: 'ft' }, actions.map((a) => h('button', { class: 'ui-btn' + (a.primary ? ' primary' : ''), onclick: () => { const keep = a.run?.(); if (keep !== true) close(); } }, a.label))),
    ));
    win.el.append(panel);
    OS.sound.error();
    OS.emit('crash', { win, spec });
    return panel;
  };
})();
