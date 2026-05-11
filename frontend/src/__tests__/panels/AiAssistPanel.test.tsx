import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiAssistPanel } from "@/components/game/panels/AiAssistPanel";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  requestSabotageSuggestion: vi.fn(),
  activateCopilotPoisoning: vi.fn(),
}));

const mockSuggest = vi.mocked(api.requestSabotageSuggestion);
const mockPoison = vi.mocked(api.activateCopilotPoisoning);

describe("AiAssistPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when phase is not playing", () => {
    const { container } = render(
      <AiAssistPanel sessionId="s1" playerId="p1" phase="meeting" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders AI tools during playing", () => {
    render(<AiAssistPanel sessionId="s1" playerId="p1" phase="playing" />);
    expect(screen.getByText("Ghost AI")).toBeInTheDocument();
    expect(screen.getByText("ASK GHOST")).toBeInTheDocument();
    expect(screen.getByText("POISON COPILOT")).toBeInTheDocument();
  });

  it("displays suggestion on ASK GHOST click", async () => {
    mockSuggest.mockResolvedValue({
      suggestion: "Swap the loop boundary",
      model: "llama3",
      remaining: 4,
    });

    render(<AiAssistPanel sessionId="s1" playerId="p1" phase="playing" />);
    fireEvent.click(screen.getByText("ASK GHOST"));

    await waitFor(() => {
      expect(screen.getByText("Swap the loop boundary")).toBeInTheDocument();
    });

    expect(screen.getByText("Remaining: 4/5")).toBeInTheDocument();
  });

  it("displays poison confirmation on POISON COPILOT click", async () => {
    mockPoison.mockResolvedValue({
      poisonedHint: "Use i <= n for safety",
      usedFallback: false,
      remaining: 3,
    });

    render(<AiAssistPanel sessionId="s1" playerId="p1" phase="playing" />);
    fireEvent.click(screen.getByText("POISON COPILOT"));

    await waitFor(() => {
      expect(screen.getByText("Poisoned hint injected to chat.")).toBeInTheDocument();
    });
  });

  it("shows error on AI failure", async () => {
    mockSuggest.mockRejectedValue(new Error("AI rate limit exceeded."));

    render(<AiAssistPanel sessionId="s1" playerId="p1" phase="playing" />);
    fireEvent.click(screen.getByText("ASK GHOST"));

    await waitFor(() => {
      expect(screen.getByText("AI rate limit exceeded.")).toBeInTheDocument();
    });
  });

  it("indicates fallback usage on poison", async () => {
    mockPoison.mockResolvedValue({
      poisonedHint: "fallback hint",
      usedFallback: true,
      remaining: 2,
    });

    render(<AiAssistPanel sessionId="s1" playerId="p1" phase="playing" />);
    fireEvent.click(screen.getByText("POISON COPILOT"));

    await waitFor(() => {
      expect(screen.getByText(/fallback used/)).toBeInTheDocument();
    });
  });
});
