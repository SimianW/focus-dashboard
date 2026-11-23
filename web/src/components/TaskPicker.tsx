import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { courseVar, useData } from "../store";
import { useT } from "../i18n";
import { dueParts, pickerEntries, taskOf, type PickerEntry, type PickList } from "../pick";
import { taskCourse } from "../draft";
import type { Task } from "../stats";

/** The course a task belongs to, in that course's colour. */
export function SubjectChip({ course }: { course: string }) {
  const { courseSlot } = useData();
  return (
    <span className="subj" style={{ ["--c" as string]: courseVar(courseSlot(course)) }}>
      <i className="dot" />
      {course}
    </span>
  );
}

/**
 * "What are you working on?": life-os's tasks in its order, then Other. A
 * bottom sheet on a phone, a centred dialog on a wider screen. Closing it
 * (×, the backdrop or Escape) picks nothing.
 */
export function TaskPicker({
  entries,
  sub,
  onPick,
  onOther,
  onClose,
}: {
  entries: PickerEntry[];
  sub: string;
  onPick: (task: Task) => void;
  onOther: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    sheet.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      back?.focus?.({ preventScroll: true });
    };
  }, []);

  const now = new Date();
  const tasks = entries.flatMap((e) => (e.kind === "task" ? [e] : []));

  return createPortal(
    <div className="picker">
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={sheet}>
        <span className="grabber" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <h2 className="sheet-title" id={titleId}>
              {t.picker.title}
            </h2>
            <p className="sheet-sub">{sub}</p>
          </div>
          <button type="button" className="cr-remove" aria-label={t.picker.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {tasks.length > 0 && (
          <ul className="pick-list" aria-label={t.picker.tasks}>
            {tasks.map(({ task, inBlock }) => (
              <li key={task.id}>
                <button
                  type="button"
                  className="pick"
                  aria-pressed={inBlock || undefined}
                  title={inBlock ? t.picker.inBlock : undefined}
                  onClick={() => onPick(taskOf(task))}
                >
                  <span>
                    <span className="pick-title">{task.title}</span>
                    <span className="pick-meta">
                      {task.subject !== null && <SubjectChip course={taskCourse(task)} />}
                      {t.picker.due(dueParts(task.deadline, now))}
                    </span>
                  </span>
                  {(task.hasBlockToday || inBlock) && (
                    <span className="pick-side">
                      {task.hasBlockToday && <span className="tag-today">{t.picker.today}</span>}
                      {inBlock && (
                        <span className="pick-tick" aria-hidden="true">
                          <TickIcon />
                        </span>
                      )}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="pick pick-other" onClick={onOther}>
          <span className="other-icon" aria-hidden="true">
            <PlusIcon />
          </span>
          <span>
            <span className="pick-title">{t.picker.other}</span>
            <span className="pick-meta">{t.picker.otherSub}</span>
          </span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * "Start studying" with the picker in front of it. The start time is the
 * moment of the tap (or `at`). Without a pick list it starts at once with no
 * row, as before; while the list is still on its way the button shows it is busy.
 */
export function useStartPicker(
  pick: { list: PickList | null | undefined; wait: () => Promise<PickList | null> },
  begin: (tapped: Date, task: Task | null) => void,
) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ tapped: Date; entries: PickerEntry[] } | null>(null);

  async function tap(at?: Date) {
    if (busy) return;
    const tapped = at ?? new Date();
    let list = pick.list;
    if (list === undefined) {
      setBusy(true);
      list = await pick.wait();
      setBusy(false);
    }
    const entries = pickerEntries(list, []);
    if (entries) setOpen({ tapped, entries });
    else begin(tapped, null);
  }

  const choose = (task: Task | null) => {
    if (!open) return;
    setOpen(null);
    begin(open.tapped, task);
  };

  const picker = open && (
    <TaskPicker entries={open.entries} sub={t.picker.startSub} onPick={choose} onOther={() => choose(null)} onClose={() => setOpen(null)} />
  );

  return { busy, tap, picker };
}

export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
