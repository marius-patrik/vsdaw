import { themeSettingsSchema, uiScaleSchema } from "@singularity/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ThemeStore } from "../themes/theme-store.js";

export const getThemeSettingsResponseSchema = themeSettingsSchema;

export const patchThemeSettingsRequestSchema = z.object({
  activeThemeId: z.string().optional(),
  uiScale: uiScaleSchema.optional(),
});

export async function settingsRoutes(
  app: FastifyInstance,
  store: ThemeStore,
  broadcast: (message: Record<string, unknown>) => void,
): Promise<void> {
  app.get("/settings/theme", async (_request, reply) => {
    const settings = await store.getSettings();
    return reply.send(settings);
  });

  app.patch("/settings/theme", async (request, reply) => {
    const parseResult = patchThemeSettingsRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send({ error: "Invalid settings", details: parseResult.error.errors });
    }
    const previous = await store.getSettings();
    const settings = await store.updateSettings(parseResult.data);
    if (
      parseResult.data.activeThemeId &&
      parseResult.data.activeThemeId !== previous.activeThemeId
    ) {
      const theme = await store.getTheme(parseResult.data.activeThemeId);
      if (theme) {
        broadcast({ type: "theme.changed", payload: theme });
      }
    }
    if (parseResult.data.uiScale && parseResult.data.uiScale !== previous.uiScale) {
      broadcast({ type: "theme.scaleChanged", payload: { uiScale: parseResult.data.uiScale } });
    }
    return reply.send(settings);
  });
}
