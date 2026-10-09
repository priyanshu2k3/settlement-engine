import dotenv from "dotenv";

dotenv.config({ path: new URL("../.env", import.meta.url) });

export const PORT = process.env.SERVER_PORT || 8000;
export const POSTGRES_USER = process.env.POSTGRES_USER ?? "postgres";
export const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? "";
export const POSTGRES_DB = process.env.POSTGRES_DB ?? "settlement_engine";
export const POSTGRES_HOST = process.env.POSTGRES_HOST ?? "localhost";
export const POSTGRES_PORT = Number(process.env.POSTGRES_PORT ?? 5432);
export const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
export const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);
