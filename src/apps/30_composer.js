// Composer: composes a 3D house from a listing in 22 stages, and benchmarks it against gold.
// The window and `bin/composer` run the same code: truth() -> compose() -> execute() -> benchmark().
(() => {
  const { h } = OS;
  const DATA = OS.data;
  const STAGES = DATA.stages;
  const BY = Object.create(null);
  STAGES.forEach((s, i) => { BY[s.key] = { ...s, i }; });
  const KEYS = STAGES.map((s) => s.key);
  const MAIN = Object.fromEntries(STAGES.map((s) => [s.key, s.def]));
  const SH = DATA.storeyM;
  const CAP = DATA.noteCapUsd;
  const STORED = 'stored_before_cap';
  const HELD_OUT = [143, 161, 170, 189];

  const r1 = (x) => Math.round(x * 10) / 10;
  const r2 = (x) => Math.round(x * 100) / 100;
  const snap = (x) => Math.round(x * 2) / 2;
  const f1 = (x) => r1(x).toFixed(1);
  const pickR = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
  const between = (r, a, b) => a + r() * (b - a);
  const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;
  const approachList = (key) => (key === 'plan_sheet' ? [...BY[key].approaches, STORED] : BY[key].approaches.slice());
  const apText = (a) => (a === STORED ? 'largest_drawing_1 (stored run, before the cap)' : a);
  const apShort = (a) => (a === STORED ? 'largest_drawing_1 · before cap' : a);

  // ---------- what each approach does ----------
  const NOTES = {
    tag_images: {
      default: 'Takes the first outside photo as the front. Listings often open with the garden.',
      jev: 'Takes the outside photo with the most windows as the front. Rears have more windows.',
      luna_order_1: 'Front before rear; the earliest outside photo when there is no front.',
      luna_rearpass_1: 'luna_order_1 and a second pass that tags the rear. Half as many calls again.',
    },
    site_context: {
      default: 'Plot and neighbour footprints from the open map. Neighbour heights assumed: two storeys.',
      inspire_openmap_lidar_1: 'Plot polygon, open-map footprints, heights from lidar.',
      inspire_openmap_terra_satellite_1: 'Plot polygon, open-map footprints, heights from satellite shadows.',
      inspire_openmap_terra_satellite_2: 'As _1 with a different prompt. A different prompt is a new numbered file.',
      inspire_overture_lidar_1: 'Plot polygon, a second footprint source, heights from lidar.',
      inspire_overture_openmap_terra_satellite_1: 'Both footprint sources, heights from satellite shadows.',
      inspire_overture_openmap_terra_satellite_2: 'As _1 with a different prompt.',
      inspire_overture_terra_satellite_1: 'Second footprint source only, heights from satellite shadows.',
      os_ngd_1: 'The plot from the national plot index, picked by SiteContext#pick_plot. Gardens a metre deeper.',
    },
    house_box: { luna_square_noplan_1: 'A box from the photos alone. Square, no plan. Within half a metre.' },
    describe_house: {
      default: 'One model call over the front photos: type, storeys, roof, finish, porch.',
      jev: 'The same questions to a different model. It answers "can\'t tell" for the porch, which becomes unknown.',
      jev_extra_fronts: 'jev with three extra front photos. The same answers as default, three times the calls.',
    },
    orient_plan: {
      default: 'Takes the drawing as seen from the street. Some plans are drawn from the rear.',
      terra_evidence_1: 'Checks the drawing against the photos and swaps left and right back when it was drawn from the rear.',
    },
    floor_boxes: {
      default: 'The wall snap merges a neighbouring drawing into the floor\'s own drawing.',
      luna_storeycount_1: 'Storeys from the description. The wall snap still takes a neighbouring drawing into the box.',
      luna_storeycount_2: 'Stops the wall snap taking a neighbouring drawing into the floor.',
      luna_storeycount_3: 'Reads each floor\'s box from its walls, so neighbouring drawings stay out.',
    },
    floor_outlines: {
      default: 'The outline of everything in the floor box.',
      own_drawing_1: 'Stops a neighbouring drawing joining a floor\'s outline.',
    },
    gable_ends: { terra_satellite_1: 'Gable ends from the satellite tile. A gap in a gable line is valid.' },
    read_rooms: { default: 'Room names and sizes off the plan. Spelling is not scored.' },
    plan_scale: { default: 'Centimetres per pixel from the room sizes printed on the plan.' },
    plan_sheet: {
      largest_drawing_1: 'Reads plans spread over several images and scales the largest drawing. An out-of-range factor leaves the tile unscaled.',
      [STORED]: 'A stored run from before the cap. It applied whatever factor it was given.',
    },
    align_floors: {
      default: 'Aligns floors by their dark walls. Light-walled plans have none.',
      light_walls_1: 'Reads light-walled plans, so their upper storey is built.',
    },
    projections: { corner_grid_rooms_1: 'Bays and porches from where rooms leave the grid.' },
    floor_cells: { default: 'Each floor on its own 0.5 m grid.', snap_below_1: 'Snaps each floor\'s cells to the floor below.' },
    floor_diff: { default: 'What each storey has that the storey below does not.' },
    detect_features: { default: 'Windows and doors on the front photo. A different model in place of the old one.' },
    mark_features: {
      default: 'Places features where they were boxed: windows 0.3 m in front of the wall. A recessed door\'s recess is measured the wrong way, so the door stands 0.3 m off the front faces.',
      front_snap_1: 'Snaps front windows boxed off the wall onto it. A recessed door still stands 0.3 m off the front faces: its recess, measured the wrong way.',
      front_snap_2: 'Also moves a recessed front door onto the front faces in line with it.',
      front_snap_3: 'front_snap_2, and the side windows too.',
    },
    massing: {
      default: 'Cuts every door 3 m wide. Doors were never measured.',
      door_fit_1: 'Cuts doors at their detected width. No bays or porches.',
      door_fit_projections_1: 'door_fit_1 with bays and porches. No dormers.',
      roof_dormers_1: 'Projections, and real dormers for storeys in the roof.',
    },
    roofer: {
      default: 'Every roof is a gable roof. A storey in the roof becomes a full storey.',
      chalet_roof_1: 'Gable, hip and chalet roofs. Storeys in the roof stay in the roof.',
      glazed_conservatory_1: 'chalet_roof_1 with glazed conservatory roofs.',
    },
    decorate: { jev_front_1: 'Windows, door, chimney, and downpipes from the main roof front gutter.' },
    wall_materials: {
      default: 'The library default on every wall: smooth red brick.',
      palette_front_1: 'The colour sampled from the front photo. The front photo is in shade.',
      tagged_front_1: 'A library material for every wall finish.',
    },
    composed_model: {
      default: 'Composes the model and scores it against the photos.',
      luna: 'Composes, scores, and adds the front hedge it saw in one photo.',
    },
  };

  // ---------- houses: the truth that gold records ----------
  const TYPE_WORD = { 'mid-terrace': 'mid-terrace', 'end-terrace': 'end-terrace', semi: 'semi-detached', detached: 'detached' };
  const LIB = {
    brick: [['Red multi stock brick', '#9a5240'], ['Buff stock brick', '#c3a06e'], ['Smooth red brick', '#a8553f']],
    render: [['Off-white render', '#e4dfd2'], ['Cream render', '#e6d8b4'], ['Pale grey render', '#c9cbc8']],
    pebbledash: [['Sand pebbledash', '#c8bc9c']],
    stone: [['Honey stone', '#c7b083']],
  };
  const ROOF_LIB = [['Blue-grey slate', '#4e5562'], ['Red clay tile', '#8f4c37'], ['Brown concrete tile', '#6b5547']];
  const DOOR_HEX = ['#2c4a7a', '#7c2733', '#2e5b3d', '#1e1f24', '#e9e5db'];
  const STREETS = ['Kiln Lane', 'Purlin Road', 'Soffit Gardens', 'Lintel Close', 'Mortar Row', 'Coping Way', 'Gable Street', 'Ridge Terrace', 'Flashing Lane', 'Joist Avenue', 'Rafter Mews', 'Sash Crescent'];
  const INVENTED = ['14 Larch Rise', '3 Coping Stone Lane', '27 Purlin Road', '9 Soffit Gardens', '6 Party Wall Walk', '118 Damp Course Drive', '2 Bonding Mews', '51 Fascia Row'];
  const GOLD = {
    158: { type: 'semi', party: 'right', storeys: 2, W: 7, D: 8.5, roof: 'hip', pitch: 2.9, bay: { side: 'left', storeys: 2 }, porch: 'canopy', door: 'right', chimney: 'party', finish: 'brick', wallI: 0, roofI: 0, doorI: 1, rear: { kind: 'conservatory', w: 3.5, d: 3 }, addr: '12 Kiln Lane', factor: 3.2 },
    152: { type: 'mid-terrace', storeys: 2, W: 5, D: 9, roof: 'gable', pitch: 2.6, bay: { side: 'left', storeys: 1 }, porch: null, door: 'right', chimney: 'party', finish: 'brick', wallI: 1, roofI: 0, doorI: 3, rear: { kind: 'extension', w: 2.5, d: 3.5 }, addr: '7 Purlin Road', factor: 2.8 },
    135: { type: 'detached', storeys: 2, roomInRoof: true, W: 8.5, D: 8, roof: 'gable', pitch: 4.2, bay: { side: 'right', storeys: 1 }, porch: 'closed', door: 'left', chimney: 'right', finish: 'render', wallI: 0, roofI: 1, doorI: 2, rear: null, addr: '3 Soffit Gardens', factor: 3.4 },
    178: { type: 'end-terrace', party: 'left', storeys: 3, W: 5.5, D: 9.5, roof: 'gable', pitch: 2.5, bay: null, porch: 'canopy', door: 'left', chimney: 'right', finish: 'pebbledash', wallI: 0, roofI: 2, doorI: 0, rear: { kind: 'extension', w: 3, d: 3 }, addr: '41 Lintel Close', factor: 3.0 },
  };

  function houseKey(input) {
    const s = String(input == null ? '' : input).trim().replace(/\s+/g, ' ');
    if (/^#?\d{1,6}$/.test(s)) { const n = Number(s.replace('#', '')); return { kind: 'id', id: String(n), num: n, label: String(n) }; }
    return { kind: 'addr', id: s.toLowerCase(), num: null, label: s };
  }
  const isGoldKey = (k) => k.kind === 'id' && DATA.goldHouses.includes(k.num);
  const isHeldOut = (input) => { const k = houseKey(input); return k.kind === 'id' && HELD_OUT.includes(k.num); };

  function truth(input) {
    const k = houseKey(input);
    const r = OS.rng(`composer|truth|${k.id}`);
    const g = isGoldKey(k) ? GOLD[k.num] : null;
    const type = g ? g.type : pickR(['mid-terrace', 'end-terrace', 'semi', 'semi', 'detached', 'detached'], r);
    const terrace = type === 'mid-terrace' || type === 'end-terrace';
    let storeys = terrace ? (r() < 0.3 ? 3 : 2) : (r() < 0.14 ? 1 : 2);
    let roomInRoof = !terrace && storeys === 2 && r() < 0.22;
    let W = snap(terrace ? between(r, 4.5, 6) : type === 'semi' ? between(r, 6, 7.5) : between(r, 7.5, 10));
    let D = snap(between(r, 7, 9.5));
    const rr = r();
    let roof = terrace ? 'gable' : type === 'semi' ? (rr < 0.55 ? 'hip' : 'gable') : (rr < 0.4 ? 'hip' : 'gable');
    let axis = type === 'detached' && roof === 'gable' && !roomInRoof && r() < 0.3 ? 'z' : 'x';
    let pitch = r1(roomInRoof ? between(r, 3.9, 4.3) : roof === 'hip' ? between(r, 2.6, 3.1) : between(r, 2.4, 3.0));
    const bayR = r(); const baySide = r() < 0.5 ? 'left' : 'right'; const bay2 = r() < 0.3;
    let bay = bayR < 0.6 ? { side: baySide, storeys: storeys >= 2 && bay2 ? 2 : 1 } : null;
    const pr = r();
    let porch = pr < 0.22 && !terrace ? 'closed' : pr < 0.55 ? 'canopy' : null;
    let door = bay ? (bay.side === 'left' ? 'right' : 'left') : (r() < 0.5 ? 'left' : 'right');
    const partySide = r() < 0.5 ? 'left' : 'right';
    const chR = r(); const chSide = r() < 0.5 ? 'left' : 'right';
    let chimney = chR < 0.78 ? (type === 'detached' ? chSide : 'party') : null;
    const fr = r();
    let finish = fr < 0.55 ? 'brick' : fr < 0.8 ? 'render' : fr < 0.9 ? 'pebbledash' : 'stone';
    let wallI = Math.floor(r() * LIB[finish].length); let roofI = Math.floor(r() * ROOF_LIB.length); let doorI = Math.floor(r() * DOOR_HEX.length);
    const rearR = r(); const rw = snap(between(r, 2.5, 3.5)); const rd = snap(between(r, 2.5, 3.5));
    let rear = rearR < 0.25 && !terrace ? { kind: 'conservatory', w: 3.5, d: 3 } : rearR < 0.6 ? { kind: 'extension', w: rw, d: rd } : null;
    const frontG = snap(between(r, 4, 6)); const rearG = snap(between(r, 9, 12));
    const photos = 10 + Math.floor(r() * 7);
    const trig = { nd: r() < 0.8, rearFirst: r() < 0.75, lightWalls: r() < 0.7, boxedWindows: r() < 0.85, recessedDoor: r() < 0.6, tileOOR: r() < 0.7, planFlip: r() < 0.7, upperOffset: r() < 0.6, gableGap: r() < 0.4 };
    let factor = r1(between(r, 2.6, 3.4));
    const ndW = snap(between(r, 2.5, 3.5)); const ndD = snap(between(r, 3.5, 5));
    const streetNo = 1 + Math.floor(r() * 140); const street = pickR(STREETS, r);
    let party = type === 'mid-terrace' ? 'both' : (type === 'semi' || type === 'end-terrace') ? partySide : 'none';
    if (g) {
      storeys = g.storeys; roomInRoof = !!g.roomInRoof; W = g.W; D = g.D; roof = g.roof; axis = g.axis || 'x'; pitch = g.pitch;
      bay = g.bay; porch = g.porch; door = g.door; chimney = g.chimney; finish = g.finish; wallI = g.wallI; roofI = g.roofI; doorI = g.doorI;
      rear = g.rear; factor = g.factor; party = g.party || (type === 'mid-terrace' ? 'both' : 'none');
      for (const t of Object.keys(trig)) trig[t] = true;
      trig.gableGap = k.num === 135;
    }
    if (rear && rear.w > W - 1.5) rear = { ...rear, w: snap(W - 1.5) };
    const partyL = party === 'both' || party === 'left';
    const partyR = party === 'both' || party === 'right';
    const rearIdx = trig.rearFirst ? 2 : 4 + (photos % 3);
    const frontIdx = trig.rearFirst ? 4 + (photos % 2) : 1;
    const tags = [];
    for (let i = 1; i <= photos; i++) {
      const t = i === frontIdx ? 'F' : i === rearIdx ? 'R' : i === photos ? 'P' : (trig.rearFirst && i < rearIdx) ? 'I' : pickR(['I', 'I', 'I', 'G', 'S'], r);
      tags.push(t);
    }
    const nFloors = storeys + (roomInRoof ? 1 : 0);
    const storeyList = Array.from({ length: storeys }, (_, i) => i).join(', ') + (roomInRoof ? `, ${storeys} (roof)` : '');
    return {
      key: k, id: k.id, label: k.label, kind: k.kind, gold: !!g, numeric: k.kind === 'id',
      address: g ? g.addr : (k.kind === 'addr' ? k.label : `${streetNo} ${street}`),
      type, terrace, storeys, roomInRoof, nFloors, storeyList, W, D, roof, axis, pitch, bay, porch, door, chimney, finish,
      wall: LIB[finish][wallI], roofMat: ROOF_LIB[roofI], doorHex: DOOR_HEX[doorI], rear, frontG, rearG,
      photos, tags, frontIdx, rearIdx, planIdx: photos, ...trig, factor, ndW, ndD, partyL, partyR,
    };
  }
  const roofWord = (T) => (T.roof === 'hip' ? 'hipped roof' : T.roomInRoof ? 'chalet roof' : T.axis === 'z' ? 'gable to the street' : 'gable roof');
  const camYaw = (T) => (T.partyL && T.partyR ? 0.32 : T.partyR ? -0.5 : T.partyL ? 0.5 : 0.42);
  const describe = (T) => `${TYPE_WORD[T.type]} · storeys ${T.storeyList} · ${roofWord(T)} · ${T.wall[0].toLowerCase()}`;
  const goldWord = (T) => (T.gold ? 'gold · reliable' : T.numeric ? 'gold · bot-labelled' : 'gold · bot-labelled, invented address');

  // ---------- site context ----------
  function frameOf(T) { const x0 = -Math.round(T.W) / 2; const zf = Math.round(T.D) / 2; return { x0, x1: x0 + T.W, zf, zb: zf - T.D }; }

  function siteContext(T, ap) {
    const { x0, x1, zf, zb } = frameOf(T);
    const r = OS.rng(`composer|site|${T.id}`);
    const ra = OS.rng(`composer|site|${T.id}|${ap}`);
    const lidar = /lidar/.test(ap); const sat = /satellite/.test(ap); const ngd = ap === 'os_ngd_1';
    const nb = [];
    const rowCount = T.terrace ? 2 : 1;
    const attach = (side) => {
      let edge = side === 'L' ? x0 : x1;
      for (let i = 0; i < rowCount; i++) {
        const w = T.type === 'semi' ? T.W : snap(T.W + pickR([-0.5, 0, 0, 0.5], r));
        const nx0 = side === 'L' ? edge - w : edge;
        nb.push({ x0: nx0, x1: nx0 + w, zf, zb, storeys: T.storeys, roomInRoof: T.roomInRoof, roof: T.roof, pitch: T.pitch, attached: true, side, outer: i === rowCount - 1, cut: T.terrace && i === rowCount - 1 });
        edge = side === 'L' ? nx0 : nx0 + w;
      }
      return edge;
    };
    const free = (side) => {
      const gap = snap(between(r, 2.5, 4)); const w = snap(between(r, 6.5, 9)); const d = snap(between(r, 7, 10)); const set = snap(between(r, -1.5, 0));
      const st = r() < 0.3 ? 1 : 2; const rf = r() < 0.5 ? 'hip' : 'gable'; const pt = r1(between(r, 2.4, 3));
      const storeys = lidar || ngd || sat ? st : 2;
      const eavesAdj = sat ? r1(between(ra, -0.3, 0.3)) : 0;
      const nx0 = side === 'L' ? x0 - gap - w : x1 + gap;
      nb.push({ x0: nx0, x1: nx0 + w, zf: zf + set, zb: zf + set - d, storeys, eavesAdj, roof: rf, pitch: pt, attached: false, side });
      return gap;
    };
    let gapL = 0; let gapR = 0; let bx0 = x0; let bx1 = x1;
    if (T.partyL) bx0 = attach('L'); else gapL = free('L');
    if (T.partyR) bx1 = attach('R'); else gapR = free('R');
    const px0 = T.partyL ? x0 : x0 - gapL / 2; const px1 = T.partyR ? x1 : x1 + gapR / 2;
    const zPF = zf + T.frontG; const zRear = zb - T.rearG - (ngd ? 1 : 0);
    const src = lidar ? 'from lidar' : sat ? 'from satellite shadows' : ngd ? 'from the plot index' : 'assumed: 2 storeys';
    return { nb, bx0, bx1, px0, px1, zPF, zRear, gapL, gapR, src };
  }

  // ---------- compose: pure and deterministic. Same input and approaches, same house. ----------
  function compose(input, approaches) {
    const T = truth(input);
    const A = { ...MAIN, ...approaches };
    const out = {};
    const rs = (key, salt = '') => OS.rng(`composer|${T.id}|${key}|${A[key]}|${salt}`);
    const put = (key, d) => {
      const s = BY[key]; const r = rs(key, 'meta');
      const calls = s.llm ? (d.calls || 1) : 0;
      const secs = r1((s.llm ? 0.9 + r() * 1.2 + calls * 0.3 : 0.2 + r() * 0.9) * (d.slow || 1));
      const usd = s.llm ? r2(calls * (0.11 + r() * 0.08) * (d.price || 1)) : 0;
      out[key] = { key, ap: A[key], calls, secs, usd, ok: d.ok === undefined ? true : d.ok, sum: d.sum, defect: d.defect || null, mark: d.defect ? (d.mark || d.defect) : null };
    };
    const site = siteContext(T, A.site_context);

    // decisions: what each approach does to this house
    const tagBug = T.rearFirst && (A.tag_images === 'default' || A.tag_images === 'jev');
    const porchKnown = A.describe_house !== 'jev';
    const mirror = T.planFlip && A.orient_plan === 'default';
    const glued = T.nd && (A.floor_boxes === 'default' || A.floor_boxes === 'luna_storeycount_1');
    const wing = T.nd && (A.floor_boxes === 'default' || (A.floor_boxes === 'luna_storeycount_1' && A.floor_outlines === 'default'));
    const scale = T.tileOOR && A.plan_sheet === STORED ? T.factor : 1;
    const dropped = T.lightWalls && T.storeys >= 2 && A.align_floors === 'default';
    const shifted = T.upperOffset && T.storeys >= 2 && !dropped && A.floor_cells === 'default';
    const winFloat = T.boxedWindows && A.mark_features === 'default' ? 0.3 : 0;
    const doorFloat = T.recessedDoor && (A.mark_features === 'default' || A.mark_features === 'front_snap_1') ? 0.3 : 0;
    const doorCut = A.massing === 'default' ? 3.0 : 0.9;
    const proj = A.massing !== 'door_fit_1';
    const dormersMassed = A.massing === 'roof_dormers_1';
    const roofType = A.roofer === 'default' ? 'gable' : T.roof;
    const axis = A.roofer === 'default' && T.roof === 'hip' ? 'x' : T.axis;
    const fullRoofStorey = T.roomInRoof && A.roofer === 'default';
    const chalet = T.roomInRoof && !fullRoofStorey;
    const dormers = chalet && dormersMassed && axis === 'x';
    const n = (dropped ? 1 : T.storeys) + (fullRoofStorey && !dropped ? 1 : 0);
    const wallMat = A.wall_materials === 'tagged_front_1' ? T.wall
      : A.wall_materials === 'default' ? ['Smooth red brick (library default)', '#a8553f']
        : [`${OS.theme.mix(T.wall[1], '#2a2833', 0.32)} from the front photo`, OS.theme.mix(T.wall[1], '#2a2833', 0.32)];
    const X = {
      flip: tagBug, mirror, wing, scale, n, shift: shifted ? 0.5 : 0, winFloat, doorFloat, doorCut, proj, porchKnown,
      dormers, roofType, axis, chalet, fullRoofStorey, wall: wallMat, glazed: A.roofer === 'glazed_conservatory_1', hedge: A.composed_model === 'luna',
    };
    const M = modelSpec(T, X, site);
    const nbWord = plural(site.nb.length, 'neighbour');

    put('tag_images', {
      calls: A.tag_images === 'luna_rearpass_1' ? 3 : 2, price: A.tag_images === 'jev' ? 0.85 : 1, slow: A.tag_images === 'luna_rearpass_1' ? 1.4 : 1, ok: !tagBug,
      sum: `${T.photos} photos → front = #${tagBug ? T.rearIdx : T.frontIdx}, ${tagBug ? 'rear = none' : `rear = #${T.rearIdx}`}, plan = #${T.planIdx}`,
      defect: tagBug ? 'P1: the rear photo was tagged as the front, so the door is at the back' : null, mark: 'P1 rear tagged as the front: door at the back',
    });
    put('site_context', { ok: null, sum: `plot ${f1(site.px1 - site.px0)} × ${f1(site.zPF - site.zRear)} m · ${nbWord} · heights ${site.src}` });
    {
      const rb = rs('house_box');
      const bw = T.W + pickR([-0.5, 0, 0, 0.5], rb); const bd = T.D + pickR([-0.5, 0, 0.5], rb); const bh = T.storeys * SH + T.pitch + pickR([-0.5, 0, 0.5], rb);
      X.box = { bw, bd, bh };
      put('house_box', { sum: `${f1(bw)} × ${f1(bd)} m, ${f1(bh)} m to the ridge` });
    }
    put('describe_house', {
      calls: A.describe_house === 'jev_extra_fronts' ? 4 : 1, ok: porchKnown,
      sum: `${TYPE_WORD[T.type]} · storeys ${T.storeyList} · ${roofWord(T)} · porch: ${porchKnown ? (T.porch ? 'yes' : 'no') : 'unknown'}`,
      defect: porchKnown ? null : 'F2: porch answered "can\'t tell", so unknown, so no porch', mark: 'F2 porch: unknown, so none',
    });
    put('orient_plan', {
      ok: !mirror,
      sum: T.planFlip ? (mirror ? 'street side = bottom edge · left and right as drawn' : 'drawn from the rear · left and right swapped back') : 'street side = bottom edge · left and right as drawn',
      defect: mirror ? 'P4: plan read mirrored, so the bay and the door swapped sides' : null, mark: 'P4 mirrored: bay and door swapped',
    });
    const WP = M.wingPlan;
    const fbW = wing && WP && WP.side !== 'F' ? T.W + WP.w : T.W;
    const fbD = wing && WP && WP.side === 'F' ? T.D + WP.d : T.D;
    put('floor_boxes', {
      calls: T.nFloors, ok: !glued,
      sum: `${plural(T.nFloors, 'floor')}, ground = 0${glued && WP ? ` · floor 0 box ${f1(WP.side !== 'F' ? T.W + WP.w : T.W)} × ${f1(WP.side === 'F' ? T.D + WP.d : T.D)} m` : ''}`,
      defect: glued ? `P2: floor 0 took in a neighbouring drawing (${f1(T.ndW)} × ${f1(T.ndD)} m)` : null,
    });
    {
      const area0 = Math.round(fbW * fbD + (T.rear ? T.rear.w * T.rear.d : 0));
      let sum = `${plural(T.nFloors, 'outline')} · floor 0 = ${area0} m²`;
      if (wing && A.floor_boxes === 'default' && A.floor_outlines === 'own_drawing_1') sum += ' · the neighbouring drawing is now the floor\'s own drawing; kept';
      else if (glued && !wing) sum = `${plural(T.nFloors, 'outline')} · floor 0 = ${Math.round(T.W * T.D + (T.rear ? T.rear.w * T.rear.d : 0))} m² · dropped a neighbouring drawing`;
      put('floor_outlines', { ok: !wing, sum, defect: wing ? 'P3: a neighbouring drawing joined floor 0: an extra wing' : null, mark: 'P3 a neighbouring drawing, now a wing' });
    }
    {
      const ends = T.roof === 'hip' ? 0 : T.axis === 'z' ? 2 : 2 - (T.partyL ? 1 : 0) - (T.partyR ? 1 : 0);
      put('gable_ends', { sum: ends ? `${plural(ends, 'gable end')}${T.gableGap ? ' · a gap in one gable line (valid)' : ''}` : (T.roof === 'hip' ? 'no gable ends: hipped' : 'no gable ends: both ends are party walls') });
    }
    {
      const names = [['Living', 'Kitchen', 'Dining'], ['Bed 1', 'Bed 2', 'Bath'], ['Bed 3', 'Bed 4', 'Shower'], ['Loft room']];
      const rooms = []; for (let s = 0; s < T.storeys; s++) rooms.push(...names[Math.min(s, 2)]);
      if (T.roomInRoof) rooms.push('Loft room');
      put('read_rooms', { calls: T.nFloors, sum: `${rooms.length} rooms: ${rooms.slice(0, 4).join(', ')}${rooms.length > 4 ? ', …' : ''}` });
      X.rooms = names[0];
    }
    {
      const cm = T.tileOOR ? r1(2.1 * T.factor) : r1(1.6 + rs('plan_scale')() * 0.9);
      put('plan_scale', { ok: null, sum: `1 px = ${f1(cm)} cm${T.tileOOR ? ' (out of range)' : ''}` });
      X.cm = cm;
    }
    put('plan_sheet', {
      ok: scale === 1,
      sum: T.tileOOR ? (scale !== 1 ? `largest drawing: floor 0 · tile scaled ×${f1(T.factor)}` : `largest drawing: floor 0 · factor ×${f1(T.factor)} out of range: tile left unscaled`) : 'largest drawing: floor 0 · tile scaled ×1.0',
      defect: scale !== 1 ? `P14: an out-of-range plan tile was applied: ${f1(T.factor)}× gold size` : null, mark: `P14 out-of-range factor applied: ${f1(T.factor)}× gold size`,
    });
    put('align_floors', {
      ok: !dropped,
      sum: dropped ? `aligned 1 of ${T.nFloors} floors · floor 1: no walls found` : `aligned ${T.nFloors} of ${T.nFloors} floors${T.lightWalls && T.storeys >= 2 ? ' · floor 1 read from light walls' : ''}`,
      defect: dropped ? `P5: upper storeys dropped (gold: storeys ${T.storeyList})` : null, mark: `P5 upper storeys dropped (gold: ${T.storeyList})`,
    });
    put('projections', { sum: [T.bay && `bay (${T.bay.side}, 0.6 m)`, T.porch && (T.porch === 'closed' ? 'porch (1.3 m)' : 'porch canopy'), T.rear && `rear ${T.rear.kind}`].filter(Boolean).join(' · ') || 'none' });
    {
      const cells = Math.round(T.W * 2) * Math.round(T.D * 2) * (dropped ? 1 : T.storeys);
      put('floor_cells', {
        ok: !shifted, sum: `${cells} cells on the 0.5 m grid · ${shifted ? 'floor 1 offset 0.5 m from floor 0' : 'each floor snapped to the one below'}`,
        defect: shifted ? 'P8: floor 1 not snapped to floor 0: a 0.5 m step' : null, mark: 'P8 floor 1 not snapped: 0.5 m step',
      });
    }
    put('floor_diff', { ok: null, sum: T.storeys < 2 || dropped ? 'one floor: nothing to diff' : `floor 1 = floor 0${T.bay && T.bay.storeys === 1 ? ' − bay' : ''}${T.porch ? ' − porch' : ''}${T.rear ? ' − ' + T.rear.kind : ''}` });
    const nFront = M.front.wins.length + (M.front.bay ? 1 : 0);
    put('detect_features', { calls: 2, sum: `${plural(nFront, 'window')}, 1 door (0.9 m) on the front` });
    put('mark_features', {
      ok: !winFloat && !doorFloat,
      sum: A.mark_features === 'default' ? `${nFront + 1} features marked where they were boxed`
        : A.mark_features === 'front_snap_1' ? `${nFront + 1} marked · ${plural(M.front.wins.length, 'window')} snapped onto the wall${doorFloat ? ' · door left 0.3 m off the front faces' : ''}`
          : `${nFront + 1} marked · windows and door on the front faces`,
      defect: winFloat ? 'P10: front windows 0.3 m in front of the wall' : doorFloat ? 'P10: front door left 0.3 m off the front faces (its recess, measured the wrong way)' : null, mark: winFloat ? 'P10 windows 0.3 m off the wall' : 'P10 door 0.3 m off the front faces: recess measured the wrong way',
    });
    {
      const projList = [T.bay && 'bay', T.porch && porchKnown && 'porch'].filter(Boolean);
      const nd = dormers ? M.dormers.length : 0;
      const missingProj = !proj && projList.length;
      put('massing', {
        ok: doorCut < 1 && !missingProj && !(T.roomInRoof && !dormersMassed),
        sum: `${plural(n, 'storey')} massed · door cut ${f1(doorCut)} m${proj ? (projList.length ? ' · ' + projList.join(', ') : '') : ' · no projections'}${T.roomInRoof ? (dormersMassed ? (nd ? ` · ${plural(nd, 'dormer')}` : ' · no dormers: no roof storey to put them in') : ' · no dormers') : ''}`,
        defect: doorCut > 1 ? `M1: door cut ${f1(doorCut)} m wide (gold 0.9 m)` : missingProj ? 'M1: no bay or porch: projections not massed' : (T.roomInRoof && !dormersMassed) ? 'M1: no dormers on the storey in the roof' : null,
        mark: doorCut > 1 ? `M1 door ${f1(doorCut)} m wide (gold 0.9 m)` : missingProj ? 'M1 no bay, no porch' : 'M1 no dormers',
      });
    }
    put('roofer', {
      ok: roofType === T.roof && !fullRoofStorey,
      sum: `${roofType === 'hip' ? 'hipped' : chalet ? 'chalet' : 'gable'} roof · ridge ${f1(M.ridgeY * scale)} m · ${M.roofLines.ridge.length ? plural(M.roofLines.ridge.length, 'ridge') : 'no ridge'}${M.roofLines.hip.length ? `, ${plural(M.roofLines.hip.length, 'hip')}` : ''}${M.roofLines.valley.length ? `, ${plural(M.roofLines.valley.length, 'valley', 'valleys')}` : ''}`,
      defect: roofType !== T.roof ? 'M2: a hipped roof built as a gable' : fullRoofStorey ? 'M2: the storey in the roof built as a full storey' : null,
      mark: roofType !== T.roof ? 'M2 hipped roof built as a gable' : 'M2 roof storey built as a full storey',
    });
    put('decorate', { sum: `${plural(M.winCount, 'window')}, 1 door, ${plural(M.pipes, 'downpipe')} from the main roof front gutter${T.chimney ? ', 1 chimney' : ''}` });
    {
      const ok = A.wall_materials === 'tagged_front_1' || (A.wall_materials === 'default' && T.wall[1] === '#a8553f');
      put('wall_materials', {
        ok, sum: `${wallMat[0]} · roof: ${T.roofMat[0].toLowerCase()}`,
        defect: ok ? null : A.wall_materials === 'default' ? `M5: walls in the library default (gold: ${T.wall[0].toLowerCase()})` : 'M5: wall colour sampled from a photo in shade',
        mark: A.wall_materials === 'default' ? 'M5 library default brick' : 'M5 colour from a photo in shade',
      });
    }
    const defects = KEYS.filter((k) => out[k] && out[k].ok === false);
    const score = r1(5 + ((OS.hash(`${T.id}|${defects.join(',')}`) % 5) - 2) / 10);
    const faces = buildScene({ T, X, M, site }, new Set(KEYS), {}).faces.length;
    put('composed_model', {
      calls: 1, price: A.composed_model === 'luna' ? 1.4 : 1, ok: score >= 4.5,
      sum: `${faces} faces · ${f1(score)}/10 against the photos${A.composed_model === 'luna' ? ' · added a front hedge' : ''}`,
    });
    return { T, A, X, M, site, out, score, faces, usd: r2(KEYS.reduce((s, k) => s + out[k].usd, 0)) };
  }

  // ---------- the model: layout of the house in metres, on the 0.5 m grid ----------
  function modelSpec(T, X, site) {
    const { x0, x1, zf, zb } = frameOf(T);
    const W = T.W; const D = T.D;
    const k = W >= 7.5 ? 3 : 2; const colW = W / k;
    const cols = Array.from({ length: k }, (_, j) => colW * (j + 0.5));
    const doorCol = T.door === 'left' ? 0 : k - 1;
    let bayCol = T.bay ? (T.bay.side === 'left' ? 0 : k - 1) : -1;
    if (bayCol === doorCol) bayCol = -1;
    const n = X.n; const eaves = n * SH;
    const H = X.chalet ? T.pitch : (T.roomInRoof ? 2.7 : T.pitch);
    const M = { T, X, site, W, D, x0, x1, zf, zb, zc: (zf + zb) / 2, xc: (x0 + x1) / 2, k, colW, cols, doorCol, bayCol, n, eaves, H };
    const sh = X.shift;
    // front layout
    const front = { wins: [], bay: null, door: { a: cols[doorCol] } };
    const sillY = (s) => (s === 0 ? 0.85 : s * SH + 0.8);
    const winH = (s) => (s === 0 ? 1.35 : s === 1 ? 1.3 : 1.1);
    for (let s = 0; s < n; s++) {
      for (let j = 0; j < k; j++) {
        if (s === 0 && j === doorCol) continue;
        const bayHere = X.proj && j === bayCol && (s === 0 || (s === 1 && T.bay.storeys === 2 && n >= 2));
        if (bayHere) { front.bay = { j, storeys: T.bay.storeys === 2 && n >= 2 ? 2 : 1 }; continue; }
        const w = j === doorCol && k === 2 ? 0.6 : colW >= 2.9 ? 1.5 : 1.0;
        front.wins.push({ s, j, a: cols[j] - w / 2, w, y: sillY(s), hh: j === doorCol && k === 2 ? 1.0 : winH(s) });
      }
    }
    M.front = front;
    // dormers on the front slope, over the window columns
    const dormerCols = k === 3 ? [0, 2] : [doorCol === 0 ? 1 : 0];
    M.dormerPlan = dormerCols.length;
    M.dormers = X.dormers ? dormerCols.map((j) => ({ cx: x0 + sh + cols[j], w: 1.5 })) : [];
    // the wing: a neighbouring drawing glued onto floor 0
    if (T.nd) {
      if (!T.partyR || !T.partyL) {
        const side = !T.partyR ? 'R' : 'L';
        const gap = side === 'R' ? site.gapR : site.gapL;
        const w = Math.max(1.5, Math.min(T.ndW, snap(gap - 0.5)));
        M.wing = { side, w, d: T.ndD };
      } else M.wing = { side: 'F', w: Math.min(3, snap(W - 1.5)), d: 3 };
      const wg = M.wing;
      if (wg.side === 'R') wg.rect = [x1, x1 + wg.w, zf - wg.d, zf];
      else if (wg.side === 'L') wg.rect = [x0 - wg.w, x0, zf - wg.d, zf];
      else { const wx0 = doorCol !== 0 ? x0 + 0.3 : x1 - 0.3 - wg.w; wg.rect = [wx0, wx0 + wg.w, zf, zf + wg.d]; }
      M.wingPlan = M.wing;
      if (!X.wing) M.wing = null;
    }
    // roof geometry for this building
    const roof = roofGeometry(M);
    M.roof = roof; M.ridgeY = roof.yr; M.roofLines = roof.lines;
    M.winCount = front.wins.length + (front.bay ? 3 * front.bay.storeys : 0) + backWindows(M).length + (T.partyL ? 0 : n) + (T.partyR ? 0 : n) + M.dormers.length;
    M.pipes = roof.pipes;
    return M;
  }

  // ---------- geometry helpers ----------
  const C = {
    mass: '#d8d1c3', roofMass: '#8b8782', frame: '#f2f0ea', glass: '#3b4b5e', sill: '#dcd6ca', opening: '#22242a',
    nWall: '#a9a7af', nRoof: '#7f7d88', nWin: '#686670', lawn: '#7c9a5b', path: '#cbc1ae', pave: '#b3b0a9', road: '#56575d',
    drive: '#a29b8e', fence: '#7a5c45', hedge: '#4f6d3d', pipe: '#2b2b30', pot: '#a85c3e', chimney: '#8d4b38', conserv: '#c6dde8', line: '#e9e7de',
  };
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function newell(pts) {
    const n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; const b = pts[(i + 1) % pts.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(n[0], n[1], n[2]);
    return { n: l ? [n[0] / l, n[1] / l, n[2] / l] : [0, 1, 0], area: l / 2 };
  }
  function face(pts, color, o, out) {
    let { n } = newell(pts);
    if (out && vdot(n, out) < 0) n = [-n[0], -n[1], -n[2]];
    return Object.assign({ pts, n, color }, o);
  }
  const bx = (xa, xb, ya, yb, za, zb, color, o = {}) => OS.r3d.shapes.box(Math.min(xa, xb), Math.min(ya, yb), Math.min(za, zb), Math.abs(xb - xa), Math.abs(yb - ya), Math.abs(zb - za), color, o);
  function clipAx(pts, ax, c, keepHi) {
    const res = [];
    const inside = (p) => (keepHi ? p[ax] >= c - 1e-7 : p[ax] <= c + 1e-7);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; const b = pts[(i + 1) % pts.length];
      const ia = inside(a); const ib = inside(b);
      if (ia) res.push(a);
      if (ia !== ib) { const t = (c - a[ax]) / (b[ax] - a[ax]); res.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
    }
    return res.filter((p, i) => { const q = res[(i + res.length - 1) % res.length]; return res.length < 2 || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 1e-6; });
  }
  function slab(f, ax, lo, hi) {
    let p = clipAx(f.pts, ax, lo, true);
    if (p.length >= 3) p = clipAx(p, ax, hi, false);
    return p.length >= 3 && newell(p).area > 1e-4 ? { ...f, pts: p } : null;
  }
  function splitAx(f, ax, cuts) {
    const xs = [-1e9, ...cuts.slice().sort((a, b) => a - b), 1e9];
    const res = [];
    for (let i = 0; i < xs.length - 1; i++) { const s = slab(f, ax, xs[i], xs[i + 1]); if (s) res.push(s); }
    return res;
  }
  // A wall facet: bottom edge P -> Q as seen from outside, outward normal n. Features sit on it at distance a from P.
  function facet(P, Q, n) { const len = Math.hypot(Q[0] - P[0], Q[2] - P[2]); return { P, Q, n, len, d: [(Q[0] - P[0]) / len, 0, (Q[2] - P[2]) / len] }; }
  function rectOn(fc, a, w, y, hh, off, color, o = {}) {
    const p = (u, v) => [fc.P[0] + fc.d[0] * u + fc.n[0] * off, v, fc.P[2] + fc.d[2] * u + fc.n[2] * off];
    return { pts: [p(a, y), p(a + w, y), p(a + w, y + hh), p(a, y + hh)], n: fc.n.slice(), color, panel: true, ...o };
  }
  const axisAligned = (fc) => Math.abs(fc.n[0]) < 1e-6 || Math.abs(fc.n[2]) < 1e-6;
  function sillOn(fc, a, w, y, off, o) {
    const s0 = [fc.P[0] + fc.d[0] * (a - 0.08) + fc.n[0] * off, fc.P[2] + fc.d[2] * (a - 0.08) + fc.n[2] * off];
    const s1 = [fc.P[0] + fc.d[0] * (a + w + 0.08) + fc.n[0] * (off + 0.13), fc.P[2] + fc.d[2] * (a + w + 0.08) + fc.n[2] * (off + 0.13)];
    const back = fc.n[2] > 0.5 ? 'back' : fc.n[2] < -0.5 ? 'front' : fc.n[0] > 0.5 ? 'left' : 'right';
    return bx(s0[0], s1[0], y - 0.12, y - 0.04, s0[1], s1[1], C.sill, { ...o, skip: ['bottom', back], kind: 'sill' });
  }
  function windowOn(fc, a, w, y, hh, float, o = {}) {
    const off = 0.02 + float; const b0 = o.bias === undefined ? 0.08 : o.bias;
    const res = [
      rectOn(fc, a - 0.07, w + 0.14, y - 0.07, hh + 0.14, off, C.frame, { ...o, bias: b0, kind: 'frame' }),
      rectOn(fc, a, w, y, hh, off, C.glass, { ...o, bias: b0 + 0.02, kind: 'glass', edge: false }),
    ];
    if (w >= 0.9) res.push(rectOn(fc, a + w / 2 - 0.035, 0.07, y, hh, off, C.frame, { ...o, bias: b0 + 0.04, edge: false, kind: 'bar' }));
    if (hh >= 1.2) res.push(rectOn(fc, a, w, y + hh * 0.68, 0.06, off, C.frame, { ...o, bias: b0 + 0.04, edge: false, kind: 'bar' }));
    if (axisAligned(fc)) res.push(...sillOn(fc, a, w, y, float, { ...o, bias: b0 + 0.1 }));
    return res;
  }

  // ---------- roofs ----------
  // Slopes over a rectangle (overhang included). Ridge along x unless axis is 'z' (or a narrow hip).
  function roofSlopes(rx0, rx1, rz0, rz1, yb, yr, type, axis) {
    const xm = (rx0 + rx1) / 2; const zm = (rz0 + rz1) / 2;
    const w = rx1 - rx0; const d = rz1 - rz0;
    const F = (pts, out) => face(pts, '#000', {}, [out[0], 0.6, out[2]]);
    const lines = { ridge: [], hip: [] };
    let fs;
    if (type === 'gable' && axis === 'z') {
      fs = [F([[rx0, yb, rz0], [rx0, yb, rz1], [xm, yr, rz1], [xm, yr, rz0]], [-1, 0, 0]), F([[rx1, yb, rz1], [rx1, yb, rz0], [xm, yr, rz0], [xm, yr, rz1]], [1, 0, 0])];
      lines.ridge.push([[xm, yr, rz0], [xm, yr, rz1]]);
    } else if (type === 'gable') {
      fs = [F([[rx0, yb, rz1], [rx1, yb, rz1], [rx1, yr, zm], [rx0, yr, zm]], [0, 0, 1]), F([[rx1, yb, rz0], [rx0, yb, rz0], [rx0, yr, zm], [rx1, yr, zm]], [0, 0, -1])];
      lines.ridge.push([[rx0, yr, zm], [rx1, yr, zm]]);
    } else if (w >= d) {
      const i = d / 2;
      fs = [
        F([[rx0, yb, rz1], [rx1, yb, rz1], [rx1 - i, yr, zm], [rx0 + i, yr, zm]], [0, 0, 1]),
        F([[rx1, yb, rz0], [rx0, yb, rz0], [rx0 + i, yr, zm], [rx1 - i, yr, zm]], [0, 0, -1]),
        F([[rx0, yb, rz0], [rx0, yb, rz1], [rx0 + i, yr, zm]], [-1, 0, 0]),
        F([[rx1, yb, rz1], [rx1, yb, rz0], [rx1 - i, yr, zm]], [1, 0, 0]),
      ];
      if (w > d + 1e-6) lines.ridge.push([[rx0 + i, yr, zm], [rx1 - i, yr, zm]]);
      lines.hip.push([[rx0, yb, rz0], [rx0 + i, yr, zm]], [[rx0, yb, rz1], [rx0 + i, yr, zm]], [[rx1, yb, rz0], [rx1 - i, yr, zm]], [[rx1, yb, rz1], [rx1 - i, yr, zm]]);
    } else {
      const i = w / 2;
      fs = [
        F([[rx1, yb, rz0], [rx1, yb, rz1], [xm, yr, rz1 - i], [xm, yr, rz0 + i]], [1, 0, 0]),
        F([[rx0, yb, rz1], [rx0, yb, rz0], [xm, yr, rz0 + i], [xm, yr, rz1 - i]], [-1, 0, 0]),
        F([[rx0, yb, rz1], [rx1, yb, rz1], [xm, yr, rz1 - i]], [0, 0, 1]),
        F([[rx1, yb, rz0], [rx0, yb, rz0], [xm, yr, rz0 + i]], [0, 0, -1]),
      ];
      lines.ridge.push([[xm, yr, rz0 + i], [xm, yr, rz1 - i]]);
      lines.hip.push([[rx0, yb, rz0], [xm, yr, rz0 + i]], [[rx1, yb, rz0], [xm, yr, rz0 + i]], [[rx0, yb, rz1], [xm, yr, rz1 - i]], [[rx1, yb, rz1], [xm, yr, rz1 - i]]);
    }
    return { faces: fs.map((f) => ({ ...f, pts: f.pts.filter((p, i, a) => a.findIndex((q) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2]) === i) })).filter((f) => f.pts.length >= 3), lines };
  }

  // A roof over a block of buildings (a terrace row or a semi pair), cut down to one building.
  function blockRoof({ bx0, bx1, z0, z1, eaves, H, type, axis, extL, extR, seg }) {
    const o = 0.3; const v = type === 'hip' ? 0.3 : 0.15;
    let rx0; let rx1; let rz0; let rz1; let run;
    if (type === 'gable' && axis === 'z') { run = (bx1 - bx0) / 2; rx0 = bx0 - o; rx1 = bx1 + o; rz0 = z0 - 0.15; rz1 = z1 + 0.15; }
    else if (type === 'hip') { run = Math.min(bx1 - bx0, z1 - z0) / 2; rx0 = bx0 - (extL ? o : 0); rx1 = bx1 + (extR ? o : 0); rz0 = z0 - o; rz1 = z1 + o; }
    else { run = (z1 - z0) / 2; rx0 = bx0 - (extL ? v : 0); rx1 = bx1 + (extR ? v : 0); rz0 = z0 - o; rz1 = z1 + o; }
    const yb = eaves - (H * o) / run; const yr = eaves + H;
    const slopes = roofSlopes(rx0, rx1, rz0, rz1, yb, yr, type, axis);
    const s0 = seg[0] - (seg[0] <= bx0 + 1e-6 && extL ? (type === 'hip' || axis === 'z' ? o : v) : 0);
    const s1 = seg[1] + (seg[1] >= bx1 - 1e-6 && extR ? (type === 'hip' || axis === 'z' ? o : v) : 0);
    const faces = slopes.faces.map((f) => slab(f, 0, s0, s1)).filter(Boolean);
    const clipLine = ([a, b]) => {
      const lo = Math.max(s0, Math.min(a[0], b[0])); const hi = Math.min(s1, Math.max(a[0], b[0]));
      if (hi < lo - 1e-6) return null;
      if (Math.abs(a[0] - b[0]) < 1e-6) return a[0] >= s0 - 1e-6 && a[0] <= s1 + 1e-6 ? [a, b] : null;
      const at = (x) => { const t = (x - a[0]) / (b[0] - a[0]); return [x, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
      return [at(lo), at(hi)];
    };
    const lines = { ridge: slopes.lines.ridge.map(clipLine).filter(Boolean), hip: slopes.lines.hip.map(clipLine).filter(Boolean) };
    // Height of the ridge line at x (the hip ends slope down)
    const zm = (rz0 + rz1) / 2;
    const apexAt = (x) => {
      if (type !== 'hip' || (rx1 - rx0) < (rz1 - rz0)) return yr;
      const i = (rz1 - rz0) / 2;
      return yb + (yr - yb) * Math.min(1, (x - rx0) / i, (rx1 - x) / i);
    };
    return { faces, lines, yb, yr, rx0, rx1, rz0, rz1, zm, apexAt, s0, s1 };
  }

  function roofGeometry(M) {
    const { T, X, site, x0, x1, zf, zb, eaves, H } = M;
    const sh = X.shift;
    const type = X.roofType; const axis = X.axis;
    const attachedBlock = T.partyL || T.partyR;
    const bx0 = (attachedBlock ? site.bx0 : x0) + sh; const bx1 = (attachedBlock ? site.bx1 : x1) + sh;
    const extL = !(site.nb.find((b) => b.attached && b.side === 'L' && b.cut)); const extR = !(site.nb.find((b) => b.attached && b.side === 'R' && b.cut));
    const R = blockRoof({ bx0, bx1, z0: zb, z1: zf, eaves, H, type, axis, extL: T.partyL ? extL : true, extR: T.partyR ? extR : true, seg: [x0 + sh, x1 + sh] });
    if (M.dormers.length) {
      const ridgeAlongZ = axis === 'z' || (type === 'hip' && (R.rx1 - R.rx0) < (R.rz1 - R.rz0));
      if (ridgeAlongZ) M.dormers = [];
      else {
        const run = (R.rz1 - R.rz0) / 2; const Hs = R.yr - eaves;
        const top = Math.min(eaves + Hs * 0.7 / (zf - R.zm) + 1.45, R.yr - 0.45) + 0.42;
        const inset = type === 'hip' ? run * (top - R.yb) / (R.yr - R.yb) : 0;
        const lo = Math.max(R.rx0 + inset, x0 + sh) + 0.15; const hi = Math.min(R.rx1 - inset, x1 + sh) - 0.15;
        const fit = [];
        for (const d of M.dormers) {
          const half = d.w / 2 + 0.1;
          if (hi - lo < 2 * half) continue;
          const cx = OS.clamp(d.cx, lo + half, hi - half);
          if (!fit.length || cx - fit[fit.length - 1].cx >= d.w + 0.4) fit.push({ ...d, cx });
        }
        M.dormers = fit;
      }
    }
    // split slopes into column strips (and at dormers and the chimney) so the painter sorts them locally
    const cuts = [];
    for (let j = 1; j < M.k; j++) cuts.push(x0 + sh + M.colW * j);
    for (const d of M.dormers) cuts.push(d.cx - d.w / 2 - 0.1, d.cx + d.w / 2 + 0.1);
    const faces = [];
    for (const f of R.faces) faces.push(...splitAx(f, 0, cuts));
    for (const f of faces) Object.assign(f, { mat: 'roof', kind: 'roof', hb: true, mainRoof: true });
    const ends = [];
    const tri = (pts, out) => face(pts, '#000', { mat: 'wall', kind: 'gableEnd', hb: true }, out);
    if (type === 'gable' && axis === 'z') {
      const xm = (x0 + x1) / 2 + sh;
      ends.push(tri([[x0 + sh, eaves, zf], [x1 + sh, eaves, zf], [xm, R.yr, zf]], [0, 0, 1]), tri([[x1 + sh, eaves, zb], [x0 + sh, eaves, zb], [xm, R.yr, zb]], [0, 0, -1]));
    } else {
      for (const [x, out] of [[x0 + sh, [-1, 0, 0]], [x1 + sh, [1, 0, 0]]]) {
        const party = out[0] < 0 ? T.partyL : T.partyR;
        if (type === 'hip' && !party) continue;
        const ap = R.apexAt(x);
        if (ap > eaves + 0.05) ends.push(tri([[x, eaves, zb], [x, eaves, zf], [x, ap, R.zm]], out));
      }
    }
    // ridge, hip and valley lines (the roofer step draws them)
    const lines = { ridge: R.lines.ridge, hip: R.lines.hip, valley: [] };
    // dormers on the front slope
    const dorm = [];
    if (M.dormers.length && axis === 'x') {
      const zm = R.zm; const Hs = R.yr - eaves;
      const yAt = (z) => eaves + Hs * (zf - z) / (zf - zm);
      const zAt = (y) => zf - ((y - eaves) / Hs) * (zf - zm);
      for (const d of M.dormers) {
        const dx0 = d.cx - d.w / 2; const dx1 = d.cx + d.w / 2; const zd = zf - 0.7;
        const yb0 = yAt(zd); const yt = Math.min(yb0 + 1.45, R.yr - 0.45); const zt = zAt(yt);
        const rr = 0.42; const zr = zAt(yt + rr); const xm = d.cx;
        const W0 = { mat: 'wall', kind: 'dormer', hb: true, bias: 0.15 };
        dorm.push(
          face([[dx0, yb0, zd], [dx1, yb0, zd], [dx1, yt, zd], [dx0, yt, zd]], '#000', W0, [0, 0, 1]),
          face([[dx0, yb0, zd], [dx0, yt, zd], [dx0, yt, zt]], '#000', W0, [-1, 0, 0]),
          face([[dx1, yb0, zd], [dx1, yt, zt], [dx1, yt, zd]], '#000', W0, [1, 0, 0]),
          face([[dx0, yt, zd], [dx1, yt, zd], [xm, yt + rr, zd]], '#000', W0, [0, 0, 1]),
          face([[dx0 - 0.1, yt - 0.05, zd + 0.15], [xm, yt + rr, zd + 0.15], [xm, yt + rr, zr], [dx0 - 0.1, yt - 0.05, zt]], '#000', { mat: 'roof', kind: 'roof', hb: true, bias: 0.2, mainRoof: true }, [-1, 1, 0]),
          face([[xm, yt + rr, zd + 0.15], [dx1 + 0.1, yt - 0.05, zd + 0.15], [dx1 + 0.1, yt - 0.05, zt], [xm, yt + rr, zr]], '#000', { mat: 'roof', kind: 'roof', hb: true, bias: 0.2, mainRoof: true }, [1, 1, 0]),
        );
        dorm.push(...windowOn(facet([dx0, 0, zd], [dx1, 0, zd], [0, 0, 1]), 0.2, d.w - 0.4, yb0 + 0.3, Math.max(0.6, yt - yb0 - 0.5), 0, { hb: true, bias: 0.2, kind: 'dwin' }).filter((f) => f.kind !== 'sill'));
        lines.ridge.push([[xm, yt + rr, zd + 0.15], [xm, yt + rr, zr]]);
        lines.valley.push([[xm, yt + rr, zr], [dx0 - 0.1, yt - 0.05, zt]], [[xm, yt + rr, zr], [dx1 + 0.1, yt - 0.05, zt]]);
      }
    }
    // chimney
    const chim = [];
    if (T.chimney) {
      let cx0; let cx1; let cz0; let cz1;
      if (axis === 'z' && type === 'gable') { cx0 = (x0 + x1) / 2 + sh - 0.3; cx1 = cx0 + 0.6; cz0 = zb + 1.2; cz1 = cz0 + 0.9; }
      else {
        const ridge = R.lines.ridge[0] || [[x0 + sh + 1, 0, 0], [x1 + sh - 1, 0, 0]];
        const rs0 = Math.min(ridge[0][0], ridge[1][0]); const rs1 = Math.max(ridge[0][0], ridge[1][0]);
        let c = T.chimney === 'party' ? (T.partyL ? x0 + sh : x1 + sh) : T.chimney === 'left' ? x0 + sh + 0.55 : x1 + sh - 0.55;
        c = OS.clamp(c, rs0 + (T.chimney === 'party' ? 0 : 0.35), rs1 - (T.chimney === 'party' ? 0 : 0.35));
        cx0 = c - 0.35; cx1 = c + 0.35; cz0 = R.zm - 0.45; cz1 = R.zm + 0.45;
      }
      const top = R.yr + 0.95;
      chim.push(...bx(cx0, cx1, R.yr - 0.9, top, cz0, cz1, C.chimney, { skip: ['bottom'], kind: 'chimney', hb: true }));
      chim.push(...bx(cx0 - 0.06, cx1 + 0.06, top, top + 0.08, cz0 - 0.06, cz1 + 0.06, '#7a4232', { skip: ['bottom'], kind: 'chimney', hb: true }));
      const pots = Math.abs(cz1 - cz0) > 0.8 ? [cz0 + 0.25, cz1 - 0.25] : [cz0 + 0.3];
      for (const pz of pots) chim.push(...bx((cx0 + cx1) / 2 - 0.1, (cx0 + cx1) / 2 + 0.1, top + 0.08, top + 0.42, pz - 0.1, pz + 0.1, C.pot, { skip: ['bottom'], kind: 'chimney', hb: true }));
    }
    // gutter and downpipes: from the main roof front gutter
    const pipes = []; const gut = []; let pipeCount = 0;
    if (!(type === 'gable' && axis === 'z')) {
      gut.push(...bx(R.s0, R.s1, R.yb - 0.13, R.yb, zf + 0.1, zf + 0.31, C.pipe, { skip: ['bottom', 'back'], kind: 'gutter', hb: true, bias: 0.3 }));
      const xs = [];
      if (!T.partyL) xs.push(x0 + sh + 0.16);
      if (!T.partyR) xs.push(x1 + sh - 0.16);
      if (!xs.length) xs.push(x1 + sh - 0.14);
      pipeCount = xs.length;
      for (const px of xs) pipes.push(...bx(px - 0.05, px + 0.05, 0.05, R.yb - 0.06, zf + 0.06, zf + 0.15, C.pipe, { skip: ['bottom', 'top', 'back'], kind: 'pipe', hb: true, bias: 0.9 }));
    } else {
      pipeCount = 2;
      for (const px of [x0 + sh - 0.2, x1 + sh + 0.2]) {
        gut.push(...bx(px - 0.1, px + 0.1, R.yb - 0.13, R.yb, zb, zf, C.pipe, { skip: ['bottom'], kind: 'gutter', hb: true }));
        pipes.push(...bx(px - 0.05, px + 0.05, 0.05, R.yb - 0.06, zf - 0.25, zf - 0.15, C.pipe, { skip: ['bottom', 'top'], kind: 'pipe', hb: true, bias: 0.3 }));
      }
    }
    return { faces, ends, dorm, chim, gut, pipeFaces: pipes, pipes: pipeCount, lines, yb: R.yb, yr: R.yr, zm: R.zm };
  }

  function backWindows(M) {
    const { T, k, colW, n, x0 } = M;
    const res = [];
    const rx0 = T.rear ? x0 + (T.partyL ? 0.3 : 0.5) : 0; const rx1 = T.rear ? rx0 + T.rear.w : 0;
    for (let s = 0; s < n; s++) {
      for (let j = 0; j < k; j++) {
        const c = colW * (j + 0.5);
        const w = s === 0 && j === 0 ? 0.9 : 1.0;
        const a = c - w / 2;
        const wx0 = M.x1 - a - w; const wx1 = M.x1 - a;
        if (s === 0 && T.rear && wx1 > rx0 - 0.2 && wx0 < rx1 + 0.2) continue;
        res.push({ s, a, w, door: s === 0 && j === 0, y: s === 0 && j === 0 ? 0 : (s === 0 ? 0.9 : s * SH + 0.85), hh: s === 0 && j === 0 ? 2.05 : 1.2 });
      }
    }
    return res;
  }

  // ---------- the house, part by part, in house coordinates (front at +z, left at -x as seen from the street) ----------
  function houseParts(M) {
    const { T, X, x0, x1, zf, zb, k, colW, cols, doorCol, n, front } = M;
    const sh = X.shift;
    const P = { walls: [], open: [], proj: [], roof: [], ends: [], deco: [], marks: [], rects: [], lines: M.roof.lines };
    const W0 = { mat: 'wall', kind: 'wall', hb: true };
    for (let s = 0; s < n; s++) {
      const dx = s > 0 ? sh : 0; const y0 = s * SH; const y1 = y0 + SH;
      for (let j = 0; j < k; j++) {
        const a0 = x0 + dx + colW * j; const a1 = a0 + colW;
        P.walls.push(face([[a0, y0, zf], [a1, y0, zf], [a1, y1, zf], [a0, y1, zf]], '#000', W0, [0, 0, 1]));
        P.walls.push(face([[a1, y0, zb], [a0, y0, zb], [a0, y1, zb], [a1, y1, zb]], '#000', W0, [0, 0, -1]));
      }
      P.walls.push(face([[x0 + dx, y0, zb], [x0 + dx, y0, zf], [x0 + dx, y1, zf], [x0 + dx, y1, zb]], '#000', W0, [-1, 0, 0]));
      P.walls.push(face([[x1 + dx, y0, zf], [x1 + dx, y0, zb], [x1 + dx, y1, zb], [x1 + dx, y1, zf]], '#000', W0, [1, 0, 0]));
    }
    if (sh && n > 1) P.walls.push(face([[x0, SH, zb], [x0, SH, zf], [x0 + sh, SH, zf], [x0 + sh, SH, zb]], '#000', { ...W0, kind: 'ledge' }, [0, 1, 0]));
    const fFront = (s) => facet([x0 + (s > 0 ? sh : 0), 0, zf], [x1 + (s > 0 ? sh : 0), 0, zf], [0, 0, 1]);
    const fBack = (s) => facet([x1 + (s > 0 ? sh : 0), 0, zb], [x0 + (s > 0 ? sh : 0), 0, zb], [0, 0, -1]);
    const fLeft = (s) => facet([x0 + (s > 0 ? sh : 0), 0, zb], [x0 + (s > 0 ? sh : 0), 0, zf], [-1, 0, 0]);
    const fRight = (s) => facet([x1 + (s > 0 ? sh : 0), 0, zf], [x1 + (s > 0 ? sh : 0), 0, zb], [1, 0, 0]);
    const FE = { feat: true, hb: true };
    // front windows
    for (const w of front.wins) {
      const fc = fFront(w.s);
      P.open.push(rectOn(fc, w.a, w.w, w.y, w.hh, 0.02 + X.winFloat, C.opening, { ...FE, kind: 'opening', bias: 0.08 }));
      P.marks.push(rectOn(fc, w.a, w.w, w.y, w.hh, 0.03 + X.winFloat, C.opening, { ...FE, kind: 'mark', alpha: 0.9, bias: 0.08 }));
      P.rects.push({ fc, a: w.a, w: w.w, y: w.y, hh: w.hh });
      P.deco.push(...windowOn(fc, w.a, w.w, w.y, w.hh, X.winFloat, { ...FE }));
      if (X.winFloat) P.deco.push(rectOn(fc, w.a + 0.18, w.w + 0.1, w.y - 0.3, w.hh + 0.1, 0.012, '#000000', { ...FE, kind: 'shadow', alpha: 0.3, edge: false, noShadow: true, bias: 0.04 }));
    }
    // the door, cut at the massing width; on the porch front when the porch is closed
    const dcx = cols[doorCol];
    const porch = X.proj && T.porch && X.porchKnown ? T.porch : null;
    let dfc = fFront(0); let da = dcx; let dOff = X.doorFloat;
    if (porch === 'closed') {
      const pw = Math.max(1.9, X.doorCut + 0.5); const pd = 1.3; const px0 = x0 + dcx - pw / 2;
      P.proj.push(...bx(px0, px0 + pw, 0, 2.4, zf, zf + pd, '#000', { ...W0, ...FE, kind: 'porch', skip: ['bottom', 'top', 'back'], bias: 0.05 }));
      const lr = OS.r3d.shapes.lean(px0 - 0.1, 2.4, zf, pw + 0.2, 0.45, pd + 0.15, '#000', 'z0', { ...FE, bias: 0.12 });
      for (const f of lr) Object.assign(f, f.kind === 'slope' ? { mat: 'roof', kind: 'roof' } : { mat: 'wall', kind: 'porch' });
      P.roof.push(...lr);
      dfc = facet([px0, 0, zf + pd], [px0 + pw, 0, zf + pd], [0, 0, 1]); da = pw / 2; dOff = 0;
      for (const side of [facet([px0, 0, zf], [px0, 0, zf + pd], [-1, 0, 0]), facet([px0 + pw, 0, zf + pd], [px0 + pw, 0, zf], [1, 0, 0])]) P.deco.push(...windowOn(side, pd / 2 - 0.3, 0.6, 1.0, 0.9, 0, { ...FE, bias: 0.12 }));
    } else if (porch === 'canopy') {
      const lr = OS.r3d.shapes.lean(x0 + dcx - 0.85, 2.45, zf, 1.7, 0.28, 0.9, '#000', 'z0', { ...FE, bias: 0.12 });
      for (const f of lr) Object.assign(f, { mat: 'roof', kind: 'roof' });
      P.roof.push(...lr);
    }
    const cut = X.doorCut;
    const db = porch === 'closed' ? 0.12 : 0.08;
    P.open.push(rectOn(dfc, da - cut / 2, cut, 0, 2.28, 0.02 + dOff, C.opening, { ...FE, kind: 'opening', bias: db }));
    P.marks.push(rectOn(dfc, da - cut / 2, cut, 0, 2.28, 0.03 + dOff, C.opening, { ...FE, kind: 'mark', alpha: 0.9, bias: db }));
    P.rects.push({ fc: dfc, a: da - 0.45, w: 0.9, y: 0, hh: 2.1 });
    P.deco.push(
      rectOn(dfc, da - cut / 2 - 0.08, cut + 0.16, 0, 2.36, 0.025 + dOff, C.frame, { ...FE, kind: 'frame', bias: db }),
      rectOn(dfc, da - cut / 2, cut, 0, 2.0, 0.03 + dOff, T.doorHex, { ...FE, kind: 'door', bias: db + 0.02 }),
      rectOn(dfc, da - cut / 2 + 0.06, cut - 0.12, 2.06, 0.22, 0.03 + dOff, C.glass, { ...FE, kind: 'glass', bias: db + 0.02, edge: false }),
      rectOn(dfc, da + cut / 2 - 0.16, 0.06, 0.95, 0.12, 0.04 + dOff, '#c9a54a', { ...FE, kind: 'knob', bias: db + 0.04, edge: false }),
    );
    {
      const P0 = dfc.P; const d = dfc.d; const nn = dfc.n;
      const a0 = [P0[0] + d[0] * (da - cut / 2 - 0.15) + nn[0] * dOff, P0[2] + d[2] * (da - cut / 2 - 0.15) + nn[2] * dOff];
      const a1 = [P0[0] + d[0] * (da + cut / 2 + 0.15) + nn[0] * (dOff + 0.35), P0[2] + d[2] * (da + cut / 2 + 0.15) + nn[2] * (dOff + 0.35)];
      P.deco.push(...bx(a0[0], a1[0], 0, 0.12, a0[1], a1[1], '#bdb6a8', { ...FE, kind: 'step', skip: ['bottom', 'back'], bias: db + 0.1 }));
    }
    // the bay: a canted prism with its own roof
    if (front.bay) {
      const b = front.bay; const bc = x0 + cols[b.j]; const bw = Math.min(colW - 0.9, 1.6); const p = 0.6; const sp = 0.45;
      const yT = b.storeys === 2 ? 2 * SH - 0.55 : SH - 0.4; const rr = 0.38;
      const A0 = [bc - bw / 2 - sp, zf]; const B0 = [bc + bw / 2 + sp, zf]; const C0 = [bc + bw / 2, zf + p]; const D0 = [bc - bw / 2, zf + p];
      const body = OS.r3d.solid([
        { pts: [[D0[0], 0, D0[1]], [C0[0], 0, C0[1]], [C0[0], yT, C0[1]], [D0[0], yT, D0[1]]], mat: 'wall', kind: 'bay' },
        { pts: [[A0[0], 0, A0[1]], [D0[0], 0, D0[1]], [D0[0], yT, D0[1]], [A0[0], yT, A0[1]]], mat: 'wall', kind: 'bay' },
        { pts: [[C0[0], 0, C0[1]], [B0[0], 0, B0[1]], [B0[0], yT, B0[1]], [C0[0], yT, C0[1]]], mat: 'wall', kind: 'bay' },
        { pts: [[D0[0], yT, D0[1]], [C0[0], yT, C0[1]], [B0[0], yT + rr, B0[1]], [A0[0], yT + rr, A0[1]]], mat: 'roof', kind: 'roof' },
        { pts: [[A0[0], yT, A0[1]], [D0[0], yT, D0[1]], [A0[0], yT + rr, A0[1]]], mat: 'roof', kind: 'roof' },
        { pts: [[C0[0], yT, C0[1]], [B0[0], yT, B0[1]], [B0[0], yT + rr, B0[1]]], mat: 'roof', kind: 'roof' },
      ], { ...FE, color: '#000', bias: 0.05 });
      for (const f of body) if (f.kind === 'roof') f.bias = 0.12;
      P.proj.push(...body.filter((f) => f.kind === 'bay'));
      P.roof.push(...body.filter((f) => f.kind === 'roof'));
      const fcs = [facet([D0[0], 0, D0[1]], [C0[0], 0, C0[1]], [0, 0, 1]), facet([A0[0], 0, A0[1]], [D0[0], 0, D0[1]], body[1].n), facet([C0[0], 0, C0[1]], [B0[0], 0, B0[1]], body[2].n)];
      for (let lv = 0; lv < b.storeys; lv++) {
        const y = lv === 0 ? 0.75 : SH + 0.7; const hh = lv === 0 ? 1.45 : 1.35;
        for (const fc of fcs) {
          const inset = fc === fcs[0] ? 0.12 : 0.1;
          const float = fc === fcs[0] ? X.winFloat : 0;
          P.open.push(rectOn(fc, inset, fc.len - 2 * inset, y, hh, 0.02 + float, C.opening, { ...FE, kind: 'opening', bias: 0.1 }));
          P.deco.push(...windowOn(fc, inset, fc.len - 2 * inset, y, hh, float, { ...FE, bias: 0.1 }).filter((f) => f.kind !== 'sill' || fc === fcs[0]));
        }
      }
      P.marks.push(rectOn(fcs[0], 0.12, fcs[0].len - 0.24, 0.75, 1.45, 0.03 + X.winFloat, C.opening, { ...FE, kind: 'mark', alpha: 0.9 }));
      P.rects.push({ fc: fFront(0), a: cols[b.j] - bw / 2, w: bw, y: 0.75, hh: 1.45 });
    }
    // back windows and the back door
    for (const w of backWindows(M)) {
      const fc = fBack(w.s);
      if (w.door) {
        P.open.push(rectOn(fc, w.a, w.w, 0, 2.1, 0.02, C.opening, { ...FE, kind: 'opening', bias: 0.08 }));
        P.deco.push(rectOn(fc, w.a - 0.07, w.w + 0.14, 0, 2.17, 0.025, C.frame, { ...FE, bias: 0.08 }), rectOn(fc, w.a, w.w, 0, 2.05, 0.03, '#e7e3d8', { ...FE, kind: 'door', bias: 0.1 }), rectOn(fc, w.a + 0.15, w.w - 0.3, 1.1, 0.8, 0.035, C.glass, { ...FE, kind: 'glass', bias: 0.12, edge: false }));
      } else {
        P.open.push(rectOn(fc, w.a, w.w, w.y, w.hh, 0.02, C.opening, { ...FE, kind: 'opening', bias: 0.08 }));
        P.deco.push(...windowOn(fc, w.a, w.w, w.y, w.hh, 0, { ...FE }));
      }
    }
    // side windows on exterior walls, and a gable window for a storey in the roof
    for (const [party, fcOf] of [[T.partyL, fLeft], [T.partyR, fRight]]) {
      if (party) continue;
      for (let s = 0; s < n; s++) {
        const fc = fcOf(s); const a = M.D / 2 - 0.3;
        P.open.push(rectOn(fc, a, 0.6, s * SH + 1.0, 1.0, 0.02, C.opening, { ...FE, kind: 'opening', bias: 0.08 }));
        P.deco.push(...windowOn(fc, a, 0.6, s * SH + 1.0, 1.0, 0, { ...FE }));
      }
      if (X.chalet && X.roofType === 'gable' && X.axis === 'x') {
        const fc = fcOf(n); const a = M.D / 2 - 0.3;
        P.deco.push(...windowOn(fc, a, 0.6, n * SH + 0.6, 0.9, 0, { hb: true, bias: 0.25 }).filter((f) => f.kind !== 'sill'));
      }
    }
    // rear extension or conservatory
    if (T.rear) {
      const rw = T.rear.w; const rd = T.rear.d; const ex0 = x0 + (T.partyL ? 0.3 : 0.5); const ex1 = ex0 + rw; const ez0 = zb - rd;
      if (T.rear.kind === 'extension') {
        P.proj.push(...bx(ex0, ex1, 0, 2.7, ez0, zb, '#000', { ...W0, ...FE, kind: 'rear', skip: ['bottom', 'top', 'front'] }));
        const lr = OS.r3d.shapes.lean(ex0 - 0.1, 2.7, ez0 - 0.2, rw + 0.2, 0.5, rd + 0.2, '#000', 'z1', { ...FE });
        for (const f of lr) Object.assign(f, f.kind === 'slope' ? { mat: 'roof', kind: 'roof' } : { mat: 'wall', kind: 'rear' });
        P.roof.push(...lr);
        const fc = facet([ex1, 0, ez0], [ex0, 0, ez0], [0, 0, -1]);
        P.open.push(rectOn(fc, 0.4, rw - 0.8, 0, 2.1, 0.02, C.opening, { ...FE, kind: 'opening', bias: 0.08 }));
        P.deco.push(...windowOn(fc, 0.4, rw - 0.8, 0.05, 2.0, 0, { ...FE }).filter((f) => f.kind !== 'sill'));
      } else {
        P.proj.push(...bx(ex0, ex1, 0, 0.6, ez0, zb, '#000', { ...W0, ...FE, kind: 'rear', skip: ['bottom', 'top', 'front'] }));
        const G = { ...FE, kind: 'conservatory', alpha: 0.45, edge: '#ffffffaa', noShadow: true };
        P.proj.push(
          face([[ex1, 0.6, ez0], [ex0, 0.6, ez0], [ex0, 2.4, ez0], [ex1, 2.4, ez0]], C.conserv, G, [0, 0, -1]),
          face([[ex0, 0.6, ez0], [ex0, 0.6, zb], [ex0, 2.4, zb], [ex0, 2.4, ez0]], C.conserv, G, [-1, 0, 0]),
          face([[ex1, 0.6, zb], [ex1, 0.6, ez0], [ex1, 2.4, ez0], [ex1, 2.4, zb]], C.conserv, G, [1, 0, 0]),
        );
        const lr = OS.r3d.shapes.lean(ex0 - 0.05, 2.4, ez0 - 0.1, rw + 0.1, 0.5, rd + 0.1, C.conserv, 'z1', { ...FE });
        for (const f of lr) {
          if (f.kind === 'slope') Object.assign(f, X.glazed ? { kind: 'roof', glazedRoof: true, alpha: 0.5, color: C.conserv, edge: '#ffffffaa' } : { mat: 'roof', kind: 'roof' });
          else Object.assign(f, { kind: 'conservatory', alpha: 0.45, edge: '#ffffffaa' });
        }
        P.roof.push(...lr);
      }
    }
    // the wing: a neighbouring drawing joined to floor 0
    if (M.wing) {
      const wg = M.wing; const [wx0, wx1, wz0, wz1] = wg.rect;
      const high = wg.side === 'R' ? 'x0' : wg.side === 'L' ? 'x1' : 'z0';
      const skip = wg.side === 'R' ? 'left' : wg.side === 'L' ? 'right' : 'back';
      const fc = facet([wx0, 0, wz1], [wx1, 0, wz1], [0, 0, 1]);
      P.proj.push(...bx(wx0, wx1, 0, 2.8, wz0, wz1, '#000', { ...W0, kind: 'wing', skip: ['bottom', 'top', skip] }));
      const ext = wg.side === 'F' ? [wx0 - 0.1, 2.8, wz0, wg.w + 0.2, 0.55, wg.d + 0.2] : wg.side === 'R' ? [wx0, 2.8, wz0 - 0.15, wg.w + 0.2, 0.55, wg.d + 0.3] : [wx0 - 0.2, 2.8, wz0 - 0.15, wg.w + 0.2, 0.55, wg.d + 0.3];
      const lr = OS.r3d.shapes.lean(...ext, '#000', high, { bias: 0.1 });
      for (const f of lr) Object.assign(f, f.kind === 'slope' ? { mat: 'roof', kind: 'roof', hb: true } : { mat: 'wall', kind: 'wing', hb: true });
      P.roof.push(...lr);
      const ww = Math.max(0.6, wg.w - 1);
      P.open.push(rectOn(fc, (wg.w - ww) / 2, ww, 0.9, 1.2, 0.02, C.opening, { hb: true, kind: 'opening', bias: 0.08 }));
      P.deco.push(...windowOn(fc, (wg.w - ww) / 2, ww, 0.9, 1.2, 0, { hb: true }));
      M.wingBox = { x: (wx0 + wx1) / 2, y: 3.2, z: (wz0 + wz1) / 2 };
    }
    // main roof
    const cl = (arr) => arr.map((f) => ({ ...f, pts: f.pts.map((q) => q.slice()), n: f.n ? f.n.slice() : f.n }));
    P.roof.push(...cl(M.roof.faces));
    P.ends.push(...cl(M.roof.ends), ...cl(M.roof.dorm));
    P.deco.push(...cl(M.roof.chim), ...cl(M.roof.gut), ...cl(M.roof.pipeFaces));
    return P;
  }

  // ---------- transforms: mirrored plans and rear-as-front move the features; an applied out-of-range factor scales everything ----------
  function featTx(M) {
    const { xc, zc } = M; const X = M.X;
    if (!X.mirror && !X.flip) return null;
    return {
      p: (q) => { let [x, y, z] = q; if (X.mirror) x = 2 * xc - x; if (X.flip) { x = 2 * xc - x; z = 2 * zc - z; } return [x, y, z]; },
      n: (v) => { let [a, b, c] = v; if (X.mirror) a = -a; if (X.flip) { a = -a; c = -c; } return [a, b, c]; },
    };
  }
  function scaleTx(M) {
    const s = M.X.scale; const { zf } = M;
    const ax = M.T.partyL && !M.T.partyR ? M.x1 : M.x0;
    return s === 1 ? null : (q) => [ax + (q[0] - ax) * s, q[1] * s, zf + (q[2] - zf) * s];
  }
  function applyTx(faces, M, scaled) {
    const ft = featTx(M); const st = scaled ? scaleTx(M) : null;
    for (const f of faces) {
      if (ft && f.feat) { f.pts = f.pts.map(ft.p); f.n = ft.n(f.n); }
      if (st) f.pts = f.pts.map(st);
    }
    return faces;
  }
  const txPoint = (M, q, { feat = false, scaled = true } = {}) => {
    const ft = featTx(M); const st = scaled ? scaleTx(M) : null;
    let p = q; if (ft && feat) p = ft.p(p); if (st) p = st(p); return p;
  };

  // ---------- neighbours, ground and plot ----------
  function neighbourFaces(M, solid) {
    const { T, site } = M; const res = [];
    const sc = M.X.scale; const ax = M.T.partyL && !M.T.partyR ? M.x1 : M.x0; const hx0 = Math.min(ax + (M.x0 - ax) * sc, ax + (M.x1 - ax) * sc); const hx1 = Math.max(ax + (M.x0 - ax) * sc, ax + (M.x1 - ax) * sc);
    for (const b of site.nb) {
      const inside = sc > 1 && b.x1 > hx0 && b.x0 < hx1;
      const alpha = !solid ? 0.24 : inside ? 0.28 : 1;
      const o = { nb: true, alpha, noShadow: alpha < 1, edge: alpha < 1 ? 'rgba(160,160,170,.55)' : undefined };
      const eaves = b.storeys * SH + (b.eavesAdj || 0);
      const w = b.x1 - b.x0; const kk = w > 7.4 ? 3 : 2; const cw = w / kk;
      for (let s = 0; s < b.storeys; s++) {
        const y0 = s * SH; const y1 = s === b.storeys - 1 ? eaves : (s + 1) * SH;
        for (let j = 0; j < kk; j++) { const a0 = b.x0 + cw * j; res.push(face([[a0, y0, b.zf], [a0 + cw, y0, b.zf], [a0 + cw, y1, b.zf], [a0, y1, b.zf]], C.nWall, { ...o, kind: 'nwall' }, [0, 0, 1])); }
        res.push(face([[b.x1, y0, b.zb], [b.x0, y0, b.zb], [b.x0, y1, b.zb], [b.x1, y1, b.zb]], C.nWall, { ...o, kind: 'nwall' }, [0, 0, -1]));
        res.push(face([[b.x0, y0, b.zb], [b.x0, y0, b.zf], [b.x0, y1, b.zf], [b.x0, y1, b.zb]], C.nWall, { ...o, kind: 'nwall' }, [-1, 0, 0]));
        res.push(face([[b.x1, y0, b.zf], [b.x1, y0, b.zb], [b.x1, y1, b.zb], [b.x1, y1, b.zf]], C.nWall, { ...o, kind: 'nwall' }, [1, 0, 0]));
      }
      let R;
      if (b.attached) {
        const extL = !(site.nb.find((q) => q.attached && q.side === 'L' && q.cut)); const extR = !(site.nb.find((q) => q.attached && q.side === 'R' && q.cut));
        R = blockRoof({ bx0: site.bx0, bx1: site.bx1, z0: b.zb, z1: b.zf, eaves, H: b.pitch, type: b.roof, axis: 'x', extL: T.partyL ? extL : true, extR: T.partyR ? extR : true, seg: [b.x0, b.x1] });
      } else {
        R = blockRoof({ bx0: b.x0, bx1: b.x1, z0: b.zb, z1: b.zf, eaves, H: b.pitch, type: b.roof, axis: 'x', extL: true, extR: true, seg: [b.x0, b.x1] });
      }
      for (const f of R.faces) res.push(Object.assign(f, { color: C.nRoof, kind: 'nroof', ...o }));
      for (const [x, out, isEnd] of [[b.x0, [-1, 0, 0], b.x0 <= site.bx0 + 1e-6 || !b.attached], [b.x1, [1, 0, 0], b.x1 >= site.bx1 - 1e-6 || !b.attached]]) {
        if (b.roof === 'hip' && isEnd && !b.cut) continue;
        const ap = R.apexAt(x);
        if (ap > eaves + 0.05) res.push(face([[x, eaves, b.zb], [x, eaves, b.zf], [x, ap, R.zm]], C.nWall, { ...o, kind: 'nwall' }, out));
      }
      if (solid && alpha === 1) {
        const fc = facet([b.x0, 0, b.zf], [b.x1, 0, b.zf], [0, 0, 1]);
        for (let s = 0; s < b.storeys; s++) {
          for (let j = 0; j < kk; j++) {
            const c = (w / kk) * (j + 0.5);
            if (s === 0 && j === (b.side === 'L' ? kk - 1 : 0)) res.push(rectOn(fc, c - 0.45, 0.9, 0, 2.05, 0.02, C.nWin, { nb: true, kind: 'nwin', bias: 0.08 }));
            else res.push(rectOn(fc, c - 0.55, 1.1, s * SH + 0.85, 1.25, 0.02, C.nWin, { nb: true, kind: 'nwin', bias: 0.08 }));
          }
        }
      }
    }
    return res;
  }

  function groundFaces(M) {
    const { T, X, site, zf, zb, cols, doorCol, x0 } = M;
    const E = 16; const S = OS.r3d.shapes; const res = [];
    const g = (f, bias, color) => Object.assign(f, { bias, color, edge: false, noShadow: true, ground: true });
    res.push(g(S.flat(-E, 0, site.zRear, 2 * E, site.zPF - site.zRear, C.lawn)[0], -400, C.lawn));
    res[0].alpha = 0.9;
    res.push(g(S.flat(-E, 0.004, site.zPF, 2 * E, 1.8, C.pave)[0], -390, C.pave));
    res.push(g(S.flat(-E, 0, site.zPF + 1.8, 2 * E, 6.2, C.road)[0], -395, C.road));
    for (let x = -E + 1; x < E - 1; x += 4) res.push(g(S.flat(x, 0.006, site.zPF + 4.84, 1.8, 0.12, C.line)[0], -380, C.line));
    const dx = x0 + cols[doorCol];
    const pathFrom = T.porch === 'closed' && X.proj && X.porchKnown ? zf + 1.3 : zf;
    res.push(g(S.flat(dx - 0.55, 0.008, pathFrom, 1.1, site.zPF - pathFrom, C.path)[0], -370, C.path));
    const freeSide = !T.partyR ? 'R' : !T.partyL ? 'L' : null;
    const gap = freeSide === 'R' ? site.gapR : site.gapL;
    if (freeSide && gap >= 2.5) {
      const dx0 = freeSide === 'R' ? M.x1 + 0.3 : M.x0 - 0.3 - Math.min(2.6, gap - 0.6);
      res.push(g(S.flat(dx0, 0.007, zf - 3.5, Math.min(2.6, gap - 0.6), site.zPF - zf + 3.5, C.drive)[0], -372, C.drive));
    }
    // boundaries: a low front wall (or the hedge luna saw), fences down the garden
    const wallHex = X.wall[1];
    const gateL = dx - 0.7; const gateR = dx + 0.7;
    const front = [[site.px0, gateL], [gateR, site.px1]];
    if (freeSide && gap >= 2.5) {
      const d0 = freeSide === 'R' ? M.x1 + 0.3 : M.x0 - 0.3 - Math.min(2.6, gap - 0.6); const d1 = d0 + Math.min(2.6, gap - 0.6);
      front.splice(0, front.length, ...front.flatMap(([a, b]) => (d1 <= a || d0 >= b ? [[a, b]] : [[a, d0], [d1, b]])).filter(([a, b]) => b - a > 0.2));
    }
    for (const [a, b] of front) {
      if (b - a < 0.2) continue;
      if (X.hedge) res.push(...bx(a + 0.05, b - 0.05, 0, 1.05, site.zPF - 0.75, site.zPF - 0.1, C.hedge, { kind: 'hedge' }));
      else res.push(...bx(a, b, 0, 0.55, site.zPF - 0.24, site.zPF, wallHex, { kind: 'fwall', skip: ['bottom'] }));
    }
    const F0 = { kind: 'fence', skip: ['bottom'] };
    res.push(...bx(site.px0 - 0.03, site.px0 + 0.03, 0, 1.6, site.zRear, zb, C.fence, F0));
    res.push(...bx(site.px1 - 0.03, site.px1 + 0.03, 0, 1.6, site.zRear, zb, C.fence, F0));
    res.push(...bx(site.px0, site.px1, 0, 1.6, site.zRear - 0.03, site.zRear + 0.03, C.fence, F0));
    return res;
  }

  // ---------- the scene for any point in the run: which stages are done decides what is drawn ----------
  function buildScene(comp, done, opt = {}) {
    const { T, X, M } = comp;
    const has = (k) => done.has(k);
    const th = OS.theme.colors();
    const F = []; const L = []; const B = [];
    const final = has('composed_model');
    const mat = has('wall_materials');
    const sc = (q) => txPoint(M, q, { scaled: true });
    const tag = (arr, grp) => { for (const f of arr) f.grp = f.grp || grp; return arr; };
    // site context
    if (has('site_context')) {
      F.push(...tag(neighbourFaces(M, final), final ? 'composed_model' : 'site_context'));
      if (!final) {
        const S = OS.r3d.shapes; const st = M.site;
        const strip = (x, z, w, d) => Object.assign(S.flat(x, 0.01, z, w, d, th.accent)[0], { bias: -360, edge: false, noShadow: true, ground: true, alpha: 0.9, grp: 'site_context' });
        F.push(strip(st.px0 - 0.04, st.zRear, 0.08, st.zPF - st.zRear), strip(st.px1 - 0.04, st.zRear, 0.08, st.zPF - st.zRear), strip(st.px0, st.zRear - 0.04, st.px1 - st.px0, 0.08), strip(st.px0, st.zPF - 0.04, st.px1 - st.px0, 0.08));
        B.push({ pos: [st.px1, 0.2, st.zRear + 1], text: `S1 plot ${f1(st.px1 - st.px0)} × ${f1(st.zPF - st.zRear)} m`, color: th.accent });
      }
    }
    if (final) F.push(...tag(groundFaces(M), 'composed_model'));
    // P4: which way is the street
    if (has('orient_plan') && !final) {
      const S = OS.r3d.shapes; const z0 = M.zf + 1.2; const col = X.mirror ? th.warn : th.accent2;
      const shaft = Object.assign(S.flat(M.xc - 0.18, 0.012, z0, 0.36, 2.2, col)[0], { bias: -350, edge: false, noShadow: true, ground: true, grp: 'orient_plan' });
      const head = face([[M.xc - 0.7, 0.012, z0 + 2.2], [M.xc + 0.7, 0.012, z0 + 2.2], [M.xc, 0.012, z0 + 3.3]], col, { bias: -350, edge: false, noShadow: true, ground: true, grp: 'orient_plan' }, [0, 1, 0]);
      F.push(shaft, head);
      B.push({ pos: [M.xc, 0.3, z0 + 3.9], text: X.mirror ? 'P4 street · read mirrored' : 'P4 street', color: col });
    }
    // F1: the house box from the photos
    if (has('house_box') && !has('massing')) {
      const b = X.box; const bx0 = M.xc - b.bw / 2; const bz1 = M.zf; const bz0 = bz1 - b.bd;
      F.push(...tag(bx(bx0, bx0 + b.bw, 0, b.bh, bz0, bz1, th.accent, { alpha: 0.1, edge: th.accent, noShadow: true, kind: 'hbox' }), 'house_box'));
      B.push({ pos: [bx0 + b.bw, b.bh + 0.3, bz1], text: `F1 ${f1(b.bw)} × ${f1(b.bd)} × ${f1(b.bh)} m`, color: th.accent });
      if (has('describe_house')) B.push({ pos: [M.xc, b.bh + 1.2, M.zc], text: `F2 ${TYPE_WORD[T.type]} · ${roofWord(T)}`, color: th.fg });
    }
    // P2..P8: floor volumes, refined stage by stage
    if (has('floor_boxes') && !has('massing')) {
      const glued = comp.out.floor_boxes.ok === false;
      const showWing = has('floor_outlines') ? !!M.wing : glued && !!M.wingPlan;
      const nV = has('align_floors') && comp.out.align_floors.ok === false ? 1 : T.nFloors;
      const sh = has('floor_cells') ? X.shift : 0;
      const scaleOn = has('plan_sheet');
      const vol = [];
      for (let s = 0; s < nV; s++) {
        const dx = s > 0 ? sh : 0; const roofFloor = T.roomInRoof && s === T.storeys;
        const top = roofFloor ? s * SH + SH * 0.8 : (s + 1) * SH;
        vol.push(...bx(M.x0 + dx + (roofFloor ? 0.8 : 0), M.x1 + dx - (roofFloor ? 0.8 : 0), s * SH + 0.03, top - 0.03, M.zb + (roofFloor ? 1 : 0), M.zf - (roofFloor ? 1 : 0), th.accent2, { alpha: 0.2, edge: th.accent2, noShadow: true, kind: 'vol' }));
        const lp = [M.x0 + dx - 0.9, s * SH + 1.35, M.zf + 0.4];
        B.push({ pos: scaleOn ? sc(lp) : lp, text: String(s), color: th.accent2 });
      }
      if (showWing) {
        const wg = M.wingPlan.rect;
        vol.push(...bx(wg[0], wg[1], 0.03, SH - 0.03, wg[2], wg[3], th.accent2, { alpha: 0.2, edge: th.accent2, noShadow: true, kind: 'vol' }));
      }
      if (T.rear) {
        const ex0 = M.x0 + (T.partyL ? 0.3 : 0.5);
        vol.push(...bx(ex0, ex0 + T.rear.w, 0.03, SH - 0.03, M.zb - T.rear.d, M.zb, th.accent2, { alpha: 0.2, edge: th.accent2, noShadow: true, kind: 'vol' }));
      }
      if (scaleOn && X.scale !== 1) { const st = scaleTx(M); for (const f of vol) f.pts = f.pts.map(st); }
      F.push(...tag(vol, 'floor_boxes'));
      if (has('floor_outlines')) {
        for (let s = 0; s < nV; s++) {
          const dx = s > 0 ? sh : 0; const y = s * SH + 0.04;
          const ring = [[M.x0 + dx, y, M.zb], [M.x1 + dx, y, M.zb], [M.x1 + dx, y, M.zf], [M.x0 + dx, y, M.zf]];
          for (let i = 0; i < 4; i++) L.push({ a: scaleOn ? sc(ring[i]) : ring[i], b: scaleOn ? sc(ring[(i + 1) % 4]) : ring[(i + 1) % 4], color: th.accent, width: 1.5 });
        }
      }
    }
    if (has('gable_ends') && !has('roofer') && T.roof === 'gable') {
      const ys = (has('align_floors') ? X.n : T.storeys) * SH; const yr = ys + T.pitch;
      const ends = T.axis === 'z' ? [] : [[M.x0, !T.partyL], [M.x1, !T.partyR]];
      for (const [x, ext] of ends) {
        if (!ext) continue;
        const pts = [[x, ys, M.zb], [x, yr, M.zc], [x, ys, M.zf]].map((p) => (has('plan_sheet') ? sc(p) : p));
        L.push({ a: pts[0], b: pts[1], color: th.warn, width: 2 }, { a: pts[1], b: pts[2], color: th.warn, width: 2, dash: T.gableGap ? [6, 5] : undefined });
      }
    }
    if (has('read_rooms') && !has('projections')) {
      const rooms = X.rooms; const step = (M.D) / rooms.length;
      rooms.forEach((rm, i) => B.push({ pos: [M.x0 + M.W * 0.7, 0.4, M.zf - step * (i + 0.5)], text: rm, color: th.muted }));
    }
    if (has('plan_scale') && !final) {
      const z = M.site.zPF - 0.8; const x = M.site.px0 + 0.4;
      L.push({ a: [x, 0.05, z], b: [x + 1, 0.05, z], color: th.info, width: 3 });
      B.push({ pos: [x + 0.5, 0.5, z], text: `P7 1 m = ${Math.round(100 / X.cm)} px`, color: th.info });
    }
    if (has('plan_sheet') && !has('massing')) {
      const pad = 1.2; const S = OS.r3d.shapes;
      let tile = S.flat(M.x0 - pad, 0.015, M.zb - pad - (T.rear ? T.rear.d : 0), M.W + 2 * pad, M.D + 2 * pad + (T.rear ? T.rear.d : 0), '#f3f0e6')[0];
      tile = Object.assign(tile, { alpha: 0.55, edge: th.info, noShadow: true, bias: -340, ground: true, grp: 'plan_sheet' });
      if (X.scale !== 1) tile.pts = tile.pts.map(scaleTx(M));
      F.push(tile);
    }
    if (has('projections') && !has('massing')) {
      const pr = [];
      if (T.bay) { const c = M.x0 + M.cols[T.bay.side === 'left' ? 0 : M.k - 1]; pr.push(...bx(c - 1, c + 1, 0.03, (T.bay.storeys === 2 ? 2 : 1) * SH - 0.4, M.zf, M.zf + 0.6, th.info, { alpha: 0.28, edge: th.info, noShadow: true })); }
      if (T.porch) { const c = M.x0 + M.cols[M.doorCol]; pr.push(...bx(c - 0.95, c + 0.95, 0.03, 2.5, M.zf, M.zf + (T.porch === 'closed' ? 1.3 : 0.9), th.info, { alpha: 0.28, edge: th.info, noShadow: true })); }
      if (X.scale !== 1) for (const f of pr) f.pts = f.pts.map(scaleTx(M));
      F.push(...tag(pr, 'projections'));
    }
    if (has('floor_cells') && !has('massing')) {
      for (let x = M.x0; x <= M.x1 + 1e-6; x += 0.5) {
        const a = sc([x, 0.02, M.zf + 0.05]); const b = sc([x, 0.02, M.zf + 0.35]);
        L.push({ a, b, color: th.muted, width: 1 });
      }
    }
    if (has('floor_diff') && !has('massing') && T.storeys > 1) B.push({ pos: sc([M.x1 + 0.8, SH + 1.4, M.zf]), text: 'P12 floor 1 = floor 0 − projections', color: th.muted });
    // the house itself
    let parts = null;
    if (has('detect_features') || has('massing')) parts = houseParts(M);
    if (parts && has('detect_features') && !has('mark_features')) {
      const scf = (q) => txPoint(M, q, { feat: true, scaled: true });
      for (const r of parts.rects) {
        const p = (u, v) => scf([r.fc.P[0] + r.fc.d[0] * u + r.fc.n[0] * 0.05, v, r.fc.P[2] + r.fc.d[2] * u + r.fc.n[2] * 0.05]);
        const q = [p(r.a, r.y), p(r.a + r.w, r.y), p(r.a + r.w, r.y + r.hh), p(r.a, r.y + r.hh)];
        for (let i = 0; i < 4; i++) L.push({ a: q[i], b: q[(i + 1) % 4], color: th.warn, width: 1.5 });
      }
    }
    if (parts && has('mark_features') && !has('massing')) F.push(...tag(applyTx(parts.marks, M, true), 'mark_features'));
    if (parts && has('massing')) {
      F.push(...tag(applyTx(parts.walls, M, true), 'massing'));
      F.push(...tag(applyTx(parts.proj, M, true), 'massing'));
      if (!has('decorate')) F.push(...tag(applyTx(parts.open, M, true), 'massing'));
      if (has('roofer')) {
        F.push(...tag(applyTx(parts.roof, M, true), 'roofer'));
        F.push(...tag(applyTx(parts.ends, M, true), 'roofer'));
        if (!final) {
          for (const [a, b] of parts.lines.ridge) L.push({ a: sc(a), b: sc(b), color: th.accent, width: 2.5 });
          for (const [a, b] of parts.lines.hip) L.push({ a: sc(a), b: sc(b), color: th.accent2, width: 2 });
          for (const [a, b] of parts.lines.valley) L.push({ a: sc(a), b: sc(b), color: th.info, width: 2 });
        }
      } else if (M.dormers.length) {
        F.push(...tag(applyTx(parts.ends.filter((f) => f.kind === 'dormer'), M, true), 'massing'));
      }
      if (has('decorate')) F.push(...tag(applyTx(parts.deco, M, true), 'decorate'));
    }
    for (const f of F) {
      if (f.mat === 'wall') f.color = mat ? X.wall[1] : C.mass;
      else if (f.mat === 'roof') f.color = mat ? T.roofMat[1] : C.roofMass;
      if (f.n && f.n[0] < -0.6 && Math.abs(f.n[1]) < 0.5 && /^#[0-9a-f]{6}$/i.test(f.color || '')) f.color = OS.theme.mix(f.color, '#000000', 0.13);
    }
    // benchmark marks: a label at each visible defect
    if (opt.marks && final && opt.defects && opt.defects.length) {
      const anchors = defectAnchors(comp);
      const top = (M.ridgeY + 1.1) * X.scale;
      let i = 0;
      for (const d of opt.defects) {
        const at = anchors[d.key]; if (!at) continue;
        const lift = [at[0], top + 0.4 + i * 1.0, at[2]];
        L.push({ a: at, b: [lift[0], lift[1] - 0.25, lift[2]], color: th.bad, width: 1.5, dash: [4, 3] });
        B.push({ pos: lift, text: `✗ ${d.text}`, color: th.bad, bg: th.surface });
        i += 1;
      }
    }
    if (opt.heightmap) return heightmapScene(F, th);
    return { faces: F, lines: L, labels: B };
  }

  function defectAnchors(comp) {
    const { M, T, X } = comp; const a = {};
    const P = (q, feat = false) => txPoint(M, q, { feat, scaled: true });
    const doorX = M.x0 + M.cols[M.doorCol];
    a.tag_images = P([doorX, 1.6, M.zf + 0.2], true);
    a.describe_house = P([doorX, 2.6, M.zf + 0.4], true);
    if (T.bay) a.orient_plan = P([M.x0 + M.cols[T.bay.side === 'left' ? 0 : M.k - 1], 1.6, M.zf + 0.6], true);
    else a.orient_plan = P([doorX, 2.2, M.zf], true);
    if (M.wingBox) a.floor_outlines = P([M.wingBox.x, M.wingBox.y, M.wingBox.z]);
    a.plan_sheet = P([M.xc, M.ridgeY, M.zc]);
    a.align_floors = P([M.x1, M.eaves, M.zf]);
    a.floor_cells = P([M.x1 + X.shift, SH * 1.5, M.zf]);
    const w = X.winFloat ? M.front.wins[0] : null;
    a.mark_features = w ? P([M.x0 + w.a + w.w / 2, w.y + w.hh, M.zf + 0.3], true) : P([doorX, 2.2, M.zf + 0.3], true);
    a.massing = P([doorX, 2.0, M.zf + 0.1], true);
    a.roofer = P([M.x1 - 0.5, M.ridgeY, M.zc]);
    a.wall_materials = P([M.x0 + 0.5, SH * 0.6, M.zf]);
    return a;
  }

  function heightmapScene(F, th) {
    const roofs = F.filter((f) => f.kind === 'roof' && f.hb);
    const res = [];
    if (!roofs.length) return { faces: [], lines: [], labels: [], empty: true };
    let lo = Infinity; let hi = -Infinity;
    const main = roofs.some((f) => f.mainRoof) ? roofs.filter((f) => f.mainRoof) : roofs;
    for (const f of main) for (const p of f.pts) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
    const bands = 12; const span = Math.max(0.01, hi - lo);
    for (const f of roofs) {
      for (let i = 0; i < bands; i++) {
        const a = lo + (span * i) / bands; const b = lo + (span * (i + 1)) / bands;
        const piece = slab(f, 1, a - (i === 0 ? 99 : 0), b + (i === bands - 1 ? 99 : 0));
        if (!piece) continue;
        const v = Math.round(((i + 0.5) / bands) * 255);
        const hex = '#' + [v, v, v].map((c) => c.toString(16).padStart(2, '0')).join('');
        res.push({ ...piece, color: hex, emissive: true, edge: false, alpha: 1, bias: 0, noShadow: true, panel: false });
      }
    }
    // the eaves outline, so black still has an edge on any background
    const lines = [];
    for (const f of roofs.filter((q) => q.mainRoof)) {
      for (let i = 0; i < f.pts.length; i++) {
        const a = f.pts[i]; const b = f.pts[(i + 1) % f.pts.length];
        if (Math.abs(a[1] - lo) < 0.05 && Math.abs(b[1] - lo) < 0.05) lines.push({ a, b, color: th.accent, width: 1.5 });
      }
    }
    return { faces: res, lines, labels: [], lo, hi };
  }

  // ---------- benchmark ----------
  function benchmark(run, main, keys = KEYS) {
    const rows = keys.map((k) => ({ key: k, code: BY[k].code, ap: run.A[k], run: run.out[k].ok, main: main.out[k].ok, changed: run.A[k] !== MAIN[k], defect: run.out[k].defect, mark: run.out[k].mark }));
    const regress = rows.filter((r) => r.main === true && r.run === false);
    const improve = rows.filter((r) => r.main === false && r.run === true);
    const pass = rows.filter((r) => r.run === true).length;
    const fail = rows.filter((r) => r.run === false).length;
    const none = rows.filter((r) => r.run === null).length;
    const headline = regress.length ? `✗ worse than main (${plural(regress.length, 'regression')})` : '✓ not worse than main';
    return { rows, regress, improve, pass, fail, none, headline, ok: !regress.length, score: run.score, mainScore: main.score, isolated: keys.length < KEYS.length };
  }
  // An isolated run stops before M4, so it has no composed-model score to record.
  const scoreFields = (b) => (b.isolated ? { score: null } : { score: b.score, mainScore: b.mainScore });

  // ---------- the note: one hypothesis, a $10.00 cap, a write-up at the end ----------
  const HYP = [
    'luna_storeycount_3 reads floors better than luna_storeycount_1',
    'A rear pass in tag_images finds the front more often',
    'tagged_front_1 colours are closer to the photos than palette_front_1',
    'chalet_roof_1 helps houses with a storey in the roof',
    'front_snap_3 snaps the last floating windows',
    'The kit and the question list limit the score, not the reading',
    'A different prompt for detect_features finds more doors',
    'door_fit_projections_1 is not worse than roof_dormers_1 on terraces',
  ];
  const hypOf = (n) => HYP[(((n - 12) % HYP.length) + HYP.length) % HYP.length];
  const NOTE_DIR = `${OS.fs.home}/labs/tmp/composer_benchmark/notes`;
  const Note = {
    get() {
      const v = OS.store.get('composer.note', null);
      if (v && typeof v.n === 'number' && Array.isArray(v.runs)) return v;
      return {
        n: 12, spent: 4.2, hyp: hypOf(12), runs: [
          { house: '152', what: 'floor_boxes: luna_storeycount_3', headline: '✓ not worse than main', regress: 0, improve: 1, score: 5, mainScore: 5, usd: 2.06, by: 'a lane, unattended' },
          { house: '158', what: 'floor_boxes: luna_storeycount_3', headline: '✓ not worse than main', regress: 0, improve: 1, score: 5, mainScore: 5, usd: 2.14, by: 'a lane, unattended' },
        ],
      };
    },
    save(v) { OS.store.set('composer.note', v); OS.emit('composer:note', v); },
    charge(usd) { const v = this.get(); v.spent = r2(v.spent + usd); this.save(v); },
    addRun(run, n) { const v = this.get(); if (n !== undefined && v.n !== n) return false; v.runs.push(run); this.save(v); return true; },
    capSentence(v, est) {
      return `H-${v.n} has spent ${OS.usd(v.spent)} of its ${OS.usd(CAP)} cap (next run ≈ ${OS.usd(est)}). Stop this experiment: write it up with composer_benchmark:conclude (it creates the follow-on notes), then start the next experiment on one of them.`;
    },
    conclude() {
      const v = this.get();
      if (!v.runs.length) return { ok: false, message: `H-${v.n} has no runs to write up. Run something first. It costs money.` };
      const regress = v.runs.filter((r) => r.regress > 0);
      const scored = v.runs.filter((r) => typeof r.score === 'number' && typeof r.mainScore === 'number');
      const better = scored.filter((r) => r.improve > 0 && r.score > r.mainScore + 0.05 && !r.regress);
      const finding = regress.length ? 'negative' : better.length ? 'positive' : 'inconclusive';
      const last = scored[scored.length - 1];
      const text = finding === 'negative'
        ? `Worse than main on ${plural(regress.length, 'run')}. Main stays as it is.`
        : finding === 'positive'
          ? `Not worse than main, and the composed model scored ${f1(better[0].score)}/10 against main's ${f1(better[0].mainScore)}/10. A tenth of a point. Repeat it on a larger dev set before believing it.`
          : last
            ? `Not worse than main. The composed model scored ${f1(last.score)}/10, as main does. So the kit and the question list limit the result, not the reading.`
            : 'Not worse than main on the stages that ran. Every run was isolated, so M4 never composed a model and nothing was scored against the photos.';
      const next = { n: v.n + 1, spent: 0, hyp: hypOf(v.n + 1), runs: [] };
      const follow = [`H-${v.n + 1}: ${hypOf(v.n + 1)}`, `H-${v.n + 2}: ${hypOf(v.n + 2)} (queued)`];
      const md = [
        `# H-${v.n}: ${v.hyp}`, '', `Status: concluded · ${finding}`, `Spent: ${OS.usd(v.spent)} of ${OS.usd(CAP)} over ${plural(v.runs.length, 'run')}`, '',
        '## Finding', '', text, '', '## Runs', '', ...v.runs.map((r) => `- house ${r.house} · ${r.what} · ${r.headline} · ${OS.usd(r.usd)}${r.by ? ` · ${r.by}` : ''}`), '',
        '## Follow-on notes', '', ...follow.map((f) => `- ${f}`), '',
      ].join('\n');
      let path = `${NOTE_DIR}/H-${v.n}.md`;
      try { OS.fs.mkdir(NOTE_DIR, { parents: true }); OS.fs.write(path, md); } catch { path = null; }
      this.save(next);
      return { ok: true, from: v, to: next, finding, text, follow, path };
    },
  };
  function preflight(comp, keys) {
    const est = r2(keys.reduce((s, k) => s + comp.out[k].usd, 0));
    const v = Note.get();
    if (est > 0 && v.spent + est > CAP + 1e-9) return { ok: false, kind: 'note', est, message: Note.capSentence(v, est) };
    if (!OS.spend.can(est)) return { ok: false, kind: 'day', est, message: `Today's experiment spend is ${OS.usd(OS.spend.today())} of the ${OS.usd(OS.spend.cap)} daily cap (UTC). Conclude your current experiment and stop until tomorrow.` };
    return { ok: true, est };
  }

  // ---------- the runner, shared by the window and the terminal ----------
  async function execute(comp, keys, io) {
    let usd = 0; const ran = [];
    const est = r2(keys.reduce((s, k) => s + comp.out[k].usd, 0));
    for (const k of keys) {
      const o = comp.out[k];
      const ms = Math.max(140, o.secs * 260);
      io.start?.(k, o, ms);
      let t = 0;
      while (t < ms) {
        const step = Math.min(io.step || ms, ms - t);
        await io.sleep(step);
        t += step;
        if (io.aborted()) return { aborted: true, at: k, ran, usd };
        io.tick?.(k, t / ms, o);
      }
      if (o.usd > 0) {
        const v = Note.get();
        if (v.spent + o.usd > CAP + 1e-9) return { refused: true, kind: 'note', message: Note.capSentence(v, est), at: k, ran, usd };
        const r = OS.spend.add(o.usd, `${k} ${apText(comp.A[k])}, house ${comp.T.label}`, 'composer');
        if (!r.ok) return { refused: true, kind: 'day', message: r.message, at: k, ran, usd };
        Note.charge(o.usd); usd = r2(usd + o.usd);
      }
      ran.push(k);
      io.done?.(k, o);
    }
    return { ok: true, ran, usd };
  }
  const logHead = (comp, k) => `[${BY[k].code} ${k} · ${apText(comp.A[k])}]`;
  const logLine = (comp, k) => {
    const o = comp.out[k];
    const how = BY[k].llm ? `${plural(o.calls, 'model call')} · ${f1(o.secs)} s · ${OS.usd(o.usd)}` : `geometry · ${f1(o.secs)} s · $0.00`;
    return `${logHead(comp, k)} ${how} → ${o.sum}`;
  };
  const sysLog = (line) => { try { const p = '/var/log/composer.log'; const prev = OS.fs.exists(p) ? OS.fs.read(p) : ''; OS.fs.write(p, (prev + line + '\n').slice(-20000), { persist: false }); } catch { /* the log is a courtesy */ } };

  // ---------- layout of the pipeline graph: columns from needs, rows chosen to keep edges short ----------
  const COL = {};
  for (const s of STAGES) COL[s.key] = s.needs.length ? 1 + Math.max(...s.needs.map((n) => COL[n])) : 0;
  const NCOL = 1 + Math.max(...Object.values(COL));
  const BYCOL = Array.from({ length: NCOL }, () => []);
  for (const s of STAGES) BYCOL[COL[s.key]].push(s.key);
  const NROW = Math.max(...BYCOL.map((c) => c.length));
  const EDGES = STAGES.flatMap((s) => s.needs.map((n) => [n, s.key]));
  function dependants(key) {
    const out = new Set(); const todo = [key];
    while (todo.length) { const u = todo.pop(); for (const [a, b] of EDGES) if (a === u && !out.has(b)) { out.add(b); todo.push(b); } }
    return out;
  }
  const ROW = (() => {
    const row = {};
    BYCOL.forEach((keys) => keys.forEach((k, i) => { row[k] = i; }));
    const occupied = (c, r) => BYCOL[c].some((k) => row[k] === r);
    const cost = () => {
      let t = 0;
      for (const [u, v] of EDGES) {
        const cu = COL[u]; const cv = COL[v];
        t += Math.abs(row[u] - row[v]) * 1.2;
        for (let c = cu + 1; c < cv; c++) {
          const rr = row[u] + ((row[v] - row[u]) * (c - cu)) / (cv - cu);
          if (Math.abs(rr - Math.round(rr)) < 0.3 && occupied(c, Math.round(rr))) t += 2.5;
        }
      }
      for (const keys of BYCOL) if (keys.length === 1) t += Math.abs(row[keys[0]] - 1) * 0.2;
      return t;
    };
    const perms = (arr, k) => (k === 0 ? [[]] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)], k - 1).map((p) => [x, ...p])));
    const rowsAll = Array.from({ length: NROW }, (_, i) => i);
    for (let sweep = 0; sweep < 8; sweep++) {
      for (const keys of BYCOL) {
        let best = null; let bestCost = Infinity;
        for (const p of perms(rowsAll, keys.length)) {
          keys.forEach((k, i) => { row[k] = p[i]; });
          const c = cost();
          if (c < bestCost - 1e-9) { bestCost = c; best = p; }
        }
        keys.forEach((k, i) => { row[k] = best[i]; });
      }
    }
    return row;
  })();

  // ---------- the window ----------
  const CSS = `
.composer { position:absolute; inset:0; display:grid; grid-template-columns:minmax(0,1fr) 304px; grid-template-rows:auto auto minmax(0,1fr) 128px;
  grid-template-areas:"top top" "graph graph" "view side" "log side"; gap:6px; padding:6px; background:var(--surface); font-size:12px; overflow:hidden; }
.composer button { font-family:inherit; }
.composer-top { grid-area:top; display:flex; align-items:center; gap:6px; min-width:0; }
.composer-top .ui-btn { min-height:24px; padding:2px 9px; font-size:12px; }
.composer-house { width:200px; min-height:24px; padding:2px 8px; font-size:12px; }
.composer-seg { display:inline-flex; }
.composer-seg .ui-btn { border-radius:0; } .composer-seg .ui-btn + .ui-btn { margin-left:-1px; }
.composer-seg .ui-btn:first-child { border-radius:6px 0 0 6px; } .composer-seg .ui-btn:last-child { border-radius:0 6px 6px 0; }
.composer-sp { flex:1 1 auto; min-width:4px; }
.composer-top .composer-run { min-width:76px; justify-content:center; }
.composer-top .composer-run.stop { background:var(--bad); border-color:var(--bad); color:var(--on-accent); }
.composer-changed { color:var(--accent2); }
.composer-graph { grid-area:graph; position:relative; border:1px solid var(--border); border-radius:8px; background-color:var(--bg);
  background-image:radial-gradient(color-mix(in srgb, var(--faint) 38%, transparent) 1px, transparent 1.3px); background-size:12px 12px; overflow:hidden; }
.composer-ghd { position:absolute; left:10px; right:10px; top:5px; height:14px; display:flex; gap:14px; align-items:center; font-size:10px; color:var(--muted); white-space:nowrap; overflow:hidden; }
.composer-ghd b { color:var(--fg); letter-spacing:.1em; font-size:10px; }
.composer-key { display:inline-flex; align-items:center; gap:5px; }
.composer-key i { width:8px; height:8px; border-radius:2px; display:inline-block; }
.composer-gprog { margin-left:auto; color:var(--fg); }
.composer-edges { position:absolute; left:0; top:0; pointer-events:none; overflow:visible; }
.composer-edge { fill:none; stroke:color-mix(in srgb, var(--muted) 40%, transparent); stroke-width:1.2; transition:stroke .2s; }
.composer-edge.done { stroke:color-mix(in srgb, var(--good) 50%, transparent); }
.composer-edge.stored { stroke:color-mix(in srgb, var(--info) 38%, transparent); }
.composer-edge.stale { stroke:color-mix(in srgb, var(--warn) 50%, transparent); stroke-dasharray:2 3; }
.composer-edge.live { stroke:var(--accent); stroke-width:2; stroke-dasharray:5 4; animation:composer-dash .5s linear infinite; }
.composer-edge.hot { stroke:var(--accent2); stroke-width:2; }
@keyframes composer-dash { to { stroke-dashoffset:-9; } }
@keyframes composer-pulse { 50% { opacity:.35; } }
.composer-node { position:absolute; display:flex; flex-direction:column; gap:2px; padding:4px 6px 5px 9px; border:1px solid var(--border); border-radius:6px;
  background:var(--surface); box-shadow:0 3px 10px rgba(0,0,0,.16); cursor:pointer; transition:border-color .15s, box-shadow .15s, opacity .2s; user-select:none; }
.composer-node:hover { border-color:color-mix(in srgb, var(--accent) 60%, var(--border)); }
.composer-node::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; border-radius:6px 0 0 6px; background:var(--faint); }
.composer-node.st-stored::before { background:var(--info); }
.composer-node.st-done::before { background:var(--good); }
.composer-node.st-queued { opacity:.62; }
.composer-node.st-stale { opacity:.62; } .composer-node.st-stale::before { background:var(--warn); }
.composer-node.st-cancel { opacity:.5; }
.composer-node.st-refused::before { background:var(--bad); }
.composer-node.st-running { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent), 0 0 22px color-mix(in srgb, var(--accent) 40%, transparent); z-index:3; }
.composer-node.st-running::before { background:var(--accent); animation:composer-pulse .7s ease-in-out infinite; }
.composer-node.sel { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent); z-index:2; }
.composer-node.regress { border-color:var(--bad); box-shadow:0 0 0 2px color-mix(in srgb, var(--bad) 28%, transparent); }
.composer-nh { display:flex; align-items:baseline; gap:5px; height:13px; line-height:13px; white-space:nowrap; overflow:hidden; }
.composer-code { font-size:10.5px; font-weight:800; letter-spacing:.02em; }
.composer-node.llm .composer-code { color:var(--accent2); } .composer-node.geo .composer-code { color:var(--info); }
.composer-nt { font-size:9.5px; color:var(--muted); margin-left:auto; }
.composer-nc { font-size:9.5px; color:var(--faint); }
.composer-node.llm .composer-nc.paid { color:var(--warn); }
.composer-nl { flex:1 1 auto; display:flex; align-items:center; font-size:10.5px; line-height:12px; font-weight:700; color:var(--fg); min-height:24px; overflow:hidden; hyphens:manual; -webkit-hyphens:manual; }
.composer-na { display:flex; align-items:center; gap:3px; height:16px; padding:0 4px; margin:0; border:1px solid var(--border); border-radius:4px; background:var(--bg); color:var(--muted); font-size:9.5px; cursor:pointer; min-width:0; width:100%; text-align:left; }
.composer-na:hover:not([disabled]) { border-color:var(--accent); color:var(--fg); }
.composer-na[disabled] { cursor:default; }
.composer-nav { flex:1 1 auto; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; direction:rtl; text-align:left; }
.composer-na i { font-style:normal; color:var(--faint); font-size:8px; flex:none; }
.composer-node.changed .composer-na { border-color:color-mix(in srgb, var(--accent2) 65%, transparent); color:var(--accent2); }
.composer-np { position:absolute; left:3px; right:0; bottom:0; height:2px; overflow:hidden; border-radius:0 0 6px 0; }
.composer-np i { display:block; height:100%; width:0; background:linear-gradient(90deg, var(--accent), var(--accent2)); }
.composer-nb { position:absolute; right:-6px; top:-7px; width:16px; height:16px; border-radius:50%; display:none; align-items:center; justify-content:center; font-size:9.5px; font-weight:800; background:var(--surface); border:1.5px solid var(--border); line-height:1; }
.composer-nb.ok { display:flex; color:var(--good); border-color:var(--good); }
.composer-nb.bad { display:flex; color:var(--on-accent); background:var(--bad); border-color:var(--bad); }
.composer-nb.none { display:flex; color:var(--faint); }
.composer-chev { display:none; margin-left:auto; border:0; background:none; color:var(--faint); font-size:9px; padding:0 1px; cursor:pointer; line-height:13px; }
.composer-chev:hover:not([disabled]) { color:var(--accent); }
.composer-node.changed .composer-chev { color:var(--accent2); }
.composer-nf { display:none; justify-content:space-between; gap:3px; font-size:8.5px; color:var(--muted); line-height:10px; white-space:nowrap; overflow:hidden; }
.composer-nf .paid { color:var(--warn); }
.composer-graph.compact .composer-node, .composer-graph.mini .composer-node { padding:3px 3px 3px 6px; gap:1px; }
.composer-graph.compact .composer-nl { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; font-size:8.5px; line-height:10px; min-height:20px; max-height:20px; letter-spacing:-.01em; }
.composer-graph.compact .composer-code, .composer-graph.mini .composer-code { font-size:9.5px; }
.composer-graph.compact .composer-na, .composer-graph.mini .composer-na, .composer-graph.compact .composer-nt, .composer-graph.compact .composer-nc,
.composer-graph.mini .composer-nt, .composer-graph.mini .composer-nc, .composer-graph.mini .composer-nl { display:none; }
.composer-graph.compact .composer-chev, .composer-graph.mini .composer-chev { display:inline-block; }
.composer-graph.compact .composer-nf { display:flex; }
.composer-graph.compact .composer-ghx, .composer-graph.mini .composer-ghx { display:none; }
.composer-graph.mini .composer-nb { width:13px; height:13px; font-size:8px; right:-5px; top:-6px; }
.composer-view { grid-area:view; position:relative; border:1px solid var(--border); border-radius:8px; overflow:hidden; min-height:0;
  background:radial-gradient(130% 100% at 50% 0%, color-mix(in srgb, var(--surface2) 85%, var(--bg)) 0%, var(--bg) 75%); }
.composer-view.hm { background:color-mix(in srgb, var(--accent) 22%, var(--bg)); }
.composer-view canvas { position:absolute; inset:0; width:100%; height:100%; display:block; cursor:grab; }
.composer-view canvas:active { cursor:grabbing; }
.composer-cap { position:absolute; left:10px; top:8px; right:240px; pointer-events:none; text-shadow:0 1px 2px color-mix(in srgb, var(--bg) 70%, transparent); }
.composer-cap .t { font-weight:800; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.composer-cap .s { color:var(--muted); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.composer-hl { position:absolute; right:10px; top:8px; padding:5px 10px; border-radius:6px; font-weight:800; font-size:13px; background:var(--surface); border:1px solid var(--border); display:none; box-shadow:0 4px 14px rgba(0,0,0,.25); }
.composer-hl.ok { display:block; color:var(--good); border-color:color-mix(in srgb, var(--good) 55%, transparent); }
.composer-hl.bad { display:block; color:var(--bad); border-color:color-mix(in srgb, var(--bad) 60%, transparent); }
.composer-hl small { display:block; font-weight:400; color:var(--muted); font-size:10.5px; }
.composer-legend { position:absolute; left:10px; bottom:9px; display:none; align-items:center; gap:8px; font-size:10.5px; color:var(--fg); background:color-mix(in srgb, var(--surface) 88%, transparent); border:1px solid var(--border); border-radius:6px; padding:4px 8px; }
.composer-legend.on { display:flex; }
.composer-legend .g { width:110px; height:9px; border-radius:2px; background:linear-gradient(90deg, #000, #fff); border:1px solid var(--border); }
.composer-cams { position:absolute; right:8px; bottom:8px; display:flex; gap:3px; }
.composer-cams .ui-btn { min-height:20px; padding:0 7px; font-size:10.5px; background:color-mix(in srgb, var(--surface) 85%, transparent); }
.composer-log { grid-area:log; display:flex; flex-direction:column; border:1px solid var(--border); border-radius:8px; background:var(--bg); min-height:0; overflow:hidden; }
.composer-loghd { display:flex; align-items:center; gap:10px; padding:3px 8px; border-bottom:1px solid var(--border); font-size:10px; color:var(--muted); background:var(--surface2); }
.composer-loghd b { letter-spacing:.1em; color:var(--fg); }
.composer-logb { flex:1 1 auto; overflow:auto; padding:3px 8px 4px; font-size:11px; line-height:15px; }
.composer-logb div { white-space:pre-wrap; word-break:break-word; padding-left:2ch; text-indent:-2ch; }
.composer-logb .ok { color:var(--good); } .composer-logb .bad { color:var(--bad); } .composer-logb .warn { color:var(--warn); }
.composer-logb .info { color:var(--info); } .composer-logb .muted { color:var(--muted); } .composer-logb .faint { color:var(--faint); } .composer-logb .accent { color:var(--accent); }
.composer-side { grid-area:side; display:flex; flex-direction:column; gap:6px; min-height:0; overflow:hidden; }
.composer-sec { border:1px solid var(--border); border-radius:8px; background:var(--bg); padding:8px 10px; min-height:0; }
.composer-sec .hd { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
.composer-sec .hd .ui-title { flex:1; font-size:10px; }
.composer-id { font-size:18px; font-weight:800; letter-spacing:-.01em; line-height:1.15; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; }
.composer-addr { color:var(--muted); font-size:11px; }
.composer-desc { font-size:11px; margin-top:3px; color:var(--fg); }
.composer-picks { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
.composer-picks .ui-btn { min-height:20px; padding:0 7px; font-size:11px; }
.composer-photos { display:flex; flex-wrap:wrap; gap:2px; margin-top:6px; }
.composer-photos span { width:15px; height:16px; border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:var(--muted); background:var(--surface2); border:1px solid var(--border); }
.composer-photos span.F { color:var(--good); } .composer-photos span.R { color:var(--warn); } .composer-photos span.P { color:var(--info); }
.composer-photos span.pick { outline:2px solid var(--accent); outline-offset:1px; color:var(--fg); }
.composer-photocap { font-size:10px; color:var(--faint); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.composer-bh { font-size:13px; font-weight:800; }
.composer-bh.ok { color:var(--good); } .composer-bh.bad { color:var(--bad); } .composer-bh.idle { color:var(--muted); }
.composer-bsub { font-size:11px; color:var(--muted); margin-top:2px; }
.composer-counts { display:flex; gap:10px; font-size:11px; margin-top:4px; }
.composer-diffs { margin-top:6px; display:flex; flex-direction:column; gap:3px; overflow:auto; min-height:32px; }
.composer-diff { font-size:10.5px; line-height:13px; padding:3px 6px; border-radius:4px; background:var(--surface2); border-left:2px solid var(--border); cursor:pointer; flex:none; }
.composer-diff:hover { background:var(--sel); }
.composer-diff .l1 { display:flex; gap:6px; align-items:baseline; }
.composer-diff .l1 span { margin-left:auto; font-size:9.5px; color:var(--muted); white-space:nowrap; }
.composer-diff.bad .l1 span { color:var(--bad); } .composer-diff.good .l1 span { color:var(--good); }
.composer-diff .l2 { color:var(--muted); }
.composer-diff.bad { border-left-color:var(--bad); } .composer-diff.good { border-left-color:var(--good); } .composer-diff.same { border-left-color:var(--faint); }
.composer-diff b { font-weight:800; }
.composer-listing, .composer-note { flex:none; }
.composer-bench { flex:1 1 0; display:flex; flex-direction:column; min-height:0; overflow:hidden; }
.composer-pr { font-size:10.5px; margin-top:6px; color:var(--muted); }
.composer-hyp { font-size:11px; color:var(--fg); margin-bottom:5px; }
.composer-meter { display:flex; align-items:center; gap:8px; font-size:11px; }
.composer-meter .ui-bar { flex:1; }
.composer-runs { font-size:10.5px; color:var(--muted); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.composer-pop { position:absolute; z-index:20; width:380px; max-width:calc(100% - 12px); background:var(--surface); border:1px solid var(--accent); border-radius:8px; box-shadow:0 14px 40px rgba(0,0,0,.45); padding:6px; }
.composer-pophd { display:flex; gap:8px; align-items:baseline; padding:2px 4px 6px; border-bottom:1px solid var(--border); margin-bottom:4px; font-size:12px; }
.composer-pophd span { margin-left:auto; font-size:10.5px; color:var(--muted); }
.composer-opt { display:grid; grid-template-columns:auto 1fr; gap:1px 8px; width:100%; text-align:left; padding:5px 6px; border-radius:5px; border:1px solid transparent; background:none; color:var(--fg); cursor:pointer; }
.composer-opt:hover { background:var(--sel); }
.composer-opt.on { border-color:color-mix(in srgb, var(--accent) 60%, transparent); background:color-mix(in srgb, var(--sel) 70%, transparent); }
.composer-opt .n { font-weight:700; font-size:11.5px; word-break:break-all; }
.composer-opt .t { justify-self:end; }
.composer-opt .d { grid-column:1 / -1; color:var(--muted); font-size:10.5px; line-height:13px; }
.composer-popft { font-size:10px; color:var(--faint); padding:6px 4px 2px; border-top:1px solid var(--border); margin-top:4px; }
.composer-sheet { position:absolute; inset:0; z-index:15; display:flex; align-items:center; justify-content:center; background:color-mix(in srgb, var(--bg) 70%, transparent); backdrop-filter:blur(2px); }
.composer-doc { width:min(560px, calc(100% - 24px)); max-height:calc(100% - 24px); overflow:auto; background:var(--surface); border:1px solid var(--accent); border-radius:10px; box-shadow:0 20px 50px rgba(0,0,0,.45); padding:16px 18px; }
.composer-doc h3 { margin:0 0 2px; font-size:15px; }
.composer-doc .k { color:var(--muted); font-size:11px; }
.composer-doc p { margin:8px 0; }
.composer-doc ul { margin:4px 0 8px; padding-left:18px; color:var(--muted); font-size:11.5px; }
.composer-doc .row { justify-content:flex-end; margin-top:10px; }
.composer.is-narrow { grid-template-columns:minmax(0,1fr) 252px; grid-template-areas:"top top" "graph graph" "view view" "log side"; grid-template-rows:auto auto minmax(0,1fr) 148px; }
.composer.is-narrow .composer-listing, .composer.is-narrow .composer-diffs, .composer.is-narrow .composer-pr, .composer.is-narrow .composer-runs, .composer.is-narrow .composer-hyp { display:none; }
.composer.is-narrow .composer-sec { padding:6px 8px; }
.composer.is-narrow .composer-bsub { display:none; }
.composer.is-narrow .composer-house { width:130px; }
.composer.is-narrow .composer-wide { display:none; }
.composer.is-narrow .composer-cap, .composer.is-tiny .composer-cap { right:10px; } .composer.is-narrow .composer-hl, .composer.is-tiny .composer-hl { top:auto; bottom:36px; }
.composer.is-tiny { grid-template-columns:minmax(0,1fr); grid-template-areas:"top" "graph" "view"; grid-template-rows:auto auto minmax(0,1fr); }
.composer.is-tiny .composer-log, .composer.is-tiny .composer-side, .composer.is-tiny .composer-wide { display:none; }
.composer.is-tiny .composer-house { width:96px; }
.composer.is-tiny .composer-cap .s { display:none; }
`;

  function injectCss() {
    if (document.getElementById('composer-css')) return;
    document.head.append(h('style', { id: 'composer-css' }, CSS));
  }

  registerApp({
    id: 'composer',
    title: 'Composer',
    icon: 'house-filled',
    desc: 'Compose a house from a listing in 22 stages and benchmark it against gold',
    keywords: ['house', 'pipeline', 'benchmark', 'gold', '3d', 'stages', 'roofer'],
    multi: false,
    mount(win, arg) {
      injectCss();
      const S = win.state;
      Object.assign(S, {
        input: '158', A: { ...MAIN }, phase: 'idle', running: false, abort: false, mode: 'e2e', selected: null, heightmap: false, marks: true,
        comp: null, main: null, done: new Set(KEYS), nst: {}, stored: {}, bench: null, runComp: null, demo: null, anim: null, lastRun: null,
      });
      const root = h('div', { class: 'composer' });
      win.body.append(root);

      // ---- toolbar
      const dlId = `composer-houses-${win.id}`;
      const inp = h('input', {
        class: 'ui-input composer-house', value: S.input, list: dlId, spellcheck: false, autocomplete: 'off', 'aria-label': 'House: a gold id or any invented address', title: 'A gold house id (158, 152, 135, 178), any number, or any invented address. Enter loads it.',
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); loadHouse(inp.value); inp.blur(); } else if (e.key === 'Escape') { inp.value = S.input; inp.blur(); } },
      });
      const dl = h('datalist', { id: dlId }, DATA.goldHouses.map((g) => h('option', { value: String(g) }, `gold ${g}`)), INVENTED.map((a) => h('option', { value: a })));
      const runBtn = h('button', { class: 'ui-btn primary composer-run', title: 'Run (R)', onclick: () => (S.running ? stop() : run()) }, '▶ Run');
      const modeE = h('button', { class: 'ui-btn on', onclick: () => setMode('e2e'), title: 'All 22 stages' }, 'end-to-end');
      const modeI = h('button', { class: 'ui-btn', onclick: () => setMode('iso'), title: 'Only the selected node, on stored upstream outputs' }, 'isolated');
      const mainBtn = h('button', { class: 'ui-btn ghost', onclick: () => resetMain(), title: 'Put every approach back to main' }, 'all main');
      const hmBtn = h('button', { class: 'ui-btn', onclick: () => toggleHeightmap(), title: 'Roof heights in greyscale (H)' }, 'Heightmap');
      const mkBtn = h('button', { class: 'ui-btn on composer-wide', onclick: () => toggleMarks(), title: 'Label every ✗ on the model (M)' }, '✗ marks');
      const demoBtn = h('button', { class: 'ui-btn', onclick: () => demolish(), title: 'The demolish flourish (D)' }, 'Demolish');
      const writeBtnTop = h('button', { class: 'ui-btn composer-wide', onclick: () => writeUp() }, 'Write up');
      const spendTop = h('span', { class: 'ui-faint composer-wide', style: { fontSize: '11px', whiteSpace: 'nowrap' } });
      root.append(h('div', { class: 'composer-top' },
        inp, dl, runBtn, h('span', { class: 'composer-seg' }, modeE, modeI), mainBtn,
        h('span', { class: 'composer-sp' }), spendTop, hmBtn, mkBtn, demoBtn, writeBtnTop));

      // ---- the graph
      const graph = h('div', { class: 'composer-graph' });
      const gprog = h('span', { class: 'composer-gprog' });
      graph.append(h('div', { class: 'composer-ghd' },
        h('b', null, 'PIPELINE'), h('span', { class: 'composer-ghx' }, `${STAGES.length} stages in ${NCOL} columns from needs`),
        h('span', { class: 'composer-key composer-ghx' }, h('i', { style: { background: 'var(--accent2)' } }), 'model call ($)'),
        h('span', { class: 'composer-key composer-ghx' }, h('i', { style: { background: 'var(--info)' } }), 'geometry'),
        h('span', { class: 'composer-key composer-wide composer-ghx' }, '✓ ✗ – against gold'), gprog));
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'composer-edges');
      graph.append(svg);
      const edgeEls = {};
      for (const [u, v] of EDGES) {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('class', 'composer-edge');
        svg.append(p); edgeEls[`${u}>${v}`] = p;
      }
      const nodes = {};
      for (const s of STAGES) {
        const el = h('div', { class: `composer-node ${s.llm ? 'llm' : 'geo'}`, dataset: { key: s.key }, title: `${BY[s.key].i + 1} · ${s.label} (${s.code} ${s.key}). Display numbers come from position. Click to see the model at this stage.` });
        const code = h('b', { class: 'composer-code' }, s.code);
        const t = h('span', { class: 'composer-nt' }, '');
        const c = h('span', { class: 'composer-nc' }, '');
        const SOFT = { Projections: 'Projec\u00ADtions', materials: 'mate\u00ADrials', outlines: 'out\u00ADlines', features: 'fea\u00ADtures', Composed: 'Com\u00ADposed', Describe: 'De\u00ADscribe', Decorate: 'Deco\u00ADrate' };
        const lab = h('div', { class: 'composer-nl', lang: 'en-GB' }, s.label);
        lab.dataset.soft = s.label.split(' ').map((w) => SOFT[w] || w).join(' ');
        const apv = h('span', { class: 'composer-nav' }, h('span', { dir: 'ltr' }, apShort(S.A[s.key])));
        const ap = h('button', { class: 'composer-na', title: 'Pick an approach', onclick: (e) => { e.stopPropagation(); openPicker(s.key); } }, apv, h('i', null, '▾'));
        const pg = h('i');
        const badge = h('span', { class: 'composer-nb' });
        const chev = h('button', { class: 'composer-chev', title: 'Pick an approach', onclick: (e) => { e.stopPropagation(); openPicker(s.key); } }, '▾');
        const t2 = h('span'); const c2 = h('span');
        el.append(h('div', { class: 'composer-nh' }, code, t, c, chev), lab, ap, h('div', { class: 'composer-nf' }, t2, c2), h('div', { class: 'composer-np' }, pg), badge);
        el.addEventListener('click', () => selectNode(s.key));
        el.addEventListener('pointerenter', () => hotEdges(s.key, true));
        el.addEventListener('pointerleave', () => hotEdges(s.key, false));
        graph.append(el);
        nodes[s.key] = { el, t, c, t2, c2, apv, ap, chev, pg, badge, lab };
      }
      root.append(graph);

      // ---- the 3D view
      const viewEl = h('div', { class: 'composer-view' });
      const canvas = h('canvas', { 'aria-label': 'The composed house. Drag to orbit, wheel to zoom, double-click to fit.' });
      const capT = h('div', { class: 't' }); const capS = h('div', { class: 's' });
      const hl = h('div', { class: 'composer-hl' });
      const legend = h('div', { class: 'composer-legend' });
      const camBtn = (label, fn, tip) => h('button', { class: 'ui-btn', title: tip, onclick: fn }, label);
      viewEl.append(canvas, h('div', { class: 'composer-cap' }, capT, capS), hl, legend, h('div', { class: 'composer-cams' },
        camBtn('Front', () => cam(0, 0.14), 'Look at the front'), camBtn('¾', () => cam(camYaw((S.shown || S.comp).T), 0.34), 'Front-first three-quarter view, from the free side'),
        camBtn('Side', () => cam(1.45, 0.22), 'From the right'), camBtn('Rear', () => cam(Math.PI - 0.5, 0.3), 'From the garden'),
        camBtn('Top', () => cam(0.001, 1.42), 'From above'), camBtn('Fit', () => fitHouse(), 'Frame the house (double-click works too)')));
      root.append(viewEl);
      const view = OS.r3d.create(canvas, { camera: { yaw: 0.52, pitch: 0.3, dist: 24, target: [0, 3, 0] }, grid: true, gridExtent: 16, shadows: true, minDist: 4, maxDist: 160 });
      view.fit = () => fitHouse();
      S.view = view;

      // ---- log and side panel
      const logB = h('div', { class: 'composer-logb', role: 'log' });
      const logCount = h('span', { style: { marginLeft: 'auto' } });
      root.append(h('div', { class: 'composer-log' }, h('div', { class: 'composer-loghd' }, h('b', null, 'RUN LOG'), h('span', { class: 'composer-wide' }, '[page code stage · approach] calls · time · cost → result'), logCount), logB));
      const idEl = h('div', { class: 'composer-id' }); const goldEl = h('span', { class: 'ui-tag' }); const addrEl = h('div', { class: 'composer-addr' }); const descEl = h('div', { class: 'composer-desc' });
      const photosEl = h('div', { class: 'composer-photos' }); const photoCap = h('div', { class: 'composer-photocap' });
      const picks = h('div', { class: 'composer-picks' },
        DATA.goldHouses.map((g) => h('button', { class: 'ui-btn', onclick: () => loadHouse(String(g)), title: `Gold house ${g}` }, String(g))),
        h('button', { class: 'ui-btn', onclick: () => inventAddress(), title: 'Any invented address works' }, 'invent ↻'));
      const listing = h('div', { class: 'composer-sec composer-listing' }, h('div', { class: 'hd' }, h('span', { class: 'ui-title' }, 'Listing'), goldEl), idEl, addrEl, descEl, picks, photosEl, photoCap);
      const bh = h('div', { class: 'composer-bh idle' }); const bsub = h('div', { class: 'composer-bsub' }); const counts = h('div', { class: 'composer-counts' });
      const diffs = h('div', { class: 'composer-diffs' }); const prEl = h('div', { class: 'composer-pr' });
      const bench = h('div', { class: 'composer-sec composer-bench' }, h('div', { class: 'hd' }, h('span', { class: 'ui-title' }, 'Benchmark against gold')), bh, bsub, counts, diffs, prEl);
      const hypEl = h('div', { class: 'composer-hyp' }); const meterBar = h('i'); const meterTxt = h('span'); const runsEl = h('div', { class: 'composer-runs' });
      const noteTitle = h('span', { class: 'ui-title' });
      const writeBtn = h('button', { class: 'ui-btn', style: { minHeight: '20px', padding: '0 8px', fontSize: '11px' }, onclick: () => writeUp() }, 'Write up');
      const noteSec = h('div', { class: 'composer-sec composer-note' }, h('div', { class: 'hd' }, noteTitle, writeBtn), hypEl,
        h('div', { class: 'composer-meter' }, h('div', { class: 'ui-bar' }, meterBar), meterTxt), runsEl);
      root.append(h('div', { class: 'composer-side' }, listing, bench, noteSec));

      // ---------- helpers ----------
      const log = (text, cls) => {
        const el = h('div', { class: cls || '' }, text);
        logB.append(el);
        while (logB.children.length > 400) logB.firstChild.remove();
        logB.scrollTop = logB.scrollHeight;
        logCount.textContent = `${logB.children.length} lines`;
        return { set: (t, c) => { el.textContent = t; el.className = c || ''; logB.scrollTop = logB.scrollHeight; } };
      };

      function layoutGraph() {
        const gw = graph.clientWidth;
        if (!gw) return;
        const gmode = S.size === 'L' ? 'full' : (gw >= 740 && win.height >= 560 ? 'compact' : 'mini');
        const compact = gmode !== 'full';
        graph.classList.toggle('compact', gmode === 'compact');
        graph.classList.toggle('mini', gmode === 'mini');
        const padX = 8; const head = 22; const gapY = gmode === 'full' ? 10 : gmode === 'compact' ? 8 : 6;
        const pitch = (gw - padX * 2) / NCOL;
        const nodeW = Math.floor(pitch - (gmode === 'full' ? Math.max(11, Math.min(18, pitch * 0.13)) : 8));
        const nodeH = gmode === 'full' ? 66 : gmode === 'compact' ? 52 : 25;
        for (const s of STAGES) { const lb = nodes[s.key].lab; const want = gmode === 'compact' ? lb.dataset.soft : s.label; if (lb.textContent !== want) lb.textContent = want; }
        graph.style.height = `${head + NROW * nodeH + (NROW - 1) * gapY + 10}px`;
        const pos = {};
        for (const s of STAGES) {
          const x = padX + COL[s.key] * pitch; const y = head + ROW[s.key] * (nodeH + gapY);
          const n = nodes[s.key].el;
          Object.assign(n.style, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px`, width: `${nodeW}px`, height: `${nodeH}px` });
          pos[s.key] = { x, y, w: nodeW, h: nodeH };
        }
        svg.setAttribute('width', String(gw)); svg.setAttribute('height', String(graph.clientHeight));
        const ins = {}; const outs = {};
        for (const [u, v] of EDGES) { (outs[u] ||= []).push(v); (ins[v] ||= []).push(u); }
        for (const k of Object.keys(ins)) ins[k].sort((a, b) => ROW[a] - ROW[b] || COL[a] - COL[b]);
        for (const k of Object.keys(outs)) outs[k].sort((a, b) => ROW[a] - ROW[b] || COL[a] - COL[b]);
        for (const [u, v] of EDGES) {
          const a = pos[u]; const b = pos[v];
          const io = outs[u].indexOf(v); const ii = ins[v].indexOf(u);
          const y1 = a.y + a.h * (0.3 + (0.4 * (io + 1)) / (outs[u].length + 1));
          const y2 = b.y + b.h * (0.25 + (0.5 * (ii + 1)) / (ins[v].length + 1));
          const x1 = a.x + a.w; const x2 = b.x;
          const dx = Math.max(10, (x2 - x1) * 0.45);
          edgeEls[`${u}>${v}`].setAttribute('d', `M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1 + dx).toFixed(1)},${y1.toFixed(1)} ${(x2 - dx).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
        }
      }
      function hotEdges(key, on) {
        for (const [u, v] of EDGES) if (u === key || v === key) edgeEls[`${u}>${v}`].classList.toggle('hot', on);
      }
      function paintEdges() {
        for (const [u, v] of EDGES) {
          const el = edgeEls[`${u}>${v}`]; const a = S.nst[u]; const b = S.nst[v];
          el.classList.remove('done', 'live', 'stored', 'stale');
          if (b === 'running') el.classList.add('live');
          else if (a === 'done' && b === 'done') el.classList.add('done');
          else if (b === 'stale') el.classList.add('stale');
          else if ((a === 'stored' || a === 'done') && (b === 'stored' || b === 'done')) el.classList.add('stored');
        }
      }
      function setNode(key, st, info = {}) {
        S.nst[key] = st;
        const n = nodes[key]; const o = info.out;
        n.el.classList.remove('st-idle', 'st-queued', 'st-running', 'st-done', 'st-stored', 'st-stale', 'st-cancel', 'st-refused');
        n.el.classList.add(`st-${st}`);
        if (st === 'running') { n.t.textContent = 'running'; n.c.textContent = ''; }
        else if (o && (st === 'done' || st === 'stored')) { n.t.textContent = `${f1(o.secs)}s`; n.c.textContent = BY[key].llm ? OS.usd(o.usd) : '$0'; n.c.classList.toggle('paid', BY[key].llm && st === 'done'); }
        else if (st === 'queued') { n.t.textContent = 'queued'; n.c.textContent = ''; }
        else if (st === 'stale') { n.t.textContent = 'stale'; n.c.textContent = ''; }
        else if (st === 'cancel') { n.t.textContent = 'stopped'; n.c.textContent = ''; }
        else if (st === 'refused') { n.t.textContent = 'refused'; n.c.textContent = ''; }
        n.t2.textContent = n.t.textContent; n.c2.textContent = n.c.textContent; n.c2.className = n.c.className;
        if (st !== 'running') { n.pg.style.transition = 'none'; n.pg.style.width = '0'; }
      }
      function setBadge(key, val) {
        const b = nodes[key].badge;
        b.className = 'composer-nb' + (val === true ? ' ok' : val === false ? ' bad' : val === null ? ' none' : '');
        b.textContent = val === true ? '✓' : val === false ? '✗' : val === null ? '–' : '';
        b.title = val === true ? 'matches gold' : val === false ? 'does not match gold' : val === null ? 'no gold question for this stage' : '';
      }
      function paintApproaches() {
        let changed = 0;
        for (const s of STAGES) {
          const n = nodes[s.key]; const a = S.A[s.key];
          n.apv.firstChild.textContent = apShort(a);
          n.ap.title = `${apText(a)}${a === MAIN[s.key] ? ' (main)' : ' (not main)'}. Click to pick another.`;
          n.el.classList.toggle('changed', a !== MAIN[s.key]);
          n.ap.disabled = S.running; n.chev.disabled = S.running;
          n.chev.title = `${apText(a)}${a === MAIN[s.key] ? ' (main)' : ' (not main)'}. Click to pick another.`;
          if (a !== MAIN[s.key]) changed += 1;
        }
        mainBtn.textContent = changed ? `≠ main (${changed}) ↺` : 'all main';
        mainBtn.classList.toggle('composer-changed', !!changed);
        mainBtn.disabled = !changed || S.running;
      }
      function paintNote() {
        const v = Note.get();
        noteTitle.textContent = `Note H-${v.n}`;
        hypEl.textContent = v.hyp;
        const frac = Math.min(1, v.spent / CAP);
        meterBar.style.width = `${(frac * 100).toFixed(1)}%`;
        meterBar.parentElement.className = 'ui-bar' + (frac > 0.85 ? ' bad' : frac > 0.6 ? ' warn' : '');
        meterTxt.textContent = `${OS.usd(v.spent)} of ${OS.usd(CAP)}`;
        runsEl.textContent = v.runs.length ? `${plural(v.runs.length, 'run')} · last: ${v.runs[v.runs.length - 1].house} · ${v.runs[v.runs.length - 1].headline}` : 'No runs yet.';
        spendTop.textContent = `H-${v.n} ${OS.usd(v.spent)}/${OS.usd(CAP)} · today ${OS.usd(OS.spend.today())}`;
        win.setMeta(`H-${v.n} · ${OS.usd(v.spent)} of ${OS.usd(CAP)}`);
      }
      function paintListing(comp, runComp) {
        const T = comp.T;
        idEl.textContent = T.kind === 'id' ? `House ${T.label}` : T.label;
        goldEl.textContent = T.gold ? 'gold · reliable' : 'bot-labelled';
        goldEl.className = 'ui-tag ' + (T.gold ? 'good' : 'warn');
        addrEl.textContent = T.kind === 'id' ? `${T.address} (invented)` : 'An invented address. Gold was labelled by a bot.';
        descEl.textContent = describe(T);
        const pickIdx = runComp && runComp.out.tag_images ? (runComp.X.flip ? T.rearIdx : T.frontIdx) : T.frontIdx;
        photosEl.innerHTML = '';
        T.tags.forEach((t, i) => photosEl.append(h('span', { class: `${t}${i + 1 === pickIdx ? ' pick' : ''}`, title: `#${i + 1}: ${{ F: 'the front', R: 'the rear', P: 'the floor plan', I: 'inside', G: 'the garden', S: 'the street' }[t]}` }, t)));
        photoCap.textContent = `${T.photos} photos · P1 picked #${pickIdx} as the front${pickIdx === T.rearIdx ? ': it is the rear' : ''}`;
        photoCap.className = 'composer-photocap' + (pickIdx === T.rearIdx ? ' ui-bad' : '');
      }
      function paintBench(b, comp, label) {
        hl.className = 'composer-hl';
        if (!b) { bh.className = 'composer-bh idle'; bh.textContent = label || 'Not run yet'; bsub.textContent = ''; counts.innerHTML = ''; diffs.innerHTML = ''; prEl.textContent = ''; return; }
        bh.className = 'composer-bh ' + (b.ok ? 'ok' : 'bad');
        bh.textContent = b.headline;
        bsub.textContent = b.isolated ? `isolated: ${b.rows.map((r) => `${r.code} ${r.key}`).join(', ')} against main's stored output` : `composed model ${f1(b.score)}/10 against the photos · main ${f1(b.mainScore)}/10`;
        counts.innerHTML = '';
        counts.append(h('span', { class: 'ui-good' }, `${b.pass} ✓`), h('span', { class: 'ui-bad' }, `${b.fail} ✗`), h('span', { class: 'ui-faint' }, `${b.none} –`), h('span', { class: 'ui-muted' }, b.improve.length ? `${plural(b.improve.length, 'improvement')}` : ''));
        diffs.innerHTML = '';
        const rank = (r) => (r.main === true && r.run === false ? 0 : r.main === false && r.run === true ? 1 : 2);
        const rows = b.rows.filter((r) => r.run === false || r.run !== r.main).sort((a, c) => rank(a) - rank(c));
        for (const r of rows) {
          const kind = r.main === true && r.run === false ? 'bad' : r.main === false && r.run === true ? 'good' : 'same';
          const what = kind === 'bad' ? 'regression' : kind === 'good' ? 'improvement' : 'on main too';
          diffs.append(h('div', { class: `composer-diff ${kind}`, title: 'Show it on the model', onclick: () => focusDefect(r.key) },
            h('div', { class: 'l1' }, h('b', null, `${r.code} ${r.key}`), h('span', null, `${r.run ? '✓' : '✗'} · main ${r.main ? '✓' : r.main === false ? '✗' : '–'} · ${what}`)),
            h('div', { class: 'l2' }, `${apShort(r.ap)}${r.defect && r.run === false ? ` · ${r.defect.replace(/^[A-Z]\d+: /, '')}` : ''}`)));
        }
        if (!rows.length) diffs.append(h('div', { class: 'composer-diff same' }, 'Every scored stage matches gold.'));
        prEl.textContent = b.isolated ? 'PR check needs an end-to-end run.' : b.ok ? 'PR check: ✓ not worse than main. Merge by rebase.' : 'PR check: blocked. A merge needs "✓ not worse than main".';
        hl.className = 'composer-hl ' + (b.ok ? 'ok' : 'bad');
        hl.innerHTML = '';
        hl.append(b.headline, h('small', null, b.isolated ? 'isolated run' : `${b.pass} ✓ · ${b.fail} ✗ · ${b.none} – · ${f1(b.score)}/10 vs photos`));
      }
      function caption(t, s) { capT.textContent = t; capS.textContent = s || ''; }

      // ---------- the 3D scene ----------
      function sceneFor(comp, done, extra = {}) {
        const defects = S.marks && S.bench && !S.bench.isolated ? S.bench.rows.filter((r) => r.run === false && r.defect).map((r) => ({ key: r.key, text: r.mark })) : [];
        return buildScene(comp, done, { marks: S.marks, defects, heightmap: S.heightmap, ...extra });
      }
      function show(comp, done, animGrp) {
        if (!comp) return;
        const sc = sceneFor(comp, done);
        legend.classList.toggle('on', S.heightmap);
        viewEl.classList.toggle('hm', S.heightmap);
        if (S.heightmap) {
          legend.innerHTML = '';
          if (sc.empty) legend.append(h('span', null, 'Heightmap: no roof yet. The roofer is M2.'));
          else legend.append(h('b', null, 'HEIGHTMAP'), h('span', null, `black ${f1(sc.lo)} m eaves`), h('i', { class: 'g' }), h('span', null, `white ${f1(sc.hi)} m ridge`));
        }
        view.options.gridExtent = Math.max(16, Math.ceil((comp.X.scale || 1) * 12));
        S.anim = null;
        if (animGrp) {
          const fresh = sc.faces.filter((f) => f.grp === animGrp);
          for (const f of fresh) { f._base = f.pts; f._alpha = f.alpha ?? 1; f.alpha = 0; }
          S.anim = { faces: fresh, t: 0, dur: 320 };
        }
        view.set(sc.faces, { lines: sc.lines, labels: sc.labels });
        S.sceneFaces = sc.faces.length;
      }
      function fitHouse(comp = S.shown || S.comp, pad = S.heightmap ? 0.62 : 0.98) {
        const faces = view.faces();
        const big = comp && comp.X.scale !== 1;
        let pts = faces.filter((f) => f.hb || f.kind === 'vol' || f.kind === 'hbox' || (big && f.nb)).flatMap((f) => f.pts);
        if (!pts.length && comp) pts = buildScene(comp, new Set(KEYS), {}).faces.filter((f) => f.hb).flatMap((f) => f.pts);
        if (!pts.length) return;
        const mn = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])));
        const mx = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])));
        const c = view.camera;
        const r = Math.hypot(mx[0] - mn[0] + 3, mx[1] - mn[1], mx[2] - mn[2] + 2) / 2;
        const aspect = Math.max(0.5, Math.min(1, (canvas.clientWidth || 1) / (canvas.clientHeight || 1)));
        c.target = [(mn[0] + mx[0]) / 2, S.heightmap ? (mn[1] + mx[1]) / 2 : Math.max(1.5, (mx[1] - mn[1]) * 0.42), (mn[2] + mx[2]) / 2 + (S.heightmap ? 0 : 0.6)];
        c.dist = OS.clamp((r / Math.sin(c.fov / 2)) * pad / aspect, 6, 150);
        view.request();
      }
      function cam(yaw, pitch) { view.camera.yaw = yaw; view.camera.pitch = pitch; fitHouse(); }
      // Point the camera at a stage's defect, from the side that shows it.
      function focusDefect(key) {
        const comp = S.shown || S.comp;
        if (!comp || S.demo) return;
        if (S.heightmap) toggleHeightmap();
        const at = defectAnchors(comp)[key];
        const sd = Math.sign(camYaw(comp.T)) || 1;
        const sw = at && at[0] > comp.M.xc ? 1 : -1;
        const presets = {
          tag_images: [Math.PI - 0.6 * sd, 0.24, 15], mark_features: [1.05 * sw, 0.1, 9], massing: [0.28 * sd, 0.12, 11], orient_plan: [0.001, 0.2, 15],
          floor_outlines: [0.75 * sd, 0.35, 17], align_floors: [0.8 * sd, 0.22, 18], floor_cells: [1.15 * sd, 0.18, 13], roofer: [0.6 * sd, 0.55, 17],
          wall_materials: [0.3 * sd, 0.2, 14], describe_house: [0.35 * sd, 0.14, 11],
        };
        const p = presets[key];
        if (!at || !p) { view.camera.yaw = camYaw(comp.T); view.camera.pitch = 0.34; fitHouse(comp); return; }
        Object.assign(view.camera, { yaw: p[0], pitch: p[1], target: at.slice(), dist: p[2] * (key === 'tag_images' ? comp.X.scale : 1) });
        view.request();
        const o = comp.out[key];
        log(`looking at ${BY[key].code} ${key} · ${apText(comp.A[key])}: ${o.defect ? o.defect.replace(/^[A-Z]\d+: /, '') : o.sum}`, o.ok === false ? 'warn' : 'muted');
      }
      S.fit = fitHouse;

      win.raf((dt) => {
        if (S.anim && S.anim.faces) {
          const a = S.anim; a.t += dt; const k = Math.min(1, a.t / a.dur); const e = 1 - (1 - k) * (1 - k);
          for (const f of a.faces) { f.alpha = f._alpha * e; f.pts = f._base.map((p) => [p[0], p[1] + (1 - e) * 0.9, p[2]]); }
          view.request();
          if (k >= 1) { for (const f of a.faces) { f.pts = f._base; f.alpha = f._alpha; } S.anim = null; }
        }
        if (S.demo) tickDemolish(dt);
      });

      // ---------- states ----------
      function loadHouse(input, quiet) {
        const val = String(input || '').trim();
        if (!val) { inp.value = S.input; return false; }
        if (S.running) { OS.osd('A run is going. Stop it first.'); inp.value = S.input; return false; }
        if (isHeldOut(val)) {
          inp.value = S.input;
          win.crash({
            title: 'Held-out house', code: 'COMPOSER-0x0140 HELD_OUT', icon: 'padlock',
            lines: [`House ${houseKey(val).label} is held out. Held-out houses are never shown to tuning.`, 'Pick a dev set house, a gold house, or any invented address.'],
          });
          log(`house ${houseKey(val).label} is held out; it was not opened`, 'warn');
          return false;
        }
        stopDemolish(); savedCam = null;
        S.input = val; inp.value = val;
        S.main = compose(val, MAIN);
        S.comp = S.main; S.shown = S.main; S.runComp = null; S.bench = null; S.selected = null;
        S.done = new Set(KEYS); S.phase = 'idle';
        for (const s of STAGES) { setNode(s.key, 'stored', { out: S.main.out[s.key] }); setBadge(s.key, S.main.out[s.key].ok); nodes[s.key].el.classList.remove('regress', 'sel'); }
        setMode(S.mode);
        paintEdges(); paintApproaches(); paintListing(S.main, null);
        paintBench(benchmark(S.main, S.main), S.main);
        bh.textContent = '✓ not worse than main (it is main)';
        hl.className = 'composer-hl';
        caption(`${S.main.T.kind === 'id' ? `House ${S.main.T.label}` : S.main.T.label} · the latest main run`, `stored · ${STAGES.length} stages · ${OS.usd(S.main.usd)} when it ran · press Run to compose it again`);
        capT.dataset.base = capT.textContent; capS.dataset.base = capS.textContent;
        win.setTitle(`Composer · ${S.main.T.label}`);
        show(S.main, S.done);
        requestAnimationFrame(() => { if (win.closed) return; if (!S.heightmap) { view.camera.yaw = camYaw(S.main.T); view.camera.pitch = 0.34; } fitHouse(S.main); });
        gprog.textContent = `latest main run · ${OS.usd(S.main.usd)}`;
        if (!quiet) log(`Loaded the latest main run for ${S.main.T.kind === 'id' ? 'house ' : ''}${S.main.T.label}: ${describe(S.main.T)}. ${goldWord(S.main.T)}.`, 'muted');
        return true;
      }
      function setMode(m) {
        if (S.running) return;
        S.mode = m; modeE.classList.toggle('on', m === 'e2e'); modeI.classList.toggle('on', m === 'iso');
        runBtn.textContent = m === 'iso' ? (S.selected ? `▶ Run ${BY[S.selected].code}` : '▶ Run node') : '▶ Run';
        if (m === 'iso' && !S.selected) caption(capT.textContent, 'Isolated: click a node, then Run. It reads stored upstream outputs.');
      }
      const shownStages = () => (S.selected ? new Set(KEYS.filter((k) => BY[k].i <= BY[S.selected].i && (S.nst[k] === 'done' || S.nst[k] === 'stored'))) : S.done);
      function refresh() { stopDemolish(); show(S.shown || S.comp, shownStages()); }
      function selectNode(key) {
        if (S.running) return;
        closePicker();
        const same = S.selected === key;
        if (S.selected) nodes[S.selected].el.classList.remove('sel');
        S.selected = same ? null : key;
        if (S.selected) nodes[key].el.classList.add('sel');
        setMode(S.mode);
        const comp = S.shown || S.comp;
        if (S.demo) stopDemolish();
        if (S.selected) {
          show(comp, shownStages());
          const ran = S.nst[key] === 'done' || S.nst[key] === 'stored';
          caption(`${BY[key].code} · ${BY[key].label} · ${apText(comp.A[key])}`, ran ? `the model as it stood after stage ${BY[key].i + 1} of ${STAGES.length} · ${comp.out[key].sum}` : `not run in this run (${S.nst[key]}) · the view shows the stages before it that did run`);
        } else {
          show(comp, S.done);
          caption(capT.dataset.base || capT.textContent, capS.dataset.base || '');
        }
      }
      function setApproach(key, a) {
        if (S.running) return;
        S.A[key] = a;
        paintApproaches();
        const diff = KEYS.filter((k) => S.A[k] !== MAIN[k]);
        log(`${BY[key].code} ${key} → ${apText(a)}${a === MAIN[key] ? ' (main)' : ''}. ${diff.length ? `${plural(diff.length, 'stage')} off main.` : 'Every stage on main.'} Run to compose with it.`, 'accent');
        capS.textContent = 'Approaches changed since this model. Press Run to compose it.';
      }
      function resetMain() {
        if (S.running) return;
        S.A = { ...MAIN }; paintApproaches();
        log('Every approach back on main.', 'muted');
      }
      function inventAddress() {
        const cur = INVENTED.indexOf(S.input);
        loadHouse(INVENTED[(cur + 1) % INVENTED.length]);
      }

      // ---------- the approach picker ----------
      let pop = null;
      function closePicker() { if (pop) { pop.remove(); pop = null; } }
      function openPicker(key) {
        if (S.running) return;
        if (pop && pop.dataset.key === key) { closePicker(); return; }
        closePicker();
        const s = BY[key];
        pop = h('div', { class: 'composer-pop', role: 'dialog', dataset: { key } },
          h('div', { class: 'composer-pophd' }, h('b', null, `${s.code} · ${s.label}`), h('span', null, `stage ${s.i + 1} of ${STAGES.length} · ${s.llm ? 'model call' : 'geometry'} · needs ${s.needs.length ? s.needs.join(', ') : 'nothing'}`)),
          approachList(key).map((a) => h('button', { class: 'composer-opt' + (a === S.A[key] ? ' on' : ''), onclick: (e) => { e.stopPropagation(); setApproach(key, a); closePicker(); } },
            h('span', { class: 'n' }, apText(a)), a === MAIN[key] ? h('span', { class: 'ui-tag good t' }, 'main') : a === STORED ? h('span', { class: 'ui-tag warn t' }, 'stored') : h('span', { class: 't' }),
            h('span', { class: 'd' }, (NOTES[key] || {})[a] || ''))),
          h('div', { class: 'composer-popft' }, 'Once an approach is on main its output never changes. A different prompt is a new numbered file. Never rename one: stored runs record them.'));
        root.append(pop);
        const nr = nodes[key].el.getBoundingClientRect(); const rr = root.getBoundingClientRect();
        const pw = Math.min(380, rr.width - 12);
        let left = nr.left - rr.left; if (left + pw > rr.width - 6) left = rr.width - 6 - pw; left = Math.max(6, left);
        let topY = nr.bottom - rr.top + 6;
        const ph = pop.offsetHeight;
        if (topY + ph > rr.height - 6) topY = Math.max(6, nr.top - rr.top - ph - 6);
        Object.assign(pop.style, { left: `${left}px`, top: `${topY}px` });
      }
      root.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('.composer-na, .composer-chev')) closePicker(); });

      // ---------- running ----------
      async function run() {
        if (S.running || !S.main) return;
        try { await runOnce(); }
        catch (err) { log(`run failed: ${err && err.message ? err.message : err}. Nothing was benchmarked.`, 'bad'); S.phase = 'failed'; }
        finally { if (!win.closed && S.running) { S.running = false; runBtn.classList.remove('stop'); setMode(S.mode); paintApproaches(); } }
      }
      async function runOnce() {
        if (S.running) return;
        closePicker(); stopDemolish();
        if (isHeldOut(S.input)) { loadHouse(S.input); return; }
        const iso = S.mode === 'iso';
        if (iso && !S.selected) { OS.osd('Pick a node to run in isolation'); log('Isolated runs need a node. Click one, then Run.', 'warn'); return; }
        const T0 = truth(S.input);
        const stored = S.stored[T0.id] || { A: { ...MAIN }, label: 'the latest main run' };
        let A = { ...S.A }; let keys = KEYS;
        if (iso) {
          const sel = BY[S.selected];
          A = Object.fromEntries(STAGES.map((s) => [s.key, s.key === sel.key ? S.A[s.key] : stored.A[s.key]]));
          keys = [sel.key];
        }
        const comp = compose(S.input, A);
        const pre = preflight(comp, keys);
        if (!pre.ok) {
          log(pre.message, 'bad');
          win.crash({
            title: pre.kind === 'note' ? 'Note cap reached' : 'Daily spend cap reached', code: pre.kind === 'note' ? 'COMPOSER-0x0A10 NOTE_CAP' : 'COMPOSER-0x0100 DAILY_CAP', icon: 'coins-outline',
            lines: [pre.message],
            actions: pre.kind === 'note'
              ? [{ label: `Write up H-${Note.get().n}`, primary: true, run: () => { writeUp(); } }, { label: 'OK' }]
              : [{ label: 'OK', primary: true }],
          });
          S.phase = 'refused';
          return;
        }
        S.running = true; S.abort = false; S.phase = 'running'; S.runComp = comp; S.bench = null;
        runBtn.textContent = '■ Stop'; runBtn.classList.add('stop');
        paintApproaches(); paintBench(null, null, 'Running…');
        const mb = benchmark(S.main, S.main);
        bsub.textContent = `Scored against gold after M4. Main scored ${mb.pass} ✓ · ${mb.fail} ✗ on this house.`;
        const selKey = S.selected;
        if (selKey) nodes[selKey].el.classList.remove('sel');
        S.selected = null;
        for (const s of STAGES) { nodes[s.key].el.classList.remove('regress'); setBadge(s.key, undefined); }
        const t0 = performance.now();
        const done = new Set();
        const stale = iso ? dependants(keys[0]) : new Set();
        if (iso) {
          const sel = BY[keys[0]];
          for (const s of STAGES) {
            if (s.key === sel.key) setNode(s.key, 'queued');
            else if (stale.has(s.key)) setNode(s.key, 'stale');
            else { setNode(s.key, 'stored', { out: comp.out[s.key] }); if (BY[s.key].i < sel.i) done.add(s.key); }
          }
          log(`isolated ${sel.code} ${sel.key} · ${apText(A[sel.key])} on house ${comp.T.label}; upstream read from ${stored.label}`, 'info');
        } else {
          for (const s of STAGES) setNode(s.key, 'queued');
          log(`run ${comp.T.kind === 'id' ? 'house ' : ''}${comp.T.label} · ${STAGES.length} stages · ${KEYS.filter((k) => A[k] !== MAIN[k]).map((k) => `${k}: ${apText(A[k])}`).join(', ') || 'all main'} · est. ${OS.usd(pre.est)} · H-${Note.get().n}`, 'info');
        }
        paintEdges();
        S.shown = comp; S.done = done;
        show(comp, done);
        paintListing(comp, null);
        requestAnimationFrame(() => { if (win.closed) return; if (!S.heightmap) { view.camera.yaw = camYaw(comp.T); view.camera.pitch = 0.34; } fitHouse(comp); });
        caption(`${comp.T.kind === 'id' ? `House ${comp.T.label}` : comp.T.label} · composing`, iso ? `isolated ${BY[keys[0]].code}` : `0 of ${STAGES.length} stages`);
        let current = null; let line = null; const noteN = Note.get().n;
        const res = await execute(comp, keys, {
          sleep: (ms) => win.sleep(ms),
          aborted: () => win.closed || S.abort,
          start: (k, o, ms) => {
            current = k;
            setNode(k, 'running');
            const pg = nodes[k].pg; pg.style.transition = 'none'; pg.style.width = '0'; void pg.offsetWidth;
            pg.style.transition = `width ${Math.round(ms / OS.speed)}ms linear`; pg.style.width = '100%';
            paintEdges();
            line = log(`${logHead(comp, k)} running…`, 'muted');
            caption(`${BY[k].code} · ${BY[k].label} · ${apText(comp.A[k])}`, iso ? 'isolated run' : `stage ${BY[k].i + 1} of ${STAGES.length} · ${BY[k].llm ? 'asking a model' : 'geometry'}`);
            gprog.textContent = `${iso ? 'isolated' : `${done.size} / ${STAGES.length}`} · ${((performance.now() - t0) / 1000).toFixed(1)}s · ${OS.usd(r2([...done].reduce((s2, kk) => s2 + (keys.includes(kk) ? comp.out[kk].usd : 0), 0)))}`;
          },
          done: (k, o) => {
            setNode(k, 'done', { out: o });
            done.add(k);
            line.set(logLine(comp, k), o.ok === false ? 'warn' : undefined);
            paintEdges();
            show(comp, done, k);
            if (k === 'tag_images') paintListing(comp, comp);
            if (k === 'plan_sheet' && comp.X.scale !== 1) fitHouse(comp);
            if (k === 'site_context' || k === 'composed_model') fitHouse(comp);
          },
        });
        if (win.closed) return;
        S.running = false;
        runBtn.classList.remove('stop'); setMode(S.mode);
        const spent = res.usd;
        if (res.aborted || res.refused) {
          const capWord = res.kind === 'note' ? `the H-${noteN} cap` : 'the daily cap';
          if (line && res.at) line.set(`${logHead(comp, res.at)} ${res.refused ? `refused by ${capWord}` : 'stopped'}`, res.refused ? 'bad' : 'warn');
          for (const s of STAGES) if (S.nst[s.key] === 'queued' || S.nst[s.key] === 'running') setNode(s.key, res.refused && s.key === res.at ? 'refused' : 'cancel');
          paintEdges(); paintApproaches();
          if (res.refused) {
            log(res.message, 'bad');
            win.crash(res.kind === 'note'
              ? { title: 'Note cap reached', code: 'COMPOSER-0x0A10 NOTE_CAP', icon: 'coins-outline', lines: [res.message], actions: [{ label: `Write up H-${Note.get().n}`, primary: true, run: () => { writeUp(); } }, { label: 'OK' }] }
              : { title: 'Daily spend cap reached', code: 'COMPOSER-0x0100 DAILY_CAP', icon: 'coins-outline', lines: [res.message], actions: [{ label: 'OK', primary: true }] });
            S.phase = 'refused';
          } else {
            log(`stopped at ${BY[res.at].code} ${res.at}. Charged so far: ${OS.usd(spent)}. Nothing was benchmarked.`, 'warn');
            S.phase = 'stopped';
          }
          paintBench(null, null, res.refused ? `Refused by ${capWord}` : 'Stopped. Not benchmarked.');
          caption(capT.textContent, res.refused ? 'refused' : 'stopped');
          paintNote();
          return;
        }
        // benchmark
        const b = benchmark(comp, S.main, keys);
        S.bench = b; S.phase = 'done'; S.comp = comp; S.lastRun = { usd: spent, keys, headline: b.headline };
        for (const r of b.rows) { setBadge(r.key, r.run); nodes[r.key].el.classList.toggle('regress', r.main === true && r.run === false); }
        if (!iso) for (const s of STAGES) if (!keys.includes(s.key)) setBadge(s.key, undefined);
        if (iso) {
          S.done = new Set(KEYS.filter((k) => BY[k].i <= BY[keys[0]].i));
          show(comp, S.done);
        } else {
          S.done = new Set(KEYS);
          S.stored[comp.T.id] = { A: { ...A }, label: 'your last end-to-end run' };
          show(comp, S.done);
          fitHouse(comp);
        }
        paintBench(b, comp);
        const changed = KEYS.filter((k) => A[k] !== MAIN[k]);
        const recorded = Note.addRun({ house: comp.T.label, what: iso ? `${keys[0]}: ${apText(A[keys[0]])} (isolated)` : (changed.map((k) => `${k}: ${apText(A[k])}`).join(', ') || 'all main'), headline: b.headline, regress: b.regress.length, improve: b.improve.length, ...scoreFields(b), usd: spent }, noteN);
        const v = Note.get();
        if (!recorded) log(`H-${noteN} was written up during this run, so the run is not recorded in H-${v.n}.`, 'warn');
        log(`benchmark vs gold: ${b.pass} ✓ · ${b.fail} ✗ · ${b.none} not scored${iso ? '' : ` · composed model ${f1(b.score)}/10 against the photos (main ${f1(b.mainScore)}/10)`}`, 'muted');
        for (const r of b.regress) log(`  regression ${r.code} ${r.key} · ${apText(r.ap)}: ${r.defect ? r.defect.replace(/^[A-Z]\d+: /, '') : 'does not match gold'}`, 'bad');
        for (const r of b.improve) log(`  improvement ${r.code} ${r.key} · ${apText(r.ap)}`, 'ok');
        log(b.headline, b.ok ? 'ok' : 'bad');
        log(`spent ${OS.usd(spent)} · H-${v.n} ${OS.usd(v.spent)} of ${OS.usd(CAP)} · today ${OS.usd(OS.spend.today())} of ${OS.usd(OS.spend.cap)}`, 'muted');
        sysLog(`[${OS.now().toISOString()}] composer ${iso ? 'isolated ' + keys[0] : 'run'} house ${comp.T.label}: ${b.headline} · ${OS.usd(spent)}`);
        const base = `${comp.T.kind === 'id' ? `House ${comp.T.label}` : comp.T.label} · ${iso ? `isolated ${BY[keys[0]].code}` : 'composed'}`;
        const sub = iso ? `${BY[keys[0]].code} re-run on stored upstream outputs · ${stale.size ? `${plural(stale.size, 'downstream stage')} now stale` : 'no stage needs it, so nothing is stale'}` : `${comp.faces} faces · ${f1(comp.score)}/10 against the photos · ${OS.usd(spent)}`;
        caption(base, sub); capT.dataset.base = base; capS.dataset.base = sub;
        gprog.textContent = `${iso ? 'isolated' : `${STAGES.length} / ${STAGES.length}`} · ${((performance.now() - t0) / 1000).toFixed(1)}s · ${OS.usd(spent)}`;
        paintApproaches(); paintNote(); paintListing(comp, comp);
        OS.emit('composer:run', { house: comp.T.label, headline: b.headline, usd: spent });
        if (!b.ok) win.flash();
      }
      function stop() { if (S.running) { S.abort = true; } }

      // ---------- view toggles ----------
      let savedCam = null;
      function toggleHeightmap() {
        stopDemolish();
        S.heightmap = !S.heightmap;
        hmBtn.classList.toggle('on', S.heightmap);
        const comp = S.shown || S.comp;
        if (S.heightmap) { savedCam = { ...view.camera, target: view.camera.target.slice() }; view.camera.yaw = 0.0001; view.camera.pitch = 1.5; }
        view.options.grid = !S.heightmap; view.options.shadows = !S.heightmap;
        show(comp, shownStages());
        if (S.heightmap) fitHouse(comp);
        else if (savedCam) { Object.assign(view.camera, savedCam); savedCam = null; view.request(); }
        else { view.camera.yaw = camYaw(comp.T); view.camera.pitch = 0.34; fitHouse(comp); }
        OS.osd(S.heightmap ? 'heightmap: black low, white high' : 'heightmap off');
      }
      function toggleMarks() {
        S.marks = !S.marks; mkBtn.classList.toggle('on', S.marks);
        refresh();
      }

      // ---------- demolish: faces fall and settle ----------
      function demolish() {
        if (S.running) { OS.osd('Not during a run.'); return; }
        if (S.demo) { refresh(); return; }
        if (S.heightmap) toggleHeightmap();
        if (S.anim) { for (const f of S.anim.faces) { f.pts = f._base; f.alpha = f._alpha; } S.anim = null; }
        const faces = view.faces();
        const house = faces.filter((f) => f.hb);
        if (!house.length) { OS.osd('Nothing to demolish yet.'); return; }
        const rnd = OS.rng(`composer|demolish|${(S.shown || S.comp).T.id}`);
        const comp = S.shown || S.comp;
        const cx = comp.M.xc; const cz = comp.M.zc;
        const debris = house.map((f) => {
          const c = f.pts.reduce((a, p) => [a[0] + p[0] / f.pts.length, a[1] + p[1] / f.pts.length, a[2] + p[2] / f.pts.length], [0, 0, 0]);
          const out = [c[0] - cx, 0, c[2] - cz]; const l = Math.hypot(out[0], out[2]) || 1;
          const sp = 0.4 + rnd() * 1.6;
          const ax = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]; const al = Math.hypot(...ax) || 1;
          return { f, c0: c, rel: f.pts.map((p) => vsub(p, c)), n0: f.n ? f.n.slice() : [0, 1, 0], pos: c.slice(), vel: [(out[0] / l) * sp, rnd() * 1.2, (out[2] / l) * sp], ax: ax.map((v) => v / al), w: (rnd() - 0.5) * 7, ang: 0, delay: (1 - c[1] / 12) * 0.25 + rnd() * 0.35, state: 0, flat: 0 };
        });
        for (const d of debris) { d.f.double = true; d.f.glow = undefined; }
        S.demo = { debris, t: 0, settled: 0 };
        view.set(faces.filter((f) => !f.hb).concat(house), { lines: [], labels: [] });
        caption(capT.textContent, 'Demolishing. No planning permission is needed for this part.');
        log(`demolish: ${house.length} faces fall and settle`, 'warn');
        S.phase = 'demolishing';
      }
      const rot = (v, ax, a) => {
        const c = Math.cos(a); const s = Math.sin(a); const d = vdot(ax, v);
        const cr = [ax[1] * v[2] - ax[2] * v[1], ax[2] * v[0] - ax[0] * v[2], ax[0] * v[1] - ax[1] * v[0]];
        return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)];
      };
      function tickDemolish(dtMs) {
        const D = S.demo; const dt = Math.min(0.05, dtMs / 1000); D.t += dt;
        let moving = 0;
        for (const d of D.debris) {
          if (d.state === 2) continue;
          if (D.t < d.delay) { moving += 1; continue; }
          moving += 1;
          if (d.state === 0) {
            d.vel[1] -= 9.8 * dt;
            d.pos = [d.pos[0] + d.vel[0] * dt, d.pos[1] + d.vel[1] * dt, d.pos[2] + d.vel[2] * dt];
            d.ang += d.w * dt;
            let pts = d.rel.map((p) => { const q = rot(p, d.ax, d.ang); return [q[0] + d.pos[0], q[1] + d.pos[1], q[2] + d.pos[2]]; });
            const low = Math.min(...pts.map((p) => p[1]));
            if (low < 0) {
              d.pos[1] -= low; pts = pts.map((p) => [p[0], p[1] - low, p[2]]);
              if (d.vel[1] < -2.5 && !d.bounced) { d.vel = [d.vel[0] * 0.45, -d.vel[1] * 0.22, d.vel[2] * 0.45]; d.w *= 0.4; d.bounced = true; }
              else { d.state = 1; d.from = pts; }
            }
            d.f.pts = pts; d.f.n = rot(d.n0, d.ax, d.ang);
          } else {
            d.flat = Math.min(1, d.flat + dt * 3.5);
            const e = d.flat * d.flat * (3 - 2 * d.flat);
            d.f.pts = d.from.map((p, i) => [p[0], p[1] * (1 - e) + (0.02 + (i % 3) * 0.004) * e, p[2]]);
            d.f.n = [d.f.n[0] * (1 - e), (d.f.n[1] * (1 - e)) + e, d.f.n[2] * (1 - e)];
            if (d.flat >= 1) { d.state = 2; D.settled += 1; }
          }
        }
        if (moving) view.request();
        if (!moving && S.phase === 'demolishing') {
          S.phase = 'demolished';
          caption(capT.textContent, `Demolished. ${D.debris.length} faces settled. Run or click Demolish to put it back.`);
          log(`demolished: ${D.debris.length} faces settled. Nothing was benchmarked.`, 'muted');
        }
      }
      function stopDemolish() {
        if (!S.demo) return;
        S.demo = null;
        if (S.phase === 'demolishing' || S.phase === 'demolished') S.phase = S.bench ? 'done' : 'idle';
        caption(capT.dataset.base || capT.textContent, capS.dataset.base || '');
      }

      // ---------- write-up ----------
      function writeUp() {
        if (S.running) { OS.osd('Not during a run.'); return; }
        const res = Note.conclude();
        if (!res.ok) { OS.osd('Nothing to write up'); log(res.message, 'warn'); return; }
        log(`H-${res.from.n} concluded: ${res.finding}. ${res.text}`, res.finding === 'negative' ? 'bad' : res.finding === 'positive' ? 'ok' : 'muted');
        if (res.path) log(`wrote ${res.path.replace(OS.fs.home, '~')}`, 'faint');
        log(`H-${res.to.n} is open: ${res.to.hyp}`, 'accent');
        sysLog(`[${OS.now().toISOString()}] composer_benchmark:conclude H-${res.from.n} (${res.finding}); opened H-${res.to.n}`);
        paintNote();
        const sheet = h('div', { class: 'composer-sheet' });
        const close = () => sheet.remove();
        sheet.append(h('div', { class: 'composer-doc', role: 'dialog' },
          h('div', { class: 'k' }, 'composer_benchmark:conclude'),
          h('h3', null, `H-${res.from.n}: ${res.from.hyp}`),
          h('div', { class: 'row', style: { justifyContent: 'flex-start', marginTop: '6px' } }, h('span', { class: `ui-tag ${res.finding === 'negative' ? 'bad' : res.finding === 'positive' ? 'good' : 'warn'}` }, res.finding), h('span', { class: 'ui-muted', style: { fontSize: '11px' } }, `${OS.usd(res.from.spent)} of ${OS.usd(CAP)} · ${plural(res.from.runs.length, 'run')}`)),
          h('p', null, res.text),
          h('div', { class: 'ui-title' }, 'Runs'),
          h('ul', null, res.from.runs.slice(-6).map((r) => h('li', null, `house ${r.house} · ${r.what} · ${r.headline} · ${OS.usd(r.usd)}${r.by ? ` · ${r.by}` : ''}`))),
          h('div', { class: 'ui-title' }, 'Follow-on notes'),
          h('ul', null, res.follow.map((f) => h('li', null, f))),
          res.path ? h('div', { class: 'k' }, `Written to ${res.path.replace(OS.fs.home, '~')}`) : null,
          h('div', { class: 'row' }, h('button', { class: 'ui-btn primary', onclick: close }, `Open H-${res.to.n}`))));
        root.append(sheet);
        S.phase = S.bench ? 'done' : 'idle';
        S.writeups = (S.writeups || 0) + 1;
        OS.notify({ app: 'composer', icon: 'files-outline', title: `H-${res.from.n} concluded: ${res.finding}`, body: `Follow-on note H-${res.to.n} is open. $0.00 of $10.00 spent.` });
      }

      // ---------- wiring ----------
      const offs = [
        OS.on('composer:note', () => { if (!win.closed) paintNote(); }),
        OS.on('spend', () => { if (!win.closed) paintNote(); }),
        OS.on('theme', () => { if (win.closed) return; if (S.demo) view.request(); else show(S.shown || S.comp, shownStages()); }),
      ];
      S.offs = offs;
      S.relayout = () => {
        const ww = win.width; const hh = win.height;
        S.size = ww >= 1180 && hh >= 700 ? 'L' : hh >= 560 ? 'M' : 'S';
        root.classList.toggle('is-narrow', S.size === 'M');
        root.classList.toggle('is-tiny', S.size === 'S');
        layoutGraph(); view.request();
      };
      S.key = (e) => {
        if (win.el.querySelector('.ui-crash, .composer-sheet')) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'r') { S.running ? stop() : run(); e.preventDefault(); }
        else if (k === 'h') toggleHeightmap();
        else if (k === 'd') demolish();
        else if (k === 'f') fitHouse();
        else if (k === 'm') toggleMarks();
        else if (k === 'i') setMode(S.mode === 'iso' ? 'e2e' : 'iso');
        else if (k === 'escape') { if (pop) closePicker(); else if (S.selected) selectNode(S.selected); }
        else if (['1', '2', '3', '4'].includes(k)) loadHouse(String(DATA.goldHouses[Number(k) - 1]));
      };
      S.api = {
        run, stop, loadHouse, setApproach, resetMain, setMode, selectNode, toggleHeightmap, toggleMarks, demolish, writeUp, openPicker, closePicker, focusDefect,
        cam: (yaw, pitch) => cam(yaw, pitch), compose, benchmark, faces: () => view.faces().length,
      };

      S.relayout();
      log('Composer: 22 stages, page codes P1 to M4. Drag the model to orbit. Click a node to see the model at that stage; click its approach to change it.', 'faint');
      const start = typeof arg === 'string' ? arg : arg && (arg.house || arg.input);
      if (!loadHouse(start || '158', false)) loadHouse('158', true);
      paintNote();
      if (arg && arg.run) win.after(200, () => run());
    },
    onArg(win, arg) {
      const S = win.state;
      const house = typeof arg === 'string' ? arg : arg && (arg.house || arg.input);
      if (house && house !== S.input && !S.api.loadHouse(house)) return;
      if (arg && arg.run) S.api.run();
    },
    onKey(win, e) { win.state.key?.(e); },
    onResize(win) { win.state.relayout?.(); },
    unmount(win) {
      const S = win.state;
      S.abort = true;
      for (const off of S.offs || []) off();
      S.view?.dispose();
    },
  });

  // ---------- bin/composer ----------
  function parseRunArgs(args) {
    const words = []; const A = {}; let stages = 'all'; const errors = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--stages') { stages = args[i + 1] || ''; i += 1; continue; }
      if (a.startsWith('--stages=')) { stages = a.slice(9); continue; }
      const m = a.match(/^approach=(.*)$/i);
      if (m) {
        const parts = m[1].split(',').filter(Boolean);
        if (!parts.length) errors.push('APPROACH takes stage:name, e.g. APPROACH=massing:door_fit_1');
        for (const part of parts) {
          const [st, ap] = part.split(':');
          if (!st || !ap) { errors.push('APPROACH takes stage:name, e.g. APPROACH=massing:door_fit_1'); continue; }
          if (!BY[st]) { errors.push(`unknown stage '${st}'. Try: composer stages`); continue; }
          const list = approachList(st);
          const want = ap === 'before_cap' ? STORED : ap;
          if (!list.includes(want)) { errors.push(`${st} has no approach '${ap}'. It has: ${list.map(apText).join(', ')}`); continue; }
          A[st] = want;
        }
        continue;
      }
      if (a.startsWith('--')) { errors.push(`unknown flag ${a}`); continue; }
      words.push(a);
    }
    let keys = KEYS;
    if (stages !== 'all') {
      const want = stages.split(',').map((s) => s.trim()).filter(Boolean).map((s) => KEYS.find((k) => k === s || BY[k].code.toLowerCase() === s.toLowerCase()) || s);
      const bad = want.filter((s) => !BY[s]);
      if (bad.length || !want.length) errors.push(`--stages takes 'all' or stage keys or page codes, comma-separated. Not: ${bad.join(', ') || '(nothing)'}`);
      keys = KEYS.filter((k) => want.includes(k));
    }
    return { house: words.join(' '), A, keys, errors };
  }
  const pad = (s, n) => String(s).padEnd(n).slice(0, Math.max(n, 0));
  const cut = (s, n) => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s);

  async function cmdRun(args, io) {
    const p = parseRunArgs(args);
    if (p.errors.length) { for (const e of p.errors) io.println(`composer: ${e}`, 'bad'); return 2; }
    if (!p.house) { io.println('usage: composer run <house> [--stages all] [APPROACH=stage:name]', 'warn'); io.println('  e.g. composer run 158 APPROACH=massing:default', 'muted'); return 2; }
    if (isHeldOut(p.house)) { io.println(`House ${houseKey(p.house).label} is held out. Held-out houses are never shown to tuning.`, 'bad'); return 1; }
    const keys = p.keys; const iso = keys.length < KEYS.length;
    const idle = Object.keys(p.A).filter((k) => !keys.includes(k));
    if (iso && idle.length) { io.println(`composer: APPROACH=${idle[0]}:${apText(p.A[idle[0]])} sets a stage this run does not run. With --stages, upstream outputs come from the latest main run.`, 'bad'); return 2; }
    const A = { ...MAIN, ...p.A };
    const comp = compose(p.house, A);
    const main = compose(p.house, MAIN);
    const T = comp.T;
    const pre = preflight(comp, keys);
    const v0 = Note.get();
    io.println(`composer · ${T.kind === 'id' ? `house ${T.label}` : `"${T.label}"`} (${goldWord(T)}) · ${describe(T)}`, 'accent');
    io.println(`${iso ? `${plural(keys.length, 'stage')} isolated, upstream from the latest main run` : `${STAGES.length} stages`} · ${Object.keys(p.A).length ? Object.entries(p.A).map(([k, a]) => `${k}: ${apText(a)}`).join(', ') : 'all main'} · est. ${OS.usd(pre.est)} · H-${v0.n} ${OS.usd(v0.spent)} of ${OS.usd(CAP)}`, 'muted');
    if (!pre.ok) { io.println(pre.message, 'bad'); return 1; }
    const width = Math.max(10, Math.min(24, (io.cols || 100) - 70));
    let line = null;
    const res = await execute(comp, keys, {
      step: 90,
      sleep: (ms) => io.sleep(ms),
      aborted: () => io.aborted,
      start: (k) => { line = io.println(`${logHead(comp, k)} ▕${'░'.repeat(width)}▏`, 'muted'); },
      tick: (k, frac, o) => { const n = Math.round(frac * width); line?.set(`${logHead(comp, k)} ▕${'█'.repeat(n)}${'░'.repeat(width - n)}▏ ${f1(o.secs * frac)} s`, 'muted'); },
      done: (k) => { line?.set(logLine(comp, k)); },
    });
    if (res.aborted) { io.println(`stopped at ${BY[res.at].code} ${res.at}. Charged so far: ${OS.usd(res.usd)}. Nothing was benchmarked.`, 'warn'); return 130; }
    if (res.refused) { io.println(res.message, 'bad'); return 1; }
    const b = benchmark(comp, main, keys);
    io.println('');
    io.println(`benchmark against gold (${goldWord(T)})`, 'bold');
    const rows = b.rows.filter((r) => r.run !== r.main || r.run === false || r.changed);
    if (rows.length) {
      io.println(`  ${pad('stage', 22)} ${pad('approach', 26)} main  run`, 'muted');
      for (const r of rows) {
        const reg = r.main === true && r.run === false; const imp = r.main === false && r.run === true;
        const mk = (x) => (x === true ? '✓' : x === false ? '✗' : '–');
        io.println(`  ${pad(`${r.code} ${r.key}`, 22)} ${pad(cut(apText(r.ap), 26), 26)} ${pad(mk(r.main), 5)} ${mk(r.run)}${reg ? `  regression: ${r.defect ? r.defect.replace(/^[A-Z]\d+: /, '') : ''}` : imp ? '  improvement' : r.run === false ? '  (main too)' : ''}`, reg ? 'bad' : imp ? 'ok' : undefined);
      }
    }
    io.println(`${b.pass} ✓ · ${b.fail} ✗ · ${b.none} not scored${iso ? '' : ` · composed model ${f1(b.score)}/10 against the photos (main ${f1(b.mainScore)}/10)`}`, 'muted');
    io.println(b.headline, b.ok ? 'ok' : 'bad');
    const changed = KEYS.filter((k) => A[k] !== MAIN[k]);
    const what = iso ? `${keys.map((k) => `${k}: ${apText(A[k])}`).join(', ')} (isolated)` : (changed.map((k) => `${k}: ${apText(A[k])}`).join(', ') || 'all main');
    const recorded = Note.addRun({ house: T.label, what, headline: b.headline, regress: b.regress.length, improve: b.improve.length, ...scoreFields(b), usd: res.usd }, v0.n);
    if (!recorded) io.println(`H-${v0.n} was written up during this run, so the run is not recorded in the new note.`, 'warn');
    const v = Note.get();
    io.println(`spent ${OS.usd(res.usd)} · H-${v.n} ${OS.usd(v.spent)} of ${OS.usd(CAP)} · today ${OS.usd(OS.spend.today())} of ${OS.usd(OS.spend.cap)}`, 'muted');
    sysLog(`[${OS.now().toISOString()}] bin/composer run ${T.label}: ${b.headline} · ${OS.usd(res.usd)}`);
    return b.ok ? 0 : 1;
  }
  function cmdStages(io) {
    const cols = io.cols || 100;
    io.println(` #  code  ${pad('stage', 16)} ${pad('label', 16)} kind      ${pad('main approach', 20)} needs`, 'muted');
    STAGES.forEach((s, i) => {
      const head = `${String(i + 1).padStart(2)}  ${pad(s.code, 5)} ${pad(s.key, 16)} ${pad(s.label, 16)} ${pad(s.llm ? 'model' : 'geometry', 9)} ${pad(MAIN[s.key], 20)} `;
      io.println(head + cut(s.needs.join(', ') || '-', Math.max(8, cols - head.length - 1)));
    });
    io.println(`${STAGES.length} stages. Display numbers come from position: add a stage and every later number moves.`, 'faint');
    return 0;
  }
  function cmdApproaches(which, io) {
    const key = which && (BY[which] ? which : KEYS.find((k) => BY[k].code.toLowerCase() === which.toLowerCase() || String(BY[k].i + 1) === which));
    if (!key) { io.println(which ? `composer: no stage '${which}'. Try: composer stages` : 'usage: composer approaches <stage>', 'bad'); return 2; }
    const s = BY[key];
    io.println(`${s.code} ${key} · ${s.label} · ${s.llm ? 'model calls, charged' : 'geometry, free'} · needs ${s.needs.join(', ') || 'nothing'}`, 'accent');
    for (const a of approachList(key)) {
      io.println(`${a === MAIN[key] ? '*' : ' '} ${pad(a === STORED ? 'before_cap' : a, 44)} ${(NOTES[key] || {})[a] || ''}`, a === MAIN[key] ? 'ok' : undefined);
    }
    io.println(`* is main. Use APPROACH=${key}:<name>. Once an approach is on main its output never changes.`, 'faint');
    return 0;
  }
  function cmdGold(io) {
    const wide = (io.cols || 100) >= 112;
    io.println(`${pad('id', 5)} ${pad('type', 14)} ${pad('storeys', 15)} ${pad('roof', 13)} ${pad('walls', 22)}${wide ? ' address' : ''}`, 'muted');
    for (const g of DATA.goldHouses) {
      const T = truth(String(g));
      io.println(`${pad(g, 5)} ${pad(TYPE_WORD[T.type], 14)} ${pad(T.storeyList, 15)} ${pad(roofWord(T), 13)} ${pad(T.wall[0].toLowerCase(), 22)}${wide ? ` ${T.address} (invented)` : ''}`);
    }
    io.println(`Reliable: ${DATA.goldHouses.join(', ')}. Held out, never shown to tuning: ${HELD_OUT.join(', ')}.`, 'faint');
    io.println('Gold is never edited, only overridden. "Can\'t tell" becomes unknown. A gap in a gable line is valid.', 'faint');
    return 0;
  }
  function cmdConclude(io) {
    const res = Note.conclude();
    if (!res.ok) { io.println(res.message, 'warn'); return 1; }
    io.println(`H-${res.from.n}: ${res.from.hyp}`, 'accent');
    io.println(`concluded · ${res.finding} · ${OS.usd(res.from.spent)} of ${OS.usd(CAP)} over ${plural(res.from.runs.length, 'run')}`, res.finding === 'negative' ? 'bad' : res.finding === 'positive' ? 'ok' : 'warn');
    io.println(res.text);
    for (const f of res.follow) io.println(`  follow-on ${f}`, 'muted');
    if (res.path) io.println(`wrote ${res.path.replace(OS.fs.home, '~')}`, 'faint');
    io.println(`H-${res.to.n} is open.`, 'ok');
    return 0;
  }
  function usage(io) {
    io.println('bin/composer: run the Composer pipeline (22 stages, page codes P1 to M4)', 'accent');
    io.println('  composer run <house> [--stages all|key,...] [APPROACH=stage:name]   compose and benchmark');
    io.println('  composer stages                    the stages, with page codes and main approaches');
    io.println('  composer approaches <stage>        what each approach does');
    io.println('  composer gold                      the reliable gold houses');
    io.println('  composer conclude                  write up the current note (composer_benchmark:conclude)');
    io.println('A house is a gold id (158, 152, 135, 178), any number, or any invented address.', 'faint');
  }
  OS.commands.register('bin/composer', {
    desc: 'Run the Composer pipeline and benchmark it against gold',
    usage: 'bin/composer run <house> [--stages all] [APPROACH=stage:name] | stages | approaches <stage> | gold | conclude',
    async run(args, io) {
      const sub = args[0];
      if (!sub) { usage(io); return 2; }
      if (sub === 'help' || sub === '--help' || sub === '-h') { usage(io); return 0; }
      if (sub === 'run') return cmdRun(args.slice(1), io);
      if (sub === 'stages') return cmdStages(io);
      if (sub === 'approaches') return cmdApproaches(args[1], io);
      if (sub === 'gold') return cmdGold(io);
      if (sub === 'conclude') return cmdConclude(io);
      io.println(`composer: unknown command '${sub}'. Try: composer help`, 'bad');
      return 2;
    },
    complete(args) {
      if (args.length <= 1) return ['run', 'stages', 'approaches', 'gold', 'conclude', 'help'];
      if (args[0] === 'approaches') return KEYS.slice();
      if (args[0] === 'run') return [...DATA.goldHouses.map(String), '--stages', ...KEYS.map((k) => `APPROACH=${k}:`)];
      return [];
    },
  });
  OS.commands.alias('composer', 'bin/composer');
  OS.fs.seed({
    [`${NOTE_DIR}/H-11.md`]: '# H-11: own_drawing_1 stops neighbouring drawings joining outlines\n\nStatus: concluded · inconclusive\nSpent: $9.80 of $10.00 over 4 runs\n\n## Finding\n\nNot worse than main. The composed model scored 5.0/10, as main does.\n\n## Follow-on notes\n\n- H-12: luna_storeycount_3 reads floors better than luna_storeycount_1\n',
  });
})();
