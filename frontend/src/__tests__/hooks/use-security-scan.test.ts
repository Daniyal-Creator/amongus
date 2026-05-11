import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSecurityScan } from "@/hooks/use-security-scan";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  runSecurityScan: vi.fn(),
}));

const mockScan = vi.mocked(api.runSecurityScan);

describe("useSecurityScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with null report", () => {
    const { result } = renderHook(() => useSecurityScan("session-1", "player-1"));
    expect(result.current.report).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns scan report on success", async () => {
    const mockReport = {
      passed: true,
      badge: "verified" as const,
      issues: [],
      scannedLines: 17,
    };
    mockScan.mockResolvedValue(mockReport);

    const { result } = renderHook(() => useSecurityScan("session-1", "player-1"));

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.report).toEqual(mockReport);
    expect(result.current.loading).toBe(false);
  });

  it("returns report with issues", async () => {
    const mockReport = {
      passed: false,
      badge: "vulnerable" as const,
      issues: [
        { rule: "no-eval", severity: "high" as const, line: 5, excerpt: "eval(input)", message: "eval() detected" },
      ],
      scannedLines: 20,
    };
    mockScan.mockResolvedValue(mockReport);

    const { result } = renderHook(() => useSecurityScan("session-1", "player-1"));

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.report?.badge).toBe("vulnerable");
    expect(result.current.report?.issues).toHaveLength(1);
  });

  it("sets error on failure", async () => {
    mockScan.mockRejectedValue(new Error("Ejected players cannot scan."));

    const { result } = renderHook(() => useSecurityScan("session-1", "player-1"));

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.report).toBeNull();
    expect(result.current.error).toBe("Ejected players cannot scan.");
  });
});
