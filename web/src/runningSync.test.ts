import { describe, expect, it } from "vitest";
import { keyOf, openFormBlock, runningSync, type RunningIo } from "./runningSync";
import { runningOf, runningStep, type Running, type RunningInput } from "./running";
import { emptyDraft, type Draft } from "./draft";

const today = "2026-11-21";
const block = (start: string, course: string | null = null): Running => ({ date: today, start, entry: course ? { course, task: null } : null });
const input = (start: string, course: string | null = null): RunningInput => ({ date: today, start, entry: course ? { course } : null });
const key = (start: string) => ({ date: today, start });

/** The server as a test controls it: every request waits until answered. */
function fakeServer() {
  const sent: { call: string; body?: unknown; expected?: unknown; answer: (v: unknown) => void; fail: (e: unknown) => void }[] = [];
  const pending = <T,>(call: string, body?: unknown, expected?: unknown) =>
    new Promise<T>((answer, fail) => sent.push({ call, body, expected, answer: answer as (v: unknown) => void, fail }));
  const io: RunningIo = {
    read: () => pending("read"),
    put: (r, expected) => pending("put", r, expected),
    delete: (expected) => pending("delete", undefined, expected),
  };
  const changed = (running: Running | null) => Object.assign(new Error("running block changed"), { status: 409, data: { running } });
  return { io, sent, changed };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const server = fakeServer();
  const seen = { shown: undefined as Running | null | undefined, conflicts: 0, errors: [] as string[] };
  const sync = runningSync(server.io, {
    change: (r) => (seen.shown = r),
    conflict: () => seen.conflicts++,
    error: (e) => seen.errors.push(e.message),
  });
  return { ...server, sync, seen };
}

describe("running writes name the block their caller believes the server holds", () => {
  it("a start from a view that missed another device's block is refused, and that block shown instead (L4b)", async () => {
    const { sync, sent, seen, changed } = setup();
    const read = sync.read();
    sent[0].answer(null);
    await read;

    const write = sync.write(input("10:30"), null); // Start tapped on a view showing no block
    await flush();
    expect(sent[1]).toMatchObject({ call: "put", body: input("10:30"), expected: null });
    sent[1].fail(changed(block("09:00", "Reading")));
    expect(await write).toBe("conflict");
    expect(seen.shown).toEqual(block("09:00", "Reading"));
    expect(seen.conflicts).toBe(1);
    expect(seen.errors).toEqual([]);
  });

  it("sends writes one at a time, in order, so an update never lands after the End that follows it (L12)", async () => {
    const { sync, sent, seen } = setup();
    const read = sync.read();
    sent[0].answer(block("09:00"));
    await read;

    const update = sync.write(input("09:00", "Reading"), key("09:00"));
    const end = sync.write(null, key("09:00"));
    await flush();
    expect(sent.slice(1).map((s) => s.call)).toEqual(["put"]);
    expect(seen.shown).toBeNull();

    sent[1].answer(block("09:00", "Reading"));
    await update;
    await flush();
    expect(sent[2]).toMatchObject({ call: "delete", expected: key("09:00") });
    expect(seen.shown).toBeNull();
    sent[2].answer(undefined);
    expect(await end).toBe("ok");
    expect(seen.shown).toBeNull();
  });
});

describe("reading the block again while a write is on its way (L14)", () => {
  it("never replaces a carried-over draft with an older answer that has none", async () => {
    const { sync, sent, seen } = setup();
    const before = sync.read(); // e.g. back on this tab while the first load carries a draft over
    const carry = sync.write(input("08:00", "Reading"), null);
    const during = sync.read();
    await flush();
    expect(sent[1]).toMatchObject({ call: "put", expected: null });

    sent[0].answer(null);
    await before;
    sent[2]?.answer(null);
    await during;
    expect(seen.shown).toEqual(block("08:00", "Reading"));

    sent[1].answer(block("08:00", "Reading"));
    expect(await carry).toBe("ok");
    expect(seen.shown).toEqual(block("08:00", "Reading"));
  });
});

describe("a write expects the block its caller is editing, not the page's latest read (L15)", () => {
  it("a form still on its old block, after a re-read shows another device's, is refused instead of overwriting it", async () => {
    const { sync, sent, seen, changed } = setup();
    const first = sync.read();
    sent[0].answer(block("09:00", "Reading"));
    await first;
    const again = sync.read(); // back on this tab: another device ended 09:00 and started 10:30
    sent[1].answer(block("10:30", "Math"));
    await again;

    const write = sync.write(input("09:00", "Physics"), key("09:00"));
    await flush();
    expect(sent[2]).toMatchObject({ call: "put", expected: key("09:00") });
    sent[2].fail(changed(block("10:30", "Math")));
    expect(await write).toBe("conflict");
    expect(seen.shown).toEqual(block("10:30", "Math"));
  });

  it("a form still on a block another device ended does not bring it back", async () => {
    const { sync, sent, seen, changed } = setup();
    const first = sync.read();
    sent[0].answer(block("09:00", "Reading"));
    await first;
    const again = sync.read();
    sent[1].answer(null);
    await again;

    const write = sync.write(input("09:00", "Physics"), key("09:00"));
    await flush();
    expect(sent[2]).toMatchObject({ call: "put", expected: key("09:00") });
    sent[2].fail(changed(null));
    expect(await write).toBe("conflict");
    expect(seen.shown).toBeNull();
  });

  it("the one-time carry-over expects nothing, even after a re-read shows another device's block (S13)", async () => {
    const { sync, sent } = setup();
    const first = sync.read();
    sent[0].answer(null);
    await first;
    const again = sync.read();
    sent[1].answer(block("10:30", "Math"));
    await again;

    sync.write(input("08:00", "Reading"), null);
    await flush();
    expect(sent[2]).toMatchObject({ call: "put", expected: null });
  });
});

