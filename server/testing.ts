// Shared setup for the server tests: an app on a throwaway data directory.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type AppOptions } from "./app.ts";
import { createAuth } from "./auth.ts";
import { createStore, openDb } from "./db.ts";

export const PASSWORD = "correct horse";

export const tempDir = () => mkdtempSync(join(tmpdir(), "focus-test-"));

export function setup(options: AppOptions = {}, dataDir = tempDir()) {
  const store = createStore(openDb(dataDir));
  const app = createApp(store, createAuth(PASSWORD, false), options);
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
  // A request carrying only a bearer token, never the login cookie.
  const bearer = (token: string, method: string, path: string, body?: unknown) =>
    call(method, path, body, { cookie: "", authorization: `Bearer ${token}` });
  return { call, bearer, dataDir, login: () => call("POST", "/api/login", { password: PASSWORD }) };
}
