"use client";

import { useAiAssist } from "@/hooks/use-ai-assist";
import type { GameSnapshot } from "@/types";

type AiAssistPanelProps = {
  sessionId: string;
  playerId: string;
  phase: GameSnapshot["phase"];
  onGhostHint?: () => void;
};

export function AiAssistPanel({ sessionId, playerId, phase, onGhostHint }: AiAssistPanelProps) {
  if (phase !== "playing") return null;

  return <AiAssistPanelInner sessionId={sessionId} playerId={playerId} onGhostHint={onGhostHint} />;
}

function AiAssistPanelInner({ sessionId, playerId, onGhostHint }: { sessionId: string; playerId: string; onGhostHint?: () => void }) {
  const {
    suggestion,
    poisonResult,
    loading,
    error,
    ghostUsed,
    poisonUsed,
    requestSuggestion,
    activatePoison,
  } = useAiAssist(sessionId, playerId, { onGhostHint });

  return (
    <div className="mt-6">
      <h3 className="text-xl">Ghost AI</h3>
      <p className="pixel-small mt-1 text-white/80">AI-powered sabotage tools</p>

      <div className="mt-3 space-y-3">
        {/* ASK GHOST button */}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => void requestSuggestion()}
            disabled={loading || ghostUsed}
            className={`pixel-button pixel-button-danger w-full text-base px-6 py-3 ${
              ghostUsed ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {loading && !ghostUsed ? "Thinking..." : ghostUsed ? "ASK GHOST — USED" : "ASK GHOST"}
          </button>
          {ghostUsed && (
            <p className="pixel-small text-center text-[var(--status-error-bg)]">
              1/1 used
            </p>
          )}
        </div>

        {/* POISON COPILOT button */}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => void activatePoison()}
            disabled={loading || poisonUsed}
            className={`pixel-button pixel-button-danger w-full text-base px-6 py-3 ${
              poisonUsed ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {loading && !poisonUsed ? "Injecting..." : poisonUsed ? "POISON COPILOT — USED" : "POISON COPILOT"}
          </button>
          {poisonUsed && (
            <p className="pixel-small text-center text-[var(--status-error-bg)]">
              1/1 used
            </p>
          )}
        </div>
      </div>

      {error ? (
        <div className="pixel-panel-result mt-3 px-3 py-2 border-l-4 border-l-[var(--status-error-border)]">
          <p className="pixel-small text-[#9f2c27]">{error}</p>
        </div>
      ) : null}

      {suggestion ? (
        <div className="pixel-panel-result mt-3 px-3 py-2 border-l-4 border-l-[var(--status-success-border)]">
          <p className="pixel-small text-[#5c4427]">{suggestion.suggestion}</p>
        </div>
      ) : null}

      {poisonResult ? (
        <div className="pixel-panel-result mt-3 px-3 py-2 border-l-4 border-l-[var(--status-success-border)]">
          <p className="pixel-small text-[#5c4427]">
            Poisoned hint injected to chat.
            {poisonResult.usedFallback ? " (fallback used)" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
