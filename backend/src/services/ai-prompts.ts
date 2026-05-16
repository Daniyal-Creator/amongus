/**
 * Prompt templates for Ollama-driven AI features.
 * Kept separate from transport so they can evolve / be tested in isolation.
 */

export const SABOTAGE_SUGGEST_SYSTEM = [
  "You are GhostAI, a secret whisper to an impostor in a coding party game.",
  "Reply with ONLY a single short hint (max 15 words) telling the impostor what subtle bug to inject.",
  "Examples of good replies:",
  "- Ganti operator + menjadi - di fungsi increment",
  "- Ubah kondisi < menjadi <= pada loop utama",
  "- Hapus return statement di branch else",
  "- Tukar parameter a dan b di fungsi swap",
  "Do NOT add explanations, labels, or formatting. Just the hint.",
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
  "Kamu adalah juri pertandingan coding game.",
  "Tugas: beri feedback singkat per pemain dalam Bahasa Indonesia.",
  "Output HARUS berupa JSON array valid seperti ini:",
  '[{"name":"NamaPemain","role":"civilian","feedback":"1 kalimat feedback spesifik untuk pemain ini."}]',
  "Aturan: feedback maks 1 kalimat per pemain, jujur dan langsung ke poin, tidak ada basa-basi.",
  "Jangan tambahkan teks apapun di luar JSON. Hanya JSON array.",
].join(" ");

export function buildReviewPrompt(input: {
  challengeTitle: string;
  language: string;
  winnerTeam: string;
  reason: string;
  sabotageLog: string[];
  players: { name: string; role: string }[];
}) {
  return [
    `Challenge: ${input.challengeTitle} (${input.language})`,
    `Pemenang: ${input.winnerTeam === "civilian" ? "Tim Civilian" : "Tim Imposter"}`,
    `Alasan: ${input.reason}`,
    "",
    "Log sabotase:",
    input.sabotageLog.length ? input.sabotageLog.map((s) => `- ${s}`).join("\n") : "- tidak ada",
    "",
    "Daftar pemain:",
    input.players.map((p) => `- ${p.name} (${p.role})`).join("\n"),
    "",
    "Beri feedback 1 kalimat per pemain dalam JSON array.",
  ].join("\n");
}
