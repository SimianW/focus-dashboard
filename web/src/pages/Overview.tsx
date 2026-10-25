import { useMemo, useState } from "react";
import { courseVar, useData } from "../store";
import { link, navigate } from "../router";
import { courseColor, useChartTheme } from "../theme";
import { useWidth } from "../useWidth";
import { isRunning, readDraft } from "../draft";
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
  formatPct,
  goalStreak,
  localToday,
  MIN_TREND_DAYS,
  monthKey,
  rollingRatio,
  sessionFocus,
  localTime,
  weekStart,
  weightedRatio,
  type Session,
} from "../stats";
import { COURSE_SLOTS } from "../store";
import { bestAndWorst } from "../insights";
import { Rich, useT, type Messages } from "../i18n";

type Range = "30" | "90" | "all";
const RANGES: Range[] = ["30", "90", "all"];

const sumFocus = (list: Session[]) => list.reduce((a, s) => a + sessionFocus(s), 0);

export function Overview() {
  const { sessions, settings, loaded, courseSlot } = useData();
  const theme = useChartTheme();
  const t = useT();
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

  const trendOpt = useMemo(() => trendOption(theme, t, view.days, view.rolling, view.trend, settings.targetRatio), [theme, t, view, settings.targetRatio]);
  const barsOpt = useMemo(() => {
    const dates = view.days.map((d) => d.date);
    const shown = view.courses.courses.filter((c) => courseSlot(c.course) > 0);
    const byCourse = courseMinutesBy(view.list, (s) => s.date, dates, view.courses.courses.map((c) => c.course));
    const series = shown.map((c) => ({ name: c.course, color: courseColor(theme, courseSlot(c.course)), data: byCourse.get(c.course)! }));
    const others = view.courses.courses.filter((c) => courseSlot(c.course) === 0);
    if (others.length)
      series.push({ name: t.app.other, color: theme.courseOther, data: dates.map((_, i) => others.reduce((a, c) => a + byCourse.get(c.course)![i], 0)) });
    return courseStackOption(theme, t, dates, series, {
      rest: view.days.map((d) => d.span - d.focus),
      goalMin: settings.dailyGoalMin,
      tooltipHead: (i) => t.fmt.date(dates[i]),
      empty: (i) => view.days[i].n === 0,
      formatLabel: t.charts.shortDate,
    });
  }, [theme, t, view, settings.dailyGoalMin, courseSlot]);
  const heatOpt = useMemo(() => heatmapOption(theme, t, heat.days, settings.dailyGoalMin, heat.cell), [theme, t, heat, settings.dailyGoalMin]);

  if (!loaded) return <div className="loading">{t.common.loading}</div>;

  if (!sessions.length) {
    return (
      <div className="narrow">
        <h1 className="page-title reveal">{t.overview.emptyTitle}</h1>
        <div className="reveal" style={{ ["--i" as string]: 1 }}>
          <RunningBanner />
          <Empty title={t.overview.emptyHeading}>{t.overview.emptyBody}</Empty>
        </div>
      </div>
    );
  }

  const goal = settings.dailyGoalMin;
  const goalPct = goal > 0 ? Math.min(1, kpi.todayFocus / goal) : 0;
  const clickDay = (p: { dataIndex: number }) => navigate(`/day/${view.days[p.dataIndex].date}`);
  const cs = view.courses;
  const fm = t.fmt.minutes;

  return (
    <div className="overview">
      <RunningBanner />
      <section className="hero" aria-label={t.overview.todayLabel}>
        <div className="reveal">
          <span className="hero-date">{t.overview.heroDate(today)}</span>
          <a className={`hero-figure${kpi.todayFocus ? "" : " is-empty"}`} {...link(`/day/${today}`)}>
            {kpi.todayFocus ? <CountFig value={kpi.todayFocus} format={fm} /> : t.overview.notStarted}
          </a>
          <p className="hero-line">
            <Rich
              text={
                (goal > 0 ? (kpi.todayFocus >= goal ? t.overview.goalMet(fm(goal)) : t.overview.goalLeft(fm(goal), fm(goal - kpi.todayFocus))) : t.overview.noGoal) +
                (kpi.todayList.length > 0 ? t.overview.heroRatio(formatPct(kpi.todayRatio)) : "")
              }
            />
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
                {t.common.startStudying}
              </a>
            </div>
          )}
        </div>

        <dl className="kpi-list reveal" style={{ ["--i" as string]: 1 }}>
          <Kpi t={t} label={t.overview.kpi7} value={kpi.w7.current.ratio} delta={kpi.w7.delta} vs={t.overview.vs7} />
          <Kpi t={t} label={t.overview.kpi30} value={kpi.w30.current.ratio} delta={kpi.w30.delta} vs={t.overview.vs30} />
          <div className="kpi">
            <dt>{t.overview.streak}</dt>
            <dd>
              <CountFig value={kpi.streak} format={(v) => t.fmt.days(Math.round(v))} />
            </dd>
            <span className="kpi-sub">{t.overview.streakSub(fm(goal))}</span>
          </div>
          <div className="kpi">
            <dt>{t.overview.month}</dt>
            <dd>
              <CountFig value={kpi.monthFocus / 60} format={t.fmt.hours} />
            </dd>
            <span className="kpi-sub">{t.overview.monthSub(today)}</span>
          </div>
        </dl>
      </section>

      <div className="filter-row reveal" style={{ ["--i" as string]: 2 }}>
        <div className="seg-group" role="group" aria-label={t.common.range}>
          {RANGES.map((r) => (
            <button key={r} className="seg" aria-pressed={range === r} onClick={() => setRange(r)}>
              {r === "all" ? t.common.rangeAll : t.common.rangeDays(Number(r))}
            </button>
          ))}
        </div>
        <span className="muted filter-note">{t.overview.filterNote(view.activeDays, view.list.length)}</span>
      </div>

      <section className="panel reveal" style={{ ["--i" as string]: 3 }} aria-labelledby="ov-courses">
        <h2 className="panel-title" id="ov-courses">
          {t.overview.courses}
        </h2>
        {cs.courses.length ? (
          <>
            <p className="takeaway">{courseTakeaway(t, cs.courses)}</p>
            <div className="share-bar" role="img" aria-label={cs.courses.map((c) => `${c.course} ${formatPct(c.share)}`).join(t.fmt.sep)}>
              {cs.courses.map((c, i) => (
                <span key={c.course} title={`${c.course} ${formatPct(c.share)}`} style={{ width: `${c.share * 100}%`, ["--c" as string]: courseVar(courseSlot(c.course)), ["--i" as string]: i }} />
              ))}
            </div>
            <CourseTable stats={cs.courses} sessions={view.list} target={settings.targetRatio} weeks={weeks} />
            <p className="caption">{t.overview.coursesCaption(settings.targetRatio, MIN_TREND_DAYS)}</p>
          </>
        ) : (
          <p className="thin">{t.overview.noCourses}</p>
        )}
      </section>

      <section className="panel reveal" style={{ ["--i" as string]: 4 }}>
        <h2 className="panel-title">{t.overview.trendTitle}</h2>
        <p className="takeaway">
          {view.trend ? t.overview.trendTakeaway(view.trend.ppPerWeek, view.trend.r2, view.trend.n) : t.overview.trendNeed(MIN_TREND_DAYS, view.activeDays)}
        </p>
        <Chart option={trendOpt} height={280} label={t.overview.trendChart} onClick={clickDay} />
        <p className="caption">{t.overview.trendCaption}</p>
      </section>

      <div className="overview-pair">
        <section className="panel reveal" style={{ ["--i" as string]: 5 }}>
          <h2 className="panel-title">{t.overview.dailyTitle}</h2>
          <p className="takeaway">{goalDaysText(t, view.days, goal)}</p>
          <Chart option={barsOpt} height={240 + Math.ceil((Math.min(cs.courses.length, COURSE_SLOTS) + 2) / 4) * 22} label={t.overview.dailyChart} onClick={clickDay} />
        </section>

        <section className="panel reveal" style={{ ["--i" as string]: 6 }} ref={heatRef}>
          <h2 className="panel-title">{t.overview.calendarTitle}</h2>
          <p className="takeaway">{t.overview.calendarTakeaway}</p>
          <Chart
            option={heatOpt}
            height={22 + heat.cell * 7 + 44}
            label={t.overview.calendarChart}
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
  return d && isRunning(d) ? d : null;
}

