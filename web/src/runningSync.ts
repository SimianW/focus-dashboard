// The page's side of the running block: reads and writes of the one block in
// progress on the server. Every write names the block its caller is editing
// (what it believes the server holds), so the server refuses (409) a write
// from a stale view instead of overwriting another device's newer block.
import type { Draft } from "./draft";
import { formBlock, openedWith, readBack, type Running, type RunningInput } from "./running";

/** A running block's date and start: which block a write expects to find. */
export type RunningKey = { date: string; start: string };

/** The server, as the API speaks to it. A 409 is an error with `status` and `data.running`. */
export type RunningIo = {
  read(): Promise<Running | null>;
  put(r: RunningInput, expected: RunningKey | null): Promise<Running>;
  delete(expected: RunningKey): Promise<void>;
};

/** "ok" once the server has it, "conflict" when another device changed the block first. */
export type Outcome = "ok" | "conflict" | "failed";

/** The block the server holds instead, when `e` is its 409; else undefined. */
const conflictOf = (e: unknown): Running | null | undefined => {
  const err = e as { status?: number; data?: { running?: Running | null } };
  return err?.status === 409 ? (err.data?.running ?? null) : undefined;
};

/** The key of a block, null for none. */
export const keyOf = (r: { date: string; start: string } | null | undefined): RunningKey | null => (r ? { date: r.date, start: r.start } : null);

const id = (k: RunningKey | null) => (k ? `${k.date} ${k.start}` : "");
const same = (a: RunningKey | null, b: RunningKey | null) => id(a) === id(b);

/** A write on its way: the block it sends (null: End), the block it expects, and its outcome. */
export type Sending = { block: RunningInput | null; expected: RunningKey | null; outcome: Promise<Outcome> };

export function runningSync(
  io: RunningIo,
  on: { change(r: Running | null | undefined): void; conflict(): void; error(e: Error): void },
) {
  // What the page shows: the server's last answer, or a write on its way.
  const show = on.change;
  // The server's last answer (a read, a write's answer, a 409's block).
  let confirmed: Running | null | undefined;
  // Blocks this page asked for that the server never answered (network,
  // 5xx), each with what the server held instead. A caller that still
  // believes it sent one expects that instead. Forgotten once the server is
  // seen holding it after all (the answer was lost, not the request).
  const lost = new Map<string, RunningKey | null>();
  const confirm = (r: Running | null) => {
    confirmed = r;
    lost.delete(id(keyOf(r)));
  };
  // Writes go out one at a time, in order; `version` counts them, so the
  // answer to an older one never replaces what a newer one shows.
  let queue: Promise<unknown> = Promise.resolve();
  let version = 0;
  let pending = 0;
  // The newest write still on its way, if any.
  let sending: Sending | null = null;

  return {
    /** The server's last answer; undefined until one came. */
    get confirmed() {
      return confirmed;
    },
    /** The newest write still on its way (null: none). */
    get sending() {
      return sending;
    },
    /**
     * True when this page asked for that block and the server never answered
     * (network, 5xx), and no read has shown it since: it may never have
     * reached the server, so its absence there says nothing about it.
     */
    undelivered(k: RunningKey): boolean {
      return lost.has(id(k));
    },
    /**
     * Reads the block again and returns it, or undefined when it could not
     * or a write on its way (newer than any answer) kept it out. Never throws.
     */
    async read(): Promise<Running | null | undefined> {
      if (pending) return undefined;
      const v = version;
      const r = await io.read().catch(() => undefined);
      if (r === undefined || v !== version) return undefined;
      confirm(r);
      show(r);
      return r;
    },
    /**
     * Starts or updates (PUT), or with null ends (DELETE), the running block.
     * `expected` is the block the caller is editing: the one it opened with
     * or last asked for (counting writes still on their way), null for none.
     * Never throws; on a failure without an answer the page shows the
     * server's last block again.
     */
    write(next: RunningInput | null, expected: RunningKey | null): Promise<Outcome> {
      const v = ++version;
      const w: Sending = { block: next, expected, outcome: undefined as unknown as Promise<Outcome> };
      show(next && readBack(next));
      pending++;
      const send = async (): Promise<Outcome> => {
        // Sent once earlier writes are answered, so a lost one is known by now.
        const held = lost.has(id(expected)) ? lost.get(id(expected))! : expected;
        try {
          if (next) {
            const saved = await io.put(next, held);
            confirm(saved);
            if (v === version) show(saved);
          } else if (held) {
            await io.delete(held);
            confirm(null);
          }
          return "ok";
        } catch (e) {
          const server = conflictOf(e);
          if (server === undefined) {
            const asked = keyOf(next);
            if (!same(asked, held)) lost.set(id(asked), held);
            if (v === version) show(confirmed);
            on.error(e as Error);
            return "failed";
          }
          confirm(server);
          if (v === version) {
            show(server);
            on.conflict();
          }
          return "conflict";
        } finally {
          pending--;
          if (sending === w) sending = null;
        }
      };
      const result = queue.then(send);
      queue = result;
      w.outcome = result;
      sending = w;
      return result;
    },
  };
}

export type RunningSync = ReturnType<typeof runningSync>;

/**
 * A new-entry form's own block (see formBlock) as it opens on `form`. It
 * starts from the block the server confirmed, not one the page merely shows.
 * A write still on its way for this form's block (Start tapped on Overview a
 * moment ago, or the form's own write from before it was left) is one the
 * form waits on, as if it had sent it: the form's block once it succeeds; if
 * it fails, the form stays on the confirmed block and so sends it again.
 * `settled` resolves once that write is answered (null: no write to wait on).
 */
export function openFormBlock(form: Draft, sync: Pick<RunningSync, "confirmed" | "sending">) {
  const own = formBlock(openedWith(form, sync.confirmed));
  const w = sync.sending;
  // A PUT is for the block it sends; an End for the block it expects.
  if (!w || !same(w.block ? keyOf(w.block) : w.expected, keyOf(form))) return { own, settled: null };
  const write = own.ask(w.block);
  return { own, settled: w.outcome.then((o) => write.settle(o === "ok")) };
}
