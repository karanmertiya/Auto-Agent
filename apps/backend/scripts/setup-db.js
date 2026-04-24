import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, "..", "supabase", "migrations", "001_init.sql");

if (!process.env.SUPABASE_DB_URL) {
  throw new Error("SUPABASE_DB_URL is required to run the setup script.");
}

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: process.env.SUPABASE_DB_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});

const client = await pool.connect();

try {
  const sql = await readFile(migrationPath, "utf8");
  await client.query(sql);
  console.log("Supabase schema initialized successfully.");
} finally {
  client.release();
  await pool.end();
}

