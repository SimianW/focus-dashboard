import { describe, expect, it } from "vitest";
import { DICTIONARIES, isLanguage } from "./index";
import { en, plural } from "./en";
import { zh } from "./zh";
import { translateError } from "../api";
import { byCourse, byHour, byWeekday, interruptionsVsRatio, periods } from "../insights";
import type { Session } from "../stats";

/** Every key path with the kind of value behind it ("string", "function", "object"…). */
function shape(obj: unknown, prefix = ""): string[] {
  if (Array.isArray(obj)) return [`${prefix}:array(${obj.length})`];
  if (obj && typeof obj === "object")
    return Object.entries(obj)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
  return [`${prefix}:${typeof obj}`];
}

describe("dictionaries", () => {
  it("have exactly the same keys, kinds of value and list lengths", () => {
    // The type checker already enforces this (zh is typed as Messages); this
    // guards against casts and keeps the guarantee visible.
    expect(shape(zh)).toEqual(shape(en));
    expect(Object.keys(DICTIONARIES).sort()).toEqual(["en", "zh"]);
  });
  it("have no empty strings", () => {
    for (const d of [en, zh]) {
      const empty = shape(d).filter((p) => p.endsWith(":string")).map((p) => p.split(":")[0]).filter((path) => {
        const v = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], d);
        return v === "";
      });
      expect(empty).toEqual([]);
    }
  });
  it("label each language in its own language", () => {
    expect(en.label).toBe("English");
    expect(zh.label).toBe("中文");
    expect(isLanguage("zh")).toBe(true);
    expect(isLanguage("fr")).toBe(false);
  });
});

describe("English formatting", () => {
  it("pluralises", () => {
    expect(plural(1, "block")).toBe("1 block");
    expect(plural(3, "block")).toBe("3 blocks");
    expect(plural(0, "day")).toBe("0 days");
    expect(en.fmt.blocks(1)).toBe("1 block");
    expect(en.fmt.days(2)).toBe("2 days");
  });
  it("writes durations", () => {
    expect(en.fmt.minutes(0)).toBe("0 min");
    expect(en.fmt.minutes(45)).toBe("45 min");
    expect(en.fmt.minutes(60)).toBe("1 hr");
    expect(en.fmt.minutes(65)).toBe("1 hr 5 min");
    expect(en.fmt.minutes(124.6)).toBe("2 hr 5 min");
    expect(en.fmt.hours(12.34)).toBe("12.3 hr");
  });
  it("writes dates and months", () => {
    expect(en.fmt.date("2026-10-24")).toBe("Sat, Oct 24");
    expect(en.fmt.date("2026-10-19", false)).toBe("Oct 19");
    expect(en.fmt.month("2026-10")).toBe("October 2026");
    expect(en.fmt.weekdays[0]).toBe("Mon");
  });
  it("writes percentage-point changes", () => {
    expect(en.fmt.pp(0.021)).toBe("+2.1 pts");
    expect(en.fmt.pp(-0.1)).toBe("−10.0 pts");
    expect(en.fmt.pp(0)).toBe("±0.0 pts");
    expect(en.fmt.pp(null)).toBe("—");
  });
  it("describes a running block", () => {
    expect(en.common.running(0)).toBe("Studying, just started");
    expect(en.common.running(65)).toBe("Studying for 1 hr 5 min");
  });
  it("builds sentences with plurals", () => {
    expect(en.overview.filterNote(1, 1)).toBe("1 day logged, 1 block");
    expect(en.records.dayStats(2, "1 hr", "80%")).toBe("2 blocks, 1 hr focused, **80%**");
    expect(en.session.meta("50 min", "10 min", 4, 1)).toBe("50 min focused, 10 min distracted or resting, energy 4, 1 interruption");
    expect(en.session.meta("1 hr", null, null, null)).toBe("1 hr focused");
    expect(en.overview.trendNeed(5, 1)).toBe("The trend line appears once 5 days are logged; so far there is 1 day.");
  });
});

describe("Chinese formatting", () => {
  it("keeps the original formats", () => {
    expect(zh.fmt.minutes(45)).toBe("45 分钟");
    expect(zh.fmt.minutes(60)).toBe("1 小时");
    expect(zh.fmt.minutes(65)).toBe("1 小时 5 分");
    expect(zh.fmt.date("2026-10-24")).toBe("10 月 24 日 周六");
    expect(zh.fmt.date("2026-10-24", false)).toBe("10 月 24 日");
    expect(zh.fmt.month("2026-10")).toBe("2026 年 10 月");
    expect(zh.fmt.pp(0.021)).toBe("+2.1 个百分点");
    expect(zh.fmt.blocks(3)).toBe("3 段");
    expect(zh.common.running(0)).toBe("学习中，刚开始");
    expect(zh.common.running(65)).toBe("学习中，已经 1 小时 5 分");
  });
});

