import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { createStore, openDb } from "./db.ts";

const password = process.env.APP_PASSWORD;
if (!password || password.length < 8) {
  console.error("APP_PASSWORD must be set to at least 8 characters");
  process.exit(1);
}

const store = createStore(openDb(process.env.DATA_DIR ?? "./data"));
const auth = createAuth(password, process.env.COOKIE_SECURE !== "false");
const app = createApp(store, auth, process.env.STATIC_DIR);
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? "0.0.0.0" }, () =>
  console.log(`focus dashboard listening on :${port}`),
);
