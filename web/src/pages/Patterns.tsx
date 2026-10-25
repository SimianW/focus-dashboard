import { useMemo, useState, type ReactNode } from "react";
import { courseColor, useChartTheme } from "../theme";
import { Chart } from "../components/LazyChart";
import { Empty } from "../components/Empty";
import { courseRatioOption, courseStackOption, histogramOption, periodOption, ratioBarsOption, scatterOption } from "../chartOptions";
import {
  byCourse,
  MIN_COURSE_BLOCKS,
  byHour,
  byWeekday,
  energyVsRatio,
  HIST_WIDTH,
  interruptionsVsRatio,
  lengthVsRatio,
  MIN_BUCKET,
  MIN_CORR,
  periods,
  ratioDistribution,
} from "../insights";
import { addDays, courseMinutesBy, dateRange, formatPct, localToday, meanSessionRatio, weekStart, weightedRatio } from "../stats";
import { useData } from "../store";
import { useT } from "../i18n";

type Range = "30" | "90" | "all";

export function Patterns() {
  const { sessions, loaded, courseSlot, settings } = useData();
  const t = useChartTheme();
  const m = useT();
  const [range, setRange] = useState<Range>("all");
  const [period, setPeriod] = useState<"week" | "month">("week");
  const today = localToday();

  const list = useMemo(() => {
    if (range === "all") return sessions;
    const from = addDays(today, -(Number(range) - 1));
    return sessions.filter((s) => s.date >= from && s.date <= today);
  }, [sessions, range, today]);

  const a = useMemo(
    () => ({
      hour: byHour(list, m),
      weekday: byWeekday(list, m),
      length: lengthVsRatio(list, m),
      energy: energyVsRatio(list, m),
      intr: interruptionsVsRatio(list, m),
      dist: ratioDistribution(list, m),
      period: periods(list, period, m),
      course: byCourse(list, m),
    }),
    [list, period, m],
  );

  const opts = useMemo(
    () => ({
      hour: a.hour && ratioBarsOption(t, m, a.hour.bars),
      weekday: a.weekday && ratioBarsOption(t, m, a.weekday.bars, "days"),
      length: a.length && scatterOption(t, m, a.length.points, m.patterns.lengthAxis, (v) => (v >= 60 ? `${(v / 60).toFixed(v % 60 ? 1 : 0)}h` : `${v}m`)),
      energy: a.energy && ratioBarsOption(t, m, a.energy.bars),
      intr: a.intr && ratioBarsOption(t, m, a.intr.bars),
      dist: a.dist && histogramOption(t, m, a.dist.bins, HIST_WIDTH),
      period: a.period && periodOption(t, m, a.period.rows),
      courseRatio:
        a.course &&
        courseRatioOption(
          t,
          m,
          a.course.rows.map((c) => ({ name: c.course, color: courseColor(t, courseSlot(c.course)), ratio: c.ratio, blocks: c.blocks, minutes: c.minutes })),
          settings.targetRatio,
        ),
      courseWeeks: a.course && list.length ? courseWeeksOption() : null,
    }),
    [a, t, m, courseSlot, settings.targetRatio, list], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Course minutes per calendar week, every week from the first to the last.
  function courseWeeksOption() {
    const dates = list.map((s) => s.date).sort();
    const weeks = [...new Set(dateRange(dates[0], dates[dates.length - 1]).map(weekStart))];
    const all = a.course!.rows.map((c) => c.course);
    const byCourse = courseMinutesBy(list, (s) => weekStart(s.date), weeks, all);
    const own = all.filter((c) => courseSlot(c) > 0);
    const rest = all.filter((c) => courseSlot(c) === 0);
    const series = own.map((c) => ({ name: c, color: courseColor(t, courseSlot(c)), data: byCourse.get(c)! }));
    if (rest.length) series.push({ name: m.app.other, color: t.courseOther, data: weeks.map((_, i) => rest.reduce((x, c) => x + byCourse.get(c)![i], 0)) });
    return courseStackOption(t, m, weeks.map(m.charts.shortDate), series, { tooltipHead: (i) => m.patterns.weekOf(weeks[i]) });
  }

  if (!loaded) return <div className="loading">{m.common.loading}</div>;
  if (!sessions.length) {
    return (
      <div className="narrow">
        <h1 className="page-title">{m.patterns.title}</h1>
        <Empty title={m.patterns.emptyTitle}>{m.patterns.emptyBody(MIN_CORR)}</Empty>
      </div>
    );
  }

  const thin = (need: string) => <p className="thin">{need}</p>;

  return (
    <div className="patterns">
      <div className="page-head reveal">
        <h1 className="page-title">{m.patterns.title}</h1>
      </div>
      <div className="filter-row reveal" style={{ ["--i" as string]: 1 }}>
        <div className="seg-group" role="group" aria-label={m.common.range}>
          {(["30", "90", "all"] as Range[]).map((r) => (
            <button key={r} className="seg" aria-pressed={range === r} onClick={() => setRange(r)}>
              {r === "all" ? m.common.rangeAll : m.common.rangeDays(Number(r))}
            </button>
          ))}
        </div>
        <span className="muted filter-note">{m.patterns.filterNote(list.length, formatPct(weightedRatio(list)), formatPct(meanSessionRatio(list)))}</span>
      </div>

      <div className="pattern-grid">
        <Card title={m.patterns.hourTitle} takeaway={a.hour?.takeaway}>
          {opts.hour ? <Chart option={opts.hour} height={220} label={m.patterns.hourChart} /> : thin(m.patterns.needBlocks(MIN_CORR))}
          {a.hour && <p className="caption">{m.patterns.hourCaption(MIN_BUCKET)}</p>}
        </Card>

        <Card title={m.patterns.weekdayTitle} takeaway={a.weekday?.takeaway}>
          {opts.weekday ? <Chart option={opts.weekday} height={220} label={m.patterns.weekdayChart} /> : thin(m.patterns.needBlocks(MIN_CORR))}
          {a.weekday && <p className="caption">{m.patterns.weekdayCaption}</p>}
        </Card>

        <Card title={m.patterns.lengthTitle} takeaway={a.length?.takeaway}>
          {opts.length ? <Chart option={opts.length} height={240} label={m.patterns.lengthChart} /> : thin(m.patterns.needBlocks(MIN_CORR))}
        </Card>

        <Card title={m.patterns.distTitle} takeaway={a.dist?.takeaway}>
          {opts.dist && a.dist ? (
            <>
              <Chart option={opts.dist} height={200} label={m.patterns.distChart} />
              <dl className="dist-stats">
                <Stat k={m.patterns.mean} v={formatPct(a.dist.stats.mean)} />
                <Stat k={m.patterns.median} v={formatPct(a.dist.stats.median)} />
                <Stat k={m.patterns.sd} v={`${(a.dist.stats.sd * 100).toFixed(1)}`} />
                <Stat k="P25–P75" v={`${formatPct(a.dist.stats.p25)}–${formatPct(a.dist.stats.p75)}`} />
              </dl>
              <p className="caption">{m.patterns.distCaption}</p>
            </>
          ) : (
            thin(m.patterns.distNeed)
          )}
        </Card>

        <Card title={m.patterns.energyTitle} takeaway={a.energy?.takeaway}>
          {opts.energy ? <Chart option={opts.energy} height={200} label={m.patterns.energyChart} /> : thin(m.patterns.energyNeed(MIN_CORR))}
        </Card>

        <Card title={m.patterns.intrTitle} takeaway={a.intr?.takeaway}>
          {opts.intr ? <Chart option={opts.intr} height={200} label={m.patterns.intrChart} /> : thin(m.patterns.intrNeed(MIN_CORR))}
        </Card>

        <Card
          wide
          title={period === "week" ? m.patterns.weekly : m.patterns.monthly}
          takeaway={a.period?.takeaway}
          tools={
            <div className="seg-group" role="group" aria-label={m.patterns.periodGroup}>
              <button className="seg" aria-pressed={period === "week"} onClick={() => setPeriod("week")}>
                {m.patterns.byWeek}
              </button>
              <button className="seg" aria-pressed={period === "month"} onClick={() => setPeriod("month")}>
                {m.patterns.byMonth}
              </button>
            </div>
          }
        >
          {opts.period ? <Chart option={opts.period} height={300} label={m.patterns.periodChart} /> : thin(m.patterns.periodNeed(period))}
        </Card>

        <Card wide title={m.patterns.courseWeeksTitle} takeaway={a.course?.takeaway}>
          {opts.courseWeeks ? <Chart option={opts.courseWeeks} height={300} label={m.patterns.courseWeeksChart} /> : thin(m.patterns.noCourses)}
        </Card>

        <Card wide title={m.patterns.courseRatioTitle}>
          {opts.courseRatio && a.course && (
            <>
              <Chart option={opts.courseRatio} height={36 + a.course.rows.length * 36} label={m.patterns.courseRatioChart} />
              <p className="caption">
                {m.patterns.courseRatioCaption(MIN_COURSE_BLOCKS)}
                {a.course.unattributedSpan > 0 && m.patterns.unattributed(Math.round(a.course.unattributedSpan))}
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, takeaway, children, wide, tools }: { title: string; takeaway?: string; children: ReactNode; wide?: boolean; tools?: ReactNode }) {
  return (
    <section className={`panel reveal${wide ? " panel-wide" : ""}`} style={{ ["--i" as string]: 2 }}>
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {tools}
      </div>
      {takeaway && <p className="takeaway">{takeaway}</p>}
      {children}
    </section>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
