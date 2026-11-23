// Picking what a study block is for from life-os's list of unfinished tasks.
// Pure: no DOM, no fetch.
import { daysBetween, localTime, localToday, type Task } from "./stats";
import { taskRow, type DraftRow } from "./draft";

/** One task life-os offers, in the order life-os ranks them. */
export type PickTask = Task & { deadline: string; hasBlockToday: boolean };

/** GET /api/pick-list. A failed request counts as null, the same as unavailable. */
export type PickList = { available: false } | { available: true; tasks: PickTask[] };

export type PickerEntry = { kind: "task"; task: PickTask; inBlock: boolean } | { kind: "other" };

/**
 * What the picker lists: the tasks in life-os's order, each ticked when the
 * block already has a row for it, then "Other". Null when there is no list,
 * in which case nothing is picked: Start stamps the time and rows are typed.
 */
export function pickerEntries(list: PickList | null, rows: readonly { task?: Task | null }[]): PickerEntry[] | null {
  if (!list?.available) return null;
  const inBlock = new Set(rows.flatMap((r) => (r.task ? [r.task.id] : [])));
  return [...list.tasks.map((task) => ({ kind: "task" as const, task, inBlock: inBlock.has(task.id) })), { kind: "other" }];
}

/** Only what a row keeps of a picked task. */
export const taskOf = ({ id, title, subject }: Task): Task => ({ id, title, subject });

/**
 * Tapping a task in the "Add a row" picker: removes its row when the block
 * already has one (as the course chips toggle), else adds an empty row for it.
 */
export function toggleTask(rows: readonly DraftRow[], task: Task): { remove: string } | { add: DraftRow } {
  const row = rows.find((r) => r.task?.id === task.id);
  return row ? { remove: row.key } : { add: taskRow(taskOf(task)) };
}

/** A deadline in local time; `soon` when it falls later today or within the next six days. */
export type DueParts = { date: string; time: string; soon: boolean };

export function dueParts(deadline: string, now = new Date()): DueParts {
  const d = new Date(deadline);
  const date = localToday(d);
  const ahead = daysBetween(localToday(now), date);
  return { date, time: localTime(d), soon: d >= now && ahead >= 0 && ahead <= 6 };
}
