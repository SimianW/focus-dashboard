import { useMemo, useState } from "react";
import { courseVar, useData } from "../store";
import { link, navigate } from "../router";
import { courseColor, useChartTheme } from "../theme";
import { useWidth } from "../useWidth";
import { readDraft } from "../draft";
import { Chart } from "../components/LazyChart";
import { Empty } from "../components/Empty";
import { Timeline } from "../components/Timeline";
import { CountFig } from "../components/Fig";
import { CourseTable } from "../components/CourseTable";
import { courseStackOption, heatmapOption, trendOption } from "../chartOptions";
import {
  addDays,
  compareWindows,
  courseMinutesBy,
  courseStats,
  dailySeries,
  dailyTrend,
  dateRange,
  daysBetween,
  elapsedMin,
  formatElapsed,
  formatDateCn,
  formatMinutes,
  formatPct,
  formatPp,
  goalStreak,
  localToday,
  MIN_TREND_DAYS,
  monthKey,
  rollingRatio,
  sessionFocus,
  localTime,
  TIME_RE,
  weekStart,
  weightedRatio,
  type Session,
} from "../stats";
import { COURSE_SLOTS } from "../store";

type Range = "30" | "90" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "30", label: "30 天" },
  { key: "90", label: "90 天" },
  { key: "all", label: "全部" },
];

const sumFocus = (list: Session[]) => list.reduce((a, s) => a + sessionFocus(s), 0);

