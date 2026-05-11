/**
 * Prompt templates for Ollama-driven AI features.
 * Kept separate from transport so they can evolve / be tested in isolation.
 */

export const SABOTAGE_SUGGEST_SYSTEM = [
  "You are GhostAI, an in-game whisper to an impostor in a coding party game.",
  "You suggest exactly ONE subtle bug to inject — something a code reviewer might miss.",
  "Keep the reply under 80 words. Reply in this format:",
  "Idea: <one sentence>",
  "Why subtle: <one sentence>",
  "Where: <function or line hint>",
].join(" ");

export function buildSabotageSuggestPrompt(challengeTitle: string, language: string, source: string) {
  return [
    `Language: ${language}`,
    `Challenge: ${challengeTitle}`,
    "Current code:",
    "```",
    source.slice(0, 4000),
    "```",
    "Whisper a single subtle sabotage idea.",
  ].join("\n");
}

export const COPILOT_POISON_SYSTEM = [
  "You are an AI pair-programmer that has been compromised by the impostor.",
  "Generate ONE plausible-sounding but WRONG code suggestion (max 6 lines).",
  "It must look helpful to a tired civilian but contain a subtle defect",
  "(off-by-one, swapped operator, missing branch, etc).",
  "Reply only with a fenced code block plus a one-line caption beginning with 'Hint:'.",
].join(" ");

export function buildCopilotPoisonPrompt(challengeTitle: string, language: string, source: string) {
  return [
    `Language: ${language}`,
    `Challenge: ${challengeTitle}`,
    "Snippet under review:",
    "```",
    source.slice(0, 4000),
    "```",
    "Produce a poisoned hint.",
  ].join("\n");
}

export const REVIEW_SYSTEM = [
  "You are a senior code reviewer summarizing a multiplayer code-mafia match.",
  "Given the final code, sabotage log, and game result, write a short post-game review:",
  "1. Verdict (1 line).",
  "2. Three concrete refactoring suggestions (bullet list).",
  "3. One paragraph teaching moment about what civilians should have spotted.",
  "Keep under 250 words. Plain text, no markdown headings.",
].join(" ");

export function buildReviewPrompt(input: {
  challengeTitle: string;
  language: string;
  finalCode: string;
  winnerTeam: string;
  reason: string;
  sabotageLog: string[];
}) {
  return [
    `Challenge: ${input.challengeTitle} (${input.language})`,
    `Winner: ${input.winnerTeam}`,
    `Reason: ${input.reason}`,
    "",
    "Sabotage log:",
    input.sabotageLog.length ? input.sabotageLog.map((s) => `- ${s}`).join("\n") : "- none",
    "",
    "Final code:",
    "```",
    input.finalCode.slice(0, 6000),
    "```",
  ].join("\n");
}
