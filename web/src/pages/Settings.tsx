import { useEffect, useState } from "react";
import { api } from "../api";
import { useData } from "../store";
import { courseVar } from "../store";
import { sessionFocus, type Language, type Session } from "../stats";
import { DICTIONARIES, getLanguage, LANGUAGES, setLanguage, useT, type Messages } from "../i18n";

type ImportRow = Record<string, unknown>;

/** date|start|end|focus for an existing session or an export row of either version. */
function rowKey(r: ImportRow | Session): string {
  const x = r as ImportRow;
  const focus = Array.isArray(x.courses) ? sessionFocus(x as unknown as Session) : Number(x.focusMin ?? 0);
  return `${x.date}|${x.start}|${x.end}|${focus}`;
}

export function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const { settings, sessions, courses, courseSlot, setSettings, reload, toast } = useData();
  const t = useT();
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
    if (!Number.isInteger(g) || g < 0 || g > 1440) return setError(t.settings.goalRange);
    if (!Number.isFinite(r) || r < 0 || r > 100) return setError(t.settings.targetRange);
    setBusy(true);
    setError(null);
    try {
      setSettings(await api.saveSettings({ dailyGoalMin: g, targetRatio: r / 100 }));
      toast(t.settings.saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Switch at once, then save only the language so the goal form is untouched.
  async function chooseLanguage(lang: Language) {
    const before = getLanguage();
    if (lang === before) return;
    setLanguage(lang);
    try {
      setSettings(await api.saveSettings({ language: lang }));
    } catch (err) {
      setLanguage(before);
      toast((err as Error).message);
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
      if (!Array.isArray(raw)) throw new Error(t.settings.noSessions);
      // Drop ids: imported rows are appended as new sessions.
      // The server upgrades old (v1) rows itself.
      const rows = raw.map((r) => {
        const { id: _id, ...rest } = (r ?? {}) as ImportRow;
        return rest;
      });
      const dupes = rows.filter((r) => existing.has(rowKey(r))).length;
      setPending({ name: file.name, rows, dupes });
    } catch (err) {
      setImportMsg({ ok: false, text: err instanceof SyntaxError ? t.settings.notJson : (err as Error).message });
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
      setImportMsg({ ok: true, text: t.settings.imported(imported) });
      toast(t.settings.importedToast(imported));
    } catch (err) {
      setImportMsg({ ok: false, text: t.settings.importFailed((err as Error).message) });
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
        {t.settings.title}
      </h1>

      <section className="panel reveal language-panel" style={{ ["--i" as string]: 1 }} aria-labelledby="lang-title">
        <div className="language-row">
          <div>
            <h2 className="panel-title" id="lang-title">
              {t.settings.language}
            </h2>
            <p className="muted">{t.settings.languageHint}</p>
          </div>
          <div className="seg-group lang-switch" role="group" aria-label={t.settings.languageGroup}>
            {LANGUAGES.map((l) => (
              <button key={l} className="seg" lang={DICTIONARIES[l].htmlLang} aria-pressed={t.lang === l} onClick={() => chooseLanguage(l)}>
                {DICTIONARIES[l].label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <form className="panel reveal" style={{ ["--i" as string]: 2 }} onSubmit={save}>
        <h2 className="panel-title">{t.settings.goals}</h2>
        <div className="settings-grid">
          <label className="field">
            <span className="field-label">{t.settings.dailyGoal}</span>
            <input type="number" inputMode="numeric" min={0} max={1440} step={5} value={goal} onChange={(e) => setGoal(e.target.value)} />
            <span className="field-hint">{Number.isInteger(g) && g > 0 ? t.settings.goalHint(t.fmt.minutes(g)) : t.settings.goalHintNone}</span>
          </label>
          <label className="field">
            <span className="field-label">{t.settings.target}</span>
            <input type="number" inputMode="numeric" min={0} max={100} step={1} value={target} onChange={(e) => setTarget(e.target.value)} />
            <span className="field-hint">{t.settings.targetHint}</span>
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {t.settings.save}
        </button>
      </form>

      <section className="panel reveal" style={{ ["--i" as string]: 3 }}>
        <h2 className="panel-title">{t.settings.courses}</h2>
        <p className="muted">{t.settings.coursesHint}</p>
        {courses.length ? (
          <ul className="rename-list">
            {courses.map((c) => (
              <CourseRow key={c.course} {...c} color={courseVar(courseSlot(c.course))} all={courses.map((x) => x.course)} onDone={reload} toast={toast} busy={busy} t={t} />
            ))}
          </ul>
        ) : (
          <p className="thin">{t.settings.noCourses}</p>
        )}
      </section>

      <section className="panel reveal" style={{ ["--i" as string]: 4 }}>
        <h2 className="panel-title">{t.settings.data}</h2>
        <p className="muted">{t.settings.dataSummary(sessions.length)}</p>
        <div className="row-actions">
          <a className="btn" href="/api/export" download>
            {t.settings.export}
          </a>
          <label className="btn file-btn">
            {t.settings.import}
            <input type="file" accept="application/json,.json" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
          </label>
        </div>
        {pending && (
          <div className="import-confirm">
            <p>
              {t.settings.pending(pending.name, pending.rows.length)}
            </p>
            {pending.dupes > 0 && (
              <label className="check">
                <input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />
                {t.settings.skipDupes(pending.dupes)}
              </label>
            )}
            <div className="row-actions">
              <button className="btn btn-primary" disabled={busy} onClick={runImport}>
                {t.settings.importN(skipDupes ? pending.rows.length - pending.dupes : pending.rows.length)}
              </button>
              <button className="btn btn-ghost" onClick={() => setPending(null)}>
                {t.common.cancel}
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

      <section className="panel reveal" style={{ ["--i" as string]: 5 }}>
        <h2 className="panel-title">{t.settings.account}</h2>
        <button className="btn" onClick={logout}>
          {t.settings.logout}
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
  t,
}: {
  course: string;
  sessions: number;
  minutes: number;
  color: string;
  all: string[];
  onDone: () => Promise<void>;
  toast: (m: string) => void;
  busy: boolean;
  t: Messages;
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
      toast(merge ? t.settings.merged(course, target, updated) : t.settings.renamed(target, updated));
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
            {t.settings.courseMeta(sessions, t.fmt.minutes(minutes))}
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
            {t.settings.renameOrMerge}
          </button>
        )}
      </div>
      {editing && (
        <form className="rename-form" onSubmit={submit}>
          <div className="row-actions">
            <input value={to} maxLength={40} list="rename-options" aria-label={t.settings.newName(course)} autoFocus onChange={(e) => setTo(e.target.value)} />
            <datalist id="rename-options">
              {all
                .filter((c) => c !== course)
                .map((c) => (
                  <option key={c} value={c} />
                ))}
            </datalist>
            <button className="btn btn-primary" disabled={saving || busy || !target || target === course}>
              {merge ? t.settings.merge : t.settings.rename}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              {t.common.cancel}
            </button>
          </div>
          {merge && <p className="field-hint">{t.settings.mergeWarn(target, course)}</p>}
          {error && <p className="form-error">{error}</p>}
        </form>
      )}
    </li>
  );
}
