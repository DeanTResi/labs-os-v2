// A minimal Chrome DevTools Protocol client for tools/shot.mjs. No dependencies; Node 22+ (global WebSocket).
// Chrome is found from $CHROME_PATH, then the usual macOS and Linux locations.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH to the Chrome or Chromium binary.');
  return found;
}

async function version(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) }); return r.ok; } catch { return false; }
}

export async function launch({ port = 9301, headless = true } = {}) {
  if (await version(port)) throw new Error(`Port ${port} already has a Chrome debugger on it. Pick another --port.`);
  const profile = mkdtempSync(path.join(tmpdir(), 'labsos-chrome-'));
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'];
  if (headless) args.unshift('--headless=new');
  const proc = spawn(chromePath(), args, { stdio: 'ignore' });
  const deadline = Date.now() + 15000;
  while (!(await version(port))) {
    if (Date.now() > deadline) { proc.kill('SIGKILL'); throw new Error(`Chrome did not open port ${port}`); }
    await sleep(100);
  }
  let target = null;
  while (!target && Date.now() < deadline) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    if (!target) await sleep(100);
  }
  if (!target) throw new Error('Chrome opened no page');
  const s = await connect(target.webSocketDebuggerUrl);
  s.close = async () => {
    try { s.ws.close(); } catch { /* already closed */ }
    if (proc.exitCode === null) {
      const gone = new Promise((r) => proc.once('exit', r));
      proc.kill('SIGTERM');
      const hard = setTimeout(() => proc.kill('SIGKILL'), 3000);
      await gone; clearTimeout(hard);
    }
    rmSync(profile, { recursive: true, force: true });
  };
  return s;
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('CDP connect failed')), { once: true }); });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  const log = { console: [], exceptions: [] };
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
      return;
    }
    for (const fn of listeners.get(msg.method) || []) fn(msg.params);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
  const once = (method, timeout = 30000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), timeout);
    on(method, (p) => { clearTimeout(t); resolve(p); });
  });
  await Promise.all([send('Page.enable'), send('Runtime.enable')]);
  on('Runtime.consoleAPICalled', (p) => log.console.push({ type: p.type, text: p.args.map((a) => a.value ?? a.description ?? a.type).join(' ') }));
  on('Runtime.exceptionThrown', (p) => log.exceptions.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));

  const s = {
    ws, send, on, log,
    setViewport: ({ width = 1280, height = 800, scale = 1 } = {}) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }),
    async goto(url) { const loaded = once('Page.loadEventFired'); await send('Page.navigate', { url }); await loaded; },
    async evaluate(expression) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', { expression: `(() => (${expression}))()`, returnByValue: true, awaitPromise: true });
      if (exceptionDetails) throw new Error(`evaluate failed: ${exceptionDetails.exception?.description || exceptionDetails.text}`);
      return result.value;
    },
    async waitFor(expression, { timeout = 10000 } = {}) {
      const end = Date.now() + timeout; let last = null;
      while (Date.now() < end) {
        try { if (await s.evaluate(`!!(${expression})`)) return true; } catch (e) { last = e.message; }
        await sleep(100);
      }
      throw new Error(`waitFor timed out: ${expression}${last ? ` (${last})` : ''}`);
    },
    // Freeze CSS animation and transitions, wait for fonts and two frames, so screenshots are stable.
    async settle() {
      await send('Runtime.evaluate', { expression: "(() => { const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.appendChild(st); })()" });
      await s.evaluate('document.fonts.ready.then(() => true)');
      await send('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true });
    },
    async screenshot({ path: out }) { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(out, Buffer.from(data, 'base64')); return out; },
  };
  return s;
}
