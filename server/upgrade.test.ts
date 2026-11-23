import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { MIGRATIONS } from "./db.ts";
import { setup, tempDir } from "./testing.ts";

const a2 = { id: "task-a2", title: "CS341 A2", subject: "CS341" };

test("export is version 3 with rows carrying their task, and it imports back unchanged", async () => {
  const source = setup();
  await source.login();
  await source.call("POST", "/api/sessions", {
    date: "2026-11-20",
    start: "14:00",
    end: "16:00",
    courses: [
      { task: a2, course: "Algorithms", minutes: 60 },
      { course: "Reading", minutes: 30 },
    ],
  });
  const exported = (await source.call("GET", "/api/export")).json;
  assert.equal(exported.version, 3);
  assert.deepEqual(exported.sessions[0].courses, [
    { course: "Algorithms", minutes: 60, task: a2 },
    { course: "Reading", minutes: 30, task: null },
  ]);

  const target = setup();
  await target.login();
  assert.equal((await target.call("POST", "/api/import", exported)).json.imported, 1);
  const strip = (s: { id: number }[]) => s.map(({ id, ...rest }) => rest);
  assert.deepEqual(strip((await target.call("GET", "/api/sessions")).json), strip(exported.sessions));
});

test("a version 2 export, whose rows have no task, still imports", async () => {
  const { call, login } = setup();
  await login();
  const v2 = {
    version: 2,
    settings: { dailyGoalMin: 240, targetRatio: 0.75, language: "en" },
    sessions: [
      {
        id: 7,
        date: "2026-10-20",
        start: "09:00",
        end: "10:30",
        courses: [{ course: "数学", minutes: 50 }, { course: "英语", minutes: 20 }],
        energy: 4,
        interruptions: null,
        note: "old",
      },
    ],
  };
  assert.equal((await call("POST", "/api/import", v2)).json.imported, 1);
  const [imported] = (await call("GET", "/api/sessions")).json;
  assert.deepEqual(imported.courses, [
    { course: "数学", minutes: 50, task: null },
    { course: "英语", minutes: 20, task: null },
  ]);
  assert.equal(imported.note, "old");
});

// A database as the previous release left it: schema version 2.
function versionTwoDatabase() {
  const dir = tempDir();
  const db = new DatabaseSync(join(dir, "focus.db"));
  for (const migration of MIGRATIONS.slice(0, 2)) db.exec(migration);
  db.exec(`
    INSERT INTO sessions (id, date, start, end, energy, interruptions, note) VALUES
      (1, '2026-10-20', '09:00', '10:30', 4, 1, 'before tasks'),
      (2, '2026-10-21', '23:30', '00:15', NULL, NULL, '');
    INSERT INTO session_courses VALUES (1, 0, '数学', 50), (1, 1, 'CS341', 20), (2, 0, '未分类', 30);
    INSERT INTO settings VALUES ('dailyGoalMin', '300');
    PRAGMA user_version = 2;
  `);
  db.close();
  return dir;
}

test("study blocks from before tasks read back unchanged, with task null", async () => {
  const dir = versionTwoDatabase();
  const { call, login } = setup({}, dir);
  await login();
  assert.deepEqual((await call("GET", "/api/sessions")).json, [
    {
      id: 1,
      date: "2026-10-20",
      start: "09:00",
      end: "10:30",
      courses: [
        { course: "数学", minutes: 50, task: null },
        { course: "CS341", minutes: 20, task: null },
      ],
      energy: 4,
      interruptions: 1,
      note: "before tasks",
    },
    {
      id: 2,
      date: "2026-10-21",
      start: "23:30",
      end: "00:15",
      courses: [{ course: "未分类", minutes: 30, task: null }],
      energy: null,
      interruptions: null,
      note: "",
    },
  ]);
  assert.equal((await call("GET", "/api/settings")).json.dailyGoalMin, 300);
  assert.equal((await call("GET", "/api/running")).json, null);
  // The upgraded database takes task rows.
  const added = await call("POST", "/api/sessions", {
    date: "2026-11-20", start: "14:00", end: "15:00", courses: [{ task: a2, minutes: 30 }],
  });
  assert.equal(added.status, 201);
  const reopened = setup({}, dir);
  await reopened.login();
  assert.equal((await reopened.call("GET", "/api/sessions")).json.length, 3);
});
