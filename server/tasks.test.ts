import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./testing.ts";

const block = { date: "2026-11-20", start: "14:00", end: "16:00" };
const a2 = { id: "task-a2", title: "CS341 A2", subject: "CS341" };

test("a task row stores the task as picked, and the course defaults to its subject, then its title", async () => {
  const { call, login } = setup();
  await login();
  const created = await call("POST", "/api/sessions", {
    ...block,
    courses: [
      { task: a2, minutes: 40 },
      { task: { id: "task-essay", title: "  Write the essay  ", subject: null }, minutes: 20 },
      { task: { id: "task-q", title: "Quiz prep", subject: "STAT231" }, course: "Stats", minutes: 15 },
      { task: { id: "task-long", title: "x".repeat(60), subject: "" }, minutes: 5 },
      { course: "Reading", minutes: 10 },
      { course: "Notes", task: null, minutes: 5 },
    ],
  });
  assert.equal(created.status, 201);
  const expected = [
    { course: "CS341", minutes: 40, task: a2 },
    { course: "Write the essay", minutes: 20, task: { id: "task-essay", title: "Write the essay", subject: null } },
    { course: "Stats", minutes: 15, task: { id: "task-q", title: "Quiz prep", subject: "STAT231" } },
    { course: "x".repeat(40), minutes: 5, task: { id: "task-long", title: "x".repeat(60), subject: null } },
    { course: "Reading", minutes: 10, task: null },
    { course: "Notes", minutes: 5, task: null },
  ];
  assert.deepEqual(created.json.courses, expected);
  assert.deepEqual((await call("GET", "/api/sessions")).json[0].courses, expected);
  assert.deepEqual((await call("GET", "/api/courses")).json.map((c: { course: string }) => c.course).sort(), [
    "CS341", "Notes", "Reading", "Stats", "Write the essay", "x".repeat(40),
  ]);
});

test("rows for the same task merge; a task never merges with a typed row or another task", async () => {
  const { call, login } = setup();
  await login();
  const a3 = { id: "task-a3", title: "CS341 A3", subject: "CS341" };
  const created = await call("POST", "/api/sessions", {
    ...block,
    courses: [
      { task: a2, minutes: 20 },
      { course: "CS341", minutes: 10 },
      { task: a3, minutes: 15 },
      { task: { ...a2, title: "Renamed later", subject: "Other" }, course: "Elsewhere", minutes: 5 },
      { course: "CS341 ", minutes: 5 },
    ],
  });
  assert.deepEqual(created.json.courses, [
    { course: "CS341", minutes: 25, task: a2 },
    { course: "CS341", minutes: 15, task: null },
    { course: "CS341", minutes: 15, task: a3 },
  ]);
  assert.deepEqual((await call("GET", "/api/courses")).json, [
    { course: "CS341", sessions: 1, minutes: 55, lastDate: "2026-11-20" },
  ]);
});

test("invalid task rows are rejected with a message", async () => {
  const { call, login } = setup();
  await login();
  const post = (row: unknown) => call("POST", "/api/sessions", { ...block, courses: [row] });
  const cases: [unknown, RegExp][] = [
    [{ task: "task-a2", minutes: 5 }, /task must be an object/],
    [{ task: { ...a2, id: "" }, minutes: 5 }, /task id/],
    [{ task: { ...a2, id: 42 }, minutes: 5 }, /task id/],
    [{ task: { ...a2, id: "x".repeat(201) }, minutes: 5 }, /task id/],
    [{ task: { ...a2, title: "  " }, minutes: 5 }, /task title/],
    [{ task: { ...a2, title: "x".repeat(201) }, minutes: 5 }, /task title/],
    [{ task: { ...a2, subject: 3 }, minutes: 5 }, /task subject/],
    [{ task: { ...a2, subject: "x".repeat(101) }, minutes: 5 }, /task subject/],
    [{ task: { id: "t", title: "T" }, minutes: 5 }, /task subject/],
    [{ task: a2, minutes: 0 }, /minutes for CS341/],
    [{ task: a2, course: "  ", minutes: 5 }, /course name is required/],
  ];
  for (const [row, message] of cases) {
    const res = await post(row);
    assert.equal(res.status, 400, JSON.stringify(row));
    assert.match(res.json.error, message);
  }
  const eleven = Array.from({ length: 11 }, (_, i) => ({ task: { ...a2, id: `t${i}` }, minutes: 1 }));
  assert.match((await call("POST", "/api/sessions", { ...block, courses: eleven })).json.error, /at most 10/);
  const tooLong = [{ task: a2, minutes: 100 }, { task: { ...a2, id: "other" }, minutes: 21 }];
  assert.match((await call("POST", "/api/sessions", { ...block, courses: tooLong })).json.error, /cannot exceed/);
  assert.equal((await call("GET", "/api/sessions")).json.length, 0);
});

test("renaming a course renames task rows too, but merges only typed rows and keeps tasks as picked", async () => {
  const { call, login } = setup();
  await login();
  const a3 = { id: "task-a3", title: "CS341 A3", subject: "CS341" };
  const essay = { id: "task-essay", title: "Essay", subject: "English" };
  await call("POST", "/api/sessions", {
    ...block,
    courses: [
      { task: a2, minutes: 20 },
      { course: "Algorithms", minutes: 10 },
      { course: "CS341", minutes: 15 },
      { task: a3, course: "Algorithms", minutes: 5 },
    ],
  });
  await call("POST", "/api/sessions", {
    ...block,
    date: "2026-11-21",
    courses: [
      { course: "CS341", minutes: 30 },
      { task: essay, minutes: 10 },
    ],
  });

  const renamed = await call("POST", "/api/courses/rename", { from: "CS341", to: "Algorithms" });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.updated, 3);
  const listed = (await call("GET", "/api/sessions")).json.map((s: { courses: unknown }) => s.courses);
  assert.deepEqual(listed, [
    [
      { course: "Algorithms", minutes: 20, task: a2 },
      { course: "Algorithms", minutes: 25, task: null },
      { course: "Algorithms", minutes: 5, task: a3 },
    ],
    [
      { course: "Algorithms", minutes: 30, task: null },
      { course: "English", minutes: 10, task: essay },
    ],
  ]);

  // Renaming onto a course only task rows use never merges two tasks into one.
  await call("POST", "/api/courses/rename", { from: "English", to: "Algorithms" });
  const second = (await call("GET", "/api/sessions")).json[1].courses;
  assert.deepEqual(second, [
    { course: "Algorithms", minutes: 30, task: null },
    { course: "Algorithms", minutes: 10, task: essay },
  ]);
});
