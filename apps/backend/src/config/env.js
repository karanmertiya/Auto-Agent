import "dotenv/config";

const defaults = {
  PORT: "3001",
  FRONTEND_ORIGIN: "http://localhost:5173",
  NODE_ENV: "development"
};

function readEnv(key) {
  const value = process.env[key] ?? defaults[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  NODE_ENV: readEnv("NODE_ENV"),
  PORT: Number(readEnv("PORT")),
  FRONTEND_ORIGIN: readEnv("FRONTEND_ORIGIN"),
  SUPABASE_URL: readEnv("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  SUPABASE_DB_URL: process.env.SUPABASE_DB_URL ?? "",
  REDIS_URL: readEnv("REDIS_URL"),
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN ?? "",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? ""
};

