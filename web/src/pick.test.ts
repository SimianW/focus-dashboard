import { describe, expect, it } from "vitest";
import { dueParts, pickerEntries, toggleTask, type PickList, type PickTask } from "./pick";
import { en } from "./i18n/en";
import { zh } from "./i18n/zh";
import type { DraftRow } from "./draft";

const task = (id: string, extra: Partial<PickTask> = {}): PickTask => ({
  id,
  title: `Task ${id}`,
  subject: "CS 341",
  deadline: "2026-11-24T23:59:00-05:00",
  hasBlockToday: false,
  ...extra,
});

describe("pickerEntries", () => {
  it("lists the pick list's tasks in the order given, with Other last", () => {
    const list: PickList = { available: true, tasks: [task("c"), task("a", { subject: null }), task("b")] };
    expect(pickerEntries(list, [])).toEqual([
      { kind: "task", task: list.tasks[0], inBlock: false },
      { kind: "task", task: list.tasks[1], inBlock: false },
      { kind: "task", task: list.tasks[2], inBlock: false },
      { kind: "other" },
    ]);
  });
  it("offers only Other when life-os has no tasks", () => {
    expect(pickerEntries({ available: true, tasks: [] }, [])).toEqual([{ kind: "other" }]);
  });
  it("is null, so Start stamps the time at once, when the list is unavailable or the fetch failed", () => {
    expect(pickerEntries({ available: false }, [])).toBeNull();
    expect(pickerEntries(null, [])).toBeNull();
  });
});

describe("adding a row from the picker", () => {
  const a = task("a");
  const b = task("b");
  const rows: DraftRow[] = [
    { key: "r1", course: "CS 341", minutes: "30", task: { id: "a", title: "Task a", subject: "CS 341" } },
    { key: "r2", course: "CS 341", minutes: "10", task: null },
  ];
  it("ticks a task that already has a row, and only that one", () => {
    expect(pickerEntries({ available: true, tasks: [a, b] }, rows)).toEqual([
      { kind: "task", task: a, inBlock: true },
      { kind: "task", task: b, inBlock: false },
      { kind: "other" },
    ]);
  });
  it("removes the row of a ticked task, by its key", () => {
    expect(toggleTask(rows, a)).toEqual({ remove: "r1" });
  });
  it("adds an empty row for an unticked task, carrying only id, title and subject", () => {
    const step = toggleTask(rows, b);
    expect("add" in step && step.add).toEqual({ key: expect.any(String), course: "CS 341", minutes: "", task: { id: "b", title: "Task b", subject: "CS 341" } });
  });
});

describe("deadlines", () => {
  // Sat 2026-11-21 14:30 local time; deadlines are instants with an offset, shown in local time.
  const now = new Date(2026, 10, 21, 14, 30);
  const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString();
  it("gives the weekday and time within the coming week", () => {
    expect(dueParts(at(2026, 11, 24, 23, 59), now)).toEqual({ date: "2026-11-24", time: "23:59", soon: true });
    expect(dueParts(at(2026, 11, 22, 11, 0), now)).toEqual({ date: "2026-11-22", time: "11:00", soon: true });
    expect(dueParts(at(2026, 11, 27, 23, 59), now)).toEqual({ date: "2026-11-27", time: "23:59", soon: true });
  });
  it("gives only the date further out or already past", () => {
    expect(dueParts(at(2027, 4, 30, 23, 59), now)).toEqual({ date: "2027-04-30", time: "23:59", soon: false });
    expect(dueParts(at(2026, 11, 28, 9, 0), now).soon).toBe(false);
    expect(dueParts(at(2026, 11, 20, 9, 0), now).soon).toBe(false);
  });
  it("reads in both languages", () => {
    expect(en.picker.due(dueParts(at(2026, 11, 24, 23, 59), now))).toBe("Due Tue 23:59");
    expect(en.picker.due(dueParts(at(2027, 4, 30, 23, 59), now))).toBe("Due Apr 30");
    expect(zh.picker.due(dueParts(at(2026, 11, 24, 23, 59), now))).toBe("周二 23:59 截止");
    expect(zh.picker.due(dueParts(at(2027, 4, 30, 23, 59), now))).toBe("4 月 30 日截止");
  });
});
