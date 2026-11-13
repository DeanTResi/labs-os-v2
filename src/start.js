// Start: boot (unless ?boot=0), then open the first windows and say hello.
(() => {
  const p = OS.params;
  const first = (p.get('apps') ?? 'terminal,composer').split(',').map((s) => s.trim()).filter(Boolean);

  OS.startSession = () => {
    OS.ready = true;
    OS.wallpaper.draw();
    OS.bar.redraw();
    for (const id of first) {
      if (!OS.apps[id]) continue;
      OS.open(id, id === 'terminal' && !p.get('apps') ? { run: 'brickfetch' } : undefined);
    }
    if (!p.get('apps') && window.innerWidth >= 1200) OS.wm.setRatio(0.42, 1); // give the Composer the larger tile
    OS.wm.updateEmpty();
    if (p.get('bricky') !== '0') {
      setTimeout(() => OS.notify({
        app: 'bricky', bricky: true, title: 'Welcome to Labs OS 2',
        body: 'SUPER is Alt. Alt+Space finds apps. Alt+/ shows every key. I am still 32 by 32.', timeout: 9000,
      }), 900 / OS.speed);
      OS.startBricky();
    }
    OS.emit('ready');
  };

  OS.wallpaper.draw();
  if (p.get('boot') === '0') {
    document.getElementById('os').classList.remove('booting');
    OS.startSession();
  } else {
    OS.boot(OS.startSession);
  }
})();
