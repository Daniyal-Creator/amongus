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

export type ChallengeTest = {
  name?: string;
  setup?: string;
  expression?: string;
  expected: unknown;
  input?: string;
};

export type TestRunResult = {
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  error?: string;
};

const RESULT_MARKER = "__SANDBOX_RESULT__";
const ERROR_MARKER = "__SANDBOX_ERROR__";

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

/* ────────────── JavaScript harness with browser stubs ────────────── */

const JS_RUNTIME_STUBS = `
const __sandboxState = {
  storage: Object.create(null),
  bodyClasses: new Set(),
  elements: Object.create(null),
  listeners: [],
  fetchMock: null,
  consoleLog: [],
};

function __makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add(c) { set.add(String(c)); },
    remove(c) { set.delete(String(c)); },
    toggle(c, force) {
      c = String(c);
      if (force === true) { set.add(c); return true; }
      if (force === false) { set.delete(c); return false; }
      if (set.has(c)) { set.delete(c); return false; }
      set.add(c); return true;
    },
    contains(c) { return set.has(String(c)); },
  };
}

function __makeElement(id) {
  const el = {
    id: id ?? "",
    value: "",
    textContent: "",
    innerHTML: "",
    dataset: Object.create(null),
    classList: __makeClassList(),
    children: [],
    parentElement: null,
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      return child;
    },
    addEventListener(ev, fn) { __sandboxState.listeners.push({ el: this, ev, fn }); },
    removeEventListener() {},
    setAttribute(k, v) { this[k] = String(v); },
    getAttribute(k) { return this[k] ?? null; },
    closest(sel) {
      const match = (node, s) => {
        if (!node) return null;
        if (s.startsWith(".")) {
          return node.classList && node.classList.contains(s.slice(1)) ? node : match(node.parentElement, s);
        }
        if (s.startsWith("#")) {
          return node.id === s.slice(1) ? node : match(node.parentElement, s);
        }
        return null;
      };
      return match(this, sel);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
    blur() {},
    click() {
      const target = this;
      for (const l of __sandboxState.listeners) {
        if (l.el === target && l.ev === "click") l.fn({ target, preventDefault() {}, stopPropagation() {} });
      }
    },
  };
  return el;
}

const localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(__sandboxState.storage, k) ? __sandboxState.storage[k] : null; },
  setItem(k, v) { __sandboxState.storage[String(k)] = String(v); },
  removeItem(k) { delete __sandboxState.storage[String(k)]; },
  clear() { __sandboxState.storage = Object.create(null); },
  key(i) { return Object.keys(__sandboxState.storage)[i] ?? null; },
  get length() { return Object.keys(__sandboxState.storage).length; },
};

const sessionStorage = {
  _data: Object.create(null),
  getItem(k) { return this._data[k] ?? null; },
  setItem(k, v) { this._data[String(k)] = String(v); },
  removeItem(k) { delete this._data[String(k)]; },
  clear() { this._data = Object.create(null); },
};

const document = {
  body: {
    classList: (() => {
      const cl = __makeClassList();
      cl._set = __sandboxState.bodyClasses;
      cl.add = (c) => __sandboxState.bodyClasses.add(String(c));
      cl.remove = (c) => __sandboxState.bodyClasses.delete(String(c));
      cl.toggle = (c, force) => {
        c = String(c);
        if (force === true) { __sandboxState.bodyClasses.add(c); return true; }
        if (force === false) { __sandboxState.bodyClasses.delete(c); return false; }
        if (__sandboxState.bodyClasses.has(c)) { __sandboxState.bodyClasses.delete(c); return false; }
        __sandboxState.bodyClasses.add(c); return true;
      };
      cl.contains = (c) => __sandboxState.bodyClasses.has(String(c));
      return cl;
    })(),
    appendChild(child) { return child; },
    addEventListener(ev, fn) { __sandboxState.listeners.push({ el: this, ev, fn }); },
  },
  getElementById(id) {
    if (!__sandboxState.elements[id]) __sandboxState.elements[id] = __makeElement(id);
    return __sandboxState.elements[id];
  },
  createElement(tag) {
    const el = __makeElement("");
    el.tagName = String(tag).toUpperCase();
    return el;
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener(ev, fn) { __sandboxState.listeners.push({ el: this, ev, fn }); },
  removeEventListener() {},
};

const window = { document, localStorage, sessionStorage, addEventListener() {}, removeEventListener() {} };

const fetch = async (url, opts) => {
  if (typeof __sandboxState.fetchMock === "function") return __sandboxState.fetchMock(url, opts);
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get() { return null; } },
    json: async () => [],
    text: async () => "",
  };
};

function __setFetchMock(fn) { __sandboxState.fetchMock = fn; }
function __dispatchEvent(el, type, eventInit) {
  const event = Object.assign({ type, target: el, preventDefault() {}, stopPropagation() {} }, eventInit ?? {});
  for (const l of __sandboxState.listeners) {
    if (l.el === el && l.ev === type) l.fn(event);
  }
}
`;

