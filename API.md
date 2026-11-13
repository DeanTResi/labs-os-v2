# Labs OS 2 app API

Every app is one classic script in `src/apps/`, concatenated into one HTML page with the kernel. No modules, no imports, no network, no external libraries.

## Scope rules (the build enforces the first two)

- Wrap the whole file in an IIFE: `(() => { ... })();` The first non-comment line must start with `(() =>`.
- Never declare top-level names. Never shadow `top`, `name`, `status`, `length`, `screen`, `parent`, `self`, `history`, `location`, `frames`, `origin`, `closed`, `event`, `open`, `close`.
- Never touch another app's DOM or state. Talk through `OS.emit` / `OS.on` if you must.
- Never use `fetch`, `XMLHttpRequest`, external URLs, CDNs or web fonts. The page works offline from `file://`.
- `localStorage` only through `OS.store` (it already wraps every access in try/catch).
- Animation: `win.raf(fn)` or `win.every(ms, fn)`, never bare `requestAnimationFrame` loops or `setInterval` that outlive the window.
- After every `await`, check `if (win.closed) return;`.
- Do not write `</script` anywhere in a JS file (it ends the inline script). Split it: `'<' + '/script'`.

## Registering

```js
(() => {
  registerApp({
    id: 'composer',            // unique; the build fails on duplicates
    title: 'Composer',          // window title and launcher name
    icon: 'house-filled',       // a key of OS.icons (list below)
    desc: 'one line for the launcher',
    keywords: ['house', 'pipeline'], // extra launcher search words
    multi: false,               // true: allow several windows of this app
    float: false,               // true: open floating (centred) instead of tiled
    size: [720, 480],           // floating size in CSS px
    hidden: false,              // true: not listed in the launcher
    mount(win, arg) {},         // build your DOM inside win.body. arg comes from OS.open(id, arg)
    unmount(win) {},            // optional cleanup (timers and rafs are cleared for you)
    onArg(win, arg) {},         // optional: OS.open(id, arg) on an already-open single-instance app
    onKey(win, e) {},           // optional: keydown while focused and no input/textarea has DOM focus
    onResize(win) {},           // optional: the window body changed size
  });
})();
```

## The window object

| Member | |
|---|---|
| `win.body` | your root element. `position: relative`, scrolls when content overflows. Fill it. |
| `win.el`, `win.header` | the frame and its title bar. Do not restyle them. |
| `win.state` | yours. Mutate it; do not reassign it. |
| `win.setTitle(t)`, `win.setMeta(t)` | title-bar text, and a small grey note at its right |
| `win.close()`, `win.focus()`, `win.isFocused()`, `win.closed`, `win.visible` | |
| `win.width`, `win.height` | client size of `win.body` |
| `win.every(ms, fn)`, `win.after(ms, fn)` | timers, scaled by `OS.speed`, cleared on close |
| `await win.sleep(ms)` | scaled by `OS.speed`; resolves early on close, so check `win.closed` after |
| `win.raf(fn(dtMs, t))` | per-frame callback, only while the window is visible. Returns a stop function. `dt` is scaled by `OS.speed`. |
| `win.on(evt, fn)` | `'focus'`, `'blur'`, `'resize'`, `'close'`, `'key'` (same as onKey) |
| `win.flash()` | urgent border flash, and marks its workspace urgent in the bar |
| `win.crash(spec)` | the fail-on-purpose panel, see `OS.crash` |

On `'focus'`, put DOM focus where the user expects to type (the terminal focuses its input).

## OS services

