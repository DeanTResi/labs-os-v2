// Themes: one flat token set each. Applied as CSS variables on :root; canvas apps read OS.theme.colors().
(() => {
  const T = (name, label, dark, wall, c) => ({ name, label, dark, wall, ...c });
  const themes = [
    T('labs-night', 'Labs Night', true, 'aurora', {
      bg: '#13111c', bar: 'rgba(15,13,23,.82)', surface: '#1a1726', surface2: '#221e33', fg: '#e4e0f7', muted: '#9a94bd', faint: '#5d577d',
      border: '#2e2945', accent: '#8b7cf6', accent2: '#c084fc', good: '#7ee0a1', bad: '#ff6b81', warn: '#ffcc66', info: '#7dcfff', sel: '#2f2a4d', onAccent: '#0d0b14',
      blurb: 'The default. Brand purple, turned down to night-time.',
    }),
    T('magnolia', 'Magnolia', false, 'blueprint', {
      bg: '#f4efe4', bar: 'rgba(244,239,228,.85)', surface: '#fbf8f1', surface2: '#efe8da', fg: '#2a2438', muted: '#6c6480', faint: '#a39cb0',
      border: '#ddd3c1', accent: '#6656d2', accent2: '#9b5de5', good: '#2f9e5b', bad: '#d1495b', warn: '#b7791f', info: '#2b7bb9', sel: '#e4dcf7', onAccent: '#ffffff',
      blurb: 'Light mode. Every landlord\'s favourite colour.',
    }),
    T('exposed-brick', 'Exposed Brick', true, 'ridges', {
      bg: '#1a1210', bar: 'rgba(22,15,13,.84)', surface: '#221815', surface2: '#2c1f1a', fg: '#f3e3d6', muted: '#b59a8a', faint: '#7a6155',
      border: '#3a2a22', accent: '#e07a4f', accent2: '#f2b36b', good: '#a3c97a', bad: '#ff6b6b', warn: '#f2c14e', info: '#8ec5d6', sel: '#3d2a22', onAccent: '#1a0f0b',
      blurb: 'Bricky\'s choice. He did not have another one.',
    }),
    T('gold-standard', 'Gold Standard', true, 'ridges', {
      bg: '#0e0c07', bar: 'rgba(14,12,7,.85)', surface: '#16130b', surface2: '#1f1a0f', fg: '#f1e7c8', muted: '#b3a479', faint: '#6f6446',
      border: '#2f2814', accent: '#e6b422', accent2: '#fff1a8', good: '#9ccf6b', bad: '#e86a5a', warn: '#ffb347', info: '#a8c7e8', sel: '#3a3014', onAccent: '#140f02',
      blurb: 'For gold houses 158, 152, 135 and 178. The reliable four.',
    }),
    T('blueprint', 'Blueprint', true, 'blueprint', {
      bg: '#0a1f3d', bar: 'rgba(8,26,52,.85)', surface: '#0d2648', surface2: '#113059', fg: '#e6f0ff', muted: '#9db6d9', faint: '#5878a3',
      border: '#1d4377', accent: '#7cc4ff', accent2: '#ffffff', good: '#8ce6b0', bad: '#ff8a8a', warn: '#ffd58a', info: '#b8dcff', sel: '#17457d', onAccent: '#06182f',
      blurb: 'On a 0.5 m grid. Vertically, one storey. There is no vertical grid.',
    }),
    T('conservation-area', 'Conservation Area', true, 'aurora', {
      bg: '#0f1712', bar: 'rgba(13,20,15,.85)', surface: '#142019', surface2: '#1a2a20', fg: '#e3efe4', muted: '#9db8a3', faint: '#5e7a66',
      border: '#24372b', accent: '#7fc8a0', accent2: '#d4e7a1', good: '#a6e3a1', bad: '#f38ba8', warn: '#f9e2af', info: '#89dceb', sel: '#22402f', onAccent: '#08130c',
      blurb: 'Nothing in this theme may be changed without an application.',
    }),
    T('skip-hire', 'Skip Hire', true, 'hazard', {
      bg: '#101010', bar: 'rgba(16,16,16,.88)', surface: '#171717', surface2: '#202020', fg: '#f5f5f0', muted: '#a8a8a0', faint: '#666660',
      border: '#2e2e2a', accent: '#ffd400', accent2: '#ff8c00', good: '#9be564', bad: '#ff5c5c', warn: '#ffd400', info: '#6cc6ff', sel: '#3a3500', onAccent: '#111111',
      blurb: 'High visibility. Permit valid for 28 days.',
    }),
    T('heightmap', 'Heightmap', true, 'heightmap', {
      bg: '#000000', bar: 'rgba(0,0,0,.85)', surface: '#0b0b0b', surface2: '#151515', fg: '#f0f0f0', muted: '#9a9a9a', faint: '#555555',
      border: '#2a2a2a', accent: '#ffffff', accent2: '#8a8a8a', good: '#d6d6d6', bad: '#8a8a8a', warn: '#bbbbbb', info: '#e0e0e0', sel: '#333333', onAccent: '#000000',
      blurb: 'Black is low. White is high. Good and bad are both grey.',
    }),
    T('matte-mortar', 'Matte Mortar', true, 'bricky', {
      bg: '#121212', bar: 'rgba(18,18,18,.88)', surface: '#181818', surface2: '#1f1f1f', fg: '#d8d8d8', muted: '#8a8a8a', faint: '#555555',
      border: '#2a2a2a', accent: '#c9b8a6', accent2: '#e8d9c4', good: '#9fc29a', bad: '#d97a7a', warn: '#d9b36c', info: '#8fb3c9', sel: '#2e2a26', onAccent: '#121212',
      blurb: 'Grey, but with opinions. Sets slowly.',
    }),
  ];

  const byName = Object.fromEntries(themes.map((t) => [t.name, t]));
  let current = byName[OS.params.get('theme')] || byName[OS.store.get('theme', 'labs-night')] || themes[0];
  let wallpaper = OS.params.get('wall') || OS.store.get('wall', null);

  const css = (t) => ({
    '--bg': t.bg, '--bar': t.bar, '--surface': t.surface, '--surface2': t.surface2, '--fg': t.fg, '--muted': t.muted,
    '--faint': t.faint, '--border': t.border, '--accent': t.accent, '--accent2': t.accent2, '--good': t.good,
    '--bad': t.bad, '--warn': t.warn, '--info': t.info, '--sel': t.sel, '--on-accent': t.onAccent,
  });

  function apply() {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(css(current))) root.style.setProperty(k, v);
    root.style.colorScheme = current.dark ? 'dark' : 'light';
  }

  OS.theme = {
    list: () => themes.slice(),
    get: () => current,
    colors: () => ({ ...current }),
    set(name) {
      const t = byName[name];
      if (!t) return false;
      current = t; OS.store.set('theme', name); apply();
      OS.emit('theme', current);
      return true;
    },
    next(step = 1) {
      const i = themes.indexOf(current);
      this.set(themes[(i + step + themes.length) % themes.length].name);
      return current;
    },
    wallpapers: ['aurora', 'ridges', 'heightmap', 'blueprint', 'hazard', 'bricky'],
    wallpaper: () => wallpaper || current.wall,
    setWallpaper(w) { wallpaper = w; OS.store.set('wall', w); OS.emit('wallpaper', w); },
    nextWallpaper() {
      const list = this.wallpapers; const i = list.indexOf(this.wallpaper());
      this.setWallpaper(list[(i + 1) % list.length]);
      return this.wallpaper();
    },
    // Mix two hex colours: t=0 gives a, t=1 gives b.
    mix(a, b, t) {
      const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [x, y] = [p(a), p(b)];
      return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
    },
  };
  apply();
})();
