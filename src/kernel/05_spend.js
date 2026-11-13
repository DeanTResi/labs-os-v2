// The spend ledger. Every app that "thinks" pays for it here. One daily cap, in UTC, like the real one.
(() => {
  const load = () => {
    const s = OS.store.get('spend', null);
    return s && s.day === OS.today() ? s : { day: OS.today(), usd: 0, tokens: 0, rows: [] };
  };
  let state = load();

  const save = () => OS.store.set('spend', state);
  const roll = () => { if (state.day !== OS.today()) { state = { day: OS.today(), usd: 0, tokens: 0, rows: [] }; save(); OS.emit('spend', OS.spend.summary()); } };

  OS.spend = {
    cap: OS.data.dailyCapUsd,
    today() { roll(); return state.usd; },
    tokens() { roll(); return state.tokens; },
    remaining() { return Math.max(0, this.cap - this.today()); },
    can(usd) { return this.today() + usd <= this.cap + 1e-9; },
    rows() { roll(); return state.rows.slice(); },
    summary() { return { day: state.day, usd: state.usd, tokens: state.tokens, cap: this.cap, remaining: this.remaining() }; },
    // Charge usd for label. Refuses (ok: false) when the charge would pass the daily cap.
    add(usd, label = 'unlabelled thinking', source = 'unknown', tokens = Math.round(usd * 52000)) {
      roll();
      if (!this.can(usd)) {
        const msg = `Today's spend is ${OS.usd(state.usd)} of the ${OS.usd(this.cap)} daily cap (UTC). Conclude your current experiment and stop until tomorrow.`;
        OS.emit('spend:cap', { usd, label, source, message: msg });
        return { ok: false, message: msg, ...this.summary() };
      }
      state.usd = Math.round((state.usd + usd) * 10000) / 10000;
      state.tokens += tokens;
      state.rows.unshift({ t: OS.now().toISOString().slice(11, 19), usd, label, source, tokens });
      state.rows.length = Math.min(state.rows.length, 200);
      save();
      OS.emit('spend', this.summary());
      return { ok: true, ...this.summary() };
    },
    // "Wait until tomorrow": moves the OS clock on one day. The cap resets. Nothing else does.
    tomorrow() {
      OS.dayOffset += 1;
      roll();
      OS.emit('spend', this.summary());
      return this.summary();
    },
  };
})();
