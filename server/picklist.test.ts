import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./testing.ts";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

test("pick list is unavailable when life-os is not configured", async () => {
  for (const lifeos of [undefined, { url: "http://127.0.0.1:9" }, { token: "t".repeat(32) }]) {
    const { call, login } = setup({ lifeos });
    await login();
    const res = await call("GET", "/api/pick-list");
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { available: false });
  }
});

const TOKEN = "lifeos-token-for-tests-0123456789";

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Task ${id}`,
  subject: "CS341",
  deadline: "2026-11-25T23:59:00-05:00",
  hasBlockToday: false,
  ...extra,
});

// A stand-in for life-os on a random local port. `answer` decides the reply.
async function fakeLifeos(answer: (req: IncomingMessage, res: ServerResponse) => void) {
  const seen: { path?: string; authorization?: string }[] = [];
  const server = createServer((req, res) => {
    seen.push({ path: req.url, authorization: req.headers.authorization });
    answer(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

const sendJson = (body: unknown, status = 200) => (req: IncomingMessage, res: ServerResponse) => {
  const authorized = req.headers.authorization === `Bearer ${TOKEN}`;
  res.writeHead(authorized ? status : 401, { "content-type": "application/json" });
  res.end(JSON.stringify(authorized ? body : { error: "unauthorized" }));
};

test("pick list comes from life-os in its order, with malformed entries dropped", async () => {
  const tasks = [
    task("b", { subject: null, hasBlockToday: true }),
    { ...task("bad-1"), title: "" },
    task("a"),
    { ...task("bad-2"), deadline: "next week" },
    { ...task("bad-3"), id: 7 },
    "not an object",
    { ...task("bad-4"), hasBlockToday: "yes" },
    task("c", { subject: "  " }),
  ];
  const lifeos = await fakeLifeos(sendJson(tasks));
  try {
    // A trailing slash on the configured URL must not double up.
    const { call, login } = setup({ lifeos: { url: `${lifeos.url}/`, token: TOKEN } });
    await login();
    const res = await call("GET", "/api/pick-list");
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      available: true,
      tasks: [
        { id: "b", title: "Task b", subject: null, deadline: "2026-11-25T23:59:00-05:00", hasBlockToday: true },
        { id: "a", title: "Task a", subject: "CS341", deadline: "2026-11-25T23:59:00-05:00", hasBlockToday: false },
        { id: "c", title: "Task c", subject: null, deadline: "2026-11-25T23:59:00-05:00", hasBlockToday: false },
      ],
    });
    assert.deepEqual(lifeos.seen, [{ path: "/api/pick-list", authorization: `Bearer ${TOKEN}` }]);
  } finally {
    await lifeos.close();
  }
});

// Calls the pick list against a life-os config and returns the JSON and what was logged.
async function pickListWith(lifeos: { url: string; token: string; timeoutMs?: number }) {
  const { call, login } = setup({ lifeos });
  await login();
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
  try {
    const res = await call("GET", "/api/pick-list");
    assert.equal(res.status, 200);
    return { json: res.json, warnings };
  } finally {
    console.warn = warn;
  }
}

test("pick list is unavailable when life-os refuses the token", async () => {
  const lifeos = await fakeLifeos(sendJson([task("a")]));
  try {
    const { json, warnings } = await pickListWith({ url: lifeos.url, token: "wrong-token-0123456789-0123456789" });
    assert.deepEqual(json, { available: false });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /401/);
    assert.doesNotMatch(warnings[0], /wrong-token/);
  } finally {
    await lifeos.close();
  }
});

test("pick list is unavailable when life-os answers something other than a list", async () => {
  for (const answer of [
    sendJson({ tasks: [task("a")] }),
    sendJson([task("a")], 500),
    (_req: IncomingMessage, res: ServerResponse) => res.end("<html>not json</html>"),
  ]) {
    const lifeos = await fakeLifeos(answer);
    try {
      const { json, warnings } = await pickListWith({ url: lifeos.url, token: TOKEN });
      assert.deepEqual(json, { available: false });
      assert.equal(warnings.length, 1);
      assert.doesNotMatch(warnings[0], new RegExp(TOKEN));
    } finally {
      await lifeos.close();
    }
  }
});

test("pick list is unavailable when life-os is unreachable", async () => {
  const lifeos = await fakeLifeos(sendJson([]));
  await lifeos.close(); // the port is now closed
  const { json, warnings } = await pickListWith({ url: lifeos.url, token: TOKEN });
  assert.deepEqual(json, { available: false });
  assert.equal(warnings.length, 1);
});

test("pick list is unavailable when life-os does not answer in time", async () => {
  const lifeos = await fakeLifeos(() => {}); // never answers
  try {
    const started = Date.now();
    const { json, warnings } = await pickListWith({ url: lifeos.url, token: TOKEN, timeoutMs: 100 });
    assert.deepEqual(json, { available: false });
    assert.ok(Date.now() - started < 2000, "gave up after the timeout");
    assert.equal(warnings.length, 1);
  } finally {
    await lifeos.close();
  }
});
