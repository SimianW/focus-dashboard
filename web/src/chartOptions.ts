// ECharts option builders. Every chart reads colours from the ChartTheme so
// "focus", "unfocused" and each course mean the same colour everywhere, in
// both modes.
import type { EChartsCoreOption } from "echarts/core";
import type { ChartTheme } from "./theme";
import type { Messages } from "./i18n";
import { formatPct, type Day, type Trend } from "./stats";

type Opt = EChartsCoreOption;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** One tooltip row: a short line key in the series colour, value first. */
const row = (color: string, value: string, label: string) =>
  `<div style="display:flex;align-items:center;gap:8px;margin-top:3px">` +
  `<span style="width:12px;height:3px;border-radius:2px;background:${color}"></span>` +
  `<b style="font-weight:600">${value}</b><span style="opacity:.7">${esc(label)}</span></div>`;

const head = (s: string) => `<div style="opacity:.7;margin-bottom:2px">${esc(s)}</div>`;

function base(t: ChartTheme): Opt {
  return {
    animationDuration: 900,
    animationEasing: "cubicOut",
    textStyle: { fontFamily: t.font, color: t.muted, fontSize: 12 },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.axis,
      borderWidth: 1,
      padding: [9, 12],
      textStyle: { color: t.ink, fontSize: 12, fontFamily: t.font },
      extraCssText: `border-radius:10px;box-shadow:0 12px 32px -12px rgba(20,20,19,${t.dark ? 0.6 : 0.2});`,
      confine: true,
    },
  };
}

function valueAxis(t: ChartTheme, extra: Record<string, unknown> = {}) {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
    axisLabel: { color: t.muted, fontSize: 11 },
    ...extra,
  };
}

function categoryAxis(t: ChartTheme, data: string[], extra: Record<string, unknown> = {}) {
  return {
    type: "category",
    data,
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true },
    ...extra,
  };
}

const legend = (t: ChartTheme, extra: Record<string, unknown> = {}) => ({
  top: 0,
  left: 0,
  itemWidth: 12,
  itemHeight: 12,
  itemGap: 18,
  icon: "roundRect",
  textStyle: { color: t.ink2, fontSize: 12 },
  ...extra,
});

/** Legend key for a line series: a short 2px stroke, not a box. */
const LINE_KEY = "path://M0,4.25 L16,4.25 L16,5.75 L0,5.75 Z";

