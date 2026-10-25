import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "focus_session";
const MAX_AGE_S = 60 * 60 * 24 * 90;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

// Single-user auth: one password from the environment. The cookie signing key
// is derived from it, so changing the password signs every device out.
export function createAuth(password: string, secure: boolean) {
  const key = createHmac("sha256", password).update("focus-session-v1").digest();
  const sign = (exp: string) => createHmac("sha256", key).update(exp).digest("base64url");
  const failures = new Map<string, number[]>();

  return {
    cookieName: COOKIE,

    // Returns false while the client is rate limited, whatever the password.
    checkPassword(attempt: string, client: string) {
      const now = Date.now();
      const recent = (failures.get(client) ?? []).filter((t) => now - t < WINDOW_MS);
      if (recent.length >= MAX_FAILURES) return { ok: false, limited: true };
      const ok = timingSafeEqual(sha256(attempt), sha256(password));
      if (ok) failures.delete(client);
      else failures.set(client, [...recent, now]);
      return { ok, limited: false };
    },

    issueCookie() {
      const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_S);
      return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure ? "; Secure" : ""}`;
    },

    clearCookie() {
      return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
    },

    verify(value: string | undefined) {
      if (!value) return false;
      const [exp, mac] = value.split(".");
      if (!exp || !mac || Number(exp) * 1000 < Date.now()) return false;
      const expected = Buffer.from(sign(exp));
      const given = Buffer.from(mac);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
  };
}
