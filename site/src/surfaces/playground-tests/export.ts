import type { PerfResult } from "./verify";

export type TestResult = {
  label: string;
  result: { pass: boolean; detail: string } | null;
  timeMs: number | null;
};

export function copyResultsToClipboard(
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

export function copyFailsToClipboard(
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
