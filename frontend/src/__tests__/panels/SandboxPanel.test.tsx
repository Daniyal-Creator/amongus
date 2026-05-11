import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SandboxPanel } from "@/components/game/panels/SandboxPanel";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  executeSandbox: vi.fn(),
}));

const mockExecute = vi.mocked(api.executeSandbox);

const baseProps = {
  sessionId: "session-1",
  playerId: "player-1",
  phase: "playing" as const,
  description: "Fix the bug in the code.",
  isCivilian: true,
  sabotageCharges: 5,
  onPrimaryAction: vi.fn(),
};

describe("SandboxPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders description and action buttons", () => {
    render(<SandboxPanel {...baseProps} />);
    expect(screen.getByText("Fix the bug in the code.")).toBeInTheDocument();
    expect(screen.getByText("▶ RUN CODE")).toBeInTheDocument();
    expect(screen.getByText("△ EMERGENCY")).toBeInTheDocument();
  });

  it("shows SABOTAGE button for imposters", () => {
    render(<SandboxPanel {...baseProps} isCivilian={false} />);
    expect(screen.getByText("⚠ SABOTAGE")).toBeInTheDocument();
  });

  it("disables buttons when phase is not playing", () => {
    render(<SandboxPanel {...baseProps} phase="meeting" />);
    const runButton = screen.getByText("▶ RUN CODE");
    expect(runButton).toBeDisabled();
  });

  it("calls executeSandbox on RUN CODE click and displays results", async () => {
    mockExecute.mockResolvedValue({
      passed: 1,
      total: 2,
      results: [
        { passed: true, input: "1", expected: "1", actual: "1" },
        { passed: false, input: "2", expected: "2", actual: "3", error: "wrong" },
      ],
    });

    render(<SandboxPanel {...baseProps} />);
    fireEvent.click(screen.getByText("▶ RUN CODE"));

    await waitFor(() => {
      expect(screen.getByText("1/2 PASSED")).toBeInTheDocument();
    });

    expect(screen.getByText("PASS")).toBeInTheDocument();
    expect(screen.getByText("FAIL")).toBeInTheDocument();
  });

  it("shows error message on failure", async () => {
    mockExecute.mockRejectedValue(new Error("Rate limit exceeded."));

    render(<SandboxPanel {...baseProps} />);
    fireEvent.click(screen.getByText("▶ RUN CODE"));

    await waitFor(() => {
      expect(screen.getByText("Rate limit exceeded.")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("calls onPrimaryAction when emergency button clicked", () => {
    render(<SandboxPanel {...baseProps} />);
    fireEvent.click(screen.getByText("△ EMERGENCY"));
    expect(baseProps.onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  it("clears results on Clear click", async () => {
    mockExecute.mockResolvedValue({ passed: 1, total: 1, results: [{ passed: true, input: "", expected: "", actual: "" }] });

    render(<SandboxPanel {...baseProps} />);
    fireEvent.click(screen.getByText("▶ RUN CODE"));

    await waitFor(() => {
      expect(screen.getByText("1/1 PASSED")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Clear"));

    expect(screen.queryByText("1/1 PASSED")).not.toBeInTheDocument();
  });
});
