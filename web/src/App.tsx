import { useCallback, useEffect, useRef, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";
import { DataProvider } from "./store";
import { link, matchRoute, useLocation, type Route } from "./router";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Entry } from "./pages/Entry";
import { Records } from "./pages/Records";
import { DayDetail } from "./pages/DayDetail";
import { Patterns } from "./pages/Patterns";
import { SettingsPage } from "./pages/Settings";
import { useT, type Messages } from "./i18n";

type Auth = "checking" | "in" | "out";

export function App() {
  const [auth, setAuth] = useState<Auth>("checking");

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth("out"));
    api.me().then(
      () => setAuth("in"),
      () => setAuth("out"),
    );
  }, []);

  if (auth === "checking") return <div className="boot" aria-busy="true" />;
  if (auth === "out") return <Login onDone={() => setAuth("in")} />;
  return <Shell onLogout={() => setAuth("out")} />;
}

const TABS: { to: string; label: keyof Messages["app"]; match: Route["name"][] }[] = [
  { to: "/", label: "overview", match: ["overview"] },
  { to: "/records", label: "records", match: ["records", "day", "edit"] },
  { to: "/patterns", label: "patterns", match: ["patterns"] },
  { to: "/settings", label: "settings", match: ["settings"] },
];

function Shell({ onLogout }: { onLogout: () => void }) {
  const t = useT();
  const { path, query } = useLocation();
  const route = matchRoute(path, query);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number>(undefined);
  const showToast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const active = (t: (typeof TABS)[number]) => t.match.includes(route.name);

  return (
    <DataProvider onToast={showToast}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" {...link("/")}>
            <BrandMark />
            {t.app.brand}
          </a>
          <nav className="tabs" aria-label={t.app.mainNav}>
            {TABS.map((tab) => (
              <a key={tab.to} className="tab" aria-current={active(tab) ? "page" : undefined} {...link(tab.to)}>
                {t.app[tab.label]}
              </a>
            ))}
          </nav>
          <a className="btn btn-accent add-top" aria-current={route.name === "add" ? "page" : undefined} {...link("/add")}>
            <PlusIcon /> {t.app.logBlock}
          </a>
        </div>
      </header>

      <main className="page" key={route.name === "day" || route.name === "edit" ? path : route.name}>
        <Page route={route} onLogout={onLogout} />
      </main>

      <nav className="bottombar" aria-label={t.app.mainNav}>
        {TABS.slice(0, 2).map((tab) => (
          <a key={tab.to} className="bb-tab" aria-current={active(tab) ? "page" : undefined} {...link(tab.to)}>
            <TabIcon name={tab.to} />
            {t.app[tab.label]}
          </a>
        ))}
        <a className="bb-add" aria-label={t.app.logBlock} aria-current={route.name === "add" ? "page" : undefined} {...link("/add")}>
          <PlusIcon />
        </a>
        {TABS.slice(2).map((tab) => (
          <a key={tab.to} className="bb-tab" aria-current={active(tab) ? "page" : undefined} {...link(tab.to)}>
            <TabIcon name={tab.to} />
            {t.app[tab.label]}
          </a>
        ))}
      </nav>

      <div className="toast" role="status" aria-live="polite" data-show={toast ? "" : undefined}>
        {toast}
      </div>
    </DataProvider>
  );
}

function Page({ route, onLogout }: { route: Route; onLogout: () => void }) {
  switch (route.name) {
    case "overview":
      return <Overview />;
    case "add":
      return <Entry date={route.date} startNow={route.startNow} />;
    case "edit":
      return <Entry id={route.id} />;
    case "records":
      return <Records month={route.month} />;
    case "day":
      return <DayDetail date={route.date} />;
    case "patterns":
      return <Patterns />;
    case "settings":
      return <SettingsPage onLogout={onLogout} />;
  }
}

/** The product in one picture: a study block, two courses and a rest. */
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true" className={className}>
      <path d="M3 0H12V12H3A3 3 0 0 1 0 9V3A3 3 0 0 1 3 0Z" fill="var(--clay)" />
      <rect x="13.5" y="0" width="5" height="12" fill="var(--course-1)" />
      <path d="M20 0H23A3 3 0 0 1 26 3V9A3 3 0 0 1 23 12H20Z" fill="var(--unfocused)" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TabIcon({ name }: { name: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      {name === "/" && <path {...p} d="M3 17l5-6 4 3 7-9" />}
      {name === "/records" && (
        <>
          <rect {...p} x="3" y="4" width="16" height="15" rx="2" />
          <path {...p} d="M3 9h16M8 2v4M14 2v4" />
        </>
      )}
      {name === "/patterns" && (
        <>
          <circle {...p} cx="7" cy="14" r="1.6" />
          <circle {...p} cx="11" cy="9" r="1.6" />
          <circle {...p} cx="16" cy="6" r="1.6" />
          <path {...p} d="M3 19h16" />
        </>
      )}
      {name === "/settings" && (
        <>
          <path {...p} d="M4 6h8M16 6h2M4 16h2M10 16h8" />
          <circle {...p} cx="14" cy="6" r="2" />
          <circle {...p} cx="8" cy="16" r="2" />
        </>
      )}
    </svg>
  );
}
