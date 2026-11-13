// Issue Lifecycle: a kanban board where every lane rule happens when you move a card.
(() => {
  const { h } = OS;
  const LANES = [
    ['backlog', 'Backlog', '', 'waiting to be framed'],
    ['frame', 'Frame', 'issue-frame', 'never proposes solutions'],
    ['grill', 'Grill', 'issue-grill', 'asks 3 of its 40 questions'],
    ['plan', 'Plan', 'issue-plan', 'splits into sub-issues'],
    ['ready', 'Ready for Build', '', 'Owner set, on purpose'],
    ['build', 'In Build', 'issue-build', 'stay on the card you were given'],
    ['review', 'In Review', '', 'one PR, one ticket'],
    ['done', 'Done', 'issue-retro', 'runs the retro'],
  ];
  const KEYS = LANES.map((l) => l[0]);
  const NAME = Object.fromEntries(LANES.map((l) => [l[0], l[1]]));
  const QUESTIONS = [
    'What problem does this card solve, in product language, with no solution in it?',
    'Who sees the change, and on which page?',
    'What does done look like, in a sentence a test can check?',
    'Which acceptance criterion fails first if this breaks?',
    'Is this one PR? If it is two, it is two tickets.',
    'What is out of scope, and who agreed that it is?',
    'Which events does the analytics checklist add, change or consider?',
    'How will you measure it, and was the event name checked rather than guessed?',
    'What happens on a phone?',
    'What happens when the model fails to load?',
    'What happens with no extensions?',
    'Does it change a fingerprinted Composer path? Where is the end-to-end run?',
    'Which of the three meanings of "design" does this card mean?',
    'Has product design, UI design or building architecture seen it? Which one?',
    'Does any copy in it say "load-bearing"?',
    'What is the smallest version that is still worth shipping?',
    'Which tenant does it run under?',
    'What does the user see while it loads?',
    'What does the user see when it fails?',
    'Which spec proves it, and does the pre-commit hook run that spec?',
    'Does it need a Lookbook preview?',
    'Is the price a quote, or a display convention?',
    'Is the width 3 m? (It is always 3 m.)',
    'Does it touch v2 Stimulus and v3 React in one change?',
    'What is the rollback?',
    'Is it behind an experiment, and who closes the experiment?',
    'Which gold houses will you check it on?',
    'Is it a bug? Show correct inputs giving a wrong output, with the exact cause.',
    'Does this card write to any other card?',
    'What does "not worse than main" mean for this card?',
    'Which design review round does it belong to?',
    'Did anyone ask for this, or did a review find it?',
    'Will the full test suite need to run? (It should not.)',
    'What will the retro say about this card?',
    'Is any of it already built, or are those component shells?',
    'Which name in this card is not defined in this card?',
    'Which one sentence should a reviewer push back on?',
    'Does it cost money per run? How much a day?',
    'If a lane builds it unattended, what does it get wrong first?',
    'Why now?',
  ];
  const STOCK = ['Not worse than main', 'TBD', 'Out of scope', 'Ask the designer'];
  const LEARNINGS = [
    'Done is a column, not a state.',
    'Lanes stall on background waits that never wake them. Check quiet lanes by hand.',
    'One PR, one ticket. The second PR was a second ticket.',
    'During a lane, write only to that lane\'s card.',
    'A bug label needs proof: correct inputs, a wrong output, the exact cause.',
    'Ready for Build with an Owner set is intentional. Do not flag it.',
    'Labs merges by rebase. A merge commit blocks the merge button.',
    'Forty grill questions is thirty-seven more than anyone answers.',
    '"craft cleanup" appeared in this card\'s commits again.',
    'The plan split the card into parts. The parts were each the size of the card.',
    'The finding was inconclusive. It is usually inconclusive.',
    'Every UI gets one more design review.',
    'Do not run the full test suite unnecessarily. It was run.',
    'Use tenant.localhost:3000. Another host name blanks the v3 pages.',
    'The card was done. The retro found that it was not.',
    'Not worse than main is the finding. It is always the finding.',
  ];
  const TASKS = ['the data', 'the screen', 'specs for the changed files', 'the analytics checklist', 'the Lookbook preview', 'the empty state', 'the error state'];
  const LEARN_FILE = OS.fs.home + '/labs/docs/process-learnings.md';

  const hhmm = () => OS.now().toISOString().slice(11, 16);
  const commitTitle = (frag) => OS.data.commits.find((c) => c.includes(frag)) || frag;

  function seedBoard() {
    const t = commitTitle; const cards = {}; const lanes = Object.fromEntries(KEYS.map((k) => [k, []]));
    const add = (n, lane, title, extra = {}) => {
      const id = 'RL-' + n;
      cards[id] = { id, title, kind: 'card', labels: [], parent: null, kids: [], pr: null, owner: null, grill: [], retros: 0, hist: [{ t: '09:00', s: `Seeded in ${NAME[lane]}` }], ...extra };
      lanes[lane].push(id);
    };
    add(2701, 'backlog', t('Composer material library: tag sidebar'));
    add(2702, 'backlog', t('Command palette: open a house or run by id'));
    add(2703, 'backlog', t('Bump vitest'), { labels: ['eng-tweak'] });
    add(2704, 'backlog', t('icons fill ~82%'), { labels: ['design-tweak'] });
    add(2705, 'frame', t('Admin command palette'));
    add(2706, 'frame', t('Edit home with Undo'));
    add(2707, 'grill', t('Front-first camera'), { grill: [{ n: 9, a: 'The phone sheet re-frames the house.' }, { n: 18, a: 'The skeleton, with sheen.' }, { n: 33, a: 'It should not.' }] });
    add(2708, 'plan', t('Read floor plans spread over several images'), { kind: 'parent', kids: ['RL-2709', 'RL-2710', 'RL-2711'] });
    add(2709, 'build', 'Part 1 of 3: the data', { kind: 'sub', parent: 'RL-2708', owner: 'you' });
    add(2710, 'ready', 'Part 2 of 3: the screen', { kind: 'sub', parent: 'RL-2708', owner: 'you' });
    add(2711, 'ready', 'Part 3 of 3: craft cleanup', { kind: 'sub', parent: 'RL-2708', owner: 'you' });
    add(2712, 'ready', t('No extensions state'), { owner: 'you' });
    add(2713, 'review', t('Soft Save design button'), { pr: 2617 });
    add(2714, 'review', t('price bar with See breakdown'), { pr: 2619 });
    return { v: 1, cards, lanes, nextId: 2715, nextPr: 2624, nextPl: 1, learnings: [] };
  }
  function validBoard(b) {
    try {
      if (!b || b.v !== 1 || !b.cards || !b.lanes) return false;
      const seen = new Set();
      for (const k of KEYS) { if (!Array.isArray(b.lanes[k])) return false; for (const id of b.lanes[k]) { if (!b.cards[id] || seen.has(id)) return false; seen.add(id); } }
      return seen.size === Object.keys(b.cards).length;
    } catch { return false; }
  }

  function css() {
    if (document.getElementById('lifecycle-css')) return;
    document.head.append(h('style', { id: 'lifecycle-css', text: `
.lifecycle { position: absolute; inset: 0; display: flex; flex-direction: column; font-size: 12px; background: var(--surface); user-select: none; }
.lifecycle-tb { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--surface2); height: 38px; min-width: 0; }
.lifecycle-tb .ui-btn { flex: none; min-height: 24px; padding: 2px 9px; font-size: 11px; }
.lifecycle-tb .ttl { flex: none; font-weight: 800; display: inline-flex; align-items: center; gap: 6px; }
.lifecycle-tb .ttl .icon { color: var(--accent); }
.lifecycle-tb .sum { color: var(--muted); font-size: 11px; white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; }
.lifecycle-tb .ui-btn.armed { border-color: var(--bad); color: var(--bad); }
.lifecycle-board { flex: 1; min-height: 0; display: flex; gap: 8px; padding: 10px; overflow-x: auto; overflow-y: hidden; scroll-behavior: auto; }
.lifecycle-col { flex: 1 0 156px; min-width: 156px; display: flex; flex-direction: column; min-height: 0; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; transition: border-color .15s, background .15s; }
.lifecycle-col.over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--surface2)); }
.lifecycle-ch { flex: none; padding: 8px 9px 6px; border-bottom: 1px solid var(--border); }
.lifecycle-ch .nm { display: flex; align-items: center; gap: 6px; font-weight: 800; }
.lifecycle-ch .nm .n { margin-left: auto; color: var(--muted); font-weight: 700; font-size: 11px; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; padding: 0 6px; }
.lifecycle-ch .sk { color: var(--accent); font-size: 10.5px; }
.lifecycle-ch .rl { color: var(--faint); font-size: 10.5px; margin-top: 1px; line-height: 1.35; height: 2.7em; overflow: hidden; }
.lifecycle-list { flex: 1; min-height: 0; overflow-y: auto; padding: 7px; display: flex; flex-direction: column; gap: 6px; }
.lifecycle-empty { color: var(--faint); font-size: 11px; text-align: center; padding: 14px 6px; border: 1px dashed var(--border); border-radius: 6px; line-height: 1.5; }
.lifecycle-card { position: relative; flex: none; background: var(--surface); border: 1px solid var(--border); border-radius: 7px; padding: 7px 8px 7px 10px; cursor: grab; box-shadow: 0 1px 0 rgba(0,0,0,.15); transition: border-color .12s, box-shadow .12s; touch-action: none; }
.lifecycle-card::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 0 3px 3px 0; background: var(--border); }
.lifecycle-card.k-parent::before { background: var(--accent); } .lifecycle-card.k-sub::before { background: var(--accent2); }
.lifecycle-card.k-tweak::before { background: var(--info); } .lifecycle-card.k-reframe::before { background: var(--warn); }
.lifecycle-card:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
.lifecycle-card.sel { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
.lifecycle-card.lifecycle-src { display: none; }
.lifecycle-card.busy { cursor: progress; }
.lifecycle-card.grilling { border-style: dashed; border-color: var(--accent); }
.lifecycle-card.arrive { animation: lifecycle-arrive .7s ease-out; }
@keyframes lifecycle-arrive { 0% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent2) 70%, transparent); } 100% { box-shadow: 0 0 0 0 transparent; } }
.lifecycle-top { display: flex; align-items: center; gap: 5px; min-width: 0; }
.lifecycle-top b { font-size: 10.5px; color: var(--muted); font-weight: 800; letter-spacing: .02em; }
.lifecycle-top .grow { flex: 1; }
.lifecycle-bd { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: var(--muted); white-space: nowrap; }
.lifecycle-bd .icon { width: 11px; height: 11px; }
.lifecycle-bd.pr { color: var(--good); } .lifecycle-bd.rt { color: var(--warn); }
.lifecycle-title { margin: 3px 0 4px; line-height: 1.35; color: var(--fg); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.lifecycle-chips { display: flex; flex-wrap: wrap; gap: 3px; }
.lifecycle-chips .ui-tag { height: 17px; font-size: 10px; padding: 0 5px; }
.lifecycle-lane { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: var(--accent); }
.lifecycle-lane i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: lifecycle-pulse 1.4s ease-in-out infinite; }
@keyframes lifecycle-pulse { 50% { opacity: .25; transform: scale(.7); } }
.lifecycle-prog { margin-top: 5px; font-size: 10px; color: var(--muted); }
.lifecycle-prog .ui-bar { height: 5px; margin-bottom: 3px; }
.lifecycle-ph { flex: none; border: 2px dashed color-mix(in srgb, var(--accent) 70%, transparent); border-radius: 7px; background: color-mix(in srgb, var(--accent) 8%, transparent); }
.lifecycle-ghost { position: absolute; left: 0; top: 0; z-index: 4; pointer-events: none; cursor: grabbing; box-shadow: 0 16px 40px rgba(0,0,0,.45); border-color: var(--accent); opacity: .96; }
.lifecycle-keys { flex: none; padding: 4px 10px; border-top: 1px solid var(--border); font-size: 10.5px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lifecycle-keys .ui-kbd { font-size: 10px; padding: 0 4px; min-width: 14px; color: var(--muted); }
.lifecycle-drawer { position: absolute; top: 38px; right: 0; bottom: 0; width: min(340px, 100%); z-index: 3; background: var(--surface); border-left: 1px solid var(--border); box-shadow: -12px 0 32px rgba(0,0,0,.3); display: flex; flex-direction: column; animation: lifecycle-in .16s ease-out; }
@keyframes lifecycle-in { from { transform: translateX(20px); opacity: 0; } }
.lifecycle-drawer.still, .lifecycle-scrim.still { animation: none; }
.lifecycle-dh { padding: 10px 12px 8px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 5px; }
.lifecycle-dh .rw { display: flex; align-items: center; gap: 6px; }
.lifecycle-dh .x { margin-left: auto; border: 0; background: none; color: var(--muted); cursor: pointer; font-size: 14px; border-radius: 4px; width: 22px; height: 22px; }
.lifecycle-dh .x:hover { background: var(--border); color: var(--fg); }
.lifecycle-dh .tt { font-size: 14px; font-weight: 800; line-height: 1.35; overflow-wrap: anywhere; }
.lifecycle-db { flex: 1; overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; user-select: text; }
.lifecycle-kv { display: grid; grid-template-columns: 74px 1fr; gap: 4px 8px; font-size: 11.5px; }
.lifecycle-kv span { color: var(--muted); }
.lifecycle-link { color: var(--accent); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.lifecycle-qa { border-left: 2px solid var(--border); padding: 2px 0 2px 8px; }
.lifecycle-qa .q { color: var(--muted); font-size: 11px; }
.lifecycle-qa .a { font-weight: 700; }
.lifecycle-hist { font-size: 11px; color: var(--muted); display: flex; flex-direction: column; gap: 2px; }
.lifecycle-hist b { color: var(--faint); font-weight: 400; margin-right: 6px; }
.lifecycle-df { padding: 8px 12px; border-top: 1px solid var(--border); display: flex; gap: 6px; flex-wrap: wrap; }
.lifecycle-scrim { position: absolute; inset: 0; z-index: 4; background: color-mix(in srgb, var(--bg) 60%, transparent); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; padding: 14px; animation: fade .15s; }
.lifecycle-sheet { width: min(500px, 100%); max-height: 100%; overflow: auto; background: var(--surface); border-radius: 10px; border: 2px solid transparent;
  background: linear-gradient(var(--surface), var(--surface)) padding-box, linear-gradient(135deg, var(--accent), var(--accent2)) border-box; box-shadow: 0 24px 60px rgba(0,0,0,.5); }
.lifecycle-sh { padding: 10px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
.lifecycle-sh b { font-weight: 800; }
.lifecycle-sb { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.lifecycle-sb .qn { color: var(--muted); font-size: 11px; display: flex; gap: 8px; align-items: center; }
.lifecycle-sb .qt { font-size: 15px; font-weight: 800; line-height: 1.35; }
.lifecycle-dots { display: flex; gap: 4px; }
.lifecycle-dots i { width: 22px; height: 4px; border-radius: 2px; background: var(--border); }
.lifecycle-dots i.on { background: var(--accent); } .lifecycle-dots i.done { background: var(--good); }
.lifecycle-chipr { display: flex; gap: 4px; flex-wrap: wrap; }
.lifecycle-chipr button { font-size: 10.5px; padding: 1px 8px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface2); color: var(--muted); cursor: pointer; }
.lifecycle-chipr button:hover { color: var(--fg); border-color: var(--accent); }
.lifecycle-sf { padding: 10px 14px; border-top: 1px solid var(--border); display: flex; gap: 6px; align-items: center; }
.lifecycle-pl { border: 1px solid var(--border); border-radius: 6px; padding: 7px 9px; background: var(--surface2); }
.lifecycle-pl .hd { display: flex; gap: 6px; align-items: center; font-size: 10.5px; color: var(--faint); }
.lifecycle-pl .hd b { color: var(--warn); font-weight: 800; }
.lifecycle-pl .tx { margin-top: 3px; }
.lifecycle.narrow .lifecycle-col { flex-basis: 150px; min-width: 150px; }
.lifecycle.narrow .lifecycle-tb .sum, .lifecycle.narrow .lifecycle-keys { display: none; }
.lifecycle.narrow .lifecycle-tb .lbl { display: none; }
` }));
  }

  registerApp({
    id: 'lifecycle', title: 'Issue Lifecycle', icon: 'journey-outline', desc: 'Frame, grill, plan, build, retro. Every lane rule happens when you move a card.',
    keywords: ['kanban', 'board', 'issues', 'tickets', 'lanes', 'retro', 'grill', 'plan', 'cards'],
    size: [1200, 680],
    mount(win) {
      css();
      const st = win.state;
      win.body.style.overflow = 'hidden';
      let board = OS.store.get('lifecycle.board', null);
      if (!validBoard(board)) board = seedBoard();
      Object.assign(st, { sel: null, detail: null, grill: null, drag: null, press: null, busy: {}, showLearn: false, armReset: 0, offs: [], gen: 0 });
      const save = () => OS.store.set('lifecycle.board', board);
      const card = (id) => board.cards[id];
      const laneOf = (id) => KEYS.find((k) => board.lanes[k].includes(id));
      const log = (c, s) => { c.hist.push({ t: hhmm(), s }); if (c.hist.length > 40) c.hist.splice(1, c.hist.length - 40); };
      const kindOf = (c) => (c.labels.includes('re-frame') ? 'reframe' : c.kind === 'parent' ? 'parent' : c.kind === 'sub' ? 'sub' : c.labels.some((l) => l.endsWith('tweak')) ? 'tweak' : 'card');
      function lanesView() {
        const v = Object.fromEntries(KEYS.map((k) => [k, board.lanes[k].slice()]));
        if (st.grill) {
          for (const k of KEYS) v[k] = v[k].filter((x) => x !== st.grill.id);
          v.grill.splice(OS.clamp(st.grill.idx, 0, v.grill.length), 0, st.grill.id);
        }
        return v;
      }
      // the In Build card that makes this card a sibling, if any
      function laneHolder(id) {
        const c = card(id);
        if (!c?.parent) return null;
        const holder = board.lanes.build.map(card).find((x) => x.id !== id && x.parent === c.parent);
        return holder || null;
      }

      // ----- DOM -----
      const root = h('div', { class: 'lifecycle' });
      const sum = h('span', { class: 'sum' });
      const btnLearn = h('button', { class: 'ui-btn', onclick: () => toggleLearn() });
      const btnReset = h('button', { class: 'ui-btn ghost', onclick: () => resetBoard() }, 'Reset board');
      const tb = h('div', { class: 'lifecycle-tb' },
        h('span', { class: 'ttl' }, OS.iconEl('journey-outline'), 'RL board'), sum, h('span', { style: { flex: '1 1 0' } }),
        h('button', { class: 'ui-btn', onclick: () => newCard() }, '+', h('span', { class: 'lbl' }, ' New card')), btnLearn, btnReset);
      const boardEl = h('div', { class: 'lifecycle-board' });
      const keysEl = h('div', { class: 'lifecycle-keys' });
      root.append(tb, boardEl, keysEl);
      win.body.append(root);
      root.addEventListener('click', (e) => { if (e.detail > 0) e.target.closest('button')?.blur(); });
      const cols = {};
      for (const [k, nm, skill, rule] of LANES) {
        const count = h('span', { class: 'n' });
        const list = h('div', { class: 'lifecycle-list' });
        const col = h('div', { class: 'lifecycle-col', dataset: { lane: k } },
          h('div', { class: 'lifecycle-ch' }, h('div', { class: 'nm' }, nm, count), skill ? h('div', { class: 'sk' }, '/' + skill) : h('div', { class: 'sk', style: { color: 'var(--faint)' } }, 'a status, not a lane'), h('div', { class: 'rl', title: rule }, rule)),
          list);
        boardEl.append(col);
        cols[k] = { col, list, count };
      }
      const kbd = (t) => h('span', { class: 'ui-kbd' }, t);
      keysEl.append(h('span', null, kbd('drag'), ' move'), '   ', h('span', null, kbd('←↑→↓'), ' select'), '   ', h('span', null, kbd('['), kbd(']'), ' move lane'), '   ',
        h('span', null, kbd('⇧↑'), kbd('⇧↓'), ' reorder'), '   ', h('span', null, kbd('↵'), ' open'), '   ', h('span', null, kbd('P'), ' link PR'), '   ', h('span', null, kbd('N'), ' new'), '   ', h('span', null, kbd('L'), ' learnings'));

      // ----- rendering -----
      function cardEl(c, laneKey) {
        const b = st.busy[c.id];
        const badges = [];
        if (c.pr) badges.push(h('span', { class: 'lifecycle-bd pr', title: `PR #${c.pr}` }, OS.iconEl('branch'), '#' + c.pr));
        if (c.kind === 'parent' && c.kids.length) badges.push(h('span', { class: 'lifecycle-bd', title: 'Sub-issues' }, OS.iconEl('org-chart'), String(c.kids.length)));
        if (c.grill.length) badges.push(h('span', { class: 'lifecycle-bd', title: 'Grill questions answered' }, '?', `${c.grill.length}/40`));
        if (c.retros) badges.push(h('span', { class: 'lifecycle-bd rt', title: 'Retros run' }, '↺', String(c.retros)));
        const chips = [];
        if (c.parent) chips.push(h('span', { class: 'ui-tag' }, '↳ ' + c.parent));
        for (const l of c.labels) chips.push(h('span', { class: 'ui-tag ' + (l === 're-frame' ? 'warn' : l === 'eng-tweak' ? 'info' : l === 'design-tweak' ? 'accent' : '') }, l));
        if (c.owner && (laneKey === 'ready' || laneKey === 'build')) chips.push(h('span', { class: 'ui-tag good', title: 'Ready for Build with an Owner set is intentional' }, 'owner: you'));
        const grilling = st.grill?.id === c.id;
        const el = h('div', { class: `lifecycle-card k-${kindOf(c)}` + (st.sel === c.id ? ' sel' : '') + (b ? ' busy' : '') + (grilling ? ' grilling' : '') + (st.drag?.id === c.id ? ' lifecycle-src' : ''), dataset: { id: c.id } },
          h('div', { class: 'lifecycle-top' }, h('b', null, c.id), h('span', { class: 'grow' }), badges),
          h('div', { class: 'lifecycle-title' }, c.title),
          chips.length ? h('div', { class: 'lifecycle-chips' }, chips) : null,
          laneKey === 'build' && !b ? h('div', { class: 'lifecycle-lane', style: { marginTop: '5px' } }, h('i'), 'a lane is building this') : null,
          grilling ? h('div', { class: 'lifecycle-lane', style: { marginTop: '5px' } }, h('i'), 'being grilled') : null,
          b ? h('div', { class: 'lifecycle-prog' }, h('div', { class: 'ui-bar warn' }, h('i', { style: { width: `${Math.round((b.step / b.of) * 100)}%` } })), b.text) : null);
        el.addEventListener('pointerdown', (e) => onDown(e, c.id));
        if (st.arrive?.has(c.id)) el.classList.add('arrive');
        return el;
      }
      function render() {
        const v = lanesView();
        for (const k of KEYS) {
          const { list, count } = cols[k];
          list.innerHTML = '';
          count.textContent = String(v[k].length);
          for (const id of v[k]) list.append(cardEl(card(id), k));
          if (!v[k].length) list.append(h('div', { class: 'lifecycle-empty' }, k === 'done' ? 'Nothing stays here. The retro sees to that.' : k === 'build' ? 'No lanes running. Nothing is stalled, for now.' : 'Empty.'));
        }
        st.arrive = null;
        if (st.drag) track();
        const total = Object.keys(board.cards).length;
        sum.textContent = `${total} cards · ${board.lanes.build.length} lane${board.lanes.build.length === 1 ? '' : 's'} · ${board.learnings.length} learning${board.learnings.length === 1 ? '' : 's'} filed · done, ever: 0`;
        btnLearn.innerHTML = '';
        btnLearn.append(OS.iconEl('rosette'), h('span', { class: 'lbl' }, ' Learnings '), h('b', null, String(board.learnings.length)));
        btnLearn.classList.toggle('on', st.showLearn);
        win.setMeta(`${board.lanes.build.length} in build`);
        renderDrawer();
        renderSheet();
      }
      // one card only: a retro's progress must not rebuild the board under a drag or a typed answer
      function renderCard(id) {
        const old = boardEl.querySelector(`.lifecycle-card[data-id="${id}"]`); const lane = laneOf(id);
        if (old && lane) old.replaceWith(cardEl(card(id), lane)); else render();
      }
      const reveal = (id) => { const el = boardEl.querySelector(`.lifecycle-card[data-id="${id}"]`); el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };

      // ----- drawer: card detail, or process learnings -----
      let drawer = null; let drawerKey = '';
      function renderDrawer() {
        const key = st.showLearn ? 'learnings' : st.detail || '';
        const same = key === drawerKey && !!drawer; drawerKey = key;
        drawer?.remove(); drawer = null;
        if (st.showLearn) {
          drawer = h('div', { class: 'lifecycle-drawer' },
            h('div', { class: 'lifecycle-dh' }, h('div', { class: 'rw' }, h('b', null, 'Process learnings'), h('span', { class: 'ui-tag warn' }, `${board.learnings.length} filed`),
              h('button', { class: 'x', 'aria-label': 'Close', onclick: () => toggleLearn(false) }, '✕')),
            h('div', { class: 'ui-muted', style: { fontSize: '11px' } }, 'Filed by the retro. Read by the next retro.')),
            h('div', { class: 'lifecycle-db' }, board.learnings.length ? board.learnings.map((l) => h('div', { class: 'lifecycle-pl' },
              h('div', { class: 'hd' }, h('b', null, l.id), 'from', h('span', { class: 'lifecycle-link', onclick: () => { toggleLearn(false); if (board.cards[l.card]) { select(l.card); openCard(l.card); } } }, l.card), h('span', { style: { marginLeft: 'auto' } }, l.at.slice(11, 16))),
              h('div', { class: 'tx' }, l.text))) : h('div', { class: 'lifecycle-empty' }, 'No learnings yet. Move a card to Done.')),
            h('div', { class: 'lifecycle-df' }, h('span', { class: 'ui-faint', style: { fontSize: '11px' } }, 'Also appended to ~/labs/docs/process-learnings.md')));
          drawer.classList.toggle('still', same);
          root.append(drawer); return;
        }
        const c = st.detail && card(st.detail);
        if (!c) return;
        const lane = laneOf(c.id);
        const row = (k, v) => [h('span', null, k), h('div', null, v)];
        const kids = c.kids.map((id) => h('div', null, h('span', { class: 'lifecycle-link', onclick: () => { select(id); openCard(id); } }, id), ' ', h('span', { class: 'ui-muted' }, `${card(id)?.title || ''} · ${NAME[laneOf(id)] || '?'}`)));
        drawer = h('div', { class: 'lifecycle-drawer' },
          h('div', { class: 'lifecycle-dh' },
            h('div', { class: 'rw' }, h('b', { class: 'ui-muted' }, c.id), h('span', { class: 'ui-tag accent' }, NAME[lane]), c.labels.map((l) => h('span', { class: 'ui-tag' + (l === 're-frame' ? ' warn' : '') }, l)),
              h('button', { class: 'x', 'aria-label': 'Close', onclick: () => closeDetail() }, '✕')),
            h('div', { class: 'tt' }, c.title)),
          h('div', { class: 'lifecycle-db' },
            h('div', { class: 'lifecycle-kv' },
              row('Kind', c.kind === 'parent' ? `parent, ${c.kids.length} sub-issues` : c.kind === 'sub' ? 'sub-issue' : 'card'),
              row('Owner', c.owner ? (lane === 'ready' ? 'you. Set on purpose.' : 'you') : h('span', { class: 'ui-faint' }, 'none')),
              row('Parent', c.parent ? h('span', { class: 'lifecycle-link', onclick: () => { select(c.parent); openCard(c.parent); } }, c.parent) : h('span', { class: 'ui-faint' }, 'none')),
              row('PR', c.pr ? h('span', { class: 'ui-good' }, `#${c.pr} (one PR, one ticket)`) : h('span', { class: 'ui-faint' }, 'none linked')),
              row('Retros', String(c.retros))),
            c.kids.length ? h('div', null, h('div', { class: 'ui-title' }, 'Sub-issues'), ...kids) : null,
            c.grill.length ? h('div', { class: 'col' }, h('div', { class: 'ui-title' }, `Grill · ${c.grill.length} of 40 asked`), c.grill.map((g) => h('div', { class: 'lifecycle-qa' }, h('div', { class: 'q' }, `Q${g.n}. ${QUESTIONS[g.n - 1]}`), h('div', { class: 'a' }, g.a)))) : null,
            h('div', null, h('div', { class: 'ui-title' }, 'History'), h('div', { class: 'lifecycle-hist' }, c.hist.slice().reverse().map((x) => h('div', null, h('b', null, x.t), x.s))))),
          h('div', { class: 'lifecycle-df' },
            h('button', { class: 'ui-btn', disabled: lane === 'backlog', onclick: () => moveBy(c.id, -1) }, kbd('['), 'Back a lane'),
            h('button', { class: 'ui-btn primary', disabled: lane === 'done', onclick: () => moveBy(c.id, 1) }, 'Next lane', kbd(']')),
            h('button', { class: 'ui-btn', onclick: () => linkPr(c.id) }, OS.iconEl('branch'), 'Link PR', kbd('P'))));
        drawer.classList.toggle('still', same);
        root.append(drawer);
      }

      // ----- the grill sheet -----
      let sheet = null; let sheetKey = '';
      function renderSheet() {
        const g = st.grill;
        const key = g ? `${g.id}:${g.i}` : '';
        if (sheet && key === sheetKey) return;
        const sameCard = !!sheet && !!g && sheetKey.startsWith(g.id + ':');
        sheet?.remove(); sheet = null; sheetKey = key;
        if (!g) return;
        const c = card(g.id);
        if (g.i >= g.qs.length) {
          sheet = h('div', { class: 'lifecycle-scrim' }, h('div', { class: 'lifecycle-sheet', role: 'dialog', 'aria-label': 'Grill' },
            h('div', { class: 'lifecycle-sh' }, OS.iconEl('question'), h('b', null, `Grilled · ${c.id}`)),
            h('div', { class: 'lifecycle-sb' }, h('div', { class: 'qt' }, `${c.grill.length + g.qs.length} of 40 asked.`),
              h('div', { class: 'ui-muted' }, 40 - c.grill.length - g.qs.length > 0 ? `${40 - c.grill.length - g.qs.length} remain for the next grill.` : 'All forty asked. The card is ready. Nobody believes it.'),
              g.qs.map((n, i) => h('div', { class: 'lifecycle-qa' }, h('div', { class: 'q' }, `Q${n}. ${QUESTIONS[n - 1]}`), h('div', { class: 'a' }, g.answers[i])))),
            h('div', { class: 'lifecycle-sf' }, h('span', { style: { flex: 1 } }), h('button', { class: 'ui-btn primary', onclick: () => finishGrill() }, 'File the answers', kbd('↵')))));
          sheet.classList.toggle('still', sameCard);
          root.append(sheet);
          sheet.querySelector('.ui-btn.primary').focus();
          return;
        }
        const n = g.qs[g.i];
        const input = h('input', { class: 'ui-input', placeholder: 'Answer, or press Enter for TBD', value: g.draft || '', 'aria-label': 'Answer',
          oninput: (e) => { g.draft = e.target.value; },
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); nextQuestion(); } else if (e.key === 'Escape') { e.preventDefault(); cancelGrill(); } } });
        sheet = h('div', { class: 'lifecycle-scrim' }, h('div', { class: 'lifecycle-sheet', role: 'dialog', 'aria-label': 'Grill' },
          h('div', { class: 'lifecycle-sh' }, OS.iconEl('question'), h('b', null, `Grill · ${c.id}`), h('span', { class: 'ui-muted', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, c.title)),
          h('div', { class: 'lifecycle-sb' },
            h('div', { class: 'qn' }, h('div', { class: 'lifecycle-dots' }, g.qs.map((_, i) => h('i', { class: i < g.i ? 'done' : i === g.i ? 'on' : '' }))), `Question ${g.i + 1} of 3`, h('span', { class: 'ui-faint' }, `· Q${n} of 40`)),
            h('div', { class: 'qt' }, QUESTIONS[n - 1]),
            input,
            h('div', { class: 'lifecycle-chipr' }, STOCK.map((s) => h('button', { onclick: () => { g.draft = s; input.value = s; input.focus(); } }, s)))),
          h('div', { class: 'lifecycle-sf' }, h('button', { class: 'ui-btn ghost', onclick: () => cancelGrill() }, `Back to ${NAME[g.from]}`, kbd('Esc')), h('span', { style: { flex: 1 } }),
            h('button', { class: 'ui-btn primary', onclick: () => nextQuestion() }, g.i === 2 ? 'Last answer' : 'Next', kbd('↵')))));
        sheet.classList.toggle('still', sameCard);
        root.append(sheet);
        input.focus();
      }
      function startGrill(id, from, idx) {
        const c = card(id);
        let pool = Array.from({ length: 40 }, (_, i) => i + 1).filter((n) => !c.grill.some((g) => g.n === n));
        if (pool.length < 3) { c.grill = []; pool = Array.from({ length: 40 }, (_, i) => i + 1); }
        const r = OS.rng(`${id}:grill:${c.grill.length}:${c.retros}`);
        const qs = [];
        while (qs.length < 3) { const n = pool.splice(Math.floor(r() * pool.length), 1)[0]; qs.push(n); }
        st.grill = { id, from, idx: idx ?? board.lanes.grill.length, qs, i: 0, answers: [], draft: '' };
        st.detail = null;
        render();
      }
      function nextQuestion() {
        const g = st.grill; if (!g) return;
        g.answers.push((g.draft || '').trim() || 'TBD'); g.draft = ''; g.i++;
        OS.sound.click();
        renderSheet();
      }
      function finishGrill() {
        const g = st.grill; if (!g) return;
        const c = card(g.id);
        g.qs.forEach((n, i) => c.grill.push({ n, a: g.answers[i] }));
        st.grill = null;
        place(g.id, 'grill', g.idx);
        log(c, `Grilled: ${g.qs.map((n) => 'Q' + n).join(', ')} answered (${c.grill.length} of 40)`);
        st.arrive = new Set([g.id]); st.sel = g.id;
        save(); render(); reveal(g.id);
      }
      function cancelGrill() {
        const g = st.grill; if (!g) return;
        st.grill = null;
        OS.osd(`Grill abandoned. ${g.id} stays in ${NAME[g.from]}.`);
        render();
      }

      // ----- moves and their rules -----
      function place(id, lane, idx) {
        for (const k of KEYS) board.lanes[k] = board.lanes[k].filter((x) => x !== id);
        const L = board.lanes[lane];
        L.splice(OS.clamp(idx ?? L.length, 0, L.length), 0, id);
      }
      function refuseSibling(id, holder, verb) {
        const c = card(id);
        OS.sound.error();
        win.crash({
          title: 'Stay on the card you were given', icon: 'journey-outline', code: `LANE-423 · ${holder.id} is In Build`,
          lines: [`A lane is building ${holder.id}. ${c.id} is its sibling: both are sub-issues of ${c.parent}.`, 'During a lane, write only to that lane\'s card.'],
          details: [`lane:     ${holder.id}  ${holder.title}`, `refused:  ${verb} ${c.id}  ${c.title}`, `parent:   ${c.parent}  ${card(c.parent)?.title || ''}`],
          actions: [{ label: `Open ${holder.id}`, primary: true, run: () => { select(holder.id); openCard(holder.id); } }, { label: 'OK' }],
        });
      }
      function moveCard(id, to, idx, how) {
        const c = card(id); const from = laneOf(id);
        if (!c || st.busy[id] || st.grill) return false;
        const holder = laneHolder(id);
        if (holder && (from !== to || how !== 'drag')) { refuseSibling(id, holder, 'move'); render(); return false; }
        if (from === to) { place(id, to, idx); save(); render(); return true; }
        if (to === 'grill') { startGrill(id, from, idx); return true; }
        place(id, to, idx);
        log(c, `Moved from ${NAME[from]} to ${NAME[to]}`);
        st.arrive = new Set([id]);
        if (to === 'plan') planSplit(c);
        if (to === 'ready' && !c.owner) { c.owner = 'you'; log(c, 'Owner set. Intentional.'); }
        if (to === 'build') { log(c, 'A lane started building it'); OS.osd(`${c.id}: a lane is building it`); }
        if (to === 'review' && !c.pr) { c.pr = board.nextPr++; log(c, `PR #${c.pr} opened and linked`); }
        save(); render(); reveal(id);
        if (to === 'done') runRetro(id);
        return true;
      }
      function moveBy(id, dir) {
        const from = laneOf(id); const i = KEYS.indexOf(from) + dir;
        if (i < 0 || i >= KEYS.length) return;
        moveCard(id, KEYS[i], undefined, 'key');
      }
      function planSplit(c) {
        if (c.kind === 'sub') { log(c, 'Already PR-sized. Plan had nothing to split.'); OS.osd(`${c.id} is a sub-issue. Nothing to split.`); return; }
        if (c.kids.length) { log(c, `Already planned: ${c.kids.length} sub-issues`); OS.osd(`${c.id} is already planned`); return; }
        const k = 2 + (OS.hash(c.id + ':plan') % 3);
        const r = OS.rng(c.id + ':tasks'); const pool = TASKS.slice(); const tasks = [];
        while (tasks.length < k - 1) tasks.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
        tasks.push('craft cleanup');
        const made = [];
        tasks.forEach((t, i) => {
          const id = 'RL-' + board.nextId++;
          board.cards[id] = { id, title: `Part ${i + 1} of ${k}: ${t}`, kind: 'sub', labels: [], parent: c.id, kids: [], pr: null, owner: 'you', grill: [], retros: 0, hist: [{ t: hhmm(), s: `Split from ${c.id} by the plan. Owner set. Intentional.` }] };
          board.lanes.ready.push(id); made.push(id);
        });
        c.kind = 'parent'; c.kids = made;
        log(c, `Split into ${k} sub-issues: ${made.join(', ')}`);
        st.arrive = new Set([c.id, ...made]);
        OS.notify({ app: 'issue-plan', icon: 'org-chart', title: `${c.id} split into ${k} sub-issues`, body: `${made.join(', ')} are Ready for Build. The last one is craft cleanup.`, timeout: 5000 });
      }
      function linkPr(id) {
        const c = card(id); if (!c) return;
        const holder = laneHolder(id);
        if (holder) { refuseSibling(id, holder, 'link a PR to'); return; }
        if (c.pr) {
          OS.sound.error();
          const n = board.nextPr;
          win.crash({
            title: 'One PR, one ticket', icon: 'branch', code: `LIFECYCLE-409 · ${c.id} already has #${c.pr}`,
            lines: [`${c.id} is linked to PR #${c.pr}. A second PR needs a second ticket.`, 'Two PRs that fix the same symptom are still two tickets.'],
            details: [`$ pr list --card ${c.id}`, `#${c.pr}  ${c.title}  linked`, `#${n}  ${c.title} (again)  refused`],
            actions: [{ label: 'Open a new card for it', primary: true, run: () => cardForPr(c) }, { label: 'OK' }],
          });
          return;
        }
        c.pr = board.nextPr++;
        log(c, `PR #${c.pr} linked`);
        OS.osd(`PR #${c.pr} linked to ${c.id}`);
        save(); render();
      }
      function cardForPr(c) {
        const id = 'RL-' + board.nextId++;
        const pr = board.nextPr++;
        board.cards[id] = { id, title: `Second PR for ${c.id}: ${c.title}`, kind: 'card', labels: [], parent: null, kids: [], pr, owner: null, grill: [], retros: 0,
          hist: [{ t: hhmm(), s: `Created for PR #${pr}, which ${c.id} could not take` }] };
        board.lanes.backlog.unshift(id);
        log(c, `Refused a second PR. #${pr} got its own card, ${id}`);
        st.arrive = new Set([id]); st.sel = id;
        save(); render(); reveal(id);
      }
      async function runRetro(id) {
        const c = card(id); const gen = st.gen;
        const steps = [`reading the exhaust: ${c.hist.length} history lines`, `${c.grill.length} grill answers, ${c.pr ? `PR #${c.pr}` : 'no PR'}`, 'citing every claim', `filing PL-${board.nextPl}`];
        st.busy[id] = { step: 0, of: steps.length + 1, text: 'retro starting' };
        renderCard(id);
        for (let i = 0; i < steps.length; i++) {
          await win.sleep(480);
          if (win.closed || st.gen !== gen) return;
          st.busy[id] = { step: i + 1, of: steps.length + 1, text: steps[i] };
          renderCard(id);
        }
        await win.sleep(480);
        if (win.closed || st.gen !== gen || !board.cards[id]) return;
        const pl = { id: `PL-${board.nextPl}`, card: id, text: LEARNINGS[(board.nextPl - 1) % LEARNINGS.length], at: OS.now().toISOString() };
        board.nextPl++;
        board.learnings.unshift(pl);
        try {
          const prev = OS.fs.exists(LEARN_FILE) ? OS.fs.read(LEARN_FILE) : '# Process learnings\n\nFiled by the retro. Read by the next retro.\n\n';
          OS.fs.write(LEARN_FILE, prev + `- ${pl.id} · ${id} · retro ${c.retros + 1}: ${pl.text}\n`);
        } catch { /* the board keeps it either way */ }
        c.retros++;
        if (!c.labels.includes('re-frame')) c.labels.push('re-frame');
        delete st.busy[id];
        place(id, 'frame', 0);
        log(c, `Retro ${c.retros} filed ${pl.id}. Moved back to Frame to be re-framed`);
        st.arrive = new Set([id]);
        save(); render(); reveal(id);
        OS.notify({ app: 'issue-retro', icon: 'rosette', title: `${pl.id} filed from ${id}`, body: `${pl.text}\n${id} is back in Frame, labelled re-frame.`, timeout: 6000 });
      }
      function newCard() {
        const used = new Set(Object.values(board.cards).map((c) => c.title));
        const title = OS.data.commits.find((t) => !used.has(t)) || `${OS.data.commits[board.nextId % OS.data.commits.length]} (again)`;
        const id = 'RL-' + board.nextId++;
        board.cards[id] = { id, title, kind: 'card', labels: [], parent: null, kids: [], pr: null, owner: null, grill: [], retros: 0, hist: [{ t: hhmm(), s: 'Created in Backlog from the commit log' }] };
        board.lanes.backlog.unshift(id);
        st.sel = id; st.arrive = new Set([id]);
        save(); render(); reveal(id);
      }
      function resetBoard() {
        const disarm = () => { st.armReset = 0; btnReset.textContent = 'Reset board'; btnReset.classList.remove('armed'); };
        if (!st.armReset) {
          const token = st.armReset = Date.now();
          btnReset.textContent = 'Confirm reset'; btnReset.classList.add('armed');
          win.after(3000, () => { if (st.armReset === token) disarm(); });
          return;
        }
        disarm();
        board = { ...seedBoard(), learnings: board.learnings, nextPl: board.nextPl }; st.gen++; st.busy = {}; st.grill = null; st.detail = null; st.sel = null; st.showLearn = false;
        save(); render();
        OS.osd('Board reset. Filed learnings stay filed.');
      }

      // ----- selection and opening -----
      function select(id) { st.sel = id; render(); reveal(id); }
      function openCard(id) {
        const holder = laneHolder(id);
        if (holder) { render(); refuseSibling(id, holder, 'open'); return; }
        st.detail = id; st.showLearn = false; render();
      }
      function closeDetail() { st.detail = null; render(); }
      function toggleLearn(force) { st.showLearn = force ?? !st.showLearn; if (st.showLearn) st.detail = null; render(); }

      // ----- drag and drop -----
      function onDown(e, id) {
        if (e.button !== 0 || st.busy[id] || st.grill || st.drag) return;
        st.press = { id, el: e.currentTarget, x: e.clientX, y: e.clientY, pid: e.pointerId };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
      }
      const unlisten = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel); };
      function onMove(e) {
        const p = st.press; if (!p) return;
        if (!st.drag) { if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return; startDrag(e); }
        st.drag.cx = e.clientX; st.drag.cy = e.clientY;
        track();
      }
      function startDrag(e) {
        const p = st.press; const r = p.el.getBoundingClientRect();
        const ghost = p.el.cloneNode(true);
        ghost.classList.add('lifecycle-ghost'); ghost.classList.remove('sel'); ghost.style.width = r.width + 'px';
        root.append(ghost);
        const ph = h('div', { class: 'lifecycle-ph', style: { height: r.height + 'px' } });
        p.el.after(ph); p.el.classList.add('lifecycle-src');
        st.drag = { id: p.id, ghost, ph, ox: p.x - r.left, oy: p.y - r.top, cx: e.clientX, cy: e.clientY, lane: laneOf(p.id), idx: 0 };
        st.drag.stop = win.raf(autoScroll);
        st.sel = p.id;
      }
      function track() {
        const d = st.drag; const rr = root.getBoundingClientRect();
        d.ghost.style.transform = `translate(${d.cx - rr.left - d.ox}px, ${d.cy - rr.top - d.oy}px) rotate(1.5deg)`;
        let best = null; let bestD = Infinity;
        for (const k of KEYS) {
          const r = cols[k].col.getBoundingClientRect();
          const dist = d.cx < r.left ? r.left - d.cx : d.cx > r.right ? d.cx - r.right : 0;
          if (dist < bestD) { bestD = dist; best = k; }
        }
        d.lane = best;
        for (const k of KEYS) cols[k].col.classList.toggle('over', k === best);
        const list = cols[best].list;
        const kids = [...list.querySelectorAll('.lifecycle-card')].filter((x) => x.dataset.id !== d.id);
        let idx = kids.length;
        for (let i = 0; i < kids.length; i++) { const r = kids[i].getBoundingClientRect(); if (d.cy < r.top + r.height / 2) { idx = i; break; } }
        d.idx = idx;
        const before = kids[idx] || null;
        list.querySelector('.lifecycle-empty')?.remove();
        if (before) { if (d.ph.nextSibling !== before || d.ph.parentNode !== list) list.insertBefore(d.ph, before); }
        else if (d.ph.parentNode !== list || d.ph.nextSibling) list.append(d.ph);
      }
      function autoScroll() {
        const d = st.drag; if (!d) return;
        const br = boardEl.getBoundingClientRect(); let moved = false;
        if (d.cx < br.left + 44) { boardEl.scrollLeft -= 14; moved = true; } else if (d.cx > br.right - 44) { boardEl.scrollLeft += 14; moved = true; }
        const list = cols[d.lane]?.list;
        if (list) { const lr = list.getBoundingClientRect(); if (d.cy < lr.top + 26 && list.scrollTop > 0) { list.scrollTop -= 10; moved = true; } else if (d.cy > lr.bottom - 26) { list.scrollTop += 10; moved = true; } }
        if (moved) track();
      }
      function endDrag() {
        const d = st.drag; if (!d) return null;
        d.stop?.(); d.ghost.remove(); d.ph.remove();
        for (const k of KEYS) cols[k].col.classList.remove('over');
        st.drag = null;
        return d;
      }
      function onUp() {
        unlisten();
        const p = st.press; st.press = null;
        if (!p) return;
        if (!st.drag) { st.sel = p.id; openCard(p.id); return; }
        const d = endDrag();
        const ok = moveCard(d.id, d.lane, d.idx, 'drag');
        if (!ok) render();
      }
      function onCancel() { unlisten(); st.press = null; if (endDrag()) render(); }

      // ----- keys -----
      st.key = (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const ae = document.activeElement;
        if (e.key === 'Enter' && ae?.tagName === 'BUTTON' && win.body.contains(ae) && ae.matches(':focus-visible')) return;
        const crash = win.body.querySelector('.ui-crash');
        if (crash) {
          if (e.key === 'Enter') { e.preventDefault(); crash.querySelector('.ui-btn.primary')?.click(); }
          else if (e.key === 'Escape') { e.preventDefault(); const b = crash.querySelectorAll('.ui-btn'); b[b.length - 1]?.click(); }
          return;
        }
        if (st.grill) { if (e.key === 'Enter') { e.preventDefault(); if (st.grill.i >= st.grill.qs.length) finishGrill(); else nextQuestion(); } else if (e.key === 'Escape') { e.preventDefault(); cancelGrill(); } return; }
        const k = e.key; const lk = k.toLowerCase();
        if (k === 'Escape') {
          e.preventDefault();
          if (st.drag) { onCancel(); return; }
          if (st.detail || st.showLearn) { st.detail = null; st.showLearn = false; render(); return; }
          st.sel = null; render(); return;
        }
        if (lk === 'n') { e.preventDefault(); newCard(); return; }
        if (lk === 'l') { e.preventDefault(); toggleLearn(); return; }
        const v = lanesView();
        if (!st.sel || !laneOf(st.sel)) {
          if (k.startsWith('Arrow')) { e.preventDefault(); const first = KEYS.map((x) => v[x][0]).find(Boolean); if (first) select(first); }
          return;
        }
        const lane = laneOf(st.sel); const li = KEYS.indexOf(lane); const idx = v[lane].indexOf(st.sel);
        if (e.shiftKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
          e.preventDefault();
          const j = OS.clamp(idx + (k === 'ArrowUp' ? -1 : 1), 0, v[lane].length - 1);
          if (j !== idx) { const holder = laneHolder(st.sel); if (holder) { refuseSibling(st.sel, holder, 'move'); return; } place(st.sel, lane, j); save(); render(); reveal(st.sel); }
          return;
        }
        if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); const j = OS.clamp(idx + (k === 'ArrowUp' ? -1 : 1), 0, v[lane].length - 1); select(v[lane][j]); return; }
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          e.preventDefault();
          for (let i = li + (k === 'ArrowLeft' ? -1 : 1); i >= 0 && i < KEYS.length; i += k === 'ArrowLeft' ? -1 : 1) {
            if (v[KEYS[i]].length) { select(v[KEYS[i]][Math.min(idx, v[KEYS[i]].length - 1)]); return; }
          }
          return;
        }
        if (k === '[' || k === ']') { e.preventDefault(); moveBy(st.sel, k === ']' ? 1 : -1); return; }
        if (k === 'Enter') { e.preventDefault(); openCard(st.sel); return; }
        if (lk === 'p') { e.preventDefault(); linkPr(st.sel); }
      };

      st.offs.push(() => { unlisten(); st.press = null; endDrag(); });
      // a retro interrupted by a closed window finishes on the next open
      for (const id of board.lanes.done.slice()) runRetro(id);
      render();
      st.api = { board: () => board, moveCard, linkPr, openCard };
    },
    onKey(win, e) { win.state.key?.(e); },
    onResize(win) {
      const root = win.body.querySelector('.lifecycle');
      root?.classList.toggle('narrow', win.width < 640);
    },
    unmount(win) { for (const f of win.state.offs || []) f(); },
  });
})();
