import { courseVar, useData } from "../store";
import { link, navigate } from "../router";
import { Timeline } from "../components/Timeline";
import { SessionList } from "../components/SessionList";
import { Fig } from "../components/Fig";
import {
  addDays,
  courseStats,
  formatPct,
  localToday,
  meanSessionRatio,
  monthKey,
  sessionFocus,
  sessionSpan,
  weightedRatio,
} from "../stats";
import { useT } from "../i18n";

export function DayDetail({ date }: { date: string }) {
  const { sessions, settings, courseSlot } = useData();
  const t = useT();
  const fm = t.fmt.minutes;
  const list = sessions.filter((s) => s.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const previous = sessions.filter((s) => s.date === addDays(date, -1));
  const focus = list.reduce((a, s) => a + sessionFocus(s), 0);
  const span = list.reduce((a, s) => a + sessionSpan(s), 0);
  const today = localToday();
  const goal = settings.dailyGoalMin;
  const { courses } = courseStats(list);
  const mixed = list.some((s) => s.courses.length > 1);

  return (
    <div className="narrow">
      <div className="page-head reveal">
        <a className="back" {...link(`/records?month=${monthKey(date)}`)}>
          {t.day.allRecords}
        </a>
        <div className="day-nav">
          <a className="btn btn-sm btn-ghost" aria-label={t.day.prevDay} {...link(`/day/${addDays(date, -1)}`)}>
            {t.day.prev}
          </a>
          <a className="btn btn-sm btn-ghost" aria-label={t.day.nextDay} aria-disabled={date >= today ? true : undefined} {...link(`/day/${addDays(date, 1)}`)}>
            {t.day.next}
          </a>
        </div>
      </div>
      <h1 className="page-title reveal" style={{ marginBottom: 24 }}>
        {t.fmt.date(date)}
        {date === today && <span className="title-tag">{t.common.today}</span>}
      </h1>

      <dl className="day-totals reveal" style={{ ["--i" as string]: 1 }}>
        <div>
          <dt>{t.common.focused}</dt>
          <dd>
            <Fig text={fm(focus)} />
          </dd>
        </div>
        <div>
          <dt>{t.common.duration}</dt>
          <dd>
            <Fig text={fm(span)} />
          </dd>
        </div>
        <div>
          <dt>{t.common.focusRate}</dt>
          <dd>
            <Fig text={formatPct(weightedRatio(list))} />
          </dd>
        </div>
        <div>
          <dt>{t.day.goal}</dt>
          <dd>
            <Fig text={goal > 0 ? (focus >= goal ? t.day.goalMet : t.day.goalLeft(fm(goal - focus))) : t.day.goalNone} />
          </dd>
        </div>
      </dl>

      <section className="panel reveal" style={{ ["--i" as string]: 2 }}>
        <Timeline sessions={list} previous={previous} onSelect={(s) => navigate(`/edit/${s.id}`)} />
        <p className="caption">{t.day.timelineCaption}</p>
      </section>

      {courses.length > 0 && (
        <section className="panel reveal" style={{ ["--i" as string]: 3 }} aria-labelledby="day-courses">
          <h2 className="panel-title" id="day-courses">
            {t.day.courses}
          </h2>
          <div className="share-bar" aria-hidden="true">
            {courses.map((c, i) => (
              <span key={c.course} style={{ width: `${c.share * 100}%`, ["--c" as string]: courseVar(courseSlot(c.course)), ["--i" as string]: i }} />
            ))}
          </div>
          <ul className="course-table">
            {courses.map((c, i) => (
              <li key={c.course} className="ct-row day-ct" style={{ ["--c" as string]: courseVar(courseSlot(c.course)), ["--i" as string]: i }}>
                <span className="ct-name">
                  <i className="dot" />
                  <span>{c.course}</span>
                </span>
                <span className="ct-time">
                  {fm(c.minutes)}
                  <small>{formatPct(c.share)}</small>
                </span>
                <span className="ratio-meter">
                  <b>{formatPct(c.ratio)}</b>
                  <span className="rm-track" aria-hidden="true">
                    <span className="rm-fill" style={{ transform: `scaleX(${c.ratio ?? 0})` }} />
                  </span>
                  <small>{t.fmt.blocks(c.blocks)}</small>
                </span>
              </li>
            ))}
          </ul>
          {mixed && <p className="caption">{t.day.mixedCaption}</p>}
        </section>
      )}

      {list.length ? (
        <>
          <SessionList sessions={list} />
          {list.length > 1 && <p className="caption">{t.day.weightedCaption(formatPct(meanSessionRatio(list)))}</p>}
        </>
      ) : (
        <p className="muted day-empty">{t.day.empty}</p>
      )}
      <div className="day-actions">
        <a className="btn" {...link(`/add?date=${date}`)}>
          {t.day.addBlock}
        </a>
      </div>
    </div>
  );
}
