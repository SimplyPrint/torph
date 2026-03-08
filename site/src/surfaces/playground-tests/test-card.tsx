import React from "react";
import { TextMorph } from "torph/react";
import { segmentText, diffSegments } from "torph";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/button";
import styles from "./styles.module.scss";
import type { TestCase } from "./tests";
import { TESTS } from "./tests";
import type { PerfResult, JumpSnapshot } from "./verify";
import { FrameMonitor, takeJumpSnapshot, verifyNoJump, measurePerf } from "./verify";
import type { Speed, EasingKey, Align } from "./config";
import { SPEEDS, EASINGS } from "./config";

export type TestResult = {
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

export function useResults(): TestResult[] {
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

export function TestCard({
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
  autoRunSignal,
  onRunComplete,
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
  autoRunSignal?: number;
  onRunComplete?: () => void;
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
  const autoRunning = React.useRef(false);
  const autoRunTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRunCompleteRef = React.useRef(onRunComplete);
  onRunCompleteRef.current = onRunComplete;

  const advance = React.useCallback(() => {
    setIndex((i) => (i + 1) % test.values.length);
  }, [test.values.length]);

  // Auto-run: advance once, wait for animation, then signal completion
  React.useEffect(() => {
    if (!autoRunSignal) {
      autoRunning.current = false;
      if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
      return;
    }
    autoRunning.current = true;
    // Advance one step
    setIndex((i) => (i + 1) % test.values.length);
    // Fallback: if onAnimationComplete doesn't fire within 2s, force-complete
    autoRunTimer.current = setTimeout(() => {
      if (autoRunning.current) {
        autoRunning.current = false;
        onRunCompleteRef.current?.();
      }
    }, 2000);
  }, [autoRunSignal, test.values.length]);

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
            // Auto-run: single morph done, signal completion
            if (autoRunning.current) {
              if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
              autoRunning.current = false;
              onRunCompleteRef.current?.();
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
