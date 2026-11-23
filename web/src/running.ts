// The study block in progress ("started, not ended") lives on the server, so
// it shows on every device; the rest of the unsaved form stays in this
// browser's draft. Pure: no DOM, no fetch.
import { emptyDraft, isRunning, rowKey, taskCourse, taskRow, type Draft, type DraftRow } from "./draft";
import { localTime, localToday, type Task } from "./stats";

/** What a running block is for, as the server reads it back. */
export type Entry = { course: string; task: Task | null };

/** GET /api/running. */
export type Running = { date: string; start: string; entry: Entry | null };

/** What a running block is for, as PUT /api/running takes it. */
export type EntryInput = { task: Task; course?: string } | { course: string };

export type RunningInput = { date: string; start: string; entry: EntryInput | null };

const entryInput = (r: DraftRow): EntryInput =>
  r.task ? (r.course === taskCourse(r.task) ? { task: r.task } : { task: r.task, course: r.course }) : { course: r.course };

/** The running block a started form describes: its day, start and first row. */
export const runningOf = (d: Draft): RunningInput => ({ date: d.date, start: d.start, entry: d.rows[0] ? entryInput(d.rows[0]) : null });

/** The server's reading of what a form sends: a task row's course defaults to its subject, then title. */
export const readBack = (r: RunningInput): Running => ({
  date: r.date,
  start: r.start,
  entry: r.entry === null ? null : "task" in r.entry ? { course: r.entry.course ?? taskCourse(r.entry.task), task: r.entry.task } : { course: r.entry.course, task: null },
});

const sameTask = (a: Task | null, b: Task | null) => a === b || (!!a && !!b && a.id === b.id && a.title === b.title && a.subject === b.subject);

/** True when the server already holds what the form would send. */
export function sameRunning(server: Running | null | undefined, form: RunningInput): boolean {
  if (!server) return false;
  const f = readBack(form);
  if (server.date !== f.date || server.start !== f.start) return false;
  if (!server.entry || !f.entry) return server.entry === f.entry;
  return server.entry.course === f.entry.course && sameTask(server.entry.task, f.entry.task);
}

/**
 * What a new-entry form does to the server's running block after a change.
 * `sent` is the form's own block (see formBlock's `mine`): the one it opened
 * with (see openedWith) or last sent (null: none, or ended since).
 *
 * - While the form describes a running block it sends it (PUT), unless the
 *   server already holds it or it is `sent` unchanged, so a form merely left
 *   open does not send back a block another device has since ended or
 *   replaced. Once edited it does send it, expecting its own block (`sent`),
 *   and the server refuses it (409) because that block is gone.
 * - Once the form stops (End stamped, Start cleared, the date moved out of the
 *   window) it ends the block, but only its own (`sent`'s date and start);
 *   another device's block is left alone.
 */
export function runningStep(
  form: Draft,
  server: Running | null | undefined,
  sent: RunningInput | null,
  today = localToday(),
): { put: RunningInput } | "end" | null {
  if (isRunning(form, today)) {
    const want = runningOf(form);
    return sameRunning(server, want) || sameRunning(sent && readBack(sent), want) ? null : { put: want };
  }
  return server && sent && server.date === sent.date && server.start === sent.start ? "end" : null;
}

/**
 * A new-entry form's own running block. `sent` is the block the server last
 * confirmed for it (openedWith, then each write answered ok); `mine` counts
 * the writes still on their way too, so each write expects what the ones
 * before it leave behind if they succeed. A write that fails changes nothing.
 */
export function formBlock(opened: RunningInput | null) {
  let sent = opened;
  let asked: { block: RunningInput | null } | null = null; // the newest write on its way
  const mine = () => (asked ? asked.block : sent);
  return {
    get mine() {
      return mine();
    },
    /** A write of `block` (null: End) is going out: the block it expects, and where its outcome goes. */
    ask(block: RunningInput | null) {
      const expected = mine();
      const write = { block };
      asked = write;
      return {
        expected,
        settle(ok: boolean) {
          if (ok) sent = block;
          if (asked === write) asked = null;
        },
      };
    },
  };
}

/**
 * The `sent` a new-entry form opens with: its block, when that is the
 * server's block (same date and start), else null. A draft ended here but not
 * saved is not on the server, so clearing its End sends it again.
 */
export const openedWith = (opened: Draft, server: Running | null | undefined): RunningInput | null =>
  server && opened.date === server.date && opened.start === server.start ? runningOf(opened) : null;

const matches = (r: DraftRow, e: Entry) => (e.task ? r.task?.id === e.task.id : !r.task && r.course === e.course);

/** Puts the row for `entry` (null: nothing) first, moving it if the draft already has it. */
function withFirst(rows: DraftRow[], entry: Entry | null): DraftRow[] {
  if (!entry) return rows;
  const i = rows.findIndex((r) => matches(r, entry));
  if (i === 0) return rows;
  if (i > 0) return [rows[i], ...rows.slice(0, i), ...rows.slice(i + 1)];
  const row = entry.task ? { ...taskRow(entry.task), course: entry.course } : { key: rowKey(), course: entry.course, minutes: "", task: null };
  return [row, ...rows];
}

/**
 * "Start studying": the block starts at the moment Start was tapped, not when
 * the task was picked. A picked task becomes the first row; Other (null)
 * adds none. Whatever an unstarted draft already holds is kept.
 */
export function startDraft(stored: Draft | null, tapped: Date, task: Task | null): Draft {
  const base = stored ?? emptyDraft(localToday(tapped));
  return { ...base, date: localToday(tapped), start: localTime(tapped), end: "", rows: withFirst(base.rows, task && { course: taskCourse(task), task }) };
}

/**
 * The form to show, given this browser's draft and the server's running
 * block (undefined: the server could not be asked).
 *
 * - The same block (same date and start) keeps this draft as it is, End
 *   included, with the server's entry as the first row. Any other block on
 *   the server (started on another device) replaces the draft: the form is
 *   that block alone, its entry as the only row.
 * - A draft running from before the upgrade, when the server has none, is
 *   carried over to the server once (`carried` false). After that, a running
 *   draft the server no longer has was saved or discarded on another device,
 *   so it is dropped.
 */
export function reconcile(
  local: Draft | null,
  server: Running | null | undefined,
  { carried, today = localToday() }: { carried: boolean; today?: string },
): { draft: Draft | null; carryOver: RunningInput | null } {
  if (server === undefined) return { draft: local, carryOver: null };
  if (server) {
    const same = !!local && local.date === server.date && local.start === server.start;
    const base = same ? local : { ...emptyDraft(server.date), start: server.start };
    const rows = withFirst(base.rows, server.entry);
    return { draft: rows === base.rows ? base : { ...base, rows }, carryOver: null };
  }
  if (!local || !isRunning(local, today)) return { draft: local, carryOver: null };
  return carried ? { draft: null, carryOver: null } : { draft: local, carryOver: runningOf(local) };
}
