import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { courseVar, currentDraft, useData } from "../store";
import { link, navigate } from "../router";
import { clearDraft, emptyDraft, isDirty, isRunning, openDraft, rowKey, rowsToCourses, sessionRows, writeDraft, type Draft, type DraftRow } from "../draft";
import { pickerEntries, toggleTask } from "../pick";
import { runningStep, startDraft } from "../running";
import { keyOf } from "../runningSync";
import { usePickList } from "../usePickList";
import { SubjectChip, TaskPicker, useStartPicker } from "../components/TaskPicker";
import { prefersReducedMotion } from "../motion";
import {
  addDays,
  elapsedMin,
  formatPct,
  localTime,
  localToday,
  spanMin,
  TIME_RE,
  toMinutes,
  type SessionInput,
} from "../stats";
import { Rich, useT } from "../i18n";

const STEP = 15;
const MAX_COURSES = 10;

const parseMin = (v: string) => (v.trim() === "" ? null : Number(v));

/** What a row shows: a task's title, else the course typed. */
const labelOf = (r: DraftRow) => r.task?.title ?? r.course;

type EntryProps = { id?: number; date?: string; startNow?: boolean };

export function Entry(props: EntryProps) {
  const { loaded, refreshRunning, runningConflicts } = useData();
  const t = useT();
  const isNew = props.id === undefined;
  // A new entry opens once the running block has been read again: another
  // device may have started one since this page loaded.
  const [fresh, setFresh] = useState(!isNew);
  useEffect(() => {
    if (!isNew) return;
    let live = true;
    refreshRunning().then(() => live && setFresh(true));
    return () => {
      live = false;
    };
  }, [isNew, refreshRunning]);
  if (isNew && (!loaded || !fresh)) return <div className="loading">{t.common.loading}</div>;
  // When another device changed the running block first, a new form re-opens
  // on the server's block. (A separate entry, `kept`, never writes the block,
  // so its own writes cause no conflict.)
  return <EntryForm key={isNew ? runningConflicts : undefined} {...props} />;
}

