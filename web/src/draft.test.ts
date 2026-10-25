import { describe, expect, it } from "vitest";
import { emptyDraft, isRunning, openDraft, type Draft } from "./draft";

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
    expect(openDraft(running, { startNow: true, now })).toEqual({ form: running, kept: null });
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
    expect(openDraft(null, { startNow: true, now }).form).toEqual({ ...emptyDraft("2026-10-25"), start: "15:00" });
  });
});
