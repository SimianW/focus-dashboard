import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export type Session = {
  id: number;
  date: string; // YYYY-MM-DD, the day the session started
  start: string; // HH:MM
  end: string; // HH:MM, earlier than start means the session crossed midnight
  courses: CourseTime[]; // what was studied; the minutes sum to the focus time
  energy: number | null; // 1–5 self-rating before starting
  interruptions: number | null;
  note: string;
};

// A life-os task as it was when picked; life-os may rename or delete it later.
export type Task = { id: string; title: string; subject: string | null };

// Roughly how long one course was actually studied inside a session. A row
// picked from life-os carries its task; a typed row has task null. The course
// is what per-course statistics group by.
export type CourseTime = { course: string; minutes: number; task: Task | null };

// A row without minutes: what a running block is being spent on.
export type Entry = { course: string; task: Task | null };

export type SessionInput = Omit<Session, "id">;

// The study block in progress, at most one. Its entry is null until picked.
export type Running = { date: string; start: string; entry: Entry | null };

/** Which running block a write expects: its date and start. */
export type RunningKey = { date: string; start: string };

export type Settings = {
  dailyGoalMin: number; // target focus minutes per day
  targetRatio: number; // target focus ratio, 0–1
  language: Language;
};

export const LANGUAGES = ["en", "zh"] as const;
export type Language = (typeof LANGUAGES)[number];

const DEFAULT_SETTINGS: Settings = { dailyGoalMin: 240, targetRatio: 0.75, language: "en" };

