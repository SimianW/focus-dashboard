import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDraft, writeDraft, type Draft } from "./draft";
import { localToday } from "./stats";
import { currentDraft } from "./store";
import { runningOf } from "./running";
import { runningSync } from "./runningSync";

/** This browser's storage, as a test controls it. */
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, String(v)),
    removeItem: (k: string) => void items.delete(k),
  };
}

describe("the form opens on a pre-upgrade running draft until its carry-over succeeds (L18)", () => {
  const preUpgrade: Draft = { ...emptyDraft(localToday()), start: "08:00", rows: [{ key: "r1", course: "PHYS 234", minutes: "", task: null }] };

  beforeEach(() => vi.stubGlobal("localStorage", fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the draft while the server has no block and the carry-over has not succeeded yet", () => {
    writeDraft(preUpgrade);
    expect(currentDraft(null)).toEqual(preUpgrade);
  });

  it("drops it once the carry-over has succeeded and the server has no block (saved or discarded elsewhere)", () => {
    writeDraft(preUpgrade);
    localStorage.setItem("focus-running-carried-v1", "1");
    expect(currentDraft(null)).toBeNull();
  });
});

describe("a block whose Start never reached the server is not taken as ended elsewhere (L19)", () => {
  const started: Draft = { ...emptyDraft(localToday()), start: "14:05", rows: [{ key: "r1", course: "CS 341", minutes: "", task: null }] };

  beforeEach(() => vi.stubGlobal("localStorage", fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the draft when Overview's PUT failed before /add opened, so the form sends it again", async () => {
    localStorage.setItem("focus-running-carried-v1", "1");
    const sync = runningSync(
      { read: async () => null, put: () => Promise.reject(new TypeError("Failed to fetch")), delete: async () => {} },
      { change: () => {}, conflict: () => {}, error: () => {} },
    );
    await sync.read();
    writeDraft(started);
    expect(await sync.write(runningOf(started), null)).toBe("failed");
    expect(await sync.read()).toBeNull(); // /add reads the block again on opening

    expect(currentDraft(null, sync.undelivered)).toEqual(started);
  });
});