function buildJsHarness(source: string, setup: string, expression: string): string {
  const normalized = source
    .replace(/^export\s+default\s+/gm, "")
    .replace(/^export\s+(function|class|const|let|var)\s+/gm, "$1 ")
    .replace(/^import\s+.*$/gm, "");

  return [
    JS_RUNTIME_STUBS,
    normalized,
    "(async () => {",
    "  try {",
    setup ? `    ${setup.replace(/\n/g, "\n    ")}` : "",
    `    const __result = await Promise.resolve((async () => (${expression}))());`,
    `    const __json = JSON.stringify(__result, (k, v) => {`,
    `      if (v instanceof Set) return Array.from(v);`,
    `      if (v instanceof Map) return Object.fromEntries(v);`,
    `      return v;`,
    `    });`,
    `    process.stdout.write(${JSON.stringify(RESULT_MARKER)} + (__json ?? "null") + "\\n");`,
    "  } catch (__err) {",
    `    process.stdout.write(${JSON.stringify(ERROR_MARKER)} + (__err && __err.message ? __err.message : String(__err)) + "\\n");`,
    "  }",
    "})();",
  ].filter(Boolean).join("\n");
}

function runJsHarness(harness: string, timeoutMs: number): Promise<SandboxResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn("node", ["--input-type=module"], { stdio: ["pipe", "pipe", "pipe"] });

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
        error: killed ? "execution timeout" : undefined,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: "", stderr: err.message, exitCode: null, durationMs: Date.now() - start, error: err.message });
    });
  });
}

/* ────────────── Python harness ────────────── */

const PYTHON_RUNTIME_STUBS = `
import json as __json
import sys as __sys

class __SandboxClassList:
    def __init__(self):
        self._set = set()
    def add(self, c): self._set.add(str(c))
    def remove(self, c): self._set.discard(str(c))
    def toggle(self, c, force=None):
        c = str(c)
        if force is True:
            self._set.add(c); return True
        if force is False:
            self._set.discard(c); return False
        if c in self._set:
            self._set.discard(c); return False
        self._set.add(c); return True
    def contains(self, c): return str(c) in self._set
`;

function buildPythonHarness(source: string, setup: string, expression: string): string {
  return [
    PYTHON_RUNTIME_STUBS,
    source,
    "",
    "try:",
    ...(setup ? setup.split("\n").map((l) => "    " + l) : ["    pass"]),
    `    __result = (${expression})`,
    `    print(${JSON.stringify(RESULT_MARKER)} + __json.dumps(__result, default=str))`,
    "except Exception as __err:",
    `    print(${JSON.stringify(ERROR_MARKER)} + str(__err))`,
  ].join("\n");
}

function runPythonLocally(harness: string, timeoutMs: number): Promise<SandboxResult> {
  const start = Date.now();
  const cmd = process.platform === "win32" ? "python" : "python3";
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawn(cmd, ["-c", harness], { stdio: ["pipe", "pipe", "pipe"] });
    } catch (err: any) {
      resolve({ ok: false, stdout: "", stderr: err?.message ?? "spawn failed", exitCode: null, durationMs: Date.now() - start, error: err?.message ?? "python not available" });
      return;
    }

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
        error: killed ? "execution timeout" : undefined,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: "", stderr: err.message, exitCode: null, durationMs: Date.now() - start, error: err.message });
    });
  });
}

