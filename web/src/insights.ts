// Pattern analyses for the Patterns page: each returns chart-ready rows plus a
// one-line takeaway in the UI language, or null when the data is too thin to
// say anything honest. The numbers are worked out here; the sentences that
// carry them live in the dictionaries so each language can phrase them its own way.
import type { Messages } from "./i18n";
import {
  aggregateBy,
  dateRange,
  distribution,
  histogram,
  linearFit,
  monthKey,
  pearson,
  sessionRatio,
  sessionSpan,
  startHour,
  weekStart,
  weekday,
  weightedRatio,
  courseStats,
  type Bucket,
  type Session,
} from "./stats";

/** Buckets with fewer sessions than this are drawn faded and never "win" a takeaway. */
export const MIN_BUCKET = 3;
/** Fewest sessions for a scatter or correlation to be shown at all. */
export const MIN_CORR = 8;

const ratioOr0 = (b: Bucket<unknown>) => b.ratio ?? 0;

export function byHour(sessions: Session[], m: Messages) {
  if (sessions.length < MIN_CORR) return null;
  const hours = sessions.map(startHour);
  const lo = Math.min(...hours);
  const hi = Math.max(...hours);
  const keys = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const buckets = aggregateBy(sessions, startHour, keys);
  const bars = buckets.map((b) => ({ label: m.insights.hourLabel(b.key), ratio: b.ratio, n: b.n, weak: b.n < MIN_BUCKET }));
  // Best two-hour window of start times, so one lucky session cannot win.
  let best: { h: number; ratio: number; n: number } | null = null;
  for (let i = 0; i < buckets.length; i++) {
    const pair = buckets.slice(i, i + 2);
    const list = sessions.filter((s) => pair.some((b) => b.key === startHour(s)));
    const ratio = weightedRatio(list);
    if (list.length >= MIN_BUCKET + 1 && ratio !== null && (!best || ratio > best.ratio)) best = { h: buckets[i].key, ratio, n: list.length };
  }
  const overall = weightedRatio(sessions)!;
  const takeaway = best ? m.insights.hour(best.h, best.ratio, best.n, overall) : m.insights.hourThin;
  return { bars, takeaway };
}

export function byWeekday(sessions: Session[], m: Messages) {
  if (sessions.length < MIN_CORR) return null;
  const buckets = aggregateBy(sessions, (s) => weekday(s.date), [0, 1, 2, 3, 4, 5, 6]);
  const bars = buckets.map((b) => ({ label: m.fmt.weekdays[b.key], ratio: b.ratio, n: b.days, weak: b.days < 2 }));
  const ok = buckets.filter((b) => b.days >= 2);
  if (ok.length < 2) return { bars, takeaway: m.insights.weekdayThin };
  const top = ok.reduce((a, b) => (ratioOr0(b) > ratioOr0(a) ? b : a));
  const low = ok.reduce((a, b) => (ratioOr0(b) < ratioOr0(a) ? b : a));
  return { bars, takeaway: m.insights.weekday(top.key, top.ratio, low.key, low.ratio) };
}

export function lengthVsRatio(sessions: Session[], m: Messages) {
  if (sessions.length < MIN_CORR) return null;
  const xs = sessions.map(sessionSpan);
  const ys = sessions.map(sessionRatio);
  const r = pearson(xs, ys);
  const med = distribution(xs)!.median;
  const short = weightedRatio(sessions.filter((s) => sessionSpan(s) <= med));
  const long = weightedRatio(sessions.filter((s) => sessionSpan(s) > med));
  const points = sessions.map((s) => ({ x: sessionSpan(s), y: sessionRatio(s), label: `${s.date} ${s.start}–${s.end}` }));
  const takeaway = r ? m.insights.length(r, med, short, long) : m.insights.lengthFlat;
  return { points, r, takeaway };
}

export function energyVsRatio(sessions: Session[], m: Messages) {
  const rated = sessions.filter((s) => s.energy !== null);
  if (rated.length < MIN_CORR) return null;
  const buckets = aggregateBy(rated, (s) => s.energy!, [1, 2, 3, 4, 5]);
  const bars = buckets.map((b) => ({ label: m.insights.energyLabel(b.key), ratio: b.ratio, n: b.n, weak: b.n < MIN_BUCKET }));
  const r = pearson(rated.map((s) => s.energy!), rated.map(sessionRatio));
  const hi = weightedRatio(rated.filter((s) => s.energy! >= 4));
  const lo = weightedRatio(rated.filter((s) => s.energy! <= 2));
  const takeaway = r ? m.insights.energy(r, hi, lo) : m.insights.energyFlat;
  return { bars, r, takeaway };
}

