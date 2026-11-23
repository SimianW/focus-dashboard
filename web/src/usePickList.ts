import { useEffect, useState } from "react";
import { api } from "./api";
import type { PickList } from "./pick";

// The last answer, shared by every screen, so the picker opens at once.
// undefined: never answered yet. null: the request failed (same as unavailable).
let cache: PickList | null | undefined;
let inflight: Promise<PickList | null> | null = null;

function refresh(): Promise<PickList | null> {
  inflight ??= api
    .pickList()
    .catch(() => null)
    .then((list) => {
      cache = list;
      inflight = null;
      return list;
    });
  return inflight;
}

/**
 * life-os's pick list, fetched when the screen mounts so "Start studying"
 * feels instant. `list` is undefined while the first answer is on its way;
 * `wait` resolves with the answer to use.
 */
export function usePickList() {
  const [list, setList] = useState(cache);
  useEffect(() => {
    let live = true;
    refresh().then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, []);
  return { list, wait: () => (list !== undefined ? Promise.resolve(list) : refresh()) };
}
