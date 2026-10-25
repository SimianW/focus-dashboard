// A small typed i18n layer. Each dictionary holds plain strings and message
// functions (interpolation, plurals, dates, durations); English is the source
// of truth and Messages = typeof en forces every other dictionary to match it.
//
// The language lives in a module-level store so non-React code (api.ts) can
// read it too. The server setting is the truth once signed in; the last known
// value is cached in localStorage for the login screen and first paint.
import { useSyncExternalStore } from "react";
import type { Language } from "../stats";
import { en } from "./en";
import { zh } from "./zh";

export type Messages = typeof en;

export const LANGUAGES: readonly Language[] = ["en", "zh"];

export const DICTIONARIES: Record<Language, Messages> = { en, zh };

const KEY = "focus-language";

export const isLanguage = (v: unknown): v is Language => LANGUAGES.includes(v as Language);

function readCache(): Language {
  try {
    const v = localStorage.getItem(KEY);
    return isLanguage(v) ? v : "en";
  } catch {
    return "en";
  }
}

let current: Language = typeof localStorage === "undefined" ? "en" : readCache();
const listeners = new Set<() => void>();

function applyToDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = DICTIONARIES[current].htmlLang;
  document.title = DICTIONARIES[current].app.title;
}
applyToDocument();

export const getLanguage = () => current;

/** The current dictionary, for code outside React. */
export const messages = () => DICTIONARIES[current];

/** Switches the whole UI at once and remembers the choice on this device. */
export function setLanguage(lang: Language) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* private mode: the server setting still applies after sign-in */
  }
  if (lang === current) return;
  current = lang;
  applyToDocument();
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The current dictionary; re-renders the component when the language changes. */
export const useT = (): Messages => useSyncExternalStore(subscribe, messages);

/** Renders a "rich" message: **…** spans become <b>. */
export function Rich({ text }: { text: string }) {
  const parts = text.split("**");
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}
