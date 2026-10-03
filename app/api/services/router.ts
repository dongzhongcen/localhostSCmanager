import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { services } from "@db/schema";
import { eq } from "drizzle-orm";
import {
  startService,
  stopService,
  restartService,
  getServiceLogs,
  clearServiceLogs,
  getServiceStatus,
} from "./processManager";

export const serviceRouter = createRouter({
  list: publicQuery.query(() => {
    const db = getDb();
    return db.select().from(services).all();
  }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(({ input }) => {
      const db = getDb();
      return db.select().from(services).where(eq(services.id, input.id)).get();
    }),

  create: publicQuery
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["mysql", "redis", "nginx", "custom"]),
        command: z.string().min(1),
        cwd: z.string().optional(),
        envVars: z.string().optional(),
        autoStart: z.boolean().default(false),
        requireAdmin: z.boolean().default(false),
      })
    )
    .mutation(({ input }) => {
      const db = getDb();
      const result = db
        .insert(services)
        .values({
          ...input,
          status: "stopped",
        })
        .returning()
        .get();
      return result;
    }),

  update: publicQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        type: z.enum(["mysql", "redis", "nginx", "custom"]).optional(),
        command: z.string().min(1).optional(),
        cwd: z.string().optional(),
        envVars: z.string().optional(),
        autoStart: z.boolean().optional(),
        requireAdmin: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      const result = db
        .update(services)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(services.id, id))
        .returning()
        .get();
      return result;
    }),

  delete: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      // Stop the service first if running
      try {
        await stopService(input.id);
      } catch {
        // Ignore if already stopped
      }
      
      const db = getDb();
      clearServiceLogs(input.id);
      db.delete(services).where(eq(services.id, input.id)).run();
      return { success: true };
    }),

  start: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return startService(input.id);
    }),

  stop: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return stopService(input.id);
    }),

  restart: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return restartService(input.id);
    }),

  status: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getServiceStatus(input.id);
    }),

  statuses: publicQuery.query(async () => {
    const db = getDb();
    const allServices = db.select().from(services).all();
    const statuses: Record<number, { status: string; pid: number | null }> = {};

    for (const service of allServices) {
      statuses[service.id] = await getServiceStatus(service.id);
    }

    return statuses;
  }),

  logs: publicQuery
    .input(z.object({ id: z.number(), lines: z.number().default(100) }))
    .query(({ input }) => {
      return getServiceLogs(input.id, input.lines);
    }),

  clearLogs: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      clearServiceLogs(input.id);
      return { success: true };
    }),
});