const pctAxis = (t: ChartTheme, min = 0) =>
  valueAxis(t, { min, max: 1, interval: 0.2, axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` } });

const hoursLabel = (min: number) => (min % 60 === 0 ? `${min / 60}h` : `${(min / 60).toFixed(1)}h`);

/** Lower bound for a ratio axis: honest zero unless data sits well above it. */
function ratioFloor(values: (number | null)[]) {
  const xs = values.filter((v): v is number => v !== null);
  if (!xs.length) return 0;
  return Math.max(0, Math.floor((Math.min(...xs) - 0.05) * 5) / 5);
}

// ---------- overview ----------

export function trendOption(
  t: ChartTheme,
  m: Messages,
  days: Day[],
  rolling: (number | null)[],
  trend: Trend | null,
  target: number,
): Opt {
  const dates = days.map((d) => d.date);
  const firstIdx = days.findIndex((d) => d.ratio !== null);
  const lastIdx = days.length - 1 - [...days].reverse().findIndex((d) => d.ratio !== null);
  const trendLine = days.map((_, i) =>
    trend && i >= firstIdx && i <= lastIdx ? Math.min(1, Math.max(0, trend.intercept + trend.slope * i)) : null,
  );
  const min = Math.min(ratioFloor(days.map((d) => d.ratio)), target - 0.1 > 0 ? Math.floor((target - 0.1) * 5) / 5 : 0);
  return {
    ...base(t),
    legend: legend(t, {
      itemWidth: 16,
      itemHeight: 10,
      data: [
        { name: m.charts.dailyRatio, icon: "circle", itemStyle: { color: t.focusSoft } },
        { name: m.charts.rolling, icon: LINE_KEY, itemStyle: { color: t.focus } },
        ...(trend ? [{ name: m.charts.trend, icon: LINE_KEY, itemStyle: { color: t.trend } }] : []),
      ],
    }),
    grid: { left: 40, right: 16, top: 40, bottom: 28 },
    xAxis: categoryAxis(t, dates, { axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true, formatter: m.charts.shortDate } }),
    yAxis: pctAxis(t, min),
    tooltip: {
      ...(base(t).tooltip as object),
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: t.axis, width: 1 } },
      formatter: (ps: { dataIndex: number }[]) => {
        const i = ps[0].dataIndex;
        const d = days[i];
        return (
          head(m.fmt.date(d.date)) +
          (d.ratio === null ? row(t.focusSoft, m.charts.notLogged, m.charts.thatDay) : row(t.focusSoft, formatPct(d.ratio), m.charts.thatDayN(d.n))) +
          row(t.focus, formatPct(rolling[i]), m.charts.last7) +
          (trendLine[i] !== null ? row(t.trend, formatPct(trendLine[i]), m.charts.trendTip) : "")
        );
      },
    },
    series: [
      {
        name: m.charts.dailyRatio,
        type: "scatter",
        data: days.map((d) => d.ratio),
        symbolSize: 10,
        itemStyle: { color: t.focusSoft, borderColor: t.surface, borderWidth: 2 },
        z: 2,
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: t.target, width: 1, type: [4, 4] },
          label: { formatter: m.charts.target(formatPct(target)), color: t.ink2, fontSize: 11, position: "insideEndTop" },
          data: [{ yAxis: target }],
        },
      },
      {
        name: m.charts.rolling,
        type: "line",
        data: rolling,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 2.25, color: t.focus, cap: "round", join: "round" },
        itemStyle: { color: t.focus },
        z: 3,
      },
      ...(trend
        ? [
            {
              name: m.charts.trend,
              type: "line",
              data: trendLine,
              showSymbol: false,
              lineStyle: { width: 1.5, color: t.trend, cap: "round", type: [6, 4] },
              itemStyle: { color: t.trend },
              z: 4,
            },
          ]
        : []),
    ],
  };
}

export type CourseSeries = { name: string; color: string; data: number[] };

/** Bars per day or week: course minutes stacked, the unfocused rest on top when given. */
export function courseStackOption(
  t: ChartTheme,
  m: Messages,
  labels: string[],
  series: CourseSeries[],
  opts: { rest?: number[]; goalMin?: number; tooltipHead: (i: number) => string; empty?: (i: number) => boolean; formatLabel?: (l: string) => string },
): Opt {
  const totals = labels.map((_, i) => series.reduce((a, c) => a + c.data[i], 0) + (opts.rest?.[i] ?? 0));
  const maxMin = Math.max(opts.goalMin ?? 0, ...totals);
  const step = [60, 120, 180, 300, 600, 1200].find((m) => maxMin / m <= 5) ?? 2400;
  const all = [...series, ...(opts.rest ? [{ name: m.common.rest, color: t.unfocused, data: opts.rest }] : [])];
  // The topmost non-zero segment of each bar gets the rounded end.
  const topOf = labels.map((_, i) => {
    for (let k = all.length - 1; k >= 0; k--) if (all[k].data[i] > 0) return k;
    return -1;
  });
  return {
    ...base(t),
    legend: legend(t, { data: all.map((c) => ({ name: c.name, itemStyle: { color: c.color } })) }),
    grid: { left: 40, right: 16, top: 24 + Math.ceil(all.length / 4) * 22, bottom: 28 },
    xAxis: categoryAxis(t, labels, { axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true, formatter: opts.formatLabel } }),
    yAxis: valueAxis(t, { interval: step, max: Math.ceil(maxMin / step) * step || step, axisLabel: { color: t.muted, fontSize: 11, formatter: hoursLabel } }),
    tooltip: {
      ...(base(t).tooltip as object),
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.7 } },
      formatter: (ps: { dataIndex: number }[]) => {
        const i = ps[0].dataIndex;
        if (opts.empty?.(i)) return head(opts.tooltipHead(i)) + `<div>${m.charts.nothing}</div>`;
        const focus = series.reduce((a, c) => a + c.data[i], 0);
        return (
          head(opts.tooltipHead(i)) +
          all.filter((c) => c.data[i] > 0).map((c) => row(c.color, m.fmt.minutes(c.data[i]), c.name)).reverse().join("") +
          `<div style="opacity:.7;margin-top:4px">${esc(m.charts.stackFoot(m.fmt.minutes(focus), opts.rest ? formatPct(totals[i] ? focus / totals[i] : null) : null))}</div>`
        );
      },
    },
    series: all.map((c, k) => ({
      name: c.name,
      type: "bar",
      stack: "s",
      barMaxWidth: 28,
      animationDelay: (i: number) => i * 12,
      data: c.data.map((v, i) => ({ value: v || null, itemStyle: { borderRadius: topOf[i] === k ? [4, 4, 0, 0] : 0 } })),
      itemStyle: { color: c.color, borderColor: t.surface, borderWidth: 1.5 },
      ...(k === 0 && opts.goalMin
        ? {
            markLine: {
              silent: true,
              symbol: "none",
              lineStyle: { color: t.target, width: 1, type: [4, 4] },
              label: { formatter: m.charts.target(hoursLabel(opts.goalMin)), color: t.ink2, fontSize: 11, position: "insideEndTop" },
              data: [{ yAxis: opts.goalMin }],
            },
          }
        : {}),
    })),
  };
}

export function heatmapOption(t: ChartTheme, m: Messages, days: Day[], goalMin: number, cellSize: number): Opt {
  const g = Math.max(goalMin, 60);
  const pieces = [
    { min: 0, max: 0, label: m.charts.noStudy, color: t.heat[0] },
    { gt: 0, lt: g / 2, label: `< ${hoursLabel(Math.round(g / 2))}`, color: t.heat[1] },
    { gte: g / 2, lt: g, label: `< ${hoursLabel(g)}`, color: t.heat[2] },
    { gte: g, lt: g * 1.5, label: m.charts.goalMet, color: t.heat[3] },
    { gte: g * 1.5, label: `≥ ${hoursLabel(Math.round(g * 1.5))}`, color: t.heat[4] },
  ];
  return {
    ...base(t),
    tooltip: {
      ...(base(t).tooltip as object),
      formatter: (p: { value: [string, number] }) => {
        const d = days.find((x) => x.date === p.value[0]);
        if (!d || !d.n) return head(m.fmt.date(p.value[0])) + `<div>${m.charts.nothing}</div>`;
        return head(m.fmt.date(d.date)) + row(t.focus, m.fmt.minutes(d.focus), m.charts.heatTip(d.n, formatPct(d.ratio)));
      },
    },
    visualMap: {
      type: "piecewise",
      pieces,
      orient: "horizontal",
      left: 0,
      bottom: 0,
      itemWidth: 12,
      itemHeight: 12,
      // Narrow phones: the five pieces must still fit on one line.
      itemGap: cellSize < 18 ? 8 : 12,
      itemSymbol: "roundRect",
      textStyle: { color: t.ink2, fontSize: 11 },
      selectedMode: false,
    },
    calendar: {
      range: [days[0].date, days[days.length - 1].date],
      cellSize: [cellSize, cellSize],
      // Explicit size keeps the cells square instead of stretched to the container.
      width: Math.ceil(days.length / 7) * cellSize,
      height: 7 * cellSize,
      left: 28,
      top: 22,
      orient: "horizontal",
      splitLine: { show: false },
      itemStyle: { color: "transparent", borderColor: t.surface, borderWidth: 3 },
      dayLabel: { firstDay: 1, nameMap: m.fmt.calendar, color: t.muted, fontSize: 10, margin: 6 },
      monthLabel: { nameMap: m.fmt.calendar, color: t.muted, fontSize: 11, margin: 6 },
      yearLabel: { show: false },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: days.map((d) => [d.date, d.focus]),
        itemStyle: { borderColor: t.surface, borderWidth: 3, borderRadius: 5 },
        emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 2 } },
      },
    ],
  };
}

// ---------- patterns ----------

export type BarDatum = { label: string; ratio: number | null; n: number; weak: boolean };

/** Ratio per bucket, with the session count written above each bar. */
export function ratioBarsOption(t: ChartTheme, m: Messages, data: BarDatum[], unit: "blocks" | "days" = "blocks"): Opt {
  return {
    ...base(t),
    grid: { left: 40, right: 8, top: 24, bottom: 28 },
    xAxis: categoryAxis(t, data.map((d) => d.label), { axisLabel: { color: t.muted, fontSize: 11, interval: 0, hideOverlap: true } }),
    yAxis: pctAxis(t),
    tooltip: {
      ...(base(t).tooltip as object),
      trigger: "item",
      formatter: (p: { dataIndex: number }) => {
        const d = data[p.dataIndex];
        return head(d.label) + row(t.focus, formatPct(d.ratio), m.charts.barTip(d.n, unit, d.weak));
      },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 18,
        animationDelay: (i: number) => i * 30,
        data: data.map((d) => ({
          value: d.ratio,
          itemStyle: { opacity: d.weak ? 0.35 : 1 },
          label: { show: d.n > 0, formatter: `${d.n}`, position: "top", color: t.muted, fontSize: 10 },
        })),
        itemStyle: { color: t.focus, borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

export function scatterOption(
  t: ChartTheme,
  m: Messages,
  points: { x: number; y: number; label: string }[],
  xName: string,
  xFormat: (v: number) => string,
): Opt {
  return {
    ...base(t),
    grid: { left: 40, right: 16, top: 16, bottom: 40 },
    xAxis: valueAxis(t, {
      name: xName,
      nameLocation: "middle",
      nameGap: 26,
      nameTextStyle: { color: t.muted, fontSize: 11 },
      scale: true,
      splitLine: { show: false },
      axisLine: { show: true, lineStyle: { color: t.axis } },
      axisLabel: { color: t.muted, fontSize: 11, formatter: xFormat, hideOverlap: true },
    }),
    yAxis: pctAxis(t),
    tooltip: {
      ...(base(t).tooltip as object),
      trigger: "item",
      formatter: (p: { dataIndex: number }) => {
        const d = points[p.dataIndex];
        return head(d.label) + row(t.focus, formatPct(d.y), m.charts.scatterTip(xName, xFormat(d.x)));
      },
    },
    series: [
      {
        type: "scatter",
        data: points.map((p) => [p.x, p.y]),
        symbolSize: 9,
        itemStyle: { color: t.focus, opacity: 0.8, borderColor: t.surface, borderWidth: 1.5 },
        emphasis: { scale: 1.4, itemStyle: { opacity: 1 } },
      },
    ],
  };
}

export function histogramOption(t: ChartTheme, m: Messages, bins: number[], width: number): Opt {
  const labels = bins.map((_, i) => `${Math.round(i * width * 100)}–${Math.round((i + 1) * width * 100)}%`);
  return {
    ...base(t),
    grid: { left: 32, right: 8, top: 16, bottom: 28 },
    xAxis: categoryAxis(t, labels, {
      axisLabel: { color: t.muted, fontSize: 10, interval: 0, hideOverlap: true, formatter: (_: string, i: number) => `${Math.round(i * width * 100)}%` },
    }),
    yAxis: valueAxis(t, { minInterval: 1 }),
    tooltip: {
      ...(base(t).tooltip as object),
      trigger: "item",
      formatter: (p: { dataIndex: number; value: number }) => head(m.charts.histHead(labels[p.dataIndex])) + row(t.focus, `${p.value}`, m.charts.histCount(p.value)),
    },
    series: [
      {
        type: "bar",
        data: bins,
        barCategoryGap: "18%",
        itemStyle: { color: t.focus, borderRadius: [4, 4, 0, 0], borderColor: t.surface, borderWidth: 2 },
      },
    ],
  };
}

/** Focus hours (top) and ratio (bottom) as two aligned panels, never two y-scales on one plot. */
export function periodOption(t: ChartTheme, m: Messages, rows: { label: string; focus: number; ratio: number | null; days: number }[]): Opt {
  const labels = rows.map((r) => r.label);
  const ratios = rows.map((r) => r.ratio);
  return {
    ...base(t),
    grid: [
      { left: 40, right: 16, top: 24, height: "42%" },
      { left: 40, right: 16, bottom: 28, height: "28%" },
    ],
    xAxis: [
      categoryAxis(t, labels, { gridIndex: 0, axisLabel: { show: false } }),
      categoryAxis(t, labels, { gridIndex: 1 }),
    ],
    yAxis: [
      valueAxis(t, { gridIndex: 0, name: m.charts.focusHours, nameTextStyle: { color: t.muted, fontSize: 11, align: "left" }, axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => `${v}` } }),
      { ...pctAxis(t, ratioFloor(ratios)), gridIndex: 1, name: m.common.focusRate, nameTextStyle: { color: t.muted, fontSize: 11, align: "left" } },
    ],
    axisPointer: { link: [{ xAxisIndex: "all" }], lineStyle: { color: t.axis } },
    tooltip: {
      ...(base(t).tooltip as object),
      trigger: "axis",
      axisPointer: { type: "line" },
      formatter: (ps: { dataIndex: number }[]) => {
        const r = rows[ps[0].dataIndex];
        return head(r.label) + row(t.focus, m.fmt.minutes(r.focus), m.charts.periodTip(r.days)) + row(t.focus, formatPct(r.ratio), m.common.focusRate.toLowerCase());
      },
    },
    series: [
      {
        type: "bar",
        xAxisIndex: 0,
        yAxisIndex: 0,
        barMaxWidth: 20,
        data: rows.map((r) => +(r.focus / 60).toFixed(1)),
        itemStyle: { color: t.focus, borderRadius: [4, 4, 0, 0] },
      },
      {
        type: "line",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: ratios,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 2, color: t.focus },
        itemStyle: { color: t.focus, borderColor: t.surface, borderWidth: 2 },
      },
    ],
  };
}

/** Per-course focus ratio as horizontal bars, labelled with the ratio and the blocks behind it. */
export function courseRatioOption(
  t: ChartTheme,
  m: Messages,
  rows: { name: string; color: string; ratio: number | null; blocks: number; minutes: number }[],
  target: number,
): Opt {
  const names = rows.map((r) => r.name);
  const labelWidth = Math.min(110, Math.max(36, ...names.map((n) => n.length * 9)));
  return {
    ...base(t),
    grid: { left: labelWidth + 14, right: 92, top: 26, bottom: 24 },
    xAxis: pctAxis(t),
    yAxis: categoryAxis(t, names, { inverse: true, axisLine: { show: false }, axisLabel: { color: t.ink2, fontSize: 12, width: labelWidth, overflow: "truncate" } }),
    tooltip: {
      ...(base(t).tooltip as object),
      trigger: "item",
      formatter: (p: { dataIndex: number }) => {
        const r = rows[p.dataIndex];
        return head(r.name) + row(r.color, formatPct(r.ratio), m.charts.courseTip(r.blocks, m.fmt.minutes(r.minutes)));
      },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 16,
        z: 3,
        animationDelay: (i: number) => i * 60,
        data: rows.map((r) => ({ value: r.ratio, itemStyle: { color: r.color } })),
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: "right",
          distance: 8,
          color: t.ink2,
          fontSize: 12,
          formatter: (p: { dataIndex: number }) => `${formatPct(rows[p.dataIndex].ratio)}  {n|${m.charts.blocks(rows[p.dataIndex].blocks)}}`,
          rich: { n: { color: t.muted, fontSize: 11 } },
          // Sit above the target line instead of being crossed by it.
          backgroundColor: t.surface,
          padding: [2, 4],
        },
        markLine:
          target > 0
            ? {
                silent: true,
                symbol: "none",
                z: 1,
                lineStyle: { color: t.target, width: 1, type: [4, 4] },
                label: { formatter: m.charts.target(formatPct(target)), color: t.muted, fontSize: 11, position: "start", distance: 6 },
                data: [{ xAxis: target }],
              }
            : undefined,
      },
    ],
  };
}
