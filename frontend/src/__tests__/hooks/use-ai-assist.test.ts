import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAiAssist } from "@/hooks/use-ai-assist";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  requestSabotageSuggestion: vi.fn(),
  activateCopilotPoisoning: vi.fn(),
}));

const mockSuggest = vi.mocked(api.requestSabotageSuggestion);
const mockPoison = vi.mocked(api.activateCopilotPoisoning);

describe("useAiAssist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with null state", () => {
    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));
    expect(result.current.suggestion).toBeNull();
    expect(result.current.poisonResult).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.remaining).toBeNull();
  });

  it("fetches sabotage suggestion", async () => {
    const mockResponse = { suggestion: "Swap <= for <", model: "llama3", remaining: 4 };
    mockSuggest.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.requestSuggestion();
    });

    expect(result.current.suggestion).toEqual(mockResponse);
    expect(result.current.remaining).toBe(4);
    expect(result.current.loading).toBe(false);
  });

  it("activates copilot poisoning", async () => {
    const mockResponse = { poisonedHint: "Use i <= n", usedFallback: false, remaining: 3 };
    mockPoison.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.activatePoison();
    });

    expect(result.current.poisonResult).toEqual(mockResponse);
    expect(result.current.remaining).toBe(3);
  });

  it("handles suggestion error", async () => {
    mockSuggest.mockRejectedValue(new Error("AI rate limit exceeded."));

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.requestSuggestion();
    });

    expect(result.current.suggestion).toBeNull();
    expect(result.current.error).toBe("AI rate limit exceeded.");
  });

  it("handles poison error", async () => {
    mockPoison.mockRejectedValue(new Error("Imposter only."));

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.activatePoison();
    });

    expect(result.current.poisonResult).toBeNull();
    expect(result.current.error).toBe("Imposter only.");
  });

  it("tracks remaining across calls", async () => {
    mockSuggest.mockResolvedValue({ suggestion: "a", model: "llama3", remaining: 4 });
    mockPoison.mockResolvedValue({ poisonedHint: "b", usedFallback: false, remaining: 3 });

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.requestSuggestion();
    });
    expect(result.current.remaining).toBe(4);

    await act(async () => {
      await result.current.activatePoison();
    });
    expect(result.current.remaining).toBe(3);
  });
});
