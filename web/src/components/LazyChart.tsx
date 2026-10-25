import { lazy, Suspense, type ComponentProps } from "react";

// ECharts is most of the bundle; load it after the shell so login and the
// entry form appear quickly on a phone.
const Inner = lazy(() => import("./Chart").then((m) => ({ default: m.Chart })));

export function Chart(props: ComponentProps<typeof Inner>) {
  return (
    <Suspense fallback={<div className="chart" style={{ height: props.height }} />}>
      <Inner {...props} />
    </Suspense>
  );
}
