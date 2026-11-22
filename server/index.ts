import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { createStore, openDb } from "./db.ts";

const password = process.env.APP_PASSWORD;
if (!password || password.length < 8) {
  console.error("APP_PASSWORD must be set to at least 8 characters");
  process.exit(1);
}

// Optional; an empty value counts as unset.
const readToken = process.env.READ_TOKEN || undefined;
if (readToken !== undefined && readToken.length < 32) {
  console.error("READ_TOKEN must be at least 32 characters when set");
  process.exit(1);
}

const store = createStore(openDb(process.env.DATA_DIR ?? "./data"));
const auth = createAuth(password, process.env.COOKIE_SECURE !== "false");
const app = createApp(store, auth, {
  staticDir: process.env.STATIC_DIR,
  readToken,
  lifeos: { url: process.env.LIFEOS_URL || undefined, token: process.env.LIFEOS_TOKEN || undefined },
});
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? "0.0.0.0" }, () =>
  console.log(`focus dashboard listening on :${port}`),
);
