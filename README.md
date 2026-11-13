# Labs OS 2 (Composed)

The successor to [Labs OS 3.1](https://github.com/DeanTResi/labs-os). A tiling desktop in one HTML file, for people who compose houses in twenty-two stages and have a daily spend cap.

**[Open it](https://deantresi.github.io/labs-os-v2/)**, or open `index.html` from a clone. No network, no build step, no install.

![Labs OS 2](screenshots/desktop.png)

-----

## Getting about

SUPER is **Alt** (Option on a Mac). Browsers keep the real Super key for themselves.

| Keys | |
|---|---|
| `Alt+Space` or `Ctrl+K` | launcher. Start with `>` to run a shell command |
| `Alt+Enter` | terminal |
| `Alt+Shift+Space` | the Labs menu: themes, wallpapers, gaps, lock, shut down |
| `Alt+1..9`, `Alt+Shift+1..9` | go to a workspace, move a window to one |
| `Alt+H J K L` or arrows | move focus. Add Shift to swap windows |
| `Alt+W` `Alt+F` `Alt+T` `Alt+M` | close, fullscreen, float, cycle layout |
| `Alt+/` | every key |

Drag a title bar onto another window to swap them.

-----

## What is in it

APPS_TABLE

-----

## Reading it

| File | |
|---|---|
| `index.html` | the build. This is the one to open |
| `API.md` | the app contract every app was written against |
| `BRIEF.md` | the tone rules, the facts the jokes are made of, and each app's spec |
| `DESIGN.md` | architecture and the choices behind it |
| `retro-notes.md` | how it was built, and what went wrong |
| `tools/gristle-comedy.md` | the reviewer that reviewed it |

## Building

```bash
python3 tools/build.py                 # src/ -> index.html, fails on syntax errors and contract breaches
python3 tools/build_assets.py          # icons, Bricky and the 3.1 build -> src/kernel/00_assets.js
node tools/shot.mjs "boot=0&apps=composer" ms:500 shot:out.png   # screenshot it in headless Chrome
```

URL options: `?boot=0` skips the boot, `?apps=composer,terminal` picks the first windows, `?theme=magnolia`, `?speed=10` runs every timer ten times faster, `?bricky=0` keeps Bricky quiet.

## Credits

Icons from the Resi icon set. Bricky from Labs OS 3.1, still 32 by 32, by choice. Every company, product and address in the copy is invented.
