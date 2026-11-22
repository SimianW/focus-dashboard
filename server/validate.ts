import { LANGUAGES, type CourseTime, type Entry, type Running, type RunningKey, type Task, type Language, type SessionInput, type Settings } from "./db.ts";

// A client mistake; the API answers it with 400 and the message.
export class BadRequest extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Span of a session in minutes. An end at or before the start crosses midnight.
export const spanMinutes = (start: string, end: string) => {
  const d = toMinutes(end) - toMinutes(start);
  return d > 0 ? d : d + 24 * 60;
};

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
};

const optionalInt = (v: unknown, min: number, max: number, name: string) => {
  if (v === null || v === undefined || v === "") return null;
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max)
    throw new BadRequest(`${name} must be an integer from ${min} to ${max}`);
  return v as number;
};

export const parseCourseName = (v: unknown) => {
  const name = typeof v === "string" ? v.trim().slice(0, 40) : "";
  if (!name) throw new BadRequest("course name is required");
  return name;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// A life-os task as it was when picked.
export function parseTask(v: unknown): Task {
  if (!isObject(v)) throw new BadRequest("task must be an object");
  if (typeof v.id !== "string" || !v.id || v.id.length > 200)
    throw new BadRequest("task id must be a non-empty string of at most 200 characters");
  const title = typeof v.title === "string" ? v.title.trim() : "";
  if (!title || title.length > 200) throw new BadRequest("task title must be 1 to 200 characters");
  if (v.subject !== null && typeof v.subject !== "string") throw new BadRequest("task subject must be a string or null");
  const subject = v.subject?.trim() || null;
  if (subject && subject.length > 100) throw new BadRequest("task subject must be at most 100 characters");
  return { id: v.id, title, subject };
}

// A typed row ({course, minutes}) or a task row ({task, minutes, course?}).
// Typed rows for the same course merge, and so do rows for the same task; a
// task row and a typed row never merge, even with the same course. Rows keep
// their order.
function parseCourses(v: unknown, span: number): CourseTime[] {
  if (!Array.isArray(v)) throw new BadRequest("courses must be a list");
  const merged = new Map<string, CourseTime>();
  for (const entry of v) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const { course, task } = parseEntry(e);
    if (!Number.isInteger(e.minutes) || (e.minutes as number) < 1)
      throw new BadRequest(`minutes for ${course} must be a positive integer`);
    const key = task ? `task:${task.id}` : `course:${course}`;
    const row = merged.get(key);
    if (row) row.minutes += e.minutes as number;
    else merged.set(key, { course, minutes: e.minutes as number, task });
  }
  if (merged.size > 10) throw new BadRequest("a session can list at most 10 courses");
  const rows = [...merged.values()];
  const total = rows.reduce((a, r) => a + r.minutes, 0);
  if (total > span) throw new BadRequest(`course time (${total} min) cannot exceed the session span (${span} min)`);
  return rows;
}

// The course and task of a row, without its minutes. A task row's course
// defaults to the task's subject, then its title.
export function parseEntry(v: unknown): Entry {
  const e = (v ?? {}) as Record<string, unknown>;
  if (e.task === undefined || e.task === null) return { course: parseCourseName(e.course), task: null };
  const task = parseTask(e.task);
  const course = parseCourseName(e.course === undefined || e.course === null ? (task.subject ?? task.title) : e.course);
  return { course, task };
}

const parseDate = (v: unknown) => {
  if (typeof v !== "string" || !DATE.test(v) || !isRealDate(v)) throw new BadRequest("date must be YYYY-MM-DD");
  return v;
};

const parseStart = (v: unknown) => {
  if (typeof v !== "string" || !TIME.test(v)) throw new BadRequest("start must be HH:MM");
  return v;
};

// The block in progress: when it started and, once picked, what it is for.
export function parseRunning(body: unknown): Running {
  const b = (body ?? {}) as Record<string, unknown>;
  const date = parseDate(b.date);
  const start = parseStart(b.start);
  if (b.entry !== null && !isObject(b.entry)) throw new BadRequest("entry must be null or a row without minutes");
  return { date, start, entry: b.entry === null ? null : parseEntry(b.entry) };
}

// A running block's date and start, as a write names the block it expects.
export function parseRunningKey(v: unknown): RunningKey {
  const k = (v ?? {}) as Record<string, unknown>;
  return { date: parseDate(k.date), start: parseStart(k.start) };
}

// What PUT /api/running takes: the block, and the one it expects to replace (null: none).
export function parseRunningWrite(body: unknown): { running: Running; expected: RunningKey | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.expected !== null && !isObject(b.expected)) throw new BadRequest("expected must be null or the running block's date and start");
  return { running: parseRunning(b), expected: b.expected === null ? null : parseRunningKey(b.expected) };
}

export function parseSession(body: unknown): SessionInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const date = parseDate(b.date);
  const start = parseStart(b.start);
  if (typeof b.end !== "string" || !TIME.test(b.end)) throw new BadRequest("end must be HH:MM");
  const span = spanMinutes(start, b.end);
  if (span > 16 * 60) throw new BadRequest("a session cannot be longer than 16 hours");
  const note = typeof b.note === "string" ? b.note.slice(0, 1000) : "";
  return {
    date,
    start,
    end: b.end,
    courses: parseCourses(b.courses, span),
    energy: optionalInt(b.energy, 1, 5, "energy"),
    interruptions: optionalInt(b.interruptions, 0, 999, "interruptions"),
    note,
  };
}

// Version 1 exports stored one focusMin and category per session.
export function upgradeLegacySession(body: unknown): unknown {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.courses !== undefined || b.focusMin === undefined) return body;
  const { focusMin, category, ...rest } = b;
  const course = typeof category === "string" && category.trim() ? category : "未分类";
  return { ...rest, courses: focusMin === 0 ? [] : [{ course, minutes: focusMin }] };
}

// Every field is optional so a client can change one setting at a time.
export function parseSettings(body: unknown): Partial<Settings> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (b.dailyGoalMin !== undefined) {
    if (!Number.isInteger(b.dailyGoalMin) || (b.dailyGoalMin as number) < 0 || (b.dailyGoalMin as number) > 24 * 60)
      throw new BadRequest("dailyGoalMin must be an integer from 0 to 1440");
    out.dailyGoalMin = b.dailyGoalMin as number;
  }
  if (b.targetRatio !== undefined) {
    if (typeof b.targetRatio !== "number" || b.targetRatio < 0 || b.targetRatio > 1)
      throw new BadRequest("targetRatio must be a number from 0 to 1");
    out.targetRatio = b.targetRatio;
  }
  if (b.language !== undefined) {
    if (!LANGUAGES.includes(b.language as Language)) throw new BadRequest(`language must be one of ${LANGUAGES.join(", ")}`);
    out.language = b.language as Language;
  }
  return out;
}
