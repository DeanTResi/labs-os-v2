// Global key bindings. SUPER is Alt: browsers keep the real Super key for themselves.
(() => {
  const editable = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyH: 'left', KeyL: 'right', KeyK: 'up', KeyJ: 'down' };

  OS.keybindings = [
    ['Alt+Space', 'Launcher (surveyor)'], ['Ctrl+K', 'Launcher again, as the command palette'],
    ['Alt+Enter', 'Terminal (brickty)'], ['Alt+Shift+Space', 'Labs menu'],
    ['Alt+W', 'Close window'], ['Alt+F', 'Fullscreen'], ['Alt+T', 'Float or tile'], ['Alt+M', 'Cycle layout: dwindle, master, monocle'],
    ['Alt+1..9', 'Go to workspace'], ['Alt+Shift+1..9', 'Move window to workspace'],
    ['Ctrl+Alt+1..9', 'Go to workspace, even where Option+3 types #'],
    ['Alt+H J K L', 'Focus left, down, up, right (arrows work too)'], ['Alt+Shift+H J K L', 'Swap with the window in that direction'],
    ['Alt+Ctrl+← →', 'Resize the first split'], ['Alt+Esc', 'Lock (deadlock)'],
    ['Alt+/', 'This sheet'], ['Alt+N', 'Notifications'], ['Alt+B', 'Bricky says a thing'],
    ['Alt+Shift+T', 'Next theme'], ['Alt+Shift+W', 'Next wallpaper'],
    ['Alt+Shift+C', 'Composer'], ['Alt+Shift+V', 'Configurator'], ['Alt+Shift+M', 'lanetop'], ['Alt+E', 'labvim'],
    ['Drag a title bar', 'Swap tiles, or move a floating window'], ['Double-click a title bar', 'Fullscreen'],
  ];

  // Characters that Option types on Mac keyboards (# on UK, @ [ ] { } | on German). In a text field they win.
  const TYPED = new Set(['#', '@', '[', ']', '{', '}', '|', '\\', '~', '€', '£', '`', '^']);

  function binding(e) {
    const f = OS.wm.focused();
    const shift = e.shiftKey; const ctrl = e.ctrlKey;
    if (ctrl && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { OS.wm.resize(e.code === 'ArrowLeft' ? -0.05 : 0.05); return true; }
    if (ctrl && e.code.startsWith('Digit') && e.code !== 'Digit0') { OS.wm.switchWs(Number(e.code.slice(5))); return true; }
    if (ctrl) return false;
    if (editable(document.activeElement) && TYPED.has(e.key)) return false;
    if (e.code === 'Space') { if (shift) OS.ui.menu(); else OS.ui.launcher(); return true; }
    if (e.code === 'Enter') { OS.open('terminal', undefined, { float: shift }); return true; }
    if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
      const n = Number(e.code.slice(5));
      if (shift) OS.wm.moveToWs(f, n); else OS.wm.switchWs(n);
      return true;
    }
    if (dirs[e.code]) { if (shift) OS.wm.swapDir(dirs[e.code]); else OS.wm.focusDir(dirs[e.code]); return true; }
    switch (e.code) {
      case 'KeyW': if (shift) { OS.theme.nextWallpaper(); OS.osd('wallpaper: ' + OS.theme.wallpaper()); } else f?.close(); return true;
      case 'KeyQ': f?.close(); return true;
      case 'KeyF': OS.wm.toggleFull(f); return true;
      case 'KeyT': if (shift) { OS.theme.next(); OS.osd('theme: ' + OS.theme.get().label); } else OS.wm.toggleFloat(f); return true;
      case 'KeyM': if (shift) OS.open('lanetop'); else OS.wm.cycleLayout(); return true;
      case 'KeyC': if (shift) { OS.open('composer'); return true; } return false;
      case 'KeyV': if (shift) { OS.open('configurator'); return true; } return false;
      case 'KeyE': OS.open('labvim'); return true;
      case 'KeyB': OS.brickySay(); return true;
      case 'KeyN': OS.ui.notifications(); return true;
      case 'Escape': OS.lock(); return true;
      case 'Slash': OS.ui.keys(); return true;
      default: return false;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (OS.sessionOpen()) { if (OS.sessionKey(e)) { e.preventDefault(); e.stopPropagation(); } return; }
    if (!OS.ready) return;
    if (OS.overlayOpen()) { if (OS.overlayKey(e)) { e.preventDefault(); e.stopPropagation(); } return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyK') { e.preventDefault(); OS.ui.launcher(); return; }
    if (e.altKey && !e.metaKey && binding(e)) { e.preventDefault(); e.stopPropagation(); return; }
    const f = OS.wm.focused();
    const a = document.activeElement;
    const inWin = !a || a === document.body || (f && f.el.contains(a));
    if (f && inWin && !editable(a)) {
      f.emit('key', e);
      try { f.app.onKey?.(f, e); } catch (err) { console.error(err); }
    }
  }, true);
})();
