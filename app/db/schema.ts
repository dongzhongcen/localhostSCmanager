import {
  sqliteTable,
  integer,
  text,
  int,
} from "drizzle-orm/sqlite-core";

export const services = sqliteTable("services", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type", { enum: ["mysql", "redis", "nginx", "custom"] }).notNull().default("custom"),
  command: text("command").notNull(),
  cwd: text("cwd"),
  envVars: text("env_vars"), // JSON string of environment variables
  autoStart: int("auto_start", { mode: "boolean" }).notNull().default(false),
  requireAdmin: int("require_admin", { mode: "boolean" }).notNull().default(false),
  pid: integer("pid"), // current process id if running
  status: text("status", { enum: ["stopped", "running", "error"] }).notNull().default("stopped"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
