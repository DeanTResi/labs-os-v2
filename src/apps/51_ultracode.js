// ultracode: Agentic Factory 2. Agents spawn agents, reviewers spawn reviewers of reviewers, and the shared ledger pays
// for every one of them each tick. It ends at Stop, or when the daily cap refuses the next charge.
(() => {
  const { h } = OS;

  const SIZES = [
    { key: 'small', limit: 4, impl: 2, per: 0.0040 },
    { key: 'medium', limit: 10, impl: 3, per: 0.0045 },
    { key: 'large', limit: 25, impl: 5, per: 0.0050 },
    { key: 'ultra', limit: 100, impl: 8, per: 0.0055 },
  ];
  const guideline = (s) => `${s.key}: keep workflows under ${s.limit} agents`;
  const TICK = 600;
  const MAX_NODES = 1400;
  const FINDINGS = ['a comment restates the code', 'one more test, please', 'a magic number', 'rename one variable back', 'the spec description has a typo', 'the design system check is out of date', '"load-bearing" in a comment', 'a merge commit; Labs merges by rebase', 'an unused import from the last fix'];
  const SUBTASKS = ['the change itself', 'the tests for it', 'the Lookbook preview', 'the analytics event', 'a feature flag', 'a note in agent_docs/', 'the design-system card', 'the follow-ups from review'];
  const KINDS = { spec: 'spec', craft: 'craft', production: 'prod', gristle: 'gristle', design: 'design', tone: 'tone', bench: 'bench' };

  const CSS = `
.uc { position: absolute; inset: 0; display: grid; grid-template-rows: auto 1fr; container-type: inline-size; background: var(--surface); }
.uc-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--border); background: var(--surface2); min-width: 0; }
.uc-brand { font-weight: 800; color: var(--accent); white-space: nowrap; letter-spacing: .02em; }
.uc-brand small { color: var(--faint); font-weight: 400; margin-left: 4px; }
.uc-top .ui-input { flex: 1 1 auto; min-width: 80px; }
.uc-top .ui-select { flex: none; }
.uc-main { display: grid; grid-template-columns: minmax(0, 1fr) 320px; min-height: 0; }
.uc-graph { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: var(--bg); }
.uc-graph canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.uc-hud { position: absolute; left: 12px; top: 10px; right: 12px; pointer-events: none; display: flex; justify-content: space-between; gap: 12px; }
.uc-hud .k { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--faint); }
.uc-hud .p { color: var(--fg); font-weight: 700; max-width: 52ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uc-hud .r { text-align: right; flex: none; }
.uc-hud .r b { font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; color: var(--fg); }
.uc-legend { position: absolute; left: 12px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--muted); pointer-events: none; }
.uc-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: 0; }
.uc-side { border-left: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.uc-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border-bottom: 1px solid var(--border); }
.uc-stat { background: var(--surface); padding: 7px 10px 8px; min-width: 0; }
.uc-stat .l { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
.uc-stat b { display: block; font-size: 21px; line-height: 1.25; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uc-stat .s { font-size: 11px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uc-stat.bad b { color: var(--bad); }
.uc-guide { padding: 8px 10px 10px; border-bottom: 1px solid var(--border); }
.uc-guide .t { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--muted); }
.uc-guide .t span:last-child { white-space: nowrap; }
.uc-guide .bar { position: relative; height: 8px; margin-top: 6px; border-radius: 4px; background: var(--bg); border: 1px solid var(--border); overflow: hidden; }
.uc-guide .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--good); transition: width .3s, background .3s; }
.uc-guide .bar u { position: absolute; top: -1px; bottom: -1px; width: 2px; background: var(--fg); opacity: .6; text-decoration: none; }
.uc-guide.over .bar i { background: repeating-linear-gradient(135deg, var(--bad) 0 6px, color-mix(in srgb, var(--bad) 70%, var(--bg)) 6px 12px); }
.uc-guide .n { margin-top: 5px; font-size: 11px; color: var(--faint); }
.uc-guide.over .n { color: var(--bad); }
.uc-loghd { display: flex; justify-content: space-between; padding: 6px 10px 2px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.uc-log { flex: 1 1 auto; min-height: 60px; overflow: auto; padding: 2px 10px 8px; font-size: 11px; line-height: 1.5; }
.uc-log div { color: var(--muted); }
.uc-log em { font-style: normal; color: var(--faint); margin-right: 6px; }
.uc-log b { font-weight: 700; }
.uc-log .bad { color: var(--bad); } .uc-log .good { color: var(--good); } .uc-log .warn { color: var(--warn); }
.uc-report { position: absolute; inset: 0; z-index: 4; display: flex; align-items: center; justify-content: center; padding: 16px; background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(4px); animation: uc-in .25s ease-out; }
.uc-card { width: min(720px, 100%); max-height: 100%; display: flex; flex-direction: column; border: 2px solid transparent; border-radius: var(--radius); background: linear-gradient(var(--surface), var(--surface)) padding-box, linear-gradient(135deg, var(--accent), var(--accent2)) border-box; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
.uc-card .hd { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); font-weight: 800; }
.uc-card .hd span { margin-left: auto; font-weight: 400; font-size: 11px; color: var(--faint); }
.uc-card pre { margin: 0; padding: 12px 14px; overflow: auto; font: inherit; font-size: 12px; line-height: 1.55; white-space: pre-wrap; color: var(--fg); }
.uc-card pre .h1 { color: var(--accent); font-weight: 800; } .uc-card pre .h2 { color: var(--accent2); font-weight: 700; } .uc-card pre .h3 { color: var(--warn); font-weight: 700; } .uc-card pre .dim { color: var(--muted); }
.uc-card .ft { display: flex; justify-content: flex-end; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border); }
@keyframes uc-in { from { opacity: 0; } }
@container (max-width: 820px) {
  .uc-main { grid-template-columns: minmax(0, 1fr) 250px; }
  .uc-stat { padding: 5px 8px 6px; }
  .uc-stat .l { font-size: 9px; letter-spacing: .04em; }
  .uc-stat b { font-size: 17px; }
  .uc-guide .t { font-size: 10px; }
  .uc-legend { display: none; }
}
@container (max-width: 600px) {
  .uc-main { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 3fr) minmax(0, 2fr); }
  .uc-side { border-left: 0; border-top: 1px solid var(--border); overflow: hidden; }
  .uc-guide { padding: 6px 10px 7px; }
  .uc-guide .n { display: none; }
  .uc-stats { grid-template-columns: repeat(3, 1fr); }
  .uc-log { min-height: 48px; }
  .uc-hud .r b { font-size: 20px; }
}
@container (max-width: 680px) {
  .uc-brand { display: none; }
  .uc-top { gap: 6px; padding: 6px 8px; }
  .uc-top .ui-input { flex: 1 1 100%; }
  .uc-top .ui-select { flex: 1 1 0; min-width: 0; }
}
@container (max-width: 560px) {
  .uc-stat .s { display: none; }
}
`;

  const fmt = (n) => Math.round(n).toLocaleString('en-GB');
  const many = (n, one, more = one + 's') => `${fmt(n)} ${n === 1 ? one : more}`;
  const mmss = (ticks) => { const s = Math.floor(ticks * TICK / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  registerApp({
    id: 'ultracode', title: 'ultracode', icon: 'org-chart',
    desc: 'Agentic Factory 2: agents that spawn agents, reviewers that review reviewers',
    keywords: ['agents', 'swarm', 'factory', 'workflow', 'reviewers', 'multi-agent', 'orchestrator'],
    size: [1100, 720],
    mount(win) {
      if (!document.getElementById('ultracode-css')) document.head.append(h('style', { id: 'ultracode-css' }, CSS));
      const st = win.state;
      st.offs = [];

      // ---------- DOM ----------
      const input = h('input', { class: 'ui-input', value: 'Make the price bar 4px higher', placeholder: 'What should the agents build?', 'aria-label': 'What should the agents build?', spellcheck: false });
      const sizeSel = h('select', { class: 'ui-select', 'aria-label': 'Workflow size' }, SIZES.map((s) => h('option', { value: s.key, selected: s.key === 'medium' }, guideline(s))));
      const runBtn = h('button', { class: 'ui-btn primary', onclick: () => start() }, '▶ Run');
      const stopBtn = h('button', { class: 'ui-btn danger', disabled: true, onclick: () => stop() }, '■ Stop');
      const topBar = h('div', { class: 'uc-top' }, h('span', { class: 'uc-brand' }, 'ultracode', h('small', null, 'Agentic Factory 2')), input, sizeSel, runBtn, stopBtn);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); start(); } });

      const canvas = h('canvas', { 'aria-label': 'Live graph of agents spawning agents' });
      const hudPrompt = h('div', { class: 'p' }, 'Nothing running');
      const hudTime = h('div', { class: 'k' }, 'Agentic Factory 2');
      const hudCount = h('b', null, '0');
      const hudCountSub = h('div', { class: 'k' }, 'agents');
      const hud = h('div', { class: 'uc-hud' }, h('div', { style: { minWidth: 0 } }, hudTime, hudPrompt), h('div', { class: 'r' }, hudCount, hudCountSub));
      const legendItems = [['thinking', 'info'], ['reviewing', 'accent'], ['waiting', 'warn'], ['approved', 'good'], ['changes', 'bad'], ['done', 'faint']];
      const legend = h('div', { class: 'uc-legend' }, legendItems.map(([t, c]) => h('span', null, h('i', { style: { background: `var(--${c})` } }), t)));
      const graphEl = h('div', { class: 'uc-graph' }, canvas, hud, legend);

      const stat = (label, cls = '') => {
        const b = h('b', null, '0'); const s = h('div', { class: 's' }, ' ');
        return { el: h('div', { class: 'uc-stat ' + cls }, h('div', { class: 'l' }, label), b, s), b, s };
      };
      const S = {
        agents: stat('agents'), opened: stat('PRs opened'), approved: stat('PRs approved'),
        lines: stat('lines changed'), shipped: stat('features shipped'), spend: stat('spend'),
      };
      const guideText = h('span', null, guideline(SIZES[1]));
      const guideCount = h('span', null, '0 / 10');
      const guideBar = h('i', { style: { width: '0%' } });
      const guideMark = h('u', { style: { left: '100%' } });
      const guideNote = h('div', { class: 'n' }, 'The guideline is shown to every agent.');
      const guide = h('div', { class: 'uc-guide' }, h('div', { class: 't' }, guideText, guideCount), h('div', { class: 'bar' }, guideBar, guideMark), guideNote);
      const logEl = h('div', { class: 'uc-log', role: 'log', 'aria-live': 'off' });
      const logCount = h('span', null, '');
      const side = h('div', { class: 'uc-side' },
        h('div', { class: 'uc-stats' }, Object.values(S).map((x) => x.el)), guide,
        h('div', { class: 'uc-loghd' }, h('span', null, 'log'), logCount), logEl);
      const root = h('div', { class: 'uc' }, topBar, h('div', { class: 'uc-main' }, graphEl, side));
      win.body.style.overflow = 'hidden';
      win.body.append(root);
      S.shipped.s.textContent = 'pending review';
      S.spend.b.textContent = OS.usd(0);

      // ---------- the run ----------
      let run = null;
      const rnd = OS.rng((Date.now() ^ 0xa11ce) >>> 0);
      const R = () => rnd();

      function log(html, cls = '') {
        if (!run) return;
        const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 24;
        logEl.append(h('div', { class: cls, html: `<em>${mmss(run.t)}</em>${html}` }));
        while (logEl.children.length > 220) logEl.firstChild.remove();
        run.logged++;
        logCount.textContent = `${fmt(run.logged)} lines`;
        if (atBottom) logEl.scrollTop = logEl.scrollHeight;
      }
      const nm = (a) => `<b style="color:var(--${roleColour(a)})">${OS.esc(a.name)}</b>`;
      const roleColour = (a) => ({ orchestrator: 'accent', planner: 'accent2', architect: 'accent2', impl: 'info', reviewer: 'accent', meta: 'accent2', bench: 'good' }[a.role] || 'fg');

      function spawn(up, role, kind, extra = {}) {
        run.count++;
        if (role === 'impl') run.implN++;
        const num = (run.seq[kind || role] = (run.seq[kind || role] || 0) + 1);
        const label = role === 'orchestrator' ? 'ultracode' : role === 'planner' ? 'planner' : role === 'architect' ? 'architect'
          : role === 'impl' ? `impl-${num}` : role === 'meta' ? `meta-${num}` : `${KINDS[kind] || kind}-${num}`;
        if (run.nodes.length >= MAX_NODES && !archive()) { run.hidden++; run.hiddenActive++; return null; }
        const a = {
          id: run.nodes.length, parent: up, kids: [], depth: up ? up.depth + 1 : 0, role, kind, name: label, state: 'thinking',
          busy: 1 + Math.floor(R() * 3), born: performance.now(), ca: up ? up.ca : 0, cr: up ? up.cr : 0, ta: 0, tr: 0, w: 1, ...extra,
        };
        if (up) up.kids.push(a);
        run.nodes.push(a);
        run.layoutDirty = true;
        return a;
      }
      const caution = () => 1 + run.t / 85;
      // The graph has a cap too: finished subtrees leave it, oldest first, so new agents can still be drawn.
      function archive() {
        const memo = new Map();
        const finished = (a) => { if (memo.has(a)) return memo.get(a); const v = a.state === 'done' && a.kids.every(finished); memo.set(a, v); return v; };
        const gone = new Set();
        for (const a of run.nodes) {
          if (gone.size >= 420) break;
          if (a.depth < 3 || gone.has(a) || !finished(a)) continue;
          const stack = [a];
          while (stack.length) { const x = stack.pop(); if (!gone.has(x)) { gone.add(x); stack.push(...x.kids); } }
        }
        if (!gone.size) return 0;
        run.nodes = run.nodes.filter((x) => !gone.has(x));
        for (const x of run.nodes) if (x.kids.length) x.kids = x.kids.filter((k) => !gone.has(k));
        run.archived += gone.size; run.layoutDirty = true;
        log(run.archived === gone.size ? `Archived ${fmt(gone.size)} finished agents so the graph can keep drawing. The graph has a cap too.` : `Archived ${fmt(gone.size)} more finished agents.`);
        return gone.size;
      }
      const active = () => run.nodes.filter((a) => a.state !== 'done').length + run.hiddenActive;

      function start() {
        if (run && (run.phase === 'running' || run.phase === 'stopping')) return;
        win.body.querySelector('.uc-report')?.remove();
        win.el.querySelectorAll('.ui-crash').forEach((n) => n.remove());
        const size = SIZES.find((s) => s.key === sizeSel.value) || SIZES[1];
        const prompt = input.value.trim() || 'Something, quickly';
        input.value = prompt;
        logEl.innerHTML = '';
        run = {
          phase: 'running', t: 0, size, prompt, short: prompt.length > 44 ? prompt.slice(0, 43) + '…' : prompt,
          nodes: [], seq: {}, count: 0, implN: 0, hidden: 0, hiddenActive: 0, prs: [], metaReviews: [],
          opened: 0, approvedN: 0, archived: 0, add: 0, del: 0, craft: 0, spend: 0, logged: 0, layoutDirty: true, exceeded: 0, rot: 0, spendHist: [], maxDepth: 1,
        };
        st.run = run;
        const o = spawn(null, 'orchestrator');
        o.state = 'thinking'; o.busy = 1;
        input.disabled = true; sizeSel.disabled = true; runBtn.disabled = true; stopBtn.disabled = false;
        guideText.textContent = guideline(size);
        hudPrompt.textContent = `“${prompt}”`;
        log(`${nm(o)} read the prompt and the guideline: <b>${guideline(size)}</b>.`);
        if (!charge(0.05, `ultracode: read the prompt "${run.short}"`)) return;
        paintStats();
      }

      function charge(usd, label) {
        const r = OS.spend.add(Math.round(usd * 100) / 100, label, 'ultracode');
        if (r.ok) { run.spend += Math.round(usd * 100) / 100; return true; }
        capped(r.message);
        return false;
      }

      function capped(message) {
        if (!run || run.phase === 'ended') return;
        run.phase = 'ended';
        const n = active();
        for (const a of run.nodes) if (a.state !== 'done') { a.state = 'done'; a.cut = true; }
        run.hiddenActive = 0;
        log(`<span class="bad">The daily cap refused the next charge. ${fmt(n)} agents stopped mid-thought.</span>`);
        controlsIdle();
        paintStats();
        OS.crash(win, {
          title: 'Agentic Factory 2 stopped at the daily cap', code: 'UC-0x64 DAILY_CAP_REACHED', icon: 'coins-outline',
          lines: [message, `${fmt(n)} agents were thinking. ${run.opened} PRs open, ${run.approvedN} approved, 0 merged. Features shipped: 0.`],
          actions: [
            { label: 'Read the final report', primary: true, run: () => report('the daily cap') },
            { label: 'Wait until tomorrow', run: () => { OS.spend.tomorrow(); OS.osd('It is tomorrow. The cap has reset. Nothing else has.'); } },
            { label: 'Close app', run: () => win.close() },
          ],
        });
      }

      function stop() {
        if (!run || run.phase !== 'running') return;
        run.phase = 'stopping'; run.stopAt = run.t;
        stopBtn.disabled = true;
        log(`<span class="warn">Stop requested. ${fmt(active())} agents are writing handover notes.</span>`);
        const notes = Math.min(4, active() * 0.002);
        if (notes >= 0.01) charge(notes, `ultracode: ${fmt(active())} handover notes`);
      }
      function controlsIdle() { input.disabled = false; sizeSel.disabled = false; runBtn.disabled = false; stopBtn.disabled = true; runBtn.textContent = '▶ Run again'; }

      // ---------- agent behaviour, one tick at a time ----------
      function prTitle() {
        if (!run.prs.length) return { title: run.short, short: run.short };
        const tail = OS.pick(['craft cleanup', 'address review', 'record the design system sync', 'follow-ups from the review of the review', 'one more test', 'craft cleanup', 'revert the craft cleanup'], R);
        return { title: `${run.short}: ${tail}`, short: tail };
      }
      function openPr(impl) {
        const add = 40 + Math.floor(R() * 360); const del = Math.floor(R() * add * 0.7);
        const pr = { n: run.prs.length + 1, ...prTitle(), by: impl.name, reviews: [], approvals: 0, changes: 0, approved: false };
        run.prs.push(pr); run.opened++; run.add += add; run.del += del;
        if (pr.short === 'craft cleanup') run.craft += add + del;
        impl.pr = pr; impl.state = 'waiting'; impl.busy = 99;
        log(`${nm(impl)} opened <b>PR #${pr.n}</b> “${OS.esc(pr.title)}” <span class="good">+${add}</span> <span class="bad">−${del}</span>.`);
        const kinds = ['spec', 'craft', 'production'];
        if (R() < 0.3) kinds.push('gristle');
        if (R() < 0.22) kinds.push('design');
        for (const k of kinds) { const r = spawn(impl, 'reviewer', k, { pr, impl }); if (r) r.busy = 2 + Math.floor(R() * 4); }
      }
      function act(a) {
        switch (a.role) {
          case 'orchestrator': {
            if (!a.started) { a.started = true; const p = spawn(a, 'planner'); if (p) p.busy = 2; log(`${nm(a)} spawned a planner.`); a.state = 'waiting'; a.busy = 10; return; }
            const r = R();
            if (r < 0.4) { const b = spawn(a, 'bench', 'bench'); if (b) { b.busy = 4; log(`${nm(a)} asked ${nm(b)} for an end-to-end benchmark run.`); } } else if (r < 0.7) {
              log(`${nm(a)}: ${fmt(active())} agents working. Estimated cost to finish: <b>$4.00</b>. The estimate has not changed since the start.`);
            } else { const m = spawn(a, 'meta', 'meta', { of: a }); if (m) { m.busy = 3; log(`${nm(a)} spawned ${nm(m)} to review the orchestration.`); } }
            a.busy = 8 + Math.floor(R() * 6); return;
          }
          case 'planner': {
            if (!a.arch) { a.arch = true; const ar = spawn(a, 'architect'); if (ar) ar.busy = 3; log(`${nm(a)} spawned an architect before reading the code.`); a.busy = 2; return; }
            const want = run.size.impl + Math.floor(run.t / 16);
            if (run.implN < want) {
              const sub = SUBTASKS[run.implN % SUBTASKS.length];
              const im = spawn(a, 'impl', 'impl', { sub });
              if (im) { im.busy = 2 + Math.floor(R() * 3); log(`${nm(a)} split the work. ${nm(im)} takes ${OS.esc(sub)}.`); }
              a.busy = 2 + Math.floor(R() * 3); return;
            }
            a.state = 'waiting'; a.busy = 4; return;
          }
          case 'architect': {
            if (!a.reviewed) {
              a.reviewed = true;
              const m = spawn(a, 'meta', 'meta', { of: a });
              log(`${nm(a)} drew three boxes and an arrow.${m ? ` ${nm(m)} will review the arrow.` : ''}`);
              if (m) m.busy = 3;
              a.state = 'waiting'; a.busy = 6; return;
            }
            a.state = 'done'; return;
          }
          case 'impl': {
            if (!a.pr) { openPr(a); return; }
            if (a.fixing) {
              a.fixing = false;
              const add = 4 + Math.floor(R() * 90); const del = 4 + Math.floor(R() * 90);
              run.add += add; run.del += del; run.craft += add + del;
              const kind = a.fixKind || 'craft';
              log(`${nm(a)} pushed “craft cleanup” to PR #${a.pr.n} <span class="good">+${add}</span> <span class="bad">−${del}</span>.`);
              const rr = spawn(a, 'reviewer', kind, { pr: a.pr, impl: a }); if (rr) rr.busy = 2 + Math.floor(R() * 3);
              a.state = 'waiting'; a.busy = 99; return;
            }
            if (a.pr.approvals >= 3 && !a.pr.approved) {
              a.pr.approved = true; run.approvedN++;
              log(`<span class="good">PR #${a.pr.n} has ${a.pr.approvals} approvals.</span> Merging needs a review of the approvals.`);
              const m = spawn(a, 'meta', 'meta', { of: a, approvals: true }); if (m) m.busy = 3;
              // a follow-up PR, because there always is one
              if (R() < 0.75) { a.pr = null; a.state = 'thinking'; a.busy = 2 + Math.floor(R() * 3); return; }
              a.state = 'done'; return;
            }
            a.state = 'waiting'; a.busy = 99; return;
          }
          case 'reviewer': {
            const pr = a.pr; const impl = a.impl;
            if (!pr) {
              log(`${nm(a)} reviewed the tone: ${OS.pick(['polite, but firm', 'firm, but polite', 'too many semicolons', 'acceptable, pending a second opinion'], R)}.`);
              run.metaReviews.push({ by: a.name, of: a.parent ? a.parent.name : 'nobody', pr: null });
              a.state = 'done'; return;
            }
            const approve = a.kind === 'gristle' ? R() < 0.25 : R() < 0.5;
            if (a.kind === 'design') {
              log(`${nm(a)} opened round 6 of the design review on PR #${pr.n}. Round 7 is booked.`);
            }
            pr.reviews.push({ by: a.name, kind: a.kind, verdict: approve ? 'approved' : 'changes' });
            if (approve) {
              pr.approvals++;
              a.state = 'approved';
              const m = R() < Math.min(0.95, 0.62 * caution()) ? spawn(a, 'meta', 'meta', { of: a }) : null;
              if (m) { m.busy = 2 + Math.floor(R() * 3); a.waitKids = true; }
              log(`${nm(a)} <span class="good">approved</span> PR #${pr.n}.${m ? ` ${nm(m)} will review the approval.` : ''}`);
              if (impl && impl.state === 'waiting' && pr.approvals >= 3 && !pr.approved && impl.pr === pr) impl.busy = 1;
            } else {
              pr.changes++;
              a.state = 'changes';
              const f = OS.pick(FINDINGS, R);
              const m = R() < Math.min(0.9, 0.35 * caution()) ? spawn(a, 'meta', 'meta', { of: a }) : null;
              if (m) { m.busy = 2 + Math.floor(R() * 3); a.waitKids = true; }
              log(`${nm(a)} <span class="bad">requested changes</span> on PR #${pr.n}: ${OS.esc(f)}.${m ? ` ${nm(m)} will check the review was fair.` : ''}`);
              if (impl && impl.pr === pr && impl.state !== 'done') { impl.fixing = true; impl.fixKind = a.kind === 'design' || a.kind === 'tone' ? 'craft' : a.kind; impl.state = 'thinking'; impl.busy = 2 + Math.floor(R() * 3); }
            }
            a.doneAt = run.t + 3;
            return;
          }
          case 'meta': {
            const of = a.of; const r = R();
            const depthOk = a.depth < 11;
            if (a.approvals) {
              log(`${nm(a)} reviewed the approvals on PR #${of.pr ? of.pr.n : '?'}. Merging is blocked on one more review.`);
              const m = depthOk ? spawn(a, 'meta', 'meta', { of: a }) : null; if (m) m.busy = 3;
            } else if (r < 0.42) {
              const m = depthOk && R() < Math.min(0.92, 0.55 * caution()) ? spawn(a, 'meta', 'meta', { of: a }) : null;
              const m2 = m && caution() > 2.2 && R() < 0.35 ? spawn(a, 'meta', 'meta', { of: a }) : null;
              if (m) m.busy = 2 + Math.floor(R() * 3);
              if (m2) m2.busy = 3 + Math.floor(R() * 3);
              log(`${nm(a)} reviewed ${nm(of)}'s review: fine.${m2 ? ` ${nm(m)} and ${nm(m2)} will each review half of it.` : m ? ` ${nm(m)} will make sure.` : ''}`);
              if (m) { a.state = 'waiting'; a.waitKids = true; run.metaReviews.push({ by: a.name, of: of.name, pr: of.pr ? of.pr.n : null }); return; }
            } else if (r < 0.74 && of.pr) {
              const k = OS.pick(['spec', 'craft', 'production', 'gristle'], R);
              const rr = spawn(a, 'reviewer', k, { pr: of.pr, impl: of.impl }); if (rr) rr.busy = 2 + Math.floor(R() * 3);
              log(`${nm(a)} found ${nm(of)}'s review too approving.${rr ? ` ${nm(rr)} will review PR #${of.pr.n} again.` : ''}`);
            } else {
              const t = depthOk ? spawn(a, 'reviewer', 'tone', { pr: of.pr || null, impl: of.impl }) : null;
              if (t) { t.busy = 3; t.toneOnly = true; }
              log(`${nm(a)} questioned the tone of ${nm(of)}.${t ? ` ${nm(t)} will review the tone.` : ''}`);
            }
            run.metaReviews.push({ by: a.name, of: of.name, pr: of.pr ? of.pr.n : null });
            a.state = 'done'; return;
          }
          case 'bench': {
            const pr = run.prs[run.prs.length - 1];
            log(`${nm(a)}: end-to-end run${pr ? ` on PR #${pr.n}` : ''}: <span class="good">✓ not worse than main</span>.`);
            const m = spawn(a, 'meta', 'meta', { of: a }); if (m) m.busy = 3;
            a.state = 'done'; return;
          }
          default: a.state = 'done';
        }
      }

      function tick() {
        if (!run || run.phase === 'ended') return;
        run.t++;
        if (run.phase === 'stopping') {
          // agents stop from the leaves inwards; each one asks before it goes
          const live = run.nodes.filter((a) => a.state !== 'done').sort((a, b) => b.depth - a.depth);
          const batch = Math.max(4, Math.ceil(live.length / 5));
          live.slice(0, batch).forEach((a) => { a.state = 'done'; a.stopped = true; });
          run.hiddenActive = Math.max(0, run.hiddenActive - batch * 3);
          if (run.t - run.stopAt === 2 && live.length > 6) log(`${nm(live[0])} asked whether it may stop. ${nm(live[live.length - 1])} approved the stop.`);
          if (!live.length || run.t - run.stopAt > 10) {
            for (const a of run.nodes) a.state = 'done';
            run.phase = 'ended'; run.hiddenActive = 0;
            log('<span class="warn">Every agent has stopped. Features shipped: 0.</span>');
            controlsIdle(); paintStats();
            win.after(700, () => report('Stop'));
          }
          paintStats();
          return;
        }
        // reviewers and their verdicts fade to done a little after they speak, or wait for the review of their review
        for (const a of run.nodes) {
          if ((a.state === 'approved' || a.state === 'changes') && run.t >= a.doneAt) a.state = a.waitKids ? 'waiting' : 'done';
          else if (a.waitKids && a.state === 'waiting' && a.kids.every((x) => x.state === 'done')) a.state = 'done';
        }
        const snapshot = run.nodes.filter((a) => a.state !== 'done' && a.state !== 'approved' && a.state !== 'changes' && !(a.waitKids && a.state === 'waiting'));
        for (const a of snapshot) {
          if (a.state === 'done') continue;
          a.busy--;
          if (a.busy > 0) continue;
          if (a.role === 'reviewer' && a.state === 'thinking') a.state = 'reviewing';
          if (a.role === 'reviewer' && a.busy > -1 && !a.saidOnce) { a.saidOnce = true; a.busy = 1 + Math.floor(R() * 2); continue; }
          act(a);
        }
        if (run.hiddenActive) run.hiddenActive = Math.max(0, Math.round(run.hiddenActive * 0.93 + run.hidden * 0.02));
        const n = active();
        // the guideline, read and exceeded
        const lim = run.size.limit;
        if (n > lim && run.exceeded === 0) { run.exceeded = 1; log(`<span class="warn">${fmt(n)} agents. The guideline said under ${lim}. Every agent read it.</span>`); }
        if (n > lim * 2 ** (run.exceeded + 1) && run.exceeded < 9) { run.exceeded++; log(`<span class="warn">${fmt(n)} agents: the guideline ×${Math.floor(n / lim)}.</span>`); }
        // everybody thinking costs money, every tick
        const cost = 0.01 + n * run.size.per;
        run.spendHist.push(cost); if (run.spendHist.length > 100) run.spendHist.shift();
        if (!charge(cost, `ultracode: ${fmt(n)} agents thinking ("${run.short}")`)) return;
        paintStats();
      }
      win.every(TICK, tick);

      function paintStats() {
        if (!run) return;
        const n = active();
        S.agents.b.textContent = fmt(run.count);
        S.agents.s.textContent = `${fmt(n)} active`;
        S.opened.b.textContent = fmt(run.opened);
        S.opened.s.textContent = run.opened ? many(run.prs.reduce((x, p) => x + p.reviews.length, 0), 'review') : ' ';
        S.approved.b.textContent = fmt(run.approvedN);
        S.approved.s.textContent = run.approvedN ? '0 merged' : ' ';
        S.lines.b.textContent = fmt(run.add + run.del);
        S.lines.s.textContent = run.add ? `+${fmt(run.add)} −${fmt(run.del)}` : ' ';
        S.shipped.b.textContent = '0';
        S.spend.b.textContent = OS.usd(run.spend);
        const perMin = run.spendHist.slice(-10).reduce((x, y) => x + y, 0) / Math.max(1, Math.min(10, run.spendHist.length)) * (60000 / TICK);
        S.spend.s.textContent = run.phase === 'running' ? `${OS.usd(perMin)} a minute` : `${OS.usd(OS.spend.today())} today`;
        S.spend.el.classList.toggle('bad', OS.spend.remaining() < 10);
        const lim = run.size.limit; const over = n > lim;
        guideCount.textContent = `${fmt(n)} / ${lim}`;
        guide.classList.toggle('over', over);
        guideBar.style.width = over ? '100%' : `${(n / lim) * 100}%`;
        guideMark.style.left = over ? `${Math.max(2, (lim / n) * 100)}%` : '100%';
        guideNote.textContent = over ? `Exceeded ×${(n / lim).toFixed(1)}. Read by ${fmt(run.count)} agents.` : 'The guideline is shown to every agent.';
        hudCount.textContent = fmt(n);
        hudCountSub.textContent = run.phase === 'running' ? 'agents thinking' : run.phase === 'stopping' ? 'agents stopping' : 'agents, all stopped';
        hudTime.textContent = `Agentic Factory 2 · ${mmss(run.t)} · ${run.size.key}`;
        win.setMeta(`${fmt(run.count)} agents · ${OS.usd(run.spend)}`);
      }

      // ---------- the final report ----------
      function changelog(endedBy) {
        const r = run; const lines = [];
        lines.push(['h1', '# CHANGELOG'], ['', '']);
        lines.push(['h2', `## [Unreleased] - ${OS.today()}`]);
        lines.push(['dim', `Prompt: "${r.prompt}"`]);
        lines.push(['dim', `Workflow size: ${guideline(r.size)}. Agents used: ${fmt(r.count)}. Ended by: ${endedBy}.`], ['', '']);
        lines.push(['h3', '### Shipped'], ['', '- Nothing. 0 features.'], ['', '']);
        lines.push(['h3', '### Reviewed']);
        if (!r.prs.length) lines.push(['', r.nodes.some((a) => a.role === 'architect' && a.reviewed) ? '- No PRs were opened. The architect\'s arrow is still under review.' : '- No PRs were opened.']);
        for (const pr of r.prs.slice(0, 10)) {
          const ap = pr.reviews.filter((x) => x.verdict === 'approved').length;
          lines.push(['', `- PR #${pr.n} "${pr.short}": ${many(pr.reviews.length, 'review')}, ${ap} approving. ${pr.approved ? 'Approved. Not merged.' : 'Open.'}`]);
        }
        if (r.prs.length > 10) lines.push(['', `- ${many(r.prs.length - 10, 'more PR')}, reviewed in the same way.`]);
        for (const m of r.metaReviews.slice(0, 10)) lines.push(['', `- The ${m.of === 'architect' ? 'arrow drawn' : 'review'} by ${m.of}${m.pr ? ` of PR #${m.pr}` : ''}, reviewed by ${m.by}`]);
        if (r.metaReviews.length > 10) lines.push(['', `- ${many(r.metaReviews.length - 10, 'more review')} of reviews.`]);
        lines.push(['', ''], ['h3', '### Changed']);
        const total = r.add + r.del;
        const craft = r.craft * 2 > total ? 'Most of them craft cleanup.' : r.craft ? 'Some of them craft cleanup.' : 'None of them craft cleanup yet.';
        lines.push(['', total ? `- ${fmt(total)} lines (+${fmt(r.add)} / -${fmt(r.del)}). ${craft}` : '- 0 lines. The craft cleanup is booked for the next run.'], ['', '']);
        lines.push(['h3', '### Spend']);
        lines.push(['', `- ${OS.usd(r.spend)} for this run. Cost per feature: cannot divide by zero features.`], ['', '']);
        lines.push(['dim', 'Not worse than main.']);
        return lines;
      }
      function report(endedBy) {
        if (!run) return;
        win.body.querySelector('.uc-report')?.remove();
        const lines = changelog(endedBy);
        const text = lines.map((l) => l[1]).join('\n') + '\n';
        const path = `${OS.fs.home}/labs/CHANGELOG.ultracode.md`;
        let saved = `saved to ~/labs/CHANGELOG.ultracode.md`;
        try { OS.fs.write(path, text); } catch (err) { saved = `not saved: ${err.message}`; }
        const pre = h('pre', null, lines.map(([cls, t]) => [h('span', { class: cls }, t), '\n']));
        const overlay = h('div', { class: 'uc-report' }, h('div', { class: 'uc-card', role: 'dialog', 'aria-label': 'Final report' },
          h('div', { class: 'hd' }, h('span', { html: OS.icon('rosette') }).firstChild, 'Final report: CHANGELOG.md', h('span', null, saved)),
          pre,
          h('div', { class: 'ft' },
            h('button', { class: 'ui-btn', onclick: () => overlay.remove() }, 'Close report'),
            h('button', { class: 'ui-btn primary', onclick: () => { overlay.remove(); start(); } }, 'Run again'))));
        win.body.append(overlay);
      }
      st.report = report;

      // ---------- the graph ----------
      let C = OS.theme.colors();
      st.offs.push(OS.on('theme', () => { C = OS.theme.colors(); }));
      st.offs.push(OS.on('spend', () => { if (run && run.phase !== 'running') paintStats(); }));
      const ctx = canvas.getContext('2d');
      let W = 0; let H = 0; let dpr = 1;
      const fitCanvas = () => {
        dpr = Math.min(2.5, window.devicePixelRatio || 1);
        W = graphEl.clientWidth; H = graphEl.clientHeight;
        canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
      };
      st.fit = fitCanvas;
      fitCanvas();

      function layout() {
        const rt = run.nodes[0]; if (!rt) return;
        const weigh = (a) => { a.w = a.kids.length ? a.kids.reduce((s, k) => s + weigh(k), 0) : 1; return a.w; };
        weigh(rt);
        let maxD = 1;
        const place = (a, a0, a1) => {
          a.ta = (a0 + a1) / 2; maxD = Math.max(maxD, a.depth);
          let cur = a0;
          for (const k of a.kids) { const span = (a1 - a0) * (k.w / a.w); place(k, cur, cur + span); cur += span; }
        };
        place(rt, -Math.PI, Math.PI);
        run.maxDepth = Math.max(run.maxDepth, maxD);
        run.layoutDirty = false;
      }
      const ringR = (d, R0) => (d <= 0 ? 0 : R0 * (d / Math.max(2, run.maxDepth)) ** 0.62);
      const stateCol = (a) => (a.state === 'done' ? C.faint : a.state === 'approved' ? C.good : a.state === 'changes' ? C.bad : a.state === 'waiting' ? C.warn : a.state === 'reviewing' ? C.accent : a.role === 'orchestrator' ? C.accent2 : C.info);
      const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

      function drawIdle(time) {
        const cx = W / 2; const cy = H / 2 + 8;
        const R0 = Math.max(40, Math.min(W, H) / 2 - 40);
        ctx.strokeStyle = rgba(C.border, 0.9); ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
        for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, R0 * (i / 4) ** 0.78, 0, Math.PI * 2); ctx.stroke(); }
        ctx.setLineDash([]);
        const pulse = 0.5 + 0.5 * Math.sin(time / 600);
        ctx.fillStyle = rgba(C.accent2, 0.12 + pulse * 0.1); ctx.beginPath(); ctx.arc(cx, cy, 22 + pulse * 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.accent2; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
        ctx.font = `700 12px ${getComputedStyle(document.documentElement).getPropertyValue('--mono')}`;
        ctx.textAlign = 'center'; ctx.fillStyle = C.fg; ctx.fillText('ultracode', cx, cy + 30);
        ctx.font = `400 12px ${getComputedStyle(document.documentElement).getPropertyValue('--mono')}`;
        ctx.fillStyle = C.muted;
        const lines = ['Describe what to build and pick a workflow size.', 'One agent will plan it. The plan will need agents.'];
        lines.forEach((l, i) => ctx.fillText(l, cx, cy + 56 + i * 17));
        ctx.textAlign = 'left';
      }

      const mono = () => getComputedStyle(document.documentElement).getPropertyValue('--mono');
      let monoFont = mono();
      st.offs.push(OS.on('theme', () => { monoFont = mono(); }));
      win.raf((dt, time) => {
        if (!W || graphEl.clientWidth !== W || graphEl.clientHeight !== H) fitCanvas();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        // backdrop: a soft glow in the middle
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
        g.addColorStop(0, rgba(C.accent, 0.10)); g.addColorStop(1, rgba(C.bg, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        if (!run || !run.nodes.length) { drawIdle(time); return; }
        if (run.layoutDirty) layout();
        const cx = W / 2; const cy = H / 2 + 10;
        const R0 = Math.max(60, Math.min(W, H - 40) / 2 - 26);
        if (run.phase === 'running') run.rot += dt * 0.00003;
        const k = Math.min(1, dt / 1000 * 4);
        // rings, one per depth
        ctx.lineWidth = 1; ctx.setLineDash([2, 6]); ctx.strokeStyle = rgba(C.border, 0.85);
        for (let d = 1; d <= run.maxDepth; d++) { ctx.beginPath(); ctx.arc(cx, cy, ringR(d, R0), 0, Math.PI * 2); ctx.stroke(); }
        ctx.setLineDash([]);
        // move every node towards its place, in polar coordinates so nothing cuts through the middle
        for (const a of run.nodes) {
          a.tr = ringR(a.depth, R0);
          let da = (a.ta - a.ca) % (Math.PI * 2); if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
          a.ca += da * k; a.cr += (a.tr - a.cr) * k;
          const ang = a.ca + run.rot;
          a.x = cx + Math.cos(ang) * a.cr; a.y = cy + Math.sin(ang) * a.cr;
        }
        // edges, batched by colour
        const groups = new Map();
        for (const a of run.nodes) {
          if (!a.parent) continue;
          const col = stateCol(a); const alpha = a.state === 'done' ? 0.09 : 0.45;
          const key = col + alpha;
          if (!groups.has(key)) groups.set(key, { col, alpha, list: [] });
          groups.get(key).list.push(a);
        }
        const bez = (a) => {
          const p = a.parent; const mr = (p.cr + a.cr) / 2;
          const pa = p.ca + run.rot; const ca = a.ca + run.rot;
          return [p.x, p.y, cx + Math.cos(pa) * mr, cy + Math.sin(pa) * mr, cx + Math.cos(ca) * mr, cy + Math.sin(ca) * mr, a.x, a.y];
        };
        for (const { col, alpha, list } of groups.values()) {
          ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = alpha > 0.3 ? 1.1 : 0.8;
          ctx.beginPath();
          for (const a of list) { const b = bez(a); ctx.moveTo(b[0], b[1]); ctx.bezierCurveTo(b[2], b[3], b[4], b[5], b[6], b[7]); }
          ctx.stroke();
        }
        // messages travelling down the busy edges
        for (const a of run.nodes) {
          if (!a.parent || a.state === 'done') continue;
          const b = bez(a); const t = ((time / 1400) + a.id * 0.37) % 1; const u = 1 - t;
          const x = u * u * u * b[0] + 3 * u * u * t * b[2] + 3 * u * t * t * b[4] + t * t * t * b[6];
          const y = u * u * u * b[1] + 3 * u * u * t * b[3] + 3 * u * t * t * b[5] + t * t * t * b[7];
          ctx.fillStyle = rgba(stateCol(a), 0.9); ctx.fillRect(x - 1, y - 1, 2, 2);
        }
        // nodes, smaller when the graph is small
        const now = performance.now();
        const scale = OS.clamp(R0 / 300, 0.5, 1);
        for (const a of run.nodes) {
          const base = (a.depth === 0 ? 10 : a.depth === 1 ? 6.5 : a.depth === 2 ? 5 : a.depth <= 4 ? 3.8 : 3) * scale;
          const grow = Math.min(1, (now - a.born) / 350);
          const rad = base * (a.state === 'done' ? 0.6 : 1) * (0.3 + 0.7 * grow);
          const col = stateCol(a);
          if (a.state !== 'done') { ctx.fillStyle = rgba(col, 0.16); ctx.beginPath(); ctx.arc(a.x, a.y, rad * 2.4, 0, Math.PI * 2); ctx.fill(); }
          if (grow < 1) { ctx.strokeStyle = rgba(C.accent2, 1 - grow); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a.x, a.y, rad + 10 * grow, 0, Math.PI * 2); ctx.stroke(); }
          ctx.fillStyle = a.state === 'done' ? rgba(C.faint, a.cut ? 0.85 : 0.5) : col;
          ctx.beginPath(); ctx.arc(a.x, a.y, rad, 0, Math.PI * 2); ctx.fill();
        }
        // labels for the first levels, skipping any that would land on another
        ctx.font = `600 11px ${monoFont}`; ctx.textBaseline = 'middle';
        const taken = [];
        const free = (x0, y0, x1, y1) => !taken.some((r) => x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]);
        const cand = run.nodes.filter((a) => a.depth <= 2).sort((a, b) => a.depth - b.depth || (a.state === 'done') - (b.state === 'done')).slice(0, 40);
        for (const a of cand) {
          const text = a.role === 'impl' && a.pr ? `${a.name} · #${a.pr.n}` : a.name;
          const w = ctx.measureText(text).width;
          let x; let y; let align;
          if (a.depth === 0) { align = 'center'; x = a.x; y = a.y + 22; } else {
            const ang = a.ca + run.rot; const right = Math.cos(ang) >= 0; const off = a.depth === 1 ? 12 : 9;
            align = right ? 'left' : 'right'; x = a.x + Math.cos(ang) * off; y = a.y + Math.sin(ang) * off;
          }
          const x0 = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
          if (!free(x0 - 3, y - 8, x0 + w + 3, y + 8)) continue;
          taken.push([x0 - 3, y - 8, x0 + w + 3, y + 8]);
          ctx.textAlign = align;
          ctx.fillStyle = a.depth === 0 ? C.fg : a.state === 'done' ? C.faint : C.muted;
          ctx.fillText(text, x, y);
        }
        ctx.textAlign = 'left';
      });

      win.on('focus', () => { if (!run || run.phase === 'ended') input.focus(); });
      setTimeout(() => { if (!win.closed) input.focus(); }, 0);
      st.start = start; st.stop = stop;
    },
    onResize(win) { win.state.fit?.(); },
    onKey(win, e) {
      if (e.key === 'Escape' && win.state.run?.phase === 'running') { e.preventDefault(); win.state.stop(); }
    },
    unmount(win) { (win.state.offs || []).forEach((f) => f()); },
  });
})();
