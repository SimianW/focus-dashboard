import { useData, courseVar } from "../store";
import { crossesMidnight, formatMinutes, formatPct, sessionRatio, sessionSpan, toMinutes, type Session } from "../stats";

const DAY = 24 * 60;

type Block = { s: Session; from: number; to: number; tail: boolean };

/**
 * A 24-hour strip for one day. Each block's width is its span; course minutes
 * stack up from the bottom, each as a share of the span, so the filled height
 * is the block's focus ratio. Blocks from the previous evening show their
 * after-midnight tail.
 */
export function Timeline({
  sessions,
  previous = [],
  compact = false,
  onSelect,
}: {
  sessions: Session[];
  previous?: Session[];
  compact?: boolean;
  onSelect?: (s: Session) => void;
}) {
  const { courseSlot } = useData();
  const blocks: Block[] = [
    ...previous.filter(crossesMidnight).map((s) => ({ s, from: 0, to: toMinutes(s.end), tail: true })),
    ...sessions.map((s) => {
      const from = toMinutes(s.start);
      return { s, from, to: Math.min(DAY, from + sessionSpan(s)), tail: false };
    }),
  ];
  const ticks = compact ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24];
  return (
    <div className={`timeline${compact ? " timeline-compact" : ""}`}>
      <div className="tl-track">
        {ticks.slice(1, -1).map((h) => (
          <span key={h} className="tl-grid" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        {blocks.map(({ s, from, to, tail }) => {
          const span = sessionSpan(s);
          const courses = s.courses.map((c) => `${c.course} ${formatMinutes(c.minutes)}`).join("，");
          const title = `${s.start}–${s.end}${courses ? `，${courses}` : ""}，专注率 ${formatPct(sessionRatio(s))}${tail ? "（前一天开始）" : ""}`;
          const style = { left: `${(from / DAY) * 100}%`, width: `max(3px, ${((to - from) / DAY) * 100}%)` };
          const inner = s.courses.map((c) => (
            <span key={c.course} className="tl-seg" style={{ height: `${(c.minutes / span) * 100}%`, ["--c" as string]: courseVar(courseSlot(c.course)) }} />
          ));
          return onSelect && !tail ? (
            <button key={`${s.id}${tail}`} type="button" className="tl-block" style={style} title={title} aria-label={`修改：${title}`} onClick={() => onSelect(s)}>
              {inner}
            </button>
          ) : (
            <span key={`${s.id}${tail}`} className={`tl-block${tail ? " tl-tail" : ""}`} style={style} title={title}>
              {inner}
            </span>
          );
        })}
      </div>
      <div className="tl-axis" aria-hidden="true">
        {ticks.map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {h}
          </span>
        ))}
      </div>
    </div>
  );
}
