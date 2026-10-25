// The unsaved new entry lives in localStorage, so "Start studying" can be
// tapped when sitting down and "End" an hour later, even after closing the tab.
import { daysBetween, localTime, localToday, TIME_RE } from "./stats";

export type DraftRow = { key: string; course: string; minutes: string };

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
 * running block, which that entry must never overwrite.
 */
export function openDraft(
  stored: Draft | null,
  { date, startNow, now = new Date() }: { date?: string; startNow?: boolean; now?: Date } = {},
): { form: Draft; kept: Draft | null } {
  const today = localToday(now);
  // "Start studying" from the overview: stamp the start unless a block is already open.
  if (startNow && !stored?.start) return { form: { ...(stored ?? emptyDraft(today)), date: today, start: localTime(now), end: "" }, kept: null };
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
