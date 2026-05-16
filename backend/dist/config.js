const DEFAULT_PORT = 4000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/amongus_coder";
function parseCorsOrigin(value) {
    if (!value)
        return true;
    const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0)
        return true;
    if (parts.length === 1)
        return parts[0];
    return parts;
}
function parseBoolean(value) {
    if (!value)
        return null;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on", "require", "required"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) {
        return false;
    }
    return null;
}
export const config = {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    host: process.env.HOST ?? DEFAULT_HOST,
    appEnv: process.env.APP_ENV ?? process.env.NODE_ENV ?? "production",
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    databaseSsl: parseBoolean(process.env.DATABASE_SSL),
    railwayEnvironment: process.env.RAILWAY_ENVIRONMENT ?? "",
    corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
    mockMode: (process.env.MOCK_MODE ?? "").toUpperCase() === "ENABLE",
    redisUrl: process.env.REDIS_URL ?? "",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
    ollamaModelReview: process.env.OLLAMA_MODEL_REVIEW ?? process.env.OLLAMA_MODEL ?? "qwen3-coder:480b",
    ollamaModelImposter: process.env.OLLAMA_MODEL_IMPOSTER ?? process.env.OLLAMA_MODEL ?? "gpt-oss:120b",
    ollamaApiKey: process.env.OLLAMA_API_KEY ?? "",
    pistonBaseUrl: process.env.PISTON_BASE_URL ?? "https://emkc.org/api/v2/piston",
    aiRateLimitPerMinute: Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 2),
    chatRateLimitPer10s: Number(process.env.CHAT_RATE_LIMIT_PER_10S ?? 10),
};
