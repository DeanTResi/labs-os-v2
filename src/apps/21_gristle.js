// Gristle: the grumpy octopus code reviewer. Real checks on real text, with real line numbers.
(() => {
  const { h, esc } = OS;
  const HOME = OS.fs.home;
  const SRC = '/usr/src/labs-os';
  const PATIENCE = 3;
  const CAP = 3;
  const disp = (p) => (p && p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p);

  // ---------- the page's own source ----------
  // The build puts a "// ---- <file>" line before each source file, so bundle lines map back to file lines.
  const B = (() => {
    const text = document.querySelector('script')?.textContent || '';
    const lines = text.split('\n');
    const files = [];
    lines.forEach((l, i) => { const m = /^\/\/ -{4} (\S+)$/.exec(l); if (m) files.push({ name: m[1], sep: i }); });
    files.forEach((f, k) => { f.end = k + 1 < files.length ? files[k + 1].sep - 1 : lines.length; });
    return { text, lines, files, count: text.endsWith('\n') ? lines.length - 1 : lines.length };
  })();
  function where(i) {
    let lo = 0; let hi = B.files.length - 1; let f = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (B.files[mid].sep <= i) { f = B.files[mid]; lo = mid + 1; } else hi = mid - 1; }
    if (!f || i === f.sep) return { file: 'bundle', line: i + 1 };
    return { file: f.name, line: i - f.sep };
  }
  (() => {
    const seed = {};
    for (const f of B.files) {
      const p = `${SRC}/${f.name}`;
      if (f.name.endsWith('00_assets.js') || OS.fs.exists(p)) continue;
      seed[p] = () => B.lines.slice(f.sep + 1, f.end).join('\n');
    }
    const assets = B.files.find((f) => f.name.endsWith('00_assets.js'));
    const size = assets ? B.lines.slice(assets.sep + 1, assets.end).join('\n').length : 0;
    seed[`${SRC}/README`] = `The source of this page, unpacked from its own script tag. Read-only.\nkernel/00_assets.js is left out: it is ${size.toLocaleString('en-GB')} characters, nearly all on one line, and generated.\n`;
    if (B.files.length) OS.fs.seed(seed);
  })();

  // ---------- lexers: code with strings and comments blanked, plus the comments ----------
  const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
  const CLOSE = { '}': '{', ')': '(', ']': '[' };
  function lexJs(text) {
    const n = text.length; const comments = []; const problems = []; const opens = []; const resume = [];
    let buf = ''; let i = 0; let ln = 0; let prev = null; let depth = 0;
    const ID = /[A-Za-z_$][\w$]*/y; const NUM = /(0[xob][\da-f_]+|\d[\d_]*\.?\d*(e[+-]?\d+)?|\.\d+(e[+-]?\d+)?)n?/iy;
    const blank = (s) => { for (const c of s) { if (c === '\n') { buf += '\n'; ln++; } else buf += ' '; } };
    function tmpl() {
      while (i < n) {
        const c = text[i];
        if (c === '\\') { blank(text.slice(i, i + 2)); i += 2; continue; }
        if (c === '`') { buf += '`'; i++; prev = { t: 'str' }; return; }
        if (c === '$' && text[i + 1] === '{') { buf += '${'; i += 2; resume.push(depth); depth++; opens.push({ ch: '${', line: ln }); prev = { t: 'p', v: '{' }; return; }
        blank(c); i++;
      }
    }
    while (i < n) {
      const c = text[i]; const d = text[i + 1];
      if (c === '\n') { buf += '\n'; ln++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { buf += c === '\t' ? '\t' : ' '; i++; continue; }
      if (c === '/' && d === '/') {
        let j = text.indexOf('\n', i); if (j < 0) j = n;
        comments.push({ line: ln, text: text.slice(i + 2, j) });
        blank(text.slice(i, j)); i = j; continue;
      }
      if (c === '/' && d === '*') {
        let j = text.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
        text.slice(i + 2, Math.max(i + 2, j - 2)).split('\n').forEach((t, k) => comments.push({ line: ln + k, text: t.replace(/^\s*\*?/, '') }));
        blank(text.slice(i, j)); i = j; continue;
      }
      if (c === '"' || c === '\'') {
        let j = i + 1;
        while (j < n && text[j] !== c && text[j] !== '\n') { if (text[j] === '\\') j++; j++; }
        buf += c; blank(text.slice(i + 1, j));
        if (text[j] === c) { buf += c; j++; }
        i = j; prev = { t: 'str' }; continue;
      }
      if (c === '`') { buf += '`'; i++; tmpl(); continue; }
      if (c === '/') {
        const re = !prev || (prev.t === 'p' && !')]}'.includes(prev.v)) || (prev.t === 'id' && REGEX_AFTER.has(prev.v));
        if (re) {
          let j = i + 1; let cls = false; let ok = false;
          while (j < n && text[j] !== '\n') {
            const e = text[j];
            if (e === '\\') { j += 2; continue; }
            if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) { ok = true; break; }
            j++;
          }
          if (ok) {
            j++;
            while (j < n && /[a-z]/i.test(text[j])) j++;
            buf += '/'; blank(text.slice(i + 1, j - 1)); buf += ' ';
            i = j; prev = { t: 're' }; continue;
          }
        }
        buf += '/'; i++; prev = { t: 'p', v: '/' }; continue;
      }
      if (/[A-Za-z_$]/.test(c)) { ID.lastIndex = i; const m = ID.exec(text); buf += m[0]; i += m[0].length; prev = { t: 'id', v: m[0] }; continue; }
      if (/\d/.test(c) || (c === '.' && /\d/.test(d || ''))) { NUM.lastIndex = i; const m = NUM.exec(text); const t = m ? m[0] : c; buf += t; i += t.length; prev = { t: 'num' }; continue; }
      if (c === '{' || c === '(' || c === '[') { opens.push({ ch: c, line: ln }); if (c === '{') depth++; }
      else if (CLOSE[c]) {
        if (c === '}') {
          depth--;
          if (resume.length && depth === resume[resume.length - 1]) { resume.pop(); opens.pop(); buf += '}'; i++; tmpl(); continue; }
        }
        const o = opens.pop();
        if (!o) problems.push({ line: ln, kind: 'extra', ch: c });
        else if (o.ch !== CLOSE[c]) problems.push({ line: ln, kind: 'mismatch', ch: c, open: o });
      }
      buf += c; i++; prev = { t: 'p', v: c };
    }
    for (const o of opens) problems.push({ line: o.line, kind: 'unclosed', ch: o.ch });
    return { code: buf.split('\n'), comments, problems };
  }
  // Languages with line comments only (Ruby, YAML, shell, Python, Lua). ws: a comment needs whitespace before it.
  function lexLine(text, { mark = '#', ruby = false, ws = false } = {}) {
    const code = []; const comments = []; let block = false;
    text.split('\n').forEach((l, ln) => {
      if (ruby && /^=begin\b/.test(l)) block = true;
      if (block) { comments.push({ line: ln, text: l }); code.push(''); if (/^=end\b/.test(l)) block = false; return; }
      let out = ''; let q = null;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (q) { if (c === '\\') { out += '  '; i++; continue; } if (c === q) q = null; out += c === q || q === null ? c : ' '; continue; }
        if (c === '"' || c === '\'') { q = c; out += c; continue; }
        if (l.startsWith(mark, i) && (!ws || i === 0 || /\s/.test(l[i - 1]))) { comments.push({ line: ln, text: l.slice(i + mark.length) }); break; }
        out += c;
      }
      code.push(out);
    });
    return { code, comments, problems: [] };
  }

  const LANGS = { js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js', css: 'css', rb: 'ruby', rake: 'ruby', md: 'md', yml: 'yaml', yaml: 'yaml', json: 'json', py: 'py', sh: 'sh', lua: 'lua', conf: 'sh' };
  function langOf(name, text) {
    const base = String(name || '').split('/').pop();
    const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
    if (LANGS[ext]) return LANGS[ext];
    if (/^(Gemfile|Rakefile)$/.test(base) || /^#!.*ruby/.test(text)) return 'ruby';
    if (/^#!.*\b(sh|bash|zsh)\b/.test(text) || /^\.(bashrc|zshrc|profile)$/.test(base)) return 'sh';
    return 'text';
  }
  const COMMENT_MARK = { js: '//', css: '/*', ruby: '#', yaml: '#', sh: '#', py: '#', lua: '--' };

  // ---------- structure: functions and nesting ----------
  const KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'function', 'else']);
  const IIFE = /^\s*;?\s*(?:(?:const|let|var)\s+[\w$]+\s*=\s*)?\(\s*(?:async\s*)?(?:\(\s*\)\s*=>|function\s*\(\s*\))\s*$/;
  const METHOD = /^\s*(?:(?:async|static|get|set)\s+)*([\w$]+)\s*\([^()]*\)\s*$/;
  function isFnHead(head) {
    if (/=>\s*$/.test(head) || /\bfunction\b[^{]*\)\s*$/.test(head)) return true;
    const m = METHOD.exec(head);
    return !!m && !KW.has(m[1]);
  }
  function fnName(head) {
    let m;
    if ((m = /function\s*\*?\s*([\w$]+)\s*\([^()]*\)\s*$/.exec(head))) return m[1];
    if ((m = /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function\s*\*?\s*)?(?:\([^()]*\)|[\w$]+)?\s*(?:=>)?\s*$/.exec(head))) return m[1];
    if ((m = /([\w$]+)\s*:\s*(?:async\s*)?(?:function\s*)?(?:\([^()]*\)|[\w$]+)\s*(?:=>)?\s*$/.exec(head))) return m[1];
    if ((m = /\.([\w$]+)\(\s*(?:['"`][^'"`]*['"`]\s*,\s*)?(?:async\s*)?(?:\([^()]*\)|[\w$]+)\s*=>\s*$/.exec(head))) return `the callback passed to ${m[1]}`;
    if ((m = METHOD.exec(head)) && !KW.has(m[1])) return m[1];
    return /=>\s*$/.test(head) ? 'an arrow function' : 'an anonymous function';
  }
  const isBlockHead = (head) => /\)\s*$/.test(head) || /=>\s*$/.test(head) || /\b(else|try|finally|do)\s*$/.test(head) || /\bclass\b[^{=]*$/.test(head);
  function jsStructure(code, nest) {
    const stack = []; const fns = []; const deep = new Map();
    for (let y = 0; y < code.length; y++) {
      const l = code[y];
      if (l.length > 5000) continue;
      for (let x = 0; x < l.length; x++) {
        const c = l[x];
        if (c === '{') {
          let head = l.slice(0, x);
          if (!head.trim() && y > 0) head = code[y - 1];
          const iife = IIFE.test(head);
          const fn = !iife && isFnHead(head);
          const block = !iife && (fn || isBlockHead(head));
          const entry = { y, block, fn: fn ? { name: fnName(head), line: y } : null };
          stack.push(entry);
          if (!block) continue;
          let depth = 0; let owner = null;
          for (let k = stack.length - 1; k >= 0; k--) { if (stack[k].block) depth++; if (!owner && stack[k].fn) owner = stack[k].fn; }
          if (depth >= nest) {
            const key = owner ? owner.line : -1;
            if (!deep.has(key) || deep.get(key).depth < depth) deep.set(key, { depth, line: y, name: owner ? owner.name : 'top-level code' });
          }
        } else if (c === '}') {
          const s = stack.pop();
          if (s && s.fn) fns.push({ name: s.fn.name, start: s.y, end: y, len: y - s.y + 1 });
        }
      }
    }
    return { fns, deep: [...deep.values()] };
  }
  function rubyStructure(raw, nest) {
    const fns = []; const deep = []; let owner = 'top-level code'; let prevDeep = false;
    raw.forEach((l, y) => {
      const m = /^(\s*)def\s+([\w.?!=]+)/.exec(l);
      if (m && !/\bdef\s+[\w.?!]+(\([^)]*\))?\s*=\s*\S/.test(l)) {
        owner = m[2];
        const endRe = new RegExp('^' + m[1] + 'end\\b');
        for (let z = y + 1; z < raw.length; z++) if (endRe.test(raw[z])) { fns.push({ name: m[2], start: y, end: z, len: z - y + 1 }); break; }
      }
      const depth = Math.floor(/^ */.exec(l)[0].length / 2);
      const isDeep = !!l.trim() && depth >= nest;
      if (isDeep && !prevDeep) deep.push({ depth, line: y, name: owner });
      prevDeep = isDeep;
    });
    return { fns, deep };
  }

  // ---------- the checks ----------
  const STOP = new Set(['the', 'and', 'for', 'this', 'that', 'with', 'from', 'into', 'then', 'when', 'are', 'was', 'its', 'our', 'all', 'any', 'one', 'not', 'but', 'has', 'have', 'here', 'there', 'each', 'only', 'out', 'per', 'now']);
  const splitIdent = (s) => (s.match(/[A-Za-z_$][\w$]*/g) || []).flatMap((id) => id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_$]+/)).filter(Boolean);
  const sameWord = (a, b) => a === b || [a, b].some((x) => ['s', 'es', 'ed', 'ing'].some((suf) => x + suf === (x === a ? b : a)));
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const fmt = (n) => n.toLocaleString('en-GB');
  const BANNED = [
    [/\bload-bearing\b/i, 'load-bearing', 'Say important, required or critical: whichever you mean.'],
    [/\brunbooks?\b/i, 'runbook', 'Say instructions.'],
    [/\bsimply\b/i, 'simply', 'Delete the word. The sentence still works, and is now honest.'],
    [/\bjust\b/i, 'just', 'Delete the word. The sentence still works.'],
    [/\bwhen it lands\b/i, 'when it lands', 'Say merged, deployed or released: whichever you mean.'],
    [/\bcut (a|the) (PR|branch|release)\b/i, 'cut a PR', 'Say open. In plain English, cut means removed.'],
  ];
  const SEV = { High: 0, Medium: 1, Low: 2 };
  function guessLang(text) {
    if (/^\s*(def |class \w+ <|module |require ['"]|end\s*$)/m.test(text)) return 'ruby';
    if (/^#{1,6} /m.test(text) && !/[;{}]\s*$/m.test(text)) return 'md';
    if (/^\s*[\w-]+:\s/m.test(text) && !/[;{}]\s*$/m.test(text)) return 'yaml';
    if (/[;{}]\s*$|=>|\bfunction\b|\bconst |\blet /m.test(text)) return 'js';
    return 'text';
  }

  // t: {text, name, lang?, loc?(i)}. Returns {findings, counts, total, lines, lang, boring}.
  function review(t) {
    const text = t.text.replace(/\r\n/g, '\n');
    const lang = t.lang || langOf(t.name, text);
    const raw = text.split('\n');
    if (text.endsWith('\n')) raw.pop();
    const L = (i) => (t.loc ? t.loc(i) : `line ${i + 1}`);
    const F = [];
    const add = (check, sev, i, issue, fix, why, rank = 0) => F.push({ check, sev, i, issue, fix, why, rank });
    const prose = lang === 'md' || lang === 'text' || lang === 'json';
    let lex = null;
    if (lang === 'js' || lang === 'css') lex = lexJs(text);
    else if (lang === 'ruby') lex = lexLine(text, { ruby: true });
    else if (lang === 'yaml' || lang === 'sh') lex = lexLine(text, { ws: true });
    else if (lang === 'py') lex = lexLine(text);
    else if (lang === 'lua') lex = lexLine(text, { mark: '--' });
    const code = lex ? lex.code : null;
    const comments = lex ? lex.comments : raw.map((l, i) => ({ line: i, text: l }));

    // High: things that stop the file working
    let conflict = false;
    raw.forEach((l, i) => {
      const m = /^(<{7}|={7}|>{7})(\s|$)/.exec(l);
      if (!m || (m[1][0] !== '<' && !conflict)) return;
      conflict = true;
      add('merge', 'High', i, `Merge conflict marker ${m[1]}.`, 'Resolve the conflict and delete the markers.', 'Nothing can parse this file while the markers are in it.');
    });
    if (lex && lex.problems.length && (lang === 'js' || lang === 'css')) {
      const p = lex.problems[0];
      const what = p.kind === 'unclosed' ? `'${p.ch}' opened here is never closed.` : p.kind === 'extra' ? `'${p.ch}' closes nothing.` : `'${p.ch}' closes the '${p.open.ch}' opened at ${L(p.open.line)}.`;
      add('brackets', 'High', p.line, what, 'Close it, or delete the extra one.', 'The file does not parse. Everything after this line is in doubt.');
    }
    if (lang === 'json') {
      try { JSON.parse(text); } catch (e) {
        const lc = /line (\d+)/.exec(e.message); const pos = /position (\d+)/.exec(e.message);
        const i = lc ? Number(lc[1]) - 1 : pos ? text.slice(0, Number(pos[1])).split('\n').length - 1 : 0;
        add('json', 'High', i, `JSON does not parse: ${e.message.replace(/\s*in JSON.*$/, '').replace(/\.$/, '')}.`, 'Fix the syntax on this line.', 'Nothing can read this file until it parses.');
      }
    }
    if (lang === 'yaml') {
      const levels = [];
      raw.forEach((l, i) => {
        if (/^ *\t/.test(l)) add('yamltab', 'High', i, 'Tab in the indentation.', 'Indent with spaces.', 'YAML forbids tabs in indentation. The parser stops here.');
        const c = code[i];
        if (!c.trim()) return;
        const lead = /^ */.exec(c)[0].length;
        const dash = /^ *(- +)/.exec(c);
        if (dash) {
          const itemInd = lead + dash[1].length;
          while (levels.length && levels[levels.length - 1].ind >= itemInd) levels.pop();
          levels.push({ ind: itemInd, keys: new Map() });
        }
        const m = /^( *)(- +)?([^\s#:'"-][^:]*?|"[^"]*"|'[^']*'):(\s|$)/.exec(c);
        if (!m) return;
        const ind = m[2] ? lead + m[2].length : lead;
        const key = m[3].replace(/^["']|["']$/g, '');
        while (levels.length && levels[levels.length - 1].ind > ind) levels.pop();
        let top = levels[levels.length - 1];
        if (!top || top.ind < ind) { top = { ind, keys: new Map() }; levels.push(top); }
        if (top.keys.has(key)) add('yamldup', 'High', i, `Key "${clip(key, 30)}" appears twice in one mapping (first at ${L(top.keys.get(key))}).`, 'Keep one of them.', 'A YAML parser keeps one value and drops the other, without a warning.');
        else top.keys.set(key, i);
      });
    }

    // Leftovers from debugging
    if (code) {
      code.forEach((c, i) => {
        if (lang === 'js') {
          if (/\bconsole\.log\s*\(/.test(c)) add('console', 'Low', i, 'console.log left in.', 'Delete it, or use console.error if it reports a real failure.', 'Debug output in shipped code is noise in someone else\'s console.');
          if (/(^|[^\w$.])debugger\b/.test(c)) add('debugger', 'Medium', i, 'debugger statement.', 'Delete it.', 'It pauses the page for anyone who has the developer tools open.');
        }
        if (lang === 'ruby' && /\b(binding\.pry|binding\.irb|byebug)\b/.test(c)) add('pry', 'High', i, 'A breakpoint is left in.', 'Delete it.', 'It stops the request and waits at a console that nobody is watching.');
        if (lang === 'py' && /\b(breakpoint\(\)|pdb\.set_trace\(\))/.test(c)) add('pry', 'High', i, 'A breakpoint is left in.', 'Delete it.', 'It stops the process and waits at a prompt that nobody is watching.');
      });
    }

    // Comments: TODOs, banned words, comments that repeat the code
    const mark = { js: '//', css: '/*', ruby: '#', yaml: '#', sh: '#', py: '#', lua: '--' }[lang];
    comments.forEach(({ line: i, text: c }) => {
      const m = /\b(TODO|FIXME|XXX|HACK)\b:?\s*(.*)/.exec(c);
      if (m) {
        const hard = m[1] !== 'TODO';
        add('todo', hard ? 'Medium' : 'Low', i, `${m[1]}: "${clip(m[2].trim() || '(nothing else)', 56)}"`,
          hard ? 'Fix it, or file a ticket that says what is wrong.' : 'Do it, or file it as a ticket and delete the comment.',
          hard ? 'Someone knew this was wrong and wrote it down instead.' : 'A TODO in a comment has no owner and no date.');
      }
      for (const [re, word, fix] of BANNED) if (re.test(c)) add('banned', 'Low', i, `"${word}" in ${prose ? 'the text' : 'a comment'}.`, fix, 'House style. The word adds nothing, or means two things.');
      if (!code || !mark || !raw[i] || !raw[i].trim().startsWith(mark)) return;
      const next = code[i + 1];
      if (!next || !next.trim()) return;
      const words = (c.toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w));
      if (words.length < 2 || words.length > 6) return;
      const ids = splitIdent(next);
      const hit = words.filter((w) => ids.some((v) => sameWord(v, w)));
      if (hit.length / words.length >= 0.75) add('restate', 'Low', i, `Comment repeats the next line: "${clip(c.trim(), 48)}".`, 'Delete it, or say why instead of what.', 'The code already says what it does. Comments are for why.');
    });

    // Layout: trailing whitespace, long lines, duplicate lines
    const LIM = prose ? 160 : 120;
    const seen = new Map();
    raw.forEach((l, i) => {
      const tw = /[ \t]+$/.exec(l);
      if (tw && !(lang === 'md' && tw[0] === '  ' && /\S {2}$/.test(l))) {
        add('trailing', 'Low', i, l.trim() ? `Trailing whitespace (${tw[0].length} character${tw[0].length === 1 ? '' : 's'}).` : `A blank line with ${tw[0].length} spaces on it.`, 'Delete it. "Apply the boring fixes" does this one.', 'Invisible changes make noisy diffs.');
      }
      if (l.length > LIM) {
        const huge = l.length > 2000;
        add('long', 'Low', i, huge ? `One line, ${fmt(l.length)} characters. That is a file, on one line.` : `${l.length} characters on one line.`,
          huge ? 'If it is generated, keep it out of review. If it is not, split it.' : prose ? 'One sentence per line. Markdown joins them for you.' : 'Break it after a comma or before an operator.',
          prose ? 'A long line makes a diff show the whole paragraph for one changed word.' : 'Side-by-side diffs stop at about 120 columns. The rest is scrolling.', l.length);
      }
      const t2 = l.trim();
      if (i > 0 && t2.length >= 4 && /[A-Za-z0-9]/.test(t2) && t2 === raw[i - 1].trim() && !/^(end|break;?|return;?|\}[),;]*|\)[,;]*)$/.test(t2)) {
        add('dup1', 'Medium', i, `Repeats the line above exactly: ${clip(t2, 44)}`, 'Delete one, if the repeat is a paste mistake.', 'Two identical lines in a row are usually a paste, not a decision.');
        return;
      }
      if (t2.length < 40 || l.length > 2000) return;
      if (seen.has(t2)) add('dup', 'Low', i, `Identical to ${L(seen.get(t2))}.`, prose ? 'Say it once.' : 'If it is logic, name it once and call it twice.', 'Copies drift. One gets fixed and the other gets a bug report.', t2.length);
      else seen.set(t2, i);
    });

    // Code shape: long functions, deep nesting, loose equality, var, numbers without names
    const struct = lang === 'js' ? jsStructure(code, 5) : lang === 'ruby' ? rubyStructure(raw, 6) : null;
    if (struct) {
      const [lo, hi] = lang === 'ruby' ? [30, 60] : [80, 150];
      for (const f of struct.fns) {
        if (f.len > lo) add('fnlen', f.len > hi ? 'Medium' : 'Low', f.start, `${f.name} is ${fmt(f.len)} lines long, ending at ${L(f.end)}.`, 'Split out the parts you had to scroll past, and name them.', 'Nobody holds a function this long in their head. They scroll, and guess.', f.len);
      }
      for (const d of struct.deep) add('nest', 'Medium', d.line, `${d.depth} blocks deep, inside ${d.name}.`, 'Return early, or move the inner block into a function with a name.', 'Each level is one more condition to keep in mind while reading the next line.', d.depth);
    }
    if (code && (lang === 'js' || lang === 'ruby' || lang === 'py')) {
      code.forEach((c, i) => {
        if (c.length > 2000) return;
        if (lang === 'js') {
          const eq = /(^|[^=!<>])(==|!=)(?!=)/g; let m;
          while ((m = eq.exec(c))) {
            const before = c.slice(0, m.index + m[1].length).trimEnd(); const after = c.slice(m.index + m[0].length).trimStart();
            if (/^(null|undefined)\b/.test(after) || /\b(null|undefined)$/.test(before)) continue;
            add('eq', 'Medium', i, `Loose equality (${m[2]}).`, `Use ${m[2]}=. (${m[2]} null is fine. I checked.)`, `${m[2]} converts types first: '0' == 0 and 0 == '' are both true.`);
            break;
          }
          if (/(^|[^\w$.])var\s+[A-Za-z_$]/.test(c)) add('var', 'Low', i, 'var declaration.', 'Use const, or let if it is reassigned.', 'var belongs to the function, not the block, and is hoisted.');
        }
        const mn = /(?<![<>=!])(?:[<>]=?|[!=]==?)(?![<>=])\s*(-?\d+(?:\.\d+)?)(?![\w.])/g; let k;
        while ((k = mn.exec(c))) {
          if ([0, 1, 2, -1].includes(Number(k[1]))) continue;
          add('magic', 'Low', i, `Unexplained ${k[1]} in a comparison.`, `Give it a name that says what ${k[1]} limits.`, `A name says why ${k[1]}. The number only says ${k[1]}.`);
          break;
        }
      });
    }

    // Keep the worst three of each kind, then order by severity and line.
    const groups = {};
    for (const f of F) (groups[f.check] ||= []).push(f);
    const kept = []; const extra = {};
    for (const [check, g] of Object.entries(groups)) {
      g.sort((a, b) => SEV[a.sev] - SEV[b.sev] || b.rank - a.rank || a.i - b.i);
      kept.push(...g.slice(0, CAP));
      if (g.length > CAP) extra[check] = g.length - CAP;
    }
    kept.sort((a, b) => SEV[a.sev] - SEV[b.sev] || a.i - b.i);
    for (let k = kept.length - 1; k >= 0; k--) if (extra[kept[k].check]) { kept[k].more = extra[kept[k].check]; delete extra[kept[k].check]; }
    kept.forEach((f, k) => { f.id = `G-${k + 1}`; f.line = f.i + 1; f.loc = t.loc ? t.loc(f.i) : `${t.short || 'text'}:${f.i + 1}`; });
    const counts = { High: 0, Medium: 0, Low: 0 };
    for (const f of F) counts[f.sev]++;
    return { findings: kept, counts, total: F.length, lines: raw.length, lang, boring: F.some((f) => f.check === 'trailing') };
  }

  // ---------- patience and the card ----------
  const CARD_HEAD = '★ COMMON                                      OCTOPUS';
  const QUOTE = ['"Impatient tentacle who reads your', ' code like it personally wronged', ' them and isn\'t shy about saying', ' so, masking a weirdly genuine', ' desire to help you fix it faster."'];
  function mood() {
    const s = OS.store.get('gristle', null);
    if (!s || s.day !== OS.today()) return { day: OS.today(), left: PATIENCE, reviews: 0, lastTotal: 0, lastHigh: 0 };
    return s;
  }
  const saveMood = (m) => OS.store.set('gristle', m);
  const stats = (m) => [
    ['DEBUGGING', Math.min(99, 37 + m.reviews)],
    ['PATIENCE', m.left],
    ['CHAOS', Math.min(99, 18 + m.lastHigh * 6)],
    ['WISDOM', 20],
    ['SNARK', Math.min(99, 72 + Math.min(27, Math.round(m.lastTotal / 3)))],
  ];
  const filled = (v) => Math.round(v / 5);
  const statLine = ([k, v]) => k.padEnd(11) + '█'.repeat(filled(v)) + '░'.repeat(20 - filled(v)) + String(v).padStart(4);
  const eyesFor = (m) => (m.left > 0 ? '◉  ◉' : '-  -');
  const octo = (eyes) => ['  .----.', ` ( ${eyes} )`, ' (______)', ' /\\/\\/\\/\\'];
  const cardText = (m, eyes = eyesFor(m)) => [CARD_HEAD, '', ...octo(eyes), '', 'Gristle', '', ...QUOTE, '', ...stats(m).map(statLine)];

  // ---------- targets ----------
  const costFor = (t) => Math.max(0.03, Math.round((0.02 + t.text.split('\n').length * 0.00003) * 100) / 100);
  const osTarget = () => ({
    kind: 'os', text: B.text, name: 'labs-os.js', label: 'Labs OS itself', short: 'bundle',
    loc: (i) => { const w = where(i); return `${w.file}:${w.line}`; },
    open: (i) => { const w = where(i); const p = `${SRC}/${w.file}`; return OS.fs.isFile(p) ? { path: p, line: w.line } : null; },
  });
  const fileTarget = (p) => ({ kind: 'file', path: p, text: OS.fs.read(p), name: p, label: disp(p), short: OS.fs.basename(p), open: (i) => ({ path: p, line: i + 1 }) });
  const textTarget = (kind, text, name) => {
    const t = { kind, text, name: name || 'pasted', label: name || 'pasted code', short: String(name || 'pasted').split('/').pop(), open: null };
    if (langOf(t.name, text) === 'text') t.lang = guessLang(text);
    return t;
  };
  function grumbles(t) {
    if (t.kind !== 'os') return [`Reading ${t.label}.`, 'Counting columns.', 'Looking for TODOs. Finding reasons to keep looking.', 'Comparing every line with every other line.', 'Writing it down.'];
    const names = B.files.map((f) => f.name);
    const find = (re, d) => names.find((n) => re.test(n)) || d;
    return [`Reading the script tag. All ${fmt(B.count)} lines of it.`, `Reading ${find(/01_core/, names[0])}.`, `Reading ${find(/08_wm/, names[0])}. Windows that tile themselves.`,
      `Reading ${find(/20_labvim/, names[names.length - 1])}. A sibling. No favours.`, 'Finding where functions end. Most of them do.', 'Comparing every line with every other line.', 'Writing it down.'];
  }
  function verdict(res, t) {
    const c = res.counts; const first = res.findings[0];
    const pre = t.kind === 'os' ? `${fmt(res.lines)} lines in one script tag. ` : '';
    if (!res.total) return pre + 'Nothing to report. I read all of it twice, which is once more than I wanted to.';
    if (c.High) return pre + (c.High === 1 ? `Fix ${first.id} first: it breaks something. The rest is me being right about style.` : `Fix the ${c.High} High findings first: they break things. The rest is me being right about style.`);
    if (c.Medium) return pre + `Nothing here is broken. ${c.Medium} ${c.Medium === 1 ? 'thing is' : 'things are'} harder to change than ${c.Medium === 1 ? 'it needs' : 'they need'} to be. Start with ${first.id}.`;
    if (res.boring) return pre + 'All polish. Press "Apply the boring fixes" and I will pretend I did not see the rest.';
    return pre + 'All polish. Nothing here hurts anyone, and I am still not pleased.';
  }
  // Trailing whitespace is the only fix Gristle applies without a person. Returns {ok, text, n, why}.
  function boringFix(t) {
    if (t.kind === 'os' || /^\/usr\/src\//.test(t.path || '')) return { ok: false, why: 'Refused. This is the page\'s own source, read from its script tag. It is read-only. I can complain about it. I cannot change it, and neither can you, from here.' };
    if (/^\/gold\//.test(t.path || '')) return { ok: false, why: 'Refused. Gold is never edited, only overridden. I do not even tidy it.' };
    if (/^\/proc\//.test(t.path || '')) return { ok: false, why: 'Refused. /proc is written by the kernel when you read it. Tidying it changes nothing.' };
    if (t.kind === 'buffer') return { ok: false, why: 'Refused. That buffer has unsaved changes in labvim. Save it there first: I do not write over unsaved work.' };
    let n = 0;
    const text = t.text.split('\n').map((l) => { const s = l.replace(/[ \t]+$/, ''); if (s !== l) n++; return s; }).join('\n');
    if (!n) return { ok: false, why: 'No boring fixes to apply. What is left needs a person.' };
    return { ok: true, text, n };
  }

  // ---------- terminal output ----------
  function wrap(s, w) {
    const out = []; let cur = '';
    for (let wd of String(s).split(/\s+/)) {
      while (wd.length > w) { if (cur) { out.push(cur); cur = ''; } out.push(wd.slice(0, w)); wd = wd.slice(w); }
      if (!cur) cur = wd; else if (cur.length + 1 + wd.length <= w) cur += ' ' + wd; else { out.push(cur); cur = wd; }
    }
    if (cur || !out.length) out.push(cur);
    return out;
  }
  const sevCls = (s) => (s === 'High' ? 'bad' : s === 'Medium' ? 'warn' : null);
  const issueText = (f) => f.issue + (f.more ? ` (+${f.more} more like this)` : '');
  function tableLines(findings, cols) {
    const rows = findings.map((f) => [f.id, f.sev, f.loc, issueText(f), f.fix, f.why]);
    const head = ['#', 'Severity', 'File:line', 'Issue', 'Fix', 'Rationale'];
    const w0 = Math.max(2, ...rows.map((r) => r[0].length)); const w1 = 8;
    const w2 = Math.min(28, Math.max(9, ...rows.map((r) => r[2].length)));
    const rest = cols - (w0 + w1 + w2) - 19;
    if (rest < 42) return null;
    const w3 = Math.floor(rest * 0.38); const w4 = Math.floor(rest * 0.3);
    const W = [w0, w1, w2, w3, w4, rest - w3 - w4];
    const rule = (a, b, c) => ({ t: a + W.map((w) => '─'.repeat(w + 2)).join(b) + c, c: 'faint' });
    const out = [rule('┌', '┬', '┐')];
    const row = (cells, cls) => {
      const cellLines = cells.map((c, k) => (k === 2 && c.length > W[2] ? ['…' + c.slice(-(W[2] - 1))] : wrap(c, W[k])));
      const hgt = Math.max(...cellLines.map((x) => x.length));
      for (let j = 0; j < hgt; j++) out.push({ t: '│ ' + cellLines.map((x, k) => (x[j] || '').padEnd(W[k])).join(' │ ') + ' │', c: cls });
    };
    row(head, 'bold');
    rows.forEach((r, k) => { out.push(rule('├', '┼', '┤')); row(r, sevCls(findings[k].sev)); });
    out.push(rule('└', '┴', '┘'));
    return out;
  }
  function blockLines(findings, cols) {
    const out = []; const w = Math.max(20, cols - 14);
    for (const f of findings) {
      out.push({ t: `${f.id.padEnd(5)} ${f.sev.padEnd(7)} ${f.loc}`, c: sevCls(f.sev) || 'bold' });
      for (const [k, v] of [['Issue', issueText(f)], ['Fix', f.fix], ['Why', f.why]]) wrap(v, w).forEach((l, j) => out.push({ t: `      ${j ? '       ' : (k + ':').padEnd(7)}${l}`, c: k === 'Why' ? 'muted' : null }));
    }
    return out;
  }
  function printCard(io, m) {
    cardText(m).forEach((l, i) => {
      const cls = i === 0 ? 'warn' : i >= 2 && i <= 5 ? 'accent' : i === 7 ? 'bold' : i >= 9 && i <= 13 ? 'muted' : i >= 15 ? 'accent2' : null;
      io.println(l, cls);
    });
  }

  OS.commands.register('gristle', {
    desc: 'Gristle the octopus reviews a file, or Labs OS itself',
    usage: 'gristle [path]   (no path: the page\'s own source)   gristle --card',
    async run(args, io) {
      if (args.includes('-h') || args.includes('--help')) {
        io.println('usage: gristle [path]      review a file, or with no path, Labs OS itself');
        io.println('       gristle --card      show the card and today\'s patience');
        io.println('Three reviews a day. Each one costs a few cents and one patience.', 'muted');
        return 0;
      }
      const m = mood();
      printCard(io, m);
      io.println();
      if (args.includes('--card')) return 0;
      if (m.left <= 0) {
        io.println('gristle: PATIENCE is 0. It comes back at 00:00 UTC, as 3. It has never been 4.', 'bad');
        io.println('Gristle is not reviewing anything else today. This is not about you. It is about the code.', 'muted');
        return 1;
      }
      const arg = args.find((a) => !a.startsWith('-'));
      let t;
      if (arg) {
        const p = OS.fs.resolve(io.cwd, arg);
        if (OS.fs.isDir(p)) { io.println(`gristle: ${arg}: Is a directory. I review files, not filing cabinets.`, 'bad'); return 1; }
        try { t = fileTarget(p); } catch (e) { io.println(`gristle: ${e.message}`, 'bad'); return 1; }
      } else t = osTarget();
      const cost = costFor(t);
      const r = OS.spend.add(cost, `gristle review: ${t.label}`, 'gristle');
      if (!r.ok) { io.println(r.message, 'bad'); io.println('Gristle agrees with the cap. Gristle agrees with very little.', 'muted'); return 1; }
      const status = io.println(`Reading ${t.label}...`, 'muted');
      for (const g of grumbles(t)) {
        await io.sleep(160);
        if (io.aborted) { io.println('^C. Fine. I had not finished disliking it.', 'muted'); return 130; }
        status.set(`  ${g}`, 'muted');
      }
      const res = review(t);
      const was = m.left;
      m.left -= 1; m.reviews += 1; m.lastTotal = res.total; m.lastHigh = res.counts.High;
      saveMood(m);
      status.set(`Reviewed ${t.label}: ${fmt(res.lines)} lines, ${res.lang}. Charged ${OS.usd(cost)}.`, 'muted');
      io.println(`${res.total} finding${res.total === 1 ? '' : 's'}: ${res.counts.High} High, ${res.counts.Medium} Medium, ${res.counts.Low} Low. The worst ${CAP} of each kind are shown.`, res.counts.High ? 'bad' : res.counts.Medium ? 'warn' : 'ok');
      io.println();
      if (res.findings.length) (tableLines(res.findings, io.cols || 100) || blockLines(res.findings, io.cols || 100)).forEach((l) => io.println(l.t, l.c));
      io.println();
      io.println(`Gristle says: ${verdict(res, t)}`, 'accent');
      io.println(statLine(['PATIENCE', m.left]) + `   (was ${was})`, m.left ? 'warn' : 'bad');
      return res.total ? 1 : 0;
    },
  });

  // ---------- the app ----------
  const CSS = `
.gr { position: absolute; inset: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); background: var(--bg); }
.gr-left { display: flex; flex-direction: column; gap: 12px; padding: 14px; background: var(--surface); border-right: 1px solid var(--border); overflow: auto; }
.gr-card { border-radius: 12px; padding: 14px 16px 12px; background: linear-gradient(165deg, var(--surface2), var(--bg) 85%); border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent), 0 14px 30px rgba(0,0,0,.22); }
.gr-card pre { margin: 0; font: 12px/1.34 var(--mono); white-space: pre; color: var(--fg); }
.gr-card .rar { color: var(--warn); } .gr-card .typ { color: var(--accent2); font-weight: 800; } .gr-card .com { color: var(--muted); font-weight: 700; }
.gr-card .oc { color: var(--accent); font-weight: 700; } .gr-card .nm { font-weight: 800; } .gr-card .q { color: var(--muted); font-style: italic; }
.gr-card .lb { color: var(--muted); } .gr-card .off { color: var(--faint); opacity: .55; } .gr-card .v { font-weight: 800; }
.gr-card .s-DEBUGGING { color: var(--info); } .gr-card .s-PATIENCE { color: var(--warn); } .gr-card .s-CHAOS { color: var(--accent2); }
.gr-card .s-WISDOM { color: var(--good); } .gr-card .s-SNARK { color: var(--bad); } .gr-card .zero .lb, .gr-card .zero .v { color: var(--bad); }
.gr-card .flash { animation: gr-flash 1.6s ease-out; border-radius: 3px; }
@keyframes gr-flash { 0%, 30% { background: color-mix(in srgb, var(--warn) 30%, transparent); } 100% { background: transparent; } }
.gr-note { font-size: 11.5px; color: var(--muted); line-height: 1.55; max-width: 420px; }
.gr-note b { color: var(--fg); } .gr-note .no { color: var(--bad); font-weight: 700; }
.gr-right { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.gr-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--surface); }
.gr-bar .sp { flex: 1; }
.gr-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; flex-wrap: wrap; }
.gr-seg button { border: 0; background: transparent; color: var(--muted); padding: 4px 11px; cursor: pointer; font: inherit; font-size: 12px; }
.gr-seg button + button { border-left: 1px solid var(--border); }
.gr-seg button.on { background: var(--sel); color: var(--fg); box-shadow: inset 0 -2px 0 var(--accent); }
.gr-src { padding: 8px 14px; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
.gr-src .ui-select { flex: 1; min-width: 0; max-width: 100%; }
.gr-src textarea { width: 100%; height: 110px; font: 12px/1.4 var(--mono); resize: vertical; }
.gr-out { flex: 1; min-height: 0; overflow: auto; padding: 12px 14px 18px; }
.gr-hd { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; margin-bottom: 10px; }
.gr-hd .t { font-weight: 800; font-size: 14px; margin-right: 4px; } .gr-hd .m { color: var(--muted); font-size: 12px; margin-right: 6px; }
.gr-tbl { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
.gr-tbl th { text-align: left; color: var(--muted); font-weight: 700; padding: 5px 8px; border-bottom: 1px solid var(--border); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; }
.gr-tbl td { padding: 7px 8px; border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); vertical-align: top; white-space: normal; overflow-wrap: anywhere; line-height: 1.45; }
.gr-tbl tr.go { cursor: pointer; } .gr-tbl tr.go:hover td { background: color-mix(in srgb, var(--sel) 55%, transparent); }
.gr-tbl .id { color: var(--faint); white-space: nowrap; } .gr-tbl td.loc { color: var(--info); overflow-wrap: normal; word-break: keep-all; } .gr-tbl .why { color: var(--muted); } .gr-tbl .more { color: var(--faint); display: block; margin-top: 2px; }
.gr-tbl tr.fixed td { text-decoration: line-through; opacity: .5; }
.gr-sev { display: inline-block; padding: 0 7px; border-radius: 4px; font-size: 11px; font-weight: 800; border: 1px solid var(--border); color: var(--muted); }
.gr-sev.High { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 55%, transparent); background: color-mix(in srgb, var(--bad) 12%, transparent); }
.gr-sev.Medium { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 55%, transparent); background: color-mix(in srgb, var(--warn) 10%, transparent); }
.gr-says { margin-top: 14px; padding: 10px 12px; border-left: 3px solid var(--accent); background: var(--surface); border-radius: 0 8px 8px 0; line-height: 1.5; }
.gr-says b { color: var(--accent); }
.gr-log { font-size: 12px; line-height: 1.8; color: var(--muted); } .gr-log div:last-child { color: var(--fg); }
.gr-log .ui-spin { color: var(--accent); margin-right: 8px; }
.gr-empty { color: var(--muted); max-width: 560px; line-height: 1.65; padding-top: 6px; } .gr-empty .ui-big { color: var(--fg); margin-bottom: 6px; }
.gr-msg { margin-top: 12px; padding: 8px 12px; border-radius: 8px; background: var(--surface2); border: 1px solid var(--border); font-size: 12px; line-height: 1.5; }
.gr-msg.bad { border-color: color-mix(in srgb, var(--bad) 60%, transparent); color: var(--bad); } .gr-msg.ok { border-color: color-mix(in srgb, var(--good) 60%, transparent); }
.gr.narrow { display: flex; flex-direction: column; overflow: auto; }
.gr.narrow .gr-left { border-right: 0; border-bottom: 1px solid var(--border); overflow: visible; align-items: center; }
.gr.narrow .gr-card pre { font-size: 10.5px; }
.gr.narrow .gr-right { min-height: auto; } .gr.narrow .gr-out { overflow: visible; flex: none; }
.gr.narrow .gr-tbl, .gr.narrow .gr-tbl tbody, .gr.narrow .gr-tbl tr, .gr.narrow .gr-tbl td { display: block; width: auto; }
.gr.narrow .gr-tbl thead, .gr.narrow .gr-tbl colgroup { display: none; }
.gr.narrow .gr-tbl tr { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; padding: 6px 0; }
.gr.narrow .gr-tbl td { border: 0; padding: 2px 10px 2px calc(10px + 7em); position: relative; }
.gr.narrow .gr-tbl td[data-l]::before { content: attr(data-l); color: var(--faint); position: absolute; left: 10px; top: 2px; }
`;

  function filesForPicker() {
    return OS.fs.walk('/').filter((p) => !p.startsWith('/proc/') && OS.fs.isFile(p))
      .sort((a, b) => Number(!a.startsWith(HOME + '/labs')) - Number(!b.startsWith(HOME + '/labs')) || a.localeCompare(b));
  }

  registerApp({
    id: 'gristle', title: 'Gristle', icon: 'octopus',
    desc: 'The octopus code reviewer. Three reviews a day, then none',
    keywords: ['review', 'lint', 'linter', 'code review', 'octopus', 'reviewer'],
    size: [1120, 720],
    mount(win, arg) {
      if (!document.getElementById('gristle-css')) document.head.append(h('style', { id: 'gristle-css', text: CSS }));
      win.body.style.overflow = 'hidden';
      const S = win.state;
      Object.assign(S, { kind: 'os', file: HOME + '/labs/AGENTS.md', paste: '', buffer: null, result: null, busy: false, msg: null, log: [], eyes: null, shown: null });
      const card = h('div', { class: 'gr-card' });
      const note = h('div', { class: 'gr-note' });
      const bar = h('div', { class: 'gr-bar' });
      const src = h('div', { class: 'gr-src' });
      const out = h('div', { class: 'gr-out' });
      const right = h('div', { class: 'gr-right' }, bar, src, out);
      const root = h('div', { class: 'gr' }, h('div', { class: 'gr-left' }, card, note), right);
      win.body.append(root);

      function drawCard() {
        const m = mood();
        const st = stats(m);
        const prev = S.shown || st;
        const eyes = S.eyes || eyesFor(m);
        const head = esc(CARD_HEAD).replace('★', '<span class="rar">★</span>').replace('COMMON', '<span class="com">COMMON</span>').replace('OCTOPUS', '<span class="typ">OCTOPUS</span>');
        const rows = st.map(([k, v], i) => {
          const f = filled(v);
          const cls = (prev[i][1] !== v ? 'flash' : '') + (k === 'PATIENCE' && v === 0 ? ' zero' : '');
          return `<span class="${cls}"><span class="lb">${k.padEnd(11)}</span><span class="s-${k}">${'█'.repeat(f)}</span><span class="off">${'░'.repeat(20 - f)}</span><span class="v">${String(v).padStart(4)}</span></span>`;
        });
        card.innerHTML = `<pre>${head}\n\n<span class="oc">${esc(octo(eyes).join('\n'))}</span>\n\n<span class="nm">Gristle</span>\n\n<span class="q">${esc(QUOTE.join('\n'))}</span>\n\n${rows.join('\n')}</pre>`;
        S.shown = st;
        note.innerHTML = m.left > 0
          ? `PATIENCE: <b>${m.left}</b> of ${PATIENCE} today. Each review uses one and a few cents. It refills at 00:00 UTC and has never been above ${PATIENCE}.`
          : `PATIENCE: <b>0</b>. <span class="no">Gristle is not reviewing anything else today.</span> It refills at 00:00 UTC.`;
      }

      function currentTarget() {
        if (S.kind === 'os') return osTarget();
        if (S.kind === 'file') return fileTarget(S.file);
        if (S.kind === 'buffer' && S.buffer) return textTarget('buffer', S.buffer.text, S.buffer.name);
        return textTarget('paste', S.paste, 'pasted code');
      }
      function drawBar() {
        const kinds = [['os', 'Labs OS itself'], ['file', 'A file'], ['paste', 'Pasted code']];
        if (S.buffer) kinds.push(['buffer', 'labvim buffer']);
        let cost = '';
        try { cost = ` ≈ ${OS.usd(costFor(currentTarget()))}`; } catch { cost = ''; }
        bar.innerHTML = '';
        bar.append(
          h('div', { class: 'gr-seg', role: 'tablist' }, kinds.map(([k, label]) => h('button', { class: S.kind === k ? 'on' : '', role: 'tab', 'aria-selected': String(S.kind === k), onclick: () => { S.kind = k; S.msg = null; drawBar(); drawSrc(); } }, label))),
          h('span', { class: 'sp' }),
          h('button', { class: 'ui-btn primary', disabled: S.busy, onclick: () => run() }, OS.iconEl('octopus'), `Review${cost}`),
          h('button', { class: 'ui-btn', disabled: S.busy || !S.result, onclick: () => applyBoring() }, 'Apply the boring fixes'),
        );
      }
      function drawSrc() {
        src.innerHTML = '';
        if (S.kind === 'os') {
          src.append(h('span', null, `The page's own JavaScript, read from its script tag: ${fmt(B.count)} lines in ${B.files.length} source files. Findings cite the source file and line.`));
        } else if (S.kind === 'file') {
          const sel = h('select', { class: 'ui-select', 'aria-label': 'File to review', onchange: () => { S.file = sel.value; S.msg = null; drawBar(); } },
            filesForPicker().map((p) => h('option', { value: p, selected: p === S.file }, disp(p))));
          src.append(sel, h('button', { class: 'ui-btn ghost', onclick: () => OS.open('labvim', { path: S.file }) }, 'Open in labvim'));
        } else if (S.kind === 'paste') {
          const ta = h('textarea', { class: 'ui-textarea', spellcheck: 'false', placeholder: 'Paste code here. I will guess the language. I am usually right, which does not help my mood.', oninput: () => { S.paste = ta.value; } });
          ta.value = S.paste;
          src.append(ta);
        } else {
          src.append(h('span', { class: 'ui-chip accent' }, 'labvim'), h('span', null, `${S.buffer.name}: ${fmt(S.buffer.text.split('\n').length)} lines, sent from labvim with unsaved changes.`));
        }
      }
      function drawOut() {
        out.innerHTML = '';
        if (S.busy) {
          out.append(h('div', { class: 'gr-log' }, S.log.map((l, i) => h('div', null, i === S.log.length - 1 ? h('span', { class: 'ui-spin' }, '◐') : null, l))));
          return;
        }
        const R = S.result;
        if (!R) {
          out.append(h('div', { class: 'gr-empty' },
            h('div', { class: 'ui-big' }, 'Pick something. I will read all of it.'),
            h('div', null, 'Gristle runs real checks on real text: long lines, long functions, deep nesting, TODO and FIXME, console.log, duplicate lines, loose equality, var, unexplained numbers, trailing whitespace, comments that repeat the code, and words the house style bans. Every finding cites a line.'),
            h('div', { class: 'ui-faint', style: { marginTop: '8px' } }, 'Click a finding to open that line in labvim.')));
        } else {
          const { t, res, cost } = R;
          out.append(h('div', { class: 'gr-hd' },
            h('span', { class: 't' }, t.label),
            h('span', { class: 'm' }, `${fmt(res.lines)} lines · ${t.lang ? res.lang + ', guessed' : res.lang} · charged ${OS.usd(cost)}`),
            h('span', { class: 'ui-tag bad' }, `High ${res.counts.High}`), h('span', { class: 'ui-tag warn' }, `Medium ${res.counts.Medium}`), h('span', { class: 'ui-tag' }, `Low ${res.counts.Low}`),
            res.total > res.findings.length ? h('span', { class: 'm' }, `showing the worst ${CAP} of each kind`) : null));
          if (res.findings.length) {
            const rows = res.findings.map((f) => {
              const target = t.open ? t.open(f.i) : null;
              return h('tr', { class: (target ? 'go' : '') + (R.fixed && f.check === 'trailing' ? ' fixed' : ''), title: target ? `Open ${f.loc} in labvim` : '', onclick: () => { if (target) OS.open('labvim', target); } },
                h('td', { class: 'id', dataset: { l: '#' } }, f.id),
                h('td', { dataset: { l: 'Severity' } }, h('span', { class: `gr-sev ${f.sev}` }, f.sev)),
                h('td', { class: 'loc', dataset: { l: 'File:line' } }, f.loc.split('/').flatMap((seg, k, all) => (k < all.length - 1 ? [seg + '/', h('wbr')] : [seg]))),
                h('td', { dataset: { l: 'Issue' } }, f.issue, f.more ? h('span', { class: 'more' }, `+${f.more} more like this`) : null),
                h('td', { dataset: { l: 'Fix' } }, f.fix),
                h('td', { class: 'why', dataset: { l: 'Rationale' } }, f.why));
            });
            out.append(h('table', { class: 'gr-tbl' },
              h('colgroup', null, ['48px', '84px', '20%', '26%', '20%', ''].map((w) => h('col', { style: w ? { width: w } : null }))),
              h('thead', null, h('tr', null, ['#', 'Severity', 'File:line', 'Issue', 'Fix', 'Rationale'].map((x) => h('th', null, x)))),
              h('tbody', null, rows)));
          }
          out.append(h('div', { class: 'gr-says' }, h('b', null, 'Gristle says: '), verdict(res, t)));
        }
        if (S.msg) out.append(h('div', { class: `gr-msg ${S.msg.k}` }, S.msg.t));
      }

      function refuse() {
        win.crash({
          title: 'Gristle has no patience left today', code: 'GRS-0x0000 PATIENCE_EXHAUSTED', icon: 'octopus',
          lines: ['PATIENCE is 0. It comes back at 00:00 UTC, as 3.', 'It has never been 4.', 'Gristle is not reviewing anything else today. This is not about you. It is about the code.'],
          actions: [{ label: 'Wait until tomorrow', primary: true, run: () => { OS.spend.tomorrow(); } }, { label: 'OK' }],
        });
      }
      async function run() {
        if (S.busy) return;
        const m = mood();
        if (m.left <= 0) { refuse(); return; }
        let t;
        try { t = currentTarget(); } catch (e) { S.msg = { k: 'bad', t: e.message }; drawOut(); return; }
        if (!t.text.trim()) { S.msg = { k: 'bad', t: 'There is nothing to review. I checked. It took no time and I still did not enjoy it.' }; drawOut(); return; }
        const cost = costFor(t);
        const r = OS.spend.add(cost, `gristle review: ${t.label}`, 'gristle');
        if (!r.ok) {
          win.crash({ title: 'Gristle will not read for free', code: 'GRS-0x0064 DAILY_CAP', icon: 'coins-outline', lines: [r.message, 'Gristle agrees with the cap. Gristle agrees with very little.'] });
          return;
        }
        S.busy = true; S.result = null; S.msg = null; S.log = [];
        drawBar();
        for (const g of grumbles(t)) {
          S.log.push(g);
          S.eyes = S.eyes === '◉ ◉ ' ? ' ◉ ◉' : '◉ ◉ ';
          drawCard(); drawOut();
          await win.sleep(230);
          if (win.closed) return;
        }
        const res = review(t);
        const fresh = mood();
        fresh.left = Math.max(0, fresh.left - 1); fresh.reviews += 1; fresh.lastTotal = res.total; fresh.lastHigh = res.counts.High;
        saveMood(fresh);
        S.busy = false; S.eyes = null;
        S.result = { t, res, cost };
        drawCard(); drawBar(); drawOut();
        out.scrollTop = 0;
        if (root.classList.contains('narrow')) root.scrollTop = right.offsetTop;
      }
      function applyBoring() {
        const R = S.result;
        if (!R) return;
        const fx = boringFix(R.t);
        if (!fx.ok) { S.msg = { k: 'bad', t: fx.why }; drawOut(); return; }
        if (R.t.kind === 'paste') {
          S.paste = fx.text; R.fixed = true;
          S.msg = { k: 'ok', t: `Removed trailing whitespace from ${fx.n} line${fx.n === 1 ? '' : 's'} of the pasted code. It is in the box above. Copy it back out yourself.` };
          drawSrc(); drawOut(); return;
        }
        try { OS.fs.write(R.t.path, fx.text); } catch (e) { S.msg = { k: 'bad', t: e.message }; drawOut(); return; }
        R.fixed = true;
        S.msg = { k: 'ok', t: `Removed trailing whitespace from ${fx.n} line${fx.n === 1 ? '' : 's'} in ${disp(R.t.path)}, and saved it. I have not read it again. Patience is finite.` };
        drawOut();
      }
      S.target = (a) => {
        if (!a) return;
        if (a.path) {
          const p = OS.fs.resolve(HOME, a.path);
          if (!OS.fs.isFile(p)) { S.msg = { k: 'bad', t: `${disp(p)}: No such file. I looked.` }; drawOut(); return; }
          S.kind = 'file'; S.file = p;
        } else if (typeof a.text === 'string') {
          S.kind = 'buffer'; S.buffer = { text: a.text, name: a.name || '[No Name]' };
        } else return;
        S.result = null; S.msg = null;
        drawBar(); drawSrc(); drawOut();
        if (!S.busy) run();
      };
      S.layout = () => root.classList.toggle('narrow', win.width < 820);
      S.off = OS.on('spend', () => { drawCard(); drawBar(); });
      win.every(3800, () => {
        if (S.busy || mood().left <= 0) return;
        S.eyes = '-  -'; drawCard();
        win.after(160, () => { S.eyes = null; drawCard(); });
      });

      S.layout(); drawCard(); drawBar(); drawSrc(); drawOut();
      if (arg) S.target(arg);
    },
    onArg(win, arg) { win.state.target?.(arg); },
    onResize(win) { win.state.layout?.(); },
    unmount(win) { win.state.off?.(); },
  });
})();
