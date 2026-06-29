import { themeRecordSchema, vsCodeThemeSchema } from "@singularity/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ThemeStore } from "../themes/theme-store.js";
import { slugify } from "../utils/slugify.js";

export const listThemesResponseSchema = z.object({
  themes: z.array(themeRecordSchema),
});

export const importThemeResponseSchema = themeRecordSchema;

export const getThemeResponseSchema = vsCodeThemeSchema;

export async function themesRoutes(
  app: FastifyInstance,
  store: ThemeStore,
  broadcast: (message: Record<string, unknown>) => void,
): Promise<void> {
  app.get("/themes", async (_request, reply) => {
    const themes = await store.listThemes();
    return reply.send({ themes });
  });

  app.post("/themes/import", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "Missing theme file" });
    }
    const text = await data.toBuffer().then((buf) => buf.toString("utf-8"));
    let theme: z.infer<typeof vsCodeThemeSchema>;
    try {
      theme = vsCodeThemeSchema.parse(JSON.parse(text));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Invalid VS Code theme", details: err.errors });
      }
      return reply.status(400).send({ error: "Invalid JSON" });
    }
    const id = slugify(theme.name);
    const record = await store.importTheme(id, theme);
    broadcast({ type: "theme.changed", payload: theme });
    return reply.status(201).send(record);
  });

  app.get("/themes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const theme = await store.getTheme(id);
    if (!theme) {
      return reply.status(404).send({ error: "Theme not found" });
    }
    return reply.send(theme);
  });

  app.delete("/themes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await store.deleteTheme(id);
    if (!deleted) {
      return reply.status(404).send({ error: "Theme not found or built-in" });
    }
    return reply.status(204).send();
  });
}
