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
    poisonResult,
    loading,
    error,
    remaining,
    requestSuggestion,
    activatePoison,
  } = useAiAssist(sessionId, playerId, { onGhostHint });

  const isRateLimited = remaining !== null && remaining <= 0;

  return (
    <div className="mt-6">
      <h3 className="text-xl">Ghost AI</h3>
      <p className="pixel-small mt-1 text-white/80">
        {remaining !== null ? `Remaining: ${remaining}/5` : "AI-powered sabotage tools"}
      </p>

      <div className="mt-3 space-y-2">
        <button
          type="button"
          onClick={() => void requestSuggestion()}
          disabled={loading || isRateLimited}
          className={`pixel-button pixel-button-danger w-full text-xs ${
            loading || isRateLimited ? "opacity-60" : ""
          }`}
        >
          {loading ? "Thinking..." : "ASK GHOST"}
        </button>

        <button
          type="button"
          onClick={() => void activatePoison()}
          disabled={loading || isRateLimited}
          className={`pixel-button pixel-button-danger w-full text-xs ${
            loading || isRateLimited ? "opacity-60" : ""
          }`}
        >
          {loading ? "Injecting..." : "POISON COPILOT"}
        </button>
      </div>

      {isRateLimited ? (
        <p className="pixel-small mt-2 text-[var(--status-error-bg)]">
          Rate limited. Tunggu beberapa saat.
        </p>
      ) : null}

      {error ? (
        <div className="pixel-panel-result mt-3 px-3 py-2 border-l-4 border-l-[var(--status-error-border)]">
          <p className="pixel-small text-[#9f2c27]">{error}</p>
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
