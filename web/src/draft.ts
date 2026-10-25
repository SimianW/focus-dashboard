// The unsaved new entry lives in localStorage, so "开始学习" can be tapped
// when sitting down and "结束" an hour later, even after closing the tab.
import { localToday } from "./stats";

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
