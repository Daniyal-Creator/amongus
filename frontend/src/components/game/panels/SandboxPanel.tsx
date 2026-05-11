"use client";

import { useSandbox } from "@/hooks/use-sandbox";
import type { GameSnapshot } from "@/types";

type SandboxPanelProps = {
  sessionId: string;
  playerId: string;
  phase: GameSnapshot["phase"];
  description: string;
  isCivilian: boolean;
  sabotageCharges: number;
  onPrimaryAction: () => void;
};

export function SandboxPanel({
  sessionId,
  playerId,
  phase,
  description,
  isCivilian,
  sabotageCharges,
  onPrimaryAction,
}: SandboxPanelProps) {
  const { results, loading, error, execute, reset } = useSandbox(sessionId, playerId);

  const actionDisabled = phase !== "playing";
  const primaryActionLabel = isCivilian ? "△ EMERGENCY" : "⚠ SABOTAGE";
  const primaryActionClass = isCivilian
    ? "pixel-button pixel-button-primary"
    : "pixel-button pixel-button-danger";

  return (
    <div className="border-t-4 border-[color:var(--brown)]">
      <div className="flex items-center justify-between bg-[#f7edd8] p-3 gap-2">
        <div className="pixel-small text-[#5c4427] flex-1 min-w-0">{description}</div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void execute()}
            disabled={actionDisabled || loading}
            className={`pixel-button pixel-button-success text-xs px-3 ${
              actionDisabled || loading ? "opacity-60" : ""
            }`}
          >
            {loading ? "Running..." : "▶ RUN CODE"}
          </button>
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={actionDisabled || (!isCivilian && sabotageCharges <= 0)}
            className={`${primaryActionClass} shrink-0 ${actionDisabled ? "opacity-60" : ""}`}
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-[var(--status-error-bg)] border-t-3 border-[var(--status-error-border)] px-4 py-3 flex items-center justify-between">
          <span className="pixel-small text-[#5c0a0a]">{error}</span>
          <button
            type="button"
            onClick={() => void execute()}
            className="pixel-button text-xs px-3 min-h-[32px]"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading && !results ? (
        <div className="bg-[#fff8ea] border-t-3 border-[var(--brown)] px-4 py-3">
          <div className="pixel-progress pixel-progress-indeterminate">
            <div className="pixel-progress-bar" />
          </div>
          <p className="pixel-small text-[#5c4427] mt-2">Executing tests...</p>
        </div>
      ) : null}

      {results ? (
        <div className="bg-[#fff8ea] border-t-3 border-[var(--brown)] px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className={`pixel-badge ${
                  results.passed === results.total ? "pixel-badge-success" : "pixel-badge-danger"
                }`}
              >
                {results.passed}/{results.total} PASSED
              </span>
            </div>
            <button
              type="button"
              onClick={reset}
              className="pixel-small text-[#5c4427] underline cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="space-y-2">
            {results.results.map((test, idx) => (
              <div
                key={idx}
                className={`pixel-panel-result px-3 py-2 ${
                  test.passed ? "border-l-4 border-l-[var(--status-success-border)]" : "border-l-4 border-l-[var(--status-error-border)]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`pixel-badge ${test.passed ? "pixel-badge-success" : "pixel-badge-danger"}`}>
                    {test.passed ? "PASS" : "FAIL"}
                  </span>
                  <span className="pixel-small text-[#5c4427]">Test {idx + 1}</span>
                </div>
                {test.input ? (
                  <p className="pixel-small text-[#5c4427]">
                    Input: <code className="bg-[#e8dcc8] px-1">{test.input}</code>
                  </p>
                ) : null}
                <p className="pixel-small text-[#5c4427]">
                  Expected: <code className="bg-[#e8dcc8] px-1">{test.expected}</code>
                </p>
                <p className="pixel-small text-[#5c4427]">
                  Got: <code className="bg-[#e8dcc8] px-1">{test.actual}</code>
                </p>
                {test.error ? (
                  <p className="pixel-small text-[#9f2c27] mt-1">{test.error}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
