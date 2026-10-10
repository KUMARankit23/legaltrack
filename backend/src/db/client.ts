import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Reasonable timeouts — don't hang forever if Postgres is down
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle client:", err.message);
});
