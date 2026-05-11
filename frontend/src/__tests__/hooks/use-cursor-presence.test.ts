import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCursorPresence } from "@/hooks/use-cursor-presence";
import type { CursorPresence } from "@/types";

describe("useCursorPresence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const cursors: CursorPresence[] = [
    { playerId: "p1", name: "Alice", color: "#ff0000", anchor: 0, head: 5 },
    { playerId: "p2", name: "Bob", color: "#00ff00", anchor: 10, head: 15 },
    { playerId: "p3", name: "Charlie", color: "#0000ff", anchor: 20, head: 25 },
  ];

  it("filters out current player from remote cursors", () => {
    const { result } = renderHook(() => useCursorPresence(null, cursors, "p2"));

    expect(result.current.remoteCursors).toHaveLength(2);
    expect(result.current.remoteCursors.map((c) => c.playerId)).toEqual(["p1", "p3"]);
  });

  it("returns all cursors when current player not in list", () => {
    const { result } = renderHook(() => useCursorPresence(null, cursors, "p99"));

    expect(result.current.remoteCursors).toHaveLength(3);
  });

  it("returns empty array when no cursors", () => {
    const { result } = renderHook(() => useCursorPresence(null, [], "p1"));

    expect(result.current.remoteCursors).toEqual([]);
  });

  it("sends cursor position through connection with debounce", () => {
    const mockSend = vi.fn();
    const connection = { send: mockSend };

    const { result } = renderHook(() => useCursorPresence(connection, [], "p1"));

    act(() => {
      result.current.sendCursorPosition(10, 15);
    });

    expect(mockSend).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(mockSend).toHaveBeenCalledWith({ type: "editor.cursor", anchor: 10, head: 15 });
  });

  it("does not send if connection is null", () => {
    const { result } = renderHook(() => useCursorPresence(null, [], "p1"));

    act(() => {
      result.current.sendCursorPosition(10, 15);
      vi.advanceTimersByTime(100);
    });

    // No error thrown, just silently skips
  });

  it("debounces rapid cursor movements", () => {
    const mockSend = vi.fn();
    const connection = { send: mockSend };

    const { result } = renderHook(() => useCursorPresence(connection, [], "p1"));

    act(() => {
      result.current.sendCursorPosition(1, 1);
      result.current.sendCursorPosition(2, 2);
      result.current.sendCursorPosition(3, 3);
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({ type: "editor.cursor", anchor: 3, head: 3 });
  });
});
