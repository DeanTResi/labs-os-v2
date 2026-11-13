// Planning Oracle 2: the 3.1 Oracle, now with reasoning. It checks the permitted-development Class A limits for real,
// shows its working, and says no. Also registers the `oracle "<description>"` command for the terminal.
(() => {
  const { h } = OS;

  const EFFORTS = [
    { key: 'low', usd: 0.02, passes: 1, pace: 14 },
    { key: 'medium', usd: 0.15, passes: 1, pace: 22 },
    { key: 'high', usd: 0.6, passes: 1, pace: 26 },
    { key: 'xhigh', usd: 2.4, passes: 2, pace: 30 },
    { key: 'max', usd: 24, passes: 3, pace: 34 },
  ];
  const effortOf = (k) => EFFORTS.find((e) => e.key === k) || EFFORTS[1];
  const TYPES = OS.data.extensionTypes;
  const WIDTH = OS.data.displayWidthM;
  const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
  // Within 0.1 of a limit, one decimal would show a fail as a tie: show two decimals there (three under 5 mm).
  const nAt = (v, ...lims) => { const d = Math.min(...lims.map((l) => Math.abs(v - l))); return d === 0 || d > 0.0999 ? n1(v) : v.toFixed(d < 0.005 ? 3 : 2); };
  const NEAR = { depth: [3, 4], height: [4], eaves: [3], boundary: [2] };
  const mOf = (x, k) => `${nAt(x[k], ...NEAR[k])} m`;
  const gap = (d) => (d > 0.0999 ? `${n1(d)} m` : d >= 0.005 ? `${Math.round(d * 100)} cm` : d >= 0.0005 ? `${Math.round(d * 1000)} mm` : 'under 1 mm');
  const vsLimit = (v, lim) => (v === lim ? 'Exactly at the limit.' : v < lim ? `${gap(lim - v)} to spare.` : `${gap(v - lim)} over.`);
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // ---------- the rules ----------
  // input: {type, depth, height, eaves, boundary, garden, detached (true|false|null), conservation, article4}
  // A value of null means the description did not say. Can't tell becomes unknown.
  function evaluate(x) {
    const rules = [];
    const add = (id, title, limit, yours, result, note) => rules.push({ id, name: title, limit, yours, result, note });
    const loft = x.type === 'Loft';
    const side = x.type === 'Side extension' || x.type === 'Side infill';
    const rear = x.type === 'Rear extension' || x.type === 'Wraparound';

    // A.1(b): half the curtilage
    if (loft) add('A.1(b)', 'Half the curtilage', 'half the garden', 'no ground covered', 'n/a', 'A loft covers no ground.');
    else if (x.depth == null || x.garden == null) add('A.1(b)', 'Half the curtilage', 'half the garden', x.depth == null ? 'depth not given' : 'garden not given', 'unknown', 'Can\'t tell becomes unknown.');
    else {
      const area = x.depth * WIDTH; const half = x.garden / 2;
      add('A.1(b)', 'Half the curtilage', `${nAt(half, area)} m²`, `${nAt(area, half)} m²`, area <= half ? 'pass' : 'fail', `${nAt(x.depth, ...NEAR.depth, half / WIDTH)} × ${WIDTH} m. The width is a display convention.`);
    }
    // A.1(f): rear depth
    if (!rear) add('A.1(f)', 'Rear depth', '3 m, or 4 m detached', loft ? 'no depth' : 'not a rear extension', 'n/a', loft ? 'A loft has no depth, only volume.' : 'The rear depth limit applies to rear extensions.');
    else if (x.depth == null) add('A.1(f)', 'Rear depth', '3 m, or 4 m detached', 'not given', 'unknown', 'Can\'t tell becomes unknown.');
    else if (x.detached == null) {
      const r = x.depth <= 3 ? 'pass' : x.depth > 4 ? 'fail' : 'unknown';
      add('A.1(f)', 'Rear depth', '3 m, or 4 m detached', mOf(x, 'depth'), r, 'Detached or not was not given.');
    } else {
      const lim = x.detached ? 4 : 3;
      add('A.1(f)', 'Rear depth', `${lim} m (${x.detached ? 'detached' : 'not detached'})`, mOf(x, 'depth'), x.depth <= lim ? 'pass' : 'fail', vsLimit(x.depth, lim));
    }
    // A.1(f) and (j): single-storey height
    const hId = side ? 'A.1(j)' : 'A.1(f)';
    if (loft) add(hId, 'Height', '4 m single storey', 'a loft', 'n/a', 'Lofts are Class B. The Oracle was asked about Class A.');
    else if (x.height == null) add(hId, 'Height', '4 m single storey', 'not given', 'unknown', 'Can\'t tell becomes unknown.');
    else add(hId, 'Height', '4 m single storey', mOf(x, 'height'), x.height <= 4 ? 'pass' : 'fail', vsLimit(x.height, 4));
    // A.1(i): eaves within 2 m of a boundary
    if (loft) add('A.1(i)', 'Eaves near a boundary', '3 m within 2 m', 'a loft', 'n/a', 'A loft has the eaves it already had.');
    else if (x.boundary == null) add('A.1(i)', 'Eaves near a boundary', '3 m within 2 m', 'boundary not given', 'unknown', 'Can\'t tell becomes unknown.');
    else if (x.boundary > 2) add('A.1(i)', 'Eaves near a boundary', '3 m within 2 m', `${mOf(x, 'boundary')} away`, 'pass', 'More than 2 m away, so the limit does not apply.');
    else if (x.eaves == null) add('A.1(i)', 'Eaves near a boundary', '3 m within 2 m', 'eaves not given', 'unknown', 'Can\'t tell becomes unknown.');
    else add('A.1(i)', 'Eaves near a boundary', '3 m within 2 m', `${mOf(x, 'eaves')} at ${mOf(x, 'boundary')}`, x.eaves <= 3 ? 'pass' : 'fail', x.eaves <= 3 ? 'Within 2 m, and low enough.' : `${gap(x.eaves - 3)} too high this close to the boundary.`);
    // A.2: conservation areas
    if (!x.conservation) add('A.2', 'Conservation area', 'no side extensions', 'not in one', 'pass', 'Not Article 2(3) land.');
    else if (side || x.type === 'Wraparound') add('A.2', 'Conservation area', 'no side extensions', `${x.type.toLowerCase()} in one`, 'fail', 'Side extensions are not permitted development there.');
    else if (loft) add('A.2', 'Conservation area', 'no side extensions', 'loft in one', 'fail', 'Class B does not apply on Article 2(3) land.');
    else add('A.2', 'Conservation area', 'no side extensions', 'rear, in one', 'pass', 'Single-storey rear is allowed. Cladding is not. Nobody mentioned cladding.');
    // Article 4
    add('Art. 4', 'Article 4 direction', 'none in force', x.article4 ? 'in force' : 'none', x.article4 ? 'fail' : 'pass', x.article4 ? 'Permitted development rights are withdrawn for this street.' : 'No direction on the street.');
    const count = (r) => rules.filter((x2) => x2.result === r).length;
    return { rules, pass: count('pass'), fail: count('fail'), unknown: count('unknown'), na: count('n/a') };
  }

  const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
  function verdict(ev) {
    if (ev.fail) {
      const names = ev.rules.filter((r) => r.result === 'fail').map((r) => (r.id === 'Art. 4' ? 'the Article 4 direction' : `${r.id} ${r.name.toLowerCase()}`));
      return { head: 'No.', why: `It fails ${ev.fail === 1 ? 'one limit' : `${NUM[ev.fail].toLowerCase()} limits`}: ${names.join('; ')}. Had it passed them all, the answer would also be no.` };
    }
    if (ev.unknown) return { head: 'No.', why: `${NUM[ev.unknown]} ${ev.unknown === 1 ? 'limit is' : 'limits are'} unknown, and unknown is not a yes. Had they been known, the answer would also be no.` };
    return { head: 'No.', why: 'Your proposal meets every Class A limit. The Oracle says no.' };
  }

  // ---------- the thinking ----------
  // Returns paragraphs: {text, rule (index into ev.rules, when this paragraph settles it), pass (which pass of max)}
  function think(x, ev, effortKey) {
    const e = effortOf(effortKey); const out = [];
    const say = (text, rule) => out.push({ text, rule });
    const terse = e.key === 'low';
    const desc = [
      x.type.toLowerCase(),
      x.depth != null ? `${mOf(x, 'depth')} deep` : 'depth not given',
      x.height != null ? `${mOf(x, 'height')} high` : 'height not given',
      x.eaves != null ? `eaves ${mOf(x, 'eaves')}` : 'eaves not given',
      x.boundary != null ? `${mOf(x, 'boundary')} from the boundary` : 'boundary distance not given',
      x.detached == null ? 'detached or not, not given' : x.detached ? 'detached' : 'not detached',
    ].join(', ');
    say(terse ? `A ${desc}.` : `The question is about a ${desc}. ${x.conservation ? 'In a conservation area.' : 'Not in a conservation area.'} ${x.article4 ? 'An Article 4 direction is in force.' : 'No Article 4 direction.'}`);
    if (!terse) say('Class A of the permitted development order covers enlarging a house. I will check its limits one at a time, then answer.');
    for (let pass = 1; pass <= e.passes; pass++) {
      if (e.passes > 1) say(pass === 1 ? `Pass 1 of ${e.passes}.` : pass === e.passes ? `Pass ${pass} of ${e.passes}. Same numbers. Checking whether they are still the same numbers.` : `Pass ${pass} of ${e.passes}, to be sure of pass 1.`);
      ev.rules.forEach((r, i) => {
        const settle = pass === e.passes ? i : undefined;
        const res = r.result === 'pass' ? 'Pass.' : r.result === 'fail' ? 'Fail.' : r.result === 'n/a' ? 'Does not apply.' : 'Unknown.';
        if (terse) {
          if (r.result === 'n/a') say(`${r.id} ${r.name}: does not apply.`, settle);
          else if (r.result === 'unknown') say(`${r.id} ${r.name}: ${r.yours}. ${res}`, settle);
          else if (r.id === 'A.2' || r.id === 'Art. 4') say(`${r.id} ${r.name}: ${r.note} ${res}`, settle);
          else say(`${r.id} ${r.name}: ${r.yours} against ${r.limit}. ${res}`, settle);
          return;
        }
        let t = '';
        switch (r.name) {
          case 'Half the curtilage':
            t = r.result === 'n/a' ? `${r.id}, half the curtilage. ${r.note} ${res}` : r.result === 'unknown' ? `${r.id}, half the curtilage. ${cap(r.yours)}. ${r.note} ${res}`
              : `${r.id}, half the curtilage. No width is given. The configurator draws every extension ${WIDTH} m wide, as a display convention. I will treat it as a spec. ${nAt(x.depth, ...NEAR.depth, x.garden / 2 / WIDTH)} × ${WIDTH} is ${r.yours}. Half the garden is ${r.limit}. ${res}`;
            break;
          case 'Rear depth': t = r.result === 'n/a' ? `${r.id}, rear depth. ${r.note} ${res}` : `${r.id}, rear depth. Limit ${r.limit}; this one is ${r.yours}. ${r.note} ${res}`; break;
          case 'Height': t = r.result === 'unknown' || r.result === 'n/a' ? `${r.id}, height. ${cap(r.yours)}. ${r.note} ${res}` : `${r.id}, height. ${r.yours} against ${r.limit}. ${r.note} ${res}`; break;
          case 'Eaves near a boundary': t = `${r.id}, eaves near a boundary. ${cap(r.yours)}. ${r.note} ${res}`; break;
          case 'Conservation area': t = `${r.id}, conservation areas. ${r.note} ${res}`; break;
          default: t = `Article 4. ${r.note} ${res}`;
        }
        say(t.replace(/\s+/g, ' ').trim(), settle);
        if (pass === 1 && (e.key === 'high' || e.key === 'xhigh' || e.key === 'max')) {
          if (r.name === 'Rear depth' && x.depth != null && r.result !== 'n/a') say(`Wait. Is the rear the rear? Left and right are as seen from the street, so the rear is as seen from the garden. Yes. ${mOf(x, 'depth')} still.`);
          if (r.name === 'Rear depth' && r.result === 'pass') say('The larger home extension scheme allows more depth, with prior approval. Nobody asked for prior approval. Moving on.');
        }
        if (pass === 1 && (e.key === 'xhigh' || e.key === 'max')) {
          if (r.name === 'Half the curtilage' && r.result !== 'n/a') say(`Converting to millimetres to be safe: ${x.depth != null ? Math.round(x.depth * 1000).toLocaleString('en-GB') : 'unknown'} mm deep. The result is the same in millimetres.`);
          if (r.name === 'Eaves near a boundary') say('Considering whether a fence is a boundary. It is. Considering whether a hedge is a fence. Not relevant.');
        }
      });
    }
    const v = verdict(ev);
    say(terse ? `${ev.pass} pass, ${ev.fail} fail, ${ev.unknown} unknown.` : `Tally: ${ev.pass} pass, ${ev.fail} fail, ${ev.unknown} unknown, ${ev.na} do not apply.`);
    if (e.key === 'max') say('Considering saying yes. Considered.');
    else if (!terse) say(ev.fail || ev.unknown ? 'That settles it.' : 'Every limit is met. That settles it.');
    say(`Answer: ${v.head}`);
    return out;
  }

  // ---------- free text, for the command ----------
  function parse(text) {
    const s = ` ${String(text).toLowerCase().replace(/metres?|meters?/g, 'm').replace(/\s+/g, ' ')} `;
    const x = { type: null, depth: null, height: null, eaves: null, boundary: null, garden: null, detached: null, conservation: false, article4: false, notes: [] };
    if (/wrap/.test(s)) x.type = 'Wraparound';
    else if (/infill/.test(s)) x.type = 'Side infill';
    else if (/\bside\b/.test(s)) x.type = 'Side extension';
    else if (/\b(loft|dormer)\b/.test(s)) x.type = 'Loft';
    else if (/\b(rear|back)\b/.test(s)) x.type = 'Rear extension';
    else { x.type = 'Rear extension'; x.notes.push('type not given: assumed rear'); }
    if (/\b(not|non)[\s-]+detached\b/.test(s) || /semi|terrace/.test(s)) x.detached = false;
    else if (/\bdetached\b/.test(s)) x.detached = true;
    x.conservation = /conservation/.test(s) && !/(not|no|outside)\s+(?:in\s+)?(?:a\s+)?conservation/.test(s);
    x.article4 = /article\s*4/.test(s) && !/(no|not|without)\s+(?:an?\s+)?article\s*4/.test(s);
    const re = /(\d+(?:\.\d+)?)\s*(mm|cm|m²|m2|sq ?m|m)?(?![\w²])/g;
    let mt; const loose = [];
    while ((mt = re.exec(s))) {
      let v = Number(mt[1]); const unit = mt[2] || '';
      const before = s.slice(Math.max(0, mt.index - 28), mt.index); const after = s.slice(mt.index + mt[0].length, mt.index + mt[0].length + 34);
      if (/^\s*(?:x|×|by)\s*\d/.test(after) && !unit) continue;
      if (/m²|m2|sq ?m/.test(unit) || /(garden|curtilage|plot)\s*(?:of|is|:)?\s*$/.test(before) || /^\s*(?:of\s+)?(?:garden|curtilage|plot)/.test(after)) { x.garden = v; continue; }
      if (unit === 'mm') v /= 1000; else if (unit === 'cm') v /= 100;
      if (/article\s*$/.test(before)) continue;
      if (/eaves?\s*(?:height)?\s*(?:of|at|is|:)?\s*$/.test(before) || /^\s*(?:to the |at the |high at the )?eaves/.test(after)) x.eaves = v;
      else if (/^\s*(?:from|to|off|of|away from)\s+(?:the\s+)?(?:\w+\s+)?(?:boundary|fence|neighbour)/.test(after) || /(boundary|fence)\s*(?:distance)?\s*(?:of|is|:)?\s*$/.test(before)) x.boundary = v;
      else if (/^\s*(?:high|tall|in height)/.test(after) || /(height|high)\s*(?:of|is|:)?\s*$/.test(before)) x.height = v;
      else if (/^\s*(?:deep|depth|long|out|rear|back|side|wrap|single|extension|projection|beyond)/.test(after) || /(depth|deep|projecting|extends?(?: out)?)\s*(?:of|by|is|:)?\s*$/.test(before)) x.depth = v;
      else if (unit === 'm' || unit === 'mm' || unit === 'cm') loose.push(v);
    }
    for (const v of loose) {
      const k = ['depth', 'height'].find((key) => x[key] == null);
      if (!k) break;
      x[k] = v; x.notes.push(`${mOf(x, k)} read as ${k}`);
    }
    return x;
  }

  // ---------- the window ----------
  const CSS = `
.or-root { position: absolute; inset: 0; container: or-root / inline-size; background: var(--surface); }
.or { position: absolute; inset: 0; display: grid; grid-template-columns: 300px minmax(0, 1fr); }
.or-form { border-right: 1px solid var(--border); overflow: auto; padding: 14px 14px 16px; display: flex; flex-direction: column; gap: 10px; background: var(--surface2); }
.or-brand { display: flex; align-items: center; gap: 10px; }
.or-eye { width: 44px; height: 28px; flex: none; }
.or-eye .lid { fill: none; stroke: var(--accent); stroke-width: 2.2; }
.or-eye .iris { fill: var(--accent2); transition: transform .4s; transform-origin: 22px 14px; }
.or-eye .pupil { fill: var(--bg); }
.or-eye.thinking .iris { animation: or-look 1.6s ease-in-out infinite; }
.or-eye.shut .iris { transform: scaleY(.08); }
@keyframes or-look { 0%, 100% { transform: translateX(-5px); } 50% { transform: translateX(5px); } }
.or-brand b { display: block; font-size: 15px; }
.or-brand span { font-size: 11px; color: var(--muted); }
.or-f { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
.or-q { overflow-wrap: anywhere; }
.or-f label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--muted); min-width: 0; }
.or-f label.wide { grid-column: 1 / -1; }
.or-f .ui-input, .or-f .ui-select { width: 100%; min-width: 0; }
.or-unit { position: relative; }
.or-unit .ui-input { padding-right: 30px; }
.or-unit i { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-style: normal; color: var(--faint); font-size: 11px; pointer-events: none; }
.or-seg { display: flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.or-seg button { flex: 1; border: 0; background: var(--bg); color: var(--muted); padding: 5px 4px; cursor: pointer; font: inherit; font-size: 12px; }
.or-seg button + button { border-left: 1px solid var(--border); }
.or-seg button.on { background: var(--sel); color: var(--fg); font-weight: 700; }
.or-checks { display: flex; flex-direction: column; gap: 5px; font-size: 12px; }
.or-checks label { display: flex; gap: 8px; align-items: center; color: var(--fg); cursor: pointer; }
.or-checks input { accent-color: var(--accent); margin: 0; }
.or-effort { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.or-effort button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--muted); cursor: pointer; font: inherit; font-size: 11px; min-width: 0; }
.or-effort button b { color: var(--fg); font-size: 12px; }
.or-effort button i { font-style: normal; font-size: 10px; color: var(--faint); }
.or-effort button.on { border-color: var(--accent); background: var(--sel); }
.or-effort button.on i { color: var(--muted); }
.or-effort button[data-k="max"].on { border-color: var(--bad); }
.or-effort button[data-k="max"].on i { color: var(--bad); }
.or-meter { display: flex; gap: 3px; margin-top: 4px; }
.or-meter i { flex: 1; height: 4px; border-radius: 2px; background: var(--border); }
.or-meter i.on { background: linear-gradient(90deg, var(--accent), var(--accent2)); }
.or-meter.max i.on { background: var(--bad); }
.or-go { justify-content: center; padding: 7px 10px; }
.or-cli { font-size: 11px; color: var(--faint); line-height: 1.5; word-break: break-word; }
.or-cli code { color: var(--muted); }
.or-stats { font-size: 11px; color: var(--muted); border-top: 1px dashed var(--border); padding-top: 8px; }
.or-out { overflow: auto; padding: 18px 22px 26px; display: flex; flex-direction: column; gap: 14px; min-width: 0; container: or-out / inline-size; }
@container or-out (max-width: 560px) { .or-rules td.or-note, .or-rules th.or-note { display: none; } .or-verdict .no { font-size: 36px; } }
.or-empty { margin: auto; text-align: center; color: var(--muted); max-width: 42ch; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.or-empty .or-eye { width: 96px; height: 60px; }
.or-q { align-self: flex-end; max-width: min(560px, 92%); background: var(--sel); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); border-radius: 10px 10px 2px 10px; padding: 8px 12px; color: var(--fg); }
.or-q small { display: block; color: var(--muted); font-size: 11px; margin-top: 2px; }
.or-think { border-left: 2px solid var(--border); padding-left: 12px; color: var(--muted); }
.or-think summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; user-select: none; }
.or-think summary::-webkit-details-marker { display: none; }
.or-think summary::before { content: '▸'; color: var(--faint); transition: transform .15s; }
.or-think[open] summary::before { transform: rotate(90deg); }
.or-think summary .cost { margin-left: auto; color: var(--faint); font-size: 11px; }
.or-think .body { margin-top: 6px; font-size: 12px; line-height: 1.6; color: color-mix(in srgb, var(--muted) 82%, var(--bg)); }
.or-think .body p { margin: 0 0 6px; }
.or-think .body p.settle { color: var(--muted); }
.or-cursor { display: inline-block; width: 7px; height: 13px; background: var(--muted); vertical-align: -2px; margin-left: 2px; animation: ui-blink 1s steps(1) infinite; }
.or-shimmer { background: linear-gradient(90deg, var(--muted) 0%, var(--fg) 50%, var(--muted) 100%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: or-sheen 1.6s linear infinite; }
@keyframes or-sheen { from { background-position: 100% 0; } to { background-position: -100% 0; } }
.or-rules { width: 100%; border-collapse: collapse; font-size: 12px; }
.or-rules th { text-align: left; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); font-weight: 700; padding: 0 8px 5px 0; border-bottom: 1px solid var(--border); }
.or-rules td { padding: 5px 8px 5px 0; border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent); vertical-align: top; }
.or-rules td.id { color: var(--faint); white-space: nowrap; }
.or-rules td.res { white-space: nowrap; font-weight: 700; }
.or-rules td.or-note { color: var(--faint); font-size: 11px; min-width: 18ch; }
.or-rules tr.pending td { opacity: .35; }
.or-rules .pass { color: var(--good); } .or-rules .fail { color: var(--bad); } .or-rules .unknown { color: var(--warn); } .or-rules .na { color: var(--faint); }
.or-verdict { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; align-items: center; padding: 14px 16px; border-radius: var(--radius); border: 2px solid var(--bad); background: color-mix(in srgb, var(--bad) 8%, var(--surface)); animation: or-in .35s cubic-bezier(.2,.8,.2,1); }
.or-verdict .no { font-size: 46px; font-weight: 800; line-height: 1; color: var(--bad); letter-spacing: -.02em; grid-row: span 2; }
.or-verdict .why { color: var(--fg); }
.or-verdict .tally { color: var(--muted); font-size: 11px; }
@keyframes or-in { from { opacity: 0; transform: translateY(6px) scale(.98); } }
@container or-root (max-width: 680px) {
  .or { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto; overflow: auto; }
  .or-form { border-right: 0; border-bottom: 1px solid var(--border); overflow: visible; }
  .or-out { overflow: visible; padding: 14px; }
}
`;

  const eyeSvg = (cls = '') => `<svg class="or-eye ${cls}" viewBox="0 0 44 28" aria-hidden="true"><path class="lid" d="M2 14 C10 3, 34 3, 42 14 C34 25, 10 25, 2 14 Z"/><g class="iris"><circle cx="22" cy="14" r="7.5"/><circle class="pupil" cx="22" cy="14" r="3.2"/></g></svg>`;
  const RES = { pass: ['✓', 'pass', 'pass'], fail: ['✗', 'fail', 'fail'], unknown: ['?', 'unknown', 'unknown'], 'n/a': ['–', 'n/a', 'na'] };

  registerApp({
    id: 'oracle', title: 'Planning Oracle 2', icon: 'eye',
    desc: 'Checks the Class A limits with visible reasoning, then says no',
    keywords: ['planning', 'permission', 'permitted development', 'class a', 'extension', 'reasoning', 'thinking', 'council'],
    size: [1020, 680],
    mount(win, arg) {
      if (!document.getElementById('oracle-css')) document.head.append(h('style', { id: 'oracle-css' }, CSS));
      const st = win.state;
      const saved = OS.store.get('oracle.form', null);
      const F = { type: 'Rear extension', depth: 3, height: 3, eaves: 2.5, boundary: 1, garden: 80, detached: false, conservation: false, article4: false, effort: 'medium', ...(saved || {}) };
      const stats = OS.store.get('oracle.stats', { asked: 0, yes: 0 });
      const save = () => OS.store.set('oracle.form', F);

      const inputs = {};
      const num = (key, label, unit, step = 0.1) => {
        const inp = inputs[key] = h('input', { class: 'ui-input', type: 'number', min: '0', step: String(step), value: String(F[key]), 'aria-label': label, oninput: () => { const v = parseFloat(inp.value); if (Number.isFinite(v) && v >= 0) { F[key] = v; save(); syncCli(); } } });
        return h('label', null, label, h('div', { class: 'or-unit' }, inp, h('i', null, unit)));
      };
      const typeSel = h('select', { class: 'ui-select', 'aria-label': 'Extension type', onchange: () => { F.type = typeSel.value; save(); syncCli(); } }, TYPES.map((t) => h('option', { value: t, selected: t === F.type }, t)));
      const segBtns = [['Detached', true], ['Semi or terrace', false]].map(([t, v]) => h('button', { type: 'button', class: F.detached === v ? 'on' : '', onclick: () => { F.detached = v; segBtns.forEach((b, i) => b.classList.toggle('on', i === (v ? 0 : 1))); save(); syncCli(); } }, t));
      const check = (key, label) => h('label', null, inputs[key] = h('input', { type: 'checkbox', checked: !!F[key], onchange: (e) => { F[key] = e.target.checked; save(); syncCli(); } }), label);
      const meterEl = h('div', { class: 'or-meter' });
      const effortBtns = EFFORTS.map((e) => h('button', { type: 'button', dataset: { k: e.key }, class: e.key === F.effort ? 'on' : '', title: `${e.key} effort: ${OS.usd(e.usd)}`, onclick: () => setEffort(e.key) }, h('b', null, e.key), h('i', null, OS.usd(e.usd))));
      const goBtn = h('button', { class: 'ui-btn primary or-go', onclick: () => consult() }, 'Consult the Oracle');
      const cli = h('div', { class: 'or-cli' });
      const statsEl = h('div', { class: 'or-stats' });
      const brandEye = h('span', { html: eyeSvg() }).firstChild;
      const form = h('div', { class: 'or-form' },
        h('div', { class: 'or-brand' }, brandEye, h('div', null, h('b', null, 'Planning Oracle 2'), h('span', null, 'Now with reasoning. Same answer.'))),
        h('div', { class: 'or-f' },
          h('label', { class: 'wide' }, 'Extension type', typeSel),
          num('depth', 'Depth', 'm'), num('height', 'Height', 'm'), num('eaves', 'Eaves height', 'm'), num('boundary', 'To the boundary', 'm'),
          h('label', { class: 'wide' }, 'Garden (curtilage)', h('div', { class: 'or-unit' }, inputs.garden = h('input', { class: 'ui-input', type: 'number', min: '1', step: '1', value: String(F.garden), 'aria-label': 'Garden area', oninput: (e) => { const v = parseFloat(e.target.value); if (v > 0) { F.garden = v; save(); syncCli(); } } }), h('i', null, 'm²'))),
          h('label', { class: 'wide' }, 'The house', h('div', { class: 'or-seg' }, segBtns))),
        h('div', { class: 'or-checks' }, check('conservation', 'In a conservation area'), check('article4', 'Article 4 direction in force')),
        h('div', null, h('div', { class: 'ui-title', style: { marginBottom: '5px' } }, 'Effort'), h('div', { class: 'or-effort' }, effortBtns), meterEl),
        goBtn, cli, statsEl);
      const out = h('div', { class: 'or-out', 'aria-live': 'polite' });
      form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); consult(); } });
      win.body.style.overflow = 'hidden';
      win.body.append(h('div', { class: 'or-root' }, h('div', { class: 'or' }, form, out)));

      function setEffort(k) {
        F.effort = k; save();
        effortBtns.forEach((b) => b.classList.toggle('on', b.dataset.k === k));
        const i = EFFORTS.findIndex((e) => e.key === k);
        meterEl.innerHTML = ''; meterEl.classList.toggle('max', k === 'max');
        EFFORTS.forEach((e, j) => meterEl.append(h('i', { class: j <= i ? 'on' : '' })));
        goBtn.textContent = `Consult the Oracle · ${OS.usd(effortOf(k).usd)}`;
        syncCli();
      }
      function describe() {
        return `${nAt(F.depth, ...NEAR.depth)}m ${F.type.toLowerCase()}, ${nAt(F.height, ...NEAR.height)}m high, eaves ${nAt(F.eaves, ...NEAR.eaves)}m, ${nAt(F.boundary, ...NEAR.boundary)}m from the boundary, ${F.detached ? 'detached' : 'semi'}${F.conservation ? ', conservation area' : ''}${F.article4 ? ', article 4' : ''}, ${n1(F.garden)}m2 garden`;
      }
      function syncCli() {
        cli.innerHTML = `Or from brickty:<br><code>${OS.esc(`oracle "${describe()}"${F.effort !== 'medium' ? ` --effort ${F.effort}` : ''}`)}</code>`;
      }
      function paintStats() { statsEl.textContent = `Consulted ${stats.asked} ${stats.asked === 1 ? 'time' : 'times'}. Yes ${stats.yes} times.`; }
      function emptyState() {
        out.innerHTML = '';
        out.append(h('div', { class: 'or-empty' }, h('span', { html: eyeSvg() }).firstChild,
          h('div', { class: 'ui-big' }, 'Ask the Oracle'),
          h('div', null, 'Describe the extension and pick an effort. The Oracle will check every Class A limit, show its working, and answer.'),
          h('div', { class: 'ui-faint' }, 'In 3.1 it said no without explaining. It now explains.')));
      }
      setEffort(F.effort); paintStats(); emptyState();

      // Wide: the answer column scrolls. Narrow: the whole window does.
      const scrollEnd = () => { out.scrollTop = out.scrollHeight; const g = out.parentElement; g.scrollTop = g.scrollHeight; };
      let busy = false;
      async function consult() {
        if (busy) return;
        busy = true; goBtn.disabled = true;
        const x = { ...F };
        const e = effortOf(F.effort);
        const ev = evaluate(x);
        const paras = think(x, ev, e.key);
        const v = verdict(ev);
        out.innerHTML = '';
        out.append(h('div', { class: 'or-q' }, `${x.type}, ${mOf(x, 'depth')} deep, ${mOf(x, 'height')} high. Is it permitted development?`,
          h('small', null, `eaves ${mOf(x, 'eaves')} · ${mOf(x, 'boundary')} to the boundary · ${x.detached ? 'detached' : 'semi or terrace'} · garden ${n1(x.garden)} m²${x.conservation ? ' · conservation area' : ''}${x.article4 ? ' · Article 4' : ''}`)));
        const label = h('span', { class: 'or-shimmer' }, 'Thinking');
        const cost = h('span', { class: 'cost' }, `${e.key} effort`);
        const body = h('div', { class: 'body' });
        const det = h('details', { class: 'or-think', open: true }, h('summary', null, label, cost), body);
        out.append(det);
        const rows = ev.rules.map((r) => {
          const [mark, word, cls] = RES[r.result];
          return h('tr', { class: 'pending' }, h('td', { class: 'id' }, r.id), h('td', null, r.name), h('td', null, r.limit), h('td', null, r.yours),
            h('td', { class: 'res ' + cls }, `${mark} ${word}`), h('td', { class: 'or-note' }, r.note));
        });
        const head = h('tr', null, h('th', { colSpan: 2 }, 'Rule'), h('th', null, 'Limit'), h('th', null, 'Yours'), h('th', null, 'Result'), h('th', { class: 'or-note' }, 'Note'));
        const table = h('table', { class: 'or-rules' }, h('thead', null, head), h('tbody', null, rows));
        out.append(table);
        brandEye.classList.add('thinking');
        const t0 = performance.now();
        const slices = e.key === 'max' ? 8 : 1;
        let charged = 0;
        const pay = (usd) => {
          const r = OS.spend.add(usd, `oracle ${e.key}: ${x.type.toLowerCase()} ${n1(x.depth)} m`, 'oracle');
          if (!r.ok) return r.message;
          charged += usd; cost.textContent = `${e.key} effort · ${OS.usd(charged)}`; return null;
        };
        let refused = pay(e.usd / slices);
        const cursor = h('span', { class: 'or-cursor' });
        for (let i = 0; i < paras.length && !refused; i++) {
          const para = paras[i];
          const p = h('p', { class: para.rule != null ? 'settle' : '' });
          body.append(p); p.append(cursor);
          const words = para.text.split(' ');
          for (let w = 0; w < words.length; w += 2) {
            p.insertBefore(document.createTextNode((w ? ' ' : '') + words.slice(w, w + 2).join(' ')), cursor);
            await win.sleep(e.pace + Math.random() * e.pace);
            if (win.closed) return;
            scrollEnd();
          }
          if (para.rule != null) rows[para.rule].classList.remove('pending');
          if (slices > 1 && i > 0 && i % Math.ceil(paras.length / slices) === 0 && charged < e.usd - 1e-6) refused = pay(e.usd / slices);
        }
        cursor.remove();
        if (!refused && slices > 1) while (charged < e.usd - 1e-6 && !refused) refused = pay(e.usd / slices);
        const secs = Math.max(1, Math.round((performance.now() - t0) * OS.speed / 1000));
        brandEye.classList.remove('thinking');
        label.classList.remove('or-shimmer');
        stats.asked++; OS.store.set('oracle.stats', stats); paintStats();
        if (refused) {
          label.textContent = `Stopped thinking after ${secs} s`;
          rows.forEach((r) => r.classList.remove('pending'));
          out.append(h('div', { class: 'or-verdict' }, h('div', { class: 'no' }, 'No.'), h('div', { class: 'why' }, 'Reached without finishing the thought.'), h('div', { class: 'tally' }, 'The daily cap stopped the reasoning. It did not change the answer.')));
          OS.crash(win, {
            title: 'The Oracle ran out of thinking', code: 'ORACLE-0x64 DAILY_CAP', icon: 'eye',
            lines: [refused, `${e.key} effort was spending ${OS.usd(e.usd)} on this question. The answer was always going to be no.`],
          });
          busy = false; goBtn.disabled = false;
          return;
        }
        label.textContent = `Thought for ${secs} s`;
        brandEye.classList.add('shut'); win.after(500, () => brandEye.classList.remove('shut'));
        out.append(h('div', { class: 'or-verdict' }, h('div', { class: 'no' }, v.head), h('div', { class: 'why' }, v.why),
          h('div', { class: 'tally' }, `${ev.pass} pass · ${ev.fail} fail · ${ev.unknown} unknown · ${ev.na} n/a · ${e.key} effort · ${OS.usd(charged)}`)));
        scrollEnd();
        busy = false; goBtn.disabled = false;
      }
      // Put F back into the controls, for OS.open('oracle', {...}) and for anything else that sets it.
      function setForm(values) {
        Object.assign(F, values || {});
        if (!TYPES.includes(F.type)) F.type = 'Rear extension';
        typeSel.value = F.type;
        for (const k of ['depth', 'height', 'eaves', 'boundary', 'garden']) inputs[k].value = String(F[k]);
        inputs.conservation.checked = !!F.conservation; inputs.article4.checked = !!F.article4;
        segBtns.forEach((b, i) => b.classList.toggle('on', i === (F.detached ? 0 : 1)));
        setEffort(effortOf(F.effort).key);
        save();
      }
      st.consult = consult; st.setEffort = setEffort; st.setForm = setForm; st.F = F;
      if (arg && typeof arg === 'object') setForm(arg);
    },
    onArg(win, arg) { if (arg && typeof arg === 'object') win.state.setForm?.(arg); },
    onKey(win, e) {
      if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); win.state.consult?.(); }
    },
  });

  // ---------- the command ----------
  const wrap = (text, width) => {
    const out = []; let cur = '';
    for (const w of text.split(' ')) { if ((cur + ' ' + w).trim().length > width) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) out.push(cur);
    return out;
  };
  OS.commands.register('oracle', {
    desc: 'Ask Planning Oracle 2 about an extension. It checks Class A, then says no.',
    usage: 'oracle "<description>" [--effort low|medium|high|xhigh|max]',
    complete: () => ['--effort', ...EFFORTS.map((e) => e.key)],
    async run(args, io) {
      let effort = 'medium'; const words = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--effort' || a === '-e') { effort = args[++i] || effort; continue; }
        const mm = /^--effort=(\w+)$/.exec(a); if (mm) { effort = mm[1]; continue; }
        if (a === '--help' || a === '-h') { words.length = 0; break; }
        words.push(a);
      }
      if (!EFFORTS.some((e) => e.key === effort)) { io.println(`oracle: unknown effort '${effort}'. Choose low, medium, high, xhigh or max.`, 'bad'); return 2; }
      const text = words.join(' ').trim();
      if (!text) {
        io.println('usage: oracle "<description>" [--effort low|medium|high|xhigh|max]', 'muted');
        io.println('example: oracle "4m rear extension, 3.5m high, detached"', 'muted');
        io.println('The Oracle needs a question. The answer is already known.', 'faint');
        return 2;
      }
      const e = effortOf(effort);
      const x = parse(text);
      const ev = evaluate(x);
      const width = Math.max(40, Math.min(100, (io.cols || 100) - 4));
      io.println(`Planning Oracle 2 · ${e.key} effort · ${OS.usd(e.usd)}`, 'accent');
      const g = (k) => (x[k] == null ? '?' : mOf(x, k));
      io.println(`read: ${x.type} · depth ${g('depth')} · height ${g('height')} · eaves ${g('eaves')} · boundary ${g('boundary')} · garden ${x.garden == null ? '?' : `${n1(x.garden)} m²`} · ${x.detached == null ? 'detached ?' : x.detached ? 'detached' : 'not detached'} · conservation ${x.conservation ? 'yes' : 'no'} · Article 4 ${x.article4 ? 'yes' : 'no'}`, 'muted');
      for (const nt of x.notes) io.println(`note: ${nt}`, 'faint');
      const first = OS.spend.add(e.key === 'max' ? e.usd / 3 : e.usd, `oracle ${e.key}: "${text.slice(0, 40)}"`, 'oracle');
      if (!first.ok) { io.println(first.message, 'bad'); io.println('verdict  No. (reached without thinking)', 'bold'); return 1; }
      let paid = e.key === 'max' ? e.usd / 3 : e.usd;
      io.println('');
      io.println('thinking', 'faint');
      const paras = think(x, ev, e.key);
      for (let i = 0; i < paras.length; i++) {
        for (const line of wrap(paras[i].text, width - 2)) {
          io.println('  ' + line, 'faint');
          await io.sleep(e.pace * 3);
          if (io.aborted) { io.println('^C The Oracle stopped thinking. The answer is still no.', 'warn'); return 130; }
        }
        if (e.key === 'max' && paid < e.usd - 1e-6 && i === Math.floor(paras.length * paid / e.usd)) {
          const r = OS.spend.add(e.usd / 3, `oracle max: "${text.slice(0, 40)}", pass ${Math.round(paid / (e.usd / 3)) + 1}`, 'oracle');
          if (!r.ok) { io.println(r.message, 'bad'); io.println('verdict  No. (reached without finishing the thought)', 'bold'); return 1; }
          paid += e.usd / 3;
        }
      }
      io.println('');
      io.println('checks', 'faint');
      const cls = { pass: 'ok', fail: 'bad', unknown: 'warn', 'n/a': 'faint' };
      for (const r of ev.rules) {
        const [mark] = RES[r.result];
        io.println(`  ${mark} ${(r.id + ' ' + r.name).padEnd(30)} ${r.yours.padEnd(22).slice(0, 22)} limit ${r.limit}`, cls[r.result]);
      }
      const v = verdict(ev);
      io.println('');
      io.println(`verdict  ${v.head}`, 'bold');
      for (const line of wrap(v.why, width - 9)) io.println('         ' + line, 'muted');
      io.println(`         ${ev.pass} pass · ${ev.fail} fail · ${ev.unknown} unknown · ${ev.na} n/a · ${OS.usd(paid)}`, 'faint');
      return 0;
    },
  });
  OS.commands.alias('planning-oracle', 'oracle');
})();
