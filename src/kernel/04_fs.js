// A small in-memory POSIX-ish filesystem. Writes persist to localStorage as an overlay.
(() => {
  const HOME = '/home/researcher';
  const now = () => OS.now().getTime();
  const mkdirNode = () => ({ type: 'dir', kids: new Map(), mtime: now() });
  const mkfileNode = (content) => ({ type: 'file', content, mtime: now() });
  const root = mkdirNode();
  let overlay = OS.store.get('fs', {});
  const PROTECTED = {
    '/': 'rm: refusing to remove \'/\'. Bricky is standing on it.',
    [HOME]: 'rm: refusing to remove your own home. You would have nowhere to extend.',
    '/gold': 'rm: /gold is gold. Gold is never edited, only overridden.',
    '/gold/houses': 'rm: the reliable four (158, 152, 135, 178) cannot be removed. They are the reliable four.',
  };

  const err = (code, msg) => { const e = new Error(msg); e.code = code; return e; };

  function resolve(cwd, p) {
    if (p == null || p === '') return cwd || HOME;
    if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
    else if (!p.startsWith('/')) p = (cwd || HOME) + '/' + p;
    const out = [];
    for (const part of p.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop(); else out.push(part);
    }
    return '/' + out.join('/');
  }
  const parts = (p) => resolve('/', p).split('/').filter(Boolean);
  const dirname = (p) => { const a = parts(p); a.pop(); return '/' + a.join('/'); };
  const basename = (p) => parts(p).pop() || '/';

  function node(p) {
    let n = root;
    for (const part of parts(p)) {
      if (n.type !== 'dir') return null;
      n = n.kids.get(part);
      if (!n) return null;
    }
    return n;
  }

  function ensureDir(p) {
    let n = root;
    for (const part of parts(p)) {
      let k = n.kids.get(part);
      if (!k) { k = mkdirNode(); n.kids.set(part, k); }
      if (k.type !== 'dir') throw err('ENOTDIR', `${p}: Not a directory`);
      n = k;
    }
    return n;
  }

  function save() { OS.store.set('fs', overlay); }

  const fs = {
    home: HOME,
    resolve,
    dirname,
    basename,
    stat: (p) => node(p),
    exists: (p) => !!node(p),
    isDir: (p) => node(p)?.type === 'dir',
    isFile: (p) => node(p)?.type === 'file',
    read(p) {
      const n = node(p);
      if (!n) throw err('ENOENT', `${p}: No such file or directory`);
      if (n.type === 'dir') throw err('EISDIR', `${p}: Is a directory`);
      return typeof n.content === 'function' ? String(n.content()) : n.content;
    },
    write(p, content, { persist = true } = {}) {
      p = resolve('/', p);
      if (p === '/gold' || p.startsWith('/gold/')) throw err('EPERM', `${p}: Read-only file system. Gold is never edited, only overridden.`);
      const parent = node(dirname(p));
      if (!parent || parent.type !== 'dir') throw err('ENOENT', `${dirname(p)}: No such file or directory`);
      const existing = parent.kids.get(basename(p));
      if (existing?.type === 'dir') throw err('EISDIR', `${p}: Is a directory`);
      parent.kids.set(basename(p), mkfileNode(String(content)));
      if (persist) { overlay[p] = String(content); save(); }
      OS.emit('fs', { path: p, op: 'write' });
    },
    mkdir(p, { parents = false, persist = true } = {}) {
      p = resolve('/', p);
      if (p.startsWith('/gold/')) throw err('EPERM', `${p}: Read-only file system. Gold is never edited, only overridden.`);
      if (node(p)) { if (parents) return; throw err('EEXIST', `${p}: File exists`); }
      if (!parents && !fs.isDir(dirname(p))) throw err('ENOENT', `${dirname(p)}: No such file or directory`);
      ensureDir(p);
      if (persist) { overlay[p + '/'] = ''; save(); }
    },
    rm(p, { recursive = false, persist = true } = {}) {
      p = resolve('/', p);
      if (PROTECTED[p]) throw err('EPERM', PROTECTED[p]);
      const n = node(p);
      if (!n) throw err('ENOENT', `${p}: No such file or directory`);
      if (n.type === 'dir' && !recursive) throw err('EISDIR', `${p}: Is a directory`);
      node(dirname(p)).kids.delete(basename(p));
      if (persist) {
        for (const k of Object.keys(overlay)) if (k === p || k.startsWith(p + '/')) delete overlay[k];
        overlay[p] = null; save();
      }
      OS.emit('fs', { path: p, op: 'rm' });
    },
    ls(p) {
      const n = node(p);
      if (!n) throw err('ENOENT', `${p}: No such file or directory`);
      if (n.type === 'file') return [{ name: basename(p), type: 'file', size: fs.read(p).length, mtime: n.mtime }];
      return [...n.kids.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, k]) => ({
        name, type: k.type, mtime: k.mtime,
        size: k.type === 'file' ? (typeof k.content === 'function' ? 0 : k.content.length) : k.kids.size,
      }));
    },
    // Every path under p (depth first), p excluded.
    walk(p) {
      const out = [];
      const go = (dir, path) => {
        for (const [name, k] of [...dir.kids.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          const full = (path === '/' ? '' : path) + '/' + name;
          out.push(full);
          if (k.type === 'dir') go(k, full);
        }
      };
      const n = node(p);
      if (n?.type === 'dir') go(n, resolve('/', p));
      return out;
    },
    // Add files without persisting them: {'/abs/path': 'text' | () => 'text', '/abs/dir/': ''}
    seed(map) {
      for (const [p, content] of Object.entries(map)) {
        if (p.endsWith('/')) { ensureDir(p); continue; }
        ensureDir(dirname(p)).kids.set(basename(p), mkfileNode(content));
      }
    },
    // Throw away every saved change.
    reset() { overlay = {}; save(); },
  };

  // Base seed. Apps add their own with OS.fs.seed().
  const L = `${HOME}/labs`;
  const D = OS.data;
  const seed = {
    '/etc/os-release': [
      'NAME="Labs OS"', 'VERSION="2.0 (Composed)"', 'ID=labs', 'ID_LIKE=optimism',
      'PRETTY_NAME="Labs OS 2.0 (Composed)"', 'VERSION_CODENAME=composed',
      'HOME_URL="the admin sidebar, bottom of the Tools section"',
      'SUPPORT_URL="ask Bricky"', 'BUG_REPORT_URL="not a bug until correct inputs give a wrong output"',
      'PREVIOUS_VERSION="3.1 (Evaluation). Version numbers are display numbers. They renumber."', '',
    ].join('\n'),
    '/etc/motd': 'Welcome to Labs OS 2.0 (Composed).\nThe daily spend cap is $100.00 (UTC). The note cap is $10.00.\nRun `help` for commands. Run `brickfetch` to feel something.\n',
    '/etc/hostname': 'labs\n',
    '/etc/brickland/brickland.conf': [
      '# brickland.conf: the compositor. SUPER is Alt (Option on a Mac). Browsers keep the real Super key.',
      'general {', '  gaps_in = 6', '  gaps_out = 10', '  border_size = 2', '  col.active_border = $accent $accent2 135deg',
      '  layout = dwindle   # dwindle | master | monocle', '}', '',
      'bind = SUPER, SPACE, exec, surveyor            # app launcher', 'bind = SUPER, RETURN, exec, brickty            # terminal',
      'bind = SUPER, W, killactive', 'bind = SUPER, F, fullscreen', 'bind = SUPER, T, togglefloating',
      'bind = SUPER, M, cyclelayout', 'bind = SUPER, 1..9, workspace, 1..9', 'bind = SUPER SHIFT, 1..9, movetoworkspace, 1..9',
      'bind = SUPER, H/J/K/L or arrows, movefocus', 'bind = SUPER SHIFT, H/J/K/L or arrows, swapwindow',
      'bind = SUPER SHIFT, SPACE, exec, labs-menu', 'bind = SUPER, ESCAPE, exec, deadlock', 'bind = SUPER, SLASH, exec, keybindings',
      'bind = SUPER SHIFT, T, exec, theme-next', 'bind = SUPER SHIFT, W, exec, wallpaper-next', 'bind = SUPER, B, exec, bricky-say',
      'bind = CTRL, K, exec, surveyor   # the admin command palette, as seen in a real commit', '',
    ].join('\n'),
    '/proc/cpuinfo': 'processor\t: 0\nmodel name\t: Painter\'s Algorithm (software, single core, sorts by centroid)\ncpu MHz\t\t: 63.000\nflags\t\t: gold held_out not_worse_than_main craft_cleanup\nbogomips\t: 0.5 (on a 0.5 m grid)\n',
    '/proc/meminfo': () => `MemTotal:       1000000 tokens\nMemFree:         ${Math.floor(1e6 - (performance.now() % 812000))} tokens\nContextWindow:   compacting soon\nUnsavedWork:     yes\n`,
    '/proc/uptime': () => `${(performance.now() / 1000).toFixed(2)} seconds since the last design review\n`,
    '/gold/README': 'Gold answers, written by people, checked by people, overridden by people.\nUse houses 158, 152, 135 and 178 for examples. They are reliable. The others are learning.\n',
    '/var/log/brickland.log': () => `[${OS.now().toISOString()}] brickland: ${document.querySelectorAll('.win').length} window(s) tiled, 0 apologised for\n`,
    '/var/log/composer.log': '',
    [`${HOME}/.bashrc`]: 'export EDITOR=labvim\nexport SUPER=Alt\nalias please=sudo\nalias ship="echo \'not worse than main\'"\n# Do not alias rm. Bricky reads this file.\n',
    [`${HOME}/README.md`]: [
      '# Labs OS 2.0 (Composed)', '',
      'A tiling desktop for people who compose houses in twenty-two stages.', '',
      '- SUPER is Alt (Option on a Mac).', '- SUPER+SPACE opens the launcher. SUPER+RETURN opens a terminal.',
      '- SUPER+/ shows every key binding.', '- SUPER+SHIFT+SPACE opens the Labs menu (themes, wallpapers, lock, shut down).', '',
      'The daily spend cap is $100.00 (UTC). Everything that thinks costs money. Everything thinks.', '',
    ].join('\n'),
    [`${HOME}/notes/todo.md`]: '- [ ] design review round 6\n- [ ] design review round 7 (revert round 6)\n- [x] craft cleanup\n- [x] craft cleanup\n- [ ] work out what "load-bearing" meant in that PR\n',
    [`${HOME}/Pictures/`]: '',
    [`${L}/README.md`]: '# labs\n\nRails 8 multi-tenant platform. Researchers explore extension potential via co-branded partner sites.\nAlso, now, a 22-stage house composer and a configurator that has had five design reviews.\n',
    [`${L}/AGENTS.md`]: [
      '# Labs - Extension Potential Platform', '',
      '## Engineering Principles', '',
      '1. Think before coding.', '2. Simplicity first.', '3. Surgical changes.', '4. Goal-driven execution.',
      '5. Propose, then proceed.', '6. Comments are a last resort.', '',
      '## Test Strategy for agents', '',
      'Do NOT run the full test suite unnecessarily. It slows down development.', '',
    ].join('\n'),
    [`${L}/Gemfile`]: "source 'https://rubygems.org'\ngem 'rails', '~> 8.1'\ngem 'view_component'\ngem 'acts_as_tenant' # never bypass it\n",
    [`${L}/db/schema.rb`]: () => 'ActiveRecord::Schema[8.1].define(version: 2026_11_13_000000) do\n  # 4,812 lines. Every new workspace shows unrelated changes to this file.\n  # (That was fixed. It is still a joke.)\nend\n',
    [`${L}/bin/dev`]: '#!/usr/bin/env sh\n# Starts Rails, Vite and the property builder watcher. Use tenant.localhost:3000.\nexec foreman start -f Procfile.dev "$@"\n',
    [`${L}/bin/rspec_all`]: '#!/usr/bin/env sh\n# The full parallel suite. Only before opening a PR. Splits the browser specs out.\n',
    [`${L}/bin/composer`]: '#!/usr/bin/env ruby\n# Runs the Composer pipeline locally. Try `bin/composer run 158`.\n',
    [`${L}/config/composer_benchmark/stages.yml`]: '# Composer Benchmark run stages, in running order. Display numbers come from the position.\n' +
      D.stages.map((s) => `- key: ${s.key}\n  label: ${s.label}\n` + (s.needs.length ? `  needs: [${s.needs.join(', ')}]\n` : '') + (s.llm ? '  llm: true\n' : '') + `  page_code: ${s.code}`).join('\n') + '\n',
    [`${L}/agent_docs/composer-pipeline-nodes.md`]: '# Composer pipeline nodes\n\nApproach names: <model or method>_<inputs>_<number>.\nOnce an approach is on main its output never changes. A different prompt is a new numbered file.\nNever rename one, since stored runs record them.\n',
    [`${L}/agent_docs/composer-benchmark-experiments.md`]: '# Composer Benchmark experiments\n\n## Spend ledger and caps\n\nA note may spend $10.00. A day may spend $100.00 (UTC).\n"Today\'s experiment spend is $98.10 of the $100.00 daily cap (UTC). Conclude your current experiment and stop until tomorrow."\n',
    [`${L}/agent_docs/heightmaps.md`]: '# Heightmaps\n\nEvery height diagram is greyscale. Black is the eaves, the lowest. White is the ridge, the highest.\nThere are no exceptions. There was one exception. It was a bug.\n',
    [`${L}/app/frontend/components/configurator/categories.ts`]: '// The cost engine prices by area alone. No width or depth exists anywhere in the payload,\n// so the m x m readout is a display convention, not a quoted spec.\nexport const DISPLAY_WIDTH_M = 3\n',
    [`${L}/docs/plans/`]: '',
    [`${L}/node_modules/README`]: '1,284 packages. 3 of them do something you would recognise.\n',
    [`${L}/.gitignore`]: '/node_modules\n/tmp\n/log\n.env\n',
  };
  for (const s of D.stages) {
    const dir = `${L}/app/services/composer/pipeline/nodes/${s.key}`;
    seed[`${dir}/node.rb`] = `module Composer::Pipeline::Nodes\n  class ${s.key.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('')}\n    STAGE = "${s.key}"\n    REQUIRED_READS = [${s.needs.map((n) => `"${n}"`).join(', ')}]\n  end\nend\n`;
    for (const a of s.approaches) {
      const cls = a.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
      seed[`${dir}/${a}.rb`] = a === 'default' && s.def !== 'default'
        ? `# The default is an alias. It was a different file last week.\nDefault = ${s.def.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('')}\n`
        : `class ${cls} < Composer::Pipeline::Approach\n  # Once this is on main its output never changes.\n  # To change it, copy it to a new numbered file. Never rename it.\n  def call(input)\n    ${s.llm ? 'ask_a_model(input) # costs money' : 'geometry(input) # costs nothing, takes longer'}\n  end\nend\n`;
    }
  }
  for (const id of D.goldHouses) {
    seed[`/gold/houses/${id}/answers.yml`] = `house: ${id}\nreliable: true\nstoreys: [0, 1]   # ground = 0, first = 1, lower ground = -1\nwall_finish: brick\nnotes: "a gap in a gable line is not an error"\n`;
  }
  fs.seed(seed);

  // Replay saved writes and deletes on top of the seed.
  for (const [p, content] of Object.entries(overlay)) {
    try {
      if (content === null) { if (node(p)) node(dirname(p)).kids.delete(basename(p)); }
      else if (p.endsWith('/')) ensureDir(p);
      else { ensureDir(dirname(p)); node(dirname(p)).kids.set(basename(p), mkfileNode(content)); }
    } catch { /* a stale overlay entry; ignore it */ }
  }

  OS.fs = fs;
})();
