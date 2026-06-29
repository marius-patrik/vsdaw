import { z } from "zod";

export const EntityIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, {
  message: "EntityId must be URL-safe (alphanumeric, _, -) and 1-64 chars",
});
