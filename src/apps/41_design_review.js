// Design Review (id design-review): "Design review, round N". A board with a miniature of the configurator and
// numbered comment pins from three roles that mean three different things by "design".
// "Apply all fixes" writes the next round to OS.store, then emits design-review:apply with the round's fixes.
// The contract (event, payload, fix kinds, store keys) is defined once, at the top of 40_configurator.js.
(() => {
  const { h } = OS;
  const P = 'design-review-';
  const K = (s) => s.split(' ').filter(Boolean).map((c) => P + c).join(' ');

  const ROLES = {
    product: { label: 'Product design', short: 'Product', means: 'what the product does' },
    ui: { label: 'UI design', short: 'UI', means: 'how the screen looks' },
    arch: { label: 'Building architecture', short: 'Architecture', means: 'the building itself' },
  };
  const C = (role, text, fix, note) => ({ role, text, fix, note });

  // Rounds 1 to 5 undo each other exactly, so round 6 always starts from the same design.
  const ROUNDS = {
    1: [
      C('ui', 'Corners read as enterprise software. Two more pixels.', { kind: 'radius', delta: 2 }),
      C('product', '‘Save design’ sounds like work. People keep things.', { kind: 'rename', from: 'Save design', to: 'Keep design' }),
      C('arch', 'A lean-to at 15° reads as a shed. Make it 20°.', { kind: 'roofPitch', delta: 5 }),
      C('ui', 'Headings should feel more like headings.', { kind: 'headingCase', value: 'title' }),
    ],
    2: [
      C('product', 'Nobody keeps a design. They save it.', { kind: 'rename', from: 'Keep design', to: 'Save design' }, 'Reverses round 1'),
      C('ui', 'The price bar sits too low. It looks like it is leaving.', { kind: 'priceBarOffset', delta: -4 }),
      C('arch', 'Window frames should match the existing house. White.', { kind: 'frames', value: 'white' }),
      C('ui', 'Title Case is shouting quietly. Back to sentence case.', { kind: 'headingCase', value: 'sentence' }, 'Reverses round 1'),
    ],
    3: [
      C('ui', 'Make the new configurator icons fill ~82% of the tiles.', { kind: 'iconScale', value: 0.82 }),
      C('arch', '20° is right for a shed. This is not a shed. 15°.', { kind: 'roofPitch', delta: -5 }, 'Reverses round 1'),
      C('product', 'Rounded corners test as friendlier. Two more.', { kind: 'radius', delta: 2 }),
      C('ui', 'The price bar now floats. Bring it down 4px.', { kind: 'priceBarOffset', delta: 4 }, 'Reverses round 2'),
    ],
    4: [
      C('product', 'Users say the tiles feel cramped.', { kind: 'gap', delta: 2 }),
      C('ui', 'The corners are now soft enough to sleep on. Minus four.', { kind: 'radius', delta: -4 }, 'Reverses rounds 1 and 3'),
      C('arch', 'White frames on a new extension look like a 1990s conservatory. Anthracite.', { kind: 'frames', value: 'anthracite' }, 'Reverses round 2'),
      C('ui', 'The selected tile should be filled, not ringed.', { kind: 'selected', value: 'fill' }),
    ],
    5: [
      C('ui', 'The gap is now generous. Two pixels back.', { kind: 'gap', delta: -2 }, 'Reverses round 4'),
      C('product', 'A filled tile looks pressed. Ring it.', { kind: 'selected', value: 'ring' }, 'Reverses round 4'),
      C('ui', '82% crowds the tile. Back to 72%.', { kind: 'iconScale', value: 0.72 }, 'Reverses round 3'),
      C('arch', 'The extension complies. No notes on the building.', { kind: 'none' }),
    ],
    6: [
      C('ui', 'Corners are still sharp for a home product. Plus two.', { kind: 'radius', delta: 2 }),
      C('product', '‘Save design’ tested worse than ‘Keep design’ with three people.', { kind: 'rename', from: 'Save design', to: 'Keep design' }),
      C('arch', 'The pitched roof is too shallow to shed rain, in the drawing. Plus five degrees.', { kind: 'roofPitch', delta: 5 }),
      C('ui', 'The price bar should rise to meet the user. Up 4px.', { kind: 'priceBarOffset', delta: -4 }),
      C('product', 'Two VAT ticks is one too many. Keep the one in the cost heading.', { kind: 'vatTick', value: 'heading' }),
    ],
    7: [
      C('ui', 'Make the new configurator icons fill ~82% of the phone tiles.', { kind: 'iconScale', value: 0.82 }),
      C('product', 'Customers asked for a gabled roof on the side extension. Bring it back.', { kind: 'option', ext: 'side', option: 'gabled', on: true }),
      C('ui', 'Headings in Title Case. It is a product, not a letter.', { kind: 'headingCase', value: 'title' }),
      C('ui', 'The price deserves more presence. Plus 2px.', { kind: 'priceSize', delta: 2 }),
      C('product', 'The price is now the loudest thing on the page. Minus 2px.', { kind: 'priceSize', delta: -2 }, 'Contradicts 4'),
      C('product', '‘Keep design’ sounds permanent. Back to ‘Save design’.', { kind: 'rename', from: 'Keep design', to: 'Save design' }, 'Reverses round 6'),
    ],
    8: [
      C('ui', 'The corners are too soft now. The round 5 radius was right.', { kind: 'radius', delta: -2 }, 'Reverses round 6'),
      C('arch', 'Window frames should match the existing house. White.', { kind: 'frames', value: 'white' }, 'As round 2'),
      C('product', 'Move the price bar up again, so it clears the feedback prompt.', { kind: 'priceBarOffset', delta: -4 }),
      C('ui', 'Two columns of tiles reads calmer.', { kind: 'tileCols', value: 2 }),
      C('arch', 'A gabled side roof needs a valley gutter nobody has drawn. Remove the Gabled roof option from the side extension.', { kind: 'option', ext: 'side', option: 'gabled', on: false }, 'Reverses round 7'),
      C('arch', 'Steeper again. The first-floor windows can cope.', { kind: 'roofPitch', delta: 5 }),
    ],
    9: [
      C('product', 'Three columns showed more options above the fold.', { kind: 'tileCols', value: 3 }, 'Reverses round 8'),
      C('ui', 'Section headings feel timid. Plus 100 weight.', { kind: 'headingWeight', delta: 100 }),
      C('product', 'Rename ‘See breakdown’ to ‘What’s included’. It sounds less like a car.', { kind: 'rename', from: 'See breakdown', to: 'What’s included' }),
      C('arch', 'White frames on a new extension look like a 1990s conservatory. Anthracite.', { kind: 'frames', value: 'anthracite' }, 'As round 4'),
      C('ui', 'VAT tick in the cost heading and price bar.', { kind: 'vatTick', value: 'both' }, 'Reverses round 6'),
    ],
    10: [
      C('product', 'Go back to round 1.', { kind: 'reset' }),
      C('ui', 'Agreed. Round 1 had the best corners.', null, 'Agrees with 1'),
      C('arch', 'Agreed. Round 1 had the best roof.', null, 'Agrees with 1'),
    ],
  };

  // The configurator answers with its current style; null when it is not installed.
  const style = () => { let got = null; OS.emit('configurator:style-request', (s) => { got = s; }); return got; };
  const roundNow = () => OS.clamp(Number(OS.store.get('design-review.round', 6)) || 6, 1, 10);
  const prTitle = (n) => `Configurator redesign fixes from the round ${n} design review`;
  const sign = (n) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
  const CASES = { sentence: 'Sentence case', title: 'Title Case', upper: 'UPPERCASE' };
  function describe(f) {
    if (!f) return '';
    switch (f.kind) {
      case 'radius': return `radius ${sign(f.delta)}px`;
      case 'gap': return `tile gap ${sign(f.delta)}px`;
      case 'priceBarOffset': return `price bar ${f.delta < 0 ? 'up' : 'down'} ${Math.abs(f.delta)}px`;
      case 'priceSize': return `price ${sign(f.delta)}px`;
      case 'iconScale': return `icons fill ${Math.round(f.value * 100)}% of the tile`;
      case 'tileCols': return `${f.value} tile columns`;
      case 'selected': return `selected tile: ${f.value === 'fill' ? 'filled' : 'ringed'}`;
      case 'headingCase': return `headings: ${CASES[f.value]}`;
      case 'headingWeight': return `heading weight ${sign(f.delta)}`;
      case 'rename': return `“${f.from}” → “${f.to}”`;
      case 'vatTick': return `VAT tick: ${f.value === 'both' ? 'heading and bar' : f.value === 'bar' ? 'price bar' : 'cost heading'}`;
      case 'frames': return `frames: ${f.value}`;
      case 'roofPitch': return `roof pitch ${sign(f.delta)}°`;
      case 'option': return `${f.on ? 'restore' : 'remove'} ${f.option} roof (${f.ext})`;
      case 'none': return 'no change';
      case 'reset': return 'back to round 1';
      default: return f.kind;
    }
  }
  const ANCHOR = {
    radius: 'tiles', gap: 'tiles', tileCols: 'tiles', iconScale: 'icon', selected: 'sel', headingCase: 'heading', headingWeight: 'heading',
    priceBarOffset: 'bar', priceSize: 'price', vatTick: 'vat', frames: 'glazing', roofPitch: 'roof', option: 'roofRow', none: 'house', reset: 'frame',
  };
  const anchorOf = (f) => (!f ? 'frame' : f.kind === 'rename' ? (/design/.test(f.from) ? 'save' : 'link') : ANCHOR[f.kind] || 'frame');

  // Feedback from the configurator's one prompt is parked here, for a later round.
  OS.on('configurator:feedback', (a) => {
    if (!a) return;
    const list = OS.store.get('design-review.feedback', []) || [];
    list.unshift({ ...a, at: OS.today() });
    list.length = Math.min(list.length, 5);
    OS.store.set('design-review.feedback', list);
    OS.emit('design-review:feedback');
  });

  const CSS = `
.$root{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--surface);color:var(--fg);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,"Helvetica Neue",Arial,sans-serif;overflow:hidden}
.$root *{box-sizing:border-box}
.$root button{font-family:inherit}
.$top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px 12px;border-bottom:1px solid var(--border)}
.$h1{font-size:19px;font-weight:750;letter-spacing:-.015em;line-height:1.2}
.$sub{font-size:12px;color:var(--muted);margin-top:3px}
.$dots{display:flex;align-items:center;gap:5px;flex:none}
.$dot{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:700;color:var(--faint);border:1px solid var(--border);font-variant-numeric:tabular-nums}
.$dot.$held{background:color-mix(in srgb,var(--accent) 26%,var(--surface));border-color:transparent;color:var(--fg)}
.$dot.$now{border:2px solid var(--accent);color:var(--accent)}
.$main{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,1fr)}
.$narrow .$main{display:flex;flex-direction:column;overflow-y:auto}
.$board{position:relative;min-height:0;overflow:hidden;background-color:color-mix(in srgb,var(--bg) 70%,var(--surface));background-image:radial-gradient(color-mix(in srgb,var(--fg) 13%,transparent) 1px,transparent 1.2px);background-size:16px 16px;border-right:1px solid var(--border)}
.$narrow .$board{flex:none;height:250px;border-right:0;border-bottom:1px solid var(--border)}
.$narrow .$wide{display:none}
.$narrow .$top{flex-wrap:wrap;padding:12px 14px 10px;gap:8px}
.$narrow .$h1{font-size:17px}
.$stagewrap{position:absolute;left:0;top:0;transform-origin:0 0}
.$nocfg{position:absolute;inset:0;display:grid;place-items:center;padding:20px;text-align:center;color:var(--muted);font-size:13px}
.$frameLbl{font-size:11px;color:var(--muted);margin:0 0 6px 2px;display:flex;gap:8px;align-items:center}
.$frameLbl b{color:var(--fg);font-weight:650}
.$pins{position:absolute;inset:0;pointer-events:none}
.$pin{position:absolute;width:24px;height:24px;margin:-24px 0 0 0;border-radius:50% 50% 50% 4px;transform-origin:0 100%;display:grid;place-items:center;font-size:11px;font-weight:800;color:var(--on-accent);box-shadow:0 3px 10px rgba(0,0,0,.35);pointer-events:auto;cursor:pointer;transition:transform .15s,opacity .35s;border:2px solid var(--surface)}
.$pin.$down{margin:0;border-radius:4px 50% 50% 50%;transform-origin:0 0}
.$pin:hover,.$pin.$hot{transform:scale(1.18);z-index:2}
.$pin.$gone{opacity:0;transform:scale(.4)}
.$r-product{background:var(--accent)} .$r-ui{background:var(--info)} .$r-arch{background:var(--warn)}
.$c-product{color:var(--accent)} .$c-ui{color:var(--info)} .$c-arch{color:var(--warn)}
.$side{min-height:0;display:flex;flex-direction:column}
.$narrow .$side{flex:none}
.$list{flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 14px 16px}
.$narrow .$list{overflow:visible}
.$roles{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11.5px;color:var(--muted);margin:0 2px 10px}
.$roles span{display:inline-flex;align-items:center;gap:6px}
.$roles i{width:9px;height:9px;border-radius:50%;display:inline-block}
.$cm{display:grid;grid-template-columns:26px minmax(0,1fr);gap:4px 10px;padding:11px 10px;border-radius:10px;border:1px solid transparent;transition:background .15s,border-color .15s,opacity .35s}
.$cm:hover,.$cm.$hot{background:var(--surface2);border-color:var(--border)}
.$cm.$gone{opacity:.35}
.$num{width:24px;height:24px;border-radius:50% 50% 50% 4px;display:grid;place-items:center;font-size:11px;font-weight:800;color:var(--on-accent)}
.$who{font-size:12px;font-weight:700;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.$who small{font-weight:500;color:var(--faint);font-size:11px}
.$txt{grid-column:2;font-size:13px;line-height:1.45}
.$meta{grid-column:2;display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.$fix{font:11px/1 var(--mono);padding:4px 7px;border-radius:5px;background:var(--bg);border:1px solid var(--border);color:var(--fg);white-space:nowrap}
.$tag{font-size:11px;padding:3px 7px;border-radius:999px;color:var(--muted);border:1px solid var(--border);white-space:nowrap}
.$tag.$warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
.$agree{margin:2px 0 10px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--good) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--good) 40%,transparent);font-size:12.5px}
.$park{margin-top:12px;padding:11px 12px;border-radius:10px;border:1px dashed var(--border);font-size:12px;color:var(--muted)}
.$park b{color:var(--fg);font-weight:650}
.$prs{margin-top:14px}
.$prs .$lbl{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:700;margin:0 2px 6px}
.$pr{display:flex;gap:8px;align-items:baseline;font-size:12px;padding:4px 2px;color:var(--muted)}
.$pr b{font:11px var(--mono);color:var(--good);font-weight:700;flex:none}
.$pr span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$foot{flex:none;border-top:1px solid var(--border);padding:12px 16px;display:flex;align-items:center;gap:14px;background:var(--surface)}
.$foot .$prbox{flex:1 1 auto}
.$foot .$acts{flex:none}
.$narrow .$foot{flex-direction:column;align-items:stretch;gap:10px}
.$narrow .$foot .$acts{justify-content:flex-end}
.$prbox{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;background:var(--bg);border:1px solid var(--border);min-width:0}
.$prbox svg{width:16px;height:16px;color:var(--good);flex:none}
.$prtitle{font:12px/1.35 var(--mono);color:var(--fg);min-width:0}
.$prmeta{font-size:11.5px;color:var(--muted)}
.$acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.$acts .$grow{flex:1 1 auto;min-width:0;text-align:right}
.$btn{height:36px;padding:0 14px;border-radius:9px;border:1px solid var(--border);background:var(--surface2);color:var(--fg);font-size:13px;font-weight:650;cursor:pointer;white-space:nowrap}
.$btn:hover{border-color:var(--accent)}
.$btn.$pri{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.$btn.$pri:hover{filter:brightness(1.08)}
.$btn[disabled]{opacity:.5;cursor:default;filter:none}
.$done{font-size:11.5px;color:var(--good)}
.$done:empty{display:none}
/* the miniature: a scaled copy of the configurator at round N */
.$mini{width:640px;height:392px;border-radius:10px;background:var(--surface);border:1px solid var(--border);box-shadow:0 18px 40px rgba(0,0,0,.28);overflow:hidden;display:flex;flex-direction:column;font:10px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.$mbar{height:20px;flex:none;display:flex;align-items:center;gap:5px;padding:0 9px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:9.5px;color:var(--muted)}
.$mbar i{width:7px;height:7px;border-radius:50%;background:var(--border);display:inline-block}
.$mbody{flex:1;display:flex;min-height:0}
.$mmodel{flex:1;position:relative;background:radial-gradient(120% 95% at 50% 6%,color-mix(in srgb,var(--surface2) 76%,var(--accent) 7%) 0%,color-mix(in srgb,var(--bg) 94%,var(--accent) 3%) 74%)}
.$mmodel svg{position:absolute;inset:0;width:100%;height:100%}
.$mpanel{width:236px;flex:none;border-left:1px solid var(--border);display:flex;flex-direction:column;min-height:0;position:relative}
.$mscroll{flex:1;padding:10px 11px 0;overflow:hidden}
.$mt{font-size:11.5px;font-weight:750;letter-spacing:-.01em}
.$mhome{margin-top:7px;height:30px;border:1px solid var(--border);background:color-mix(in srgb,var(--surface2) 42%,var(--surface));display:flex;align-items:center;gap:6px;padding:0 6px;transition:border-radius .4s}
.$mhome i{width:18px;height:18px;border-radius:4px;background:color-mix(in srgb,var(--accent) 30%,var(--surface));display:inline-block}
.$mhome span{font-size:8.5px;color:var(--muted)}
.$mh{margin:9px 0 5px;font-size:9.5px;transition:font-weight .3s}
.$mtiles{display:grid;transition:gap .4s}
.$mtile{height:36px;border:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:7.5px;color:var(--muted);transition:border-radius .4s,background .3s}
.$mtile svg{width:auto;transition:height .4s}
.$mtile.$sel{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);color:var(--fg)}
.$mfill .$mtile.$sel{background:var(--accent);color:var(--on-accent);box-shadow:none}
.$mtile.$rm{border-style:dashed;background:transparent;opacity:.6}
.$mrow{display:grid;grid-template-columns:repeat(3,1fr);transition:gap .4s}
.$msw{display:flex;gap:7px}
.$msw i{display:block;width:26px;height:26px;transition:border-radius .4s}
.$mrow .$mtile{height:22px}
.$mprice{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px 9px;border-top:1px solid var(--border);background:var(--surface);box-shadow:0 -8px 16px -10px rgba(0,0,0,.35);transition:margin .4s,border-radius .4s}
.$mprice.$float{margin-left:8px;margin-right:8px;border:1px solid var(--border)}
.$mprice .$ml{flex:1;min-width:0;overflow:hidden}
.$mprice b{display:block;font-weight:760;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;transition:font-size .3s}
.$mprice u{font-size:8px;color:var(--fg);text-underline-offset:2px}
.$mprice em{font-style:normal;font-size:7.5px;color:var(--muted);margin-left:5px}
.$msave{flex:none;height:24px;padding:0 9px;display:flex;align-items:center;gap:4px;font-size:8.5px;font-weight:650;background:color-mix(in srgb,var(--accent) 17%,var(--surface));white-space:nowrap;transition:border-radius .4s}
.$msave svg{width:9px;height:9px;color:var(--accent)}
`;
  function injectCss() {
    if (document.getElementById('design-review-css')) return;
    document.head.append(h('style', { id: 'design-review-css' }, CSS.replace(/\.\$/g, '.' + P)));
  }

  const HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-7.2-4.4-7.2-10.1A4.1 4.1 0 0 1 12 7.3a4.1 4.1 0 0 1 7.2 2.6C19.2 15.6 12 20 12 20z"/></svg>';
  const MERGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M6 7c0 4 4 5 10 5"/></svg>';
  const GLYPH = (s) => `<svg viewBox="0 0 24 20" style="height:${Math.round(22 * s)}px"><path d="M3 10.5L12 3l9 7.5V18H3z" fill="color-mix(in srgb,var(--fg) 14%,var(--surface))" stroke="color-mix(in srgb,var(--fg) 45%,transparent)" stroke-width="1.2"/><rect x="13" y="11" width="8" height="7" fill="var(--accent)" opacity=".85"/></svg>`;

  // The house in the miniature, side on: the roof pitch and the frames come from the style.
  function houseSvg(s) {
    const pitch = s.roofPitch * 2.2 * (Math.PI / 180);
    const extW = 92; const extH = 50; const gx = 70; const g = 300;
    const rise = Math.min(60, Math.tan(pitch) * extW);
    const hx = gx + extW; const hw = 150; const hh = 120;
    const fr = s.frameHex;
    return `<svg viewBox="0 0 404 372" preserveAspectRatio="xMidYMid meet">
      <ellipse cx="205" cy="${g + 6}" rx="170" ry="16" fill="rgba(0,0,0,.18)"/>
      <rect x="${hx}" y="${g - hh}" width="${hw}" height="${hh}" fill="#ece5d6" stroke="rgba(0,0,0,.25)"/>
      <rect x="${hx}" y="${g - 56}" width="${hw}" height="56" fill="#a2583f" stroke="rgba(0,0,0,.25)"/>
      <path d="M${hx - 8} ${g - hh} L${hx + hw / 2} ${g - hh - 78} L${hx + hw + 8} ${g - hh} Z" fill="#8f513e" stroke="rgba(0,0,0,.3)"/>
      <rect x="${hx + 102}" y="${g - hh - 92}" width="18" height="40" fill="#9c5a44"/>
      <rect x="${hx + 20}" y="${g - 104}" width="34" height="30" fill="#6c8398" stroke="#f2f0ea" stroke-width="3"/>
      <rect x="${hx + 92}" y="${g - 104}" width="34" height="30" fill="#6c8398" stroke="#f2f0ea" stroke-width="3"/>
      <path data-anchor="roof" d="M${gx - 6} ${g - extH} L${hx} ${g - extH - rise} L${hx} ${g - extH} Z" fill="#46505b" stroke="rgba(0,0,0,.35)"/>
      <rect x="${gx}" y="${g - extH}" width="${extW}" height="${extH}" fill="#a85b42" stroke="rgba(0,0,0,.3)"/>
      <rect data-anchor="glazing" x="${gx + 14}" y="${g - extH + 10}" width="${extW - 28}" height="${extH - 12}" fill="#6c8398" stroke="${fr}" stroke-width="4"/>
      <line x1="${gx + extW / 2}" y1="${g - extH + 10}" x2="${gx + extW / 2}" y2="${g - 2}" stroke="${fr}" stroke-width="3"/>
      <rect x="10" y="${g}" width="384" height="3" fill="rgba(0,0,0,.25)"/>
      <text x="${gx}" y="${g + 32}" font-size="10" fill="currentColor" opacity=".55">${Math.round(s.roofPitch)}° lean-to · ${s.frames} frames</text>
    </svg>`;
  }

  function miniature(s) {
    const caseCss = s.headingCase === 'title' ? 'capitalize' : s.headingCase === 'upper' ? 'uppercase' : 'none';
    const r = s.radius * 0.75;
    const heading = (t, anchor) => h('div', { class: K('mh'), style: { fontWeight: String(s.headingWeight), textTransform: caseCss, letterSpacing: s.headingCase === 'upper' ? '.06em' : '0' } }, h('span', { dataset: { anchor: anchor || '' } }, t));
    const types = ['Existing', 'Rear', 'Side', 'Infill', 'Loft', 'Wrap'];
    const tiles = h('div', { class: K('mtiles'), dataset: { anchor: 'tiles' }, style: { gridTemplateColumns: `repeat(${s.tileCols},1fr)`, gap: `${s.gap * 0.6}px` } },
      ...types.map((t, i) => h('div', { class: K('mtile' + (i === 1 ? ' sel' : '')), dataset: { anchor: i === 1 ? 'sel' : i === 0 ? 'icon' : '' }, style: { borderRadius: r + 'px' }, html: GLYPH(s.iconScale) + `<span>${t}</span>` })));
    const removed = !!s.removed['side:gabled'];
    const roofRow = h('div', { class: K('mrow'), dataset: { anchor: 'roofRow' }, style: { gap: `${s.gap * 0.6}px` } },
      ...['Flat', 'Pitched', 'Gabled'].map((t, i) => h('div', { class: K('mtile' + (i === 0 ? ' sel' : '') + (i === 2 && removed ? ' rm' : '')), style: { borderRadius: r + 'px' } }, i === 2 && removed ? 'Removed' : t)));
    const vatInBar = s.vatTick !== 'heading';
    const bar = h('div', { class: K('mprice' + (s.priceBarOffset < 0 ? ' float' : '')), dataset: { anchor: 'bar' }, style: { marginBottom: `${-s.priceBarOffset}px`, borderRadius: s.priceBarOffset < 0 ? r + 'px' : '0' } },
      h('div', { class: K('ml') },
        h('b', { dataset: { anchor: 'price' }, style: { fontSize: `${s.priceSize * 0.56}px` } }, '£65,000 – £97,000'),
        h('u', { dataset: { anchor: 'link' } }, s.text.breakdown),
        h('em', { dataset: { anchor: 'vat' } }, vatInBar ? '☐ incl. VAT' : 'excl. VAT')),
      h('div', { class: K('msave'), dataset: { anchor: 'save' }, style: { borderRadius: r + 'px' }, html: HEART + `<span>${OS.esc(s.text.save)}</span>` }));
    const mini = h('div', { class: K('mini'), dataset: { anchor: 'frame' } },
      h('div', { class: K('mbar') }, h('i'), h('i'), h('i'), h('span', { style: { marginLeft: '6px' } }, 'configurator · design tab · desktop')),
      h('div', { class: K('mbody') },
        h('div', { class: K('mmodel'), dataset: { anchor: 'house' }, html: houseSvg(s) }),
        h('div', { class: K('mpanel' + (s.selected === 'fill' ? ' mfill' : '')) },
          h('div', { class: K('mscroll') },
            h('div', { class: K('mt') }, 'Design your extension'),
            h('div', { class: K('mhome'), style: { borderRadius: r + 'px' } }, h('i'), h('span', null, '12 Purlin Road, Eavesham')),
            heading('Extension type', 'heading'), tiles,
            heading('Size'), h('div', { class: K('mrow'), style: { gap: `${s.gap * 0.6}px` } }, ...['Small', 'Medium', 'Large'].map((t, i) => h('div', { class: K('mtile' + (i === 1 ? ' sel' : '')), style: { borderRadius: r + 'px' } }, t))),
            heading('Roof'), roofRow,
            heading('Wall material'), h('div', { class: K('msw') }, ...['#a85b42', '#d2b27c', '#efebe2', '#808b95', '#ab7c50'].map((c, i) => h('i', { style: { background: c, borderRadius: r * 0.6 + 'px', boxShadow: i === 0 ? '0 0 0 2px var(--surface), 0 0 0 3px var(--accent)' : 'inset 0 0 0 1px rgba(0,0,0,.15)' } }))),
            ),
          bar)));
    return mini;
  }

  registerApp({
    id: 'design-review',
    title: 'Design review',
    icon: 'paint-brush',
    desc: 'The configurator’s design review board. Three roles, three meanings of design.',
    keywords: ['review', 'design', 'configurator', 'round', 'feedback', 'ui', 'architecture'],
    size: [1080, 700],
    mount(win) {
      injectCss();
      const st = win.state;
      win.body.style.overflow = 'hidden';
      const root = h('div', { class: K('root') });
      win.body.append(root);
      const title = h('div', { class: K('h1') });
      const sub = h('div', { class: K('sub') });
      const dots = h('div', { class: K('dots'), 'aria-label': 'Rounds' });
      const board = h('div', { class: K('board') });
      const list = h('div', { class: K('list') });
      const prtitle = h('div', { class: K('prtitle'), dataset: { dr: 'pr-title' } });
      const prmeta = h('div', { class: K('prmeta') });
      const done = h('div', { class: K('done'), role: 'status' });
      const applyBtn = h('button', { class: K('btn pri'), type: 'button', dataset: { dr: 'apply' }, onclick: () => apply() }, 'Apply all fixes');
      const approveBtn = h('button', { class: K('btn'), type: 'button', dataset: { dr: 'approve' }, onclick: () => approve() }, 'Approve design');
      root.append(
        h('div', { class: K('top') }, h('div', { style: { minWidth: 0 } }, title, sub), dots),
        h('div', { class: K('main') }, board, h('div', { class: K('side') }, list)),
        h('div', { class: K('foot') },
          h('div', { class: K('prbox') }, h('span', { html: MERGE }).firstChild, h('div', { style: { minWidth: 0 } }, prtitle, prmeta, done)),
          h('div', { class: K('acts') }, approveBtn, applyBtn)));

      let pins = [];
      const hot = (i, on) => {
        pins[i]?.classList.toggle(P + 'hot', on);
        list.querySelector(`[data-i="${i}"]`)?.classList.toggle(P + 'hot', on);
      };

      function render() {
        const n = roundNow();
        st.round = n;
        const comments = ROUNDS[n];
        const s = style();
        win.setTitle(`Design review, round ${n}`);
        title.textContent = `Design review, round ${n}`;
        sub.replaceChildren(n === 10 ? 'Configurator · the tenth round' : `Configurator · ${n - 1 === 0 ? 'no rounds' : n - 1 === 1 ? 'one round' : `${n - 1} rounds`} held this cycle`, h('span', { class: K('wide') }, ' · booked for the same time next week'));
        dots.replaceChildren(...Array.from({ length: 10 }, (_, i) => h('span', { class: K('dot' + (i + 1 < n ? ' held' : i + 1 === n ? ' now' : '')), title: i === 9 ? 'Round 10' : `Round ${i + 1}` }, i === 9 ? '↺' : String(i + 1))));

        // The board: the miniature, scaled to fit, and a pin per comment.
        if (!s) {
          board.replaceChildren(h('div', { class: K('nocfg') }, 'The configurator is not installed, so the comments have nothing to point at.'));
          pins = []; st.layoutBoard = () => {};
        }
        const mini = s ? miniature(s) : null;
        const wrap = h('div', { class: K('stagewrap') }, h('div', { class: K('frameLbl') }, h('b', null, 'Configurator'), h('span', null, `as it stands before round ${n}`)), mini);
        const pinLayer = h('div', { class: K('pins') });
        if (s) board.replaceChildren(wrap, pinLayer);
        if (s) st.layoutBoard = () => {
          const bw = board.clientWidth; const bh = board.clientHeight;
          if (!bw || !bh) return;
          const k = Math.min((bw - 40) / 640, (bh - 50) / 412, 1.25);
          const tx = Math.max(20, (bw - 640 * k) / 2); const ty = Math.max(14, (bh - 412 * k) / 2);
          wrap.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
          // Measured in the miniature's own pixels, so the window's opening animation cannot skew the pins.
          const wr = wrap.getBoundingClientRect();
          const u = 640 / (wr.width || 640);
          const used = {};
          pins.forEach((pin, i) => {
            const key = anchorOf(comments[i].fix);
            const el = mini.querySelector(`[data-anchor="${key}"]`) || mini;
            const r = el.getBoundingClientRect();
            const L = (r.left - wr.left) * u; const T = (r.top - wr.top) * u; const R = (r.right - wr.left) * u; const Bt = (r.bottom - wr.top) * u;
            const k2 = (used[key] = (used[key] || 0) + 1) - 1;
            // Each pin points at a corner of what it is about: above it, or below it when it sits in the price bar.
            const below = key === 'vat' || key === 'link' || key === 'save';
            const x = key === 'frame' ? (L + R) / 2 : key === 'bar' || key === 'tiles' ? L + 10 : R - 6;
            const y = key === 'frame' ? (T + Bt) / 2 : below ? Bt - 4 : T + 6;
            pin.classList.toggle(P + 'down', below);
            pin.style.left = `${tx + x * k + k2 * 27}px`; pin.style.top = `${ty + y * k}px`;
          });
        };
        if (s) pins = comments.map((c, i) => {
          const pin = h('div', { class: K(`pin r-${c.role}`), title: `${ROLES[c.role].label}: ${c.text}`, dataset: { dr: 'pin' },
            onmouseenter: () => hot(i, true), onmouseleave: () => hot(i, false),
            onclick: () => list.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, String(i + 1));
          pinLayer.append(pin);
          return pin;
        });
        requestAnimationFrame(() => { if (!win.closed) st.layoutBoard(); });

        // The comments.
        const agree = n === 10 ? h('div', { class: K('agree') }, 'For the first time this cycle, all three roles agree.') : null;
        const feedback = (OS.store.get('design-review.feedback', []) || [])[0];
        const prs = (OS.store.get('design-review.prs', []) || []).slice(0, 3);
        list.replaceChildren(...[
          h('div', { class: K('roles') }, ...Object.entries(ROLES).map(([k, r]) => h('span', null, h('i', { class: K('r-' + k) }), h('b', { class: K('c-' + k), style: { fontWeight: 650 } }, r.label), `means ${r.means}`))),
          agree,
          ...comments.map((c, i) => h('div', { class: K('cm'), dataset: { i: String(i), dr: 'comment' }, onmouseenter: () => hot(i, true), onmouseleave: () => hot(i, false) },
            h('span', { class: K(`num r-${c.role}`) }, String(i + 1)),
            h('div', { class: K('who') }, h('span', { class: K('c-' + c.role) }, ROLES[c.role].label), h('small', null, `round ${n}`)),
            h('div', { class: K('txt') }, c.text),
            h('div', { class: K('meta') }, c.fix ? h('span', { class: K('fix') }, describe(c.fix)) : null, c.note ? h('span', { class: K('tag' + (/Contradicts|Reverses/.test(c.note) ? ' warn' : '')) }, c.note) : null))),
          feedback ? h('div', { class: K('park') }, h('b', null, 'User feedback, parked. '), `“${feedback.part}”, ${feedback.rating === 'positive' ? 'good' : 'not great'}: “${feedback.reason}”. Not on this round’s agenda.`) : null,
          prs.length ? h('div', { class: K('prs') }, h('div', { class: K('lbl') }, 'Merged'), ...prs.map((p) => h('div', { class: K('pr') }, h('b', null, `#${p.pr}`), h('span', null, p.title)))) : null,
        ].filter(Boolean));
        const fixes = comments.filter((c) => c.fix && c.fix.kind !== 'none').length;
        prtitle.textContent = prTitle(n);
        prmeta.textContent = n === 10 ? 'One fix, agreed by all three roles · one ticket, one pull request' : `${fixes} ${fixes === 1 ? 'fix' : 'fixes'} from ${comments.length} comments · one ticket, one pull request`;
        applyBtn.disabled = false;
        applyBtn.textContent = n === 10 ? 'Go back to round 1' : 'Apply all fixes';
      }

      async function apply() {
        const n = st.round;
        const comments = ROUNDS[n];
        const fixes = comments.filter((c) => c.fix).map((c) => ({ ...c.fix }));
        applyBtn.disabled = true;
        for (const p of pins) p.classList.add(P + 'gone');
        for (const el of list.querySelectorAll('[data-i]')) el.classList.add(P + 'gone');
        const paid = OS.spend.add(0.14, `draft PR title, design review round ${n}`, 'design-review');
        const next = n === 10 ? 1 : n + 1;
        OS.store.set('design-review.round', next);
        OS.emit('design-review:apply', fixes);
        const prs = OS.store.get('design-review.prs', []) || [];
        const pr = (prs[0]?.pr || 3103) + 1;
        prs.unshift({ pr, round: n, title: prTitle(n) });
        prs.length = Math.min(prs.length, 12);
        OS.store.set('design-review.prs', prs);
        done.textContent = paid.ok ? `#${pr} merged by rebase. Round ${next} booked.` : `#${pr} merged by rebase. Title drafted by hand: the daily cap is spent.`;
        OS.notify({
          app: 'design review', icon: 'paint-brush', title: n === 10 ? 'Back to round 1' : `#${pr} merged`, body: prTitle(n), timeout: 3800,
          actions: [{ label: 'Open configurator', run: () => OS.open('configurator') }],
        });
        await win.sleep(650);
        if (win.closed) return;
        render();
      }

      function approve() {
        const n = st.round;
        OS.crash(win, {
          title: 'Approval is not a state this board has',
          icon: 'paint-brush',
          code: 'DR-0x000A NO_FINAL_ROUND',
          lines: [`The configurator has been through ${n - 1 === 1 ? 'one round' : `${n - 1} rounds`} this cycle. Approving it would end the cycle.`, `Round ${n} is on the agenda. Round ${n === 10 ? 1 : n + 1} is already booked.`],
          details: ['design_review.approve!', '  raise NoFinalRound, "every UI gets one more design review"', `  round: ${n}, roles: 3, meanings of design: 3`],
          actions: [{ label: `Hold round ${n}`, primary: true }, { label: 'Close app', run: () => win.close() }],
        });
      }

      st.resize = () => {
        root.classList.toggle(P + 'narrow', win.width < 760);
        st.layoutBoard?.();
      };
      st.off = [OS.on('design-review:feedback', () => render())];
      render();
      st.resize();
    },
    unmount(win) { for (const f of win.state.off || []) f(); },
    onResize(win) { win.state.resize?.(); },
  });
})();
