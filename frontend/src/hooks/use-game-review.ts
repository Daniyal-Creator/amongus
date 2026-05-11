"use client";

import { useCallback, useEffect, useState } from "react";
import { getGameReview } from "@/lib/api";
import type { GameReviewResponse } from "@/types";

export function useGameReview(sessionId: string, phase: string) {
  const [review, setReview] = useState<GameReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getGameReview(sessionId);
      setReview(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengambil review.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (phase === "game_over" && !review) {
      void fetchReview();
    }
  }, [phase, review, fetchReview]);

  return { review, loading, error, fetchReview };
}
