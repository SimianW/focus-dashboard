import { useState } from "react";
import { api } from "../api";
import { BrandMark } from "../App";

export function Login({ onDone }: { onDone: () => void }) {
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
        <h1 className="login-brand">专注记录</h1>
        <p className="login-lede">记下每段学习的起止时间和学了哪几门课，看看自己在每门课上有多专注。</p>
        <label className="field">
          <span className="field-label">密码</span>
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
          {busy ? "正在登录…" : "登录"}
        </button>
      </form>
    </main>
  );
}
