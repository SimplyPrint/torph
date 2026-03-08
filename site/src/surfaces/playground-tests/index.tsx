"use client";

import styles from "./styles.module.scss";
import React from "react";
import { TextMorph } from "torph/react";
import { segmentText, diffSegments, DEFAULT_TEXT_MORPH_OPTIONS } from "torph";
import type { Segment } from "torph";
import { Button } from "@/components/button";
import { Tooltip } from "@/components/tooltip";
import bundleSizes from "./bundle-sizes.json";
import pkg from "../../../../packages/torph/package.json";

type VerifyFn = () => { pass: boolean; detail: string };
type VerifyDomFn = (root: HTMLElement) => { pass: boolean; detail: string };

type TestCase = {
  label: string;
  description: string;
  tags: string[];
  values: string[];
  align?: React.CSSProperties["textAlign"];
  verify?: VerifyFn;
  verifyDom?: VerifyDomFn;
};

function verifyWordPersistence(
  from: string,
  to: string,
  word: string,
): { pass: boolean; detail: string } {
  const old = segmentText(from, "en");
  const { segments } = diffSegments(old, to, "en");
  const oldSeg = old.find((s: Segment) => s.string === word);
  const newSeg = segments.find((s: Segment) => s.string === word);
  if (!oldSeg || !newSeg) {
    return {
      pass: false,
      detail: `"${word}" missing in ${!oldSeg ? "old" : "new"}`,
    };
  }
  const pass = oldSeg.id === newSeg.id;
  return {
    pass,
    detail: pass
      ? `"${word}" ID persists`
      : `"${word}" ID changed: ${oldSeg.id} → ${newSeg.id}`,
  };
}

function verifyCharMorph(
  from: string,
  to: string,
  splitWord: string,
): { pass: boolean; detail: string } {
  const old = segmentText(from, "en");
  const { splits } = diffSegments(old, to, "en");
  const pass = splits.has(splitWord);
  return {
    pass,
    detail: pass
      ? `"${splitWord}" split into chars`
      : `"${splitWord}" was NOT split`,
  };
}

function verifyNoMorph(
  from: string,
  to: string,
): { pass: boolean; detail: string } {
  const old = segmentText(from, "en");
  const { splits } = diffSegments(old, to, "en");
  const pass = splits.size === 0;
  return {
    pass,
    detail: pass
      ? "No char splits (correct)"
      : `Unexpected splits: ${[...splits.keys()].join(", ")}`,
  };
}

function verifyCycleStability(
  a: string,
  b: string,
  word: string,
): { pass: boolean; detail: string } {
  let prev = segmentText(a, "en");
  const originalId = prev.find((s: Segment) => s.string === word)?.id;
  if (!originalId)
    return { pass: false, detail: `"${word}" not found in "${a}"` };

  for (let i = 0; i < 4; i++) {
    const target = i % 2 === 0 ? b : a;
    const { segments } = diffSegments(prev, target, "en");
    const seg = segments.find((s: Segment) => s.string === word);
    if (!seg || seg.id !== originalId) {
      return { pass: false, detail: `"${word}" ID changed at cycle ${i + 1}` };
    }
    prev = segments;
  }
  return { pass: true, detail: `"${word}" ID stable across 4 cycles` };
}

function verifyWordAbsent(
  from: string,
  to: string,
  word: string,
): { pass: boolean; detail: string } {
  const old = segmentText(from, "en");
  const { segments } = diffSegments(old, to, "en");
  const found = segments.find((s: Segment) => s.string === word);
  const pass = !found;
  return {
    pass,
    detail: pass
      ? `"${word}" correctly absent`
      : `"${word}" unexpectedly present`,
  };
}

function verifyGraphemeMorph(
  from: string,
  to: string,
  sharedChars: string[],
): { pass: boolean; detail: string } {
  const oldSegs = segmentText(from, "en");
  const newSegs = segmentText(to, "en");
  const oldChars = oldSegs.map((s: Segment) => s.string);
  const newChars = newSegs.map((s: Segment) => s.string);
  const allShared = sharedChars.every(
    (c) => oldChars.includes(c) && newChars.includes(c),
  );
  return {
    pass: allShared,
    detail: allShared
      ? `Shared chars [${sharedChars.join(",")}] present in both`
      : `Some shared chars missing`,
  };
}

function combineResults(...results: { pass: boolean; detail: string }[]) {
  const pass = results.every((r) => r.pass);
  return { pass, detail: results.map((r) => r.detail).join("; ") };
}

// ── DOM verification helpers ──

function verifyItemsInBounds(root: HTMLElement): {
  pass: boolean;
  detail: string;
} {
  const rootRect = root.getBoundingClientRect();
  const items = root.querySelectorAll<HTMLElement>(
    "[torph-item]:not([torph-exiting])",
  );
  const oob: string[] = [];
  items.forEach((item) => {
    if (item.tagName === "BR") return;
    const r = item.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const tolerance = 2;
    if (
      r.left < rootRect.left - tolerance ||
      r.right > rootRect.right + tolerance ||
      r.top < rootRect.top - tolerance ||
      r.bottom > rootRect.bottom + tolerance
    ) {
      const text = item.textContent?.trim() || "?";
      oob.push(`"${text}" out of bounds`);
    }
  });
  if (oob.length > 0) return { pass: false, detail: oob.join(", ") };
  return { pass: true, detail: "all items within bounds" };
}

function verifyNoOverflow(root: HTMLElement): {
  pass: boolean;
  detail: string;
} {
  const tolerance = 2;
  const overflowW = root.scrollWidth - root.offsetWidth > tolerance;
  const overflowH = root.scrollHeight - root.offsetHeight > tolerance;
  if (overflowW || overflowH) {
    return {
      pass: false,
      detail: `overflow: scroll=${root.scrollWidth}x${root.scrollHeight} offset=${root.offsetWidth}x${root.offsetHeight}`,
    };
  }
  return { pass: true, detail: "no overflow" };
}

function verifyExitCleanup(root: HTMLElement): {
  pass: boolean;
  detail: string;
} {
  const exiting = root.querySelectorAll("[torph-exiting]");
  if (exiting.length > 0) {
    return { pass: false, detail: `${exiting.length} exiting elements remain` };
  }
  return { pass: true, detail: "no stale exits" };
}

function verifyAlignment(
  root: HTMLElement,
  align: "left" | "center" | "right",
): { pass: boolean; detail: string } {
  const rootRect = root.getBoundingClientRect();
  const lines = getVisualLines(root);
  if (lines.length === 0) return { pass: true, detail: "no lines to check" };

  const tolerance = 4;
  const failures: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineLeft = Math.min(...line.map((r) => r.left));
    const lineRight = Math.max(...line.map((r) => r.right));

    if (align === "left") {
      if (Math.abs(lineLeft - rootRect.left) > tolerance) {
        failures.push(
          `line ${i + 1} not left-aligned (gap=${(lineLeft - rootRect.left).toFixed(1)}px)`,
        );
      }
    } else if (align === "right") {
      if (Math.abs(lineRight - rootRect.right) > tolerance) {
        failures.push(
          `line ${i + 1} not right-aligned (gap=${(rootRect.right - lineRight).toFixed(1)}px)`,
        );
      }
    } else if (align === "center") {
      const lineMid = (lineLeft + lineRight) / 2;
      const rootMid = (rootRect.left + rootRect.right) / 2;
      if (Math.abs(lineMid - rootMid) > tolerance) {
        failures.push(
          `line ${i + 1} not centered (off=${(lineMid - rootMid).toFixed(1)}px)`,
        );
      }
    }
  }

  if (failures.length > 0) return { pass: false, detail: failures.join(", ") };
  return { pass: true, detail: `${align}-aligned ok` };
}

