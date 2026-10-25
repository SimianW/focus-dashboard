// Pure statistics over study sessions. No DOM, no fetch, no Date parsing of
// "YYYY-MM-DD" strings: calendar dates are handled as day numbers so local
// dates never shift through a time zone.

export type CourseTime = { course: string; minutes: number };

/** A study block: one start–end span, its focused minutes split across courses. */
export type Session = {
  id: number;
  date: string; // YYYY-MM-DD, the day the session started
  start: string; // HH:MM
  end: string; // HH:MM; at or before start means it crossed midnight
  courses: CourseTime[]; // each course once; the minutes sum to the focus time

  energy: number | null;
  interruptions: number | null;
  note: string;
};

export type SessionInput = Omit<Session, "id">;

export type Language = "en" | "zh";

export type Settings = { dailyGoalMin: number; targetRatio: number; language: Language };

// ---------- dates ----------

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 for a calendar date. Pure arithmetic, zone-free. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const addDays = (date: string, n: number) => fromDayNumber(dayNumber(date) + n);

export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/** 0 = Monday … 6 = Sunday. 1970-01-01 was a Thursday. */
export const weekday = (date: string) => (((dayNumber(date) + 3) % 7) + 7) % 7;

/** Monday of the week containing date. */
export const weekStart = (date: string) => addDays(date, -weekday(date));

export const monthKey = (date: string) => date.slice(0, 7);

/** Today's local calendar date. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function localTime(now = new Date()): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let n = dayNumber(from), end = dayNumber(to); n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ---------- sessions ----------

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes from start to end; an end at or before the start crosses midnight. */
export function spanMin(start: string, end: string): number {
  const d = toMinutes(end) - toMinutes(start);
  return d > 0 ? d : d + 24 * 60;
}

/** Minutes since `start` for a block still running (0 right after starting). */
export const elapsedMin = (start: string, now: string) => (((toMinutes(now) - toMinutes(start)) % 1440) + 1440) % 1440;

export const sessionSpan = (s: Pick<Session, "start" | "end">) => spanMin(s.start, s.end);

export const crossesMidnight = (s: Pick<Session, "start" | "end">) => toMinutes(s.end) <= toMinutes(s.start);

/** Focused minutes of a block: the sum of its course minutes. */
export const sessionFocus = (s: Pick<Session, "courses">) => s.courses.reduce((a, c) => a + c.minutes, 0);

/** focus / span for one session. */
export const sessionRatio = (s: Pick<Session, "start" | "end" | "courses">) => sessionFocus(s) / sessionSpan(s);

type Totals = { focus: number; span: number; n: number };

function totals(list: readonly Session[]): Totals {
  let focus = 0;
  let span = 0;
  for (const s of list) {
    focus += sessionFocus(s);
    span += sessionSpan(s);
  }
  return { focus, span, n: list.length };
}

/** Time-weighted ratio Σfocus / Σspan; null when there is no time at all. */
export function weightedRatio(list: readonly Session[]): number | null {
  const t = totals(list);
  return t.span > 0 ? t.focus / t.span : null;
}

/** Unweighted mean of per-session ratios; every session counts once. */
export function meanSessionRatio(list: readonly Session[]): number | null {
  return list.length ? mean(list.map(sessionRatio)) : null;
}

// ---------- days ----------

export type Day = {
  date: string;
  focus: number; // minutes, 0 on a day without sessions
  span: number;
  n: number;
  ratio: number | null; // null on a day without sessions: a gap, not a zero
};

/** One entry per calendar day from..to inclusive, empty days included. */
export function dailySeries(sessions: readonly Session[], from: string, to: string): Day[] {
  const byDate = groupBy(sessions, (s) => s.date);
  return dateRange(from, to).map((date) => {
    const t = totals(byDate.get(date) ?? []);
    return { date, ...t, ratio: t.span > 0 ? t.focus / t.span : null };
  });
}

/** Trailing-window ratio Σfocus/Σspan over the `window` calendar days ending at each day. */
export function rollingRatio(days: readonly Day[], window = 7): (number | null)[] {
  // Index by day number so a series with holes still uses calendar days.
  const map = new Map(days.map((d) => [dayNumber(d.date), d]));
  return days.map((d) => {
    const end = dayNumber(d.date);
    let focus = 0;
    let span = 0;
    for (let n = end - window + 1; n <= end; n++) {
      const x = map.get(n);
      if (x) {
        focus += x.focus;
        span += x.span;
      }
    }
    return span > 0 ? focus / span : null;
  });
}

/** Totals for the `length` days ending at `end` (inclusive). */
export function windowTotals(sessions: readonly Session[], end: string, length: number) {
  const from = addDays(end, -(length - 1));
  const list = sessions.filter((s) => s.date >= from && s.date <= end);
  const t = totals(list);
  return { ...t, ratio: t.span > 0 ? t.focus / t.span : null, activeDays: new Set(list.map((s) => s.date)).size };
}

