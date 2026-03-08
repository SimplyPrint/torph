import React from "react";
import { segmentText, diffSegments } from "torph";
import type { Segment } from "torph";
import type { VerifyFn, VerifyDomFn } from "./verify";
import {
  verifyWordPersistence,
  verifyCharMorph,
  verifyNoMorph,
  verifyCycleStability,
  verifyWordAbsent,
  verifyGraphemeMorph,
  combineResults,
  verifyDomStandard,
  verifyMultiline,
} from "./verify";

export type TestCase = {
  label: string;
  description: string;
  tags: string[];
  values: string[];
  align?: React.CSSProperties["textAlign"];
  verify?: VerifyFn;
  verifyDom?: VerifyDomFn;
};

export const TESTS: TestCase[] = [
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

export const ALL_TAGS = [...new Set(TESTS.flatMap((t) => t.tags))].sort();
