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
      <p className="text-xl mb-3">AI Post-Game Review</p>

      {loading ? (
        <div className="space-y-2">
          <div className="pixel-skeleton h-4 w-full" />
          <div className="pixel-skeleton h-4 w-5/6" />
          <div className="pixel-skeleton h-4 w-4/6" />
          <div className="pixel-skeleton h-4 w-full" />
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
            Retry
          </button>
        </div>
      ) : null}

      {review && !loading ? (
        <div>
          <div className="pixel-panel-result px-4 py-3">
            <pre className="pixel-small text-[#5c4427] whitespace-pre-wrap font-[var(--font-plex-mono)]">
              {review.review}
            </pre>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="pixel-badge pixel-badge-info">{review.model}</span>
            <span className="pixel-badge">{review.cached ? "Cached" : "Fresh"}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
