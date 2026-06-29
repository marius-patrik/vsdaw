import { z } from "zod";
import { ENTITY_ID_MAX_LEN } from "../constants.js";

export const EntityIdSchema = z
  .string()
  .min(1)
  .max(ENTITY_ID_MAX_LEN)
  .regex(/^[A-Za-z0-9_-]+$/, {
    message: "EntityId must be URL-safe (alphanumeric, _, -)",
  });

export const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);