```js
OS.open(appId, arg)            // returns the win. Single-instance apps are focused and get onArg(win, arg)
OS.exec('bin/composer run 158') // opens a terminal and runs the line in it
OS.notify({ title, body, app, icon, urgency: 'low'|'normal'|'critical', timeout, actions: [{label, run}], bricky: true })
OS.osd('short centred text')   // brief overlay, for mode changes
OS.crash(win, { title, code, lines: [], details: [], icon, actions: [{label, run, primary}] })
                               // the fail-on-purpose panel, inside your window. Default buttons: OK, Close app.
OS.brickySay('text')           // Bricky notification
OS.on(evt, fn) / OS.emit(evt, data) / OS.off(evt, fn)
                               // kernel events: 'theme', 'wallpaper', 'spend', 'spend:cap', 'notify', 'ws',
                               // 'win:open', 'win:close', 'win:focus', 'fs', 'ready'
OS.h(tag, attrs, ...children)  // DOM helper. attrs: class, style (object), on<event>, html, text, dataset
OS.esc(str)                    // HTML-escape
OS.icon(name, cls) -> html     // '<span class="icon">svg</span>'; OS.iconEl(name) -> element
OS.hash(str) -> uint32 · OS.rng(seedOrString) -> () => 0..1 · OS.pick(arr, rnd)
OS.money(n) -> '£1,234' · OS.usd(n) -> '$12.40' · OS.clamp(v,a,b) · OS.lerp(a,b,t)
OS.now() -> Date (respects "wait until tomorrow") · OS.today() -> 'YYYY-MM-DD' · OS.speed (1 normally; ?speed=10)
OS.store.get(key, def) / OS.store.set(key, val)   // namespaced localStorage, never throws
OS.sound.click() / ding() / error() / beep(freq, ms, type, vol)   // silent unless the user turned sound on
OS.theme.colors() -> { bg, surface, surface2, fg, muted, faint, border, accent, accent2, good, bad, warn, info, sel, onAccent, dark, name, label }
OS.theme.mix(hexA, hexB, t)    // hex colour mix, for canvas work
OS.bricky(blink) -> data URL of the 32x32 pixel Bricky
OS.LOGO -> ['██╗ ...'] six lines of block-letter LABS OS 2
OS.data                        // shared facts, see below
```

### Spend: `OS.spend`

Everything that "calls a model" pays here. One ledger for the whole OS, shown in the bar.

```js
const r = OS.spend.add(0.42, 'floor_boxes luna_storeycount_3, house 158', 'composer');
if (!r.ok) { /* refused: r.message is the daily-cap sentence. Stop, and show it. */ }
OS.spend.can(usd) · OS.spend.today() · OS.spend.remaining() · OS.spend.cap (100) · OS.spend.rows() · OS.spend.tomorrow()
```
Keep charges small and plausible (cents to a few dollars). Hitting the cap must be possible but must take effort or a deliberate "max effort" choice.

### Files: `OS.fs`

An in-memory disk with the labs repo at `~/labs` (`/home/researcher/labs`). Writes persist.

```js
OS.fs.home · OS.fs.resolve(cwd, path) · OS.fs.read(p) · OS.fs.write(p, text) · OS.fs.ls(p) -> [{name, type, size}]
OS.fs.exists(p) · OS.fs.isDir(p) · OS.fs.isFile(p) · OS.fs.mkdir(p, {parents}) · OS.fs.rm(p, {recursive}) · OS.fs.walk(p)
OS.fs.seed({ '/abs/path': 'text' or () => 'text', '/abs/dir/': '' })   // add your own files (not persisted)
```
Errors are `Error` with `.code` (`ENOENT`, `EISDIR`, `EPERM`, ...) and a message ready to print.

### Commands: `OS.commands`

The terminal (brickty) runs these. Any app may register its own CLI.

```js
OS.commands.register('bin/composer', {
  desc: 'Run the Composer pipeline', usage: 'bin/composer run <house>',
  async run(args, io) { ...; return 0; },   // args excludes the command name. Return an exit code.
  complete(args) { return ['run', 'stages']; }, // optional tab completion
});
OS.commands.alias('composer', 'bin/composer');
```
`io` (provided by the terminal):

| | |
|---|---|
| `io.println(text = '', cls)` | one line. cls: `ok` `bad` `warn` `info` `accent` `accent2` `muted` `faint` `bold`. Returns a handle with `.set(text, cls)` to rewrite that line in place (progress bars). |
| `io.print(text, cls)` | text without a newline (append to the current line) |
| `io.clear()` | clear the screen |
| `io.cwd`, `io.cd(path)` | current directory |
| `io.cols` | width in characters |
| `await io.sleep(ms)` | scaled by `OS.speed`. Check `io.aborted` after it (Ctrl+C sets it). |
| `io.aborted` | true after Ctrl+C or window close. Stop and return 130. |
| `await io.prompt(question)` | read one line from the user |
| `io.open(appId, arg)` | same as `OS.open` |
| `io.win` | the terminal window |

## Shared facts: `OS.data`

`OS.data.stages` (22 Composer stages: `{key, label, code, llm, needs, approaches, def}`), `goldHouses` (`[158, 152, 135, 178]`), `extensionTypes`, `designReviewRounds` (5), `dailyCapUsd`, `noteCapUsd`, `displayWidthM` (3), `gridM` (0.5), `storeyM` (2.7), `commits` (real commit subjects). Read `src/kernel/03_data.js`.