/** Compare the last `length` days ending today with the `length` days before. */
export function compareWindows(sessions: readonly Session[], today: string, length: number) {
  const current = windowTotals(sessions, today, length);
  const previous = windowTotals(sessions, addDays(today, -length), length);
  const delta = current.ratio !== null && previous.ratio !== null ? current.ratio - previous.ratio : null;
  return { current, previous, delta };
}

/**
 * Consecutive days meeting the focus goal, ending today. Today still counts as
 * in progress: if it has not met the goal yet the streak runs through yesterday.
 */
export function goalStreak(sessions: readonly Session[], goalMin: number, today: string): number {
  if (goalMin <= 0) return 0;
  const focusByDate = new Map<string, number>();
  for (const s of sessions) focusByDate.set(s.date, (focusByDate.get(s.date) ?? 0) + sessionFocus(s));
  const met = (d: string) => (focusByDate.get(d) ?? 0) >= goalMin;
  let day = met(today) ? today : addDays(today, -1);
  let streak = 0;
  while (met(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

// ---------- trend & correlation ----------

export type Trend = {
  slope: number; // ratio per day
  intercept: number; // ratio at x = 0
  r2: number;
  n: number;
  ppPerWeek: number; // slope as percentage points per week
};

/** Ordinary least squares y = intercept + slope·x. Null with fewer than 2 distinct x. */
export function linearFit(points: readonly { x: number; y: number }[]): Omit<Trend, "ppPerWeek"> | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2, n };
}

export const MIN_TREND_DAYS = 5;

/**
 * Trend of the daily ratio against day index (0 = first day of `days`).
 * Gap days are skipped. Needs MIN_TREND_DAYS days with data.
 */
export function dailyTrend(days: readonly Day[]): Trend | null {
  if (!days.length) return null;
  const first = dayNumber(days[0].date);
  const points = days.filter((d) => d.ratio !== null).map((d) => ({ x: dayNumber(d.date) - first, y: d.ratio! }));
  if (points.length < MIN_TREND_DAYS) return null;
  const fit = linearFit(points);
  return fit && { ...fit, ppPerWeek: fit.slope * 7 * 100 };
}

/** Pearson correlation coefficient. Null with n < 3 or zero variance. */
export function pearson(xs: readonly number[], ys: readonly number[]): { r: number; n: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0 || syy === 0) return null;
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

// ---------- distributions ----------

export function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Quantile with linear interpolation between order statistics (q in 0..1). */
export function quantile(xs: readonly number[], q: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export type Distribution = { n: number; mean: number; median: number; sd: number; p25: number; p75: number };

/** Summary statistics; sd is the sample standard deviation (n − 1). */
export function distribution(xs: readonly number[]): Distribution | null {
  if (!xs.length) return null;
  const m = mean(xs);
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) : 0;
  return { n: xs.length, mean: m, median: quantile(xs, 0.5), sd, p25: quantile(xs, 0.25), p75: quantile(xs, 0.75) };
}

/** Counts of values in [i·width, (i+1)·width); the last bin includes `max`. */
export function histogram(xs: readonly number[], width: number, max = 1): number[] {
  const bins = new Array(Math.round(max / width)).fill(0);
  for (const x of xs) bins[Math.min(bins.length - 1, Math.max(0, Math.floor(x / width + 1e-9)))]++;
  return bins;
}

// ---------- grouping ----------

export type Bucket<K> = { key: K; focus: number; span: number; n: number; ratio: number | null; days: number };

/** Groups sessions and returns time-weighted totals per key, in key order of `keys` if given. */
export function aggregateBy<K>(sessions: readonly Session[], keyOf: (s: Session) => K, keys?: readonly K[]): Bucket<K>[] {
  const groups = groupBy(sessions, keyOf);
  const order = keys ?? [...groups.keys()];
  return order.map((key) => {
    const list = groups.get(key) ?? [];
    const t = totals(list);
    return { key, ...t, ratio: t.span > 0 ? t.focus / t.span : null, days: new Set(list.map((s) => s.date)).size };
  });
}

export const startHour = (s: Session) => Math.floor(toMinutes(s.start) / 60);

export function groupBy<T, K>(list: readonly T[], keyOf: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of list) {
    const k = keyOf(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

// ---------- courses ----------
//
// Per-course minutes are recorded, per-course span is not. Each block's span
// is apportioned to its courses by their share of the block's focus:
//   attributedSpan_c = span × minutes_c / blockFocus
// so a course's ratio Σminutes_c / ΣattributedSpan_c is the time-weighted
// mean of the ratios of the blocks it appears in (weighted by attributed span,
// the same weighting as the day ratio). Blocks with no focus have
// nothing to apportion by; their span stays unattributed.

export type CourseStat = {
  course: string;
  minutes: number;
  span: number; // attributed span
  ratio: number | null;
  blocks: number;
  days: number;
  lastDate: string;
  share: number; // of all course minutes in the list, 0..1
};

/** Each course's minutes and attributed span within one block. */
export function apportion(s: Session): { course: string; minutes: number; span: number }[] {
  const focus = sessionFocus(s);
  if (focus <= 0) return [];
  const span = sessionSpan(s);
  return s.courses.map((c) => ({ course: c.course, minutes: c.minutes, span: (span * c.minutes) / focus }));
}

/** Per-course totals, most minutes first, plus the span no course can claim. */
export function courseStats(sessions: readonly Session[]): { courses: CourseStat[]; unattributedSpan: number } {
  const acc = new Map<string, { minutes: number; span: number; blocks: number; days: Set<string>; lastDate: string }>();
  let unattributedSpan = 0;
  let total = 0;
  for (const s of sessions) {
    const parts = apportion(s);
    if (!parts.length) unattributedSpan += sessionSpan(s);
    for (const p of parts) {
      if (p.minutes <= 0) continue;
      const a = acc.get(p.course) ?? { minutes: 0, span: 0, blocks: 0, days: new Set<string>(), lastDate: s.date };
      a.minutes += p.minutes;
      a.span += p.span;
      a.blocks++;
      a.days.add(s.date);
      if (s.date > a.lastDate) a.lastDate = s.date;
      acc.set(p.course, a);
      total += p.minutes;
    }
  }
  const courses = [...acc.entries()]
    .map(([course, a]) => ({
      course,
      minutes: a.minutes,
      span: a.span,
      ratio: a.span > 0 ? a.minutes / a.span : null,
      blocks: a.blocks,
      days: a.days.size,
      lastDate: a.lastDate,
      share: total > 0 ? a.minutes / total : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.course.localeCompare(b.course));
  return { courses, unattributedSpan };
}

/**
 * Courses in colour-slot order: by all-time minutes, so a filter or a date
 * range never repaints a course. Pass every session, not a filtered list.
 */
export const courseOrder = (sessions: readonly Session[]) => courseStats(sessions).courses.map((c) => c.course);

/** Minutes per course for each period key, courses in `order`. */
export function courseMinutesBy(
  sessions: readonly Session[],
  keyOf: (s: Session) => string,
  keys: readonly string[],
  order: readonly string[],
): Map<string, number[]> {
  const index = new Map(keys.map((k, i) => [k, i]));
  const out = new Map(order.map((c) => [c, new Array(keys.length).fill(0) as number[]]));
  for (const s of sessions) {
    const i = index.get(keyOf(s));
    if (i === undefined) continue;
    for (const c of s.courses) {
      const row = out.get(c.course);
      if (row) row[i] += c.minutes;
    }
  }
  return out;
}

/** One course's ratio per period key (null where it was not studied). */
export function courseRatioBy(sessions: readonly Session[], course: string, keyOf: (s: Session) => string, keys: readonly string[]) {
  const index = new Map(keys.map((k, i) => [k, i]));
  const min = new Array(keys.length).fill(0);
  const span = new Array(keys.length).fill(0);
  for (const s of sessions) {
    const i = index.get(keyOf(s));
    if (i === undefined) continue;
    for (const p of apportion(s)) {
      if (p.course !== course) continue;
      min[i] += p.minutes;
      span[i] += p.span;
    }
  }
  return keys.map((_, i) => (span[i] > 0 ? min[i] / span[i] : null));
}

/** Least-squares trend of one course's daily ratio; needs MIN_TREND_DAYS days with that course. */
export function courseTrend(sessions: readonly Session[], course: string): Trend | null {
  const dates = [...new Set(sessions.filter((s) => s.courses.some((c) => c.course === course)).map((s) => s.date))].sort();
  if (dates.length < MIN_TREND_DAYS) return null;
  const ratios = courseRatioBy(sessions, course, (s) => s.date, dates);
  const first = dayNumber(dates[0]);
  const fit = linearFit(dates.map((d, i) => ({ x: dayNumber(d) - first, y: ratios[i]! })));
  return fit && { ...fit, ppPerWeek: fit.slope * 7 * 100 };
}

/** Names as the user typed them, trimmed; empty names dropped and repeats merged. */
export function normalizeCourses(list: readonly { course: string; minutes: number }[]): CourseTime[] {
  const out = new Map<string, number>();
  for (const c of list) {
    const name = c.course.trim();
    if (!name || !(c.minutes > 0)) continue;
    out.set(name, (out.get(name) ?? 0) + c.minutes);
  }
  return [...out.entries()].map(([course, minutes]) => ({ course, minutes }));
}

// ---------- formatting ----------
// Language-dependent formatting (durations, dates, weekday names) lives in
// the dictionaries under src/i18n; a percentage reads the same in both.

export const formatPct = (r: number | null, digits = 0) => (r === null ? "—" : `${(r * 100).toFixed(digits)}%`);
