import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { Session } from "./stats";

// With its two hooks stubbed, Timeline is a plain function of its props.
vi.mock("./store", () => ({ useData: () => ({ courseSlot: () => 1 }), courseVar: (n: number) => `var(--course-${n})` }));
vi.mock("./i18n", async () => {
  const { en } = await import("./i18n/en");
  return { useT: () => en };
});

const { Timeline } = await import("./components/Timeline");

/** Every element in the tree with the given class name. */
function find(node: ReactNode, className: string): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((n) => find(n, className));
  if (!isValidElement(node)) return [];
  const props = node.props as { className?: string; children?: ReactNode };
  return [...(props.className === className ? [node] : []), ...find(props.children, className)];
}

describe("Timeline", () => {
  it("keys two rows of the same course in one block apart", () => {
    const block: Session = {
      id: 1,
      date: "2026-11-20",
      start: "09:00",
      end: "11:00",
      courses: [
        { course: "CS341", minutes: 30, task: { id: "t1", title: "A2", subject: "CS341" } },
        { course: "CS341", minutes: 20, task: null },
      ],
      energy: null,
      interruptions: null,
      note: "",
    };
    const keys = find(Timeline({ sessions: [block] }), "tl-seg").map((e) => e.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});