## 3D: `OS.r3d`

A flat-shaded renderer on a 2D canvas. Painter's algorithm, shadows, the 0.5 m grid. Metres, y up.

```js
const canvas = OS.h('canvas', { style: { width: '100%', height: '100%', display: 'block' } });
const view = OS.r3d.create(canvas, { camera: { yaw: -0.65, pitch: 0.42 }, grid: true, shadows: true, autoRotate: 0 });
const S = OS.r3d.shapes;
view.set([
  ...S.box(0, 0, 0, 6, 5.4, 8, '#c9a27e', { tag: 'walls' }),          // x, y, z, w, h, d, colour
  ...S.gable(-0.2, 5.4, -0.2, 6.4, 2.6, 8.4, '#5b4b6e', 'z'),          // ridge along z
  ...S.hip(x, y, z, w, h, d, colour), ...S.lean(x, y, z, w, h, d, colour, 'z0'),
  ...S.panel('front', x, y, zOfWall, w, h, '#223', { tag: 'door' }),  // window or door on a wall face
  ...S.flat(x, y, z, w, d, colour),
], { lines: [{ a: [x,y,z], b: [x,y,z], color, width, dash }], labels: [{ pos: [x,y,z], text, color }] });
view.fit();                    // frame everything
view.request();                // redraw on the next frame (set() and orbiting do this for you)
view.pick(clientX, clientY)    // -> the face under the pointer, with its tag
view.project([x,y,z])          // -> [cssX, cssY] or null
view.autoRotate(0.3)           // radians per second-ish; 0 stops
view.dispose()                 // in unmount
```
Drag orbits, wheel zooms, double-click fits. Re-render after the canvas resizes: call `view.request()` in `onResize`.

## UI kit (CSS classes, theme-aware)

`ui-btn` (`primary` `ghost` `danger` `on`), `ui-input`, `ui-select`, `ui-textarea`, `ui-chip`/`ui-tag` (`good` `bad` `warn` `info` `accent`), `ui-kbd`, `ui-panel`, `ui-title`, `ui-muted`, `ui-faint`, `ui-good`, `ui-bad`, `ui-warn`, `ui-info`, `ui-accent`, `ui-accent2`, `ui-big`, `ui-table` (`tr.sel`), `ui-bar` (`<div class="ui-bar"><i style="width:40%"></i></div>`, `good` `bad` `warn`), `ui-sep`, `ui-pad`, `row`, `col`, `grow`, `ui-scroll`, `ui-shake`, `ui-blink`, `ui-spin`, `pixel`.

Use CSS variables, never raw hex, in your own styles: `var(--bg) --surface --surface2 --fg --muted --faint --border --accent --accent2 --good --bad --warn --info --sel --on-accent --radius --mono`. Inject app CSS once with a `<style>` element you create in `mount` (guard with an id so a second window does not add it twice), and prefix every class with your app id.

There are nine themes, including a light one (Magnolia) and a monochrome one (Heightmap). Check yours in at least Labs Night and Magnolia.

## Icons

Resi icons: `ai bell bricky-filled coins-outline desk-computer exit files-outline floorplan graph house-filled house-with-extension hourglass journey-outline labs layers magic-wand org-chart padlock paint-brush process question rocket roof rosette sliders status-complete status-error stonehenge toxic-sign trophy wave`

Line icons: `terminal octopus cpu floppy search branch kanban eye grid power volume mute dollar wifi lanes flask`

## Testing

```bash
python3 tools/build.py                       # must print index.html: ... with your app ids
node tools/shot.mjs --port <your port> "boot=0&bricky=0&apps=<your id>" ms:300 shot:/path/out.png
node tools/shot.mjs --port <your port> "boot=0&bricky=0&apps=terminal" key:Alt+Space type:comp key:Enter ms:400 shot:/path/out.png
```
Steps: `wait:<js>` `js:<js>` `ms:<n>` `key:<combo>` `type:<text>` `click:<x>,<y>` `clicksel:<css>` `shot:<png>`. Then **Read the PNG and look at it.** Code that draws cannot be reviewed by reading it. `?speed=10` runs every OS timer ten times faster. `?theme=magnolia` picks a theme. Page errors print at the end and exit 1.
