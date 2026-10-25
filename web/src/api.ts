import type { Session, SessionInput, Settings } from "./stats";

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

// The server speaks English; the person reading these does not need to.
const MESSAGES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^wrong password$/, () => "密码不对"],
  [/^too many attempts/, () => "尝试次数太多，请 15 分钟后再试"],
  [/^date must be/, () => "日期格式应为 年-月-日"],
  [/^start must be/, () => "开始时间格式应为 时:分"],
  [/^end must be/, () => "结束时间格式应为 时:分"],
  [/^a session cannot be longer than 16 hours$/, () => "一次学习不能超过 16 小时"],
  [/^courses must be a list$/, () => "课程格式不对"],
  [/^course name is required$/, () => "课程名不能为空"],
  [/^minutes for (.+) must be a positive integer$/, (m) => `${m[1]} 的分钟数应为正整数`],
  [/^a session can list at most 10 courses$/, () => "一次学习最多记 10 门课程"],
  [/^course time \((\d+) min\) cannot exceed the session span \((\d+) min\)$/, (m) => `课程时间合计 ${m[1]} 分钟，超过了这段时间（${m[2]} 分钟）`],
  [/^energy must be/, () => "精力应为 1–5"],
  [/^interruptions must be/, () => "打断次数应为 0–999 的整数"],
  [/^dailyGoalMin must be/, () => "每日目标应为 0–1440 分钟"],
  [/^targetRatio must be/, () => "目标专注率应在 0–100% 之间"],
  [/^expected \{ sessions/, () => "文件里没有 sessions 列表"],
  [/^not found$/, () => "这条记录已不存在"],
  [/^unauthorized$/, () => "登录已失效，请重新登录"],
];

export function translateError(msg: string): string {
  const row = /^row (\d+): (.*)$/.exec(msg);
  if (row) return `第 ${row[1]} 条：${translateError(row[2])}`;
  for (const [re, fn] of MESSAGES) {
    const m = re.exec(msg);
    if (m) return fn(m);
  }
  return msg;
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
    throw new ApiError("连不上服务器，请检查网络", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/login") onUnauthorized();
    throw new ApiError(translateError(data?.error ?? `请求失败（${res.status}）`), res.status);
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
  saveSettings: (s: Settings) => request<Settings>("PUT", "/api/settings", s),
  importSessions: (sessions: unknown[]) => request<{ imported: number }>("POST", "/api/import", { sessions }),
};
