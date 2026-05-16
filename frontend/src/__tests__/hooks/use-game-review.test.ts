import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useGameReview } from "@/hooks/use-game-review";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getGameReview: vi.fn(),
}));

const mockGetReview = vi.mocked(api.getGameReview);

const mockResponse = {
  players: [
    { name: "Budi", role: "civilian", feedback: "Kamu berhasil menemukan impostor." },
    { name: "Rani", role: "imposter", feedback: "Sabotase kamu ketahuan." },
  ],
  model: "llama3",
  cached: false,
};

describe("useGameReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with null review", () => {
    const { result } = renderHook(() => useGameReview("session-1", "playing"));
    expect(result.current.review).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("auto-fetches when phase is game_over", async () => {
    mockGetReview.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useGameReview("session-1", "game_over"));

    await waitFor(() => {
      expect(result.current.review).toEqual(mockResponse);
    });

    expect(result.current.loading).toBe(false);
  });

  it("does not auto-fetch when phase is not game_over", () => {
    renderHook(() => useGameReview("session-1", "playing"));
    expect(mockGetReview).not.toHaveBeenCalled();
  });

  it("handles fetch error", async () => {
    mockGetReview.mockRejectedValue(new Error("Session not found."));

    const { result } = renderHook(() => useGameReview("session-1", "game_over"));

    await waitFor(() => {
      expect(result.current.error).toBe("Session not found.");
    });

    expect(result.current.review).toBeNull();
  });

  it("allows manual retry after error", async () => {
    mockGetReview.mockRejectedValueOnce(new Error("fail"));
    mockGetReview.mockResolvedValue({ ...mockResponse, cached: true });

    const { result } = renderHook(() => useGameReview("session-1", "game_over"));

    await waitFor(() => {
      expect(result.current.error).toBe("fail");
    });

    await act(async () => {
      await result.current.fetchReview();
    });

    expect(result.current.review?.players).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });
});
