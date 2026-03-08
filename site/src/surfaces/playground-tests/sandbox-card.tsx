import React from "react";
import { TextMorph } from "torph/react";
import { DEFAULT_TEXT_MORPH_OPTIONS } from "torph";
import styles from "./styles.module.scss";

export function SandboxCard() {
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
