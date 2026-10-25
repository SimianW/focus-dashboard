import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import {
  CalendarComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { prefersReducedMotion } from "../motion";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

type Props = {
  option: EChartsCoreOption;
  height: number;
  label: string; // accessible description of the chart
  onClick?: (params: echarts.ECElementEvent) => void;
};

export function Chart({ option, height, label, onClick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    const c = echarts.init(el.current!, undefined, { renderer: "canvas" });
    chart.current = c;
    c.on("click", (p) => clickRef.current?.(p as echarts.ECElementEvent));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  // Animate the entrance once; later option changes (a refresh, a theme flip,
  // a resize-driven rebuild) redraw in place.
  const drawn = useRef(false);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const animate = !drawn.current && !prefersReducedMotion();
    c.setOption({ ...option, animation: animate }, { notMerge: true });
    drawn.current = true;
  }, [option]);

  return <div ref={el} className="chart" style={{ height }} role="img" aria-label={label} />;
}