describe("server errors", () => {
  it("read as sentences in English", () => {
    expect(translateError("wrong password", en.errors)).toBe("Wrong password.");
    expect(translateError("minutes for CS370 must be a positive integer", en.errors)).toBe("Minutes for CS370 must be a whole number above 0.");
    expect(translateError("course time (90 min) cannot exceed the session span (60 min)", en.errors)).toBe(
      "The courses add up to 90 minutes, more than the block itself (60 minutes).",
    );
    expect(translateError("row 3: date must be YYYY-MM-DD", en.errors)).toBe("Record 3: Dates must look like YYYY-MM-DD.");
    expect(translateError("language must be one of en, zh", en.errors)).toBe("That language isn’t supported.");
    expect(translateError("something new", en.errors)).toBe("Something new");
  });
  it("are translated in Chinese", () => {
    expect(translateError("wrong password", zh.errors)).toBe("密码不对");
    expect(translateError("minutes for CS370 must be a positive integer", zh.errors)).toBe("CS370 的分钟数应为正整数");
    expect(translateError("course time (90 min) cannot exceed the session span (60 min)", zh.errors)).toBe("课程时间合计 90 分钟，超过了这段时间（60 分钟）");
    expect(translateError("row 3: a session can list at most 10 courses", zh.errors)).toBe("第 3 条：一次学习最多记 10 门课程");
    expect(translateError("something new", zh.errors)).toBe("something new");
  });
});

// ---------- insights in both languages ----------

let id = 1;
const block = (date: string, start: string, end: string, courses: [string, number][], extra: Partial<Session> = {}): Session => ({
  id: id++,
  date,
  start,
  end,
  courses: courses.map(([course, minutes]) => ({ course, minutes })),
  energy: null,
  interruptions: null,
  note: "",
  ...extra,
});

// Two weeks of morning blocks (90% focus) and evening blocks (50% focus).
const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"];
const sessions = days.flatMap((d, i) => [
  block(d, "09:00", "10:00", [["Maths", 54]], { interruptions: 0 }),
  block(d, "20:00", "21:00", [["History", 30]], { interruptions: i % 3 }),
]);

describe("insights", () => {
  it("name the best starting time in both languages", () => {
    expect(byHour(sessions, en)!.takeaway).toBe("Blocks started in the morning between 9:00 and 11:00 have the highest focus rate (90% over 8 blocks), against 70% overall.");
    expect(byHour(sessions, zh)!.takeaway).toBe("上午 9–11 点开始的学习专注率最高（90%，8 次），整体为 70%。");
    expect(byHour(sessions, en)!.bars[0].label).toBe("9:00");
  });
  it("compare weekdays with natural plurals", () => {
    const wk = [...sessions, block("2026-10-06", "12:00", "13:00", [["Maths", 60]]), block("2026-10-13", "12:00", "13:00", [["Maths", 60]])];
    expect(byWeekday(wk, en)!.takeaway).toBe("Focus is highest on Tuesdays (80%) and lowest on Mondays (70%).");
    expect(byWeekday(wk, zh)!.takeaway).toBe("周二专注率最高（80%），周一最低（70%）。");
    expect(byWeekday(sessions, zh)!.bars[0].label).toBe("周一");
  });
  it("only state a per-interruption effect when there is a relationship", () => {
    const en1 = interruptionsVsRatio(sessions, en)!.takeaway;
    expect(en1).toMatch(/^Interruptions and focus rate show a (weak|moderate|strong) negative relationship \(r = −0\.\d\d, n = 16\): each extra interruption lowers the focus rate by \d+\.\d points on average\.$/);
    const zh1 = interruptionsVsRatio(sessions, zh)!.takeaway;
    expect(zh1).toMatch(/^打断与专注率(弱|中等|较强)负相关（r = −0\.\d\d，n = 16），每多 1 次打断，专注率平均下降 \d+\.\d 个百分点。$/);
  });
  it("summarise the last period against the one before", () => {
    expect(periods(sessions, "week", en)!.takeaway).toBe("The week of Oct 12 you focused for 5 hr 36 min at a 70% focus rate, ±0.0 pts on the week before.");
    expect(periods(sessions, "week", zh)!.takeaway).toBe("最近一周（10/12 周）专注 5 小时 36 分，专注率 70%，比前一周 ±0.0 个百分点。");
  });
  it("compare courses, keeping the course names untouched", () => {
    expect(byCourse(sessions, en)!.takeaway).toBe(
      "Maths took the most time (7 hr 12 min, 64%). You focus best on Maths (90%) and drift most on History (50%).",
    );
    expect(byCourse(sessions, zh)!.takeaway).toBe("Maths用时最多（7 小时 12 分，占 64%）。Maths最专注（90%），History最容易分心（50%）。");
    const single = [block("2026-10-05", "09:00", "10:00", [["未分类", 30]])];
    expect(byCourse(single, en)!.takeaway).toBe("未分类 took the most time (30 min, 100%). Log more courses to compare them.");
  });
});
