// Shell command registry. The terminal app runs these; any app may add its own.
(() => {
  const cmds = new Map();
  const aliases = new Map();

  OS.commands = {
    // spec: {desc, usage, hidden, run(args, io) -> exit code | Promise, complete(args) -> [strings]}
    register(name, spec) {
      if (!name || typeof spec?.run !== 'function') { console.error('[OS] commands.register needs (name, {run})'); return; }
      if (cmds.has(name)) console.warn(`[OS] command '${name}' registered twice; the second one wins`);
      cmds.set(name, { name, desc: '', usage: name, hidden: false, ...spec });
    },
    alias(name, target) { aliases.set(name, target); },
    get(name) {
      const n = name.replace(/^\.\//, '');
      const key = cmds.has(n) ? n : aliases.get(n);
      return key ? cmds.get(key) : null;
    },
    list() { return [...cmds.values()].filter((c) => !c.hidden).sort((a, b) => a.name.localeCompare(b.name)); },
    names() { return [...cmds.keys(), ...aliases.keys()].sort(); },
  };

  // Open a terminal and run a command line in it. Used by the launcher (">" prefix) and the Labs menu.
  OS.exec = (line) => OS.open('terminal', { run: line });
})();
