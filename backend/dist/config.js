const DEFAULT_PORT = 4000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/amongus_coder";
export const config = {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    host: process.env.HOST ?? DEFAULT_HOST,
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    corsOrigin: process.env.CORS_ORIGIN ?? true,
    mockMode: (process.env.MOCK_MODE ?? "").toUpperCase() === "ENABLE",
};
