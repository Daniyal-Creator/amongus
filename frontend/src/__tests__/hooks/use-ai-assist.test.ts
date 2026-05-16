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

  it("starts with unused state", () => {
    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));
    expect(result.current.suggestion).toBeNull();
    expect(result.current.poisonResult).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.ghostUsed).toBe(false);
    expect(result.current.poisonUsed).toBe(false);
  });

  it("fetches sabotage suggestion and marks ghost as used", async () => {
    const mockResponse = { suggestion: "Swap <= for <", model: "llama3", remaining: 1 };
    mockSuggest.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.requestSuggestion();
    });

    expect(result.current.suggestion).toEqual(mockResponse);
    expect(result.current.ghostUsed).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("activates copilot poisoning and marks poison as used", async () => {
    const mockResponse = { poisonedHint: "Use i <= n", usedFallback: false, remaining: 0 };
    mockPoison.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.activatePoison();
    });

    expect(result.current.poisonResult).toEqual(mockResponse);
    expect(result.current.poisonUsed).toBe(true);
  });

  it("does not call API again if ghost already used", async () => {
    mockSuggest.mockResolvedValue({ suggestion: "a", model: "llama3", remaining: 1 });

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.requestSuggestion();
    });
    expect(mockSuggest).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.requestSuggestion();
    });
    expect(mockSuggest).toHaveBeenCalledTimes(1);
  });

  it("does not call API again if poison already used", async () => {
    mockPoison.mockResolvedValue({ poisonedHint: "b", usedFallback: false, remaining: 0 });

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.activatePoison();
    });
    expect(mockPoison).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.activatePoison();
    });
    expect(mockPoison).toHaveBeenCalledTimes(1);
  });

  it("handles suggestion error", async () => {
    mockSuggest.mockRejectedValue(new Error("AI rate limit exceeded."));

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.requestSuggestion();
    });

    expect(result.current.suggestion).toBeNull();
    expect(result.current.error).toBe("AI rate limit exceeded.");
    expect(result.current.ghostUsed).toBe(false);
  });

  it("handles poison error", async () => {
    mockPoison.mockRejectedValue(new Error("Imposter only."));

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.activatePoison();
    });

    expect(result.current.poisonResult).toBeNull();
    expect(result.current.error).toBe("Imposter only.");
    expect(result.current.poisonUsed).toBe(false);
  });

  it("tracks ghost and poison used independently", async () => {
    mockSuggest.mockResolvedValue({ suggestion: "a", model: "llama3", remaining: 1 });
    mockPoison.mockResolvedValue({ poisonedHint: "b", usedFallback: false, remaining: 0 });

    const { result } = renderHook(() => useAiAssist("session-1", "player-1"));

    await act(async () => {
      await result.current.requestSuggestion();
    });
    expect(result.current.ghostUsed).toBe(true);
    expect(result.current.poisonUsed).toBe(false);

    await act(async () => {
      await result.current.activatePoison();
    });
    expect(result.current.ghostUsed).toBe(true);
    expect(result.current.poisonUsed).toBe(true);
  });
});
