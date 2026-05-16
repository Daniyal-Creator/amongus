"use client";

import { useGameReview } from "@/hooks/use-game-review";

type GameReviewPanelProps = {
  sessionId: string;
  phase: string;
};

export function GameReviewPanel({ sessionId, phase }: GameReviewPanelProps) {
  const { review, loading, error, fetchReview } = useGameReview(sessionId, phase);

  if (phase !== "game_over") return null;

  return (
    <div className="pixel-panel mt-6 p-5">
      <p className="text-xl mb-4">Feedback Pemain</p>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <div className="pixel-spinner" />
          <p className="pixel-small text-[#5c4427] motion-safe:animate-pulse">
            AI sedang menganalisis...
          </p>
        </div>
      ) : null}

      {error && !loading ? (
        <div className="pixel-panel-result px-3 py-2 border-l-4 border-l-[var(--status-error-border)]">
          <p className="pixel-small text-[#9f2c27] mb-2">{error}</p>
          <button
            type="button"
            onClick={() => void fetchReview()}
            className="pixel-button text-xs px-3 min-h-[32px]"
          >
            Coba Lagi
          </button>
        </div>
      ) : null}

      {review && !loading ? (
        <div className="space-y-3">
          {review.players.map((player) => (
            <div
              key={player.name}
              className="flex items-start gap-3 px-3 py-3 bg-[#fff8ea] border-2 border-[#e0c9a3]"
            >
              <span
                className={`pixel-chip text-[10px] px-2 py-0.5 shrink-0 mt-0.5 ${
                  player.role === "imposter" ? "pixel-chip-red" : "pixel-chip-green"
                }`}
              >
                {player.role === "imposter" ? "IMPOSTOR" : "CIVILIAN"}
              </span>
              <div className="min-w-0">
                <p className="pixel-small font-bold text-[#5c4427] mb-0.5">{player.name}</p>
                <p className="pixel-small text-[#39404f]">{player.feedback}</p>
              </div>
            </div>
          ))}
          <p className="pixel-small text-[#a69882] text-right mt-1">model: {review.model}</p>
        </div>
      ) : null}
    </div>
  );
}