export function interruptionsVsRatio(sessions: Session[], m: Messages) {
  const counted = sessions.filter((s) => s.interruptions !== null);
  if (counted.length < MIN_CORR) return null;
  const bin = (s: Session) => Math.min(4, s.interruptions!);
  const buckets = aggregateBy(counted, bin, [0, 1, 2, 3, 4]);
  const bars = buckets.map((b) => ({ label: m.insights.intrLabel(b.key, b.key === 4), ratio: b.ratio, n: b.n, weak: b.n < MIN_BUCKET }));
  const xs = counted.map((s) => s.interruptions!);
  const ys = counted.map(sessionRatio);
  const r = pearson(xs, ys);
  const fit = linearFit(xs.map((x, i) => ({ x, y: ys[i] })));
  // The per-interruption effect is only worth stating once there is some relationship.
  const takeaway = r && fit ? m.insights.intr(r, Math.abs(r.r) >= 0.1 ? fit.slope : null) : m.insights.intrFlat;
  return { bars, r, takeaway };
}

export const HIST_WIDTH = 0.1;

export function ratioDistribution(sessions: Session[], m: Messages) {
  if (sessions.length < 5) return null;
  const ratios = sessions.map(sessionRatio);
  const d = distribution(ratios)!;
  return {
    bins: histogram(ratios, HIST_WIDTH),
    stats: d,
    takeaway: m.insights.dist(d.p25, d.p75, d.median),
  };
}

export type PeriodRow = { key: string; label: string; focus: number; span: number; ratio: number | null; days: number; n: number };

export function periods(sessions: Session[], unit: "week" | "month", m: Messages): { rows: PeriodRow[]; takeaway: string } | null {
  const keyOf = unit === "week" ? (s: Session) => weekStart(s.date) : (s: Session) => monthKey(s.date);
  if (!sessions.length) return null;
  // Every calendar week/month from the first to the last, so empty ones show as gaps.
  const dates = sessions.map((s) => s.date).sort();
  const keys = [...new Set(dateRange(dates[0], dates[dates.length - 1]).map((d) => keyOf({ date: d } as Session)))];
  if (keys.length < 2) return null;
  const buckets = aggregateBy(sessions, keyOf, keys);
  const label = (k: string) =>
    unit === "week" ? m.insights.weekLabel(k) : m.insights.monthLabel(k, k.slice(0, 4) === new Date().getFullYear().toString());
  const rows = buckets.map((b) => ({ ...b, label: label(b.key) }));
  const [prev, last] = rows.slice(-2);
  const delta = last.ratio !== null && prev.ratio !== null ? last.ratio - prev.ratio : null;
  return { rows, takeaway: m.insights.period(unit, last.label, last.focus, last.ratio, delta) };
}

/** Blocks a course needs before its ratio can be called the best or worst. */
export const MIN_COURSE_BLOCKS = 3;

export function byCourse(sessions: Session[], m: Messages) {
  const { courses, unattributedSpan } = courseStats(sessions);
  if (!courses.length) return null;
  const most = courses[0];
  const { best, worst } = bestAndWorst(courses, MIN_COURSE_BLOCKS);
  return { rows: courses, unattributedSpan, takeaway: m.insights.course(most, best, worst, courses.length < 2) };
}

/**
 * The most and least focused courses among those with at least `minBlocks`
 * blocks, or nulls when fewer than two qualify.
 */
export function bestAndWorst<C extends { ratio: number | null; blocks: number }>(courses: readonly C[], minBlocks: number) {
  const eligible = courses.filter((c) => c.blocks >= minBlocks && c.ratio !== null);
  if (eligible.length < 2) return { best: null, worst: null };
  return {
    best: eligible.reduce((a, b) => (b.ratio! > a.ratio! ? b : a)),
    worst: eligible.reduce((a, b) => (b.ratio! < a.ratio! ? b : a)),
  };
}
