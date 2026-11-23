import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./testing.ts";

const READ_TOKEN = "read-only-token-for-life-os-0123456789";
const a2 = { id: "task-a2", title: "CS341 A2", subject: "CS341" };
const blocks = [
  { date: "2026-11-20", start: "14:00", end: "16:00", courses: [{ task: a2, minutes: 90 }] },
  { date: "2026-11-21", start: "09:00", end: "10:00", courses: [{ course: "Reading", minutes: 45 }], energy: 3 },
];

async function withData(options = { readToken: READ_TOKEN }) {
  const app = setup(options);
  await app.login();
  for (const b of blocks) await app.call("POST", "/api/sessions", b);
  await app.call("PUT", "/api/running", { date: "2026-11-21", start: "14:05", entry: { task: a2 }, expected: null });
  return app;
}

test("the snapshot holds every study block and the running block", async () => {
  const { call } = await withData();
  const sessions = (await call("GET", "/api/sessions")).json;
  const snapshot = await call("GET", "/api/snapshot");
  assert.equal(snapshot.status, 200);
  assert.deepEqual(snapshot.json, {
    sessions,
    running: { date: "2026-11-21", start: "14:05", entry: { course: "CS341", task: a2 } },
  });
  assert.deepEqual(snapshot.json.sessions[0].courses, [{ course: "CS341", minutes: 90, task: a2 }]);
  assert.equal(snapshot.json.sessions.length, 2);

  await call("DELETE", "/api/running?date=2026-11-21&start=14:05");
  assert.equal((await call("GET", "/api/snapshot")).json.running, null);
});

test("the read-only token reads the snapshot and nothing else", async () => {
  const { call, bearer } = await withData();
  const before = (await call("GET", "/api/snapshot")).json;
  const settingsBefore = (await call("GET", "/api/settings")).json;

  const read = await bearer(READ_TOKEN, "GET", "/api/snapshot");
  assert.equal(read.status, 200);
  assert.deepEqual(read.json, before);

  const id = before.sessions[0].id;
  const refused: [string, string, unknown?][] = [
    ["POST", "/api/sessions", blocks[1]],
    ["PUT", `/api/sessions/${id}`, blocks[1]],
    ["DELETE", `/api/sessions/${id}`],
    ["PUT", "/api/running", { date: "2026-11-21", start: "15:00", entry: null, expected: { date: "2026-11-21", start: "14:05" } }],
    ["DELETE", "/api/running?date=2026-11-21&start=14:05"],
    ["POST", "/api/courses/rename", { from: "CS341", to: "Algorithms" }],
    ["PUT", "/api/settings", { dailyGoalMin: 10 }],
    ["POST", "/api/import", { sessions: [blocks[1]] }],
    ["POST", "/api/snapshot"],
    ["GET", "/api/sessions"],
    ["GET", "/api/running"],
    ["GET", "/api/export"],
    ["GET", "/api/courses"],
    ["GET", "/api/settings"],
    ["GET", "/api/pick-list"],
    ["GET", "/api/me"],
    ["GET", "/api/nowhere"],
  ];
  for (const [method, path, body] of refused) {
    const res = await bearer(READ_TOKEN, method, path, body);
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.deepEqual(res.json, { error: "read-only token" });
  }
  assert.deepEqual((await call("GET", "/api/snapshot")).json, before);
  assert.deepEqual((await call("GET", "/api/settings")).json, settingsBefore);
});

test("a missing or wrong token is unauthorized, and the cookie still works", async () => {
  const { call, bearer } = await withData();
  assert.equal((await call("GET", "/api/snapshot", undefined, { cookie: "" })).status, 401);
  for (const token of ["wrong", READ_TOKEN.slice(0, -1), `${READ_TOKEN}x`, ""]) {
    const res = await bearer(token, "GET", "/api/snapshot");
    assert.equal(res.status, 401, token);
    assert.deepEqual(res.json, { error: "unauthorized" });
  }
  assert.equal((await call("GET", "/api/snapshot", undefined, { cookie: "", authorization: READ_TOKEN })).status, 401);
  assert.equal((await bearer("wrong", "POST", "/api/sessions", blocks[0])).status, 401);
  // The cookie keeps full access even when a bearer header comes along.
  assert.equal((await call("GET", "/api/sessions", undefined, { authorization: "Bearer wrong" })).status, 200);
  assert.equal((await call("POST", "/api/sessions", blocks[0], { authorization: `Bearer ${READ_TOKEN}` })).status, 201);
});

test("without a read token configured, no bearer is accepted", async () => {
  for (const readToken of [undefined, ""]) {
    const { bearer } = await withData({ readToken } as { readToken: string });
    for (const token of ["", "undefined", READ_TOKEN]) {
      assert.equal((await bearer(token, "GET", "/api/snapshot")).status, 401, `${readToken} / ${token}`);
    }
  }
});
