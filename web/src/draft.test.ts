import { describe, expect, it } from "vitest";
import { emptyDraft, isRunning, openDraft, rowsToCourses, sessionRows, taskRow, type Draft, type DraftRow } from "./draft";
import type { CourseTime } from "./stats";

const now = new Date(2026, 9, 25, 15, 0); // Sun 2026-10-25 15:00, local time
const running: Draft = { ...emptyDraft("2026-10-25"), start: "14:00", rows: [{ key: "r1", course: "Math", minutes: "30" }] };

describe("isRunning", () => {
  it("counts a block started today or yesterday and not ended", () => {
    expect(isRunning(running, "2026-10-25")).toBe(true);
    expect(isRunning({ ...running, date: "2026-10-24" }, "2026-10-25")).toBe(true);
    expect(isRunning({ ...running, date: "2026-10-23" }, "2026-10-25")).toBe(false);
    expect(isRunning({ ...running, end: "15:00" }, "2026-10-25")).toBe(false);
    expect(isRunning(emptyDraft("2026-10-25"), "2026-10-25")).toBe(false);
  });
});

describe("openDraft", () => {
  it("opens a separate entry for ?date= and leaves a running block alone", () => {
    const stored = structuredClone(running);
    const { form, kept } = openDraft(stored, { date: "2026-10-20", now });
    expect(form).toEqual(emptyDraft("2026-10-20"));
    expect(kept).toBe(stored);
    expect(stored).toEqual(running);
  });
  it("also keeps a running block for ?date= of its own day", () => {
    expect(openDraft(running, { date: "2026-10-25", now }).kept).toBe(running);
  });
  it("reopens a running block when there is no ?date=", () => {
    expect(openDraft(running, { now })).toEqual({ form: running, kept: null });
  });
  it("moves a draft that is not running to ?date=", () => {
    const typed: Draft = { ...emptyDraft("2026-10-25"), note: "reading" };
    expect(openDraft(typed, { date: "2026-10-20", now })).toEqual({ form: { ...typed, date: "2026-10-20" }, kept: null });
    const stale: Draft = { ...running, date: "2026-10-22" };
    expect(openDraft(stale, { date: "2026-10-20", now })).toEqual({ form: { ...stale, date: "2026-10-20" }, kept: null });
  });
  it("starts an empty or stamped draft", () => {
    expect(openDraft(null, { date: "2026-10-20", now })).toEqual({ form: emptyDraft("2026-10-20"), kept: null });
    expect(openDraft(null, { now }).form).toEqual(emptyDraft("2026-10-25"));
  });
  it("for ?start=now, runs the start flow from the moment the page opened instead of stamping", () => {
    expect(openDraft(null, { startNow: true, now })).toEqual({ form: emptyDraft("2026-10-25"), kept: null, startAt: now });
    const typed: Draft = { ...emptyDraft("2026-10-24"), note: "reading" };
    expect(openDraft(typed, { startNow: true, now })).toEqual({ form: typed, kept: null, startAt: now });
  });
  it("for ?start=now, opens a draft that already has a start as it is", () => {
    const ended: Draft = { ...running, end: "14:50" };
    const stale: Draft = { ...running, date: "2026-10-22" };
    for (const stored of [running, ended, stale]) expect(openDraft(stored, { startNow: true, now })).toStrictEqual({ form: stored, kept: null });
  });
});

describe("rows to save", () => {
  const cs341 = { id: "t-1", title: "CS 341 A3: dynamic programming", subject: "CS 341" };
  it("sends a task row as {task, minutes} and a typed row as {course, minutes}", () => {
    const rows: DraftRow[] = [taskRow(cs341, "60"), { key: "r2", course: "PHYS 234", minutes: "15", task: null }];
    expect(rowsToCourses(rows)).toEqual([
      { task: { id: "t-1", title: "CS 341 A3: dynamic programming", subject: "CS 341" }, minutes: 60 },
      { course: "PHYS 234", minutes: 15 },
    ]);
  });
  it("keeps typed rows as today: trimmed, merged by name, empty ones dropped; rows from old drafts have no task", () => {
    const rows = [
      { key: "a", course: " Math ", minutes: "30" },
      { key: "b", course: "Math", minutes: "15" },
      { key: "c", course: "History", minutes: "0" },
    ] as DraftRow[];
    expect(rowsToCourses(rows)).toEqual([{ course: "Math", minutes: 45 }]);
  });
  it("never merges a task row with a typed row of the same name, or two tasks of one subject", () => {
    const other = { id: "t-2", title: "CS 341 midterm", subject: "CS 341" };
    const rows: DraftRow[] = [taskRow(cs341, "20"), { key: "x", course: "CS 341", minutes: "10", task: null }, taskRow(other, "5")];
    expect(rowsToCourses(rows)).toEqual([
      { task: cs341, minutes: 20 },
      { course: "CS 341", minutes: 10 },
      { task: other, minutes: 5 },
    ]);
  });
  it("round-trips an edited session's rows unchanged, tasks included", () => {
    const saved: CourseTime[] = [
      { course: "CS 341", minutes: 60, task: cs341 },
      { course: "Tax return", minutes: 10, task: { id: "t-9", title: "Tax return", subject: null } },
      { course: "PHYS 234", minutes: 15, task: null },
    ];
    const rows = sessionRows(saved);
    expect(rows.map((r) => r.minutes)).toEqual(["60", "10", "15"]);
    expect(rowsToCourses(rows)).toEqual([
      { task: cs341, minutes: 60 },
      { task: { id: "t-9", title: "Tax return", subject: null }, minutes: 10 },
      { course: "PHYS 234", minutes: 15 },
    ]);
  });
  it("keeps a task row's course when it was renamed after saving", () => {
    const rows = sessionRows([{ course: "CS341", minutes: 30, task: cs341 }]);
    expect(rowsToCourses(rows)).toEqual([{ task: cs341, course: "CS341", minutes: 30 }]);
  });
  it("names a task row after its subject, else its title cut to 40 characters, as the server does", () => {
    expect(taskRow(cs341, "").course).toBe("CS 341");
    const long = { id: "t-3", title: "Read chapter 4 of the ECON 101 textbook and take notes", subject: null };
    expect(taskRow(long, "").course).toBe("Read chapter 4 of the ECON 101 textbook ");
  });
});
