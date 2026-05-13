import { config } from "../config.js";

export type OllamaError = { code: "unavailable" | "timeout" | "bad_response"; message: string };

/**
 * Minimal Ollama client using fetch. Talks to /api/generate.
 * Returns { ok: true, text } on success, { ok: false, error } otherwise.
 */
export async function ollamaGenerate(
  prompt: string,
  opts: { system?: string; temperature?: number; maxTokens?: number; timeoutMs?: number; model?: string } = {},
): Promise<{ ok: true; text: string } | { ok: false; error: OllamaError }> {
  const url = `${config.ollamaBaseUrl.replace(/\/+$/, "")}/api/generate`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.ollamaApiKey) headers.authorization = `Bearer ${config.ollamaApiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model ?? config.ollamaModel,
        prompt,
        system: opts.system,
        stream: false,
        options: {
          temperature: opts.temperature ?? 0.6,
          num_predict: opts.maxTokens ?? 512,
        },
      }),
    });
    if (!res.ok) {
      return { ok: false, error: { code: "bad_response", message: `HTTP ${res.status}` } };
    }
    const data = (await res.json()) as { response?: string };
    return { ok: true, text: (data.response ?? "").trim() };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, error: { code: "timeout", message: "Ollama request timed out" } };
    }
    return { ok: false, error: { code: "unavailable", message: err?.message ?? "Ollama unreachable" } };
  } finally {
    clearTimeout(timeoutId);
  }
}