function getVisualLines(root: HTMLElement): DOMRect[][] {
  const items = root.querySelectorAll<HTMLElement>(
    "[torph-item]:not([torph-exiting]):not(br)",
  );
  if (items.length === 0) return [];

  const lines: DOMRect[][] = [];
  let currentLine: DOMRect[] = [];
  let lastTop = -Infinity;

  items.forEach((item) => {
    const r = item.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (currentLine.length > 0 && Math.abs(r.top - lastTop) > r.height * 0.5) {
      lines.push(currentLine);
      currentLine = [];
    }
    currentLine.push(r);
    lastTop = r.top;
  });
  if (currentLine.length > 0) lines.push(currentLine);
  return lines;
}

function verifyMultiline(
  root: HTMLElement,
  expectedMinLines: number,
): { pass: boolean; detail: string } {
  const lines = getVisualLines(root);
  if (lines.length < expectedMinLines) {
    return {
      pass: false,
      detail: `expected ${expectedMinLines}+ lines, got ${lines.length}`,
    };
  }
  return { pass: true, detail: `${lines.length} lines` };
}

function isIdentityOrNone(transform: string): boolean {
  if (!transform || transform === "none") return true;
  // matrix(1, 0, 0, 1, 0, 0) is identity — fill:both animations may report this
  const match = transform.match(/matrix\(([^)]+)\)/);
  if (!match) return false;
  const v = match[1]!.split(",").map((s) => parseFloat(s.trim()));
  return (
    Math.abs(v[0]! - 1) < 0.01 &&
    Math.abs(v[1]!) < 0.01 &&
    Math.abs(v[2]!) < 0.01 &&
    Math.abs(v[3]! - 1) < 0.01 &&
    Math.abs(v[4]!) < 1 &&
    Math.abs(v[5]!) < 1
  );
}

function verifyNoTransformResidue(root: HTMLElement): {
  pass: boolean;
  detail: string;
} {
  const items = root.querySelectorAll<HTMLElement>(
    "[torph-item]:not([torph-exiting]):not(br)",
  );
  const stuck: string[] = [];
  items.forEach((item) => {
    const t = getComputedStyle(item).transform;
    if (!isIdentityOrNone(t)) {
      stuck.push(`"${item.textContent?.trim() || "?"}" transform=${t}`);
    }
  });
  if (stuck.length > 0) return { pass: false, detail: stuck.join(", ") };
  return { pass: true, detail: "no transform residue" };
}

function verifyNoOpacityResidue(root: HTMLElement): {
  pass: boolean;
  detail: string;
} {
  const items = root.querySelectorAll<HTMLElement>(
    "[torph-item]:not([torph-exiting]):not(br)",
  );
  const stuck: string[] = [];
  items.forEach((item) => {
    const o = Number(getComputedStyle(item).opacity);
    if (o < 0.99) {
      stuck.push(
        `"${item.textContent?.trim() || "?"}" opacity=${o.toFixed(2)}`,
      );
    }
  });
  if (stuck.length > 0) return { pass: false, detail: stuck.join(", ") };
  return { pass: true, detail: "no opacity residue" };
}

function verifyStyleCleanup(root: HTMLElement): {
  pass: boolean;
  detail: string;
} {
  const items = root.querySelectorAll<HTMLElement>(
    "[torph-item]:not([torph-exiting]):not(br)",
  );
  const issues: string[] = [];
  items.forEach((item) => {
    if (item.style.position === "absolute") {
      issues.push(`"${item.textContent?.trim() || "?"}" has position:absolute`);
    }
    if (item.style.width && item.style.width !== "auto") {
      issues.push(
        `"${item.textContent?.trim() || "?"}" has width:${item.style.width}`,
      );
    }
    if (item.style.height && item.style.height !== "auto") {
      issues.push(
        `"${item.textContent?.trim() || "?"}" has height:${item.style.height}`,
      );
    }
  });
  if (issues.length > 0) return { pass: false, detail: issues.join(", ") };
  return { pass: true, detail: "no stale inline styles" };
}

function verifyNoDuplicateIds(root: HTMLElement): {
  pass: boolean;
  detail: string;
} {
  const items = root.querySelectorAll<HTMLElement>(
    "[torph-item]:not([torph-exiting])",
  );
  const seen = new Map<string, number>();
  items.forEach((item) => {
    const id = item.getAttribute("torph-id");
    if (id) seen.set(id, (seen.get(id) || 0) + 1);
  });
  const dupes = [...seen.entries()].filter(([, count]) => count > 1);
  if (dupes.length > 0) {
    return {
      pass: false,
      detail: dupes.map(([id, n]) => `"${id}" ×${n}`).join(", "),
    };
  }
  return { pass: true, detail: "no duplicate IDs" };
}

function verifyContainerSizeMatch(root: HTMLElement): {
  pass: boolean;
  detail: string;
} {
  const tolerance = 2;
  const hasStaleWidth =
    root.style.width &&
    root.style.width !== "auto" &&
    Math.abs(parseFloat(root.style.width) - root.scrollWidth) > tolerance;
  const hasStaleHeight =
    root.style.height &&
    root.style.height !== "auto" &&
    Math.abs(parseFloat(root.style.height) - root.scrollHeight) > tolerance;
  if (hasStaleWidth || hasStaleHeight) {
    return {
      pass: false,
      detail: `stale size: style=${root.style.width}×${root.style.height} actual=${root.scrollWidth}×${root.scrollHeight}`,
    };
  }
  return { pass: true, detail: "container size matches content" };
}

function verifyBrMatchesContent(root: HTMLElement): {
  pass: boolean;
  detail: string;
} {
  const lines = getVisualLines(root);
  const brs = root.querySelectorAll("br[torph-item]");
  // BRs should be >= lines - 1 (consecutive newlines create blank lines with no text items)
  const minExpectedBrs = Math.max(0, lines.length - 1);
  if (lines.length <= 1 && brs.length === 0) {
    return { pass: true, detail: "single line, no <br> needed" };
  }
  if (brs.length < minExpectedBrs) {
    return {
      pass: false,
      detail: `${lines.length} visual lines but only ${brs.length} <br> (expected >=${minExpectedBrs})`,
    };
  }
  return { pass: true, detail: `${brs.length} <br> for ${lines.length} lines` };
}

type JumpSnapshot = {
  items: Map<string, DOMRect>;
  rootRect: DOMRect;
  rootWidth: number;
  align: string;
};

function takeJumpSnapshot(root: HTMLElement): JumpSnapshot {
  const items = new Map<string, DOMRect>();
  root.querySelectorAll<HTMLElement>("[torph-item]:not(br)").forEach((item) => {
    const id = item.getAttribute("torph-id");
    if (id) items.set(id, item.getBoundingClientRect());
  });
  return {
    items,
    rootRect: root.getBoundingClientRect(),
    rootWidth: root.offsetWidth,
    align: getComputedStyle(root).textAlign,
  };
}

function verifyNoJump(
  root: HTMLElement,
  before: JumpSnapshot,
  tolerance = 2,
): { pass: boolean; detail: string } {
  const after = takeJumpSnapshot(root);
  const jumps: string[] = [];
  const context: string[] = [];

  // Context header
  context.push(`align=${before.align}→${after.align}`);
  context.push(`rootW: ${before.rootWidth}→${after.rootWidth}`);
  context.push(`scrollW: ${root.scrollWidth}`);

  // Root position shift (viewport coords)
  const rootDx = after.rootRect.left - before.rootRect.left;
  const rootDy = after.rootRect.top - before.rootRect.top;
  if (Math.abs(rootDx) > 0.5) {
    context.push(`rootX: ${rootDx > 0 ? "+" : ""}${rootDx.toFixed(1)}`);
  }
  if (Math.abs(rootDy) > 0.5) {
    context.push(`rootY: ${rootDy > 0 ? "+" : ""}${rootDy.toFixed(1)}`);
  }

  // Check each item that existed before
  after.items.forEach((cur, id) => {
    const old = before.items.get(id);
    if (!old) return; // new item
    const dx = cur.left - old.left;
    const dy = cur.top - old.top;
    const el = root.querySelector<HTMLElement>(`[torph-id="${id}"]`);
    if (!el) return;
    const text = el.textContent?.trim() || id;
    const isExiting = el.hasAttribute("torph-exiting");
    const transform = getComputedStyle(el).transform;
    const anims = el.getAnimations().length;

    if (Math.abs(dx) > tolerance || Math.abs(dy) > tolerance) {
      jumps.push(
        `"${text}"${isExiting ? "(exit)" : ""} ${dx > 0 ? "+" : ""}${dx.toFixed(1)},${dy > 0 ? "+" : ""}${dy.toFixed(1)} tf=${transform} anims=${anims}`,
      );
    }
  });

  // Items that disappeared entirely
  before.items.forEach((_, id) => {
    if (!after.items.has(id)) {
      context.push(`"${id}" vanished`);
    }
  });

  const header = `[${context.join(" | ")}]`;
  if (jumps.length > 0) {
    return { pass: false, detail: `${header} ${jumps.join("; ")}` };
  }
  return { pass: true, detail: `${header} no frame-0 jump` };
}

