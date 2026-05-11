import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameReviewPanel } from "@/components/game/panels/GameReviewPanel";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getGameReview: vi.fn(),
}));

const mockGetReview = vi.mocked(api.getGameReview);

describe("GameReviewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when phase is not game_over", () => {
    const { container } = render(<GameReviewPanel sessionId="s1" phase="playing" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows loading skeletons when fetching", () => {
    mockGetReview.mockReturnValue(new Promise(() => {}));

    render(<GameReviewPanel sessionId="s1" phase="game_over" />);
    expect(screen.getByText("AI Post-Game Review")).toBeInTheDocument();
  });

  it("displays review text on success", async () => {
    mockGetReview.mockResolvedValue({
      review: "Great game! Civilians found the imposter quickly.",
      model: "llama3",
      cached: false,
    });

    render(<GameReviewPanel sessionId="s1" phase="game_over" />);

    await waitFor(() => {
      expect(screen.getByText("Great game! Civilians found the imposter quickly.")).toBeInTheDocument();
    });

    expect(screen.getByText("llama3")).toBeInTheDocument();
    expect(screen.getByText("Fresh")).toBeInTheDocument();
  });

  it("shows cached indicator", async () => {
    mockGetReview.mockResolvedValue({
      review: "Review text",
      model: "llama3",
      cached: true,
    });

    render(<GameReviewPanel sessionId="s1" phase="game_over" />);

    await waitFor(() => {
      expect(screen.getByText("Cached")).toBeInTheDocument();
    });
  });

  it("shows error with retry button", async () => {
    mockGetReview.mockRejectedValue(new Error("Session not found."));

    render(<GameReviewPanel sessionId="s1" phase="game_over" />);

    await waitFor(() => {
      expect(screen.getByText("Session not found.")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("retries on retry button click", async () => {
    mockGetReview.mockRejectedValueOnce(new Error("fail"));

    render(<GameReviewPanel sessionId="s1" phase="game_over" />);

    await waitFor(() => {
      expect(screen.getByText("fail")).toBeInTheDocument();
    });

    mockGetReview.mockResolvedValue({ review: "Success!", model: "llama3", cached: false });
    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("Success!")).toBeInTheDocument();
    });
  });
});
