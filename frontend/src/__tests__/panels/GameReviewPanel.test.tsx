import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameReviewPanel } from "@/components/game/panels/GameReviewPanel";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getGameReview: vi.fn(),
}));

const mockGetReview = vi.mocked(api.getGameReview);

const mockReview = {
  players: [
    { name: "Budi", role: "civilian", feedback: "Kamu berhasil menemukan impostor." },
    { name: "Rani", role: "imposter", feedback: "Sabotase kamu ketahuan di ronde terakhir." },
  ],
  model: "llama3",
  cached: false,
};

describe("GameReviewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when phase is not game_over", () => {
    const { container } = render(<GameReviewPanel sessionId="s1" phase="playing" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows loading state when fetching", () => {
    mockGetReview.mockReturnValue(new Promise(() => {}));

    render(<GameReviewPanel sessionId="s1" phase="game_over" />);
    expect(screen.getByText("Feedback Pemain")).toBeInTheDocument();
    expect(screen.getByText("AI sedang menganalisis...")).toBeInTheDocument();
  });

  it("displays per-player feedback on success", async () => {
    mockGetReview.mockResolvedValue(mockReview);

    render(<GameReviewPanel sessionId="s1" phase="game_over" />);

    await waitFor(() => {
      expect(screen.getByText("Budi")).toBeInTheDocument();
      expect(screen.getByText("Kamu berhasil menemukan impostor.")).toBeInTheDocument();
      expect(screen.getByText("Rani")).toBeInTheDocument();
      expect(screen.getByText("Sabotase kamu ketahuan di ronde terakhir.")).toBeInTheDocument();
    });

    expect(screen.getByText("CIVILIAN")).toBeInTheDocument();
    expect(screen.getByText("IMPOSTOR")).toBeInTheDocument();
    expect(screen.getByText(/llama3/)).toBeInTheDocument();
  });

  it("shows error with retry button in Indonesian", async () => {
    mockGetReview.mockRejectedValue(new Error("Session not found."));

    render(<GameReviewPanel sessionId="s1" phase="game_over" />);

    await waitFor(() => {
      expect(screen.getByText("Session not found.")).toBeInTheDocument();
    });

    expect(screen.getByText("Coba Lagi")).toBeInTheDocument();
  });

  it("retries on retry button click", async () => {
    mockGetReview.mockRejectedValueOnce(new Error("fail"));

    render(<GameReviewPanel sessionId="s1" phase="game_over" />);

    await waitFor(() => {
      expect(screen.getByText("fail")).toBeInTheDocument();
    });

    mockGetReview.mockResolvedValue(mockReview);
    fireEvent.click(screen.getByText("Coba Lagi"));

    await waitFor(() => {
      expect(screen.getByText("Budi")).toBeInTheDocument();
    });
  });
});
