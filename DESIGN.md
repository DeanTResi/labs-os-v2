# Labs OS 2: design

Labs OS 3.1 was a vintage-Windows comedy OS drawn into a 640x360 canvas. Labs OS 2 replaces the canvas with a full-resolution tiling desktop, in the style of a riced Arch Linux with a Hyprland-type compositor. The subject moved too: from the strategy document to the two things the team builds now, the v3 configurator and the Composer.

-----

## Constraints

- **One file.** `index.html` is self-contained: every script, style, icon and image is inline. No network, no CDN, no web fonts. It works from `file://` and from GitHub Pages.
- **No library.** The window manager, the shell, the editor and the 3D renderer are written here. The 3D is flat-shaded polygons on a 2D canvas, sorted by depth.
- **Public page.** No real people, no real brands in visible text, nothing private. The parody targets process and machinery, never people.

-----

## Architecture

```
src/shell.html        the page skeleton
src/css/              the shell styles and the UI kit for apps
src/kernel/           the OS: core, themes, data, fs, spend, commands, r3d, wm, bar, notify, overlays, session, wallpaper, keys
src/apps/             one file per app (some apps have two), each wrapped in an IIFE, each calling registerApp
src/start.js          boot, then the first windows
tools/build.py        src/ -> index.html, with checks
tools/build_assets.py icons, Bricky and the 3.1 build -> src/kernel/00_assets.js
tools/shot.mjs        drives the page in headless Chrome over CDP and takes screenshots
```

| Kernel unit | File | What it does |
|---|---|---|
| core | `01_core.js` | the `OS` namespace: events, the `h()` DOM helper, hashing and seeded random numbers, storage that never throws, sound, icons, the app registry |
| themes | `02_themes.js` | nine flat token sets applied as CSS variables; canvas apps read the same values |
| data | `03_data.js` | facts from the real labs repo: the 22 Composer stages and their approach names, gold houses, real commit subjects |
| fs | `04_fs.js` | an in-memory filesystem with the labs repo at `~/labs`; writes persist as a localStorage overlay |
| spend | `05_spend.js` | one ledger for every app that "thinks", with the real $100.00 daily cap (UTC) |
| commands | `06_commands.js` | the command registry the terminal runs; apps add their own CLIs |
| r3d | `07_r3d.js` | the 3D renderer: convex primitives, outward normals from the solid's centroid, back-face culling, painter's sort, projected shadows, the 0.5 m grid |
| wm | `08_wm.js` | brickland: dwindle, master and monocle layouts, nine workspaces, floating windows, fullscreen, drag-to-swap, per-window timers |
| bar | `10_bar.js` | ridgebar: workspaces, clock, spend, CI, frame-time graph, Bricky |
| notify | `09_notify.js` | notifications, the on-screen display, the fail-on-purpose crash panel |
| overlays | `11_overlays.js` | the launcher, the Labs menu, the key sheet, the notification list |
| session | `12_session.js` | Bricky, the lock screen, the screensaver, idle, the boot loader and boot log, shut down |
| wallpaper | `13_wallpaper.js` | six wallpapers drawn in code at screen size |
| keys | `14_keys.js` | global bindings. SUPER is Alt, because browsers keep the real Super key |

### Choices

- **DOM for the shell, canvas for pictures.** Text stays sharp at any size and selectable; houses, graphs and wallpapers are canvases.
- **One contract, then parallel apps.** `API.md` was written before any app. Six agents then built twelve apps against it in separate files, each with its own build output and browser port, so no two touched the same bytes.
- **Timers belong to windows.** `win.every`, `win.after`, `win.sleep` and `win.raf` stop when the window closes, and `win.raf` pauses while the window is on another workspace. `?speed=10` scales every one of them, so slow states are reachable in tests.
- **Faults are contained.** An app that throws in `mount` gets a crash panel in its own window; a throwing animation callback is removed; a throwing event handler is logged. The rest of the OS keeps running.
- **Spend is shared.** Every app charges the same ledger, so the daily cap is a real limit: run enough Composer jobs, or one agent swarm at max effort, and everything that thinks is refused until "tomorrow".
- **Painter's algorithm, not a z-buffer.** Houses are convex boxes and prisms; sorting faces by depth is correct for nearly every view and keeps the renderer at a few hundred lines.

-----

## Verification

Visual. `tools/shot.mjs` opens the page in headless Chrome, presses keys, clicks, waits on state, and saves screenshots; each screenshot was read as an image. Code that draws cannot be reviewed by reading it.
