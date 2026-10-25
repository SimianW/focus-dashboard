// Seeds ~60 days of realistic study blocks, each split across courses, ending today.
// Usage: node scripts/seed.ts <baseUrl> <password>
//   e.g. node scripts/seed.ts http://localhost:3100 devpassword
// Appends to whatever is already there; run it against an empty DATA_DIR.

const [baseUrl, password] = process.argv.slice(2);
if (!baseUrl || !password) {
  console.error("usage: node scripts/seed.ts <baseUrl> <password>");
  process.exit(1);
}

const DAYS = 60;
// Each course has its own typical focus, so per-course charts show a difference.
const COURSES: [string, number][] = [
  ["CS370", 0.04],
  ["CS341", 0],
  ["STAT231", -0.05],
  ["ECON101", -0.1],
];
const NOTES = ["", "", "", "", "刷题", "看网课", "复习错题", "做作业", "手机放在别的房间", "有点困"];

// Deterministic PRNG (mulberry32) so repeated seeds look the same.
let state = 20261023;
function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
// Local calendar date, never through UTC.
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type SessionInput = {
  date: string;
  start: string;
  end: string;
  courses: { course: string; minutes: number }[];
  energy: number | null;
  interruptions: number | null;
  note: string;
};

// Splits roughly `focus` minutes across the picked courses, in 5-minute steps.
function split(focus: number, courses: [string, number][]) {
  const weights = courses.map(() => 0.5 + rand());
  const total = weights.reduce((a, b) => a + b, 0);
  return courses
    .map(([course], i) => ({ course, minutes: Math.max(5, Math.round((focus * weights[i]) / total / 5) * 5) }))
    .filter((c) => c.minutes > 0);
}

function generate(): SessionInput[] {
  const out: SessionInput[] = [];
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (let i = DAYS - 1; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const date = localDate(day);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    if (rand() < (weekend ? 0.25 : 0.1)) continue; // a day off
    const progress = (DAYS - 1 - i) / (DAYS - 1); // 0 → 1 over the period
    // One to three study blocks: morning, afternoon, evening (some past midnight).
    const slots = [9 * 60, 14 * 60, 20 * 60 + 30].filter(() => rand() < (weekend ? 0.45 : 0.6));
    if (!slots.length) slots.push(14 * 60);
    for (const slot of slots) {
      let start = slot + Math.floor(rand() * 60) - 20;
      start -= start % 5;
      const span = 60 + Math.floor(rand() * 37) * 5; // 1–4 hours
      if (i === 0 && start + span > nowMin) continue; // nothing in the future today
      const picked = [...COURSES].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 3));
      const energy = clamp(Math.round(3 + (rand() - 0.5) * 3 + (slot < 12 * 60 ? 0.5 : 0) - (slot > 20 * 60 ? 1 : 0)), 1, 5);
      const interruptions = Math.max(0, Math.round(rand() * 4 - progress * 1.2 - (energy - 3) * 0.4));
      let ratio =
        0.56 +
        0.2 * progress + // getting better over the period
        picked.reduce((a, [, bias]) => a + bias, 0) / picked.length +
        (slot < 12 * 60 ? 0.05 : slot > 20 * 60 ? -0.05 : 0) +
        (energy - 3) * 0.03 -
        interruptions * 0.03 -
        Math.max(0, span - 150) * 0.0008 + // long blocks sag
        (rand() - 0.5) * 0.14;
      ratio = clamp(ratio, 0.2, 0.95);
      let courses = split(span * ratio, picked);
      while (courses.reduce((a, c) => a + c.minutes, 0) > span) courses = courses.map((c) => ({ ...c, minutes: c.minutes - 5 })).filter((c) => c.minutes > 0);
      out.push({
        date,
        start: hhmm(start),
        end: hhmm(start + span), // a late block can cross midnight
        courses,
        energy: rand() < 0.7 ? energy : null,
        interruptions: rand() < 0.5 ? interruptions : null,
        note: pick(NOTES),
      });
    }
  }
  return out;
}

async function main() {
  const login = await fetch(new URL("/api/login", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const sessions = generate();
  let ok = 0;
  for (const s of sessions) {
    const res = await fetch(new URL("/api/sessions", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(s),
    });
    if (!res.ok) throw new Error(`POST ${JSON.stringify(s)} failed: ${res.status} ${await res.text()}`);
    ok++;
  }
  const days = new Set(sessions.map((s) => s.date)).size;
  console.log(`seeded ${ok} sessions over ${days} days (${DAYS - days} empty days)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
