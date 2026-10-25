import type { Session, SessionInput, Settings } from "./stats";
import { messages, type Messages } from "./i18n";

export type CourseSummary = { course: string; sessions: number; minutes: number; lastDate: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Called on any 401 so the app can drop back to the login screen.
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

// The server speaks terse English; show it as a sentence in the UI language.
type Errors = Messages["errors"];
const MESSAGES: [RegExp, (e: Errors, m: RegExpMatchArray) => string][] = [
  [/^wrong password$/, (e) => e.wrongPassword],
  [/^too many attempts/, (e) => e.tooManyAttempts],
  [/^date must be/, (e) => e.date],
  [/^start must be/, (e) => e.start],
  [/^end must be/, (e) => e.end],
  [/^a session cannot be longer than 16 hours$/, (e) => e.tooLong],
  [/^courses must be a list$/, (e) => e.coursesList],
  [/^course name is required$/, (e) => e.courseName],
  [/^minutes for (.+) must be a positive integer$/, (e, m) => e.minutesFor(m[1])],
  [/^a session can list at most 10 courses$/, (e) => e.maxCourses],
  [/^course time \((\d+) min\) cannot exceed the session span \((\d+) min\)$/, (e, m) => e.courseOver(Number(m[1]), Number(m[2]))],
  [/^energy must be/, (e) => e.energy],
  [/^interruptions must be/, (e) => e.interruptions],
  [/^dailyGoalMin must be/, (e) => e.dailyGoal],
  [/^targetRatio must be/, (e) => e.targetRatio],
  [/^language must be/, (e) => e.language],
  [/^expected \{ sessions/, (e) => e.noSessions],
  [/^(invalid JSON|expected application\/json)$/, (e) => e.invalidJson],
  [/^not found$/, (e) => e.notFound],
  [/^unauthorized$/, (e) => e.unauthorized],
  [/^internal error$/, (e) => e.internal],
];

export function translateError(msg: string, e: Errors = messages().errors): string {
  const row = /^row (\d+): (.*)$/.exec(msg);
  if (row) return e.row(Number(row[1]), translateError(row[2], e));
  for (const [re, fn] of MESSAGES) {
    const m = re.exec(msg);
    if (m) return fn(e, m);
  }
  return e.unknown(msg);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(messages().errors.network, 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/login") onUnauthorized();
    throw new ApiError(data?.error ? translateError(data.error) : messages().errors.status(res.status), res.status);
  }
  return data as T;
}

export const api = {
  login: (password: string) => request<{ ok: true }>("POST", "/api/login", { password }),
  logout: () => request<{ ok: true }>("POST", "/api/logout"),
  me: () => request<{ ok: true }>("GET", "/api/me"),
  sessions: () => request<Session[]>("GET", "/api/sessions"),
  createSession: (s: SessionInput) => request<Session>("POST", "/api/sessions", s),
  updateSession: (id: number, s: SessionInput) => request<Session>("PUT", `/api/sessions/${id}`, s),
  deleteSession: (id: number) => request<void>("DELETE", `/api/sessions/${id}`),
  courses: () => request<CourseSummary[]>("GET", "/api/courses"),
  renameCourse: (from: string, to: string) => request<{ updated: number }>("POST", "/api/courses/rename", { from, to }),
  settings: () => request<Settings>("GET", "/api/settings"),
  saveSettings: (s: Partial<Settings>) => request<Settings>("PUT", "/api/settings", s),
  importSessions: (sessions: unknown[]) => request<{ imported: number }>("POST", "/api/import", { sessions }),
};
