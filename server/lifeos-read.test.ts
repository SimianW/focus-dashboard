// What life-os reads from Focus: GET /api/lifeos/sessions (focus-dashboard issue 2, the
// settled contract), its mapping from Focus's store, and the read-only token that opens it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lifeosSessions } from "./lifeos.ts";
import { setup } from "./testing.ts";

const thesis = { id: "3", title: "论文", subject: null };
const hw1 = { id: "1", title: "作业 1", subject: "CS 341 / CO 342" };

test("each study block maps to the contract's session, rows by task, typed name or neither", () => {
  const sessions = [
    {
      id: 2,
      date: "2026-10-21",
      start: "23:30",
      end: "00:15",
      courses: [{ course: "未分类", minutes: 30, task: null }], // from before tasks
      energy: null,
      interruptions: null,
      note: "",
    },
    {
      id: 12,
      date: "2026-11-21",
      start: "13:00",
      end: "14:30",
      courses: [
        { course: "论文", minutes: 60, task: thesis },
        { course: "Other", minutes: 30, task: null },
      ],
      energy: 4,
      interruptions: 1,
      note: "kept out",
    },
    {
      id: 13,
      date: "2026-11-21",
      start: "15:00",
      end: "16:00",
      courses: [{ course: "CS 341 / CO 342", minutes: 45, task: hw1 }],
      energy: null,
      interruptions: null,
      note: "",
    },
  ];
  assert.deepEqual(lifeosSessions(sessions, null), {
    sessions: [
      { id: 2, date: "2026-10-21", start: "23:30", end: "00:15", rows: [{ taskId: null, title: "未分类", subject: null, minutes: 30 }] },
      {
        id: 12,
        date: "2026-11-21",
        start: "13:00",
        end: "14:30",
        rows: [
          { taskId: "3", title: "论文", subject: null, minutes: 60 },
          { taskId: null, title: "Other", subject: null, minutes: 30 },
        ],
      },
      {
        id: 13,
        date: "2026-11-21",
        start: "15:00",
        end: "16:00",
        rows: [{ taskId: "1", title: "作业 1", subject: "CS 341 / CO 342", minutes: 45 }],
      },
    ],
    inProgress: null,
  });
});

test("the block in progress has a stable string id, no end, no rows, and what was picked for it", () => {
  const inProgress = (entry: { course: string; task: typeof hw1 | null } | null) =>
    lifeosSessions([], { date: "2026-11-21", start: "15:00", entry }).inProgress;
  assert.deepEqual(inProgress({ course: "CS 341 / CO 342", task: hw1 }), {
    id: "running:2026-11-21T15:00",
    date: "2026-11-21",
    start: "15:00",
    studying: { taskId: "1", title: "作业 1", subject: "CS 341 / CO 342" },
    rows: [],
  });
  assert.deepEqual(inProgress({ course: "Reading", task: null }), {
    id: "running:2026-11-21T15:00",
    date: "2026-11-21",
    start: "15:00",
    studying: { taskId: null, title: "Reading", subject: null },
    rows: [],
  });
  assert.deepEqual(inProgress(null), {
    id: "running:2026-11-21T15:00",
    date: "2026-11-21",
    start: "15:00",
    studying: null,
    rows: [],
  });
});

// ---- The endpoint ----

const READ_TOKEN = "read-only-token-for-life-os-0123456789";
const PATH = "/api/lifeos/sessions";
const REPLACED = "/api/snapshot"; // what life-os was first meant to read; removed
// Posted out of order; the answer orders them by date, start, id.
const blocks = [
  { date: "2026-11-21", start: "13:00", end: "14:30", courses: [{ task: thesis, minutes: 60 }, { course: "Other", minutes: 30 }], energy: 4, note: "n" },
  { date: "2026-11-20", start: "23:30", end: "00:15", courses: [{ course: "Reading", minutes: 40 }] },
  { date: "2026-11-21", start: "09:00", end: "10:00", courses: [{ task: hw1, minutes: 45 }], interruptions: 2 },
];

async function withData(options: { readToken?: string } = { readToken: READ_TOKEN }) {
  const app = setup(options);
  await app.login();
  for (const b of blocks) await app.call("POST", "/api/sessions", b);
  await app.call("PUT", "/api/running", { date: "2026-11-21", start: "15:00", entry: { task: thesis }, expected: null });
  return app;
}

