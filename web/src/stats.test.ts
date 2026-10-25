import { describe, expect, it } from "vitest";
import {
  addDays,
  compareWindows,
  dailySeries,
  dailyTrend,
  dateRange,
  dayNumber,
  distribution,
  fromDayNumber,
  goalStreak,
  histogram,
  linearFit,
  localToday,
  meanSessionRatio,
  pearson,
  rollingRatio,
  sessionRatio,
  spanMin,
  weekStart,
  weekday,
  weightedRatio,
  apportion,
  courseMinutesBy,
  courseOrder,
  courseRatioBy,
  courseStats,
  courseTrend,
  normalizeCourses,
  sessionFocus,
  elapsedMin,
  type Session,
} from "./stats";

let nextId = 1;
const s = (date: string, start: string, end: string, focusMin: number, extra: Partial<Session> = {}): Session => ({
  id: nextId++,
  date,
  start,
  end,
  courses: focusMin > 0 ? [{ course: "A", minutes: focusMin }] : [],
  energy: null,
  interruptions: null,
  note: "",
  ...extra,
});

describe("spans", () => {
  it("measures a same-day span", () => {
    expect(spanMin("09:00", "10:30")).toBe(90);
  });
  it("adds 24 h when the session crosses midnight", () => {
    expect(spanMin("23:30", "00:45")).toBe(75);
    expect(spanMin("22:00", "02:00")).toBe(240);
  });
  it("treats end equal to start as a full day", () => {
    expect(spanMin("08:00", "08:00")).toBe(24 * 60);
  });
  it("computes the session ratio across midnight", () => {
    expect(sessionRatio(s("2026-01-01", "23:00", "01:00", 90))).toBeCloseTo(0.75);
  });
});

describe("running block", () => {
  it("counts elapsed time from zero, across midnight", () => {
    expect(elapsedMin("14:05", "14:05")).toBe(0);
    expect(elapsedMin("14:05", "15:10")).toBe(65);
    expect(elapsedMin("23:30", "00:15")).toBe(45);
  });
});

describe("weighted vs unweighted ratios", () => {
  const list = [s("2026-01-01", "09:00", "09:10", 10), s("2026-01-01", "10:00", "11:30", 45)];
  it("weights by time", () => {
    // (10 + 45) / (10 + 90)
    expect(weightedRatio(list)).toBeCloseTo(0.55);
  });
  it("averages session ratios when unweighted", () => {
    // (1 + 0.5) / 2
    expect(meanSessionRatio(list)).toBeCloseTo(0.75);
  });
  it("returns null with no sessions", () => {
    expect(weightedRatio([])).toBeNull();
    expect(meanSessionRatio([])).toBeNull();
  });
});

