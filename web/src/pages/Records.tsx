import { useMemo } from "react";
import { link, navigate } from "../router";
import { Timeline } from "../components/Timeline";
import { Empty } from "../components/Empty";
import { addDays, formatPct, groupBy, localToday, monthKey, sessionFocus, weightedRatio } from "../stats";
import { courseVar, useData } from "../store";
import { Rich, useT } from "../i18n";

function shiftMonth(m: string, by: number) {
  const [y, mo] = m.split("-").map(Number);
  const idx = y * 12 + (mo - 1) + by;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function Records({ month }: { month?: string }) {
  const { sessions, loaded, courseSlot } = useData();
  const t = useT();
  const current = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(localToday());
  const months = useMemo(() => [...new Set([monthKey(localToday()), ...sessions.map((s) => monthKey(s.date))])].sort().reverse(), [sessions]);
  const byDate = useMemo(() => groupBy(sessions, (s) => s.date), [sessions]);
  const days = [...byDate.keys()].filter((d) => monthKey(d) === current).sort().reverse();
  const monthSessions = days.flatMap((d) => byDate.get(d)!);
  const monthFocus = monthSessions.reduce((a, s) => a + sessionFocus(s), 0);

  if (loaded && !sessions.length) {
    return (
      <div className="narrow">
        <h1 className="page-title">{t.records.title}</h1>
        <Empty title={t.records.emptyTitle}>{t.records.emptyBody}</Empty>
      </div>
    );
  }

  const go = (m: string) => navigate(`/records?month=${m}`, { replace: true });

  return (
    <div className="narrow">
      <div className="page-head">
        <h1 className="page-title">{t.records.title}</h1>
        <div className="month-picker">
          <button className="btn btn-ghost month-step" aria-label={t.records.prevMonth} onClick={() => go(shiftMonth(current, -1))}>
            <StepIcon dir="prev" />
          </button>
          <select value={current} onChange={(e) => go(e.target.value)} aria-label={t.records.pickMonth}>
            {(months.includes(current) ? months : [current, ...months]).map((m) => (
              <option key={m} value={m}>
                {t.fmt.month(m)}
              </option>
            ))}
          </select>
          <button
            className="btn btn-ghost month-step"
            aria-label={t.records.nextMonth}
            onClick={() => go(shiftMonth(current, 1))}
            disabled={current >= monthKey(localToday())}
          >
            <StepIcon dir="next" />
          </button>
        </div>
      </div>

      <p className="muted month-summary">
        {days.length
          ? t.records.summary(days.length, monthSessions.length, t.fmt.minutes(monthFocus), formatPct(weightedRatio(monthSessions)))
          : t.records.none}
      </p>

      <ul className="day-list">
        {days.map((d) => {
          const list = byDate.get(d)!;
          const focus = list.reduce((a, s) => a + sessionFocus(s), 0);
          const dayCourses = [...new Map(list.flatMap((s) => s.courses).map((c) => [c.course, 0])).keys()];
          return (
            <li key={d} className="reveal" style={{ ["--i" as string]: Math.min(days.indexOf(d), 8) }}>
              <a className="day-card" {...link(`/day/${d}`)}>
                <div className="day-card-head">
                  <span className="day-card-date">{t.fmt.date(d)}</span>
                  <span className="day-card-stats">
                    <Rich text={t.records.dayStats(list.length, t.fmt.minutes(focus), formatPct(weightedRatio(list)))} />
                  </span>
                </div>
                <Timeline sessions={list} previous={byDate.get(addDays(d, -1)) ?? []} compact />
                {dayCourses.length > 0 && (
                  <span className="legend-row day-card-courses">
                    {dayCourses.map((c) => (
                      <span key={c}>
                        <i className="dot" style={{ ["--c" as string]: courseVar(courseSlot(c)) }} />
                        {c}
                      </span>
                    ))}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StepIcon({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={dir === "prev" ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
