// English, the source of truth: every other dictionary must have exactly
// these keys with the same signatures (see Messages in ./index.ts).
//
// Strings marked "rich" may wrap figures in **…** to set them bold; see
// <Rich>. Course names never go inside the markers.
import { formatPct as pct, weekday } from "../stats";

/** "1 block", "3 blocks". */
export const plural = (n: number, one: string, other = `${one}s`) => `${n} ${n === 1 ? one : other}`;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_PLURAL = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "45 min", "1 hr 5 min", "2 hr". */
function minutes(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

/** A difference of two ratios in percentage points: "+2.1 pts". */
function pp(delta: number | null): string {
  if (delta === null) return "—";
  const v = delta * 100;
  const sign = v > 0.05 ? "+" : v < -0.05 ? "−" : "±";
  return `${sign}${Math.abs(v).toFixed(1)} pts`;
}

/** "Sat, Oct 24" or "Oct 24". */
function date(d: string, withWeekday = true): string {
  const [, m, day] = d.split("-").map(Number);
  return `${withWeekday ? `${WEEKDAYS[weekday(d)]}, ` : ""}${MONTHS_SHORT[m - 1]} ${day}`;
}

/** Oxford-free list: "A, B and C". */
const list = (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

const signed = (v: number) => `${v > 0.05 ? "+" : v < -0.05 ? "−" : "±"}${Math.abs(v).toFixed(1)}`;

const rText = (r: { r: number; n: number }) => `r = ${r.r.toFixed(2).replace("-", "−")}, n = ${r.n}`;

function strength(r: number): string {
  const a = Math.abs(r);
  if (a < 0.1) return "almost no relationship";
  const word = a < 0.3 ? "a weak" : a < 0.5 ? "a moderate" : "a strong";
  return `${word} ${r > 0 ? "positive" : "negative"} relationship`;
}

const PERIODS = ["before dawn", "in the morning", "in the afternoon", "in the evening"];

type CourseRatio = { course: string; ratio: number | null };

export const en = {
  lang: "en",
  htmlLang: "en",
  label: "English",

  fmt: {
    minutes,
    hours: (h: number) => `${h.toFixed(1)} hr`,
    days: (n: number) => plural(n, "day"),
    blocks: (n: number) => plural(n, "block"),
    pp,
    date,
    month: (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`,
    weekdays: WEEKDAYS,
    /** Separator between items in a run-on list of facts. */
    sep: ", ",
    /** Day and month names for the ECharts calendar. */
    calendar: "EN",
  },

  app: {
    brand: "Focus Log",
    title: "Focus Log",
    mainNav: "Main",
    overview: "Overview",
    records: "Records",
    patterns: "Patterns",
    settings: "Settings",
    logBlock: "Log block",
    other: "Other",
  },

  common: {
    loading: "Loading…",
    cancel: "Cancel",
    startStudying: "Start studying",
    logPast: "Log a past block",
    end: "End",
    range: "Date range",
    rangeDays: (n: number) => `${n} days`,
    rangeAll: "All",
    focused: "Focused",
    duration: "Duration",
    focusRate: "Focus rate",
    rest: "Distracted or resting",
    today: "Today",
    /** Banner while a block is running. */
    running: (min: number) => (min < 1 ? "Studying, just started" : `Studying for ${minutes(min)}`),
  },

  login: {
    lede: "Log when each study block starts and ends and which courses you worked on, then see how focused you are in each one.",
    password: "Password",
    signingIn: "Signing in…",
    signIn: "Sign in",
  },

  overview: {
    emptyTitle: "Start logging today",
    emptyHeading: "No study blocks yet",
    emptyBody:
      "When you sit down to study, tap “Start studying”. When you stop, tap “End” and note which courses you worked on and for how long. After a few days this page shows each course’s focus rate, how much you study each day, and a calendar.",
    todayLabel: "Today",
    heroDate: (d: string) => `Today, ${date(d)}`,
    notStarted: "Not started",
    /** rich */
    goalMet: (goal: string) => `Daily goal of ${goal} reached`,
    /** rich */
    goalLeft: (goal: string, left: string) => `**${left}** to go for your ${goal} goal`,
    noGoal: "Focus time",
    /** rich, appended to the line above */
    heroRatio: (r: string) => `, focus rate **${r}**`,
    kpi7: "7-day focus rate",
    vs7: "the previous 7 days",
    kpi30: "30-day focus rate",
    vs30: "the previous 30 days",
    streak: "Goal streak",
    streakSub: (goal: string) => `Days with ${goal} focused`,
    month: "Focus this month",
    monthSub: (today: string) => `Since ${MONTHS_SHORT[Number(today.slice(5, 7)) - 1]} 1`,
    noData: (vs: string) => `No data for ${vs}`,
    vs: (vs: string) => `vs ${vs}`,
    filterNote: (days: number, blocks: number) => `${plural(days, "day")} logged, ${plural(blocks, "block")}`,
    courses: "Courses",
    courseTakeaway: (most: { course: string; share: number }, best: CourseRatio | null, worst: CourseRatio | null) =>
      `${most.course} took the most time (${pct(most.share)}).` +
      (best && worst ? ` You focus best on ${best.course} (${pct(best.ratio)}) and drift most on ${worst.course} (${pct(worst.ratio)}).` : ""),
    coursesCaption: (target: number, minDays: number) =>
      `When a block covers several courses, its time is split between them by their minutes before each course’s focus rate is worked out. The tick marks your ${pct(target)} target; the trend is the weekly change in percentage points and needs at least ${minDays} days.`,
    noCourses: "No courses logged in this period.",
    trendTitle: "Focus rate over time",
    trendTakeaway: (ppPerWeek: number, r2: number, n: number) => {
      const fit = `(R² = ${r2.toFixed(2)}, ${plural(n, "day")})`;
      if (r2 < 0.1) return `${pp(ppPerWeek / 100)} a week ${fit}, but day-to-day swings outweigh the trend, so there is no clear change yet.`;
      if (Math.abs(ppPerWeek) < 0.3) return `${pp(ppPerWeek / 100)} a week ${fit}: holding steady.`;
      return ppPerWeek > 0
        ? `${pp(ppPerWeek / 100)} a week ${fit}: steadily improving.`
        : `${pp(ppPerWeek / 100)} a week ${fit}: slipping, so keep an eye on how recent sessions are going.`;
    },
    trendNeed: (min: number, active: number) => `The trend line appears once ${min} days are logged; so far there ${active === 1 ? "is 1 day" : `are ${active} days`}.`,
    trendChart: "Daily focus rate, 7-day rolling focus rate and trend line",
    trendCaption: "Each dot is a day’s focus rate (total focus ÷ total time); days without records are left blank. The solid line is the focus rate over the last 7 days combined.",
    dailyTitle: "What you studied each day",
    dailyTakeaway: (avg: number | null, met: number | null) =>
      avg === null ? "Nothing logged in this period." : `On days you studied you averaged ${minutes(avg)} of focus${met === null ? "" : `, and met your goal on ${plural(met, "day")}`}.`,
    dailyChart: "Focused minutes per course and distracted or resting time for each day",
    calendarTitle: "Study calendar",
    calendarTakeaway: "Darker days had more focused time. Tap a day for details.",
    calendarChart: "Calendar heatmap of focused minutes per day",
    runningSub: (start: string) => `Started at ${start}. Tap here when you’re done to end it and log your courses.`,
  },

  entry: {
    chooseDate: "Choose a date.",
    fillTimes: "Fill in the start and end times.",
    tooLong: (span: string) => `This block is ${span}, longer than 16 hours. Check the start and end times.`,
    rowMinutes: (course: string) => `Enter minutes for ${course} (a whole number), or remove it.`,
    maxCourses: (n: number) => `A block can list at most ${n} courses.`,
    over: (focus: string, extra: string) => `The courses add up to ${focus}, ${extra} more than the block.`,
    interruptionsRange: "Interruptions must be a whole number from 0 to 999.",
    toastSaved: "Changes saved",
    toastLogged: "Block logged",
    toastDeleted: "Block deleted",
    notFound: "Block not found",
    notFoundSub: "It may have been deleted.",
    viewAll: "View all records",
    titleNew: "Log a study block",
    titleEdit: "Edit block",
    subNew: "When you started, when you stopped, and which courses you worked on in between.",
    clear: "Clear",
    stepTime: "Time",
    pickDay: "Pick a day",
    dateGroup: "Date",
    yesterday: "Yesterday",
    otherDate: "Another date",
    start: "Start",
    end: "End",
    overnight: "Crosses midnight into the next day",
    total: (span: string) => `${span} in total`,
    stepCourses: "What you studied",
    courseCount: (n: number) => plural(n, "course"),
    coursesHint: "Tap a course to add it; rough minutes are fine",
    coursesGroup: "Courses",
    newCourse: "New course",
    newCoursePlaceholder: "Course name, e.g. CS370",
    newCourseLabel: "New course name",
    add: "Add",
    minutesGroup: (course: string) => `Minutes for ${course}`,
    minus: (course: string, step: number) => `${course}: ${step} minutes less`,
    plus: (course: string, step: number) => `${course}: ${step} minutes more`,
    minutesInput: (course: string) => `${course} minutes`,
    unit: "min",
    /** The rest of a block, where space is tight. */
    restShort: "Not focused",
    fill: (left: number) => `Fill +${left}`,
    fillTitle: "Give this course the rest of the block",
    remove: (course: string) => `Remove ${course}`,
    more: "More",
    moreHint: "Energy, interruptions and a note, all optional",
    energy: "Energy before you started",
    energyHint: "1 is exhausted, 5 is full of energy. Tap again to clear.",
    interruptions: "Interruptions",
    minusOne: "One fewer",
    plusOne: "One more",
    note: "Note",
    notePlaceholder: "Which chapter, what pulled you away",
    fillTimesHint: "Fill in start and end times",
    /** rich */
    summary: (focus: string, rest: string | null, ratio: string | null) =>
      `**${focus}** focused${rest ? `, **${rest}** resting` : ""}${ratio ? `, **${ratio}**` : ""}`,
    saving: "Saving…",
    save: "Save",
    saveChanges: "Save changes",
    backToDay: "Back to this day",
    confirmDelete: "Confirm delete",
    delete: "Delete this block",
    stampRunning: (start: string) => `Started at ${start}. Tap “End” when you’re done, then log the courses.`,
    stampIdle: "Start studying now?",
    stampIdleSub: "Tap once to note the start time and again at the end. You can close the page in between.",
    now: "Now",
    setNow: (label: string) => `Set ${label.toLowerCase()} time to now`,
    meter: "Summary of this block",
    overNote: (extra: string) => `The courses add up to ${extra} more than the block. Trim them or move the end time later.`,
  },

  records: {
    title: "Records",
    emptyTitle: "No records yet",
    emptyBody: "When you sit down, tap “Start studying”. When you stop, tap “End” and note which courses you worked on.",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    pickMonth: "Choose month",
    summary: (days: number, blocks: number, focus: string, ratio: string) =>
      `${plural(days, "day")} logged, ${plural(blocks, "block")}, ${focus} focused at a ${ratio} focus rate.`,
    none: "Nothing logged this month.",
    /** rich */
    dayStats: (blocks: number, focus: string, ratio: string) => `${plural(blocks, "block")}, ${focus} focused, **${ratio}**`,
  },

  day: {
    allRecords: "All records",
    prevDay: "Previous day",
    nextDay: "Next day",
    prev: "‹ Previous",
    next: "Next ›",
    goal: "Goal",
    goalMet: "Reached",
    goalLeft: (left: string) => `${left} to go`,
    goalNone: "Not set",
    timelineCaption:
      "Each block is one study block: its width is the time it spanned, the stacked colours inside are each course’s share of that time, and the empty part is time spent distracted or resting. Tap a block to edit it.",
    courses: "Courses this day",
    mixedCaption: "When a block covers several courses, its time is split between them by their minutes to work out each focus rate.",
    weightedCaption: (mean: string) => `The day’s focus rate is weighted by time (total focus ÷ total time). The plain average of the blocks’ focus rates is ${mean}.`,
    empty: "Nothing logged this day.",
    addBlock: "Add a block to this day",
  },

  patterns: {
    title: "Patterns",
    emptyTitle: "Nothing to analyse yet",
    emptyBody: (n: number) => `After ${n} or more blocks, this page shows which times of day and which block lengths help you focus best.`,
    filterNote: (n: number, ratio: string, mean: string) => `${plural(n, "block")}, focus rate ${ratio} (plain average per block ${mean})`,
    needBlocks: (n: number) => `Appears after ${n} blocks.`,
    hourTitle: "Best time to start",
    hourChart: "Focus rate by starting hour",
    hourCaption: (min: number) => `Numbers above the bars count blocks; hours with fewer than ${min} are drawn lighter.`,
    weekdayTitle: "Day of the week",
    weekdayChart: "Focus rate by day of the week",
    weekdayCaption: "Numbers above the bars count the days logged.",
    lengthTitle: "Block length and focus",
    lengthChart: "Scatter plot of each block’s length and focus rate",
    lengthAxis: "Length",
    distTitle: "Spread of focus rates",
    distChart: "Histogram of each block’s focus rate",
    mean: "Mean",
    median: "Median",
    sd: "Std. dev. (pts)",
    distCaption: "Each block counts once here, whatever its length.",
    distNeed: "Appears after 5 blocks.",
    energyTitle: "Energy and focus",
    energyChart: "Focus rate by energy before starting",
    energyNeed: (n: number) => `Appears once ${n} blocks have an energy rating. Tap 1–5 when you log a block.`,
    intrTitle: "Interruptions and focus",
    intrChart: "Focus rate by number of interruptions",
    intrNeed: (n: number) => `Appears once ${n} blocks have an interruption count.`,
    weekly: "Weekly",
    monthly: "Monthly",
    periodGroup: "Group by week or month",
    byWeek: "By week",
    byMonth: "By month",
    periodChart: "Focus hours and focus rate per week or month",
    periodNeed: (unit: "week" | "month") => `Appears once your records span two ${unit}s.`,
    courseWeeksTitle: "Time per course each week",
    courseWeeksChart: "Stacked bars of focused minutes per course each week",
    noCourses: "No courses logged yet.",
    weekOf: (monday: string) => `Week of ${date(monday, false)}`,
    courseRatioTitle: "Focus rate by course",
    courseRatioChart: "Focus rate per course and the number of blocks behind it",
    courseRatioCaption: (min: number) =>
      `Beside each bar are the focus rate and the blocks behind it; courses with fewer than ${min} blocks are left out of the comparison. When a block covers several courses, its time is split between them by their minutes.`,
    unattributed: (min: number) => ` Another ${plural(min, "minute")} of study had no course logged and isn’t counted toward any course.`,
  },

  settings: {
    title: "Settings",
    language: "Language",
    languageGroup: "Interface language",
    languageHint: "Saved to your account, so every device you sign in on uses it.",
    goals: "Goals",
    dailyGoal: "Daily focus goal (minutes)",
    goalHint: (goal: string) => `That’s ${goal}. Used for the goal streak and the daily goal line.`,
    goalHintNone: "Set to 0 for no goal.",
    target: "Target focus rate (%)",
    targetHint: "The reference line on the trend chart.",
    goalRange: "The daily goal must be a whole number of minutes from 0 to 1440.",
    targetRange: "The target focus rate must be between 0 and 100.",
    saved: "Settings saved",
    save: "Save settings",
    courses: "Courses",
    coursesHint: "Renaming updates every record. Rename a course to one that already exists to merge the two (minutes in the same block are added together).",
    noCourses: "No courses yet. Courses you add when logging appear here.",
    courseMeta: (blocks: number, mins: string) => `${plural(blocks, "block")}, ${mins}`,
    renameOrMerge: "Rename or merge",
    newName: (course: string) => `New name for ${course}`,
    merge: "Merge",
    rename: "Rename",
    mergeWarn: (target: string, course: string) => `${target} already exists: every record of ${course} will be merged into ${target}. This can’t be undone.`,
    merged: (course: string, target: string, n: number) => `Merged ${course} into ${target} (${plural(n, "block")})`,
    renamed: (target: string, n: number) => `Renamed to ${target} (${plural(n, "block")})`,
    data: "Data",
    dataSummary: (n: number) => `${plural(n, "study block")} in total. The exported JSON file holds every record and your settings, for backups or moving to another device.`,
    export: "Export JSON",
    import: "Import JSON…",
    noSessions: "This file has no sessions list. Choose a JSON file exported from here.",
    notJson: "This isn’t a valid JSON file.",
    pending: (name: string, n: number) => `${name}: ${plural(n, "record")}. Importing adds them after your existing records; nothing is overwritten.`,
    skipDupes: (n: number) => `Skip ${plural(n, "record")} identical to existing ones`,
    importN: (n: number) => `Import ${plural(n, "record")}`,
    imported: (n: number) => `Imported ${plural(n, "record")}.`,
    importedToast: (n: number) => `Imported ${plural(n, "record")}`,
    importFailed: (msg: string) => `Nothing was imported: ${msg}`,
    account: "Account",
    logout: "Sign out",
  },

  courseTable: {
    label: "Time, focus rate and trend for each course",
    course: "Course",
    time: "Time",
    ratio: "Focus rate (blocks)",
    weekly: "Weekly trend",
    trendTitle: (ppPerWeek: number, r2: number, n: number) => `${signed(ppPerWeek)} pts a week, R² = ${r2.toFixed(2)}, ${plural(n, "day")}`,
    needDays: (n: number) => `A trend needs at least ${n} days`,
    signed,
  },

  session: {
    edit: (start: string) => `Edit the block started at ${start}`,
    overnight: (span: string) => `to next day, ${span}`,
    total: (span: string) => span,
    noCourses: "No courses logged",
    meta: (focus: string, rest: string | null, energy: number | null, interruptions: number | null) =>
      [
        `${focus} focused`,
        rest && `${rest} distracted or resting`,
        energy !== null && `energy ${energy}`,
        interruptions !== null && plural(interruptions, "interruption"),
      ]
        .filter(Boolean)
        .join(", "),
  },

  timeline: {
    block: (start: string, end: string, courses: string[], ratio: string, tail: boolean) =>
      `${start}–${end}${courses.length ? `, ${courses.join(", ")}` : ""}, focus rate ${ratio}${tail ? " (started the day before)" : ""}`,
    edit: (title: string) => `Edit: ${title}`,
  },

  charts: {
    dailyRatio: "Daily focus rate",
    rolling: "7-day rolling",
    trend: "Trend",
    trendTip: "trend",
    notLogged: "Not logged",
    thatDay: "that day",
    thatDayN: (n: number) => `that day, ${plural(n, "block")}`,
    last7: "last 7 days",
    target: (v: string) => `Target ${v}`,
    nothing: "Nothing logged",
    stackFoot: (focus: string, ratio: string | null) => `${focus} focused${ratio === null ? "" : `, focus rate ${ratio}`}`,
    noStudy: "None",
    goalMet: "Goal met",
    heatTip: (n: number, ratio: string) => `focused, ${plural(n, "block")}, focus rate ${ratio}`,
    barTip: (n: number, unit: "blocks" | "days", weak: boolean) =>
      `focus rate, ${unit === "days" ? plural(n, "day") : plural(n, "block")}${weak ? " (small sample)" : ""}`,
    scatterTip: (xName: string, x: string) => `focus rate, ${xName.toLowerCase()} ${x}`,
    histHead: (label: string) => `Focus rate ${label}`,
    histCount: (n: number): string => (n === 1 ? "block" : "blocks"),
    focusHours: "Focus hours",
    periodTip: (days: number) => `focused, ${plural(days, "day")} logged`,
    courseTip: (blocks: number, mins: string) => `focus rate, ${plural(blocks, "block")}, ${mins}`,
    blocks: (n: number) => plural(n, "block"),
    shortDate: (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`,
  },

  insights: {
    strength,
    rText,
    hourLabel: (h: number) => `${h}:00`,
    hour: (h: number, ratio: number, n: number, overall: number) =>
      `Blocks started ${PERIODS[h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3]} between ${h}:00 and ${h + 2}:00 have the highest focus rate (${pct(ratio)} over ${plural(n, "block")}), against ${pct(overall)} overall.`,
    hourThin: "Each time of day has too few blocks so far. Log a few more days and check back.",
    weekdayThin: "Not enough weeks to compare yet. Log a few more weeks and check back.",
    weekday: (top: number, topRatio: number | null, low: number, lowRatio: number | null) =>
      `Focus is highest on ${WEEKDAYS_PLURAL[top]} (${pct(topRatio)}) and lowest on ${WEEKDAYS_PLURAL[low]} (${pct(lowRatio)}).`,
    length: (r: { r: number; n: number }, median: number, short: number | null, long: number | null) =>
      `Block length and focus rate show ${strength(r.r)} (${rText(r)}). Blocks of ${minutes(median)} or less average ${pct(short)}; longer ones ${pct(long)}.`,
    lengthFlat: "Your blocks are all about the same length, so there’s no relationship to see.",
    energyLabel: (k: number) => `Energy ${k}`,
    energy: (r: { r: number; n: number }, hi: number | null, lo: number | null) => {
      const parts = [hi !== null && `${pct(hi)} at energy 4–5`, lo !== null && `${pct(lo)} at 1–2`].filter((p): p is string => Boolean(p));
      return `Energy and focus rate show ${strength(r.r)} (${rText(r)})${parts.length ? `: ${list(parts)}` : ""}.`;
    },
    energyFlat: "Every energy rating is the same, so there’s no relationship to see.",
    intrLabel: (k: number, last: boolean) => (last ? `${k}+` : `${k}`),
    intr: (r: { r: number; n: number }, slope: number | null) =>
      `Interruptions and focus rate show ${strength(r.r)} (${rText(r)})` +
      (slope === null ? "." : `: each extra interruption ${slope < 0 ? "lowers" : "raises"} the focus rate by ${Math.abs(slope * 100).toFixed(1)} points on average.`),
    intrFlat: "Every block has the same number of interruptions, so there’s no relationship to see.",
    dist: (p25: number, p75: number, median: number) => `Half of your blocks fall between ${pct(p25)} and ${pct(p75)} focus, with a median of ${pct(median)}.`,
    weekLabel: (k: string) => `${MONTHS_SHORT[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}`,
    monthLabel: (k: string, thisYear: boolean) => `${MONTHS_SHORT[Number(k.slice(5, 7)) - 1]}${thisYear ? "" : ` ’${k.slice(2, 4)}`}`,
    period: (unit: "week" | "month", label: string, focus: number, ratio: number | null, delta: number | null) =>
      `${unit === "week" ? `The week of ${label}` : `In ${label}`} you focused for ${minutes(focus)} at a ${pct(ratio)} focus rate` +
      (delta === null ? "." : `, ${pp(delta)} on the ${unit} before.`),
    course: (most: { course: string; minutes: number; share: number }, best: CourseRatio | null, worst: CourseRatio | null, single: boolean) =>
      `${most.course} took the most time (${minutes(most.minutes)}, ${pct(most.share)}).` +
      (best && worst
        ? ` You focus best on ${best.course} (${pct(best.ratio)}) and drift most on ${worst.course} (${pct(worst.ratio)}).`
        : single
          ? " Log more courses to compare them."
          : ""),
  },

  errors: {
    network: "Can’t reach the server. Check your connection.",
    status: (status: number) => `Request failed (${status}).`,
    wrongPassword: "Wrong password.",
    tooManyAttempts: "Too many attempts. Try again in 15 minutes.",
    date: "Dates must look like YYYY-MM-DD.",
    start: "Start time must look like HH:MM.",
    end: "End time must look like HH:MM.",
    tooLong: "A block can’t be longer than 16 hours.",
    coursesList: "The course list is malformed.",
    courseName: "Course name is required.",
    minutesFor: (course: string) => `Minutes for ${course} must be a whole number above 0.`,
    maxCourses: "A block can list at most 10 courses.",
    courseOver: (total: number, span: number) => `The courses add up to ${total} minutes, more than the block itself (${span} minutes).`,
    energy: "Energy must be from 1 to 5.",
    interruptions: "Interruptions must be a whole number from 0 to 999.",
    dailyGoal: "The daily goal must be from 0 to 1440 minutes.",
    targetRatio: "The target focus rate must be between 0 and 100%.",
    language: "That language isn’t supported.",
    noSessions: "The file has no sessions list.",
    invalidJson: "The request wasn’t valid JSON.",
    notFound: "This block no longer exists.",
    unauthorized: "Your session has expired. Please sign in again.",
    internal: "Something went wrong on the server.",
    row: (n: number, msg: string) => `Record ${n}: ${msg}`,
    /** A server message with no translation: shown as is, capitalised. */
    unknown: (msg: string) => msg.charAt(0).toUpperCase() + msg.slice(1),
  },
};
