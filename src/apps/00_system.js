// System apps that ship with the kernel: Style, About, Brine (runs Labs OS 3.1).
(() => {
  const { h } = OS;

  registerApp({
    id: 'style', title: 'Style', icon: 'paint-brush', desc: 'Themes, wallpapers and gaps', keywords: ['theme', 'wallpaper', 'settings', 'colours'],
    size: [760, 520],
    mount(win) {
      win.body.classList.add('ui-pad');
      const render = () => {
        win.body.innerHTML = '';
        const cur = OS.theme.get();
        const cards = OS.theme.list().map((t) => h('button', {
          class: 'ui-btn' + (t === cur ? ' on' : ''),
          style: { display: 'block', textAlign: 'left', padding: '0', overflow: 'hidden', whiteSpace: 'normal', height: 'auto' },
          onclick: () => { OS.theme.set(t.name); render(); },
        },
        h('div', { style: { background: t.bg, padding: '10px', borderBottom: `2px solid ${t.accent}` } },
          h('div', { style: { display: 'flex', gap: '4px', marginBottom: '8px' } }, [t.accent, t.accent2, t.good, t.bad, t.warn, t.info].map((c) => h('i', { style: { width: '14px', height: '14px', borderRadius: '3px', background: c, display: 'block' } }))),
          h('div', { style: { color: t.fg, fontWeight: 800 } }, t.label),
          h('div', { style: { color: t.muted, fontSize: '11px' } }, 'brickty ~ $ ', h('span', { style: { color: t.accent } }, 'bin/composer run 158'))),
        h('div', { style: { padding: '8px 10px', fontSize: '11px', color: 'var(--muted)' } }, t.blurb)));
        win.body.append(
          h('div', { class: 'ui-title' }, 'Theme'),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', margin: '8px 0 16px' } }, cards),
          h('div', { class: 'ui-title' }, 'Wallpaper'),
          h('div', { class: 'row', style: { flexWrap: 'wrap', margin: '8px 0 16px' } }, OS.theme.wallpapers.map((w) => h('button', { class: 'ui-btn' + (w === OS.theme.wallpaper() ? ' on' : ''), onclick: () => { OS.theme.setWallpaper(w); render(); } }, w))),
          h('div', { class: 'ui-title' }, 'Gaps'),
          h('div', { class: 'row', style: { flexWrap: 'wrap', margin: '8px 0 16px' } }, [['Tight', 3, 6], ['Normal', 6, 10], ['Generous', 12, 22], ['None', 0, 0]].map(([n, i, o]) => h('button', { class: 'ui-btn' + (OS.wm.cfg.gapsIn === i && OS.wm.cfg.gapsOut === o ? ' on' : ''), onclick: () => { OS.wm.cfg.gapsIn = i; OS.wm.cfg.gapsOut = o; OS.store.set('gaps', [i, o]); for (let k = 1; k <= 9; k++) OS.wm.layout(k); render(); } }, `${n} ${i}/${o}`))),
          h('p', { class: 'ui-faint' }, 'Every theme was reviewed in five rounds. Round 6 is booked.'),
        );
      };
      render();
      win.state.offs = [OS.on('theme', render), OS.on('wallpaper', render)];
      win.on('focus', render);
    },
    unmount(win) { win.state.offs?.forEach((off) => off()); },
  });

  registerApp({
    id: 'about', title: 'About Labs OS', icon: 'labs', desc: 'Version, credits, what changed since 3.1', keywords: ['version', 'credits', 'help'],
    float: true, size: [600, 640],
    mount(win) {
      const rows = [
        ['Version', `Labs OS ${OS.version} (${OS.codename})`], ['Build', OS.build], ['Compositor', 'brickland (dwindle, master, monocle)'],
        ['Shell', 'brickty, with real commands and a fake disk'], ['Pipeline', `${OS.data.stages.length} stages, page codes P1 to M4`],
        ['Spend cap', `${OS.usd(OS.data.dailyCapUsd)} a day (UTC)`], ['Mascot', 'Bricky. Offered vectors. Declined.'],
        ['Previous version', '3.1 (Evaluation). 2.0 follows 3.1. Version numbers are display numbers.'],
      ];
      win.body.append(h('div', { class: 'ui-pad col', style: { gap: '12px' } },
        h('div', { class: 'row', style: { gap: '14px' } },
          h('div', { style: { width: '64px', height: '64px' }, html: OS.logoSvg }),
          h('div', null, h('div', { class: 'ui-big' }, 'Labs OS 2'), h('div', { class: 'ui-muted' }, 'Composed, not configured.'))),
        h('table', { class: 'ui-table' }, rows.map(([k, v]) => h('tr', null, h('td', { class: 'ui-muted' }, k), h('td', { style: { whiteSpace: 'normal' } }, v)))),
        h('div', { class: 'ui-title' }, 'New since 3.1'),
        h('ul', { style: { margin: 0, paddingLeft: '18px', color: 'var(--muted)' } },
          ['Windows tile now. Nobody drags them. Everybody drags them.', 'The 3D house is composed in 22 stages instead of drawn in one.',
            'Everything that thinks now costs money, and the bar shows how much.', 'The configurator has been through five design reviews and is booked for a sixth.',
            'Bricky was offered an upgrade. Bricky declined.', '3.1 still runs, through brine, in a window.'].map((t) => h('li', null, t))),
        h('div', { class: 'row' },
          h('button', { class: 'ui-btn', onclick: () => OS.ui.keys() }, 'Key bindings'),
          h('button', { class: 'ui-btn', onclick: () => OS.open('brine') }, 'Run 3.1'),
          h('button', { class: 'ui-btn primary', onclick: () => win.close() }, 'Close')),
      ));
    },
  });

  registerApp({
    id: 'brine', title: 'brine: Labs OS 3.1', icon: 'stonehenge', desc: 'Runs Labs OS 3.1 (Evaluation) in a compatibility layer', keywords: ['legacy', 'v1', 'windows', '1996', 'wine'],
    size: [960, 600],
    mount(win) {
      let html = '';
      try {
        const bin = atob(OS_ASSETS.legacy);
        html = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      } catch (err) {
        win.crash({ title: 'brine could not unpack 3.1', code: 'BRN-0x0031 LEGACY_UNREADABLE', lines: [String(err.message)] });
        return;
      }
      const frame = h('iframe', { title: 'Labs OS 3.1', sandbox: 'allow-scripts', style: { border: 0, width: '100%', height: '100%', display: 'block', background: '#232326' } });
      frame.srcdoc = html;
      const note = h('div', { style: { padding: '4px 10px', fontSize: '11px', color: 'var(--muted)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' } },
        'brine 9.0: Labs OS 3.1 in compatibility mode. Keys typed inside belong to 1996. Use the ✕ above, or click outside first, to get Alt back.');
      win.body.style.display = 'flex'; win.body.style.flexDirection = 'column';
      win.body.append(note, h('div', { class: 'grow' }, frame));
      win.setMeta('not to be confused with anything else');
    },
  });
})();
