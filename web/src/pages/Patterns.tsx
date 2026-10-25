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

type Range = "30" | "90" | "all";

export function Patterns() {
  const { sessions, loaded, courseSlot, settings } = useData();
  const t = useChartTheme();
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
      hour: byHour(list),
      weekday: byWeekday(list),
      length: lengthVsRatio(list),
      energy: energyVsRatio(list),
      intr: interruptionsVsRatio(list),
      dist: ratioDistribution(list),
      period: periods(list, period),
      course: byCourse(list),
    }),
    [list, period],
  );

  const opts = useMemo(
    () => ({
      hour: a.hour && ratioBarsOption(t, a.hour.bars),
      weekday: a.weekday && ratioBarsOption(t, a.weekday.bars, "天"),
      length: a.length && scatterOption(t, a.length.points, "时长", (v) => (v >= 60 ? `${(v / 60).toFixed(v % 60 ? 1 : 0)}h` : `${v}m`)),
      energy: a.energy && ratioBarsOption(t, a.energy.bars),
      intr: a.intr && ratioBarsOption(t, a.intr.bars),
      dist: a.dist && histogramOption(t, a.dist.bins, HIST_WIDTH),
      period: a.period && periodOption(t, a.period.rows),
      courseRatio:
        a.course &&
        courseRatioOption(
          t,
          a.course.rows.map((c) => ({ name: c.course, color: courseColor(t, courseSlot(c.course)), ratio: c.ratio, blocks: c.blocks, minutes: c.minutes })),
          settings.targetRatio,
        ),
      courseWeeks: a.course && list.length ? courseWeeksOption() : null,
    }),
    [a, t, courseSlot, settings.targetRatio, list], // eslint-disable-line react-hooks/exhaustive-deps
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
    if (rest.length) series.push({ name: "其他", color: t.courseOther, data: weeks.map((_, i) => rest.reduce((x, c) => x + byCourse.get(c)![i], 0)) });
    const label = (w: string) => `${Number(w.slice(5, 7))}/${Number(w.slice(8, 10))}`;
    return courseStackOption(t, weeks.map(label), series, { tooltipHead: (i) => `${label(weeks[i])} 那一周` });
  }

  if (!loaded) return <div className="loading">正在加载…</div>;
  if (!sessions.length) {
    return (
      <div className="narrow">
        <h1 className="page-title">规律</h1>
        <Empty title="还没有可以分析的记录">记录 {MIN_CORR} 次以上之后，这里会告诉你哪个时段、多长的学习最容易专注。</Empty>
      </div>
    );
  }

  const thin = (need: string) => <p className="thin">{need}</p>;

  return (
    <div className="patterns">
      <div className="page-head reveal">
        <h1 className="page-title">规律</h1>
      </div>
      <div className="filter-row reveal" style={{ ["--i" as string]: 1 }}>
        <div className="seg-group" role="group" aria-label="时间范围">
          {(["30", "90", "all"] as Range[]).map((r) => (
            <button key={r} className="seg" aria-pressed={range === r} onClick={() => setRange(r)}>
              {r === "all" ? "全部" : `${r} 天`}
            </button>
          ))}
        </div>
        <span className="muted filter-note">
          {list.length} 段学习，专注率 {formatPct(weightedRatio(list))}（各段简单平均 {formatPct(meanSessionRatio(list))}）
        </span>
      </div>

      <div className="pattern-grid">
        <Card title="几点开始最专注" takeaway={a.hour?.takeaway}>
          {opts.hour ? <Chart option={opts.hour} height={220} label="按开始小时的专注率" /> : thin(`至少 ${MIN_CORR} 次记录后显示。`)}
          {a.hour && <p className="caption">柱上数字是次数，少于 {MIN_BUCKET} 次的时段颜色变浅。</p>}
        </Card>

        <Card title="星期几" takeaway={a.weekday?.takeaway}>
          {opts.weekday ? <Chart option={opts.weekday} height={220} label="按星期的专注率" /> : thin(`至少 ${MIN_CORR} 次记录后显示。`)}
          {a.weekday && <p className="caption">柱上数字是有记录的天数。</p>}
        </Card>

        <Card title="学多久更专注" takeaway={a.length?.takeaway}>
          {opts.length ? <Chart option={opts.length} height={240} label="每次学习的时长和专注率散点图" /> : thin(`至少 ${MIN_CORR} 次记录后显示。`)}
        </Card>

        <Card title="专注率分布" takeaway={a.dist?.takeaway}>
          {opts.dist && a.dist ? (
            <>
              <Chart option={opts.dist} height={200} label="每次学习专注率的直方图" />
              <dl className="dist-stats">
                <Stat k="平均" v={formatPct(a.dist.stats.mean)} />
                <Stat k="中位数" v={formatPct(a.dist.stats.median)} />
                <Stat k="标准差（百分点）" v={`${(a.dist.stats.sd * 100).toFixed(1)}`} />
                <Stat k="P25–P75" v={`${formatPct(a.dist.stats.p25)}–${formatPct(a.dist.stats.p75)}`} />
              </dl>
              <p className="caption">这里每次学习算一个点，不按时长加权。</p>
            </>
          ) : (
            thin("至少 5 次记录后显示。")
          )}
        </Card>

        <Card title="精力与专注" takeaway={a.energy?.takeaway}>
          {opts.energy ? (
            <Chart option={opts.energy} height={200} label="按开始前精力的专注率" />
          ) : (
            thin(`填写了精力的记录满 ${MIN_CORR} 次后显示。记录时点一下 1–5 即可。`)
          )}
        </Card>

        <Card title="打断与专注" takeaway={a.intr?.takeaway}>
          {opts.intr ? (
            <Chart option={opts.intr} height={200} label="按打断次数的专注率" />
          ) : (
            thin(`填写了打断次数的记录满 ${MIN_CORR} 次后显示。`)
          )}
        </Card>

        <Card
          wide
          title={period === "week" ? "每周" : "每月"}
          takeaway={a.period?.takeaway}
          tools={
            <div className="seg-group" role="group" aria-label="按周或按月">
              <button className="seg" aria-pressed={period === "week"} onClick={() => setPeriod("week")}>
                按周
              </button>
              <button className="seg" aria-pressed={period === "month"} onClick={() => setPeriod("month")}>
                按月
              </button>
            </div>
          }
        >
          {opts.period ? (
            <Chart option={opts.period} height={300} label="每周或每月的专注小时和专注率" />
          ) : (
            thin(`记录跨过两个${period === "week" ? "周" : "月"}后显示。`)
          )}
        </Card>

        <Card wide title="每周各课程的时间" takeaway={a.course?.takeaway}>
          {opts.courseWeeks ? (
            <Chart option={opts.courseWeeks} height={300} label="每周各课程的专注分钟，堆叠柱状图" />
          ) : (
            thin("还没有记课程。")
          )}
        </Card>

        <Card wide title="各课程的专注率">
          {opts.courseRatio && a.course && (
            <>
              <Chart option={opts.courseRatio} height={36 + a.course.rows.length * 36} label="各课程的专注率和对应的学习段数" />
              <p className="caption">
                条右边是专注率和背后的学习段数，少于 {MIN_COURSE_BLOCKS} 段的不参与比较。一段学习里有几门课时，按各课分钟数把这段时长分给它们。
                {a.course.unattributedSpan > 0 && ` 另有 ${Math.round(a.course.unattributedSpan)} 分钟的学习没记课程，不算进任何一门。`}
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
