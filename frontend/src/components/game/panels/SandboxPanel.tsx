"use client";

import { useRef } from "react";
import { useSandbox } from "@/hooks/use-sandbox";
import { useSounds } from "@/lib/sound-provider";
import type { GameSnapshot, SandboxRunResponse } from "@/types";
import { Play, TriangleAlert } from "lucide-react";

type SandboxPanelProps = {
  sessionId: string;
  playerId: string;
  phase: GameSnapshot["phase"];
  description: string;
  isCivilian: boolean;
  onPrimaryAction: () => void;
};

const MAX_VISIBLE_FAILURE_DETAILS = 2;

function isImposterResponse(
  response: SandboxRunResponse,
): response is Extract<SandboxRunResponse, { mode: "imposter" }> {
  return response.mode === "imposter";
}

export function SandboxPanel({
  sessionId,
  playerId,
  phase,
  description,
  isCivilian,
  onPrimaryAction,
}: SandboxPanelProps) {
  const { results, loading, error, execute, reset } = useSandbox(sessionId, playerId);
  const { play: playSound } = useSounds();

  // Track how many tasks/tests passed on the PREVIOUS run (-1 = no run yet).
  // This lets us detect progress: if the count increased we play success even
  // when there are still failures, so the player gets positive feedback for
  // each fix without hearing success + fail at the same time.
  const prevPassedRef = useRef<number>(-1);

  const actionDisabled = phase !== "playing";

  async function handleExecute() {
    const response = await execute();
    if (!response) return; // network error — already shown in error state

    const prev = prevPassedRef.current;

    if (isImposterResponse(response)) {
      const current = response.completed;
      const total = response.total;

      if (current === total) {
        // All tasks validated — full success
        playSound("success");
      } else if (prev >= 0 && current > prev) {
        // Made progress (≥1 new task validated) — partial success, no fail sound
        playSound("success");
      } else {
        // First run with failures, or no improvement
        playSound("fail");
      }

      prevPassedRef.current = current;
    } else {
      const current = response.passed;
      const total = response.total;

      if (current === total) {
        // All tests passed — full success
        playSound("success");
      } else if (prev >= 0 && current > prev) {
        // Made progress (≥1 new test passed) — partial success, no fail sound
        playSound("success");
      } else {
        // First run with failures, or no improvement
        playSound("fail");
      }

      prevPassedRef.current = current;
    }
  }

  function handleReset() {
    // Clear previous-run memory so next run starts fresh judgment
    prevPassedRef.current = -1;
    reset();
  }

  return (
    <div className="border-t-4 border-[color:var(--brown)]">
      <div className="flex items-center justify-between bg-[#f7edd8] p-3 gap-2">
        <div className="pixel-small text-[#5c4427] flex-1 min-w-0">{description}</div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleExecute()}
            disabled={actionDisabled || loading}
            className={`pixel-button pixel-button-success text-xs px-3 ${
              actionDisabled || loading ? "opacity-60" : ""
            }`}
          >
            {loading ? "Running..." : (
              <span className="flex items-center gap-2">
                <Play className="w-4 h-4 fill-current" />
                {isCivilian ? "RUN CODE" : "VALIDATE BUG"}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={actionDisabled}
            className={`pixel-button pixel-button-emergency shrink-0 ${
              actionDisabled
                ? "opacity-60"
                : isCivilian
                  ? "motion-safe:animate-emergency-pulse"
                  : "emergency-button-imposter"
            }`}
          >
            <span className="flex items-center gap-2">
              <TriangleAlert className="w-4 h-4 fill-current" />
              EMERGENCY
            </span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-[var(--status-error-bg)] border-t-3 border-[var(--status-error-border)] px-4 py-3 flex items-center justify-between">
          <span className="pixel-small text-[#5c0a0a]">{error}</span>
          <button
            type="button"
            onClick={() => void handleExecute()}
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
          <p className="pixel-small text-[#5c4427] mt-2">
            {isCivilian ? "Executing tests..." : "Validating sabotage..."}
          </p>
        </div>
      ) : null}

      {results && isImposterResponse(results) ? (
        <div className="bg-[#fff8ea] border-t-3 border-[var(--brown)] px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span
              className={`pixel-badge ${
                results.completed === results.total ? "pixel-badge-success" : "pixel-badge-danger"
              }`}
            >
              {results.completed}/{results.total} VALIDATED
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="pixel-small text-[#5c4427] underline cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="space-y-2">
            {(() => {
              let visibleFailureDetails = 0;

              return results.tasks.map((task) => {
                const showHint =
                  !task.done &&
                  Boolean(task.hint) &&
                  visibleFailureDetails < MAX_VISIBLE_FAILURE_DETAILS;

                if (showHint) {
                  visibleFailureDetails += 1;
                }

                return (
                  <div
                    key={task.index}
                    className={`pixel-panel-result px-3 py-2 ${
                      task.done
                        ? "border-l-4 border-l-[var(--status-success-border)]"
                        : "border-l-4 border-l-[var(--status-error-border)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`pixel-badge ${task.done ? "pixel-badge-success" : "pixel-badge-danger"}`}>
                        {task.done ? "PASS" : "FAIL"}
                      </span>
                      <span className="pixel-small text-[#5c4427]">{task.title}</span>
                    </div>
                    <p className="pixel-small text-[#5c4427]">Line {task.lineHint}</p>
                    {showHint ? (
                      <p className="pixel-small text-[#9f2c27] mt-1">{task.hint}</p>
                    ) : null}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      ) : null}

      {results && !isImposterResponse(results) ? (
        <div className="bg-[#fff8ea] border-t-3 border-[var(--brown)] px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span
              className={`pixel-badge ${
                results.passed === results.total ? "pixel-badge-success" : "pixel-badge-danger"
              }`}
            >
              {results.passed}/{results.total} PASSED
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="pixel-small text-[#5c4427] underline cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="space-y-2">
            {(() => {
              let visibleFailureDetails = 0;

              return results.results.map((test, idx) => {
                const showFailureDetails =
                  !test.passed && visibleFailureDetails < MAX_VISIBLE_FAILURE_DETAILS;

                if (showFailureDetails) {
                  visibleFailureDetails += 1;
                }

                return (
                  <div
                    key={idx}
                    className={`pixel-panel-result px-3 py-2 ${
                      test.passed
                        ? "border-l-4 border-l-[var(--status-success-border)]"
                        : "border-l-4 border-l-[var(--status-error-border)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`pixel-badge ${test.passed ? "pixel-badge-success" : "pixel-badge-danger"}`}>
                        {test.passed ? "PASS" : "FAIL"}
                      </span>
                      <span className="pixel-small text-[#5c4427]">
                        {test.input || `Test ${idx + 1}`}
                      </span>
                    </div>
                    {test.passed || showFailureDetails ? (
                      <>
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
                      </>
                    ) : null}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