function EntryForm({ id, date, startNow }: EntryProps) {
  const { sessions, courses, courseSlot, loaded, reload, toast, running, setRunning, undelivered, openRunning } = useData();
  const t = useT();
  const fm = t.fmt.minutes;
  const editing = id !== undefined ? sessions.find((s) => s.id === id) : undefined;
  const [opened] = useState<ReturnType<typeof openDraft>>(() =>
    id !== undefined ? { form: emptyDraft(), kept: null } : openDraft(currentDraft(running, undelivered), { date, startNow }),
  );
  const [form, setForm] = useState<Draft>(opened.form);
  // A separate entry while a block runs: never written to or cleared from the draft.
  const kept = opened.kept;

  // Drop ?start=now so a reload does not start again.
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
      rows: sessionRows(editing.courses),
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

  // The running block lives on the server: keep its day, start and first row
  // in step with this form while it runs, and end it once the form stops
  // running (End, Clear, Start cleared, another day), if this form owns it.
  // Each write expects the form's own block; one that fails (network, 5xx)
  // leaves the server's block shown again and is not sent again until the
  // form changes. A write the form opened on while it was still on its way
  // (Start on Overview) is waited on; if it fails, the form sends it again.
  const [settledAt, setSettledAt] = useState(0);
  const [own] = useState(() => {
    const { own, settled } = openRunning(opened.form);
    settled?.then(() => setSettledAt((n) => n + 1));
    return own;
  });
  const failed = useRef<Draft | null>(null);
  useEffect(() => {
    if (id !== undefined || kept || form === failed.current) return;
    const step = runningStep(form, running, own.mine);
    if (!step) return;
    const next = step === "end" ? null : step.put;
    const write = own.ask(next);
    setRunning(next, keyOf(write.expected)).then((o) => {
      write.settle(o === "ok");
      if (o === "failed") failed.current = form;
    });
  }, [form, running, id, kept, setRunning, own, settledAt]);

  // life-os's task list: rows are picked from it when it is available.
  const pick = usePickList();
  const withTasks = pick.list?.available === true;
  const [picking, setPicking] = useState(false);
  const start = useStartPicker(pick, (tapped, task) => setForm((f) => (f.start ? f : startDraft(f, tapped, task))));
  // "Start studying" by link (?start=now): the same start flow as the card below.
  useEffect(() => {
    if (opened.startAt) start.tap(opened.startAt);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (m === null || !Number.isInteger(m) || m <= 0) return t.entry.rowMinutes(labelOf(r));
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
  // Course chips toggle typed rows only; a task row of the same course is a different row.
  const typedRows = rows.filter((r) => !r.task);
  const inForm = new Set(typedRows.map((r) => r.course));
  const entries = pickerEntries(pick.list ?? null, rows);

  // ----- actions -----
  function addCourse(name: string) {
    const course = name.trim().slice(0, 40);
    if (!course || inForm.has(course)) return;
    setForm((f) => ({ ...f, rows: [...f.rows, { key: rowKey(), course, minutes: "", task: null }] }));
  }

  function pickTask(task: Parameters<typeof toggleTask>[1]) {
    setPicking(false);
    const step = toggleTask(rows, task);
    if ("remove" in step) removeRow(step.remove);
    else setForm((f) => ({ ...f, rows: [...f.rows, step.add] }));
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
    const row = typedRows.find((r) => r.course === course);
    if (row) removeRow(row.key);
    else addCourse(course);
  }

  function submitNew() {
    addCourse(newName);
    setNewName("");
    // The "Other" box stays open for another name; the old field closes.
    if (!withTasks) setAdding(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    const body: SessionInput = {
      date: form.date,
      start: form.start,
      end: form.end,
      courses: rowsToCourses(rows),
      energy: form.energy,
      interruptions: form.interruptions === "" ? null : Number(form.interruptions),
      note: form.note,
    };
    setBusy(true);
    setError(null);
    try {
      if (id !== undefined) await api.updateSession(id, body);
      else {
        // Saving the running block also ends it on the server, in the same request.
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

  // Pieces of the "What you studied" step, arranged below by whether tasks can be picked.
  const rowList = form.rows.length > 0 && (
    <ul className="course-rows">
      {form.rows.map((r, i) => {
        const m = parseMin(r.minutes);
        // Offer "Fill" where it helps: on empty rows, else on the last row.
        const anyEmpty = rows.some((x) => !x.minutes);
        const offerFill = left !== null && left > 0 && (anyEmpty ? !r.minutes : i === form.rows.length - 1);
        const bad = touched && (m === null || !Number.isInteger(m) || m <= 0);
        const label = labelOf(r);
        return (
          <li key={r.key} className="course-row" data-leaving={leaving.has(r.key) ? "" : undefined}>
            <div>
              <div className="cr-inner">
                {r.task && r.task.subject !== null ? (
                  <span className="cr-name cr-task">
                    <span className="cr-title">{r.task.title}</span>
                    <SubjectChip course={r.course} />
                  </span>
                ) : (
                  <span className="cr-name">
                    <i className="dot" style={{ ["--c" as string]: courseVar(courseSlot(r.course)) }} />
                    <span title={label}>{label}</span>
                  </span>
                )}
                <span className="cr-controls">
                  <span className="stepper" role="group" aria-label={t.entry.minutesGroup(label)}>
                    <button type="button" aria-label={t.entry.minus(label, STEP)} onClick={() => setRow(r.key, String(Math.max(0, (m ?? 0) - STEP) || ""))}>
                      <MinusIcon />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={5}
                      placeholder="0"
                      aria-label={t.entry.minutesInput(label)}
                      aria-invalid={bad || undefined}
                      value={r.minutes}
                      onChange={(e) => setRow(r.key, e.target.value)}
                    />
                    <span className="unit">{t.entry.unit}</span>
                    <button type="button" aria-label={t.entry.plus(label, STEP)} onClick={() => setRow(r.key, String((m ?? 0) + STEP))}>
                      <PlusIcon />
                    </button>
                  </span>
                  {offerFill && (
                    <button type="button" className="btn fill-btn" title={t.entry.fillTitle} onClick={() => setRow(r.key, String((m && m > 0 ? m : 0) + left))}>
                      {t.entry.fill(left)}
                    </button>
                  )}
                </span>
                <button type="button" className="cr-remove" aria-label={t.entry.remove(label)} onClick={() => removeRow(r.key)}>
                  <CloseIcon />
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const chipGroup = (
    <div className="chips course-chips" role="group" aria-label={t.entry.coursesGroup}>
      {suggestions.slice(0, 10).map((c) => (
        <button type="button" key={c} className="chip" aria-pressed={inForm.has(c)} onClick={() => toggleChip(c)}>
          <i className="dot" style={{ ["--c" as string]: courseVar(courseSlot(c)) }} />
          {c}
        </button>
      ))}
      {/* Courses added by typing that are not suggestions yet. */}
      {typedRows
        .filter((r) => !suggestions.slice(0, 10).includes(r.course))
        .map((r) => (
          <button type="button" key={r.key} className="chip" aria-pressed onClick={() => removeRow(r.key)}>
            <i className="dot" style={{ ["--c" as string]: courseVar(courseSlot(r.course)) }} />
            {r.course}
          </button>
        ))}
      {!withTasks && !adding && (
        <button type="button" className="chip" onClick={() => setAdding(true)}>
          <PlusIcon /> {t.entry.newCourse}
        </button>
      )}
    </div>
  );

  const nameField = adding && (
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
      {!withTasks && (
        <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
          {t.common.cancel}
        </button>
      )}
    </div>
  );

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
              // Discarding a running block ends it on every device (see runningStep).
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
          <Stamp form={form} starting={start.busy} onStart={() => start.tap()} onEnd={() => set("end", localTime())} />
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
          <small>
            {withTasks
              ? rows.length
                ? t.entry.rowCount(rows.length)
                : t.entry.rowsHint
              : rows.length
                ? t.entry.courseCount(rows.length)
                : t.entry.coursesHint}
          </small>
        </h2>

        {withTasks ? (
          <>
            {rowList}
            {adding ? (
              <div className="other-box">
                <div className="other-box-head">
                  <span>
                    <Rich text={t.entry.otherHead} />
                  </span>
                  <button type="button" className="cr-remove" aria-label={t.entry.closeOther} onClick={() => setAdding(false)}>
                    <CloseIcon />
                  </button>
                </div>
                {chipGroup}
                {nameField}
              </div>
            ) : (
              <button type="button" className="chip add-row" onClick={() => setPicking(true)}>
                <PlusIcon /> {t.entry.addRow}
              </button>
            )}
            {picking && entries && (
              <TaskPicker
                entries={entries}
                sub={t.picker.addSub}
                onPick={pickTask}
                onOther={() => {
                  setPicking(false);
                  setAdding(true);
                }}
                onClose={() => setPicking(false)}
              />
            )}
          </>
        ) : (
          <>
            {/* Until the task list answers, how rows are added is not settled yet. */}
            {pick.list !== undefined && chipGroup}
            {nameField}
            {rowList}
          </>
        )}
      </section>

      <Meter span={span} rows={rows.map((r) => ({ key: r.key, label: labelOf(r), minutes: minutesOf(r), slot: courseSlot(r.course) }))} focus={focus} left={left} ratio={ratio} />
      {start.picker}

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
function Stamp({ form, starting, onStart, onEnd }: { form: Draft; starting: boolean; onStart: () => void; onEnd: () => void }) {
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
    const first = form.rows[0];
    return (
      <section className="stamp is-running reveal" aria-live="polite">
        <span className="stamp-pulse" aria-hidden="true" />
        <span className="stamp-text">
          <strong>{t.common.running(elapsed)}</strong>
          {first?.task && (
            <span className="stamp-task">
              {first.task.title} {first.task.subject !== null && <SubjectChip course={first.course} />}
            </span>
          )}
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
      <button type="button" className="btn btn-accent" onClick={onStart} disabled={starting} aria-busy={starting || undefined}>
        {starting ? t.common.starting : t.common.startStudying}
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
  rows: { key: string; label: string; minutes: number; slot: number }[];
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
          <span key={r.key} style={{ width: `${(r.minutes / whole) * 100}%`, ["--c" as string]: courseVar(r.slot) }} />
        ))}
        {span !== null && !over && <span className="ms-rest" />}
      </div>
      {filled.length > 0 && (
        <div className="legend-row meter-legend">
          {filled.map((r) => (
            <span key={r.key}>
              <i className="dot" style={{ ["--c" as string]: courseVar(r.slot) }} />
              {r.label} {fm(r.minutes)}
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
