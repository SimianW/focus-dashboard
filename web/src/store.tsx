import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type CourseSummary } from "./api";
import { courseOrder, type Session, type Settings } from "./stats";
import { getLanguage, isLanguage, setLanguage } from "./i18n";

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
  setSettings: (s: Settings) => void;
  toast: (msg: string) => void;
};

const Ctx = createContext<Data | null>(null);


// One person's data fits comfortably in memory: load everything once and
// reload after each write so every screen agrees.
export function DataProvider({ children, onToast }: { children: ReactNode; onToast: (m: string) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [settings, setSettings] = useState<Settings>(() => ({ dailyGoalMin: 240, targetRatio: 0.75, language: getLanguage() }));
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, st, c] = await Promise.all([api.sessions(), api.settings(), api.courses()]);
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
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Colours follow all-time minutes, never the current filter.
  const courseSlot = useMemo(() => {
    const slots = new Map(courseOrder(sessions).map((c, i) => [c, i < COURSE_SLOTS ? i + 1 : 0]));
    return (course: string) => slots.get(course) ?? 0;
  }, [sessions]);

  const value = useMemo(
    () => ({ sessions, settings, courses, courseSlot, loaded, error, reload, setSettings, toast: onToast }),
    [sessions, settings, courses, courseSlot, loaded, error, reload, onToast],
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
