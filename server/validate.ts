import { LANGUAGES, type CourseTime, type Language, type SessionInput, type Settings } from "./db.ts";

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

// Entries for the same course are merged, so each course appears once.
function parseCourses(v: unknown, span: number): CourseTime[] {
  if (!Array.isArray(v)) throw new BadRequest("courses must be a list");
  const merged = new Map<string, number>();
  for (const entry of v) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const course = parseCourseName(e.course);
    if (!Number.isInteger(e.minutes) || (e.minutes as number) < 1)
      throw new BadRequest(`minutes for ${course} must be a positive integer`);
    merged.set(course, (merged.get(course) ?? 0) + (e.minutes as number));
  }
  if (merged.size > 10) throw new BadRequest("a session can list at most 10 courses");
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total > span) throw new BadRequest(`course time (${total} min) cannot exceed the session span (${span} min)`);
  return [...merged].map(([course, minutes]) => ({ course, minutes }));
}

export function parseSession(body: unknown): SessionInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.date !== "string" || !DATE.test(b.date) || !isRealDate(b.date))
    throw new BadRequest("date must be YYYY-MM-DD");
  if (typeof b.start !== "string" || !TIME.test(b.start)) throw new BadRequest("start must be HH:MM");
  if (typeof b.end !== "string" || !TIME.test(b.end)) throw new BadRequest("end must be HH:MM");
  const span = spanMinutes(b.start, b.end);
  if (span > 16 * 60) throw new BadRequest("a session cannot be longer than 16 hours");
  const note = typeof b.note === "string" ? b.note.slice(0, 1000) : "";
  return {
    date: b.date,
    start: b.start,
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
