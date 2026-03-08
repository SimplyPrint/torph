"use client";

import styles from "./styles.module.scss";
import React from "react";
import { Tooltip } from "@/components/tooltip";
import bundleSizes from "./bundle-sizes.json";
import pkg from "../../../../packages/torph/package.json";
import { TESTS, ALL_TAGS } from "./tests";
import type { Speed, EasingKey, Align } from "./config";
import { SPEEDS, EASINGS, ALIGNS } from "./config";
import type { PerfResult } from "./verify";
import { TestCard, useResults } from "./test-card";
import { SandboxCard } from "./sandbox-card";
import { copyResultsToClipboard, copyFailsToClipboard } from "./export";

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

  // Run-all sequencer state
  type RunItem = { testIndex: number; align: Align };
  const [running, setRunning] = React.useState(false);
  const [runQueue, setRunQueue] = React.useState<RunItem[]>([]);
  const [runCurrent, setRunCurrent] = React.useState<RunItem | null>(null);
  const [runCompleted, setRunCompleted] = React.useState(0);
  const [runTotal, setRunTotal] = React.useState(0);
  const [hasRunResults, setHasRunResults] = React.useState(false);
  const [showResults, setShowResults] = React.useState(false);
  const [autoRunSignal, setAutoRunSignal] = React.useState(0);
  const resultsPanelRef = React.useRef<HTMLDivElement | null>(null);

  const startRunAll = React.useCallback(() => {
    // Build queue: for each test, run all alignments before moving on
    const items: RunItem[] = [];
    for (let i = 0; i < TESTS.length; i++) {
      for (const a of ALIGNS) {
        items.push({ testIndex: i, align: a });
      }
    }
    setRunQueue(items);
    setRunCurrent(items[0]!);
    setRunCompleted(0);
    setRunTotal(items.length);
    setRunning(true);
    setHasRunResults(false);
    setShowResults(false);
    setAutoRunSignal((s) => s + 1);
    // Reset DOM/jump/perf results
    setDomResults(TESTS.map(() => null));
    setJumpResults(TESTS.map(() => null));
    setPerfResults(TESTS.map(() => null));
  }, []);

  const runAdvanceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCardRunComplete = React.useCallback(
    (testIndex: number, runAlign: Align) => {
      setRunCompleted((c) => c + 1);
      setRunQueue((queue) => {
        const remaining = queue.filter(
          (item) => !(item.testIndex === testIndex && item.align === runAlign),
        );
        if (remaining.length > 0) {
          const next = remaining[0]!;
          // Delay between alignment passes on same card so the shift is visible
          const delay = next.testIndex === testIndex ? 400 : 100;
          setRunCurrent(next);
          if (runAdvanceTimer.current) clearTimeout(runAdvanceTimer.current);
          runAdvanceTimer.current = setTimeout(() => {
            setAutoRunSignal((s) => s + 1);
          }, delay);
        } else {
          setRunCurrent(null);
          setRunning(false);
          setHasRunResults(true);
          setShowResults(true);
        }
        return remaining;
      });
    },
    [],
  );

  // Auto-scroll to the active card during a run
  React.useEffect(() => {
    if (running && runCurrent) {
      cardRefs.current[runCurrent.testIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [running, runCurrent]);

  // Scroll to results panel when run finishes
  React.useEffect(() => {
    if (hasRunResults && showResults && !running) {
      setTimeout(() => {
        resultsPanelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [hasRunResults, showResults, running]);

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
  const totalFailed = failed + domFailed + jumpFailed + perfFailed;

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
            {running ? (
              <span className={styles.summaryLabel}>
                Running {runCompleted}/{runTotal}
                {runCurrent ? ` (${runCurrent.align})` : ""}…
              </span>
            ) : (
              <span className={styles.summaryLabel}>
                {passed}/{total} passed
                {failed > 0 && (
                  <span className={styles.summaryFail}>
                    {" "}
                    · {failed} failed
                  </span>
                )}
                {domFailed > 0 && (
                  <span className={styles.summaryFail}>
                    {" "}
                    · {domFailed} DOM
                  </span>
                )}
                {jumpFailed > 0 && (
                  <span className={styles.summaryFail}>
                    {" "}
                    · {jumpFailed} JUMP
                  </span>
                )}
                {perfFailed > 0 && (
                  <span className={styles.summaryFail}>
                    {" "}
                    · {perfFailed} PERF
                  </span>
                )}
              </span>
            )}
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

        {/* Global run progress bar */}
        {running && (
          <div className={styles.runProgress}>
            <div
              className={styles.runProgressBar}
              style={{ width: `${(runCompleted / runTotal) * 100}%` }}
            />
          </div>
        )}

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

      {/* Results summary panel — shown after a run completes */}
      {hasRunResults && showResults && (
        <div className={styles.resultsPanel} ref={resultsPanelRef}>
          <div className={styles.resultsPanelHeader}>
            <span className={styles.resultsPanelTitle}>
              {totalFailed === 0
                ? `All ${total} tests passed`
                : `${totalFailed} issue${totalFailed !== 1 ? "s" : ""} found`}
            </span>
            <button
              type="button"
              className={styles.resultsPanelClose}
              onClick={() => setShowResults(false)}
            >
              ✕
            </button>
          </div>
          <div className={styles.resultsList}>
            {TESTS.map((test, i) => {
              const r = results[i];
              const dom = domResults[i];
              const jump = jumpResults[i];
              const perf = perfResults[i];
              const dataFail = r?.result && !r.result.pass;
              const domFail = dom && !dom.pass;
              const jumpFail = jump && !jump.pass;
              const perfFail = perf && !perf.pass;
              const anyFail = dataFail || domFail || jumpFail || perfFail;

              return (
                <button
                  key={test.label}
                  type="button"
                  className={`${styles.resultsRow} ${anyFail ? styles.resultsRowFail : styles.resultsRowPass}`}
                  onClick={() =>
                    cardRefs.current[i]?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    })
                  }
                >
                  <span className={styles.resultsStatus}>
                    {anyFail ? "✗" : "✓"}
                  </span>
                  <span className={styles.resultsLabel}>{test.label}</span>
                  {anyFail && (
                    <span className={styles.resultsFailTags}>
                      {dataFail && <span>DATA</span>}
                      {domFail && <span>DOM</span>}
                      {jumpFail && <span>JUMP</span>}
                      {perfFail && <span>PERF</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
          align={running && runCurrent?.testIndex === i ? runCurrent.align : align}
          debug={debug}
          autoRunSignal={running && runCurrent?.testIndex === i ? autoRunSignal : 0}
          onRunComplete={() => handleCardRunComplete(i, runCurrent?.align ?? "left")}
          onDomResult={(r) =>
            setDomResults((prev) => {
              const next = [...prev];
              // Keep existing failure across alignment passes
              if (next[i] && !next[i]!.pass) return next;
              next[i] = r;
              return next;
            })
          }
          onJumpResult={(r) =>
            setJumpResults((prev) => {
              const next = [...prev];
              if (next[i] && !next[i]!.pass) return next;
              next[i] = r;
              return next;
            })
          }
          onPerfResult={(r) =>
            setPerfResults((prev) => {
              const next = [...prev];
              if (next[i] && !next[i]!.pass) return next;
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
        <kbd>Space</kbd> morph · <kbd>⇧Space</kbd> all
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
          className={styles.runAllBtn}
          onClick={
            running
              ? () => {
                  setRunning(false);
                  setRunCurrent(null);
                  setRunQueue([]);
                  if (runAdvanceTimer.current) clearTimeout(runAdvanceTimer.current);
                }
              : startRunAll
          }
        >
          {running ? "Stop" : "Run All"}
        </button>
        {hasRunResults && !showResults && (
          <button
            type="button"
            className={styles.button}
            onClick={() => setShowResults(true)}
          >
            Results
          </button>
        )}
      </div>
    </div>
  );
};
