import { courseVar, useData } from "../store";
import { link, navigate } from "../router";
import { Timeline } from "../components/Timeline";
import { SessionList } from "../components/SessionList";
import { Fig } from "../components/Fig";
import {
  addDays,
  courseStats,
  formatDateCn,
  formatMinutes,
  formatPct,
  localToday,
  meanSessionRatio,
  monthKey,
  sessionFocus,
  sessionSpan,
  weightedRatio,
} from "../stats";

export function DayDetail({ date }: { date: string }) {
  const { sessions, settings, courseSlot } = useData();
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
          全部记录
        </a>
        <div className="day-nav">
          <a className="btn btn-sm btn-ghost" aria-label="前一天" {...link(`/day/${addDays(date, -1)}`)}>
            ‹ 前一天
          </a>
          <a className="btn btn-sm btn-ghost" aria-label="后一天" aria-disabled={date >= today ? true : undefined} {...link(`/day/${addDays(date, 1)}`)}>
            后一天 ›
          </a>
        </div>
      </div>
      <h1 className="page-title reveal" style={{ marginBottom: 24 }}>
        {formatDateCn(date)}
        {date === today && <span className="title-tag">今天</span>}
      </h1>

      <dl className="day-totals reveal" style={{ ["--i" as string]: 1 }}>
        <div>
          <dt>专注</dt>
          <dd>
            <Fig text={formatMinutes(focus)} />
          </dd>
        </div>
        <div>
          <dt>时长</dt>
          <dd>
            <Fig text={formatMinutes(span)} />
          </dd>
        </div>
        <div>
          <dt>专注率</dt>
          <dd>
            <Fig text={formatPct(weightedRatio(list))} />
          </dd>
        </div>
        <div>
          <dt>目标</dt>
          <dd>
            <Fig text={goal > 0 ? (focus >= goal ? "已达成" : `差 ${formatMinutes(goal - focus)}`) : "未设置"} />
          </dd>
        </div>
      </dl>

      <section className="panel reveal" style={{ ["--i" as string]: 2 }}>
        <Timeline sessions={list} previous={previous} onSelect={(s) => navigate(`/edit/${s.id}`)} />
        <p className="caption">每块是一段学习，宽度是时长，里面按课程叠起来的高度是各课的分钟占比，空着的部分是分心或休息。点一块可以修改。</p>
      </section>

      {courses.length > 0 && (
        <section className="panel reveal" style={{ ["--i" as string]: 3 }} aria-labelledby="day-courses">
          <h2 className="panel-title" id="day-courses">
            这天的课程
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
                  {formatMinutes(c.minutes)}
                  <small>{formatPct(c.share)}</small>
                </span>
                <span className="ratio-meter">
                  <b>{formatPct(c.ratio)}</b>
                  <span className="rm-track" aria-hidden="true">
                    <span className="rm-fill" style={{ transform: `scaleX(${c.ratio ?? 0})` }} />
                  </span>
                  <small>{c.blocks} 段</small>
                </span>
              </li>
            ))}
          </ul>
          {mixed && <p className="caption">同一段里有几门课时，按分钟数把这段时长分给各课来算专注率。</p>}
        </section>
      )}

      {list.length ? (
        <>
          <SessionList sessions={list} />
          {list.length > 1 && <p className="caption">当天专注率按时间加权（总专注 ÷ 总时长）。各段专注率的简单平均为 {formatPct(meanSessionRatio(list))}。</p>}
        </>
      ) : (
        <p className="muted day-empty">这天没有记录。</p>
      )}
      <div className="day-actions">
        <a className="btn" {...link(`/add?date=${date}`)}>
          给这天加一段
        </a>
      </div>
    </div>
  );
}
