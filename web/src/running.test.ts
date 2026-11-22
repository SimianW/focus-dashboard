import { describe, expect, it } from "vitest";
import { emptyDraft, type Draft, type DraftRow } from "./draft";
import { formBlock, openedWith, reconcile, runningOf, runningStep, sameRunning, startDraft, type Running, type RunningInput } from "./running";

const cs341 = { id: "t-1", title: "CS 341 A3: dynamic programming", subject: "CS 341" };
const tapped = new Date(2026, 10, 21, 14, 5, 40); // Sat 2026-11-21 14:05:40, local time

describe("starting a block", () => {
  it("stamps the moment Start was tapped and makes the picked task the first row", () => {
    const d = startDraft(null, tapped, cs341);
    expect(d).toEqual({ ...emptyDraft("2026-11-21"), start: "14:05", rows: [{ key: expect.any(String), course: "CS 341", minutes: "", task: cs341 }] });
    expect(runningOf(d)).toEqual({ date: "2026-11-21", start: "14:05", entry: { task: cs341 } });
  });
  it("starts with no row for Other, exactly as before", () => {
    const d = startDraft(null, tapped, null);
    expect(d).toEqual({ ...emptyDraft("2026-11-21"), start: "14:05" });
    expect(runningOf(d)).toEqual({ date: "2026-11-21", start: "14:05", entry: null });
  });
  it("keeps what was typed in an unstarted draft, with the task in front", () => {
    const typed: Draft = { ...emptyDraft("2026-11-20"), note: "ch. 4", rows: [{ key: "r1", course: "PHYS 234", minutes: "15", task: null }] };
    const d = startDraft(typed, tapped, cs341);
    expect(d.date).toBe("2026-11-21");
    expect(d.note).toBe("ch. 4");
    expect(d.rows.map((r) => r.course)).toEqual(["CS 341", "PHYS 234"]);
    expect(runningOf(d).entry).toEqual({ task: cs341 });
  });
  it("sends a typed first row as {course}", () => {
    const d: Draft = { ...emptyDraft("2026-11-21"), start: "09:00", rows: [{ key: "r1", course: "PHYS 234", minutes: "", task: null }] };
    expect(runningOf(d)).toEqual({ date: "2026-11-21", start: "09:00", entry: { course: "PHYS 234" } });
  });
});

describe("reconciling the server's running block with this browser's draft", () => {
  const today = "2026-11-21";
  const server: Running = { date: today, start: "14:05", entry: { course: "CS 341", task: cs341 } };
  const phys: DraftRow = { key: "r9", course: "PHYS 234", minutes: "15", task: null };

  it("takes the server's block when this browser has no draft (started on another device)", () => {
    const { draft, carryOver } = reconcile(null, server, { carried: true, today });
    expect(draft).toEqual({ ...emptyDraft(today), start: "14:05", rows: [{ key: expect.any(String), course: "CS 341", minutes: "", task: cs341 }] });
    expect(carryOver).toBeNull();
  });
  it("shows another block on the server as it is, without this draft's rows, minutes or note", () => {
    const local: Draft = { ...emptyDraft("2026-11-19"), start: "08:00", end: "09:30", note: "ch. 4", energy: 3, interruptions: "2", rows: [phys] };
    const { draft } = reconcile(local, server, { carried: true, today });
    expect(draft).toEqual({ ...emptyDraft(today), start: "14:05", rows: [{ key: expect.any(String), course: "CS 341", minutes: "", task: cs341 }] });
  });
  it("keeps a block ended here but not saved once the server has no running block", () => {
    const ended: Draft = { ...emptyDraft(today), start: "14:05", end: "15:35", rows: [{ key: "r1", course: "CS 341", minutes: "60", task: cs341 }] };
    expect(reconcile(ended, null, { carried: true, today })).toEqual({ draft: ended, carryOver: null });
  });
  it("keeps the local rows, minutes and End of the same block", () => {
    const local: Draft = { ...emptyDraft(today), start: "14:05", end: "15:35", rows: [{ key: "r1", course: "CS 341", minutes: "60", task: cs341 }, phys] };
    expect(reconcile(local, server, { carried: true, today }).draft).toEqual(local);
  });
  it("moves the server's task to the front instead of adding it twice", () => {
    const local: Draft = { ...emptyDraft(today), start: "14:05", rows: [phys, { key: "r1", course: "CS 341", minutes: "60", task: cs341 }] };
    expect(reconcile(local, server, { carried: true, today }).draft!.rows.map((r) => r.key)).toEqual(["r1", "r9"]);
  });
  it("leaves the local rows alone when the server's block has no entry yet", () => {
    const local: Draft = { ...emptyDraft(today), start: "14:05", rows: [phys] };
    expect(reconcile(local, { ...server, entry: null }, { carried: true, today }).draft).toEqual(local);
  });
  it("carries a block started before the upgrade over to the server once", () => {
    const local: Draft = { ...emptyDraft(today), start: "13:00", rows: [phys] };
    expect(reconcile(local, null, { carried: false, today })).toEqual({
      draft: local,
      carryOver: { date: today, start: "13:00", entry: { course: "PHYS 234" } },
    });
  });
  it("after the carry-over, treats a local block the server no longer has as ended elsewhere", () => {
    const local: Draft = { ...emptyDraft(today), start: "13:00", rows: [phys] };
    expect(reconcile(local, null, { carried: true, today })).toEqual({ draft: null, carryOver: null });
  });
  it("never carries over or drops a draft that is not running", () => {
    const past: Draft = { ...emptyDraft("2026-11-18"), start: "09:00", end: "10:00", rows: [phys] };
    const stale: Draft = { ...emptyDraft("2026-11-17"), start: "09:00" };
    for (const local of [past, stale, null]) {
      expect(reconcile(local, null, { carried: false, today })).toEqual({ draft: local, carryOver: null });
      expect(reconcile(local, null, { carried: true, today })).toEqual({ draft: local, carryOver: null });
    }
  });
  it("keeps the local draft as it is when the server could not be asked", () => {
    const local: Draft = { ...emptyDraft(today), start: "13:00", rows: [phys] };
    expect(reconcile(local, undefined, { carried: true, today })).toEqual({ draft: local, carryOver: null });
  });
});

