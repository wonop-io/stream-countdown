// Stream Countdown: a broadcast countdown to one moment on one local date.
//
// The isolate owns the settings; the window is a view of them and ticks on its
// own clock. The date is pinned when the settings are first made, so a
// countdown left open past midnight shows "started" for its own day rather
// than quietly rolling over to tomorrow.

interface Promo {
  show: boolean;
  text: string;
  url: string;
  price: string;
  was: string;
}

interface Settings {
  rev: number;
  date: string; // YYYY-MM-DD, local
  time: string; // HH:MM, local, 24h
  title: string; // above the digits while counting down
  liveText: string; // at zero and after
  promo: Promo;
}

const DEFAULT_TIME = "09:15";
// Settings saved before rev 2 carried the mistaken 19:15 default; rev 2 takes
// the corrected default time once and keeps everything else.
const REV = 2;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  } catch {
    return "local";
  }
}

function defaults(now: Date): Settings {
  return {
    rev: REV,
    date: localDate(now),
    time: DEFAULT_TIME,
    title: "Live stream starts in",
    liveText: "The stream starts now",
    // Provisional copy, not verified marketing facts; editable in the window.
    promo: { show: true, text: "Buy Wonop at", url: "wonop.com", price: "$99", was: "$299" },
  };
}

function invalid(message: string): Error {
  const e: any = new Error(message);
  e.code = "invalid_args";
  return e;
}

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return localDate(d) === s;
}

function validTime(s: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  return !!m && +m[1] < 24 && +m[2] < 60;
}

/** The target as an instant, read in this machine's local time zone. */
function targetMs(s: Settings): number {
  const [y, mo, d] = s.date.split("-").map(Number);
  const [h, mi] = s.time.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

function load(): Settings {
  const saved = app.store.get();
  if (saved && validDate(saved.date) && validTime(saved.time)) {
    const base = defaults(new Date());
    const merged: Settings = { ...base, ...saved, promo: { ...base.promo, ...(saved.promo ?? {}) } };
    if (!(saved.rev >= REV)) {
      merged.rev = REV;
      merged.time = DEFAULT_TIME;
      app.store.set(merged);
    }
    return merged;
  }
  const fresh = defaults(new Date());
  app.store.set(fresh);
  return fresh;
}

let settings = load();

function state(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const target = targetMs(settings);
  const remainingMs = target - nowMs;
  return {
    phase: remainingMs > 0 ? "countdown" : "started",
    remainingMs,
    timeZone: timeZone(),
    now: { date: localDate(now), time: localTime(now), iso: now.toISOString() },
    target: { date: settings.date, time: settings.time, iso: new Date(target).toISOString() },
    settings,
  };
}

function broadcast(windowId?: string) {
  app.ui.post({ type: "settings", settings, timeZone: timeZone() }, windowId);
}

function str(v: unknown, field: string, max = 120): string {
  if (typeof v !== "string") throw invalid(`${field} must be text`);
  const t = v.trim();
  if (t.length > max) throw invalid(`${field} is longer than ${max} characters`);
  return t;
}

function configure(args: Record<string, unknown>) {
  const next: Settings = { ...settings, promo: { ...settings.promo } };
  if (args.date !== undefined) {
    const d = str(args.date, "date");
    if (!validDate(d)) throw invalid("date must be YYYY-MM-DD");
    next.date = d;
  }
  if (args.time !== undefined) {
    const t = str(args.time, "time");
    if (!validTime(t)) throw invalid("time must be HH:MM, 24-hour");
    next.time = t;
  }
  if (args.title !== undefined) next.title = str(args.title, "title");
  if (args.liveText !== undefined) next.liveText = str(args.liveText, "liveText");
  if (args.promoShow !== undefined) {
    if (typeof args.promoShow !== "boolean") throw invalid("promoShow must be true or false");
    next.promo.show = args.promoShow;
  }
  if (args.promoText !== undefined) next.promo.text = str(args.promoText, "promoText");
  if (args.promoUrl !== undefined) next.promo.url = str(args.promoUrl, "promoUrl");
  if (args.promoPrice !== undefined) next.promo.price = str(args.promoPrice, "promoPrice", 24);
  if (args.promoWas !== undefined) next.promo.was = str(args.promoWas, "promoWas", 24);
  settings = next;
  app.store.set(settings);
  broadcast();
  return state();
}

{
  const s = state();
  console.log(`countdown: target ${s.target.date} ${s.target.time} ${s.timeZone}, now ${s.now.date} ${s.now.time}, ${s.phase}, ${Math.round(s.remainingMs / 1000)} s left`);
}

app.define({
  commands: {
    /** Where the countdown stands, in this machine's local time. */
    state() {
      return state();
    },
    configure(args: Record<string, unknown> = {}) {
      return configure(args);
    },
    /** Point the countdown at today's local date (time kept unless given). */
    today({ time }: { time?: string } = {}) {
      return configure({ date: localDate(new Date()), ...(time !== undefined ? { time } : {}) });
    },
    reset() {
      settings = defaults(new Date());
      app.store.set(settings);
      broadcast();
      return state();
    },
  },

  onOpen({ windowId }: { windowId: string }) {
    broadcast(windowId);
  },

  onMessage({ payload: msg, windowId }: { payload: any; windowId?: string }) {
    if (msg?.type === "__ui_ready") broadcast(windowId);
  },
});
