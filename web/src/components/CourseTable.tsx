import { courseVar, useData } from "../store";
import { courseRatioBy, courseTrend, formatMinutes, formatPct, MIN_TREND_DAYS, weekStart, type CourseStat, type Session } from "../stats";

/**
 * One row per course: time and share, focus ratio as a meter with the number
 * of blocks behind it, and a weekly sparkline with the trend once there is
 * enough data.
 */
export function CourseTable({ stats, sessions, target, weeks }: { stats: CourseStat[]; sessions: Session[]; target: number; weeks: string[] }) {
  const { courseSlot } = useData();
  return (
    <div role="table" aria-label="各课程的时间、专注率和趋势">
      <div className="ct-head" role="row">
        <span role="columnheader">课程</span>
        <span role="columnheader">时间</span>
        <span role="columnheader">专注率（段数）</span>
        <span role="columnheader">每周走势</span>
      </div>
      <ul className="course-table" role="rowgroup">
        {stats.map((c, i) => {
          const color = courseVar(courseSlot(c.course));
          const trend = courseTrend(sessions, c.course);
          const weekly = courseRatioBy(sessions, c.course, (s) => weekStart(s.date), weeks);
          return (
            <li key={c.course} className="ct-row" role="row" style={{ ["--c" as string]: color, ["--i" as string]: i }}>
              <span className="ct-name" role="cell">
                <i className="dot" />
                <span title={c.course}>{c.course}</span>
              </span>
              <span className="ct-time" role="cell">
                {formatMinutes(c.minutes)}
                <small>{formatPct(c.share)}</small>
              </span>
              <span className="ratio-meter" role="cell">
                <b>{formatPct(c.ratio)}</b>
                <span className="rm-track" aria-hidden="true">
                  <span className="rm-fill" style={{ transform: `scaleX(${c.ratio ?? 0})` }} />
                  {target > 0 && <span className="rm-target" style={{ left: `${target * 100}%` }} />}
                </span>
                <small>{c.blocks} 段</small>
              </span>
              <span className="ct-trend" role="cell">
                <span className="ct-trend-label">每周走势</span>
                <Spark values={weekly} />
                {trend ? (
                  <span title={`每周 ${trend.ppPerWeek.toFixed(1)} 个百分点，R² = ${trend.r2.toFixed(2)}，${trend.n} 天`}>
                    {trend.ppPerWeek > 0.05 ? "+" : trend.ppPerWeek < -0.05 ? "−" : "±"}
                    {Math.abs(trend.ppPerWeek).toFixed(1)}
                  </span>
                ) : (
                  <span title={`至少 ${MIN_TREND_DAYS} 天才算趋势`}>—</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Weekly ratio as a small line; weeks without the course break the line. */
function Spark({ values, width = 64, height = 20 }: { values: (number | null)[]; width?: number; height?: number }) {
  const xs = values.map((v, i) => ({ v, x: values.length > 1 ? (i / (values.length - 1)) * width : width / 2 }));
  let d = "";
  let pen = false;
  for (const p of xs) {
    if (p.v === null) {
      pen = false;
      continue;
    }
    const y = height - p.v * height;
    d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  }
  const last = [...xs].reverse().find((p) => p.v !== null);
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} />
      {last && <circle cx={last.x} cy={height - last.v! * height} r="2.5" fill="var(--c)" />}
    </svg>
  );
}
