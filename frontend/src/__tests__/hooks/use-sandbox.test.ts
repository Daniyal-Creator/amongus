import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSandbox } from "@/hooks/use-sandbox";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  executeSandbox: vi.fn(),
}));

const mockExecute = vi.mocked(api.executeSandbox);

describe("useSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with null results and no error", () => {
    const { result } = renderHook(() => useSandbox("session-1", "player-1"));
    expect(result.current.results).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets loading while executing and returns results on success", async () => {
    const mockResponse = {
      mode: "civilian" as const,
      passed: 2,
      total: 3,
      results: [
        { passed: true, input: "1", expected: "1", actual: "1" },
        { passed: true, input: "2", expected: "2", actual: "2" },
        { passed: false, input: "3", expected: "3", actual: "4", error: "mismatch" },
      ],
    };
    mockExecute.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSandbox("session-1", "player-1"));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.results).toEqual(mockResponse);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockExecute).toHaveBeenCalledWith("session-1", "player-1", undefined);
  });

  it("passes stdin to executeSandbox", async () => {
    mockExecute.mockResolvedValue({ mode: "civilian" as const, passed: 0, total: 0, results: [] });

    const { result } = renderHook(() => useSandbox("session-1", "player-1"));

    await act(async () => {
      await result.current.execute("hello world");
    });

    expect(mockExecute).toHaveBeenCalledWith("session-1", "player-1", "hello world");
  });

  it("sets error on failure", async () => {
    mockExecute.mockRejectedValue(new Error("Execution rate limit exceeded."));

    const { result } = renderHook(() => useSandbox("session-1", "player-1"));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.results).toBeNull();
    expect(result.current.error).toBe("Execution rate limit exceeded.");
    expect(result.current.loading).toBe(false);
  });

  it("resets results and error", async () => {
    mockExecute.mockResolvedValue({ mode: "civilian" as const, passed: 1, total: 1, results: [] });

    const { result } = renderHook(() => useSandbox("session-1", "player-1"));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.results).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.results).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("stores imposter validation response when mode is imposter", async () => {
    const mockResponse = {
      mode: "imposter" as const,
      completed: 1,
      total: 5,
      charges: 4,
      tasks: [
        { index: 0, title: "Reverse increment direction", lineHint: 7, done: true },
        { index: 1, title: "Komentari history append", lineHint: 8, done: false, hint: "Tambahkan #" },
      ],
    };
    mockExecute.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSandbox("session-1", "player-1"));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.results).toEqual(mockResponse);
  });
});
