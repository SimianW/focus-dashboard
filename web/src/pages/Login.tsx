import { useState } from "react";
import { api } from "../api";
import { BrandMark } from "../App";
import { useT } from "../i18n";

export function Login({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <BrandMark className="login-mark" />
        <h1 className="login-brand">{t.app.brand}</h1>
        <p className="login-lede">{t.login.lede}</p>
        <label className="field">
          <span className="field-label">{t.login.password}</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
          />
        </label>
        {error && (
          <p className="form-error" id="login-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block" disabled={busy || !password}>
          {busy ? t.login.signingIn : t.login.signIn}
        </button>
      </form>
    </main>
  );
}