const hasRunning = () => runningDraft() !== null;

/** A started-but-not-ended block from the entry draft. */
function RunningBanner() {
  const t = useT();
  const d = runningDraft();
  if (!d) return null;
  return (
    <a className="stamp is-running reveal" style={{ marginBottom: 32, textDecoration: "none", color: "inherit" }} {...link("/add")}>
      <span className="stamp-pulse" aria-hidden="true" />
      <span className="stamp-text">
        <strong>{t.common.running(elapsedMin(d.start, localTime()))}</strong>
        <span>{t.overview.runningSub(d.start)}</span>
      </span>
      <span className="btn btn-accent">{t.common.end}</span>
    </a>
  );
}

function courseTakeaway(t: Messages, courses: { course: string; minutes: number; share: number; ratio: number | null; blocks: number }[]) {
  const { best, worst } = bestAndWorst(courses, 3);
  return t.overview.courseTakeaway(courses[0], best, worst);
}

function goalDaysText(t: Messages, days: { n: number; focus: number }[], goal: number) {
  const active = days.filter((d) => d.n > 0);
  if (!active.length) return t.overview.dailyTakeaway(null, null);
  const avg = active.reduce((a, d) => a + d.focus, 0) / active.length;
  return t.overview.dailyTakeaway(avg, goal > 0 ? days.filter((d) => d.focus >= goal).length : null);
}

function Kpi({ t, label, value, delta, vs }: { t: Messages; label: string; value: number | null; delta: number | null; vs: string }) {
  const dir = delta === null || Math.abs(delta) < 0.0005 ? "flat" : delta > 0 ? "up" : "down";
  return (
    <div className="kpi">
      <dt>{label}</dt>
      <dd>{value === null ? <span className="fig">—</span> : <CountFig value={value * 100} format={(v) => `${Math.round(v)}%`} />}</dd>
      <span className="kpi-sub">
        {delta === null ? (
          t.overview.noData(vs)
        ) : (
          <>
            <span className={`delta delta-${dir}`}>
              {dir === "up" ? "▲" : dir === "down" ? "▼" : "●"} {t.fmt.pp(delta)}
            </span>{" "}
            <span className="nowrap">{t.overview.vs(vs)}</span>
          </>
        )}
      </span>
    </div>
  );
}