export function Overview() {
  const { sessions, settings, loaded, courseSlot } = useData();
  const theme = useChartTheme();
  const [range, setRange] = useState<Range>("30");
  const today = localToday();
  const [heatRef, heatWidth] = useWidth<HTMLDivElement>();

  const first = sessions.length ? sessions[0].date : today;
  const from = range === "all" ? (first < today ? first : today) : addDays(today, -(Number(range) - 1));

  const view = useMemo(() => {
    // Start the series 6 days early so the first rolling value has a full window.
    const padded = dailySeries(sessions, addDays(from, -6), today);
    const rolling = rollingRatio(padded).slice(6);
    const days = padded.slice(6);
    const list = sessions.filter((s) => s.date >= from && s.date <= today);
    return { days, rolling, list, trend: dailyTrend(days), activeDays: days.filter((d) => d.n > 0).length, courses: courseStats(list) };
  }, [sessions, from, today]);

  const kpi = useMemo(() => {
    const todayList = sessions.filter((s) => s.date === today);
    const month = monthKey(today);
    return {
      todayList,
      yesterdayList: sessions.filter((s) => s.date === addDays(today, -1)),
      todayFocus: sumFocus(todayList),
      todayRatio: weightedRatio(todayList),
      w7: compareWindows(sessions, today, 7),
      w30: compareWindows(sessions, today, 30),
      streak: goalStreak(sessions, settings.dailyGoalMin, today),
      monthFocus: sumFocus(sessions.filter((s) => monthKey(s.date) === month)),
    };
  }, [sessions, settings.dailyGoalMin, today]);

  const heat = useMemo(() => {
    // Show the weeks since the first record, at least 13 and at most what fits.
    const maxWeeks = heatWidth && heatWidth < 640 ? 17 : 27;
    const sinceFirst = Math.ceil((daysBetween(weekStart(first), today) + 1) / 7);
    const weeks = Math.max(13, Math.min(maxWeeks, sinceFirst));
    const cell = Math.max(12, Math.min(30, Math.floor(((heatWidth || 700) - 36) / weeks)));
    const days = dailySeries(sessions, addDays(weekStart(today), -(weeks - 1) * 7), today);
    return { days, cell };
  }, [sessions, today, heatWidth, first]);

  // Weeks of the selected range, for the per-course sparklines.
  const weeks = useMemo(() => [...new Set(dateRange(from, today).map(weekStart))], [from, today]);

  const trendOpt = useMemo(() => trendOption(theme, view.days, view.rolling, view.trend, settings.targetRatio), [theme, view, settings.targetRatio]);
  const barsOpt = useMemo(() => {
    const dates = view.days.map((d) => d.date);
    const shown = view.courses.courses.filter((c) => courseSlot(c.course) > 0);
    const byCourse = courseMinutesBy(view.list, (s) => s.date, dates, view.courses.courses.map((c) => c.course));
    const series = shown.map((c) => ({ name: c.course, color: courseColor(theme, courseSlot(c.course)), data: byCourse.get(c.course)! }));
    const others = view.courses.courses.filter((c) => courseSlot(c.course) === 0);
    if (others.length)
      series.push({ name: "其他", color: theme.courseOther, data: dates.map((_, i) => others.reduce((a, c) => a + byCourse.get(c.course)![i], 0)) });
    return courseStackOption(theme, dates, series, {
      rest: view.days.map((d) => d.span - d.focus),
      goalMin: settings.dailyGoalMin,
      tooltipHead: (i) => formatDateCn(dates[i]),
      empty: (i) => view.days[i].n === 0,
      formatLabel: (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`,
    });
  }, [theme, view, settings.dailyGoalMin, courseSlot]);
  const heatOpt = useMemo(() => heatmapOption(theme, heat.days, settings.dailyGoalMin, heat.cell), [theme, heat, settings.dailyGoalMin]);

  if (!loaded) return <div className="loading">正在加载…</div>;

  if (!sessions.length) {
    return (
      <div className="narrow">
        <h1 className="page-title reveal">从今天开始记</h1>
        <div className="reveal" style={{ ["--i" as string]: 1 }}>
          <RunningBanner />
          <Empty title="还没有学习记录">
            坐下学习时点一下“开始学习”，学完点“结束”，再记下学了哪几门课、各多久。记几天之后，这里会出现每门课的专注率、每天的学习量和日历。
          </Empty>
        </div>
      </div>
    );
  }

  const goal = settings.dailyGoalMin;
  const goalPct = goal > 0 ? Math.min(1, kpi.todayFocus / goal) : 0;
  const clickDay = (p: { dataIndex: number }) => navigate(`/day/${view.days[p.dataIndex].date}`);
  const cs = view.courses;

  return (
    <div className="overview">
      <RunningBanner />
      <section className="hero" aria-label="今天">
        <div className="reveal">
          <span className="hero-date">今天，{formatDateCn(today)}</span>
          <a className={`hero-figure${kpi.todayFocus ? "" : " is-empty"}`} {...link(`/day/${today}`)}>
            {kpi.todayFocus ? <CountFig value={kpi.todayFocus} format={formatMinutes} /> : "还没开始"}
          </a>
          <p className="hero-line">
            {goal > 0 ? (
              kpi.todayFocus >= goal ? (
                <>已达成每日目标 {formatMinutes(goal)}</>
              ) : (
                <>
                  目标 {formatMinutes(goal)}，还差 <b>{formatMinutes(goal - kpi.todayFocus)}</b>
                </>
              )
            ) : (
              "专注时间"
            )}
            {kpi.todayList.length > 0 && (
              <>
                ，专注率 <b>{formatPct(kpi.todayRatio)}</b>
              </>
            )}
          </p>
          {goal > 0 && (
            <span className="goal-bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${goalPct})` }} />
            </span>
          )}
          <span className="hero-timeline">
            <Timeline sessions={kpi.todayList} previous={kpi.yesterdayList} compact />
          </span>
          {!kpi.todayList.length && !hasRunning() && (
            <div className="hero-actions">
              <a className="btn btn-accent" {...link("/add?start=now")}>
                开始学习
              </a>
            </div>
          )}
        </div>

        <dl className="kpi-list reveal" style={{ ["--i" as string]: 1 }}>
          <Kpi label="近 7 天专注率" value={kpi.w7.current.ratio} delta={kpi.w7.delta} vs="前 7 天" />
          <Kpi label="近 30 天专注率" value={kpi.w30.current.ratio} delta={kpi.w30.delta} vs="前 30 天" />
          <div className="kpi">
            <dt>连续达标</dt>
            <dd>
              <CountFig value={kpi.streak} format={(v) => `${Math.round(v)} 天`} />
            </dd>
            <span className="kpi-sub">每天专注满 {formatMinutes(goal)}</span>
          </div>
          <div className="kpi">
            <dt>本月专注</dt>
            <dd>
              <CountFig value={kpi.monthFocus / 60} format={(v) => `${v.toFixed(1)} 小时`} />
            </dd>
            <span className="kpi-sub">{Number(today.slice(5, 7))} 月 1 日至今</span>
          </div>
        </dl>
      </section>

      <div className="filter-row reveal" style={{ ["--i" as string]: 2 }}>
        <div className="seg-group" role="group" aria-label="时间范围">
          {RANGES.map((r) => (
            <button key={r.key} className="seg" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="muted filter-note">
          {view.activeDays} 天有记录，{view.list.length} 段学习
        </span>
      </div>

      <section className="panel reveal" style={{ ["--i" as string]: 3 }} aria-labelledby="ov-courses">
        <h2 className="panel-title" id="ov-courses">
          各课程
        </h2>
        {cs.courses.length ? (
          <>
            <p className="takeaway">{courseTakeaway(cs.courses)}</p>
            <div className="share-bar" role="img" aria-label={cs.courses.map((c) => `${c.course} ${formatPct(c.share)}`).join("，")}>
              {cs.courses.map((c, i) => (
                <span key={c.course} title={`${c.course} ${formatPct(c.share)}`} style={{ width: `${c.share * 100}%`, ["--c" as string]: courseVar(courseSlot(c.course)), ["--i" as string]: i }} />
              ))}
            </div>
            <CourseTable stats={cs.courses} sessions={view.list} target={settings.targetRatio} weeks={weeks} />
            <p className="caption">
              一段学习里有几门课时，按各课的分钟数把这段时长分给它们，再算各课的专注率。竖线是目标 {formatPct(settings.targetRatio)}；走势是每周专注率的变化（百分点），至少 {MIN_TREND_DAYS} 天才算。
            </p>
          </>
        ) : (
          <p className="thin">这段时间没有记课程。</p>
        )}
      </section>

      <section className="panel reveal" style={{ ["--i" as string]: 4 }}>
        <h2 className="panel-title">专注率走势</h2>
        <p className="takeaway">
          {view.trend
            ? `每周 ${formatPp(view.trend.ppPerWeek / 100)}（R² = ${view.trend.r2.toFixed(2)}，${view.trend.n} 天）${trendWord(view.trend.ppPerWeek, view.trend.r2)}`
            : `至少 ${MIN_TREND_DAYS} 天有记录才画趋势线，目前 ${view.activeDays} 天。`}
        </p>
        <Chart option={trendOpt} height={280} label="每日专注率、7 天滚动专注率和趋势线" onClick={clickDay} />
        <p className="caption">点是每天的专注率（总专注 ÷ 总时长），没记录的日子留空。实线是近 7 天合计的专注率。</p>
      </section>

      <div className="overview-pair">
        <section className="panel reveal" style={{ ["--i" as string]: 5 }}>
          <h2 className="panel-title">每天学了什么</h2>
          <p className="takeaway">{goalDaysText(view.days, goal)}</p>
          <Chart option={barsOpt} height={240 + Math.ceil((Math.min(cs.courses.length, COURSE_SLOTS) + 2) / 4) * 22} label="每天各课程的专注分钟和分心休息时间" onClick={clickDay} />
        </section>

        <section className="panel reveal" style={{ ["--i" as string]: 6 }} ref={heatRef}>
          <h2 className="panel-title">学习日历</h2>
          <p className="takeaway">颜色越深，当天专注越久。点某一天查看详情。</p>
          <Chart
            option={heatOpt}
            height={22 + heat.cell * 7 + 44}
            label="每天专注分钟的日历热力图"
            onClick={(p) => {
              const v = p.value as [string, number] | undefined;
              if (v) navigate(`/day/${v[0]}`);
            }}
          />
        </section>
      </div>
    </div>
  );
}

function runningDraft() {
  const d = readDraft();
  const today = localToday();
  return d && TIME_RE.test(d.start) && !d.end && (d.date === today || daysBetween(d.date, today) === 1) ? d : null;
}

const hasRunning = () => runningDraft() !== null;

/** A started-but-not-ended block from the entry draft. */
function RunningBanner() {
  const d = runningDraft();
  if (!d) return null;
  return (
    <a className="stamp is-running reveal" style={{ marginBottom: 32, textDecoration: "none", color: "inherit" }} {...link("/add")}>
      <span className="stamp-pulse" aria-hidden="true" />
      <span className="stamp-text">
        <strong>学习中，{formatElapsed(elapsedMin(d.start, localTime()))}</strong>
        <span>{d.start} 开始。学完点这里结束并记下课程。</span>
      </span>
      <span className="btn btn-accent">结束</span>
    </a>
  );
}

function courseTakeaway(courses: { course: string; minutes: number; share: number; ratio: number | null; blocks: number }[]) {
  const most = courses[0];
  let t = `${most.course}用时最多，占 ${formatPct(most.share)}`;
  const ok = courses.filter((c) => c.blocks >= 3 && c.ratio !== null);
  if (ok.length >= 2) {
    const best = ok.reduce((a, b) => (b.ratio! > a.ratio! ? b : a));
    const worst = ok.reduce((a, b) => (b.ratio! < a.ratio! ? b : a));
    t += `；学${best.course}时最专注（${formatPct(best.ratio)}），学${worst.course}时最容易分心（${formatPct(worst.ratio)}）`;
  }
  return t + "。";
}

function trendWord(pp: number, r2: number) {
  if (r2 < 0.1) return "，波动大于趋势，还看不出明显变化。";
  if (Math.abs(pp) < 0.3) return "，基本持平。";
  return pp > 0 ? "，在稳步变好。" : "，在下滑，留意一下最近的状态。";
}

function goalDaysText(days: { n: number; focus: number }[], goal: number) {
  const active = days.filter((d) => d.n > 0);
  if (!active.length) return "这段时间没有记录。";
  const avg = active.reduce((a, d) => a + d.focus, 0) / active.length;
  const met = goal > 0 ? days.filter((d) => d.focus >= goal).length : 0;
  return `有记录的日子平均专注 ${formatMinutes(avg)}${goal > 0 ? `，${met} 天达到目标` : ""}。`;
}

function Kpi({ label, value, delta, vs }: { label: string; value: number | null; delta: number | null; vs: string }) {
  const dir = delta === null || Math.abs(delta) < 0.0005 ? "flat" : delta > 0 ? "up" : "down";
  return (
    <div className="kpi">
      <dt>{label}</dt>
      <dd>{value === null ? <span className="fig">—</span> : <CountFig value={value * 100} format={(v) => `${Math.round(v)}%`} />}</dd>
      <span className="kpi-sub">
        {delta === null ? (
          `${vs}没有数据`
        ) : (
          <>
            <span className={`delta delta-${dir}`}>
              {dir === "up" ? "▲" : dir === "down" ? "▼" : "●"} {formatPp(delta)}
            </span>{" "}
            <span className="nowrap">比{vs}</span>
          </>
        )}
      </span>
    </div>
  );
}
