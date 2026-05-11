/**
 * Lightweight static-analysis "Security Scanner" task.
 * Looks for common vulnerability patterns in submitted code; awards a
 * "Verified Developer" badge when no high-severity issues are found.
 *
 * This is intentionally heuristic — it is the in-game MedBay equivalent,
 * not a production-grade SAST. Patterns are language-agnostic where
 * possible, with extra rules per language.
 */

export type ScannerIssue = {
  rule: string;
  severity: "low" | "medium" | "high";
  line: number;
  excerpt: string;
  message: string;
};

export type ScannerReport = {
  passed: boolean;
  badge: "verified" | "needs_review" | "vulnerable";
  issues: ScannerIssue[];
  scannedLines: number;
};

type Rule = {
  name: string;
  severity: "low" | "medium" | "high";
  message: string;
  pattern: RegExp;
  appliesTo?: (language: string) => boolean;
};

const RULES: Rule[] = [
  {
    name: "eval-usage",
    severity: "high",
    message: "eval() executes arbitrary code — never feed it untrusted input.",
    pattern: /\beval\s*\(/,
  },
  {
    name: "child-process-shell",
    severity: "high",
    message: "Shell execution with string concatenation is vulnerable to command injection.",
    pattern: /\b(exec|execSync|spawnSync|system|popen)\s*\(\s*[`"'].*\$\{?/,
  },
  {
    name: "sql-string-concat",
    severity: "high",
    message: "SQL built via string concatenation is vulnerable to injection. Use parameterized queries.",
    pattern: /(SELECT|INSERT|UPDATE|DELETE)[\s\S]*?(\+|\$\{|\.\.|%s)/i,
  },
  {
    name: "hardcoded-secret",
    severity: "high",
    message: "Hardcoded secret detected — load from env or a secret manager.",
    pattern: /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}["']/i,
  },
  {
    name: "weak-hash",
    severity: "medium",
    message: "MD5/SHA1 are weak — use SHA-256 or bcrypt/argon2 for passwords.",
    pattern: /\b(md5|sha1)\s*\(/i,
  },
  {
    name: "insecure-random",
    severity: "medium",
    message: "Math.random() is not cryptographically secure. Use crypto.randomBytes/randomInt.",
    pattern: /Math\.random\s*\(/,
  },
  {
    name: "todo-fixme",
    severity: "low",
    message: "TODO/FIXME left in code — ship-blocker review.",
    pattern: /\b(TODO|FIXME|XXX)\b/,
  },
  {
    name: "dangerous-deserialization",
    severity: "high",
    message: "Untrusted deserialization (pickle.loads, yaml.load) — switch to safe_load.",
    pattern: /\b(pickle\.loads|yaml\.load)\s*\(/,
  },
  {
    name: "missing-input-validation",
    severity: "low",
    message: "Direct use of request body/query without validation.",
    pattern: /\b(req|request)\.(body|query|params)\.[a-zA-Z_]+/,
    appliesTo: (lang) => /javascript|typescript/i.test(lang),
  },
];

export function scanForVulnerabilities(source: string, language = "javascript"): ScannerReport {
  const lines = source.split("\n");
  const issues: ScannerIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      if (rule.appliesTo && !rule.appliesTo(language)) continue;
      if (rule.pattern.test(line)) {
        issues.push({
          rule: rule.name,
          severity: rule.severity,
          line: i + 1,
          excerpt: line.trim().slice(0, 160),
          message: rule.message,
        });
      }
    }
  }

  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;

  let badge: ScannerReport["badge"];
  if (highCount > 0) badge = "vulnerable";
  else if (mediumCount > 0) badge = "needs_review";
  else badge = "verified";

  return {
    passed: highCount === 0,
    badge,
    issues,
    scannedLines: lines.length,
  };
}