// Each entry upgrades the schema by one version; never edit a shipped entry.
export const MIGRATIONS = [
  `CREATE TABLE sessions (
     id INTEGER PRIMARY KEY,
     date TEXT NOT NULL,
     start TEXT NOT NULL,
     end TEXT NOT NULL,
     focus_min INTEGER NOT NULL,
     category TEXT NOT NULL DEFAULT '',
     energy INTEGER,
     interruptions INTEGER,
     note TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX sessions_date ON sessions (date, start);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // A session's focus time is now split across courses.
  `CREATE TABLE session_courses (
     session_id INTEGER NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     course TEXT NOT NULL,
     minutes INTEGER NOT NULL,
     PRIMARY KEY (session_id, position)
   );
   CREATE INDEX session_courses_course ON session_courses (course);
   INSERT INTO session_courses (session_id, position, course, minutes)
     SELECT id, 0, CASE WHEN category = '' THEN '未分类' ELSE category END, focus_min
     FROM sessions WHERE focus_min > 0;
   ALTER TABLE sessions DROP COLUMN focus_min;
   ALTER TABLE sessions DROP COLUMN category;`,
  // A row can be for a life-os task, kept as it was when picked. The running
  // block moves from the browser into the database.
  `ALTER TABLE session_courses ADD COLUMN task_id TEXT;
   ALTER TABLE session_courses ADD COLUMN task_title TEXT;
   ALTER TABLE session_courses ADD COLUMN task_subject TEXT;
   CREATE TABLE running (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     date TEXT NOT NULL,
     start TEXT NOT NULL,
     course TEXT,
     task_id TEXT,
     task_title TEXT,
     task_subject TEXT
   );`,
];

export function openDb(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "focus.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return db;
}

type Row = {
  id: number;
  date: string;
  start: string;
  end: string;
  energy: number | null;
  interruptions: number | null;
  note: string;
};

// A row of session_courses or running, with the task spread over columns.
type TaskColumns = { task_id: string | null; task_title: string | null; task_subject: string | null };

const toTask = (r: TaskColumns): Task | null =>
  r.task_id === null ? null : { id: r.task_id, title: r.task_title ?? "", subject: r.task_subject };

const taskColumns = (task: Task | null) => [task?.id ?? null, task?.title ?? null, task?.subject ?? null] as const;

type CourseRow = TaskColumns & { session_id: number; course: string; minutes: number };

const toCourseTime = (r: CourseRow): CourseTime => ({ course: r.course, minutes: r.minutes, task: toTask(r) });

const toSession = (r: Row, courses: CourseTime[]): Session => ({
  id: r.id,
  date: r.date,
  start: r.start,
  end: r.end,
  courses,
  energy: r.energy,
  interruptions: r.interruptions,
  note: r.note,
});

export function createStore(db: DatabaseSync) {
  const list = db.prepare(
    "SELECT * FROM sessions WHERE date >= ? AND date <= ? ORDER BY date, start, id",
  );
  const listCourses = db.prepare(
    `SELECT c.session_id, c.course, c.minutes, c.task_id, c.task_title, c.task_subject FROM session_courses c JOIN sessions s ON s.id = c.session_id
     WHERE s.date >= ? AND s.date <= ? ORDER BY c.session_id, c.position`,
  );
  const get = db.prepare("SELECT * FROM sessions WHERE id = ?");
  const getCourses = db.prepare(
    "SELECT course, minutes, task_id, task_title, task_subject FROM session_courses WHERE session_id = ? ORDER BY position",
  );
  const insert = db.prepare(
    `INSERT INTO sessions (date, start, end, energy, interruptions, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE sessions SET date = ?, start = ?, end = ?, energy = ?, interruptions = ?, note = ?,
       updated_at = datetime('now')
     WHERE id = ?`,
  );
  const remove = db.prepare("DELETE FROM sessions WHERE id = ?");
  const insertCourse = db.prepare(
    `INSERT INTO session_courses (session_id, position, course, minutes, task_id, task_title, task_subject)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const clearCourses = db.prepare("DELETE FROM session_courses WHERE session_id = ?");
  // Renaming onto a course the session already has merges the two entries,
  // but only typed rows (task_id NULL) merge: a task row keeps its own row.
  const mergeCourse = db.prepare(
    `UPDATE session_courses AS t SET minutes = t.minutes + f.minutes
     FROM session_courses AS f
     WHERE t.course = ?2 AND f.course = ?1 AND f.session_id = t.session_id
       AND t.task_id IS NULL AND f.task_id IS NULL`,
  );
  const dropMerged = db.prepare(
    `DELETE FROM session_courses WHERE course = ?1 AND task_id IS NULL
     AND session_id IN (SELECT session_id FROM session_courses WHERE course = ?2 AND task_id IS NULL)`,
  );
  // Renames typed and task rows alike; the task_* columns stay as picked.
  const renameCourse = db.prepare("UPDATE session_courses SET course = ?2 WHERE course = ?1");
  const courseSummary = db.prepare(
    `SELECT course, COUNT(DISTINCT c.session_id) AS sessions, SUM(minutes) AS minutes, MAX(s.date) AS lastDate
     FROM session_courses c JOIN sessions s ON s.id = c.session_id
     GROUP BY course ORDER BY sessions DESC, course`,
  );
  const readRunning = db.prepare("SELECT * FROM running WHERE id = 1");
  const writeRunning = db.prepare(
    `INSERT OR REPLACE INTO running (id, date, start, course, task_id, task_title, task_subject)
     VALUES (1, ?, ?, ?, ?, ?, ?)`,
  );
  // Saving the running block as a session ends it.
  const endRunning = db.prepare("DELETE FROM running WHERE date = ? AND start = ?");
  const readSettings = db.prepare("SELECT key, value FROM settings");
  const writeSetting = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  );

  const values = (s: SessionInput) => [s.date, s.start, s.end, s.energy, s.interruptions, s.note] as const;

  const transaction = <T>(fn: () => T): T => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };

  const writeCourses = (id: number | bigint, courses: CourseTime[]) => {
    clearCourses.run(id);
    courses.forEach((c, i) => insertCourse.run(id, i, c.course, c.minutes, ...taskColumns(c.task)));
  };

  const read = (id: number | bigint) => {
    const row = get.get(id) as Row | undefined;
    return row ? toSession(row, (getCourses.all(id) as CourseRow[]).map(toCourseTime)) : null;
  };

  const insertSession = (s: SessionInput) => {
    const { lastInsertRowid } = insert.run(...values(s));
    writeCourses(lastInsertRowid, s.courses);
    return lastInsertRowid;
  };

  return {
    listSessions(from = "0000-01-01", to = "9999-12-31") {
      const courses = new Map<number, CourseTime[]>();
      for (const c of listCourses.all(from, to) as CourseRow[]) {
        const list = courses.get(c.session_id) ?? [];
        list.push(toCourseTime(c));
        courses.set(c.session_id, list);
      }
      return (list.all(from, to) as Row[]).map((r) => toSession(r, courses.get(r.id) ?? []));
    },
    // A session with the running block's date and start is that block saved, so it ends.
    createSession(s: SessionInput) {
      return read(
        transaction(() => {
          const id = insertSession(s);
          endRunning.run(s.date, s.start);
          return id;
        }),
      )!;
    },
    updateSession(id: number, s: SessionInput) {
      const changed = transaction(() => {
        if (!update.run(...values(s), id).changes) return false;
        writeCourses(id, s.courses);
        return true;
      });
      return changed ? read(id) : null;
    },
    deleteSession(id: number) {
      return remove.run(id).changes > 0;
    },
    importSessions(sessions: SessionInput[]) {
      transaction(() => sessions.forEach(insertSession));
      return sessions.length;
    },
    // Distinct course names, most used first.
    listCourses() {
      return courseSummary.all() as { course: string; sessions: number; minutes: number; lastDate: string }[];
    },
    renameCourse(from: string, to: string) {
      // Merging a course into itself would add each row to itself, then delete it.
      if (from === to) return 0;
      return transaction(() => {
        mergeCourse.run(from, to);
        const merged = dropMerged.run(from, to).changes;
        return Number(merged) + Number(renameCourse.run(from, to).changes);
      });
    },
    getRunning(): Running | null {
      const r = readRunning.get() as (TaskColumns & { date: string; start: string; course: string | null }) | undefined;
      if (!r) return null;
      return { date: r.date, start: r.start, entry: r.course === null ? null : { course: r.course, task: toTask(r) } };
    },
    // Compare-and-set: writes only when the stored block (null: none) is
    // `expected`, so a stale view never overwrites or ends a newer block.
    // Answers whether it wrote, and the block stored afterwards.
    setRunning(r: Running, expected: RunningKey | null) {
      return transaction(() => {
        if (!isRunningKey(this.getRunning(), expected)) return { ok: false, running: this.getRunning() };
        writeRunning.run(r.date, r.start, r.entry?.course ?? null, ...taskColumns(r.entry?.task ?? null));
        return { ok: true, running: this.getRunning() };
      });
    },
    // Ends the block with this date and start; true also when none is stored.
    clearRunning(block: RunningKey) {
      return transaction(() => {
        const stored = this.getRunning();
        if (stored && !isRunningKey(stored, block)) return { ok: false, running: stored };
        endRunning.run(block.date, block.start);
        return { ok: true, running: null };
      });
    },
    getSettings(): Settings {
      const stored = Object.fromEntries(
        (readSettings.all() as { key: string; value: string }[]).map((r) => [r.key, JSON.parse(r.value)]),
      );
      return { ...DEFAULT_SETTINGS, ...stored };
    },
    // Keys left out keep their stored value.
    saveSettings(s: Partial<Settings>) {
      for (const [k, v] of Object.entries(s)) if (v !== undefined) writeSetting.run(k, JSON.stringify(v));
      return this.getSettings();
    },
  };
}

export type Store = ReturnType<typeof createStore>;

const isRunningKey = (r: RunningKey | null, key: RunningKey | null) =>
  r === null || key === null ? r === key : r.date === key.date && r.start === key.start;
