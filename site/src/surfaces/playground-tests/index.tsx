"use client";

import styles from "./styles.module.scss";
import React from "react";
import { TextMorph } from "torph/react";
import { segmentText, diffSegments, DEFAULT_TEXT_MORPH_OPTIONS } from "torph";
import type { Segment } from "torph";
import { Button } from "@/components/button";
import bundleSizes from "./bundle-sizes.json";
import pkg from "../../../../packages/torph/package.json";

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
  },
  {
    label: "Emoji",
    description:
      "Emoji grapheme clusters should be treated as single segments and persist correctly.",
    tags: ["grapheme", "edge case"],
    values: ["Hello 👋", "Goodbye 👋"],
    verify: () => verifyWordPersistence("Hello 👋", "Goodbye 👋", "👋"),
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
  {
    label: "RTL text (Arabic)",
    description:
      "Arabic text should segment and diff correctly. Shared words should persist across transitions.",
    tags: ["i18n", "edge case"],
    values: ["مرحبا بالعالم", "مرحبا يا صديقي"],
    verify: () =>
      verifyWordPersistence("مرحبا بالعالم", "مرحبا يا صديقي", "مرحبا"),
  },
  {
    label: "RTL text (Hebrew)",
    description: "Hebrew text segmentation and persistence of shared words.",
    tags: ["i18n", "edge case"],
    values: ["שלום עולם", "שלום חברים"],
    verify: () => verifyWordPersistence("שלום עולם", "שלום חברים", "שלום"),
  },
  {
    label: "Long paragraph",
    description:
      "Stress test with paragraph-length text. Common words should persist, unique words should enter/exit.",
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
  },
  {
    label: "Whitespace normalization",
    description:
      "Extra spaces should not cause unexpected segment splits or ID changes.",
    tags: ["edge case"],
    values: ["hello world", "hello  world", "hello world"],
    verify: () => verifyWordPersistence("hello world", "hello world", "hello"),
  },
  {
    label: "Unicode accents",
    description:
      "Accented characters (café → cafe) should handle gracefully. Shared base chars should persist.",
    tags: ["grapheme", "edge case"],
    values: ["café", "cafe"],
    verify: () => verifyGraphemeMorph("café", "cafe", ["c", "a", "f"]),
  },
  {
    label: "Compound emoji",
    description:
      "Complex emoji (family, flag sequences) should be treated as single grapheme segments.",
    tags: ["grapheme", "edge case"],
    values: ["Hello 👨‍👩‍👧‍👦", "Goodbye 👨‍👩‍👧‍👦"],
    verify: () => verifyWordPersistence("Hello 👨‍👩‍👧‍👦", "Goodbye 👨‍👩‍👧‍👦", "👨‍👩‍👧‍👦"),
  },
  {
    label: "Multiline basic",
    description:
      "Shared words should persist across line breaks. Newlines are treated as word boundaries.",
    tags: ["multiline"],
    values: ["hello\nworld", "hello\nuniverse"],
    verify: () =>
      verifyWordPersistence("hello\nworld", "hello\nuniverse", "hello"),
  },
  {
    label: "Multiline add line",
    description:
      "Adding a new line should enter new words. Existing words should persist.",
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
  },
  {
    label: "Multiline remove line",
    description:
      "Removing a line should exit those words. Remaining words should persist.",
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
  },
  {
    label: "Multiline reorder",
    description:
      "Swapping line order. Shared words should persist and FLIP to new positions.",
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
            <span key={i} className={styles.segmentChip} title={`ID: ${s.id}`}>
              {s.string === "\u00A0" ? "·" : s.string}
              <span className={styles.segmentId}>{s.id.slice(0, 6)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className={styles.inspectorSection}>
        <span className={styles.inspectorLabel}>New segments</span>
        <div className={styles.segmentList}>
          {newSegs.map((s, i) => {
            const persisted = oldSegs.some((o) => o.id === s.id);
            return (
              <span
                key={i}
                className={`${styles.segmentChip} ${persisted ? styles.segmentPersisted : styles.segmentNew}`}
                title={`ID: ${s.id}${persisted ? " (persisted)" : " (new)"}`}
              >
                {s.string === "\u00A0" ? "·" : s.string}
                <span className={styles.segmentId}>{s.id.slice(0, 6)}</span>
              </span>
            );
          })}
        </div>
      </div>
      {splits.size > 0 && (
        <div className={styles.inspectorSection}>
          <span className={styles.inspectorLabel}>Splits</span>
          <div className={styles.segmentList}>
            {[...splits.entries()].map(([word, chars]) => (
              <span
                key={word}
                className={styles.segmentChip}
                title={`"${word}" split into ${chars.length} chars`}
              >
                {word} → {chars.map((c) => c.string).join("")}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TestCard({
  test,
  result,
  timeMs,
  morphAllSignal,
  cardRef,
}: {
  test: TestCase;
  result: { pass: boolean; detail: string } | null;
  timeMs: number | null;
  morphAllSignal: number;
  cardRef?: React.Ref<HTMLDivElement>;
}) {
  const SPEEDS = {
    default: DEFAULT_TEXT_MORPH_OPTIONS.duration,
    slow: 3000,
    fast: 150,
  } as const;
  type Speed = keyof typeof SPEEDS;

  const [index, setIndex] = React.useState(0);
  const [auto, setAuto] = React.useState(false);
  const [showInspector, setShowInspector] = React.useState(false);
  const [speed, setSpeed] = React.useState<Speed>("default");
  const [easing, setEasing] = React.useState<EasingKey>("default");
  const progressRef = React.useRef<HTMLDivElement | null>(null);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

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
          {result && (
            <span
              className={result.pass ? styles.badgePass : styles.badgeFail}
              title={result.detail}
            >
              {result.pass ? "PASS" : "FAIL"}
            </span>
          )}
          {timeMs !== null && (
            <span
              className={styles.perfBadge}
              title={`Avg over 100 iterations`}
            >
              {timeMs < 0.01 ? "<0.01" : timeMs.toFixed(2)}ms
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
      <p className={styles.verifyDetail}>{result ? result.detail : "\u00A0"}</p>
      <div
        className={styles.cardBody}
        style={{ textAlign: test.align, cursor: "pointer" }}
        onClick={advance}
      >
        <TextMorph
          duration={SPEEDS[speed]}
          ease={EASINGS[easing]}
          onAnimationStart={() => {
            if (progressRef.current) {
              const el = progressRef.current;
              el.style.transition = "none";
              el.style.width = "0%";
              el.offsetHeight; // force reflow
              el.style.transition = `width ${SPEEDS[speed]}ms linear`;
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
          {test.values[index]}
        </TextMorph>
      </div>
      <div className={styles.cardFooter}>
        {isSpamTest && (
          <Button type="button" onClick={() => setAuto((a) => !a)}>
            {auto ? "Stop" : "Auto"}
          </Button>
        )}
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
          <button
            type="button"
            className={`${styles.iconBtn} ${showInspector ? styles.iconBtnActive : ""}`}
            onClick={() => setShowInspector((s) => !s)}
            title={showInspector ? "Hide inspector" : "Show inspector"}
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

function copyResultsToClipboard(results: TestResult[]) {
  const lines = [
    "# Torph Test Results",
    "",
    `| Test | Status | Time |`,
    `|------|--------|------|`,
    ...results.map((r) => {
      const status = !r.result ? "Skip" : r.result.pass ? "Pass" : "Fail";
      const time = r.timeMs !== null ? `${r.timeMs.toFixed(2)}ms` : "-";
      return `| ${r.label} | ${status} | ${time} |`;
    }),
    "",
    `Generated: ${new Date().toISOString()}`,
  ];
  navigator.clipboard.writeText(lines.join("\n"));
}

export const PlaygroundTests = () => {
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [failOnly, setFailOnly] = React.useState(false);
  const [morphAllSignal, setMorphAllSignal] = React.useState(0);
  const [copied, setCopied] = React.useState(false);
  const results = useResults();
  const cardRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  const filteredIndices = TESTS.map((_, i) => i).filter((i) => {
    if (activeTag && !TESTS[i]!.tags.includes(activeTag)) return false;
    if (failOnly && results[i]?.result?.pass !== false) return false;
    return true;
  });

  const isDev = process.env.NODE_ENV !== "production";
  const passed = results.filter((r) => r.result?.pass).length;
  const failed = results.filter((r) => r.result && !r.result.pass).length;
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
    copyResultsToClipboard(results);
    setCopied(true);
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
            </span>
            <span className={styles.version}>
              v{pkg.version}
              {isDev && <span className={styles.versionDev}>dev</span>}
            </span>
          </div>
          <div className={styles.summaryDots}>
            {results.map((r) => (
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
        <div className={styles.summaryRow}>
          <div className={styles.bundleSizes}>
            {bundleSizes.map((entry) => {
              const diff = entry.publishedGzip
                ? entry.gzip - entry.publishedGzip
                : 0;
              const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
              return (
                <span
                  key={entry.name}
                  className={styles.bundleEntry}
                  title={`${entry.name}: ${(entry.raw / 1024).toFixed(1)}kB raw · published: ${(entry.publishedGzip / 1024).toFixed(1)}kB gz`}
                >
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
              );
            })}
          </div>
          <div className={styles.summaryActions}>
            <button
              type="button"
              className={styles.button}
              onClick={handleCopy}
            >
              {copied ? "Copied!" : "Copy Results"}
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
          cardRef={(el) => {
            cardRefs.current[i] = el;
          }}
        />
      ))}
      <p className={styles.keyboardHint}>
        <kbd>Space</kbd> morph focused card · <kbd>Shift+Space</kbd> morph all
      </p>
    </div>
  );
};
