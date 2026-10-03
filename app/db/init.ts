import { getDb } from "../api/queries/connection";
import { services } from "./schema";

export function initDb() {
  const db = getDb();
  // SQLite creates tables automatically via drizzle push, but we ensure the table exists
  try {
    db.select().from(services).limit(1).get();
  } catch {
    // Table doesn't exist, run push via drizzle-kit programmatically is complex,
    // so we use raw SQL to create tables
    db.run(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'custom',
        command TEXT NOT NULL,
        cwd TEXT,
        env_vars TEXT,
        auto_start INTEGER NOT NULL DEFAULT 0,
        require_admin INTEGER NOT NULL DEFAULT 0,
        pid INTEGER,
        status TEXT NOT NULL DEFAULT 'stopped',
        created_at INTEGER,
        updated_at INTEGER
      )
    `);
  }
}
