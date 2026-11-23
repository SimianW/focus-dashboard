// Client for life-os, which serves the list of tasks a study block can be for.
import { parseTask } from "./validate.ts";
import type { Task } from "./db.ts";

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
