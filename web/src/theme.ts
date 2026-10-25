import { useSyncExternalStore } from "react";

// Chart colours come from CSS custom properties so light and dark are each
// chosen in one place (styles.css) and charts repaint when the OS flips.
const query = window.matchMedia("(prefers-color-scheme: dark)");

function subscribe(fn: () => void) {
  query.addEventListener("change", fn);
  return () => query.removeEventListener("change", fn);
}

export const useDarkMode = () => useSyncExternalStore(subscribe, () => query.matches);

export type ChartTheme = ReturnType<typeof readTheme>;

export function readTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    dark: query.matches,
    surface: v("--panel"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    muted: v("--muted"),
    grid: v("--grid"),
    axis: v("--axis"),
    focus: v("--focus"),
    focusSoft: v("--focus-soft"),
    unfocused: v("--unfocused"),
    trend: v("--trend"),
    target: v("--target"),
    heat: [v("--heat-0"), v("--heat-1"), v("--heat-2"), v("--heat-3"), v("--heat-4")],
    courses: [1, 2, 3, 4, 5, 6].map((i) => v(`--course-${i}`)),
    courseOther: v("--course-other"),
    font: v("--sans"),
    serif: v("--serif"),
  };
}

/** Chart colour for a course slot from the store (0 = 其他). */
export const courseColor = (t: ChartTheme, slot: number) => (slot ? t.courses[slot - 1] : t.courseOther);

export function useChartTheme(): ChartTheme {
  const dark = useDarkMode();
  // Re-read whenever the scheme changes; the values are cheap to compute.
  return useSyncExternalStore(subscribe, () => cached(dark));
}

let cache: { dark: boolean; theme: ChartTheme } | null = null;
function cached(dark: boolean) {
  if (!cache || cache.dark !== dark) cache = { dark, theme: readTheme() };
  return cache.theme;
}
