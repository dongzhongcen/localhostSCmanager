import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@db/schema";
import * as relations from "@db/relations";
import path from "path";
import { env } from "../lib/env";

const dbPath = path.join(env.dataDir, "services.db");
const sqlite = new Database(dbPath);

const fullSchema = { ...schema, ...relations };
const db = drizzle(sqlite, { schema: fullSchema });

export function getDb() {
  return db;
}
