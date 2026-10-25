import { link } from "../router";
import { courseVar, useData } from "../store";
import { crossesMidnight, formatMinutes, formatPct, sessionFocus, sessionRatio, sessionSpan, type Session } from "../stats";

export function SessionList({ sessions }: { sessions: Session[] }) {
  const { courseSlot } = useData();
  return (
    <ul className="session-list">
      {sessions.map((s, i) => {
        const span = sessionSpan(s);
        const focus = sessionFocus(s);
        return (
          <li key={s.id} className="reveal" style={{ ["--i" as string]: i + 2 }}>
            <a className="session-row" {...link(`/edit/${s.id}`)} aria-label={`修改 ${s.start} 开始的记录`}>
              <span className="sr-time">
                {s.start}–{s.end}
                {crossesMidnight(s) ? <small>到次日，共 {formatMinutes(span)}</small> : <small>共 {formatMinutes(span)}</small>}
              </span>
              <span className="sr-main">
                <span className="sr-courses">
                  {s.courses.length ? (
                    s.courses.map((c) => (
                      <span key={c.course}>
                        <i className="dot" style={{ ["--c" as string]: courseVar(courseSlot(c.course)) }} />
                        <b>{c.course}</b>
                        <span className="muted">{formatMinutes(c.minutes)}</span>
                      </span>
                    ))
                  ) : (
                    <span className="muted">没有记课程</span>
                  )}
                </span>
                <span className="block-bar" aria-hidden="true">
                  {s.courses.map((c) => (
                    <span key={c.course} style={{ width: `${(c.minutes / span) * 100}%`, ["--c" as string]: courseVar(courseSlot(c.course)) }} />
                  ))}
                </span>
                <span className="sr-meta">
                  专注 {formatMinutes(focus)}
                  {span > focus && `，分心或休息 ${formatMinutes(span - focus)}`}
                  {s.energy !== null && `，精力 ${s.energy}`}
                  {s.interruptions !== null && `，打断 ${s.interruptions} 次`}
                </span>
                {s.note && <span className="sr-note">{s.note}</span>}
              </span>
              <span className="sr-ratio">{formatPct(sessionRatio(s))}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
