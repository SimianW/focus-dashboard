import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { courseVar, useData } from "../store";
import { link, navigate } from "../router";
import { clearDraft, emptyDraft, isDirty, isRunning, openDraft, readDraft, rowKey, writeDraft, type Draft, type DraftRow } from "../draft";
import { prefersReducedMotion } from "../motion";
import {
  addDays,
  elapsedMin,
  formatPct,
  localTime,
  localToday,
  normalizeCourses,
  spanMin,
  TIME_RE,
  toMinutes,
  type SessionInput,
} from "../stats";
import { Rich, useT } from "../i18n";

const STEP = 15;
const MAX_COURSES = 10;

const parseMin = (v: string) => (v.trim() === "" ? null : Number(v));

export function Entry({ id, date, startNow }: { id?: number; date?: string; startNow?: boolean }) {
  const { sessions, courses, courseSlot, loaded, reload, toast } = useData();
  const t = useT();
  const fm = t.fmt.minutes;
  const editing = id !== undefined ? sessions.find((s) => s.id === id) : undefined;
  const [opened] = useState(() => (id !== undefined ? { form: emptyDraft(), kept: null } : openDraft(readDraft(), { date, startNow })));
  const [form, setForm] = useState<Draft>(opened.form);
  // A separate entry while a block runs: never written to or cleared from the draft.
  const kept = opened.kept;

  // Drop ?start=now so a reload does not stamp again.
  useEffect(() => {
    if (startNow) navigate("/add", { replace: true });
  }, [startNow]);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const newInput = useRef<HTMLInputElement>(null);

  // Fill the form once the session to edit is available.
  useEffect(() => {
    if (!editing) return;
    setForm({
      date: editing.date,
      start: editing.start,
      end: editing.end,
      rows: editing.courses.map((c) => ({ key: rowKey(), course: c.course, minutes: String(c.minutes) })),
      energy: editing.energy,
      interruptions: editing.interruptions === null ? "" : String(editing.interruptions),
      note: editing.note,
    });
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (id === undefined && !kept) writeDraft(form);
  }, [form, id, kept]);

  useEffect(() => {
    if (adding) newInput.current?.focus();
  }, [adding]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setRow = (key: string, minutes: string) => setForm((f) => ({ ...f, rows: f.rows.map((r) => (r.key === key ? { ...r, minutes } : r)) }));

  // ----- derived -----
  const timesOk = TIME_RE.test(form.start) && TIME_RE.test(form.end);
  const span = timesOk ? spanMin(form.start, form.end) : null;
  const overnight = timesOk && toMinutes(form.end) <= toMinutes(form.start);
  const rows = form.rows.filter((r) => !leaving.has(r.key));
  const minutesOf = (r: DraftRow) => {
    const m = parseMin(r.minutes);
    return m !== null && Number.isFinite(m) && m > 0 ? m : 0;
  };
  const focus = rows.reduce((a, r) => a + minutesOf(r), 0);
  const left = span !== null ? span - focus : null;
  const over = left !== null && left < 0;
  const ratio = span && !over ? focus / span : null;

  const problem = (() => {
    if (!form.date) return t.entry.chooseDate;
    if (!timesOk) return t.entry.fillTimes;
    if (span! > 16 * 60) return t.entry.tooLong(fm(span!));
    for (const r of rows) {
      const m = parseMin(r.minutes);
      if (m === null || !Number.isInteger(m) || m <= 0) return t.entry.rowMinutes(r.course);
    }
    if (rows.length > MAX_COURSES) return t.entry.maxCourses(MAX_COURSES);
    if (over) return t.entry.over(fm(focus), fm(-left!));
    const n = form.interruptions === "" ? null : Number(form.interruptions);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 999)) return t.entry.interruptionsRange;
    return null;
  })();

  // Chips: courses studied in the last two weeks first, then the rest by use.
  const suggestions = useMemo(() => {
    const recent = addDays(localToday(), -14);
    return [...courses].sort((a, b) => Number(b.lastDate >= recent) - Number(a.lastDate >= recent) || b.sessions - a.sessions).map((c) => c.course);
  }, [courses]);
  const inForm = new Set(rows.map((r) => r.course));

  // ----- actions -----
  function addCourse(name: string) {
    const course = name.trim().slice(0, 40);
    if (!course || inForm.has(course)) return;
    setForm((f) => ({ ...f, rows: [...f.rows, { key: rowKey(), course, minutes: "" }] }));
  }

  function removeRow(key: string) {
    if (prefersReducedMotion()) {
      setForm((f) => ({ ...f, rows: f.rows.filter((r) => r.key !== key) }));
      return;
    }
    setLeaving((s) => new Set(s).add(key));
    window.setTimeout(() => {
      setForm((f) => ({ ...f, rows: f.rows.filter((r) => r.key !== key) }));
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }, 260);
  }

  function toggleChip(course: string) {
    const row = rows.find((r) => r.course === course);
    if (row) removeRow(row.key);
    else addCourse(course);
  }

  function submitNew() {
    addCourse(newName);
    setNewName("");
    setAdding(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    const body: SessionInput = {
      date: form.date,
      start: form.start,
      end: form.end,
      courses: normalizeCourses(rows.map((r) => ({ course: r.course, minutes: Number(r.minutes) }))),
      energy: form.energy,
      interruptions: form.interruptions === "" ? null : Number(form.interruptions),
      note: form.note,
    };
    setBusy(true);
    setError(null);
    try {
      if (id !== undefined) await api.updateSession(id, body);
      else {
        await api.createSession(body);
        if (!kept) clearDraft();
      }
      await reload();
      toast(id !== undefined ? t.entry.toastSaved : t.entry.toastLogged);
      navigate(`/day/${body.date}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (id === undefined) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await api.deleteSession(id);
      await reload();
      toast(t.entry.toastDeleted);
      navigate(`/day/${form.date}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (id !== undefined && loaded && !editing) {
    return (
      <div className="narrow">
        <h1 className="page-title">{t.entry.notFound}</h1>
        <p className="page-sub">{t.entry.notFoundSub}</p>
        <p style={{ marginTop: 20 }}>
          <a className="btn" {...link("/records")}>
            {t.entry.viewAll}
          </a>
        </p>
      </div>
    );
  }

  const today = localToday();
  const yesterday = addDays(today, -1);
  const isNew = id === undefined;

  return (
    <form className="entry narrow" onSubmit={save} noValidate>
      <div className="page-head reveal">
        <div>
          <h1 className="page-title">{isNew ? t.entry.titleNew : t.entry.titleEdit}</h1>
          <p className="page-sub">{isNew ? t.entry.subNew : t.fmt.date(form.date)}</p>
        </div>
        {isNew && isDirty(form) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setForm(emptyDraft(form.date));
              setTouched(false);
            }}
          >
            {t.entry.clear}
          </button>
        )}
      </div>

      {isNew &&
        (kept ? (
          <section className="stamp is-running reveal">
            <span className="stamp-pulse" aria-hidden="true" />
            <span className="stamp-text">
              <strong>{t.entry.separateTitle}</strong>
              <span>{t.entry.separateSub(kept.start)}</span>
            </span>
            <a className="btn" {...link("/add")}>
              {t.entry.backToRunning}
            </a>
          </section>
        ) : (
          <Stamp form={form} onStart={() => setForm((f) => ({ ...f, date: today, start: localTime(), end: "" }))} onEnd={() => set("end", localTime())} />
        ))}

      <section className="step reveal" style={{ ["--i" as string]: 1 }} aria-labelledby="step-time">
        <h2 className="step-title" id="step-time">
          {t.entry.stepTime}
          <small>{form.date ? t.fmt.date(form.date) : t.entry.pickDay}</small>
        </h2>
        <div className="day-pick" role="group" aria-label={t.entry.dateGroup}>
          <button type="button" className="chip" aria-pressed={form.date === today} onClick={() => set("date", today)}>
            {t.common.today}
          </button>
          <button type="button" className="chip" aria-pressed={form.date === yesterday} onClick={() => set("date", yesterday)}>
            {t.entry.yesterday}
          </button>
          <input type="date" aria-label={t.entry.otherDate} value={form.date} max={today} onChange={(e) => set("date", e.target.value)} required />
        </div>
        <div className="time-pair">
          <TimeTile id="t-start" label={t.entry.start} value={form.start} onChange={(v) => set("start", v)} />
          <TimeTile
            id="t-end"
            label={t.entry.end}
            value={form.end}
            onChange={(v) => set("end", v)}
            hint={overnight ? t.entry.overnight : span !== null ? t.entry.total(fm(span)) : undefined}
            invalid={span !== null && span > 16 * 60}
          />
        </div>
      </section>

      <section className="step reveal" style={{ ["--i" as string]: 2 }} aria-labelledby="step-courses">
        <h2 className="step-title" id="step-courses">
          {t.entry.stepCourses}
          <small>{rows.length ? t.entry.courseCount(rows.length) : t.entry.coursesHint}</small>
        </h2>

        <div className="chips course-chips" role="group" aria-label={t.entry.coursesGroup}>
          {suggestions.slice(0, 10).map((c) => (
            <button type="button" key={c} className="chip" aria-pressed={inForm.has(c)} onClick={() => toggleChip(c)}>
              <i className="dot" style={{ ["--c" as string]: courseVar(courseSlot(c)) }} />
              {c}
            </button>
          ))}
          {/* Courses added by typing that are not suggestions yet. */}
          {rows
            .filter((r) => !suggestions.slice(0, 10).includes(r.course))
            .map((r) => (
              <button type="button" key={r.key} className="chip" aria-pressed onClick={() => removeRow(r.key)}>
                <i className="dot" style={{ ["--c" as string]: courseVar(courseSlot(r.course)) }} />
                {r.course}
              </button>
            ))}
          {!adding && (
            <button type="button" className="chip" onClick={() => setAdding(true)}>
              <PlusIcon /> {t.entry.newCourse}
            </button>
          )}
        </div>

        {adding && (
          <div className="add-course">
            <input
              ref={newInput}
              list="course-options"
              value={newName}
              maxLength={40}
              placeholder={t.entry.newCoursePlaceholder}
              aria-label={t.entry.newCourseLabel}
              autoComplete="off"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNew();
                }
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <datalist id="course-options">
              {suggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <button type="button" className="btn" onClick={submitNew} disabled={!newName.trim()}>
              {t.entry.add}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              {t.common.cancel}
            </button>
          </div>
        )}

        {form.rows.length > 0 && (
          <ul className="course-rows">
            {form.rows.map((r, i) => {
              const m = parseMin(r.minutes);
              // Offer "Fill" where it helps: on empty rows, else on the last row.
              const anyEmpty = rows.some((x) => !x.minutes);
              const offerFill = left !== null && left > 0 && (anyEmpty ? !r.minutes : i === form.rows.length - 1);
              const bad = touched && (m === null || !Number.isInteger(m) || m <= 0);
              return (
                <li key={r.key} className="course-row" data-leaving={leaving.has(r.key) ? "" : undefined}>
                  <div>
                    <div className="cr-inner">
                      <span className="cr-name">
                        <i className="dot" style={{ ["--c" as string]: courseVar(courseSlot(r.course)) }} />
                        <span title={r.course}>{r.course}</span>
                      </span>
                      <span className="cr-controls">
                        <span className="stepper" role="group" aria-label={t.entry.minutesGroup(r.course)}>
                          <button type="button" aria-label={t.entry.minus(r.course, STEP)} onClick={() => setRow(r.key, String(Math.max(0, (m ?? 0) - STEP) || ""))}>
                            <MinusIcon />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={5}
                            placeholder="0"
                            aria-label={t.entry.minutesInput(r.course)}
                            aria-invalid={bad || undefined}
                            value={r.minutes}
                            onChange={(e) => setRow(r.key, e.target.value)}
                          />
                          <span className="unit">{t.entry.unit}</span>
                          <button type="button" aria-label={t.entry.plus(r.course, STEP)} onClick={() => setRow(r.key, String((m ?? 0) + STEP))}>
                            <PlusIcon />
                          </button>
                        </span>
                        {offerFill && (
                          <button type="button" className="btn fill-btn" title={t.entry.fillTitle} onClick={() => setRow(r.key, String((m && m > 0 ? m : 0) + left))}>
                            {t.entry.fill(left)}
                          </button>
                        )}
                      </span>
                      <button type="button" className="cr-remove" aria-label={t.entry.remove(r.course)} onClick={() => removeRow(r.key)}>
                        <CloseIcon />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Meter span={span} rows={rows.map((r) => ({ course: r.course, minutes: minutesOf(r), slot: courseSlot(r.course) }))} focus={focus} left={left} ratio={ratio} />

      <details className="entry-more reveal" style={{ ["--i" as string]: 4 }} open={!isNew && (form.energy !== null || form.interruptions !== "" || form.note !== "") ? true : undefined}>
        <summary>
          <span>
            {t.entry.more}
            <small>{t.entry.moreHint}</small>
          </span>
          <ChevronIcon />
        </summary>
        <div className="more-body">
          <div className="field">
            <span className="field-label" id="energy-label">
              {t.entry.energy}
            </span>
            <div className="segmented" role="group" aria-labelledby="energy-label">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} aria-pressed={form.energy === n} onClick={() => set("energy", form.energy === n ? null : n)}>
                  {n}
                </button>
              ))}
            </div>
            <span className="field-hint">{t.entry.energyHint}</span>
          </div>

          <div className="field">
            <span className="field-label" id="intr-label">
              {t.entry.interruptions}
            </span>
            <span className="stepper stepper-wide" role="group" aria-labelledby="intr-label">
              <button type="button" aria-label={t.entry.minusOne} onClick={() => set("interruptions", String(Math.max(0, (Number(form.interruptions) || 0) - 1)))}>
                <MinusIcon />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="—"
                aria-labelledby="intr-label"
                value={form.interruptions}
                onChange={(e) => set("interruptions", e.target.value)}
              />
              <button type="button" aria-label={t.entry.plusOne} onClick={() => set("interruptions", String((Number(form.interruptions) || 0) + 1))}>
                <PlusIcon />
              </button>
            </span>
          </div>

          <label className="field">
            <span className="field-label">{t.entry.note}</span>
            <textarea rows={2} value={form.note} maxLength={1000} placeholder={t.entry.notePlaceholder} onChange={(e) => set("note", e.target.value)} />
          </label>
        </div>
      </details>

      {(error || (touched && problem)) && (
        <p className="form-error" role="alert">
          {error ?? problem}
        </p>
      )}

      <div className="savebar">
        <span className="savebar-summary" aria-hidden="true">
          {span === null ? (
            t.entry.fillTimesHint
          ) : (
            <Rich text={t.entry.summary(fm(focus), left !== null && left > 0 ? fm(left) : null, ratio !== null ? formatPct(ratio) : null)} />
          )}
        </span>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? t.entry.saving : isNew ? t.entry.save : t.entry.saveChanges}
        </button>
      </div>

      {!isNew && (
        <div className="entry-foot">
          <a className="back" {...link(`/day/${form.date}`)}>
            {t.entry.backToDay}
          </a>
          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={remove} onBlur={() => setConfirmDelete(false)}>
            {confirmDelete ? t.entry.confirmDelete : t.entry.delete}
          </button>
        </div>
      )}
    </form>
  );
}

/** One tap when you sit down, one when you stop; the start waits in the draft. */
function Stamp({ form, onStart, onEnd }: { form: Draft; onStart: () => void; onEnd: () => void }) {
  const t = useT();
  const running = isRunning(form);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => tick((n) => n + 1), 20_000);
    return () => window.clearInterval(t);
  }, [running]);

  if (running) {
    const elapsed = elapsedMin(form.start, localTime());
    return (
      <section className="stamp is-running reveal" aria-live="polite">
        <span className="stamp-pulse" aria-hidden="true" />
        <span className="stamp-text">
          <strong>{t.common.running(elapsed)}</strong>
          <span>{t.entry.stampRunning(form.start)}</span>
        </span>
        <button type="button" className="btn btn-accent" onClick={onEnd}>
          {t.common.end}
        </button>
      </section>
    );
  }
  if (form.start) return null;
  return (
    <section className="stamp reveal">
      <span className="stamp-text">
        <strong>{t.entry.stampIdle}</strong>
        <span>{t.entry.stampIdleSub}</span>
      </span>
      <button type="button" className="btn btn-accent" onClick={onStart}>
        {t.common.startStudying}
      </button>
    </section>
  );
}

