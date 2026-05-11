import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LeaderboardFilters } from "@/components/leaderboard/LeaderboardFilters";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getLeaderboard: vi.fn(),
  getCategoryLeaderboard: vi.fn(),
  getTournamentLeaderboard: vi.fn(),
}));

const mockGetLeaderboard = vi.mocked(api.getLeaderboard);
const mockGetCategory = vi.mocked(api.getCategoryLeaderboard);
const mockGetTournament = vi.mocked(api.getTournamentLeaderboard);

const globalData = {
  leaderboardEntries: [
    { username: "alice", category: "DSA", score: 1500, record: "10W-2L" },
    { username: "bob", category: "OOP", score: 1400, record: "8W-3L" },
  ],
  hallOfFame: [
    { title: "MVP", player: "alice", description: "Best player", tone: "accent" as const },
  ],
};

describe("LeaderboardFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads global leaderboard on mount", async () => {
    mockGetLeaderboard.mockResolvedValue(globalData);

    render(<LeaderboardFilters />);

    await waitFor(() => {
      expect(screen.getByText("#1 alice")).toBeInTheDocument();
    });

    expect(screen.getByText("#2 bob")).toBeInTheDocument();
    expect(screen.getByText("MVP")).toBeInTheDocument();
  });

  it("renders all tab buttons", async () => {
    mockGetLeaderboard.mockResolvedValue(globalData);

    render(<LeaderboardFilters />);

    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "DSA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OOP" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Web Dev" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speedrun" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tournament" })).toBeInTheDocument();
  });

  it("switches to category view on tab click", async () => {
    mockGetLeaderboard.mockResolvedValue(globalData);
    mockGetCategory.mockResolvedValue({
      category: "dsa",
      entries: [{ username: "charlie", category: "DSA", score: 1600, record: "12W-1L" }],
    });

    render(<LeaderboardFilters />);

    await waitFor(() => {
      expect(screen.getByText("#1 alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "DSA" }));

    await waitFor(() => {
      expect(screen.getByText("#1 charlie")).toBeInTheDocument();
    });

    expect(mockGetCategory).toHaveBeenCalledWith("dsa");
  });

  it("switches to tournament view", async () => {
    mockGetLeaderboard.mockResolvedValue(globalData);
    mockGetTournament.mockResolvedValue({
      entries: [{ player_name: "dave", score: 1800, wins: 15, games: 18 }],
    });

    render(<LeaderboardFilters />);

    await waitFor(() => {
      expect(screen.getByText("#1 alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tournament"));

    await waitFor(() => {
      expect(screen.getByText("#1 dave")).toBeInTheDocument();
    });

    expect(screen.getByText("W:15 / Games:18")).toBeInTheDocument();
  });

  it("shows error with retry on failure", async () => {
    mockGetLeaderboard.mockRejectedValue(new Error("Network error"));

    render(<LeaderboardFilters />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows empty state for category with no entries", async () => {
    mockGetLeaderboard.mockResolvedValue(globalData);
    mockGetCategory.mockResolvedValue({ category: "oop", entries: [] });

    render(<LeaderboardFilters />);

    await waitFor(() => {
      expect(screen.getByText("#1 alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "OOP" }));

    await waitFor(() => {
      expect(screen.getByText("No entries for this category.")).toBeInTheDocument();
    });
  });
});
