import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SecurityPanel } from "@/components/game/panels/SecurityPanel";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  runSecurityScan: vi.fn(),
}));

const mockScan = vi.mocked(api.runSecurityScan);

describe("SecurityPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing for imposters", () => {
    const { container } = render(
      <SecurityPanel sessionId="s1" playerId="p1" phase="playing" isCivilian={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when phase is not playing", () => {
    const { container } = render(
      <SecurityPanel sessionId="s1" playerId="p1" phase="meeting" isCivilian={true} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders scan button for civilians during playing", () => {
    render(<SecurityPanel sessionId="s1" playerId="p1" phase="playing" isCivilian={true} />);
    expect(screen.getByText("MedBay Scanner")).toBeInTheDocument();
    expect(screen.getByText("SCAN CODE")).toBeInTheDocument();
  });

  it("shows verified badge on clean scan", async () => {
    mockScan.mockResolvedValue({
      passed: true,
      badge: "verified",
      issues: [],
      scannedLines: 17,
    });

    render(<SecurityPanel sessionId="s1" playerId="p1" phase="playing" isCivilian={true} />);
    fireEvent.click(screen.getByText("SCAN CODE"));

    await waitFor(() => {
      expect(screen.getByText("VERIFIED")).toBeInTheDocument();
    });

    expect(screen.getByText("17 lines")).toBeInTheDocument();
    expect(screen.getByText("No issues found.")).toBeInTheDocument();
  });

  it("shows vulnerable badge with issues", async () => {
    mockScan.mockResolvedValue({
      passed: false,
      badge: "vulnerable",
      issues: [
        { rule: "no-eval", severity: "high", line: 5, excerpt: "eval(x)", message: "eval() detected" },
      ],
      scannedLines: 20,
    });

    render(<SecurityPanel sessionId="s1" playerId="p1" phase="playing" isCivilian={true} />);
    fireEvent.click(screen.getByText("SCAN CODE"));

    await waitFor(() => {
      expect(screen.getByText("VULNERABLE")).toBeInTheDocument();
    });

    expect(screen.getByText("HIGH")).toBeInTheDocument();
    expect(screen.getByText("eval() detected")).toBeInTheDocument();
  });

  it("shows error on scan failure", async () => {
    mockScan.mockRejectedValue(new Error("Ejected players cannot scan."));

    render(<SecurityPanel sessionId="s1" playerId="p1" phase="playing" isCivilian={true} />);
    fireEvent.click(screen.getByText("SCAN CODE"));

    await waitFor(() => {
      expect(screen.getByText("Ejected players cannot scan.")).toBeInTheDocument();
    });
  });
});
