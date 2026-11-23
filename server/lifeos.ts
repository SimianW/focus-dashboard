// Focus's side of life-os: the list of tasks a study block can be for, which Focus fetches
// from life-os, and the study blocks life-os reads from Focus (focus-dashboard issue 2).
import { parseTask } from "./validate.ts";
import type { CourseTime, Running, Session, Task } from "./db.ts";

export type LifeosConfig = { url?: string; token?: string; timeoutMs?: number };

// One task life-os offers, in the order life-os ranks them.
export type PickTask = Task & { deadline: string; hasBlockToday: boolean };

export type PickList = { available: false } | { available: true; tasks: PickTask[] };

// An ISO 8601 instant with an explicit offset, e.g. 2026-11-25T23:59:00-05:00.
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function parsePickTask(v: unknown): PickTask | null {
  try {
    const e = v as Record<string, unknown>;
    const task = parseTask(v);
    if (typeof e.deadline !== "string" || !INSTANT.test(e.deadline) || Number.isNaN(Date.parse(e.deadline))) return null;
    if (typeof e.hasBlockToday !== "boolean") return null;
    return { ...task, deadline: e.deadline, hasBlockToday: e.hasBlockToday };
  } catch {
    return null;
  }
}

const DEFAULT_TIMEOUT_MS = 3000;

// Never throws: any failure to get a list from life-os is { available: false }
// and one warning line, which never contains the token.
export async function fetchPickList(config: LifeosConfig = {}): Promise<PickList> {
  const { url, token, timeoutMs = DEFAULT_TIMEOUT_MS } = config;
  if (!url || !token) return { available: false };
  const target = `${url.replace(/\/+$/, "")}/api/pick-list`;
  const unavailable = (reason: string): PickList => {
    console.warn(`life-os pick list unavailable (${target}): ${reason}`);
    return { available: false };
  };
  let body: unknown;
  try {
    const res = await fetch(target, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return unavailable(`HTTP ${res.status}`);
    }
    body = await res.json();
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === "TimeoutError") return unavailable(`no answer within ${timeoutMs} ms`);
    return unavailable(`${e.name}: ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`);
  }
  if (!Array.isArray(body)) return unavailable("the answer is not a JSON array");
  return { available: true, tasks: body.map(parsePickTask).filter((t) => t !== null) };
}

// ---- What life-os reads: GET /api/lifeos/sessions ----

// A row as life-os reads it: the picked task's id, title and subject as they were when
// picked, or for a row with no task (typed, "Other", or from before tasks) the typed name.
export type LifeosRow = { taskId: string | null; title: string; subject: string | null; minutes: number };

export type LifeosSessions = {
  sessions: { id: number; date: string; start: string; end: string; rows: LifeosRow[] }[];
  inProgress: {
    id: string;
    date: string;
    start: string;
    studying: Omit<LifeosRow, "minutes"> | null;
    rows: LifeosRow[];
  } | null;
};

const picked = ({ course, task }: { course: string; task: Task | null }) => ({
  taskId: task?.id ?? null,
  title: task?.title ?? course,
  subject: task?.subject ?? null,
});

const lifeosRow = (row: CourseTime): LifeosRow => ({ ...picked(row), minutes: row.minutes });

/** Focus's study blocks, in the order given, and the one in progress, in the shape life-os reads. */
export function lifeosSessions(sessions: Session[], running: Running | null): LifeosSessions {
  return {
    sessions: sessions.map(({ id, date, start, end, courses }) => ({ id, date, start, end, rows: courses.map(lifeosRow) })),
    // The running block has no id of its own; its date and start name it. It has no minutes
    // until it is saved as a study block.
    inProgress: running && {
      id: `running:${running.date}T${running.start}`,
      date: running.date,
      start: running.start,
      studying: running.entry && picked(running.entry),
      rows: [],
    },
  };
}
