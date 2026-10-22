// The entry, driven the way the core drives it: `app` is stubbed and the clock
// is fixed, so this needs no isolate, no network and no settings. Run it with
//   deno test --allow-read main.test.ts

function assertEquals<T>(actual: T, expected: T, message = ""): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}
  actual:   ${a}
  expected: ${b}`);
}

async function assertRejects(fn: () => unknown, code: string): Promise<void> {
  try {
    await fn();
  } catch (e: any) {
    assertEquals(e.code, code);
    return;
  }
  throw new Error(`expected a ${code} error`);
}

const RealDate = Date;

/** Freeze "now" at a local wall-clock moment, as the machine would read it. */
function freeze(y: number, mo: number, d: number, h: number, mi: number, s = 0) {
  let now = new RealDate(y, mo - 1, d, h, mi, s).getTime();
  class FakeDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(now);
      else super(...(args as [any]));
    }
    static override now() { return now; }
  }
  (globalThis as any).Date = FakeDate;
  return { set(ms: number) { now = ms; }, local: (...a: number[]) => new RealDate(a[0], a[1] - 1, a[2], a[3], a[4], a[5] ?? 0).getTime() };
}

async function harness(stored: unknown = null) {
  const h = { spec: null as any, store: stored as any, posts: [] as any[] };
  (globalThis as any).app = {
    define(spec: any) { h.spec = spec; },
    emit() {},
    ui: { post(payload: unknown) { h.posts.push(payload); } },
    store: { get: () => h.store, set: (v: unknown) => { h.store = JSON.parse(JSON.stringify(v)); } },
  };
  await import(`./main.ts#${crypto.randomUUID()}`);
  return h;
}

function restore() {
  (globalThis as any).Date = RealDate;
}

Deno.test("first run targets today 09:15 local and stores it", async () => {
  const clock = freeze(2026, 10, 22, 9, 5);
  try {
    const h = await harness();
    const s = h.spec.commands.state();
    assertEquals(s.target.date, "2026-10-22");
    assertEquals(s.target.time, "09:15");
    assertEquals(s.now.date, "2026-10-22");
    assertEquals(s.now.time, "09:05:00");
    assertEquals(s.phase, "countdown");
    assertEquals(s.remainingMs, clock.local(2026, 10, 22, 9, 15) - clock.local(2026, 10, 22, 9, 5));
    assertEquals(h.store.date, "2026-10-22");
  } finally { restore(); }
});

Deno.test("zero and after is started, never rolled to tomorrow", async () => {
  const clock = freeze(2026, 10, 22, 9, 14, 59);
  try {
    const h = await harness();
    assertEquals(h.spec.commands.state().phase, "countdown");
    clock.set(clock.local(2026, 10, 22, 9, 15, 0));
    assertEquals(h.spec.commands.state().remainingMs, 0);
    assertEquals(h.spec.commands.state().phase, "started");
    // Past midnight, still the same target: started, not tomorrow.
    clock.set(clock.local(2026, 10, 23, 0, 30));
    const s = h.spec.commands.state();
    assertEquals([s.phase, s.target.date, s.now.date], ["started", "2026-10-22", "2026-10-23"]);
  } finally { restore(); }
});

Deno.test("opening after 09:15 today shows started for today", async () => {
  freeze(2026, 10, 22, 9, 30);
  try {
    const h = await harness();
    const s = h.spec.commands.state();
    assertEquals([s.phase, s.target.date], ["started", "2026-10-22"]);
  } finally { restore(); }
});

Deno.test("a stored past date is kept, not moved silently", async () => {
  freeze(2026, 10, 25, 12, 0);
  try {
    const h = await harness({ rev: 2, date: "2026-10-22", time: "19:15", title: "T", liveText: "L" });
    const s = h.spec.commands.state();
    assertEquals([s.phase, s.target.date], ["started", "2026-10-22"]);
    // The promo falls back to defaults when the stored settings lack one.
    assertEquals(s.settings.promo.price, "$99");
    // `today` is the explicit move.
    const t = h.spec.commands.today({ time: "20:00" });
    assertEquals([t.phase, t.target.date, t.target.time], ["countdown", "2026-10-25", "20:00"]);
  } finally { restore(); }
});

Deno.test("configure edits the target and copy, stores them and tells the window", async () => {
  freeze(2026, 10, 22, 9, 5);
  try {
    const h = await harness();
    const s = h.spec.commands.configure({
      date: "2026-11-05", time: "18:30", liveText: "We are live",
      promoText: "Get Wonop at", promoPrice: "$79", promoWas: "$199", promoShow: false,
    });
    assertEquals(s.target, { date: "2026-11-05", time: "18:30", iso: new Date(2026, 10, 5, 18, 30).toISOString() });
    assertEquals(h.store.liveText, "We are live");
    assertEquals(h.store.promo, { show: false, text: "Get Wonop at", url: "wonop.com", price: "$79", was: "$199" });
    const last = h.posts.at(-1);
    assertEquals([last.type, last.settings.promo.price], ["settings", "$79"]);
    // A reload reads them back.
    const again = await harness(h.store);
    assertEquals(again.spec.commands.state().settings.promo.was, "$199");
  } finally { restore(); }
});

Deno.test("settings saved before rev 2 take the corrected 09:15 once", async () => {
  freeze(2026, 10, 22, 9, 8);
  try {
    const h = await harness({ date: "2026-10-22", time: "19:15", title: "T", liveText: "L" });
    const s = h.spec.commands.state();
    assertEquals([s.target.date, s.target.time, s.settings.title, h.store.rev], ["2026-10-22", "09:15", "T", 2]);
    // A time chosen after the correction is kept.
    h.spec.commands.configure({ time: "19:15" });
    const again = await harness(h.store);
    assertEquals(again.spec.commands.state().target.time, "19:15");
  } finally { restore(); }
});

Deno.test("default promo copy is the provisional Wonop offer", async () => {
  freeze(2026, 10, 22, 9, 5);
  try {
    const h = await harness();
    const s = h.spec.commands.state().settings;
    assertEquals(s.liveText, "The stream starts now");
    assertEquals(s.promo, { show: true, text: "Buy Wonop at", url: "wonop.com", price: "$99", was: "$299" });
  } finally { restore(); }
});

Deno.test("bad dates and times are refused", async () => {
  freeze(2026, 10, 22, 9, 5);
  try {
    const h = await harness();
    await assertRejects(() => h.spec.commands.configure({ time: "25:00" }), "invalid_args");
    await assertRejects(() => h.spec.commands.configure({ time: "7pm" }), "invalid_args");
    await assertRejects(() => h.spec.commands.configure({ date: "2026-02-30" }), "invalid_args");
    assertEquals(h.spec.commands.state().target.time, "09:15");
  } finally { restore(); }
});
