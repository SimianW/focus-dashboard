// Pattern analyses for the 规律 page: each returns chart-ready rows plus a
// one-line takeaway, or null when the data is too thin to say anything honest.
import {
  aggregateBy,
  dateRange,
  distribution,
  formatMinutes,
  formatPct,
  formatPp,
  histogram,
  linearFit,
  monthKey,
  pearson,
  sessionRatio,
  sessionSpan,
  startHour,
  weekStart,
  weekday,
  WEEKDAYS,
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

export function strength(r: number): string {
  const a = Math.abs(r);
  if (a < 0.1) return "几乎没有关系";
  const word = a < 0.3 ? "弱" : a < 0.5 ? "中等" : "较强";
  return `${word}${r > 0 ? "正" : "负"}相关`;
}

export const rText = (r: { r: number; n: number }) => `r = ${r.r.toFixed(2).replace("-", "−")}，n = ${r.n}`;

function periodName(h: number) {
  if (h < 6) return "凌晨";
  if (h < 12) return "上午";
  if (h < 18) return "下午";
  return "晚上";
}

export function byHour(sessions: Session[]) {
  if (sessions.length < MIN_CORR) return null;
  const hours = sessions.map(startHour);
  const lo = Math.min(...hours);
  const hi = Math.max(...hours);
  const keys = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const buckets = aggregateBy(sessions, startHour, keys);
  const bars = buckets.map((b) => ({ label: `${b.key}点`, ratio: b.ratio, n: b.n, weak: b.n < MIN_BUCKET }));
  // Best two-hour window of start times, so one lucky session cannot win.
  let best: { h: number; ratio: number; n: number } | null = null;
  for (let i = 0; i < buckets.length; i++) {
    const pair = buckets.slice(i, i + 2);
    const list = sessions.filter((s) => pair.some((b) => b.key === startHour(s)));
    const ratio = weightedRatio(list);
    if (list.length >= MIN_BUCKET + 1 && ratio !== null && (!best || ratio > best.ratio)) best = { h: buckets[i].key, ratio, n: list.length };
  }
  const overall = weightedRatio(sessions)!;
  const takeaway = best
    ? `${periodName(best.h)} ${best.h}–${best.h + 2} 点开始的学习专注率最高（${formatPct(best.ratio)}，${best.n} 次），整体为 ${formatPct(overall)}。`
    : "每个时段的记录还太少，多记几天再看。";
  return { bars, takeaway };
}

export function byWeekday(sessions: Session[]) {
  if (sessions.length < MIN_CORR) return null;
  const buckets = aggregateBy(sessions, (s) => weekday(s.date), [0, 1, 2, 3, 4, 5, 6]);
  const bars = buckets.map((b) => ({ label: WEEKDAYS[b.key], ratio: b.ratio, n: b.days, weak: b.days < 2 }));
  const ok = buckets.filter((b) => b.days >= 2);
  if (ok.length < 2) return { bars, takeaway: "还没有足够多的星期可比，多记几周再看。" };
  const top = ok.reduce((a, b) => (ratioOr0(b) > ratioOr0(a) ? b : a));
  const low = ok.reduce((a, b) => (ratioOr0(b) < ratioOr0(a) ? b : a));
  return {
    bars,
    takeaway: `${WEEKDAYS[top.key]}专注率最高（${formatPct(top.ratio)}），${WEEKDAYS[low.key]}最低（${formatPct(low.ratio)}）。`,
  };
}

export function lengthVsRatio(sessions: Session[]) {
  if (sessions.length < MIN_CORR) return null;
  const xs = sessions.map(sessionSpan);
  const ys = sessions.map(sessionRatio);
  const r = pearson(xs, ys);
  const med = distribution(xs)!.median;
  const short = weightedRatio(sessions.filter((s) => sessionSpan(s) <= med));
  const long = weightedRatio(sessions.filter((s) => sessionSpan(s) > med));
  const points = sessions.map((s) => ({ x: sessionSpan(s), y: sessionRatio(s), label: `${s.date} ${s.start}–${s.end}` }));
  const takeaway = r
    ? `时长与专注率${strength(r.r)}（${rText(r)}）。不超过 ${formatMinutes(med)} 的学习专注率 ${formatPct(short)}，更长的 ${formatPct(long)}。`
    : "时长都差不多，看不出关系。";
  return { points, r, takeaway };
}

export function energyVsRatio(sessions: Session[]) {
  const rated = sessions.filter((s) => s.energy !== null);
  if (rated.length < MIN_CORR) return null;
  const buckets = aggregateBy(rated, (s) => s.energy!, [1, 2, 3, 4, 5]);
  const bars = buckets.map((b) => ({ label: `精力 ${b.key}`, ratio: b.ratio, n: b.n, weak: b.n < MIN_BUCKET }));
  const r = pearson(rated.map((s) => s.energy!), rated.map(sessionRatio));
  const hi = weightedRatio(rated.filter((s) => s.energy! >= 4));
  const lo = weightedRatio(rated.filter((s) => s.energy! <= 2));
  const parts = [hi !== null && `精力 4–5 时专注率 ${formatPct(hi)}`, lo !== null && `1–2 时 ${formatPct(lo)}`].filter(Boolean);
  const takeaway = r ? `精力与专注率${strength(r.r)}（${rText(r)}）${parts.length ? `：${parts.join("，")}` : ""}。` : "精力评分都一样，看不出关系。";
  return { bars, r, takeaway };
}

export function interruptionsVsRatio(sessions: Session[]) {
  const counted = sessions.filter((s) => s.interruptions !== null);
  if (counted.length < MIN_CORR) return null;
  const bin = (s: Session) => Math.min(4, s.interruptions!);
  const buckets = aggregateBy(counted, bin, [0, 1, 2, 3, 4]);
  const bars = buckets.map((b) => ({ label: b.key === 4 ? "4 次以上" : `${b.key} 次`, ratio: b.ratio, n: b.n, weak: b.n < MIN_BUCKET }));
  const xs = counted.map((s) => s.interruptions!);
  const ys = counted.map(sessionRatio);
  const r = pearson(xs, ys);
  const fit = linearFit(xs.map((x, i) => ({ x, y: ys[i] })));
  let takeaway = "打断次数都一样，看不出关系。";
  if (r && fit) {
    takeaway = `打断与专注率${strength(r.r)}（${rText(r)}）`;
    if (Math.abs(r.r) >= 0.1) takeaway += `，每多 1 次打断，专注率平均${fit.slope < 0 ? "下降" : "上升"} ${Math.abs(fit.slope * 100).toFixed(1)} 个百分点`;
    takeaway += "。";
  }
  return { bars, r, takeaway };
}

export const HIST_WIDTH = 0.1;

export function ratioDistribution(sessions: Session[]) {
  if (sessions.length < 5) return null;
  const ratios = sessions.map(sessionRatio);
  const d = distribution(ratios)!;
  return {
    bins: histogram(ratios, HIST_WIDTH),
    stats: d,
    takeaway: `一半的学习专注率落在 ${formatPct(d.p25)}–${formatPct(d.p75)} 之间，中位数 ${formatPct(d.median)}。`,
  };
}

export type PeriodRow = { key: string; label: string; focus: number; span: number; ratio: number | null; days: number; n: number };

export function periods(sessions: Session[], unit: "week" | "month"): { rows: PeriodRow[]; takeaway: string } | null {
  const keyOf = unit === "week" ? (s: Session) => weekStart(s.date) : (s: Session) => monthKey(s.date);
  if (!sessions.length) return null;
  // Every calendar week/month from the first to the last, so empty ones show as gaps.
  const dates = sessions.map((s) => s.date).sort();
  const keys = [...new Set(dateRange(dates[0], dates[dates.length - 1]).map((d) => keyOf({ date: d } as Session)))];
  if (keys.length < 2) return null;
  const buckets = aggregateBy(sessions, keyOf, keys);
  const label = (k: string) =>
    unit === "week" ? `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))} 周` : `${k.slice(0, 4) === new Date().getFullYear().toString() ? "" : `${k.slice(2, 4)}年`}${Number(k.slice(5, 7))}月`;
  const rows = buckets.map((b) => ({ ...b, label: label(b.key) }));
  const [prev, last] = rows.slice(-2);
  const name = unit === "week" ? "周" : "月";
  const delta = last.ratio !== null && prev.ratio !== null ? last.ratio - prev.ratio : null;
  return {
    rows,
    takeaway:
      `最近一${name}（${last.label}）专注 ${formatMinutes(last.focus)}，专注率 ${formatPct(last.ratio)}` +
      (delta === null ? "。" : `，比前一${name} ${formatPp(delta)}。`),
  };
}

/** Blocks a course needs before its ratio can be called the best or worst. */
export const MIN_COURSE_BLOCKS = 3;

export function byCourse(sessions: Session[]) {
  const { courses, unattributedSpan } = courseStats(sessions);
  if (!courses.length) return null;
  const most = courses[0];
  let takeaway = `${most.course}用时最多（${formatMinutes(most.minutes)}，占 ${formatPct(most.share)}）`;
  const eligible = courses.filter((c) => c.blocks >= MIN_COURSE_BLOCKS && c.ratio !== null);
  if (eligible.length >= 2) {
    const best = eligible.reduce((a, b) => (b.ratio! > a.ratio! ? b : a));
    const worst = eligible.reduce((a, b) => (b.ratio! < a.ratio! ? b : a));
    takeaway += `。${best.course}最专注（${formatPct(best.ratio)}），${worst.course}最容易分心（${formatPct(worst.ratio)}）`;
  } else if (courses.length < 2) {
    takeaway += "。多记几门课程就能比较";
  }
  return { rows: courses, unattributedSpan, takeaway: takeaway + "。" };
}
