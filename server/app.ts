import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Store } from "./db.ts";
import type { createAuth } from "./auth.ts";
import { BadRequest, parseCourseName, parseSession, parseSettings, upgradeLegacySession } from "./validate.ts";

type Auth = ReturnType<typeof createAuth>;

// Rejects non-JSON bodies, which also keeps cross-site HTML forms out: they
// cannot send application/json without a CORS preflight.
async function jsonBody(c: Context) {
  if (!c.req.header("content-type")?.startsWith("application/json")) throw new BadRequest("expected application/json");
  try {
    return await c.req.json();
  } catch {
    throw new BadRequest("invalid JSON");
  }
}

// Requests arrive via Caddy on the VPS, frp, then OpenResty, so X-Real-IP is
// always the tunnel. Caddy replaces any client-sent X-Forwarded-For, so its
// first entry is the real client.
const clientId = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0].trim() || c.req.header("x-real-ip") || "local";

export function createApp(store: Store, auth: Auth, staticDir?: string) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.post("/api/login", async (c) => {
    const { password } = (await jsonBody(c)) as { password?: unknown };
    const result = auth.checkPassword(typeof password === "string" ? password : "", clientId(c));
    if (result.limited) return c.json({ error: "too many attempts, try again in 15 minutes" }, 429);
    if (!result.ok) return c.json({ error: "wrong password" }, 401);
    c.header("Set-Cookie", auth.issueCookie());
    return c.json({ ok: true });
  });

  app.post("/api/logout", (c) => {
    c.header("Set-Cookie", auth.clearCookie());
    return c.json({ ok: true });
  });

  // Everything below requires a signed session cookie.
  app.use("/api/*", async (c, next) => {
    if (!auth.verify(getCookie(c, auth.cookieName))) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  app.get("/api/me", (c) => c.json({ ok: true }));

  app.get("/api/sessions", (c) => c.json(store.listSessions(c.req.query("from"), c.req.query("to"))));

  app.post("/api/sessions", async (c) => c.json(store.createSession(parseSession(await jsonBody(c))), 201));

  app.put("/api/sessions/:id", async (c) => {
    const updated = store.updateSession(Number(c.req.param("id")), parseSession(await jsonBody(c)));
    return updated ? c.json(updated) : c.json({ error: "not found" }, 404);
  });

  app.delete("/api/sessions/:id", (c) =>
    store.deleteSession(Number(c.req.param("id"))) ? c.body(null, 204) : c.json({ error: "not found" }, 404),
  );

  app.get("/api/courses", (c) => c.json(store.listCourses()));

  app.post("/api/courses/rename", async (c) => {
    const { from, to } = (await jsonBody(c)) as { from?: unknown; to?: unknown };
    return c.json({ updated: store.renameCourse(parseCourseName(from), parseCourseName(to)) });
  });

  app.get("/api/settings", (c) => c.json(store.getSettings()));

  app.put("/api/settings", async (c) => c.json(store.saveSettings(parseSettings(await jsonBody(c)))));

  app.get("/api/export", (c) => {
    c.header("Content-Disposition", `attachment; filename="focus-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json({ version: 2, settings: store.getSettings(), sessions: store.listSessions() });
  });

  // Appends sessions from an export file, either version. Validates every row
  // before writing any.
  app.post("/api/import", async (c) => {
    const { sessions } = (await jsonBody(c)) as { sessions?: unknown };
    if (!Array.isArray(sessions)) throw new BadRequest("expected { sessions: [...] }");
    const parsed = sessions.map((s, i) => {
      try {
        return parseSession(upgradeLegacySession(s));
      } catch (err) {
        throw new BadRequest(`row ${i + 1}: ${(err as Error).message}`);
      }
    });
    return c.json({ imported: store.importSessions(parsed) });
  });

  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  if (staticDir) {
    // Hashed asset names never change content; everything else revalidates so
    // a new deployment reaches the browser on the next load.
    app.use("/*", async (c, next) => {
      await next();
      if (c.res.ok) c.header("Cache-Control", c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
    });
    app.use("/*", serveStatic({ root: staticDir }));
    // Client-side routes fall back to the app shell. A missing path that looks
    // like a file is a 404, not the shell.
    const shell = serveStatic({ root: staticDir, path: "index.html" });
    app.get("*", async (c, next) => {
      if (c.req.path.startsWith("/assets/") || /\.[^/]*$/.test(c.req.path)) return c.text("not found", 404);
      return (await shell(c, next)) ?? c.text("not found", 404);
    });
  }

  return app;
}
