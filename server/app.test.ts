import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { createStore, openDb } from "./db.ts";
import { spanMinutes } from "./validate.ts";

function setup() {
  const store = createStore(openDb(mkdtempSync(join(tmpdir(), "focus-test-"))));
  const app = createApp(store, createAuth("correct horse", false));
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, json: res.status === 204 ? null : await res.json() };
  };
  return { call, login: () => call("POST", "/api/login", { password: "correct horse" }) };
}

const session = {
  date: "2026-10-20",
  start: "09:00",
  end: "10:30",
  courses: [
    { course: "数学", minutes: 50 },
    { course: "英语", minutes: 20 },
  ],
};

test("span handles sessions that cross midnight", () => {
  assert.equal(spanMinutes("09:00", "10:30"), 90);
  assert.equal(spanMinutes("23:30", "00:15"), 45);
  assert.equal(spanMinutes("08:00", "08:00"), 24 * 60);
});

test("data endpoints require login", async () => {
  const { call, login } = setup();
  assert.equal((await call("GET", "/api/sessions")).status, 401);
  assert.equal((await call("POST", "/api/login", { password: "wrong" })).status, 401);
  assert.equal((await login()).status, 200);
  assert.equal((await call("GET", "/api/sessions")).status, 200);
  await call("POST", "/api/logout");
  assert.equal((await call("GET", "/api/sessions")).status, 401);
});

test("forged or tampered cookies are rejected", async () => {
  const { call } = setup();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const res = await call("GET", "/api/me", undefined, { cookie: `focus_session=${exp}.forged` });
  assert.equal(res.status, 401);
});

test("login is rate limited after repeated failures", async () => {
  const { call } = setup();
  for (let i = 0; i < 10; i++) await call("POST", "/api/login", { password: "nope" });
  assert.equal((await call("POST", "/api/login", { password: "correct horse" })).status, 429);
});

test("sessions can be created, listed by range, updated and deleted", async () => {
  const { call, login } = setup();
  await login();
  const created = await call("POST", "/api/sessions", session);
  assert.equal(created.status, 201);
  assert.equal(created.json.energy, null);
  await call("POST", "/api/sessions", { ...session, date: "2026-10-22" });

  const ranged = await call("GET", "/api/sessions?from=2026-10-21&to=2026-10-31");
  assert.deepEqual(ranged.json.map((s: { date: string }) => s.date), ["2026-10-22"]);

  assert.deepEqual(created.json.courses, session.courses);

  const courses = [{ course: "物理", minutes: 80 }];
  const updated = await call("PUT", `/api/sessions/${created.json.id}`, { ...session, courses, energy: 4 });
  assert.deepEqual(updated.json.courses, courses);
  assert.equal(updated.json.energy, 4);

  assert.equal((await call("DELETE", `/api/sessions/${created.json.id}`)).status, 204);
  assert.equal((await call("DELETE", `/api/sessions/${created.json.id}`)).status, 404);
});

test("invalid sessions are rejected with a message", async () => {
  const { call, login } = setup();
  await login();
  const tooMuchFocus = await call("POST", "/api/sessions", { ...session, courses: [{ course: "数学", minutes: 91 }] });
  assert.equal(tooMuchFocus.status, 400);
  assert.match(tooMuchFocus.json.error, /cannot exceed/);
  assert.equal((await call("POST", "/api/sessions", { ...session, courses: [{ course: " ", minutes: 5 }] })).status, 400);
  assert.equal((await call("POST", "/api/sessions", { ...session, courses: [{ course: "数学", minutes: 0 }] })).status, 400);
  assert.equal((await call("POST", "/api/sessions", { ...session, date: "2026-02-30" })).status, 400);
  assert.equal((await call("POST", "/api/sessions", { ...session, start: "9:00" })).status, 400);
  assert.equal((await call("POST", "/api/sessions", { ...session, energy: 6 })).status, 400);
});

test("import validates every row before writing", async () => {
  const { call, login } = setup();
  await login();
  const bad = await call("POST", "/api/import", { sessions: [session, { ...session, courses: null }] });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /row 2/);
  assert.equal((await call("GET", "/api/sessions")).json.length, 0);
  assert.equal((await call("POST", "/api/import", { sessions: [session, session] })).json.imported, 2);
});

test("import upgrades version 1 sessions", async () => {
  const { call, login } = setup();
  await login();
  const { courses, ...base } = session;
  const legacy = [
    { ...base, focusMin: 70, category: "数学" },
    { ...base, focusMin: 30, category: "" },
    { ...base, focusMin: 0, category: "数学" },
  ];
  assert.equal((await call("POST", "/api/import", { sessions: legacy })).json.imported, 3);
  const listed = (await call("GET", "/api/sessions")).json.map((s: { courses: unknown }) => s.courses);
  assert.deepEqual(listed, [[{ course: "数学", minutes: 70 }], [{ course: "未分类", minutes: 30 }], []]);
});

test("duplicate courses in a session merge, and renaming merges too", async () => {
  const { call, login } = setup();
  await login();
  const dup = await call("POST", "/api/sessions", {
    ...session,
    courses: [
      { course: "数学", minutes: 30 },
      { course: "数学 ", minutes: 10 },
    ],
  });
  assert.deepEqual(dup.json.courses, [{ course: "数学", minutes: 40 }]);
  await call("POST", "/api/sessions", session);

  assert.equal((await call("POST", "/api/courses/rename", { from: "英语", to: "数学" })).json.updated, 1);
  const listed = (await call("GET", "/api/sessions")).json.map((s: { courses: unknown }) => s.courses);
  assert.deepEqual(listed, [[{ course: "数学", minutes: 40 }], [{ course: "数学", minutes: 70 }]]);
  const courses = (await call("GET", "/api/courses")).json;
  assert.deepEqual(courses, [{ course: "数学", sessions: 2, minutes: 110, lastDate: "2026-10-20" }]);
});

test("renaming a course to its own name changes nothing", async () => {
  const { call, login } = setup();
  await login();
  await call("POST", "/api/sessions", session);
  await call("POST", "/api/sessions", { ...session, date: "2026-10-22", courses: [{ course: "数学", minutes: 30 }] });
  const sessionsBefore = (await call("GET", "/api/sessions")).json;
  const coursesBefore = (await call("GET", "/api/courses")).json;

  for (const [from, to] of [["数学", "数学"], ["数学", " 数学 "], [" 英语", "英语\t"]]) {
    const res = await call("POST", "/api/courses/rename", { from, to });
    assert.equal(res.status, 200);
    assert.equal(res.json.updated, 0);
  }
  assert.deepEqual((await call("GET", "/api/sessions")).json, sessionsBefore);
  assert.deepEqual((await call("GET", "/api/courses")).json, coursesBefore);
});

test("settings have defaults and can be saved", async () => {
  const { call, login } = setup();
  await login();
  assert.deepEqual((await call("GET", "/api/settings")).json, { dailyGoalMin: 240, targetRatio: 0.75, language: "en" });
  const saved = await call("PUT", "/api/settings", { dailyGoalMin: 300, targetRatio: 0.8 });
  assert.deepEqual(saved.json, { dailyGoalMin: 300, targetRatio: 0.8, language: "en" });
  const lang = await call("PUT", "/api/settings", { language: "zh" });
  assert.deepEqual(lang.json, { dailyGoalMin: 300, targetRatio: 0.8, language: "zh" });
  assert.equal((await call("PUT", "/api/settings", { dailyGoalMin: 300, targetRatio: 2 })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { language: "fr" })).status, 400);
});
