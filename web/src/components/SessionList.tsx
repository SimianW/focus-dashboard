import { link } from "../router";
import { courseVar, useData } from "../store";
import { useT } from "../i18n";
import { SubjectChip } from "./TaskPicker";
import { crossesMidnight, formatPct, sessionFocus, sessionRatio, sessionSpan, type Session } from "../stats";

export function SessionList({ sessions }: { sessions: Session[] }) {
  const { courseSlot } = useData();
  const t = useT();
  const fm = t.fmt.minutes;
  return (
    <ul className="session-list">
      {sessions.map((s, i) => {
        const span = sessionSpan(s);
        const focus = sessionFocus(s);
        return (
          <li key={s.id} className="reveal" style={{ ["--i" as string]: i + 2 }}>
            <a className="session-row" {...link(`/edit/${s.id}`)} aria-label={t.session.edit(s.start)}>
              <span className="sr-time">
                {s.start}–{s.end}
                <small>{crossesMidnight(s) ? t.session.overnight(fm(span)) : t.session.total(fm(span))}</small>
              </span>
              <span className="sr-main">
                <span className="sr-courses">
                  {s.courses.length ? (
                    // Keyed by position: two tasks may share a subject, and a task may sit beside a typed row of the same name.
                    s.courses.map((c, j) =>
                      c.task && c.task.subject !== null ? (
                        <span key={j} className="sr-task">
                          <b>{c.task.title}</b>
                          <SubjectChip course={c.course} />
                          <span className="muted">{fm(c.minutes)}</span>
                        </span>
                      ) : (
                        <span key={j}>
                          <i className="dot" style={{ ["--c" as string]: courseVar(courseSlot(c.course)) }} />
                          <b>{c.task?.title ?? c.course}</b>
                          <span className="muted">{fm(c.minutes)}</span>
                        </span>
                      ),
                    )
                  ) : (
                    <span className="muted">{t.session.noCourses}</span>
                  )}
                </span>
                <span className="block-bar" aria-hidden="true">
                  {s.courses.map((c, j) => (
                    <span key={j} style={{ width: `${(c.minutes / span) * 100}%`, ["--c" as string]: courseVar(courseSlot(c.course)) }} />
                  ))}
                </span>
                <span className="sr-meta">{t.session.meta(fm(focus), span > focus ? fm(span - focus) : null, s.energy, s.interruptions)}</span>
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
