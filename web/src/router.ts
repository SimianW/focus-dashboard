import { useSyncExternalStore } from "react";

// A minimal History API router; the server falls back to index.html for any path.
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("popstate", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("popstate", fn);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

export function navigate(to: string, { replace = false } = {}) {
  if (to === snapshot()) return;
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  window.scrollTo(0, 0);
  listeners.forEach((fn) => fn());
}

export function useLocation() {
  const loc = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(loc, window.location.origin);
  return { path: url.pathname, query: url.searchParams };
}

export type Route =
  | { name: "overview" }
  | { name: "add"; date?: string; startNow?: boolean }
  | { name: "edit"; id: number }
  | { name: "records"; month?: string }
  | { name: "day"; date: string }
  | { name: "patterns" }
  | { name: "settings" };

export function matchRoute(path: string, query: URLSearchParams): Route {
  let m: RegExpExecArray | null;
  if (path === "/add") return { name: "add", date: query.get("date") ?? undefined, startNow: query.get("start") === "now" };
  if ((m = /^\/edit\/(\d+)$/.exec(path))) return { name: "edit", id: Number(m[1]) };
  if (path === "/records") return { name: "records", month: query.get("month") ?? undefined };
  if ((m = /^\/day\/(\d{4}-\d{2}-\d{2})$/.exec(path))) return { name: "day", date: m[1] };
  if (path === "/patterns") return { name: "patterns" };
  if (path === "/settings") return { name: "settings" };
  return { name: "overview" };
}

/** Props for an <a> that navigates client-side but still works as a link. */
export function link(to: string) {
  return {
    href: to,
    onClick: (e: React.MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
  };
}