test("GET /api/lifeos/sessions answers every block in order and the one in progress, to the cookie and the token", async () => {
  const { call, bearer } = await withData();
  const expected = {
    sessions: [
      { id: 2, date: "2026-11-20", start: "23:30", end: "00:15", rows: [{ taskId: null, title: "Reading", subject: null, minutes: 40 }] },
      { id: 3, date: "2026-11-21", start: "09:00", end: "10:00", rows: [{ taskId: "1", title: "作业 1", subject: "CS 341 / CO 342", minutes: 45 }] },
      {
        id: 1,
        date: "2026-11-21",
        start: "13:00",
        end: "14:30",
        rows: [
          { taskId: "3", title: "论文", subject: null, minutes: 60 },
          { taskId: null, title: "Other", subject: null, minutes: 30 },
        ],
      },
    ],
    inProgress: {
      id: "running:2026-11-21T15:00",
      date: "2026-11-21",
      start: "15:00",
      studying: { taskId: "3", title: "论文", subject: null },
      rows: [],
    },
  };
  const byCookie = await call("GET", PATH);
  assert.equal(byCookie.status, 200);
  assert.deepEqual(byCookie.json, expected);
  const byToken = await bearer(READ_TOKEN, "GET", PATH);
  assert.equal(byToken.status, 200);
  assert.deepEqual(byToken.json, expected);

  await call("DELETE", "/api/running?date=2026-11-21&start=15:00");
  assert.equal((await bearer(READ_TOKEN, "GET", PATH)).json.inProgress, null);
});

test("the read-only token opens that endpoint and nothing else, and changes nothing", async () => {
  const { call, bearer } = await withData();
  const before = {
    lifeos: (await call("GET", PATH)).json,
    sessions: (await call("GET", "/api/sessions")).json,
    running: (await call("GET", "/api/running")).json,
    settings: (await call("GET", "/api/settings")).json,
  };
  const id = before.sessions[0].id;
  const refused: [string, string, unknown?][] = [
    ["POST", "/api/sessions", blocks[1]],
    ["PUT", `/api/sessions/${id}`, blocks[1]],
    ["DELETE", `/api/sessions/${id}`],
    ["PUT", "/api/running", { date: "2026-11-21", start: "16:00", entry: null, expected: { date: "2026-11-21", start: "15:00" } }],
    ["DELETE", "/api/running?date=2026-11-21&start=15:00"],
    ["POST", "/api/courses/rename", { from: "Reading", to: "Books" }],
    ["PUT", "/api/settings", { dailyGoalMin: 10 }],
    ["POST", "/api/import", { sessions: [blocks[1]] }],
    ["POST", PATH],
    ["PUT", PATH, {}],
    ["DELETE", PATH],
    ["GET", REPLACED],
    ["GET", "/api/lifeos/sessions/1"],
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
    assert.deepEqual(res.json, { error: "read-only token" }, `${method} ${path}`);
  }
  assert.deepEqual(
    {
      lifeos: (await call("GET", PATH)).json,
      sessions: (await call("GET", "/api/sessions")).json,
      running: (await call("GET", "/api/running")).json,
      settings: (await call("GET", "/api/settings")).json,
    },
    before,
  );
});

test("the replaced endpoint is gone, even for the cookie", async () => {
  const { call } = await withData();
  const res = await call("GET", REPLACED);
  assert.equal(res.status, 404);
});

test("a missing or wrong token is unauthorized, and the cookie still works", async () => {
  const { call, bearer } = await withData();
  assert.equal((await call("GET", PATH, undefined, { cookie: "" })).status, 401);
  for (const token of ["wrong", READ_TOKEN.slice(0, -1), `${READ_TOKEN}x`, ""]) {
    const res = await bearer(token, "GET", PATH);
    assert.equal(res.status, 401, token);
    assert.deepEqual(res.json, { error: "unauthorized" });
  }
  assert.equal((await call("GET", PATH, undefined, { cookie: "", authorization: READ_TOKEN })).status, 401);
  assert.equal((await bearer("wrong", "POST", "/api/sessions", blocks[0])).status, 401);
  // The cookie keeps full access even when a bearer header comes along.
  assert.equal((await call("GET", "/api/sessions", undefined, { authorization: "Bearer wrong" })).status, 200);
  assert.equal((await call("POST", "/api/sessions", blocks[0], { authorization: `Bearer ${READ_TOKEN}` })).status, 201);
});

test("without a read token configured, no bearer is accepted", async () => {
  for (const readToken of [undefined, ""]) {
    const { bearer } = await withData({ readToken });
    for (const token of ["", "undefined", READ_TOKEN]) {
      assert.equal((await bearer(token, "GET", PATH)).status, 401, `${readToken} / ${token}`);
    }
  }
});