describe("daily series", () => {
  const list = [
    s("2026-03-01", "09:00", "10:00", 30),
    s("2026-03-01", "14:00", "16:00", 90),
    s("2026-03-03", "23:00", "01:00", 60),
  ];
  const days = dailySeries(list, "2026-03-01", "2026-03-04");

  it("includes every calendar day", () => {
    expect(days.map((d) => d.date)).toEqual(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04"]);
  });
  it("leaves empty days as ratio gaps but zero focus", () => {
    expect(days[1]).toMatchObject({ focus: 0, span: 0, n: 0, ratio: null });
    expect(days[3].ratio).toBeNull();
  });
  it("uses the time-weighted day ratio", () => {
    expect(days[0].ratio).toBeCloseTo(120 / 180);
    expect(days[0].focus).toBe(120);
  });
  it("attributes a cross-midnight session to its start date", () => {
    expect(days[2]).toMatchObject({ focus: 60, span: 120, n: 1 });
  });
});

describe("rolling 7-day ratio", () => {
  it("sums focus and span over trailing calendar days, skipping gaps", () => {
    const list = [
      s("2026-05-01", "09:00", "10:00", 60), // 60/60
      s("2026-05-03", "09:00", "11:00", 60), // 60/120
      s("2026-05-08", "09:00", "10:00", 0), // 0/60
    ];
    const days = dailySeries(list, "2026-05-01", "2026-05-10");
    const roll = rollingRatio(days);
    expect(roll[0]).toBeCloseTo(1);
    expect(roll[2]).toBeCloseTo(120 / 180);
    expect(roll[1]).toBeCloseTo(1); // gap day still has data in its window
    // May 7 window = May 1..7
    expect(roll[6]).toBeCloseTo(120 / 180);
    // May 8 window = May 2..8, May 1 drops out
    expect(roll[7]).toBeCloseTo(60 / 180);
    // May 10 window = May 4..10
    expect(roll[9]).toBeCloseTo(0);
  });
  it("is null when the whole window is empty", () => {
    const days = dailySeries([s("2026-05-01", "09:00", "10:00", 30)], "2026-05-01", "2026-05-09");
    expect(rollingRatio(days)[8]).toBeNull();
  });
  it("is not the mean of daily ratios", () => {
    const list = [s("2026-05-01", "09:00", "09:10", 10), s("2026-05-02", "09:00", "11:00", 0)];
    const days = dailySeries(list, "2026-05-01", "2026-05-02");
    expect(rollingRatio(days)[1]).toBeCloseTo(10 / 130);
  });
});

describe("trend", () => {
  it("fits a perfect line", () => {
    const fit = linearFit([0, 1, 2, 3].map((x) => ({ x, y: 2 + 3 * x })))!;
    expect(fit.slope).toBeCloseTo(3);
    expect(fit.intercept).toBeCloseTo(2);
    expect(fit.r2).toBeCloseTo(1);
  });
  it("reports the slope in percentage points per week and skips gaps by day index", () => {
    // Ratio rises 1 pp per calendar day; every other day is empty.
    const list = [0, 2, 4, 6, 8, 10].map((i) => s(addDays("2026-02-01", i), "09:00", "10:40", 50 + i));
    const days = dailySeries(list, "2026-02-01", "2026-02-11");
    const t = dailyTrend(days)!;
    expect(t.n).toBe(6);
    expect(t.slope).toBeCloseTo(0.01);
    expect(t.ppPerWeek).toBeCloseTo(7);
    expect(t.r2).toBeCloseTo(1);
  });
  it("needs at least five days with data", () => {
    const list = [0, 1, 2, 3].map((i) => s(addDays("2026-02-01", i), "09:00", "10:00", 30 + i));
    expect(dailyTrend(dailySeries(list, "2026-02-01", "2026-02-10"))).toBeNull();
  });
  it("gives a low R² for noise", () => {
    const fit = linearFit([1, 0, 1, 0, 1, 0].map((y, x) => ({ x, y })))!;
    expect(fit.r2).toBeLessThan(0.2);
  });
});

describe("pearson", () => {
  it("is 1 and -1 for perfect relations", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])!.r).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])!.r).toBeCloseTo(-1);
  });
  it("reports n and refuses tiny or constant samples", () => {
    expect(pearson([1, 2, 3], [1, 3, 2])!.n).toBe(3);
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("distribution", () => {
  it("computes mean, median, sample sd and quartiles", () => {
    const d = distribution([1, 2, 3, 4, 5])!;
    expect(d.mean).toBe(3);
    expect(d.median).toBe(3);
    expect(d.sd).toBeCloseTo(Math.sqrt(2.5));
    expect(d.p25).toBe(2);
    expect(d.p75).toBe(4);
  });
  it("interpolates the median for even n", () => {
    expect(distribution([4, 1, 3, 2])!.median).toBe(2.5);
  });
  it("bins ratios and keeps 100% in the last bin", () => {
    expect(histogram([0, 0.05, 0.1, 0.95, 1], 0.1)).toEqual([2, 1, 0, 0, 0, 0, 0, 0, 0, 2]);
  });
});

describe("windows and streaks", () => {
  const today = "2026-04-20";
  const list = [
    s("2026-04-20", "08:00", "12:00", 200),
    s("2026-04-19", "08:00", "13:00", 250),
    s("2026-04-18", "08:00", "13:00", 240),
    s("2026-04-17", "08:00", "10:00", 60),
    s("2026-04-16", "08:00", "13:00", 250),
    s("2026-04-10", "08:00", "10:00", 60),
  ];
  it("counts back from yesterday when today has not met the goal", () => {
    expect(goalStreak(list, 240, today)).toBe(2);
  });
  it("includes today once the goal is met", () => {
    expect(goalStreak([...list, s(today, "14:00", "15:00", 60)], 240, today)).toBe(3);
  });
  it("treats empty days as zero focus, breaking the streak", () => {
    expect(goalStreak([s("2026-04-19", "08:00", "13:00", 250), s("2026-04-17", "08:00", "13:00", 250)], 240, today)).toBe(1);
  });
  it("compares the last 7 days with the 7 before", () => {
    const c = compareWindows(list, today, 7);
    expect(c.current.ratio).toBeCloseTo(1000 / 1260);
    expect(c.previous.ratio).toBeCloseTo(0.5);
    expect(c.delta).toBeCloseTo(1000 / 1260 - 0.5);
    expect(c.current.activeDays).toBe(5);
  });
});

describe("calendar dates", () => {
  it("round-trips day numbers without time-zone drift", () => {
    expect(fromDayNumber(dayNumber("2026-03-29"))).toBe("2026-03-29");
    expect(dayNumber("1970-01-01")).toBe(0);
  });
  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("crosses DST transitions as whole days", () => {
    expect(dateRange("2026-03-28", "2026-03-30")).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    expect(dateRange("2026-10-24", "2026-10-26")).toHaveLength(3);
  });
  it("knows weekdays with Monday first", () => {
    expect(weekday("2026-10-19")).toBe(0); // Monday
    expect(weekday("2026-10-25")).toBe(6); // Sunday
    expect(weekday("1969-12-29")).toBe(0); // before the epoch
    expect(weekStart("2026-10-23")).toBe("2026-10-19");
  });
  it("reads today from local fields, not UTC", () => {
    // 00:30 local on Jan 1 is still Dec 31 in UTC for zones east of UTC.
    expect(localToday(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("courses", () => {
  // 120 min block, 60 focused: A 40, B 20 (ratio 0.5).
  const b1 = s("2026-04-01", "09:00", "11:00", 0, { courses: [{ course: "A", minutes: 40 }, { course: "B", minutes: 20 }] });
  // 60 min block, all A (ratio 1).
  const b2 = s("2026-04-02", "09:00", "10:00", 0, { courses: [{ course: "A", minutes: 60 }] });
  // 90 min block, nothing focused.
  const b3 = s("2026-04-02", "14:00", "15:30", 0);

  it("sums course minutes as the block's focus", () => {
    expect(sessionFocus(b1)).toBe(60);
    expect(sessionFocus(b3)).toBe(0);
    expect(weightedRatio([b1, b2, b3])).toBeCloseTo(120 / 270);
  });

  it("apportions a block's span by course minutes", () => {
    expect(apportion(b1)).toEqual([
      { course: "A", minutes: 40, span: 80 },
      { course: "B", minutes: 20, span: 40 },
    ]);
    expect(apportion(b3)).toEqual([]);
  });

  it("gives every course in a block that block's ratio", () => {
    const { courses } = courseStats([b1]);
    expect(courses.map((c) => c.ratio)).toEqual([0.5, 0.5]);
  });

  it("computes a course ratio as Σminutes / Σattributed span", () => {
    const { courses, unattributedSpan } = courseStats([b1, b2, b3]);
    const a = courses.find((c) => c.course === "A")!;
    // (40 + 60) / (80 + 60)
    expect(a.ratio).toBeCloseTo(100 / 140);
    expect(a.blocks).toBe(2);
    expect(a.days).toBe(2);
    expect(a.lastDate).toBe("2026-04-02");
    expect(a.share).toBeCloseTo(100 / 120);
    expect(courses[1]).toMatchObject({ course: "B", minutes: 20, span: 40, blocks: 1 });
    // The zero-focus block cannot be attributed to any course.
    expect(unattributedSpan).toBe(90);
  });

  it("is the span-weighted (minutes-weighted harmonic) mean of block ratios", () => {
    const a = courseStats([b1, b2]).courses.find((c) => c.course === "A")!;
    // Like the day ratio, time-weighted: 100/140 ≈ 0.714, not the arithmetic
    // minutes-weighted mean (0.5·40 + 1·60) / 100 = 0.8.
    const w = [
      { ratio: 0.5, minutes: 40 },
      { ratio: 1, minutes: 60 },
    ];
    const harmonic = w.reduce((x, b) => x + b.minutes, 0) / w.reduce((x, b) => x + b.minutes / b.ratio, 0);
    expect(a.ratio).toBeCloseTo(harmonic);
  });

  it("attributed spans plus unattributed span add up to the total span", () => {
    const { courses, unattributedSpan } = courseStats([b1, b2, b3]);
    expect(courses.reduce((x, c) => x + c.span, 0) + unattributedSpan).toBeCloseTo(270);
  });

  it("orders courses by all-time minutes for stable colours", () => {
    expect(courseOrder([b1, b2])).toEqual(["A", "B"]);
    expect(courseOrder([])).toEqual([]);
  });

  it("totals minutes per course and period", () => {
    const m = courseMinutesBy([b1, b2, b3], (x) => x.date, ["2026-04-01", "2026-04-02"], ["A", "B"]);
    expect(m.get("A")).toEqual([40, 60]);
    expect(m.get("B")).toEqual([20, 0]);
  });

  it("gives a per-period course ratio with gaps", () => {
    expect(courseRatioBy([b1, b2], "B", (x) => x.date, ["2026-04-01", "2026-04-02"])).toEqual([0.5, null]);
  });

  it("fits a per-course trend only with enough days", () => {
    const days = ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05"];
    // A's daily ratio rises 0.5, 0.55, … 0.7 alongside B.
    const list = days.map((d, i) =>
      s(d, "09:00", "11:00", 0, {
        courses: [
          { course: "A", minutes: Math.round(60 * (0.5 + i * 0.05)) },
          { course: "B", minutes: Math.round(60 * (0.5 + i * 0.05)) },
        ],
      }),
    );
    const t = courseTrend(list, "A")!;
    expect(t.ppPerWeek).toBeCloseTo(35, 0);
    expect(t.n).toBe(5);
    expect(courseTrend(list.slice(1), "A")).toBeNull();
  });

  it("normalizes typed course rows", () => {
    expect(
      normalizeCourses([
        { course: " A ", minutes: 30 },
        { course: "A", minutes: 15 },
        { course: "", minutes: 20 },
        { course: "B", minutes: 0 },
      ]),
    ).toEqual([{ course: "A", minutes: 45 }]);
  });
});
