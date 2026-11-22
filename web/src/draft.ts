// The unsaved new entry lives in localStorage, so "Start studying" can be
// tapped when sitting down and "End" an hour later, even after closing the tab.
import { daysBetween, localToday, TIME_RE, type CourseInput, type CourseTime, type Task } from "./stats";

/**
 * One row of the form. A row picked from life-os carries its task and is
 * named after it; a typed row has task null (rows from older drafts have none).
 */
export type DraftRow = { key: string; course: string; minutes: string; task?: Task | null };

export type Draft = {
  date: string;
  start: string;
  end: string;
  rows: DraftRow[];
  energy: number | null;
  interruptions: string;
  note: string;
};

const KEY = "focus-entry-draft-v2";
const OLD_KEY = "focus-entry-draft"; // v1 shape (focusMin/category), dropped

export const emptyDraft = (date = localToday()): Draft => ({
  date,
  start: "",
  end: "",
  rows: [],
  energy: null,
  interruptions: "",
  note: "",
});

export const isDirty = (f: Draft) =>
  Boolean(f.start || f.end || f.rows.length || f.note || f.energy !== null || f.interruptions);

/** Started but not ended; a start older than yesterday is treated as abandoned. */
export const isRunning = (d: Draft, today = localToday()) =>
  TIME_RE.test(d.start) && !d.end && (d.date === today || daysBetween(d.date, today) === 1);

/**
 * The form /add opens with. A day's "Add a block" link (?date=) while a block
 * is running opens a blank entry for that day instead, and `kept` holds the
 * running block, which that entry must never overwrite. For "Start studying"
 * (?start=now), `startAt` asks the form to run the start flow (the picker)
 * from the moment the page opened, unless a block is already open.
 */
export function openDraft(
  stored: Draft | null,
  { date, startNow, now = new Date() }: { date?: string; startNow?: boolean; now?: Date } = {},
): { form: Draft; kept: Draft | null; startAt?: Date } {
  const today = localToday(now);
  if (startNow && !stored?.start) return { form: stored ?? emptyDraft(today), kept: null, startAt: now };
  if (date && stored && isRunning(stored, today)) return { form: emptyDraft(date), kept: stored };
  return { form: stored ? (date ? { ...stored, date } : stored) : emptyDraft(date ?? today), kept: null };
}

export function readDraft(): Draft | null {
  try {
    localStorage.removeItem(OLD_KEY);
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null") as Draft | null;
    if (d && typeof d.date === "string" && Array.isArray(d.rows)) return { ...emptyDraft(d.date), ...d };
  } catch {
    /* ignore a broken draft */
  }
  return null;
}

export function writeDraft(d: Draft) {
  if (isDirty(d)) localStorage.setItem(KEY, JSON.stringify(d));
  else localStorage.removeItem(KEY);
}

export const clearDraft = () => localStorage.removeItem(KEY);

let seq = 0;
export const rowKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** The course the server files a task row under: its subject, else its title, as a course name. */
export const taskCourse = (task: Task) => (task.subject ?? task.title).trim().slice(0, 40);

export const taskRow = (task: Task, minutes = ""): DraftRow => ({ key: rowKey(), course: taskCourse(task), minutes, task });

/** Rows for editing a saved session; task rows keep their task untouched. */
export const sessionRows = (courses: readonly CourseTime[]): DraftRow[] =>
  courses.map((c) => ({ key: rowKey(), course: c.course, minutes: String(c.minutes), task: c.task ?? null }));

/**
 * The rows as the API takes them, in order. A task row is {task, minutes},
 * plus its course only when that was renamed away from the default; typed
 * rows are trimmed and merged by name as before. Rows without positive
 * minutes are dropped.
 */
export function rowsToCourses(rows: readonly DraftRow[]): CourseInput[] {
  const out = new Map<string, CourseInput>();
  for (const r of rows) {
    const minutes = Number(r.minutes);
    if (!(minutes > 0)) continue;
    if (r.task) {
      const key = `task:${r.task.id}`;
      const prev = out.get(key);
      if (prev) prev.minutes += minutes;
      else out.set(key, r.course === taskCourse(r.task) ? { task: r.task, minutes } : { task: r.task, course: r.course, minutes });
      continue;
    }
    const course = r.course.trim();
    if (!course) continue;
    const key = `course:${course}`;
    const prev = out.get(key);
    if (prev) prev.minutes += minutes;
    else out.set(key, { course, minutes });
  }
  return [...out.values()];
}
