import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { courseVar, useData } from "../store";
import { link, navigate } from "../router";
import { clearDraft, emptyDraft, isDirty, readDraft, rowKey, writeDraft, type Draft, type DraftRow } from "../draft";
import { prefersReducedMotion } from "../motion";
import {
  addDays,
  daysBetween,
  elapsedMin,
  formatElapsed,
  formatDateCn,
  formatMinutes,
  formatPct,
  localTime,
  localToday,
  normalizeCourses,
  spanMin,
  TIME_RE,
  toMinutes,
  type SessionInput,
} from "../stats";

const STEP = 15;
const MAX_COURSES = 10;

const parseMin = (v: string) => (v.trim() === "" ? null : Number(v));

export function Entry({ id, date, startNow }: { id?: number; date?: string; startNow?: boolean }) {
  const { sessions, courses, courseSlot, loaded, reload, toast } = useData();
  const editing = id !== undefined ? sessions.find((s) => s.id === id) : undefined;
  const [form, setForm] = useState<Draft>(() => {
    if (id !== undefined) return emptyDraft();
    const d = readDraft();
    // "开始学习" from the overview: stamp the start unless a block is already open.
    if (startNow && !d?.start) return { ...(d ?? emptyDraft()), date: localToday(), start: localTime(), end: "" };
    return d ? (date ? { ...d, date } : d) : emptyDraft(date);
  });

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
    if (id === undefined) writeDraft(form);
  }, [form, id]);

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
    if (!form.date) return "请选择日期";
    if (!timesOk) return "请填写开始和结束时间";
    if (span! > 16 * 60) return `这段时间有 ${formatMinutes(span!)}，超过了 16 小时，检查一下开始和结束时间`;
    for (const r of rows) {
      const m = parseMin(r.minutes);
      if (m === null || !Number.isInteger(m) || m <= 0) return `给 ${r.course} 填上分钟数（正整数），或者移除它`;
    }
    if (rows.length > MAX_COURSES) return `一次最多记 ${MAX_COURSES} 门课程`;
    if (over) return `课程合计 ${formatMinutes(focus)}，比这段时间多了 ${formatMinutes(-left!)}`;
    const n = form.interruptions === "" ? null : Number(form.interruptions);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 999)) return "打断次数应为 0–999 的整数";
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
        clearDraft();
      }
      await reload();
      toast(id !== undefined ? "已保存修改" : "已记下这段学习");
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
      toast("已删除这条记录");
      navigate(`/day/${form.date}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (id !== undefined && loaded && !editing) {
    return (
      <div className="narrow">
        <h1 className="page-title">找不到这条记录</h1>
        <p className="page-sub">它可能已经被删除了。</p>
        <p style={{ marginTop: 20 }}>
          <a className="btn" {...link("/records")}>
            查看全部记录
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
          <h1 className="page-title">{isNew ? "记一段学习" : "修改记录"}</h1>
          <p className="page-sub">{isNew ? "什么时候开始、什么时候结束，中间学了哪几门课。" : formatDateCn(form.date)}</p>
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
            清空
          </button>
        )}
      </div>

      {isNew && <Stamp form={form} onStart={() => setForm((f) => ({ ...f, date: today, start: localTime(), end: "" }))} onEnd={() => set("end", localTime())} />}

      <section className="step reveal" style={{ ["--i" as string]: 1 }} aria-labelledby="step-time">
        <h2 className="step-title" id="step-time">
          时间段
          <small>{form.date ? formatDateCn(form.date) : "选一天"}</small>
        </h2>
        <div className="day-pick" role="group" aria-label="日期">
          <button type="button" className="chip" aria-pressed={form.date === today} onClick={() => set("date", today)}>
            今天
          </button>
          <button type="button" className="chip" aria-pressed={form.date === yesterday} onClick={() => set("date", yesterday)}>
            昨天
          </button>
          <input type="date" aria-label="其他日期" value={form.date} max={today} onChange={(e) => set("date", e.target.value)} required />
        </div>
        <div className="time-pair">
          <TimeTile label="开始" value={form.start} onChange={(v) => set("start", v)} />
          <TimeTile
            label="结束"
            value={form.end}
            onChange={(v) => set("end", v)}
            hint={overnight ? "跨过午夜，算到次日" : span !== null ? `共 ${formatMinutes(span)}` : undefined}
            invalid={span !== null && span > 16 * 60}
          />
        </div>
      </section>

      <section className="step reveal" style={{ ["--i" as string]: 2 }} aria-labelledby="step-courses">
        <h2 className="step-title" id="step-courses">
          学了什么
          <small>{rows.length ? `${rows.length} 门` : "点课程添加，大概的分钟数就行"}</small>
        </h2>

        <div className="chips course-chips" role="group" aria-label="课程">
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
              <PlusIcon /> 新课程
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
              placeholder="课程名，例如 CS370"
              aria-label="新课程名"
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
              添加
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              取消
            </button>
          </div>
        )}

        {form.rows.length > 0 && (
          <ul className="course-rows">
            {form.rows.map((r, i) => {
              const m = parseMin(r.minutes);
              // Offer "补满" where it helps: on empty rows, else on the last row.
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
                        <span className="stepper" role="group" aria-label={`${r.course} 的分钟数`}>
                          <button type="button" aria-label={`${r.course} 减 ${STEP} 分钟`} onClick={() => setRow(r.key, String(Math.max(0, (m ?? 0) - STEP) || ""))}>
                            <MinusIcon />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={5}
                            placeholder="0"
                            aria-label={`${r.course} 分钟`}
                            aria-invalid={bad || undefined}
                            value={r.minutes}
                            onChange={(e) => setRow(r.key, e.target.value)}
                          />
                          <span className="unit">分</span>
                          <button type="button" aria-label={`${r.course} 加 ${STEP} 分钟`} onClick={() => setRow(r.key, String((m ?? 0) + STEP))}>
                            <PlusIcon />
                          </button>
                        </span>
                        {offerFill && (
                          <button type="button" className="btn fill-btn" onClick={() => setRow(r.key, String((m && m > 0 ? m : 0) + left))}>
                            补满 +{left}
                          </button>
                        )}
                      </span>
                      <button type="button" className="cr-remove" aria-label={`移除 ${r.course}`} onClick={() => removeRow(r.key)}>
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
            更多<small>精力、打断、备注，都可以不填</small>
          </span>
          <ChevronIcon />
        </summary>
        <div className="more-body">
          <div className="field">
            <span className="field-label" id="energy-label">
              开始前的精力
            </span>
            <div className="segmented" role="group" aria-labelledby="energy-label">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} aria-pressed={form.energy === n} onClick={() => set("energy", form.energy === n ? null : n)}>
                  {n}
                </button>
              ))}
            </div>
            <span className="field-hint">1 很累，5 精力充沛。再点一次取消。</span>
          </div>

          <div className="field">
            <span className="field-label" id="intr-label">
              被打断次数
            </span>
            <span className="stepper stepper-wide" role="group" aria-labelledby="intr-label">
              <button type="button" aria-label="减一" onClick={() => set("interruptions", String(Math.max(0, (Number(form.interruptions) || 0) - 1)))}>
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
              <button type="button" aria-label="加一" onClick={() => set("interruptions", String((Number(form.interruptions) || 0) + 1))}>
                <PlusIcon />
              </button>
            </span>
          </div>

          <label className="field">
            <span className="field-label">备注</span>
            <textarea rows={2} value={form.note} maxLength={1000} placeholder="学了哪一章，哪里分心了" onChange={(e) => set("note", e.target.value)} />
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
            "填好开始和结束时间"
          ) : (
            <>
              专注 <b>{formatMinutes(focus)}</b>
              {left !== null && left > 0 && (
                <>
                  ，休息 <b>{formatMinutes(left)}</b>
                </>
              )}
              {ratio !== null && (
                <>
                  ，<b>{formatPct(ratio)}</b>
                </>
              )}
            </>
          )}
        </span>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "正在保存…" : isNew ? "保存" : "保存修改"}
        </button>
      </div>

      {!isNew && (
        <div className="entry-foot">
          <a className="back" {...link(`/day/${form.date}`)}>
            返回这一天
          </a>
          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={remove} onBlur={() => setConfirmDelete(false)}>
            {confirmDelete ? "确认删除" : "删除这条记录"}
          </button>
        </div>
      )}
    </form>
  );
}

/** One tap when you sit down, one when you stop; the start waits in the draft. */
function Stamp({ form, onStart, onEnd }: { form: Draft; onStart: () => void; onEnd: () => void }) {
  const today = localToday();
  const running = TIME_RE.test(form.start) && !form.end && (form.date === today || daysBetween(form.date, today) === 1);
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
          <strong>学习中，{formatElapsed(elapsed)}</strong>
          <span>{form.start} 开始。学完点“结束”，再记下学了哪些课。</span>
        </span>
        <button type="button" className="btn btn-accent" onClick={onEnd}>
          结束
        </button>
      </section>
    );
  }
  if (form.start) return null;
  return (
    <section className="stamp reveal">
      <span className="stamp-text">
        <strong>现在开始学习？</strong>
        <span>点一下记下开始时间，学完回来点结束。可以关掉页面。</span>
      </span>
      <button type="button" className="btn btn-accent" onClick={onStart}>
        开始学习
      </button>
    </section>
  );
}

function TimeTile({ label, value, onChange, hint, invalid }: { label: string; value: string; onChange: (v: string) => void; hint?: string; invalid?: boolean }) {
  const id = `t-${label}`;
  return (
    <div className="time-tile">
      <div className="time-tile-head">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <button type="button" className="btn btn-sm now" onClick={() => onChange(localTime())} aria-label={`${label}时间设为现在`}>
          现在
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
  const over = left !== null && left < 0;
  // When over, scale to the course total so the bar still shows the split.
  const whole = span === null ? Math.max(focus, 1) : Math.max(span, focus);
  const filled = rows.filter((r) => r.minutes > 0);
  return (
    <section className="meter reveal" style={{ ["--i" as string]: 3 }} data-over={over ? "" : undefined} aria-live="polite" aria-label="这段学习的概况">
      <div className="meter-top">
        <div>
          <span className={`meter-ratio fig${ratio === null ? " is-empty" : ""}`}>{ratio === null ? "—" : formatPct(ratio)}</span>
          <span className="meter-ratio-label">专注率</span>
        </div>
        <dl className="meter-facts">
          <dt>时长</dt>
          <dd>{span === null ? "—" : formatMinutes(span)}</dd>
          <dt>专注</dt>
          <dd>{formatMinutes(focus)}</dd>
          <dt>分心或休息</dt>
          <dd>{left === null || left < 0 ? "—" : formatMinutes(left)}</dd>
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
              {r.course} {formatMinutes(r.minutes)}
            </span>
          ))}
          {left !== null && left > 0 && (
            <span>
              <i className="dot" style={{ ["--c" as string]: "var(--unfocused)" }} />
              分心或休息
            </span>
          )}
        </div>
      )}
      {over && <p className="meter-note">课程合计比这段时间多了 {formatMinutes(-left!)}，减一点或者把结束时间往后调。</p>}
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
