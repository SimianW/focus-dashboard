import { useEffect, useRef, useState } from "react";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
export const prefersReducedMotion = () => reduce.matches;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts up from 0 to `target` once, when the component first shows a value.
 * Later changes (a data refresh) snap straight to the new value; a change
 * mid-count restarts the count toward the new target.
 */
export function useCountUp(target: number, duration = 900): number {
  const done = useRef(prefersReducedMotion());
  const [value, setValue] = useState(done.current ? target : 0);

  useEffect(() => {
    if (done.current) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setValue(target * easeOut(p));
      if (p < 1) raf = requestAnimationFrame(tick);
      else done.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