async function runHarnessViaPiston(
  language: "javascript" | "python",
  harness: string,
  timeoutMs: number,
): Promise<SandboxResult> {
  const { language: lang, version } = resolveLanguage(language);
  const url = `${config.pistonBaseUrl.replace(/\/+$/, "")}/execute`;
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        language: lang,
        version,
        files: [{ name: language === "python" ? "main.py" : "main.js", content: harness }],
        stdin: "",
        compile_timeout: 10_000,
        run_timeout: Math.max(2_000, timeoutMs),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, stdout: "", stderr: body.slice(0, 300), exitCode: null, durationMs: Date.now() - start, error: `Piston HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      run?: { stdout: string; stderr: string; code: number };
      compile?: { stderr: string; code: number };
      message?: string;
    };

    const run = data.run;
    const compileErr = data.compile?.stderr ?? "";
    if (!run) {
      return { ok: false, stdout: "", stderr: compileErr || (data.message ?? ""), exitCode: null, durationMs: Date.now() - start, error: data.message ?? "no run output" };
    }
    return {
      ok: run.code === 0 && !compileErr,
      stdout: run.stdout ?? "",
      stderr: (compileErr ? compileErr + "\n" : "") + (run.stderr ?? ""),
      exitCode: run.code ?? null,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return { ok: false, stdout: "", stderr: "", exitCode: null, durationMs: Date.now() - start, error: err?.name === "AbortError" ? "piston timeout" : err?.message ?? "piston error" };
  } finally {
    clearTimeout(abortTimer);
  }
}

function hasSandboxMarker(stdout: string): boolean {
  return stdout.includes(RESULT_MARKER) || stdout.includes(ERROR_MARKER);
}

const PYTHON_SETUP_HINT =
  "Python tidak tersedia. Install Python 3 (https://www.python.org) atau jalankan Piston Docker: " +
  "`docker run -d -p 2000:2000 ghcr.io/engineer-man/piston` lalu set PISTON_BASE_URL=http://localhost:2000/api/v2";

async function runPythonHarness(harness: string, timeoutMs: number): Promise<SandboxResult> {
  const local = await runPythonLocally(harness, timeoutMs);
  if (hasSandboxMarker(local.stdout)) return local;
  const remote = await runHarnessViaPiston("python", harness, timeoutMs);
  if (hasSandboxMarker(remote.stdout)) return remote;
  const winner = local.error ? local : remote;
  return { ...winner, error: `${winner.error ?? "no marker output"} — ${PYTHON_SETUP_HINT}` };
}

async function runJsHarnessWithFallback(harness: string, timeoutMs: number): Promise<SandboxResult> {
  const local = await runJsHarness(harness, timeoutMs);
  if (hasSandboxMarker(local.stdout)) return local;
  const remote = await runHarnessViaPiston("javascript", harness, timeoutMs);
  if (hasSandboxMarker(remote.stdout)) return remote;
  return local.error ? local : remote;
}

/* ────────────── Piston fallback (used only for legacy stdin/stdout cases) ────────────── */

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

/* ────────────── Public API ────────────── */

export async function runCode(
  language: string,
  source: string,
  stdin = "",
  timeoutMs = 8_000,
): Promise<SandboxResult> {
  return runViaPiston(language, source, stdin, timeoutMs);
}

function parseSandboxStdout(stdout: string): { result?: string; error?: string } {
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith(RESULT_MARKER)) return { result: line.slice(RESULT_MARKER.length) };
    if (line.startsWith(ERROR_MARKER)) return { error: line.slice(ERROR_MARKER.length) };
  }
  return {};
}

function canonicalize(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch {
      return JSON.stringify(trimmed);
    }
  }
  return JSON.stringify(value);
}

async function runSingleTest(
  language: string,
  source: string,
  test: ChallengeTest,
  timeoutMs: number,
): Promise<TestRunResult> {
  const lang = language.toLowerCase();
  const expression = test.expression ?? "";
  const setup = test.setup ?? "";
  const expectedDisplay = typeof test.expected === "string"
    ? test.expected
    : JSON.stringify(test.expected);
  const inputDisplay = test.name
    ? test.name
    : (setup ? `${setup.replace(/\n/g, "; ")} → ${expression}` : expression);

  if (!expression) {
    return {
      passed: false,
      input: inputDisplay,
      expected: expectedDisplay,
      actual: "",
      error: "Test has no expression to evaluate.",
    };
  }

  let raw: SandboxResult;
  if (/javascript|typescript/.test(lang)) {
    raw = await runJsHarnessWithFallback(buildJsHarness(source, setup, expression), timeoutMs);
  } else if (/python/.test(lang)) {
    raw = await runPythonHarness(buildPythonHarness(source, setup, expression), timeoutMs);
  } else {
    return {
      passed: false,
      input: inputDisplay,
      expected: expectedDisplay,
      actual: "",
      error: `Language "${language}" is not supported by the expression test runner.`,
    };
  }

  const parsed = parseSandboxStdout(raw.stdout);

  if (parsed.error !== undefined) {
    return {
      passed: false,
      input: inputDisplay,
      expected: expectedDisplay,
      actual: "",
      error: parsed.error.slice(0, 400),
    };
  }

  if (parsed.result === undefined) {
    return {
      passed: false,
      input: inputDisplay,
      expected: expectedDisplay,
      actual: "",
      error: raw.error ?? raw.stderr.slice(0, 400) ?? "No output captured from sandbox.",
    };
  }

  const expectedCanonical = canonicalize(test.expected);
  const actualCanonical = (() => {
    try {
      return JSON.stringify(JSON.parse(parsed.result));
    } catch {
      return parsed.result;
    }
  })();

  const actualDisplay = (() => {
    try {
      const v = JSON.parse(parsed.result);
      return typeof v === "string" ? v : JSON.stringify(v);
    } catch {
      return parsed.result;
    }
  })();

  return {
    passed: actualCanonical === expectedCanonical,
    input: inputDisplay,
    expected: expectedDisplay,
    actual: actualDisplay,
  };
}

export async function runChallengeTests(
  language: string,
  source: string,
  tests: ChallengeTest[],
  timeoutMs = 5_000,
): Promise<TestRunResult[]> {
  const out: TestRunResult[] = [];
  for (const test of tests) {
    out.push(await runSingleTest(language, source, test, timeoutMs));
  }
  return out;
}

/* ────────────── Legacy stdin/stdout test runner (kept for any old data) ────────────── */

export async function runTests(
  language: string,
  source: string,
  tests: Array<{ input: string; expected: string }>,
): Promise<TestRunResult[]> {
  const out: TestRunResult[] = [];
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
