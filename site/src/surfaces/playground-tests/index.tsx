"use client";

import styles from "./styles.module.scss";
import React from "react";
import { TextMorph } from "torph/react";
import { segmentText, diffSegments } from "torph";
import type { Segment } from "torph";
import { Button } from "@/components/button";

type VerifyFn = () => { pass: boolean; detail: string };

type TestCase = {
  label: string;
  description: string;
  tags: string[];
  values: string[];
  align?: React.CSSProperties["textAlign"];
  verify?: VerifyFn;
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
  // Single-word texts use grapheme segmentation, so both old and new are char segments
  const oldSegs = segmentText(from, "en");
  const newSegs = segmentText(to, "en");
  // Check that shared characters exist in both
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

const TESTS: TestCase[] = [
  {
    label: "Word reorder + exit",
    description:
      "Transaction should FLIP to its new position. Safe should exit, Processing should enter. On repeat cycles, exit direction should stay consistent.",
    tags: ["flip", "exit direction"],
    values: ["Transaction Safe", "Processing Transaction"],
    verify: () =>
      verifyWordPersistence(
        "Transaction Safe",
        "Processing Transaction",
        "Transaction",
      ),
  },
  {
    label: "Character morph (add prefix)",
    description:
      'The "p" should enter while "n", "p", "m" persist and FLIP into new positions. "i" and "torph" stay unchanged.',
    tags: ["char morph", "split"],
    values: ["npm i torph", "pnpm i torph"],
    verify: () => verifyCharMorph("npm i torph", "pnpm i torph", "npm"),
  },
  {
    label: "Character morph + word swap",
    description:
      '"npm" morphs to "pnpm" at char level. "i" exits and "add" enters as whole words. "torph" persists.',
    tags: ["char morph", "enter", "exit"],
    values: ["npm i torph", "pnpm add torph"],
    verify: () =>
      combineResults(
        verifyCharMorph("npm i torph", "pnpm add torph", "npm"),
        verifyWordPersistence("npm i torph", "pnpm add torph", "torph"),
      ),
  },
  {
    label: "Reverse character morph",
    description:
      '"pnpm" splits into chars. "n", "p", "m" persist into "npm", the leading "p" exits.',
    tags: ["char morph", "reverse"],
    values: ["pnpm i torph", "npm i torph"],
    verify: () => verifyCharMorph("pnpm i torph", "npm i torph", "pnpm"),
  },
  {
    label: "Dissimilar word replacement",
    description:
      '"cat" and "dog" exit as whole words (no char morph). "fish" and "bird" enter. "and" persists in place.',
    tags: ["no morph", "enter", "exit"],
    values: ["cat and dog", "fish and bird"],
    verify: () =>
      combineResults(
        verifyNoMorph("cat and dog", "fish and bird"),
        verifyWordPersistence("cat and dog", "fish and bird", "and"),
      ),
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
  },
  {
    label: "Add word",
    description: '"hello" persists in place. "world" enters with fade + scale.',
    tags: ["enter"],
    values: ["hello", "hello world"],
    verify: () => {
      // "hello" goes from grapheme segments to a word match — old char IDs should persist
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
  },
  {
    label: "Multi-word persist",
    description:
      '"the" and "brown" persist across the first two states. Changed words enter/exit smoothly.',
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
  },
  {
    label: "Single character change",
    description:
      '"c", "a", "r" persist. "t" exits and "d" enters (or morphs if similar enough).',
    tags: ["char morph"],
    values: ["cart", "card"],
    verify: () => verifyGraphemeMorph("cart", "card", ["c", "a", "r"]),
  },
  {
    label: "Numbers",
    description:
      "Shared digits and symbols ($, commas) persist. New digits enter.",
    tags: ["char morph"],
    values: ["$1,234", "$12,345,678", "$99"],
    align: "right",
    verify: () => verifyGraphemeMorph("$1,234", "$12,345,678", ["$", "1", ","]),
  },
  {
    label: "Duplicate words",
    description:
      'Both "the" instances should persist with distinct IDs. "cat"/"dog" exit, "big"/"small" enter.',
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
  },
  {
    label: "Empty to text",
    description:
      '"hello world" should enter with animation from empty. Morphing back to "" should fade all words out gracefully without layout jumps.',
    tags: ["edge case"],
    values: ["", "hello world", ""],
    verify: () => {
      // Empty old produces valid segments via the diff path
      const { segments } = diffSegments([], "hello world", "en");
      // And "hello world" → "" produces empty segments
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
  },
  {
    label: "Emoji",
    description:
      "Emoji grapheme clusters should be treated as single segments and persist correctly.",
    tags: ["grapheme", "edge case"],
    values: ["Hello 👋", "Goodbye 👋"],
    verify: () =>
      verifyWordPersistence("Hello 👋", "Goodbye 👋", "👋"),
  },
  {
    label: "Long sentence overlap",
    description:
      '"the", "quick", "fox", "over" persist. Other words swap in/out.',
    tags: ["flip", "enter", "exit"],
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
  },
  {
    label: "Rapid spam (auto-cycle)",
    description:
      "Hit Auto to toggle every 150ms. Animations should queue gracefully without glitches or jumps.",
    tags: ["spam", "resilience"],
    values: ["Transaction Safe", "Processing Transaction"],
    verify: () =>
      verifyCycleStability(
        "Transaction Safe",
        "Processing Transaction",
        "Transaction",
      ),
  },
];

const RESULTS = TESTS.map((test) => ({
  label: test.label,
  result: test.verify?.() ?? null,
}));

function TestCard({
  test,
  result,
}: {
  test: TestCase;
  result: { pass: boolean; detail: string } | null;
}) {
  const [index, setIndex] = React.useState(0);
  const [auto, setAuto] = React.useState(false);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const advance = React.useCallback(() => {
    setIndex((i) => (i + 1) % test.values.length);
  }, [test.values.length]);

  React.useEffect(() => {
    if (auto) {
      intervalRef.current = setInterval(advance, 150);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [auto, advance]);

  const isSpamTest = test.tags.includes("spam");

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.label}>{test.label}</span>
          {result && (
            <span
              className={
                result.pass ? styles.badgePass : styles.badgeFail
              }
              title={result.detail}
            >
              {result.pass ? "PASS" : "FAIL"}
            </span>
          )}
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
      <div className={styles.cardBody} style={{ textAlign: test.align }}>
        <TextMorph>{test.values[index]}</TextMorph>
      </div>
      <div className={styles.cardFooter}>
        <Button type="button" onClick={advance}>
          Morph
        </Button>
        {isSpamTest && (
          <Button type="button" onClick={() => setAuto((a) => !a)}>
            {auto ? "Stop" : "Auto"}
          </Button>
        )}
        <span className={styles.step}>
          {index + 1} / {test.values.length}
        </span>
      </div>
    </div>
  );
}

export const PlaygroundTests = () => {
  const passed = RESULTS.filter((r) => r.result?.pass).length;
  const failed = RESULTS.filter((r) => r.result && !r.result.pass).length;
  const total = RESULTS.filter((r) => r.result).length;

  return (
    <div className={styles.grid}>
      <div className={styles.summary}>
        <span className={styles.summaryLabel}>
          {passed}/{total} passed
          {failed > 0 && <span className={styles.summaryFail}> · {failed} failed</span>}
        </span>
        <div className={styles.summaryDots}>
          {RESULTS.map((r) => (
            <span
              key={r.label}
              className={
                !r.result
                  ? styles.dotSkip
                  : r.result.pass
                    ? styles.dotPass
                    : styles.dotFail
              }
              title={`${r.label}${r.result ? `: ${r.result.detail}` : ""}`}
            />
          ))}
        </div>
      </div>
      {TESTS.map((test, i) => (
        <TestCard key={test.label} test={test} result={RESULTS[i]!.result} />
      ))}
    </div>
  );
};