function TimeTile({
  id,
  label,
  value,
  onChange,
  hint,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  invalid?: boolean;
}) {
  const t = useT();
  return (
    <div className="time-tile">
      <div className="time-tile-head">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <button type="button" className="btn btn-sm now" onClick={() => onChange(localTime())} aria-label={t.entry.setNow(label)}>
          {t.entry.now}
        </button>
      </div>
      <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} required />
      <span className="field-hint">{hint ?? " "}</span>
    </div>
  );
}

/** The block as a bar: courses fill the span left to right, the rest is rest. */
function Meter({
  span,
  rows,
  focus,
  left,
  ratio,
}: {
  span: number | null;
  rows: { course: string; minutes: number; slot: number }[];
  focus: number;
  left: number | null;
  ratio: number | null;
}) {
  const t = useT();
  const fm = t.fmt.minutes;
  const over = left !== null && left < 0;
  // When over, scale to the course total so the bar still shows the split.
  const whole = span === null ? Math.max(focus, 1) : Math.max(span, focus);
  const filled = rows.filter((r) => r.minutes > 0);
  return (
    <section className="meter reveal" style={{ ["--i" as string]: 3 }} data-over={over ? "" : undefined} aria-live="polite" aria-label={t.entry.meter}>
      <div className="meter-top">
        <div>
          <span className={`meter-ratio fig${ratio === null ? " is-empty" : ""}`}>{ratio === null ? "—" : formatPct(ratio)}</span>
          <span className="meter-ratio-label">{t.common.focusRate}</span>
        </div>
        <dl className="meter-facts">
          <dt>{t.common.duration}</dt>
          <dd>{span === null ? "—" : fm(span)}</dd>
          <dt>{t.common.focused}</dt>
          <dd>{fm(focus)}</dd>
          <dt>{t.entry.restShort}</dt>
          <dd>{left === null || left < 0 ? "—" : fm(left)}</dd>
        </dl>
      </div>
      <div className="meter-bar" aria-hidden="true">
        {filled.map((r) => (
          <span key={r.course} style={{ width: `${(r.minutes / whole) * 100}%`, ["--c" as string]: courseVar(r.slot) }} />
        ))}
        {span !== null && !over && <span className="ms-rest" />}
      </div>
      {filled.length > 0 && (
        <div className="legend-row meter-legend">
          {filled.map((r) => (
            <span key={r.course}>
              <i className="dot" style={{ ["--c" as string]: courseVar(r.slot) }} />
              {r.course} {fm(r.minutes)}
            </span>
          ))}
          {left !== null && left > 0 && (
            <span>
              <i className="dot" style={{ ["--c" as string]: "var(--unfocused)" }} />
              {t.common.rest}
            </span>
          )}
        </div>
      )}
      {over && <p className="meter-note">{t.entry.overNote(fm(-left!))}</p>}
    </section>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
