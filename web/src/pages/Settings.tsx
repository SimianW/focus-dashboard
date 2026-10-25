import { useEffect, useState } from "react";
import { api } from "../api";
import { useData } from "../store";
import { courseVar } from "../store";
import { formatMinutes, sessionFocus, type Session } from "../stats";

type ImportRow = Record<string, unknown>;

/** date|start|end|focus for an existing session or an export row of either version. */
function rowKey(r: ImportRow | Session): string {
  const x = r as ImportRow;
  const focus = Array.isArray(x.courses) ? sessionFocus(x as unknown as Session) : Number(x.focusMin ?? 0);
  return `${x.date}|${x.start}|${x.end}|${focus}`;
}

export function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const { settings, sessions, courses, courseSlot, setSettings, reload, toast } = useData();
  const [goal, setGoal] = useState(String(settings.dailyGoalMin));
  const [target, setTarget] = useState(String(Math.round(settings.targetRatio * 100)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setGoal(String(settings.dailyGoalMin));
    setTarget(String(Math.round(settings.targetRatio * 100)));
  }, [settings]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const g = Number(goal);
    const r = Number(target);
    if (!Number.isInteger(g) || g < 0 || g > 1440) return setError("每日目标应为 0–1440 的整数分钟");
    if (!Number.isFinite(r) || r < 0 || r > 100) return setError("目标专注率应在 0–100 之间");
    setBusy(true);
    setError(null);
    try {
      setSettings(await api.saveSettings({ dailyGoalMin: g, targetRatio: r / 100 }));
      toast("设置已保存");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ----- import -----
  const [pending, setPending] = useState<{ name: string; rows: ImportRow[]; dupes: number } | null>(null);
  const existing = new Set(sessions.map(rowKey));
  const [skipDupes, setSkipDupes] = useState(true);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pick(file: File | undefined) {
    setImportMsg(null);
    setPending(null);
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const raw: unknown = Array.isArray(json) ? json : json?.sessions;
      if (!Array.isArray(raw)) throw new Error("文件里没有 sessions 列表。请选择从这里导出的 JSON 文件。");
      // Drop ids: imported rows are appended as new sessions.
      // The server upgrades old (v1) rows itself.
      const rows = raw.map((r) => {
        const { id: _id, ...rest } = (r ?? {}) as ImportRow;
        return rest;
      });
      const dupes = rows.filter((r) => existing.has(rowKey(r))).length;
      setPending({ name: file.name, rows, dupes });
    } catch (err) {
      setImportMsg({ ok: false, text: err instanceof SyntaxError ? "这不是有效的 JSON 文件。" : (err as Error).message });
    }
  }

  async function runImport() {
    if (!pending) return;
    const rows = skipDupes ? pending.rows.filter((r) => !existing.has(rowKey(r))) : pending.rows;
    setBusy(true);
    try {
      const { imported } = await api.importSessions(rows);
      await reload();
      setPending(null);
      setImportMsg({ ok: true, text: `已导入 ${imported} 条记录。` });
      toast(`已导入 ${imported} 条记录`);
    } catch (err) {
      setImportMsg({ ok: false, text: `没有导入任何记录：${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout().catch(() => {});
    onLogout();
  }

  const g = Number(goal);

  return (
    <div className="narrow settings">
      <h1 className="page-title reveal" style={{ marginBottom: 28 }}>
        设置
      </h1>

      <form className="panel reveal" style={{ ["--i" as string]: 1 }} onSubmit={save}>
        <h2 className="panel-title">目标</h2>
        <div className="settings-grid">
          <label className="field">
            <span className="field-label">每日专注目标（分钟）</span>
            <input type="number" inputMode="numeric" min={0} max={1440} step={5} value={goal} onChange={(e) => setGoal(e.target.value)} />
            <span className="field-hint">{Number.isInteger(g) && g > 0 ? `即 ${formatMinutes(g)}。用于“连续达标”和每日目标线。` : "设为 0 表示不设目标。"}</span>
          </label>
          <label className="field">
            <span className="field-label">目标专注率（%）</span>
            <input type="number" inputMode="numeric" min={0} max={100} step={1} value={target} onChange={(e) => setTarget(e.target.value)} />
            <span className="field-hint">走势图里的参考线。</span>
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy}>
          保存设置
        </button>
      </form>

      <section className="panel reveal" style={{ ["--i" as string]: 2 }}>
        <h2 className="panel-title">课程</h2>
        <p className="muted">改名会更新所有记录。改成一个已有的课程名，就把两门合并成一门（同一段里的分钟数相加）。</p>
        {courses.length ? (
          <ul className="rename-list">
            {courses.map((c) => (
              <CourseRow key={c.course} {...c} color={courseVar(courseSlot(c.course))} all={courses.map((x) => x.course)} onDone={reload} toast={toast} busy={busy} />
            ))}
          </ul>
        ) : (
          <p className="thin">还没有课程。记录时添加的课程会出现在这里。</p>
        )}
      </section>

      <section className="panel reveal" style={{ ["--i" as string]: 3 }}>
        <h2 className="panel-title">数据</h2>
        <p className="muted">共 {sessions.length} 段学习记录。导出的 JSON 文件包含全部记录和设置，可以用来备份或换设备。</p>
        <div className="row-actions">
          <a className="btn" href="/api/export" download>
            导出 JSON
          </a>
          <label className="btn file-btn">
            导入 JSON…
            <input type="file" accept="application/json,.json" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
          </label>
        </div>
        {pending && (
          <div className="import-confirm">
            <p>
              {pending.name}：{pending.rows.length} 条记录。导入会追加到现有记录之后，不会覆盖。
            </p>
            {pending.dupes > 0 && (
              <label className="check">
                <input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />
                跳过 {pending.dupes} 条与现有记录相同的
              </label>
            )}
            <div className="row-actions">
              <button className="btn btn-primary" disabled={busy} onClick={runImport}>
                导入 {skipDupes ? pending.rows.length - pending.dupes : pending.rows.length} 条
              </button>
              <button className="btn btn-ghost" onClick={() => setPending(null)}>
                取消
              </button>
            </div>
          </div>
        )}
        {importMsg && (
          <p className={importMsg.ok ? "form-ok" : "form-error"} role="status">
            {importMsg.text}
          </p>
        )}
      </section>

      <section className="panel reveal" style={{ ["--i" as string]: 4 }}>
        <h2 className="panel-title">账户</h2>
        <button className="btn" onClick={logout}>
          退出登录
        </button>
      </section>
    </div>
  );
}

function CourseRow({
  course,
  sessions,
  minutes,
  color,
  all,
  onDone,
  toast,
  busy,
}: {
  course: string;
  sessions: number;
  minutes: number;
  color: string;
  all: string[];
  onDone: () => Promise<void>;
  toast: (m: string) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState(course);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const target = to.trim();
  const merge = target !== course && all.includes(target);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || target === course) return setEditing(false);
    setSaving(true);
    setError(null);
    try {
      const { updated } = await api.renameCourse(course, target);
      await onDone();
      toast(merge ? `已把 ${course} 合并到 ${target}（${updated} 段）` : `已改名为 ${target}（${updated} 段）`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <li>
      <div className="rename-row">
        <span className="rr-name">
          <i className="dot" style={{ ["--c" as string]: color }} />
          <span>{course}</span>
          <span className="rr-meta">
            {sessions} 段，{formatMinutes(minutes)}
          </span>
        </span>
        {!editing && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setTo(course);
              setEditing(true);
            }}
          >
            改名或合并
          </button>
        )}
      </div>
      {editing && (
        <form className="rename-form" onSubmit={submit}>
          <div className="row-actions">
            <input value={to} maxLength={40} list="rename-options" aria-label={`${course} 的新名字`} autoFocus onChange={(e) => setTo(e.target.value)} />
            <datalist id="rename-options">
              {all
                .filter((c) => c !== course)
                .map((c) => (
                  <option key={c} value={c} />
                ))}
            </datalist>
            <button className="btn btn-primary" disabled={saving || busy || !target || target === course}>
              {merge ? "合并" : "改名"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
          {merge && <p className="field-hint">{target} 已经存在：{course} 的所有记录会并入 {target}，这一步无法撤销。</p>}
          {error && <p className="form-error">{error}</p>}
        </form>
      )}
    </li>
  );
}
