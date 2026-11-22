import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type CourseSummary } from "./api";
import { courseOrder, type Session, type Settings } from "./stats";
import { getLanguage, isLanguage, messages, setLanguage } from "./i18n";
import { readDraft, type Draft } from "./draft";
import { reconcile, type Running, type RunningInput } from "./running";
import { openFormBlock, runningSync, type Outcome, type RunningKey } from "./runningSync";

/** Colour slots for courses; past these a course is drawn as "Other". */
export const COURSE_SLOTS = 6;

type Data = {
  sessions: Session[];
  settings: Settings;
  courses: CourseSummary[]; // for suggestions, most-used first
  /** 1..COURSE_SLOTS, or 0 for a course without its own colour. */
  courseSlot: (course: string) => number;
  /** True once a load has succeeded; a failed first load leaves it false. */
  loaded: boolean;
  /** Why the latest load failed; null once one succeeds. */
  error: string | null;
  reload: () => Promise<void>;
  /** The block in progress on the server; undefined until read, or when it could not be. */
  running: Running | null | undefined;
  /** Reads the running block from the server again (another device may have changed it). Never throws. */
  refreshRunning: () => Promise<void>;
  /**
   * Starts, updates (PUT) or, with null, ends (DELETE) the running block,
   * one write at a time; `expected` is the block the caller is editing (null:
   * none). Never throws. When another device changed the block first, shows
   * the server's block and bumps `runningConflicts`; when the write fails
   * otherwise, shows the server's last block again.
   */
  setRunning: (r: RunningInput | null, expected: RunningKey | null) => Promise<Outcome>;
  /** How many writes another device's change refused; a new-entry form re-opens on each. */
  runningConflicts: number;
  /** True when this page sent that block without an answer: pass to currentDraft. */
  undelivered: (k: RunningKey) => boolean;
  /** A new-entry form's own running block as it opens on `form` (see openFormBlock). */
  openRunning: (form: Draft) => ReturnType<typeof openFormBlock>;
  setSettings: (s: Settings) => void;
  toast: (msg: string) => void;
};

const Ctx = createContext<Data | null>(null);

// Set once this browser's pre-upgrade running draft has been offered to the server.
const CARRIED = "focus-running-carried-v1";

const wasCarried = () => {
  try {
    return localStorage.getItem(CARRIED) === "1";
  } catch {
    return true;
  }
};

const markCarried = () => {
  try {
    localStorage.setItem(CARRIED, "1");
  } catch {
    /* private mode: nothing was stored to carry over either */
  }
};

/**
 * The new-entry form as it stands: this browser's draft reconciled with the
 * server's running block. A running draft the server lacks was saved or
 * discarded elsewhere, except while it may never have reached the server:
 * a pre-upgrade block before its carry-over has succeeded (the next load
 * retries it), or a block this page sent without an answer (`undelivered`,
 * e.g. Start on Overview while offline; the form sends it again).
 */
export function currentDraft(running: Running | null | undefined, undelivered: (k: RunningKey) => boolean = () => false): Draft | null {
  const local = readDraft();
  const sent = !!local && undelivered({ date: local.date, start: local.start });
  return reconcile(local, running, { carried: wasCarried() && !sent }).draft;
}

// One person's data fits comfortably in memory: load everything once and
// reload after each write so every screen agrees.
export function DataProvider({ children, onToast }: { children: ReactNode; onToast: (m: string) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [settings, setSettings] = useState<Settings>(() => ({ dailyGoalMin: 240, targetRatio: 0.75, language: getLanguage() }));
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunningState] = useState<Running | null | undefined>(undefined);
  const [runningConflicts, setRunningConflicts] = useState(0);
  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const [sync] = useState(() =>
    runningSync(
      { read: api.running, put: api.putRunning, delete: api.deleteRunning },
      {
        change: setRunningState,
        conflict: () => {
          setRunningConflicts((n) => n + 1);
          toastRef.current(messages().common.runningChanged);
        },
        error: (e) => toastRef.current(e.message),
      },
    ),
  );

  const reload = useCallback(async () => {
    try {
      const [s, st, c, r] = await Promise.all([api.sessions(), api.settings(), api.courses(), sync.read()]);
      if (r !== undefined) {
        // One time per browser: a block started before the running block moved to
        // the server is carried over, so it is not lost.
        const carryOver = r === null && !wasCarried() ? reconcile(readDraft(), null, { carried: false }).carryOver : null;
        // It expects no block: one read since is another device's, not this one.
        if (carryOver) sync.write(carryOver, null).then((o) => o !== "failed" && markCarried());
        else markCarried();
      }
      setSessions(s);
      setSettings(st);
      // The account setting wins over this device's cached language.
      if (isLanguage(st.language)) setLanguage(st.language);
      setCourses(c);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sync]);

  useEffect(() => {
    reload();
  }, [reload]);

  const refreshRunning = useCallback(async () => {
    await sync.read();
  }, [sync]);

  // Back on this tab: another device may have started or ended the block meanwhile.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshRunning();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshRunning]);

  // Colours follow all-time minutes, never the current filter.
  const courseSlot = useMemo(() => {
    const slots = new Map(courseOrder(sessions).map((c, i) => [c, i < COURSE_SLOTS ? i + 1 : 0]));
    return (course: string) => slots.get(course) ?? 0;
  }, [sessions]);

  const setRunning = sync.write;
  const undelivered = sync.undelivered;
  const openRunning = useCallback((form: Draft) => openFormBlock(form, sync), [sync]);

  const value = useMemo(
    () => ({ sessions, settings, courses, courseSlot, loaded, error, reload, running, refreshRunning, setRunning, runningConflicts, undelivered, openRunning, setSettings, toast: onToast }),
    [sessions, settings, courses, courseSlot, loaded, error, reload, running, refreshRunning, setRunning, runningConflicts, undelivered, openRunning, onToast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData outside DataProvider");
  return v;
}

/** CSS colour for a course slot. */
export const courseVar = (slot: number) => (slot ? `var(--course-${slot})` : "var(--course-other)");