// ── Frame performance monitor ──

type PerfResult = {
  pass: boolean;
  detail: string;
  totalFrames: number;
  droppedFrames: number;
  longestFrame: number;
  avgFrame: number;
  morphTime: number;
};

class FrameMonitor {
  private frames: number[] = [];
  private rafId: number | null = null;
  private lastTime = 0;
  private running = false;
  private startTime = 0;
  private firstFrameTime = 0;

  start() {
    this.stop();
    this.frames = [];
    this.lastTime = 0;
    this.running = true;
    this.startTime = performance.now();
    this.firstFrameTime = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): PerfResult {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const frameTimes = this.frames;
    // Time from start() to first rAF = sync morph work + first paint
    const morphTime =
      this.firstFrameTime > 0 ? this.firstFrameTime - this.startTime : 0;

    if (frameTimes.length === 0) {
      return {
        pass: true,
        detail: `no frames | morph=${morphTime.toFixed(1)}ms`,
        totalFrames: 0,
        droppedFrames: 0,
        longestFrame: 0,
        avgFrame: 0,
        morphTime,
      };
    }

    const longestFrame = Math.max(...frameTimes);
    const avgFrame = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    // Detect display refresh rate from median frame interval,
    // then flag frames that exceed 2x median (missed a full frame).
    // Min threshold of 34ms avoids false positives on 30Hz displays.
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 16.67;
    const dropThreshold = Math.max(median * 2, 34);
    const droppedFrames = frameTimes.filter((t) => t > dropThreshold).length;
    const totalFrames = frameTimes.length;

    const issues: string[] = [];
    if (droppedFrames > 0) {
      issues.push(`${droppedFrames} dropped`);
    }
    if (longestFrame > 50) {
      issues.push(`worst: ${longestFrame.toFixed(1)}ms`);
    }
    if (morphTime > 16) {
      issues.push(`morph: ${morphTime.toFixed(1)}ms`);
    }

    const hz = Math.round(1000 / median);
    const pass = droppedFrames === 0 && longestFrame <= dropThreshold;
    const detail = pass
      ? `${totalFrames}f@${hz}Hz avg=${avgFrame.toFixed(1)}ms worst=${longestFrame.toFixed(1)}ms morph=${morphTime.toFixed(1)}ms`
      : `${totalFrames}f@${hz}Hz ${issues.join(" | ")} avg=${avgFrame.toFixed(1)}ms morph=${morphTime.toFixed(1)}ms`;

    return {
      pass,
      detail,
      totalFrames,
      droppedFrames,
      longestFrame,
      avgFrame,
      morphTime,
    };
  }

  private tick = () => {
    if (!this.running) return;
    const now = performance.now();
    if (this.lastTime > 0) {
      this.frames.push(now - this.lastTime);
    } else {
      this.firstFrameTime = now;
    }
    this.lastTime = now;
    this.rafId = requestAnimationFrame(this.tick);
  };
}

function verifyDomStandard(root: HTMLElement): {
  pass: boolean;
  detail: string;
} {
  const checks: [string, { pass: boolean; detail: string }][] = [
    ["bounds", verifyItemsInBounds(root)],
    ["overflow", verifyNoOverflow(root)],
    ["exits", verifyExitCleanup(root)],
    ["transform", verifyNoTransformResidue(root)],
    ["opacity", verifyNoOpacityResidue(root)],
    ["styles", verifyStyleCleanup(root)],
    ["ids", verifyNoDuplicateIds(root)],
    ["size", verifyContainerSizeMatch(root)],
  ];

  const align = getComputedStyle(root).textAlign as
    | "left"
    | "center"
    | "right"
    | "start";
  const normalizedAlign = align === "start" ? "left" : align;
  if (
    normalizedAlign === "left" ||
    normalizedAlign === "center" ||
    normalizedAlign === "right"
  ) {
    checks.push(["align", verifyAlignment(root, normalizedAlign)]);
  }

  const lines = getVisualLines(root);
  if (lines.length > 1) {
    checks.push(["br", verifyBrMatchesContent(root)]);
  }

  const failures = checks.filter(([, r]) => !r.pass);
  if (failures.length > 0) {
    return {
      pass: false,
      detail: failures.map(([name, r]) => `${name}: ${r.detail}`).join("; "),
    };
  }
  return { pass: true, detail: `${checks.length} DOM checks passed` };
}

function measurePerf(
  fn: () => { pass: boolean; detail: string },
  iterations = 100,
) {
  const start = performance.now();
  let result: { pass: boolean; detail: string } = { pass: true, detail: "" };
  for (let i = 0; i < iterations; i++) {
    result = fn();
  }
  const elapsed = performance.now() - start;
  return { ...result, timeMs: elapsed / iterations };
}

