// Simplified Chinese. Typed as Messages, so a missing or extra key, or a
// function with a different signature, is a type error.
import { formatPct as pct, weekday } from "../stats";
import type { Messages } from "./index";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** "45 分钟", "1 小时 5 分", "2 小时". */
function minutes(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} 分钟`;
  return r ? `${h} 小时 ${r} 分` : `${h} 小时`;
}

function pp(delta: number | null): string {
  if (delta === null) return "—";
  const v = delta * 100;
  const sign = v > 0.05 ? "+" : v < -0.05 ? "−" : "±";
  return `${sign}${Math.abs(v).toFixed(1)} 个百分点`;
}

/** "10 月 24 日 周六". */
function date(d: string, withWeekday = true): string {
  const [, m, day] = d.split("-").map(Number);
  return `${m} 月 ${day} 日${withWeekday ? ` ${WEEKDAYS[weekday(d)]}` : ""}`;
}

const signed = (v: number) => `${v > 0.05 ? "+" : v < -0.05 ? "−" : "±"}${Math.abs(v).toFixed(1)}`;

const rText = (r: { r: number; n: number }) => `r = ${r.r.toFixed(2).replace("-", "−")}，n = ${r.n}`;

function strength(r: number): string {
  const a = Math.abs(r);
  if (a < 0.1) return "几乎没有关系";
  const word = a < 0.3 ? "弱" : a < 0.5 ? "中等" : "较强";
  return `${word}${r > 0 ? "正" : "负"}相关`;
}

function periodName(h: number) {
  if (h < 6) return "凌晨";
  if (h < 12) return "上午";
  if (h < 18) return "下午";
  return "晚上";
}

export const zh: Messages = {
  lang: "zh",
  htmlLang: "zh-CN",
  label: "中文",

  fmt: {
    minutes,
    hours: (h) => `${h.toFixed(1)} 小时`,
    days: (n) => `${n} 天`,
    blocks: (n) => `${n} 段`,
    pp,
    date,
    month: (m) => `${m.slice(0, 4)} 年 ${Number(m.slice(5, 7))} 月`,
    weekdays: WEEKDAYS,
    sep: "，",
    calendar: "ZH",
  },

  app: {
    brand: "专注记录",
    title: "专注记录",
    mainNav: "主导航",
    overview: "概览",
    records: "记录",
    patterns: "规律",
    settings: "设置",
    logBlock: "记一次",
    other: "其他",
  },

  common: {
    loading: "正在加载…",
    cancel: "取消",
    startStudying: "开始学习",
    logPast: "补记一段",
    end: "结束",
    range: "时间范围",
    rangeDays: (n) => `${n} 天`,
    rangeAll: "全部",
    focused: "专注",
    duration: "时长",
    focusRate: "专注率",
    rest: "分心或休息",
    today: "今天",
    running: (min) => `学习中，${min < 1 ? "刚开始" : `已经 ${minutes(min)}`}`,
  },

  login: {
    lede: "记下每段学习的起止时间和学了哪几门课，看看自己在每门课上有多专注。",
    password: "密码",
    signingIn: "正在登录…",
    signIn: "登录",
  },

  overview: {
    emptyTitle: "从今天开始记",
    emptyHeading: "还没有学习记录",
    emptyBody: "坐下学习时点一下“开始学习”，学完点“结束”，再记下学了哪几门课、各多久。记几天之后，这里会出现每门课的专注率、每天的学习量和日历。",
    todayLabel: "今天",
    heroDate: (d) => `今天，${date(d)}`,
    notStarted: "还没开始",
    goalMet: (goal) => `已达成每日目标 ${goal}`,
    goalLeft: (goal, left) => `目标 ${goal}，还差 **${left}**`,
    noGoal: "专注时间",
    heroRatio: (r) => `，专注率 **${r}**`,
    kpi7: "近 7 天专注率",
    vs7: "前 7 天",
    kpi30: "近 30 天专注率",
    vs30: "前 30 天",
    streak: "连续达标",
    streakSub: (goal) => `每天专注满 ${goal}`,
    month: "本月专注",
    monthSub: (today) => `${Number(today.slice(5, 7))} 月 1 日至今`,
    noData: (vs) => `${vs}没有数据`,
    vs: (vs) => `比${vs}`,
    filterNote: (days, blocks) => `${days} 天有记录，${blocks} 段学习`,
    courses: "各课程",
    courseTakeaway: (most, best, worst) =>
      `${most.course}用时最多，占 ${pct(most.share)}` +
      (best && worst ? `；学${best.course}时最专注（${pct(best.ratio)}），学${worst.course}时最容易分心（${pct(worst.ratio)}）` : "") +
      "。",
    coursesCaption: (target, minDays) =>
      `一段学习里有几门课时，按各课的分钟数把这段时长分给它们，再算各课的专注率。竖线是目标 ${pct(target)}；走势是每周专注率的变化（百分点），至少 ${minDays} 天才算。`,
    noCourses: "这段时间没有记课程。",
    trendTitle: "专注率走势",
    trendTakeaway: (ppPerWeek, r2, n) => {
      const word =
        r2 < 0.1 ? "，波动大于趋势，还看不出明显变化。" : Math.abs(ppPerWeek) < 0.3 ? "，基本持平。" : ppPerWeek > 0 ? "，在稳步变好。" : "，在下滑，留意一下最近的状态。";
      return `每周 ${pp(ppPerWeek / 100)}（R² = ${r2.toFixed(2)}，${n} 天）${word}`;
    },
    trendNeed: (min, active) => `至少 ${min} 天有记录才画趋势线，目前 ${active} 天。`,
    trendChart: "每日专注率、7 天滚动专注率和趋势线",
    trendCaption: "点是每天的专注率（总专注 ÷ 总时长），没记录的日子留空。实线是近 7 天合计的专注率。",
    dailyTitle: "每天学了什么",
    dailyTakeaway: (avg, met) => (avg === null ? "这段时间没有记录。" : `有记录的日子平均专注 ${minutes(avg)}${met === null ? "" : `，${met} 天达到目标`}。`),
    dailyChart: "每天各课程的专注分钟和分心休息时间",
    calendarTitle: "学习日历",
    calendarTakeaway: "颜色越深，当天专注越久。点某一天查看详情。",
    calendarChart: "每天专注分钟的日历热力图",
    runningSub: (start) => `${start} 开始。学完点这里结束并记下课程。`,
  },

  entry: {
    chooseDate: "请选择日期",
    fillTimes: "请填写开始和结束时间",
    tooLong: (span) => `这段时间有 ${span}，超过了 16 小时，检查一下开始和结束时间`,
    rowMinutes: (course) => `给 ${course} 填上分钟数（正整数），或者移除它`,
    maxCourses: (n) => `一次最多记 ${n} 门课程`,
    over: (focus, extra) => `课程合计 ${focus}，比这段时间多了 ${extra}`,
    interruptionsRange: "打断次数应为 0–999 的整数",
    toastSaved: "已保存修改",
    toastLogged: "已记下这段学习",
    toastDeleted: "已删除这条记录",
    notFound: "找不到这条记录",
    notFoundSub: "它可能已经被删除了。",
    viewAll: "查看全部记录",
    titleNew: "记一段学习",
    titleEdit: "修改记录",
    subNew: "什么时候开始、什么时候结束，中间学了哪几门课。",
    clear: "清空",
    stepTime: "时间段",
    pickDay: "选一天",
    dateGroup: "日期",
    yesterday: "昨天",
    otherDate: "其他日期",
    start: "开始",
    end: "结束",
    overnight: "跨过午夜，算到次日",
    total: (span) => `共 ${span}`,
    stepCourses: "学了什么",
    courseCount: (n) => `${n} 门`,
    coursesHint: "点课程添加，大概的分钟数就行",
    coursesGroup: "课程",
    newCourse: "新课程",
    newCoursePlaceholder: "课程名，例如 CS370",
    newCourseLabel: "新课程名",
    add: "添加",
    minutesGroup: (course) => `${course} 的分钟数`,
    minus: (course, step) => `${course} 减 ${step} 分钟`,
    plus: (course, step) => `${course} 加 ${step} 分钟`,
    minutesInput: (course) => `${course} 分钟`,
    unit: "分",
    restShort: "分心或休息",
    fill: (left) => `补满 +${left}`,
    fillTitle: "把剩下的时间都给这门课",
    remove: (course) => `移除 ${course}`,
    more: "更多",
    moreHint: "精力、打断、备注，都可以不填",
    energy: "开始前的精力",
    energyHint: "1 很累，5 精力充沛。再点一次取消。",
    interruptions: "被打断次数",
    minusOne: "减一",
    plusOne: "加一",
    note: "备注",
    notePlaceholder: "学了哪一章，哪里分心了",
    fillTimesHint: "填好开始和结束时间",
    summary: (focus, rest, ratio) => `专注 **${focus}**${rest ? `，休息 **${rest}**` : ""}${ratio ? `，**${ratio}**` : ""}`,
    saving: "正在保存…",
    save: "保存",
    saveChanges: "保存修改",
    backToDay: "返回这一天",
    confirmDelete: "确认删除",
    delete: "删除这条记录",
    stampRunning: (start) => `${start} 开始。学完点“结束”，再记下学了哪些课。`,
    stampIdle: "现在开始学习？",
    stampIdleSub: "点一下记下开始时间，学完回来点结束。可以关掉页面。",
    now: "现在",
    setNow: (label) => `${label}时间设为现在`,
    meter: "这段学习的概况",
    overNote: (extra) => `课程合计比这段时间多了 ${extra}，减一点或者把结束时间往后调。`,
  },

  records: {
    title: "记录",
    emptyTitle: "还没有任何记录",
    emptyBody: "坐下学习时点“开始学习”，学完点“结束”，再记下学了哪几门课。",
    prevMonth: "上个月",
    nextMonth: "下个月",
    pickMonth: "选择月份",
    summary: (days, blocks, focus, ratio) => `${days} 天有记录，共 ${blocks} 段，专注 ${focus}，专注率 ${ratio}。`,
    none: "这个月没有记录。",
    dayStats: (blocks, focus, ratio) => `${blocks} 段，专注 ${focus}，**${ratio}**`,
  },

  day: {
    allRecords: "全部记录",
    prevDay: "前一天",
    nextDay: "后一天",
    prev: "‹ 前一天",
    next: "后一天 ›",
    goal: "目标",
    goalMet: "已达成",
    goalLeft: (left) => `差 ${left}`,
    goalNone: "未设置",
    timelineCaption: "每块是一段学习，宽度是时长，里面按课程叠起来的高度是各课的分钟占比，空着的部分是分心或休息。点一块可以修改。",
    courses: "这天的课程",
    mixedCaption: "同一段里有几门课时，按分钟数把这段时长分给各课来算专注率。",
    weightedCaption: (mean) => `当天专注率按时间加权（总专注 ÷ 总时长）。各段专注率的简单平均为 ${mean}。`,
    empty: "这天没有记录。",
    addBlock: "给这天加一段",
  },

  patterns: {
    title: "规律",
    emptyTitle: "还没有可以分析的记录",
    emptyBody: (n) => `记录 ${n} 次以上之后，这里会告诉你哪个时段、多长的学习最容易专注。`,
    filterNote: (n, ratio, mean) => `${n} 段学习，专注率 ${ratio}（各段简单平均 ${mean}）`,
    needBlocks: (n) => `至少 ${n} 次记录后显示。`,
    hourTitle: "几点开始最专注",
    hourChart: "按开始小时的专注率",
    hourCaption: (min) => `柱上数字是次数，少于 ${min} 次的时段颜色变浅。`,
    weekdayTitle: "星期几",
    weekdayChart: "按星期的专注率",
    weekdayCaption: "柱上数字是有记录的天数。",
    lengthTitle: "学多久更专注",
    lengthChart: "每次学习的时长和专注率散点图",
    lengthAxis: "时长",
    distTitle: "专注率分布",
    distChart: "每次学习专注率的直方图",
    mean: "平均",
    median: "中位数",
    sd: "标准差（百分点）",
    distCaption: "这里每次学习算一个点，不按时长加权。",
    distNeed: "至少 5 次记录后显示。",
    energyTitle: "精力与专注",
    energyChart: "按开始前精力的专注率",
    energyNeed: (n) => `填写了精力的记录满 ${n} 次后显示。记录时点一下 1–5 即可。`,
    intrTitle: "打断与专注",
    intrChart: "按打断次数的专注率",
    intrNeed: (n) => `填写了打断次数的记录满 ${n} 次后显示。`,
    weekly: "每周",
    monthly: "每月",
    periodGroup: "按周或按月",
    byWeek: "按周",
    byMonth: "按月",
    periodChart: "每周或每月的专注小时和专注率",
    periodNeed: (unit) => `记录跨过两个${unit === "week" ? "周" : "月"}后显示。`,
    courseWeeksTitle: "每周各课程的时间",
    courseWeeksChart: "每周各课程的专注分钟，堆叠柱状图",
    noCourses: "还没有记课程。",
    weekOf: (monday) => `${Number(monday.slice(5, 7))}/${Number(monday.slice(8, 10))} 那一周`,
    courseRatioTitle: "各课程的专注率",
    courseRatioChart: "各课程的专注率和对应的学习段数",
    courseRatioCaption: (min) => `条右边是专注率和背后的学习段数，少于 ${min} 段的不参与比较。一段学习里有几门课时，按各课分钟数把这段时长分给它们。`,
    unattributed: (min) => ` 另有 ${min} 分钟的学习没记课程，不算进任何一门。`,
  },

  settings: {
    title: "设置",
    language: "语言",
    languageGroup: "界面语言",
    languageHint: "保存在账户里，在哪台设备登录都一样。",
    goals: "目标",
    dailyGoal: "每日专注目标（分钟）",
    goalHint: (goal) => `即 ${goal}。用于“连续达标”和每日目标线。`,
    goalHintNone: "设为 0 表示不设目标。",
    target: "目标专注率（%）",
    targetHint: "走势图里的参考线。",
    goalRange: "每日目标应为 0–1440 的整数分钟",
    targetRange: "目标专注率应在 0–100 之间",
    saved: "设置已保存",
    save: "保存设置",
    courses: "课程",
    coursesHint: "改名会更新所有记录。改成一个已有的课程名，就把两门合并成一门（同一段里的分钟数相加）。",
    noCourses: "还没有课程。记录时添加的课程会出现在这里。",
    courseMeta: (blocks, mins) => `${blocks} 段，${mins}`,
    renameOrMerge: "改名或合并",
    newName: (course) => `${course} 的新名字`,
    merge: "合并",
    rename: "改名",
    mergeWarn: (target, course) => `${target} 已经存在：${course} 的所有记录会并入 ${target}，这一步无法撤销。`,
    merged: (course, target, n) => `已把 ${course} 合并到 ${target}（${n} 段）`,
    renamed: (target, n) => `已改名为 ${target}（${n} 段）`,
    data: "数据",
    dataSummary: (n) => `共 ${n} 段学习记录。导出的 JSON 文件包含全部记录和设置，可以用来备份或换设备。`,
    export: "导出 JSON",
    import: "导入 JSON…",
    noSessions: "文件里没有 sessions 列表。请选择从这里导出的 JSON 文件。",
    notJson: "这不是有效的 JSON 文件。",
    pending: (name, n) => `${name}：${n} 条记录。导入会追加到现有记录之后，不会覆盖。`,
    skipDupes: (n) => `跳过 ${n} 条与现有记录相同的`,
    importN: (n) => `导入 ${n} 条`,
    imported: (n) => `已导入 ${n} 条记录。`,
    importedToast: (n) => `已导入 ${n} 条记录`,
    importFailed: (msg) => `没有导入任何记录：${msg}`,
    account: "账户",
    logout: "退出登录",
  },

  courseTable: {
    label: "各课程的时间、专注率和趋势",
    course: "课程",
    time: "时间",
    ratio: "专注率（段数）",
    weekly: "每周走势",
    trendTitle: (ppPerWeek, r2, n) => `每周 ${ppPerWeek.toFixed(1)} 个百分点，R² = ${r2.toFixed(2)}，${n} 天`,
    needDays: (n) => `至少 ${n} 天才算趋势`,
    signed,
  },

  session: {
    edit: (start) => `修改 ${start} 开始的记录`,
    overnight: (span) => `到次日，共 ${span}`,
    total: (span) => `共 ${span}`,
    noCourses: "没有记课程",
    meta: (focus, rest, energy, interruptions) =>
      `专注 ${focus}` + (rest ? `，分心或休息 ${rest}` : "") + (energy !== null ? `，精力 ${energy}` : "") + (interruptions !== null ? `，打断 ${interruptions} 次` : ""),
  },

  timeline: {
    block: (start, end, courses, ratio, tail) => `${start}–${end}${courses.length ? `，${courses.join("，")}` : ""}，专注率 ${ratio}${tail ? "（前一天开始）" : ""}`,
    edit: (title) => `修改：${title}`,
  },

  charts: {
    dailyRatio: "每日专注率",
    rolling: "近 7 天滚动",
    trend: "趋势线",
    trendTip: "趋势",
    notLogged: "未记录",
    thatDay: "当天",
    thatDayN: (n) => `当天，${n} 次`,
    last7: "近 7 天",
    target: (v) => `目标 ${v}`,
    nothing: "没有记录",
    stackFoot: (focus, ratio) => `专注 ${focus}${ratio === null ? "" : `，专注率 ${ratio}`}`,
    noStudy: "未学习",
    goalMet: "达标",
    heatTip: (n, ratio) => `专注，${n} 次，专注率 ${ratio}`,
    barTip: (n, unit, weak) => `专注率，${n} ${unit === "days" ? "天" : "次"}${weak ? "（样本少）" : ""}`,
    scatterTip: (xName, x) => `专注率，${xName} ${x}`,
    histHead: (label) => `专注率 ${label}`,
    histCount: () => "次学习",
    focusHours: "专注小时",
    periodTip: (days) => `专注，${days} 天有记录`,
    courseTip: (blocks, mins) => `专注率，${blocks} 段，${mins}`,
    blocks: (n) => `${n} 段`,
    shortDate: (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`,
  },

  insights: {
    strength,
    rText,
    hourLabel: (h) => `${h}点`,
    hour: (h, ratio, n, overall) => `${periodName(h)} ${h}–${h + 2} 点开始的学习专注率最高（${pct(ratio)}，${n} 次），整体为 ${pct(overall)}。`,
    hourThin: "每个时段的记录还太少，多记几天再看。",
    weekdayThin: "还没有足够多的星期可比，多记几周再看。",
    weekday: (top, topRatio, low, lowRatio) => `${WEEKDAYS[top]}专注率最高（${pct(topRatio)}），${WEEKDAYS[low]}最低（${pct(lowRatio)}）。`,
    length: (r, median, short, long) =>
      `时长与专注率${strength(r.r)}（${rText(r)}）。不超过 ${minutes(median)} 的学习专注率 ${pct(short)}，更长的 ${pct(long)}。`,
    lengthFlat: "时长都差不多，看不出关系。",
    energyLabel: (k) => `精力 ${k}`,
    energy: (r, hi, lo) => {
      const parts = [hi !== null && `精力 4–5 时专注率 ${pct(hi)}`, lo !== null && `1–2 时 ${pct(lo)}`].filter(Boolean);
      return `精力与专注率${strength(r.r)}（${rText(r)}）${parts.length ? `：${parts.join("，")}` : ""}。`;
    },
    energyFlat: "精力评分都一样，看不出关系。",
    intrLabel: (k, last) => (last ? `${k} 次以上` : `${k} 次`),
    intr: (r, slope) =>
      `打断与专注率${strength(r.r)}（${rText(r)}）` +
      (slope === null ? "" : `，每多 1 次打断，专注率平均${slope < 0 ? "下降" : "上升"} ${Math.abs(slope * 100).toFixed(1)} 个百分点`) +
      "。",
    intrFlat: "打断次数都一样，看不出关系。",
    dist: (p25, p75, median) => `一半的学习专注率落在 ${pct(p25)}–${pct(p75)} 之间，中位数 ${pct(median)}。`,
    weekLabel: (k) => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))} 周`,
    monthLabel: (k, thisYear) => `${thisYear ? "" : `${k.slice(2, 4)}年`}${Number(k.slice(5, 7))}月`,
    period: (unit, label, focus, ratio, delta) => {
      const name = unit === "week" ? "周" : "月";
      return `最近一${name}（${label}）专注 ${minutes(focus)}，专注率 ${pct(ratio)}` + (delta === null ? "。" : `，比前一${name} ${pp(delta)}。`);
    },
    course: (most, best, worst, single) =>
      `${most.course}用时最多（${minutes(most.minutes)}，占 ${pct(most.share)}）` +
      (best && worst ? `。${best.course}最专注（${pct(best.ratio)}），${worst.course}最容易分心（${pct(worst.ratio)}）` : single ? "。多记几门课程就能比较" : "") +
      "。",
  },

  errors: {
    network: "连不上服务器，请检查网络",
    status: (status) => `请求失败（${status}）`,
    wrongPassword: "密码不对",
    tooManyAttempts: "尝试次数太多，请 15 分钟后再试",
    date: "日期格式应为 年-月-日",
    start: "开始时间格式应为 时:分",
    end: "结束时间格式应为 时:分",
    tooLong: "一次学习不能超过 16 小时",
    coursesList: "课程格式不对",
    courseName: "课程名不能为空",
    minutesFor: (course) => `${course} 的分钟数应为正整数`,
    maxCourses: "一次学习最多记 10 门课程",
    courseOver: (total, span) => `课程时间合计 ${total} 分钟，超过了这段时间（${span} 分钟）`,
    energy: "精力应为 1–5",
    interruptions: "打断次数应为 0–999 的整数",
    dailyGoal: "每日目标应为 0–1440 分钟",
    targetRatio: "目标专注率应在 0–100% 之间",
    language: "不支持这种语言",
    noSessions: "文件里没有 sessions 列表",
    invalidJson: "请求不是有效的 JSON",
    notFound: "这条记录已不存在",
    unauthorized: "登录已失效，请重新登录",
    internal: "服务器出错了",
    row: (n, msg) => `第 ${n} 条：${msg}`,
    unknown: (msg) => msg,
  },
};