describe("sameRunning", () => {
  it("compares what the server read back with what a form would send", () => {
    const d: Draft = { ...emptyDraft("2026-11-21"), start: "14:05", rows: [{ key: "r1", course: "CS 341", minutes: "", task: cs341 }] };
    expect(sameRunning({ date: "2026-11-21", start: "14:05", entry: { course: "CS 341", task: cs341 } }, runningOf(d))).toBe(true);
    expect(sameRunning({ date: "2026-11-21", start: "14:05", entry: null }, runningOf(d))).toBe(false);
    expect(sameRunning({ date: "2026-11-21", start: "14:06", entry: { course: "CS 341", task: cs341 } }, runningOf(d))).toBe(false);
    expect(sameRunning(null, runningOf(d))).toBe(false);
    expect(sameRunning({ date: "2026-11-21", start: "09:00", entry: { course: "Math", task: null } }, { date: "2026-11-21", start: "09:00", entry: { course: "Math" } })).toBe(true);
  });
});

describe("runningStep: what a new-entry form does to the server's block", () => {
  const today = "2026-11-21";
  const row: DraftRow = { key: "r1", course: "CS 341", minutes: "", task: cs341 };
  const form: Draft = { ...emptyDraft(today), start: "14:05", rows: [row] };
  const mine: Running = { date: today, start: "14:05", entry: { course: "CS 341", task: cs341 } };
  const sent = runningOf(form);

  it("sends a running form the server does not hold yet, and nothing once it does", () => {
    expect(runningStep(form, null, null, today)).toEqual({ put: sent });
    expect(runningStep(form, mine, sent, today)).toBeNull();
    expect(runningStep({ ...form, start: "14:00" }, mine, sent, today)).toEqual({ put: { ...sent, start: "14:00" } });
  });
  it("ends the block it owns once End is stamped, Start cleared or the date moved out of the window", () => {
    for (const stopped of [{ ...form, end: "15:35" }, { ...form, start: "" }, { ...form, date: "2026-11-18" }]) {
      expect(runningStep(stopped, mine, sent, today)).toBe("end");
    }
  });
  it("leaves alone a block it did not open or send", () => {
    const foreign: Running = { date: today, start: "16:00", entry: null };
    expect(runningStep({ ...form, end: "15:35" }, foreign, sent, today)).toBeNull();
    expect(runningStep(emptyDraft(today), mine, null, today)).toBeNull();
    expect(runningStep({ ...form, end: "15:35" }, null, sent, today)).toBeNull();
  });
  it("resumes a block ended here but not saved when End is cleared (L13)", () => {
    const ended = { ...form, end: "15:35" };
    expect(runningStep(form, null, openedWith(ended, null), today)).toEqual({ put: sent });
  });
  it("owns the server's block when it opens on it, so End then ends it", () => {
    expect(openedWith(form, mine)).toEqual(sent);
    expect(runningStep({ ...form, end: "15:35" }, mine, openedWith(form, mine), today)).toBe("end");
    expect(openedWith(form, { ...mine, start: "16:00" })).toBeNull();
  });
  it("never sends back, unchanged, a block another device has since ended or replaced", () => {
    expect(runningStep(form, null, sent, today)).toBeNull();
    expect(runningStep(form, { date: today, start: "16:00", entry: null }, sent, today)).toBeNull();
  });
});

describe("formBlock: the block a new-entry form's writes expect (L15, L16)", () => {
  const at = (start: string): RunningInput => ({ date: "2026-11-21", start, entry: null });

  it("expects the block it opened with, and moves on only once the server answers ok", () => {
    const own = formBlock(at("09:00"));
    const moved = own.ask(at("09:15"));
    expect(moved.expected).toEqual(at("09:00"));
    expect(own.mine).toEqual(at("09:15")); // on its way: what the next write expects
    moved.settle(true);
    expect(own.mine).toEqual(at("09:15"));
    expect(own.ask(at("09:20")).expected).toEqual(at("09:15"));
  });

  it("a write that fails leaves the form on the block the server last confirmed", () => {
    const own = formBlock(at("09:00"));
    own.ask(at("09:15")).settle(false);
    expect(own.mine).toEqual(at("09:00"));
    expect(own.ask(null).expected).toEqual(at("09:00"));
  });

  it("a write queued behind one expects it, and stays the form's block when the earlier one fails", () => {
    const own = formBlock(null);
    const start = own.ask(at("09:00"));
    const moved = own.ask(at("09:15"));
    expect(moved.expected).toEqual(at("09:00"));
    start.settle(false);
    expect(own.mine).toEqual(at("09:15"));
    moved.settle(true);
    expect(own.mine).toEqual(at("09:15"));
  });

  it("an End answered ok leaves the form owning no block", () => {
    const own = formBlock(at("09:00"));
    own.ask(null).settle(true);
    expect(own.mine).toBeNull();
  });
});
