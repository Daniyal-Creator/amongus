"use client";

import { useSecurityScan } from "@/hooks/use-security-scan";
import type { GameSnapshot } from "@/types";

type SecurityPanelProps = {
  sessionId: string;
  playerId: string;
  phase: GameSnapshot["phase"];
  isCivilian: boolean;
};

const BADGE_STYLES: Record<string, string> = {
  verified: "pixel-badge-success",
  needs_review: "pixel-badge-warning",
  vulnerable: "pixel-badge-danger",
};

const BADGE_LABELS: Record<string, string> = {
  verified: "VERIFIED",
  needs_review: "NEEDS REVIEW",
  vulnerable: "VULNERABLE",
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "pixel-badge-info",
  medium: "pixel-badge-warning",
  high: "pixel-badge-danger",
};

export function SecurityPanel({ sessionId, playerId, phase, isCivilian }: SecurityPanelProps) {
  if (!isCivilian || phase !== "playing") return null;

  return <SecurityPanelInner sessionId={sessionId} playerId={playerId} />;
}

function SecurityPanelInner({ sessionId, playerId }: { sessionId: string; playerId: string }) {
  const { report, loading, error, scan } = useSecurityScan(sessionId, playerId);

  return (
    <div className="mt-6">
      <h3 className="text-xl">MedBay Scanner</h3>
      <p className="pixel-small mt-1 text-white/80">Scan code for vulnerabilities</p>

      <button
        type="button"
        onClick={() => void scan()}
        disabled={loading}
        className={`pixel-button pixel-button-success w-full mt-3 text-xs ${loading ? "opacity-60" : ""}`}
      >
        {loading ? "Scanning..." : "SCAN CODE"}
      </button>

      {loading && !report ? (
        <div className="mt-3">
          <div className="pixel-progress pixel-progress-indeterminate">
            <div className="pixel-progress-bar" />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="pixel-panel-result mt-3 px-3 py-2 border-l-4 border-l-[var(--status-error-border)]">
          <p className="pixel-small text-[#9f2c27]">{error}</p>
        </div>
      ) : null}

      {report ? (
        <div className="mt-3 space-y-2">
          <div className="pixel-panel-result px-3 py-2">
            <div className="flex items-center justify-between">
              <span className={`pixel-badge ${BADGE_STYLES[report.badge] ?? ""}`}>
                {BADGE_LABELS[report.badge] ?? report.badge}
              </span>
              <span className="pixel-small text-[#5c4427]">{report.scannedLines} lines</span>
            </div>
          </div>

          {report.issues.length > 0 ? (
            <div className="space-y-1">
              {report.issues.map((issue, idx) => (
                <div key={idx} className="pixel-panel-result px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`pixel-badge ${SEVERITY_STYLES[issue.severity] ?? ""}`}>
                      {issue.severity.toUpperCase()}
                    </span>
                    <span className="pixel-small text-[#5c4427]">L{issue.line}</span>
                  </div>
                  <p className="pixel-small text-[#5c4427]">{issue.message}</p>
                  <code className="pixel-small text-[#9f2c27] block mt-1 bg-[#e8dcc8] px-1">
                    {issue.excerpt}
                  </code>
                </div>
              ))}
            </div>
          ) : (
            <p className="pixel-small text-[#5c4427]">No issues found.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
