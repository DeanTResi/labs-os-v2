#!/usr/bin/env node
// Drive index.html in headless Chrome and take screenshots, through tools/cdp.mjs (no dependencies).
//
//   node tools/shot.mjs [--file build/x.html] [--port 9301] [--w 1440] [--h 900] [--scale 1] [--headed] "<query>" step step ...
//
// <query> is appended to index.html, e.g. "boot=0&apps=composer&bricky=0".
// Steps run in order:
//   wait:<js expr>      poll until truthy (10 s)
//   js:<js expr>        evaluate, print the result
//   ms:<n>              wait n milliseconds (only for animations that have no state to wait on)
//   key:<combo>         press keys, e.g. key:Alt+Space, key:Enter, key:Alt+Shift+T
//   type:<text>         type text into whatever has focus
//   click:<x>,<y>       click at CSS pixel coordinates
//   clicksel:<selector> click the centre of an element
//   shot:<path.png>     screenshot the viewport
// Page errors and failed requests print at the end. Exit code 1 when the page threw.
import { launch } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); if (i < 0) return def; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (name) => { const i = argv.indexOf(`--${name}`); if (i < 0) return false; argv.splice(i, 1); return true; };
const port = Number(opt('port', 9301));
const width = Number(opt('w', 1440)); const height = Number(opt('h', 900)); const scale = Number(opt('scale', 1));
const headed = flag('headed');
const file = opt('file', 'index.html');
const [query = 'boot=0', ...steps] = argv;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = `file://${path.resolve(root, file)}?${query}`;

const KEYS = {
  Enter: [13, 'Enter', '\r'], Escape: [27, 'Escape'], Space: [32, 'Space', ' '], Tab: [9, 'Tab'], Backspace: [8, 'Backspace'],
  ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'], Slash: [191, 'Slash', '/'],
};
function keyInfo(k, shift = false) {
  if (KEYS[k]) return { code: KEYS[k][1], keyCode: KEYS[k][0], key: k === 'Space' ? ' ' : k === 'Slash' ? '/' : k, text: KEYS[k][2] };
  if (/^[0-9]$/.test(k)) return { code: 'Digit' + k, keyCode: 48 + Number(k), key: k, text: k };
  if (/^[a-zA-Z]$/.test(k)) { const ch = shift || k !== k.toLowerCase() ? k.toUpperCase() : k.toLowerCase(); return { code: 'Key' + k.toUpperCase(), keyCode: k.toUpperCase().charCodeAt(0), key: ch, text: ch, upper: ch !== k.toLowerCase() }; }
  throw new Error('unknown key ' + k);
}

const s = await launch({ port, headless: !headed });
let failed = false;
try {
  await s.setViewport({ width, height, scale });
  await s.goto(url);
  await s.waitFor('window.OS && OS.ready', { timeout: 15000 });
  for (const step of steps) {
    const i = step.indexOf(':'); const verb = step.slice(0, i); const arg = step.slice(i + 1);
    if (verb === 'wait') await s.waitFor(arg, { timeout: 10000 });
    else if (verb === 'js') console.log('js:', JSON.stringify(await s.evaluate(arg)));
    else if (verb === 'ms') await new Promise((r) => setTimeout(r, Number(arg)));
    else if (verb === 'type') await s.send('Input.insertText', { text: arg });
    else if (verb === 'click' || verb === 'clicksel') {
      let x; let y;
      if (verb === 'click') [x, y] = arg.split(',').map(Number);
      else ({ x, y } = await s.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(arg)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`));
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await s.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    } else if (verb === 'key') {
      const parts = arg.split('+'); const main = parts.pop();
      let mods = (parts.includes('Alt') ? 1 : 0) | (parts.includes('Ctrl') ? 2 : 0) | (parts.includes('Meta') ? 4 : 0) | (parts.includes('Shift') ? 8 : 0);
      const k = keyInfo(main, !!(mods & 8));
      if (k.upper) mods |= 8;
      const base = { modifiers: mods, code: k.code, key: k.key, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode };
      await s.send('Input.dispatchKeyEvent', { type: mods & ~8 ? 'rawKeyDown' : 'keyDown', ...base, text: mods & ~8 ? undefined : k.text });
      await s.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    } else if (verb === 'shot') {
      await s.settle();
      console.log('shot:', await s.screenshot({ path: arg }));
    } else throw new Error('unknown step ' + step);
  }
} catch (err) {
  console.log('STEP FAILED:', err.message);
  failed = true;
} finally {
  const bad = [...s.log.exceptions, ...s.log.console.filter((c) => c.type === 'error').map((c) => c.text)];
  if (bad.length) { console.log('page errors:', JSON.stringify(bad, null, 2)); failed = true; }
  const warns = s.log.console.filter((c) => c.type === 'warning').map((c) => c.text);
  if (warns.length) console.log('page warnings:', JSON.stringify(warns, null, 2));
  if (!headed) await s.close();
}
process.exit(failed ? 1 : 0);
