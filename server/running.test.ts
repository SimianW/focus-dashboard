import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./testing.ts";

const a2 = { id: "task-a2", title: "CS341 A2", subject: "CS341" };

test("the running block can be started, changed, read back and stopped", async () => {
  const { call, login } = setup();
  await login();
  assert.deepEqual((await call("GET", "/api/running")).json, null);

  const started = await call("PUT", "/api/running", { date: "2026-11-21", start: "14:05", entry: null, expected: null });
  assert.equal(started.status, 200);
  assert.deepEqual(started.json, { date: "2026-11-21", start: "14:05", entry: null });

  const picked = await call("PUT", "/api/running", { date: "2026-11-21", start: "14:05", entry: { task: a2 }, expected: started.json });
  assert.deepEqual(picked.json, { date: "2026-11-21", start: "14:05", entry: { course: "CS341", task: a2 } });
  assert.deepEqual((await call("GET", "/api/running")).json, picked.json);

  const typed = await call("PUT", "/api/running", { date: "2026-11-21", start: "14:05", entry: { course: " Reading " }, expected: started.json });
  assert.deepEqual(typed.json, { date: "2026-11-21", start: "14:05", entry: { course: "Reading", task: null } });

  assert.equal((await call("DELETE", "/api/running?date=2026-11-21&start=14:05")).status, 204);
  assert.deepEqual((await call("GET", "/api/running")).json, null);
  assert.equal((await call("DELETE", "/api/running?date=2026-11-21&start=14:05")).status, 204);
});

test("an invalid running block is rejected and the stored one kept", async () => {
  const { call, login } = setup();
  await login();
  const kept = { date: "2026-11-21", start: "09:00", entry: { course: "Reading", task: null } };
  await call("PUT", "/api/running", { ...kept, expected: null });
  const cases: [unknown, RegExp][] = [
    [{ date: "2026-02-30", start: "09:00", entry: null }, /date/],
    [{ date: "2026-11-21", start: "9:00", entry: null }, /start/],
    [{ date: "2026-11-21", entry: null }, /start/],
    [{ date: "2026-11-21", start: "09:00", entry: { course: " " } }, /course name is required/],
    [{ date: "2026-11-21", start: "09:00", entry: { task: { ...a2, title: "" } } }, /task title/],
    [{ date: "2026-11-21", start: "09:00", entry: "Reading" }, /entry/],
    [{ date: "2026-11-21", start: "09:00" }, /entry/],
  ];
  for (const [body, message] of cases) {
    const res = await call("PUT", "/api/running", { ...(body as object), expected: { date: "2026-11-21", start: "09:00" } });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.json.error, message);
  }
  assert.deepEqual((await call("GET", "/api/running")).json, kept);
});

test("the running block survives reopening the database", async () => {
  const first = setup();
  await first.login();
  await first.call("PUT", "/api/running", { date: "2026-11-21", start: "23:40", entry: { task: a2, course: "Algorithms" }, expected: null });
  const second = setup({}, first.dataDir);
  await second.login();
  assert.deepEqual((await second.call("GET", "/api/running")).json, {
    date: "2026-11-21",
    start: "23:40",
    entry: { course: "Algorithms", task: a2 },
  });
});

test("saving the running block as a session ends it in the same request; another session leaves it", async () => {
  const { call, login } = setup();
  await login();
  const running = { date: "2026-11-21", start: "14:05", entry: { course: "Reading", task: null } };
  await call("PUT", "/api/running", { ...running, expected: null });
  const session = { date: "2026-11-21", end: "15:00", courses: [{ course: "Reading", minutes: 40 }] };

  assert.equal((await call("POST", "/api/sessions", { ...session, start: "14:00" })).status, 201);
  assert.deepEqual((await call("GET", "/api/running")).json, running);
  assert.equal((await call("POST", "/api/sessions", { ...session, date: "2026-11-20", start: "14:05" })).status, 201);
  assert.deepEqual((await call("GET", "/api/running")).json, running);

  assert.equal((await call("POST", "/api/sessions", { ...session, start: "14:05" })).status, 201);
  assert.equal((await call("GET", "/api/running")).json, null);
});

// Every write names the block the page believes the server holds, so a stale
// view on one device never overwrites or ends another device's newer block.
const block = (start: string, entry: unknown = null) => ({ date: "2026-11-21", start, entry });
const key = (start: string) => ({ date: "2026-11-21", start });

test("a start from a view that missed another device's block is refused and the block kept (L4b)", async () => {
  const { call, login } = setup();
  await login();
  await call("PUT", "/api/running", { ...block("09:00"), expected: null });
  const stale = await call("PUT", "/api/running", { ...block("10:30"), expected: null });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.json, { error: "running block changed", running: block("09:00") });
  assert.deepEqual((await call("GET", "/api/running")).json, block("09:00"));
  const fresh = await call("PUT", "/api/running", { ...block("09:00", { course: "Reading" }), expected: key("09:00") });
  assert.equal(fresh.status, 200);
});

test("ending a block another device has replaced leaves the new block running (L11)", async () => {
  const { call, login } = setup();
  await login();
  await call("PUT", "/api/running", { ...block("10:30"), expected: null });
  const stale = await call("DELETE", "/api/running?date=2026-11-21&start=09:00");
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.json, { error: "running block changed", running: block("10:30") });
  assert.deepEqual((await call("GET", "/api/running")).json, block("10:30"));
  assert.equal((await call("DELETE", "/api/running?date=2026-11-21&start=10:30")).status, 204);
  assert.equal((await call("GET", "/api/running")).json, null);
  assert.equal((await call("DELETE", "/api/running?date=2026-11-21&start=10:30")).status, 204);
});

test("a late write for a block already ended or saved never brings it back (L12)", async () => {
  const { call, login } = setup();
  await login();
  await call("PUT", "/api/running", { ...block("09:00"), expected: null });
  await call("DELETE", "/api/running?date=2026-11-21&start=09:00");
  const late = await call("PUT", "/api/running", { ...block("09:00", { course: "Reading" }), expected: key("09:00") });
  assert.equal(late.status, 409);
  assert.equal(late.json.running, null);

  await call("PUT", "/api/running", { ...block("11:00"), expected: null });
  await call("POST", "/api/sessions", { date: "2026-11-21", start: "11:00", end: "12:00", courses: [] });
  assert.equal((await call("PUT", "/api/running", { ...block("11:00"), expected: key("11:00") })).status, 409);
  assert.equal((await call("GET", "/api/running")).json, null);
});

test("a running write without the block it expects is rejected", async () => {
  const { call, login } = setup();
  await login();
  for (const expected of [undefined, "09:00", { date: "2026-11-21" }, { date: "x", start: "09:00" }]) {
    assert.equal((await call("PUT", "/api/running", { ...block("09:00"), expected })).status, 400, JSON.stringify(expected));
  }
  for (const query of ["", "?date=2026-11-21", "?start=09:00", "?date=2026-11-21&start=9"]) {
    assert.equal((await call("DELETE", `/api/running${query}`)).status, 400, query);
  }
  assert.equal((await call("GET", "/api/running")).json, null);
});