const TESTS: TestCase[] = [
  // ── Basics: word persistence, enter, exit, reorder ──
  {
    label: "Word reorder + exit",
    description:
      "Transaction should FLIP to its new position. Safe should exit, Processing should enter.",
    tags: ["flip", "exit direction"],
    values: ["Transaction Safe", "Processing Transaction"],
    verify: () =>
      verifyWordPersistence(
        "Transaction Safe",
        "Processing Transaction",
        "Transaction",
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Same word, reversed order",
    description:
      'Both "hello" and "world" FLIP to swap positions. No enter/exit — just movement.',
    tags: ["flip"],
    values: ["hello world", "world hello"],
    verify: () =>
      combineResults(
        verifyWordPersistence("hello world", "world hello", "hello"),
        verifyWordPersistence("hello world", "world hello", "world"),
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Add word",
    description: '"hello" persists in place. "world" enters with fade + scale.',
    tags: ["enter"],
    values: ["hello", "hello world"],
    verify: () => {
      const old = segmentText("hello", "en");
      const { segments } = diffSegments(old, "hello world", "en");
      const oldCharIds = old.map((s: Segment) => s.id);
      const newCharIds = segments
        .filter((s: Segment) => s.string !== "\u00A0" && s.string.length === 1)
        .map((s: Segment) => s.id);
      const allPersist = oldCharIds.every((id) => newCharIds.includes(id));
      const worldEnters = segments.some((s: Segment) => s.string === "world");
      return {
        pass: allPersist && worldEnters,
        detail: allPersist
          ? worldEnters
            ? "hello chars persist; world enters"
            : "world missing"
          : "Some hello char IDs lost",
      };
    },
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Remove word",
    description: '"hello" persists. "world" exits with fade out.',
    tags: ["exit"],
    values: ["hello world", "hello"],
    verify: () =>
      combineResults(
        verifyWordPersistence("hello world", "hello", "hello"),
        verifyWordAbsent("hello world", "hello", "world"),
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Dissimilar word replacement",
    description:
      '"cat" and "dog" exit as whole words (no char morph). "fish" and "bird" enter. "and" persists.',
    tags: ["no morph", "enter", "exit"],
    values: ["cat and dog", "fish and bird"],
    verify: () =>
      combineResults(
        verifyNoMorph("cat and dog", "fish and bird"),
        verifyWordPersistence("cat and dog", "fish and bird", "and"),
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Multi-word persist",
    description:
      '"the" and "brown" persist across states. Changed words enter/exit smoothly.',
    tags: ["flip", "enter", "exit"],
    values: [
      "the quick brown fox",
      "the slow brown dog",
      "a quick brown fox jumps",
    ],
    verify: () =>
      combineResults(
        verifyWordPersistence(
          "the quick brown fox",
          "the slow brown dog",
          "brown",
        ),
        verifyWordPersistence(
          "the quick brown fox",
          "the slow brown dog",
          "the",
        ),
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Duplicate words",
    description:
      'Both "the" instances persist with distinct IDs. "cat"/"dog" exit, "big"/"small" enter.',
    tags: ["duplicates", "flip"],
    values: ["the cat and the dog", "the big and the small"],
    verify: () => {
      const old = segmentText("the cat and the dog", "en");
      const { segments } = diffSegments(old, "the big and the small", "en");
      const oldThes = old.filter((s: Segment) => s.string === "the");
      const newThes = segments.filter((s: Segment) => s.string === "the");
      const bothPersist =
        oldThes.length === 2 &&
        newThes.length === 2 &&
        oldThes[0]!.id === newThes[0]!.id &&
        oldThes[1]!.id === newThes[1]!.id;
      const andPersists =
        old.find((s: Segment) => s.string === "and")?.id ===
        segments.find((s: Segment) => s.string === "and")?.id;
      return {
        pass: bothPersist && andPersists,
        detail: bothPersist
          ? andPersists
            ? 'Both "the" IDs persist; "and" persists'
            : '"and" ID changed'
          : 'Duplicate "the" IDs not preserved',
      };
    },
    verifyDom: (root) => verifyDomStandard(root),
  },

  // ── Character morph ──
  {
    label: "Character morph (add prefix)",
    description:
      '"p" enters while "n", "p", "m" persist and FLIP. "i" and "torph" stay unchanged.',
    tags: ["char morph", "split"],
    values: ["npm i torph", "pnpm i torph"],
    verify: () => verifyCharMorph("npm i torph", "pnpm i torph", "npm"),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Character morph + word swap",
    description:
      '"npm" morphs to "pnpm" at char level. "i" exits, "add" enters. "torph" persists.',
    tags: ["char morph", "enter", "exit"],
    values: ["npm i torph", "pnpm add torph"],
    verify: () =>
      combineResults(
        verifyCharMorph("npm i torph", "pnpm add torph", "npm"),
        verifyWordPersistence("npm i torph", "pnpm add torph", "torph"),
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Reverse character morph",
    description:
      '"pnpm" splits into chars. "n", "p", "m" persist into "npm", the leading "p" exits.',
    tags: ["char morph", "reverse"],
    values: ["pnpm i torph", "npm i torph"],
    verify: () => verifyCharMorph("pnpm i torph", "npm i torph", "pnpm"),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Single character change",
    description: '"c", "a", "r" persist. "t" exits and "d" enters.',
    tags: ["char morph"],
    values: ["cart", "card"],
    verify: () => verifyGraphemeMorph("cart", "card", ["c", "a", "r"]),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Case change",
    description:
      "Same words, different casing. Char morph handles the letter-level changes.",
    tags: ["char morph"],
    values: ["Hello World", "hello world"],
    verify: () => verifyCharMorph("Hello World", "hello world", "Hello"),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Punctuation",
    description:
      '"Hello," char-morphs to "Hello" — shared char IDs persist. "world!" likewise morphs to "world".',
    tags: ["char morph"],
    values: ["Hello, world!", "Hello world"],
    verify: () => {
      const old = segmentText("Hello, world!", "en");
      const { segments } = diffSegments(old, "Hello world", "en");
      const oldIds = new Set(old.map((s: Segment) => s.id));
      const persisted = segments.filter((s: Segment) => oldIds.has(s.id));
      const pass = persisted.length >= 4;
      return {
        pass,
        detail: pass
          ? `${persisted.length} char IDs persist across punctuation change`
          : `Only ${persisted.length} IDs persisted (expected ≥4)`,
      };
    },
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Numbers",
    description:
      "Shared digits and symbols ($, commas) persist. New digits enter.",
    tags: ["char morph"],
    values: ["$1,234", "$12,345,678", "$99"],
    align: "right",
    verify: () => verifyGraphemeMorph("$1,234", "$12,345,678", ["$", "1", ","]),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Long word char morph",
    description:
      "Character-level morph on a long single word with partial overlap.",
    tags: ["char morph", "stress"],
    values: ["abcdefghijklmnop", "abcmnopqrstuvwx"],
    verify: () =>
      verifyGraphemeMorph("abcdefghijklmnop", "abcmnopqrstuvwx", [
        "a",
        "b",
        "c",
        "m",
        "n",
        "o",
        "p",
      ]),
    verifyDom: (root) => verifyDomStandard(root),
  },

  // ── Multiline ──
  {
    label: "Multiline basic",
    description:
      "Shared words persist across line breaks. Newlines are treated as word boundaries.",
    tags: ["multiline"],
    values: ["hello\nworld", "hello\nuniverse"],
    verify: () =>
      verifyWordPersistence("hello\nworld", "hello\nuniverse", "hello"),
    verifyDom: (root) =>
      combineResults(verifyDomStandard(root), verifyMultiline(root, 2)),
  },
  {
    label: "Multiline add line",
    description: "Adding a new line enters new words. Existing words persist.",
    tags: ["multiline", "enter"],
    values: ["hello world\ngoodbye", "hello world\ngoodbye\nfarewell"],
    verify: () =>
      combineResults(
        verifyWordPersistence(
          "hello world\ngoodbye",
          "hello world\ngoodbye\nfarewell",
          "hello",
        ),
        verifyWordPersistence(
          "hello world\ngoodbye",
          "hello world\ngoodbye\nfarewell",
          "goodbye",
        ),
      ),
    verifyDom: (root) =>
      combineResults(verifyDomStandard(root), verifyMultiline(root, 2)),
  },
  {
    label: "Multiline remove line",
    description: "Removing a line exits those words. Remaining words persist.",
    tags: ["multiline", "exit"],
    values: ["hello world\nfoo bar\ngoodbye moon", "hello world\ngoodbye moon"],
    verify: () =>
      combineResults(
        verifyWordPersistence(
          "hello world\nfoo bar\ngoodbye moon",
          "hello world\ngoodbye moon",
          "hello",
        ),
        verifyWordPersistence(
          "hello world\nfoo bar\ngoodbye moon",
          "hello world\ngoodbye moon",
          "goodbye",
        ),
        verifyWordAbsent(
          "hello world\nfoo bar\ngoodbye moon",
          "hello world\ngoodbye moon",
          "foo",
        ),
      ),
    verifyDom: (root) =>
      combineResults(verifyDomStandard(root), verifyMultiline(root, 2)),
  },
  {
    label: "Multiline reorder",
    description:
      "Swapping line order. Shared words persist and FLIP to new positions.",
    tags: ["multiline", "flip"],
    values: ["alpha bravo\ncharlie delta", "charlie delta\nalpha bravo"],
    verify: () =>
      combineResults(
        verifyWordPersistence(
          "alpha bravo\ncharlie delta",
          "charlie delta\nalpha bravo",
          "alpha",
        ),
        verifyWordPersistence(
          "alpha bravo\ncharlie delta",
          "charlie delta\nalpha bravo",
          "charlie",
        ),
      ),
    verifyDom: (root) =>
      combineResults(verifyDomStandard(root), verifyMultiline(root, 2)),
  },
  {
    label: "Multiline with edits",
    description:
      "Lines change content while shared words persist across the multiline transition.",
    tags: ["multiline", "flip"],
    values: [
      "the quick brown fox\njumps over the lazy dog",
      "the slow red fox\nleaps over the happy cat",
    ],
    verify: () =>
      combineResults(
        verifyWordPersistence(
          "the quick brown fox\njumps over the lazy dog",
          "the slow red fox\nleaps over the happy cat",
          "the",
        ),
        verifyWordPersistence(
          "the quick brown fox\njumps over the lazy dog",
          "the slow red fox\nleaps over the happy cat",
          "fox",
        ),
        verifyWordPersistence(
          "the quick brown fox\njumps over the lazy dog",
          "the slow red fox\nleaps over the happy cat",
          "over",
        ),
      ),
    verifyDom: (root) =>
      combineResults(verifyDomStandard(root), verifyMultiline(root, 2)),
  },
  {
    label: "Multiline ↔ single line",
    description:
      "Toggling between line break and space. Words persist and FLIP between vertical/horizontal layout.",
    tags: ["multiline", "flip"],
    values: ["hello\nworld", "hello world"],
    verify: () =>
      combineResults(
        verifyWordPersistence("hello\nworld", "hello world", "hello"),
        verifyWordPersistence("hello\nworld", "hello world", "world"),
        verifyWordPersistence("hello world", "hello\nworld", "hello"),
        verifyWordPersistence("hello world", "hello\nworld", "world"),
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Empty lines",
    description: "Collapsing a blank line. Words on remaining lines persist.",
    tags: ["multiline", "edge case"],
    values: ["hello\n\nworld", "hello\nworld"],
    verify: () =>
      combineResults(
        verifyWordPersistence("hello\n\nworld", "hello\nworld", "hello"),
        verifyWordPersistence("hello\n\nworld", "hello\nworld", "world"),
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Multiline empty transition",
    description:
      "Multiline text exits to empty, then new multiline content enters from empty.",
    tags: ["multiline", "edge case"],
    values: ["hello\nworld", "", "foo\nbar"],
    verify: () => {
      const old = segmentText("hello\nworld", "en");
      const r1 = diffSegments(old, "", "en");
      const r2 = diffSegments([], "foo\nbar", "en");
      const pass =
        r1.segments.length === 0 &&
        r2.segments.some((s: Segment) => s.string === "foo");
      return {
        pass,
        detail: pass
          ? "Multiline → empty → multiline works"
          : `exit segs=${r1.segments.length}, enter has foo=${r2.segments.some((s: Segment) => s.string === "foo")}`,
      };
    },
    verifyDom: (root) => verifyDomStandard(root),
  },

  // ── Edge cases ──
  {
    label: "Empty to text",
    description:
      '"hello world" enters from empty. Morphing back to "" fades all words out gracefully.',
    tags: ["edge case"],
    values: ["", "hello world", ""],
    verify: () => {
      const { segments } = diffSegments([], "hello world", "en");
      const old = segmentText("hello world", "en");
      const r2 = diffSegments(old, "", "en");
      const pass =
        segments.length > 0 &&
        segments.some((s: Segment) => s.string === "hello") &&
        r2.segments.length === 0;
      return {
        pass,
        detail: pass
          ? "Empty → text produces segments; text → empty produces none"
          : `segments=${segments.length}, reverse=${r2.segments.length}`,
      };
    },
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Single character",
    description:
      "Minimal content — single char replacement. Each transition is a full exit/enter.",
    tags: ["edge case"],
    values: ["a", "b", "c"],
    verify: () => verifyWordAbsent("a", "b", "a"),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Complete replacement",
    description:
      "No character overlap. Everything exits and enters — no morph or persistence.",
    tags: ["edge case", "enter", "exit"],
    values: ["abcdef", "xyz"],
    verify: () =>
      combineResults(
        verifyNoMorph("abcdef", "xyz"),
        verifyWordAbsent("abcdef", "xyz", "abcdef"),
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Whitespace normalization",
    description:
      "Extra spaces should not cause unexpected segment splits or ID changes.",
    tags: ["edge case"],
    values: ["hello world", "hello  world", "hello world"],
    verify: () => verifyWordPersistence("hello world", "hello world", "hello"),
    verifyDom: (root) => verifyDomStandard(root),
  },

  // ── Unicode & i18n ──
  {
    label: "Emoji",
    description:
      "Emoji grapheme clusters are treated as single segments and persist correctly.",
    tags: ["grapheme"],
    values: ["Hello 👋", "Goodbye 👋"],
    verify: () => verifyWordPersistence("Hello 👋", "Goodbye 👋", "👋"),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Compound emoji",
    description:
      "Complex emoji (family, flag sequences) are treated as single grapheme segments.",
    tags: ["grapheme"],
    values: ["Hello 👨‍👩‍👧‍👦", "Goodbye 👨‍👩‍👧‍👦"],
    verify: () => verifyWordPersistence("Hello 👨‍👩‍👧‍👦", "Goodbye 👨‍👩‍👧‍👦", "👨‍👩‍👧‍👦"),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Unicode accents",
    description:
      "Accented characters (café → cafe). Shared base chars persist.",
    tags: ["grapheme"],
    values: ["café", "cafe"],
    verify: () => verifyGraphemeMorph("café", "cafe", ["c", "a", "f"]),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "RTL text (Arabic)",
    description:
      "Arabic text segments and diffs correctly. Shared words persist.",
    tags: ["i18n"],
    values: ["مرحبا بالعالم", "مرحبا يا صديقي"],
    verify: () =>
      verifyWordPersistence("مرحبا بالعالم", "مرحبا يا صديقي", "مرحبا"),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "RTL text (Hebrew)",
    description: "Hebrew text segmentation and persistence of shared words.",
    tags: ["i18n"],
    values: ["שלום עולם", "שלום חברים"],
    verify: () => verifyWordPersistence("שלום עולם", "שלום חברים", "שלום"),
    verifyDom: (root) => verifyDomStandard(root),
  },

  // ── Stress & stability ──
  {
    label: "Long sentence overlap",
    description: '"quick", "fox", "over" persist. Other words swap in/out.',
    tags: ["stress", "flip"],
    values: [
      "the quick brown fox jumps over the lazy dog",
      "the quick red fox leaps over the happy cat",
    ],
    verify: () =>
      combineResults(
        verifyWordPersistence(
          "the quick brown fox jumps over the lazy dog",
          "the quick red fox leaps over the happy cat",
          "quick",
        ),
        verifyWordPersistence(
          "the quick brown fox jumps over the lazy dog",
          "the quick red fox leaps over the happy cat",
          "fox",
        ),
        verifyWordPersistence(
          "the quick brown fox jumps over the lazy dog",
          "the quick red fox leaps over the happy cat",
          "over",
        ),
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Long paragraph",
    description:
      "Stress test with paragraph-length text. Common words persist, unique words enter/exit.",
    tags: ["stress", "flip"],
    values: [
      "The quick brown fox jumps over the lazy dog while the sun sets behind the distant mountains",
      "The slow gray wolf runs under the bright moon while the rain falls across the nearby valleys",
    ],
    verify: () =>
      combineResults(
        verifyWordPersistence(
          "The quick brown fox jumps over the lazy dog while the sun sets behind the distant mountains",
          "The slow gray wolf runs under the bright moon while the rain falls across the nearby valleys",
          "while",
        ),
        verifyWordPersistence(
          "The quick brown fox jumps over the lazy dog while the sun sets behind the distant mountains",
          "The slow gray wolf runs under the bright moon while the rain falls across the nearby valleys",
          "the",
        ),
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Multi-cycle stability",
    description:
      '"Transaction" ID stays the same across 4+ cycles. Exit direction should never flip.',
    tags: ["stability", "cycles"],
    values: ["Transaction Safe", "Processing Transaction"],
    verify: () =>
      verifyCycleStability(
        "Transaction Safe",
        "Processing Transaction",
        "Transaction",
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
  {
    label: "Rapid spam (auto-cycle)",
    description:
      "Hit Auto to toggle every 150ms. Animations should queue gracefully without glitches.",
    tags: ["spam", "resilience"],
    values: ["Transaction Safe", "Processing Transaction"],
    verify: () =>
      verifyCycleStability(
        "Transaction Safe",
        "Processing Transaction",
        "Transaction",
      ),
    verifyDom: (root) => verifyDomStandard(root),
  },
];

const ALL_TAGS = [...new Set(TESTS.flatMap((t) => t.tags))].sort();

type TestResult = {
  label: string;
  result: { pass: boolean; detail: string } | null;
  timeMs: number | null;
};

function computeResults(): TestResult[] {
  return TESTS.map((test) => {
    if (!test.verify) return { label: test.label, result: null, timeMs: null };
    const { timeMs, ...result } = measurePerf(test.verify);
    return { label: test.label, result, timeMs };
  });
}

function useResults(): TestResult[] {
  const empty = TESTS.map((t) => ({
    label: t.label,
    result: null,
    timeMs: null,
  }));
  const [results, setResults] = React.useState<TestResult[]>(empty);
  React.useEffect(() => {
    setResults(computeResults());
  }, []);
  return results;
}

const EASINGS = {
  default: DEFAULT_TEXT_MORPH_OPTIONS.ease,
  spring: { stiffness: 200, damping: 20, mass: 1 },
  linear: "linear",
} as const;
type EasingKey = keyof typeof EASINGS;

function SegmentInspector({ from, to }: { from: string; to: string }) {
  const oldSegs = segmentText(from, "en");
  const { segments: newSegs, splits } = diffSegments(oldSegs, to, "en");

  return (
    <div className={styles.inspector}>
      <div className={styles.inspectorSection}>
        <span className={styles.inspectorLabel}>Old segments</span>
        <div className={styles.segmentList}>
          {oldSegs.map((s, i) => (
            <Tooltip content={`ID: ${s.id}`}>
              <span key={i} className={styles.segmentChip}>
                {s.string === "\u00A0" ? "·" : s.string}
                <span className={styles.segmentId}>{s.id.slice(0, 6)}</span>
              </span>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className={styles.inspectorSection}>
        <span className={styles.inspectorLabel}>New segments</span>
        <div className={styles.segmentList}>
          {newSegs.map((s, i) => {
            const persisted = oldSegs.some((o) => o.id === s.id);
            return (
              <Tooltip
                content={`ID: ${s.id}${persisted ? " (persisted)" : " (new)"}`}
              >
                <span
                  key={i}
                  className={`${styles.segmentChip} ${persisted ? styles.segmentPersisted : styles.segmentNew}`}
                >
                  {s.string === "\u00A0" ? "·" : s.string}
                  <span className={styles.segmentId}>{s.id.slice(0, 6)}</span>
                </span>
              </Tooltip>
            );
          })}
        </div>
      </div>
      {splits.size > 0 && (
        <div className={styles.inspectorSection}>
          <span className={styles.inspectorLabel}>Splits</span>
          <div className={styles.segmentList}>
            {[...splits.entries()].map(([word, chars]) => (
              <Tooltip content={`"${word}" split into ${chars.length} chars`}>
                <span key={word} className={styles.segmentChip}>
                  {word} → {chars.map((c) => c.string).join("")}
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const SPEEDS = {
  default: DEFAULT_TEXT_MORPH_OPTIONS.duration,
  slow: 3000,
  fast: 150,
} as const;
type Speed = keyof typeof SPEEDS;

const ALIGNS = ["left", "center", "right"] as const;
type Align = (typeof ALIGNS)[number];

function TestCard({
  test,
  result,
  timeMs,
  morphAllSignal,
  domResult,
  jumpResult,
  perfResult,
  cardRef,
  onDomResult,
  onJumpResult,
  onPerfResult,
  speed,
  easing,
  align: globalAlign,
  debug,
}: {
  test: TestCase;
  result: { pass: boolean; detail: string } | null;
  timeMs: number | null;
  morphAllSignal: number;
  domResult: { pass: boolean; detail: string } | null;
  jumpResult: { pass: boolean; detail: string } | null;
  perfResult: PerfResult | null;
  cardRef?: React.Ref<HTMLDivElement>;
  onDomResult?: (result: { pass: boolean; detail: string } | null) => void;
  onJumpResult?: (result: { pass: boolean; detail: string } | null) => void;
  onPerfResult?: (result: PerfResult | null) => void;
  speed: Speed;
  easing: EasingKey;
  align: Align;
  debug: boolean;
}) {
  const [index, setIndex] = React.useState(0);
  const [auto, setAuto] = React.useState(false);
  const [showInspector, setShowInspector] = React.useState(false);
  const align = (test.align as Align) || globalAlign;
  const progressRef = React.useRef<HTMLDivElement | null>(null);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const preAnimSnap = React.useRef<JumpSnapshot | null>(null);
  const frameMonitor = React.useRef(new FrameMonitor());

  const advance = React.useCallback(() => {
    setIndex((i) => (i + 1) % test.values.length);
  }, [test.values.length]);

  React.useEffect(() => {
    if (morphAllSignal > 0) advance();
  }, [morphAllSignal, advance]);

  React.useEffect(() => {
    if (auto) {
      intervalRef.current = setInterval(advance, 150);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [auto, advance]);

  const isSpamTest = test.tags.includes("spam");
  const prevIndex = (index - 1 + test.values.length) % test.values.length;

  return (
    <div className={styles.card} ref={cardRef} tabIndex={0}>
      <div className={styles.cardHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.label}>{test.label}</span>
        </div>
        <div className={styles.tags}>
          {test.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <p className={styles.description}>{test.description}</p>
      <p className={styles.verifyDetail}>
        {result ? result.detail : "\u00A0"}
        {domResult && !domResult.pass && (
          <>
            {" "}
            ·{" "}
            <span style={{ color: "rgb(248, 113, 113)" }}>
              DOM: {domResult.detail}
            </span>
          </>
        )}
        {jumpResult && !jumpResult.pass && (
          <>
            {" "}
            ·{" "}
            <span style={{ color: "rgb(251, 191, 36)" }}>
              JUMP: {jumpResult.detail}
            </span>
          </>
        )}
        {perfResult && !perfResult.pass && (
          <>
            {" "}
            ·{" "}
            <span style={{ color: "rgb(251, 146, 60)" }}>
              PERF: {perfResult.detail}
            </span>
          </>
        )}
      </p>
      <div
        ref={bodyRef}
        className={styles.cardBody}
        style={{ textAlign: align, cursor: "pointer" }}
        onClick={advance}
      >
        <TextMorph
          duration={SPEEDS[speed]}
          ease={EASINGS[easing]}
          debug={debug}
          onAnimationStart={() => {
            frameMonitor.current.start();
            if (progressRef.current) {
              const el = progressRef.current;
              el.style.transition = "none";
              el.style.width = "0%";
              el.offsetHeight; // force reflow
              el.style.transition = `width ${SPEEDS[speed]}ms linear`;
              el.style.width = "100%";
            }
            // Snapshot positions before morph for jump detection
            if (bodyRef.current) {
              const torphRoot =
                bodyRef.current.querySelector<HTMLElement>("[torph-root]");
              if (torphRoot) {
                preAnimSnap.current = takeJumpSnapshot(torphRoot);
                requestAnimationFrame(() => {
                  if (preAnimSnap.current) {
                    onJumpResult?.(
                      verifyNoJump(torphRoot, preAnimSnap.current),
                    );
                  }
                });
              }
            }
          }}
          onAnimationComplete={() => {
            onPerfResult?.(frameMonitor.current.stop());
            if (progressRef.current) {
              progressRef.current.style.transition = "none";
              progressRef.current.style.width = "0%";
            }
            if (test.verifyDom && bodyRef.current) {
              const torphRoot =
                bodyRef.current.querySelector<HTMLElement>("[torph-root]");
              if (torphRoot) {
                onDomResult?.(test.verifyDom(torphRoot));
              }
            }
          }}
        >
          {test.values[index]}
        </TextMorph>
      </div>
      <div className={styles.cardFooter}>
        <Tooltip content={result?.detail ?? ""}>
          <span
            className={
              result
                ? result.pass
                  ? styles.badgePass
                  : styles.badgeFail
                : styles.perfBadge
            }
          >
            <TextMorph as="span" duration={150}>
              {result ? (result.pass ? "PASS" : "FAIL") : "…"}
            </TextMorph>
          </span>
        </Tooltip>
        {test.verifyDom && (
          <Tooltip content={domResult?.detail ?? ""}>
            <span
              className={
                domResult
                  ? domResult.pass
                    ? styles.badgePass
                    : styles.badgeFail
                  : styles.perfBadge
              }
            >
              <TextMorph as="span" duration={150}>
                {domResult
                  ? `DOM ${domResult.pass ? "PASS" : "FAIL"}`
                  : "DOM …"}
              </TextMorph>
            </span>
          </Tooltip>
        )}
        <Tooltip content={jumpResult?.detail ?? ""}>
          <span
            className={
              jumpResult
                ? jumpResult.pass
                  ? styles.badgePass
                  : styles.badgeFail
                : styles.perfBadge
            }
          >
            <TextMorph as="span" duration={150}>
              {jumpResult
                ? `JUMP ${jumpResult.pass ? "OK" : "FAIL"}`
                : "JUMP …"}
            </TextMorph>
          </span>
        </Tooltip>
        <Tooltip content={perfResult?.detail ?? ""}>
          <span
            className={
              perfResult
                ? perfResult.pass
                  ? styles.badgePass
                  : styles.badgeFail
                : styles.perfBadge
            }
          >
            <TextMorph as="span" duration={150}>
              {perfResult
                ? perfResult.pass
                  ? `${perfResult.totalFrames}f`
                  : `${perfResult.droppedFrames} drop`
                : "PERF …"}
            </TextMorph>
          </span>
        </Tooltip>
        <Tooltip content={timeMs !== null ? "Avg over 100 iterations" : ""}>
          <span className={styles.perfBadge}>
            <TextMorph as="span" duration={150}>
              {timeMs !== null
                ? `${timeMs < 0.01 ? "<0.01" : timeMs.toFixed(2)}ms`
                : "—"}
            </TextMorph>
          </span>
        </Tooltip>
        {isSpamTest && (
          <Button type="button" onClick={() => setAuto((a) => !a)}>
            {auto ? "Stop" : "Auto"}
          </Button>
        )}
        <div className={styles.stepGroup}>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} ref={progressRef} />
          </div>
          <span className={styles.step}>
            {index + 1} / {test.values.length}
          </span>
          <button type="button" onClick={advance} className={styles.button}>
            Morph
          </button>
          <Tooltip
            content={showInspector ? "Hide inspector" : "Show inspector"}
          >
            <button
              type="button"
              className={`${styles.iconBtn} ${showInspector ? styles.iconBtnActive : ""}`}
              onClick={() => setShowInspector((s) => !s)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {showInspector ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
      {showInspector && (
        <SegmentInspector
          from={test.values[prevIndex]!}
          to={test.values[index]!}
        />
      )}
    </div>
  );
}

function SandboxCard() {
  const [from, setFrom] = React.useState("hello world");
  const [to, setTo] = React.useState("world hello");
  const [current, setCurrent] = React.useState("hello world");
  const progressRef = React.useRef<HTMLDivElement | null>(null);
  const duration = DEFAULT_TEXT_MORPH_OPTIONS.duration;

  const toggle = React.useCallback(() => {
    setCurrent((c) => (c === from ? to : from));
  }, [from, to]);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.label}>Sandbox</span>
        </div>
        <div className={styles.tags}>
          <span className={styles.tag}>custom</span>
        </div>
      </div>
      <p className={styles.description}>
        Type any text to test morphing behavior with custom inputs.
      </p>
      <div className={styles.sandboxInputs}>
        <div className={styles.sandboxField}>
          <label className={styles.inspectorLabel}>From</label>
          <input
            type="text"
            className={styles.sandboxInput}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setCurrent(e.target.value);
            }}
          />
        </div>
        <div className={styles.sandboxField}>
          <label className={styles.inspectorLabel}>To</label>
          <input
            type="text"
            className={styles.sandboxInput}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <div
        className={styles.cardBody}
        style={{ cursor: "pointer" }}
        onClick={toggle}
      >
        <TextMorph
          onAnimationStart={() => {
            if (progressRef.current) {
              const el = progressRef.current;
              el.style.transition = "none";
              el.style.width = "0%";
              el.offsetHeight;
              el.style.transition = `width ${duration}ms linear`;
              el.style.width = "100%";
            }
          }}
          onAnimationComplete={() => {
            if (progressRef.current) {
              progressRef.current.style.transition = "none";
              progressRef.current.style.width = "0%";
            }
          }}
        >
          {current}
        </TextMorph>
      </div>
      <div className={styles.cardFooter}>
        <div className={styles.stepGroup}>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} ref={progressRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

function copyResultsToClipboard(
  results: TestResult[],
  domResults: ({ pass: boolean; detail: string } | null)[],
  jumpResults: ({ pass: boolean; detail: string } | null)[],
  perfResults: (PerfResult | null)[],
) {
  const lines = [
    "# Torph Test Results",
    "",
    `| Test | Data | DOM | DOM Detail | Jump | Jump Detail | Perf | Perf Detail | Time |`,
    `|------|------|-----|------------|------|-------------|------|-------------|------|`,
    ...results.map((r, i) => {
      const status = !r.result ? "Skip" : r.result.pass ? "Pass" : "Fail";
      const dom = domResults[i] ? (domResults[i]!.pass ? "Pass" : "Fail") : "-";
      const domDetail = domResults[i] ? domResults[i]!.detail : "-";
      const jump = jumpResults[i]
        ? jumpResults[i]!.pass
          ? "Pass"
          : "Fail"
        : "-";
      const jumpDetail = jumpResults[i] ? jumpResults[i]!.detail : "-";
      const perf = perfResults[i]
        ? perfResults[i]!.pass
          ? "Pass"
          : "Fail"
        : "-";
      const perfDetail = perfResults[i] ? perfResults[i]!.detail : "-";
      const time = r.timeMs !== null ? `${r.timeMs.toFixed(2)}ms` : "-";
      return `| ${r.label} | ${status} | ${dom} | ${domDetail} | ${jump} | ${jumpDetail} | ${perf} | ${perfDetail} | ${time} |`;
    }),
    "",
    `Generated: ${new Date().toISOString()}`,
  ];
  navigator.clipboard.writeText(lines.join("\n"));
}

function copyFailsToClipboard(
  results: TestResult[],
  domResults: ({ pass: boolean; detail: string } | null)[],
  jumpResults: ({ pass: boolean; detail: string } | null)[],
  perfResults: (PerfResult | null)[],
) {
  const failed = results
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => {
      const dataFail = r.result && !r.result.pass;
      const domFail = domResults[i] && !domResults[i]!.pass;
      const jumpFail = jumpResults[i] && !jumpResults[i]!.pass;
      const perfFail = perfResults[i] && !perfResults[i]!.pass;
      return dataFail || domFail || jumpFail || perfFail;
    });

  if (failed.length === 0) {
    navigator.clipboard.writeText("No failures.");
    return false;
  }

  const lines = [
    "# Torph Failed Tests",
    "",
    `| Test | Data | DOM | DOM Detail | Jump | Jump Detail | Perf | Perf Detail |`,
    `|------|------|-----|------------|------|-------------|------|-------------|`,
    ...failed.map(({ r, i }) => {
      const status = !r.result ? "Skip" : r.result.pass ? "Pass" : "Fail";
      const dom = domResults[i] ? (domResults[i]!.pass ? "Pass" : "Fail") : "-";
      const domDetail = domResults[i] ? domResults[i]!.detail : "-";
      const jump = jumpResults[i]
        ? jumpResults[i]!.pass
          ? "Pass"
          : "Fail"
        : "-";
      const jumpDetail = jumpResults[i] ? jumpResults[i]!.detail : "-";
      const perf = perfResults[i]
        ? perfResults[i]!.pass
          ? "Pass"
          : "Fail"
        : "-";
      const perfDetail = perfResults[i] ? perfResults[i]!.detail : "-";
      return `| ${r.label} | ${status} | ${dom} | ${domDetail} | ${jump} | ${jumpDetail} | ${perf} | ${perfDetail} |`;
    }),
    "",
    `Generated: ${new Date().toISOString()}`,
  ];
  navigator.clipboard.writeText(lines.join("\n"));
  return true;
}

export const PlaygroundTests = () => {
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [failOnly, setFailOnly] = React.useState(false);
  const [morphAllSignal, setMorphAllSignal] = React.useState(0);
  const [copied, setCopied] = React.useState<string | false>(false);
  const [speed, setSpeed] = React.useState<Speed>("default");
  const [easing, setEasing] = React.useState<EasingKey>("default");
  const [align, setAlign] = React.useState<Align>("left");
  const [debug, setDebug] = React.useState(false);
  const results = useResults();
  const [domResults, setDomResults] = React.useState<
    ({ pass: boolean; detail: string } | null)[]
  >(() => TESTS.map(() => null));
  const [jumpResults, setJumpResults] = React.useState<
    ({ pass: boolean; detail: string } | null)[]
  >(() => TESTS.map(() => null));
  const [perfResults, setPerfResults] = React.useState<(PerfResult | null)[]>(
    () => TESTS.map(() => null),
  );
  const cardRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  const filteredIndices = TESTS.map((_, i) => i).filter((i) => {
    if (activeTag && !TESTS[i]!.tags.includes(activeTag)) return false;
    if (failOnly) {
      const dataFail = results[i]?.result?.pass === false;
      const domFail = domResults[i]?.pass === false;
      const jumpFail = jumpResults[i]?.pass === false;
      const perfFail = perfResults[i]?.pass === false;
      if (!dataFail && !domFail && !jumpFail && !perfFail) return false;
    }
    return true;
  });

  const isDev = process.env.NODE_ENV !== "production";
  const passed = results.filter((r) => r.result?.pass).length;
  const failed = results.filter((r) => r.result && !r.result.pass).length;
  const domFailed = domResults.filter((r) => r && !r.pass).length;
  const jumpFailed = jumpResults.filter((r) => r && !r.pass).length;
  const perfFailed = perfResults.filter((r) => r && !r.pass).length;
  const total = results.filter((r) => r.result).length;

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.code === "Space" && e.shiftKey) {
        e.preventDefault();
        setMorphAllSignal((s) => s + 1);
        return;
      }

      if (e.code === "Space" && !e.shiftKey) {
        const focused = document.activeElement;
        if (
          focused instanceof HTMLElement &&
          focused.closest(`.${styles.card}`)
        ) {
          e.preventDefault();
          const cardBody = focused.querySelector(
            `.${styles.cardBody}`,
          ) as HTMLElement | null;
          if (cardBody) cardBody.click();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCopy = () => {
    copyResultsToClipboard(results, domResults, jumpResults, perfResults);
    setCopied("all");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyFails = () => {
    const hadFails = copyFailsToClipboard(
      results,
      domResults,
      jumpResults,
      perfResults,
    );
    setCopied(hadFails ? "fails" : "none");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.grid}>
      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <div className={styles.summaryLeft}>
            <span className={styles.summaryLabel}>
              {passed}/{total} passed
              {failed > 0 && (
                <span className={styles.summaryFail}> · {failed} failed</span>
              )}
              {domFailed > 0 && (
                <span className={styles.summaryFail}>
                  {" "}
                  · {domFailed} DOM failed
                </span>
              )}
              {jumpFailed > 0 && (
                <span className={styles.summaryFail}>
                  {" "}
                  · {jumpFailed} JUMP failed
                </span>
              )}
              {perfFailed > 0 && (
                <span className={styles.summaryFail}>
                  {" "}
                  · {perfFailed} PERF failed
                </span>
              )}
            </span>
            <span className={styles.version}>
              v{pkg.version}
              {isDev && <span className={styles.versionDev}>dev</span>}
            </span>
          </div>
          <div className={styles.summaryDots}>
            {results.map((r, i) => (
              <Tooltip
                key={r.label}
                content={`${r.label}${r.result ? `: ${r.result.detail}` : ""}`}
              >
                <span
                  className={
                    !r.result
                      ? styles.dotSkip
                      : r.result.pass
                        ? styles.dotPass
                        : styles.dotFail
                  }
                  onClick={() =>
                    cardRefs.current[i]?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    })
                  }
                />
              </Tooltip>
            ))}
          </div>
        </div>
        <div className={styles.summaryRow}>
          <div className={styles.bundleSizes}>
            {bundleSizes.map((entry) => {
              const diff = entry.publishedGzip
                ? entry.gzip - entry.publishedGzip
                : 0;
              const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
              return (
                <Tooltip
                  key={entry.name}
                  content={`${entry.name}: ${(entry.raw / 1024).toFixed(1)}kB raw · published: ${(entry.publishedGzip / 1024).toFixed(1)}kB gz`}
                >
                  <span className={styles.bundleEntry}>
                    {entry.name}{" "}
                    <strong>{(entry.gzip / 1024).toFixed(1)}kB</strong>
                    {diff !== 0 && (
                      <span
                        className={
                          diff > 0 ? styles.bundleDiffUp : styles.bundleDiffDown
                        }
                      >
                        {diffStr}B
                      </span>
                    )}
                  </span>
                </Tooltip>
              );
            })}
          </div>
          <div className={styles.summaryActions}>
            <button
              type="button"
              className={styles.button}
              onClick={handleCopyFails}
            >
              {copied === "fails"
                ? "Copied!"
                : copied === "none"
                  ? "No Fails"
                  : "Copy Fails"}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={handleCopy}
            >
              {copied === "all" ? "Copied!" : "Copy All"}
            </button>
          </div>
        </div>
      </div>
      <div className={styles.filterTags}>
        <button
          type="button"
          className={`${styles.filterTag} ${failOnly ? styles.filterTagActive : ""}`}
          onClick={() => setFailOnly((f) => !f)}
        >
          failing only
        </button>
        {ALL_TAGS.map((tag) => (
          <button
            type="button"
            key={tag}
            className={`${styles.filterTag} ${activeTag === tag ? styles.filterTagActive : ""}`}
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      <SandboxCard />
      {filteredIndices.map((i) => (
        <TestCard
          key={TESTS[i]!.label}
          test={TESTS[i]!}
          result={results[i]!.result}
          timeMs={results[i]!.timeMs}
          morphAllSignal={morphAllSignal}
          domResult={domResults[i] ?? null}
          jumpResult={jumpResults[i] ?? null}
          perfResult={perfResults[i] ?? null}
          speed={speed}
          easing={easing}
          align={align}
          debug={debug}
          onDomResult={(r) =>
            setDomResults((prev) => {
              const next = [...prev];
              next[i] = r;
              return next;
            })
          }
          onJumpResult={(r) =>
            setJumpResults((prev) => {
              const next = [...prev];
              next[i] = r;
              return next;
            })
          }
          onPerfResult={(r) =>
            setPerfResults((prev) => {
              const next = [...prev];
              next[i] = r;
              return next;
            })
          }
          cardRef={(el) => {
            cardRefs.current[i] = el;
          }}
        />
      ))}
      <p className={styles.keyboardHint}>
        <kbd>Space</kbd> morph focused card · <kbd>Shift+Space</kbd> morph all
      </p>
      <div className={styles.toolbar}>
        <div className={styles.speedToggle}>
          {(Object.keys(SPEEDS) as Speed[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.speedBtn} ${speed === s ? styles.speedBtnActive : ""}`}
              onClick={() => setSpeed(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className={styles.speedToggle}>
          {(Object.keys(EASINGS) as EasingKey[]).map((e) => (
            <button
              key={e}
              type="button"
              className={`${styles.speedBtn} ${easing === e ? styles.speedBtnActive : ""}`}
              onClick={() => setEasing(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <div className={styles.speedToggle}>
          {ALIGNS.map((a) => (
            <Tooltip key={a} content={`Align ${a}`}>
              <button
                type="button"
                className={`${styles.speedBtn} ${align === a ? styles.speedBtnActive : ""}`}
                onClick={() => setAlign(a)}
              >
                {a === "left" ? "L" : a === "center" ? "C" : "R"}
              </button>
            </Tooltip>
          ))}
        </div>
        <button
          type="button"
          className={`${styles.speedBtn} ${debug ? styles.speedBtnActive : ""}`}
          onClick={() => setDebug((d) => !d)}
        >
          debug
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => setMorphAllSignal((s) => s + 1)}
        >
          Morph All
        </button>
      </div>
    </div>
  );
};
