import { createRouter, publicQuery } from "./middleware";
import { serviceRouter } from "./services/router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  service: serviceRouter,
});

export type AppRouter = typeof appRouter;