describe("a write that fails without an answer leaves the server's block in charge (L16)", () => {
  const network = () => new TypeError("Failed to fetch");

  it("after a failed PUT the page shows the server's block again, and the next write expects it", async () => {
    const { sync, sent, seen } = setup();
    const first = sync.read();
    sent[0].answer(block("09:00", "Reading"));
    await first;

    const moved = sync.write(input("09:15", "Reading"), key("09:00")); // Start edited to 09:15
    await flush();
    sent[1].fail(network());
    expect(await moved).toBe("failed");
    expect(seen.shown).toEqual(block("09:00", "Reading"));

    // The form still believes its 09:15 block was sent.
    const again = sync.write(input("09:20", "Reading"), key("09:15"));
    await flush();
    expect(sent[2]).toMatchObject({ call: "put", expected: key("09:00") });
    sent[2].answer(block("09:20", "Reading"));
    expect(await again).toBe("ok");
    expect(seen.shown).toEqual(block("09:20", "Reading"));
  });

  it("a write queued behind one that fails expects what the server still holds", async () => {
    const { sync, sent, seen } = setup();
    const first = sync.read();
    sent[0].answer(block("09:00"));
    await first;

    const moved = sync.write(input("09:15"), key("09:00"));
    const next = sync.write(input("09:15", "Reading"), key("09:15"));
    await flush();
    sent[1].fail(network());
    expect(await moved).toBe("failed");
    expect(seen.shown).toEqual(block("09:15", "Reading")); // the newer write's view stays
    await flush();
    expect(sent[2]).toMatchObject({ call: "put", expected: key("09:00") });
    sent[2].answer(block("09:15", "Reading"));
    expect(await next).toBe("ok");
  });

  it("after a failed DELETE the block shows again, and the next write expects it", async () => {
    const { sync, sent, seen } = setup();
    const first = sync.read();
    sent[0].answer(block("09:00", "Reading"));
    await first;

    const end = sync.write(null, key("09:00"));
    await flush();
    expect(seen.shown).toBeNull();
    sent[1].fail(network());
    expect(await end).toBe("failed");
    expect(seen.shown).toEqual(block("09:00", "Reading"));

    // End cleared on the form, which believes its block was ended.
    sync.write(input("09:00", "Reading"), null);
    await flush();
    expect(sent[2]).toMatchObject({ call: "put", expected: key("09:00") });
  });

  it("a write whose answer was lost but which landed is not rebased once a read shows it", async () => {
    const { sync, sent } = setup();
    const first = sync.read();
    sent[0].answer(block("09:00"));
    await first;

    const moved = sync.write(input("09:15"), key("09:00"));
    await flush();
    sent[1].fail(network()); // the server did store 09:15
    await moved;
    const again = sync.read();
    sent[2].answer(block("09:15"));
    await again;

    sync.write(input("09:15", "Reading"), key("09:15"));
    await flush();
    expect(sent[3]).toMatchObject({ call: "put", expected: key("09:15") });
  });
});

describe("a form opened while Overview's Start is on its way waits on it, not as if confirmed (L19)", () => {
  const network = () => new TypeError("Failed to fetch");
  // Start tapped on Overview with a task picked: the draft it wrote, and the write it sent.
  const started: Draft = { ...emptyDraft(today), start: "14:05", rows: [{ key: "r1", course: "CS 341", minutes: "", task: null }] };

  async function startOnOverview() {
    const t = setup();
    const first = t.sync.read();
    t.sent[0].answer(null);
    await first;
    const start = t.sync.write(runningOf(started), null);
    // Entry mounts on /add straight away, while that PUT is on its way.
    const opened = openFormBlock(started, t.sync);
    expect(runningStep(started, t.seen.shown, opened.own.mine, today)).toBeNull(); // no second PUT while it waits
    await flush();
    expect(t.sent[1]).toMatchObject({ call: "put", body: runningOf(started), expected: null });
    return { ...t, start, ...opened };
  }

  it("sends the block again once Overview's PUT fails without an answer", async () => {
    const { sync, sent, seen, start, own, settled } = await startOnOverview();
    sent[1].fail(network());
    expect(await start).toBe("failed");
    await settled;
    expect(seen.shown).toBeNull();

    const step = runningStep(started, seen.shown, own.mine, today);
    expect(step).toEqual({ put: runningOf(started) });
    const write = own.ask(runningOf(started));
    sync.write(runningOf(started), keyOf(write.expected));
    await flush();
    expect(sent[2]).toMatchObject({ call: "put", body: runningOf(started), expected: null });
  });

  it("once Overview's PUT succeeds, the form's later edits expect the started block", async () => {
    const { sync, sent, seen, start, own, settled } = await startOnOverview();
    sent[1].answer(block("14:05", "CS 341"));
    expect(await start).toBe("ok");
    await settled;
    expect(runningStep(started, seen.shown, own.mine, today)).toBeNull();

    const moved = { ...started, start: "14:00" };
    const step = runningStep(moved, seen.shown, own.mine, today);
    expect(step).toEqual({ put: runningOf(moved) });
    const write = own.ask(runningOf(moved));
    sync.write(runningOf(moved), keyOf(write.expected));
    await flush();
    expect(sent[2]).toMatchObject({ call: "put", expected: key("14:05") });
  });
});
