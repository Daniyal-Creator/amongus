const DEFAULT_PORT = 4000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/amongus_coder";
export const config = {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    host: process.env.HOST ?? DEFAULT_HOST,
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    corsOrigin: process.env.CORS_ORIGIN ?? true,
    mockMode: (process.env.MOCK_MODE ?? "").toUpperCase() === "ENABLE",
    redisUrl: process.env.REDIS_URL ?? "",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
    ollamaApiKey: process.env.OLLAMA_API_KEY ?? "",
    pistonBaseUrl: process.env.PISTON_BASE_URL ?? "https://emkc.org/api/v2/piston",
    aiRateLimitPerMinute: Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 5),
    chatRateLimitPer10s: Number(process.env.CHAT_RATE_LIMIT_PER_10S ?? 10),
};
