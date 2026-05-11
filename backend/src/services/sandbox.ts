import { spawn } from "node:child_process";
import { config } from "../config.js";

export type SandboxResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  error?: string;
};

const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  javascript: { language: "javascript", version: "20.11.1" },
  typescript: { language: "typescript", version: "5.0.3" },
  python: { language: "python", version: "3.10.0" },
  go: { language: "go", version: "1.16.2" },
  java: { language: "java", version: "15.0.2" },
};

function resolveLanguage(language: string) {
  const key = language.toLowerCase();
  return LANGUAGE_MAP[key] ?? { language: "python", version: "3.10.0" };
}

/**
 * Local Node.js runner for JavaScript/TypeScript.
 * Pipes the source (with stdin injected as a helper) to `node --input-type=module` via stdin.
 */
function buildJsHarness(source: string, stdin: string): string {
  // Strip ES module exports so Node can eval in CJS/script context
  const normalized = source
    .replace(/^export\s+default\s+/gm, "")
    .replace(/^export\s+(function|class|const|let|var)\s+/gm, "$1 ");

  // Extract the first top-level function name to auto-call it with parsed stdin
  const fnMatch = normalized.match(/function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
  const mainFn = fnMatch?.[1];

  const callSection = mainFn
    ? [
        `// auto-invoke ${mainFn} with stdin as JSON args`,
        `try {`,
        `  const _args = ${JSON.stringify(stdin)} ? JSON.parse('[' + ${JSON.stringify(stdin)} + ']') : [];`,
        `  const _result = typeof ${mainFn} === 'function'`,
        `    ? (Array.isArray(_args[0]) ? ${mainFn}(_args[0]) : ${mainFn}(..._args))`,
        `    : undefined;`,
        `  if (_result !== undefined) console.log(_result);`,
        `} catch(_e) { /* stdin not JSON-parseable — user code may call input() directly */ }`,
      ].join("\n")
    : "";

  return [
    `const _stdin = ${JSON.stringify(stdin)};`,
    `const _lines = _stdin.split("\\n").filter(Boolean);`,
    `let _lineIdx = 0;`,
    `const input = () => _lines[_lineIdx++] ?? "";`,
    normalized,
    callSection,
  ].join("\n");
}

function runJavaScriptLocally(source: string, stdin: string, timeoutMs: number): Promise<SandboxResult> {
  const start = Date.now();
  const harness = buildJsHarness(source, stdin);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn("node", ["--input-type=module"]);

    child.stdin.end(harness, "utf8");
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => { child.kill("SIGTERM"); }, timeoutMs);

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const killed = signal === "SIGTERM";
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        exitCode: code ?? null,
        durationMs: Date.now() - start,
        error: killed ? "execution timeout" : (code !== 0 ? stderr.slice(0, 200) : undefined),
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false, stdout: "", stderr: err.message,
        exitCode: null, durationMs: Date.now() - start, error: err.message,
      });
    });
  });
}

/**
 * Run code via Piston external sandbox (configurable via PISTON_BASE_URL).
 */
async function runViaPiston(
  language: string,
  source: string,
  stdin: string,
  timeoutMs: number,
): Promise<SandboxResult> {
  const { language: lang, version } = resolveLanguage(language);
  const url = `${config.pistonBaseUrl.replace(/\/+$/, "")}/execute`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        language: lang,
        version,
        files: [{ name: "main", content: source }],
        stdin,
        compile_timeout: 10_000,
        run_timeout: 6_000,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        stdout: "",
        stderr: body.slice(0, 300),
        exitCode: null,
        durationMs: Date.now() - start,
        error: `Sandbox HTTP ${res.status}: ${body.slice(0, 120)}`,
      };
    }

    const data = (await res.json()) as {
      run?: { stdout: string; stderr: string; code: number };
      compile?: { stderr: string; code: number };
      message?: string;
    };

    const run = data.run;
    const compileErr = data.compile?.stderr ?? "";
    if (!run) {
      return {
        ok: false,
        stdout: "",
        stderr: compileErr || (data.message ?? "no run output"),
        exitCode: null,
        durationMs: Date.now() - start,
        error: data.message ?? "sandbox returned no run section",
      };
    }
    return {
      ok: run.code === 0 && !compileErr,
      stdout: run.stdout ?? "",
      stderr: (compileErr ? compileErr + "\n" : "") + (run.stderr ?? ""),
      exitCode: run.code ?? null,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: Date.now() - start,
      error: err?.name === "AbortError" ? "sandbox timeout" : err?.message ?? "sandbox error",
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Local Python runner via `python3` subprocess.
 */
function runPythonLocally(source: string, stdin: string, timeoutMs: number): Promise<SandboxResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    // Inject stdin via sys.stdin simulation harness
    const harness = [
      "import sys as _sys",
      `_stdin_lines = ${JSON.stringify(stdin.split("\n").filter(Boolean))}`,
      `_idx = [0]`,
      `def input(prompt=''):`,
      `    v = _stdin_lines[_idx[0]] if _idx[0] < len(_stdin_lines) else ''`,
      `    _idx[0] += 1`,
      `    return v`,
      `_sys.stdin = type('_F', (), {'readline': lambda self: input() + '\\n', 'read': lambda self: '\\n'.join(_stdin_lines)})()`,
      source,
    ].join("\n");

    const child = spawn("python3", ["-c", harness]);
    if (stdin) child.stdin.end(stdin, "utf8");

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => { child.kill("SIGTERM"); }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const killed = signal === "SIGTERM";
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        exitCode: code ?? null,
        durationMs: Date.now() - start,
        error: killed ? "execution timeout" : (code !== 0 ? stderr.slice(0, 200) : undefined),
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: "", stderr: err.message, exitCode: null, durationMs: Date.now() - start, error: err.message });
    });
  });
}

/**
 * Run code: tries Piston first; falls back to local runner (Node.js for JS/TS, Python3 for Python).
 */
export async function runCode(
  language: string,
  source: string,
  stdin = "",
  timeoutMs = 8_000,
): Promise<SandboxResult> {
  const result = await runViaPiston(language, source, stdin, timeoutMs);
  if (!result.ok && result.error) {
    const lang = language.toLowerCase();
    if (/javascript|typescript/.test(lang)) {
      const local = await runJavaScriptLocally(source, stdin, Math.min(timeoutMs, 5_000));
      if (local.exitCode === 0 || local.stdout) return local;
    } else if (/python/.test(lang)) {
      const local = await runPythonLocally(source, stdin, Math.min(timeoutMs, 5_000));
      if (local.exitCode === 0 || local.stdout) return local;
    }
  }
  return result;
}

/**
 * Run a full test suite. Each test has `input` (stdin) and `expected` stdout.
 */
export async function runTests(
  language: string,
  source: string,
  tests: Array<{ input: string; expected: string }>,
): Promise<Array<{ passed: boolean; input: string; expected: string; actual: string; error?: string }>> {
  const out: Array<{ passed: boolean; input: string; expected: string; actual: string; error?: string }> = [];
  for (const test of tests) {
    const r = await runCode(language, source, test.input);
    const actual = (r.stdout ?? "").trim();
    const expected = (test.expected ?? "").trim();
    out.push({
      passed: r.ok && actual === expected,
      input: test.input,
      expected,
      actual,
      error: r.error ?? (r.stderr ? r.stderr.slice(0, 400) : undefined),
    });
  }
  return out;
}
