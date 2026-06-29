import { z } from "zod";

export const FileRootSchema = z.object({
  id: z.enum(["project", "userData", "downloads"]),
  path: z.string(),
  writable: z.boolean(),
});

export const FileEntryTypeSchema = z.enum(["file", "directory"]);

export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: FileEntryTypeSchema,
  size: z.number().int().optional(),
  modifiedAt: z.string().datetime().optional(),
});

export const FileReadRequestSchema = z.object({
  root: FileRootSchema.shape.id,
  path: z.string(),
  encoding: z.enum(["utf8", "base64"]).optional(),
});

export const FileWriteRequestSchema = z.object({
  root: FileRootSchema.shape.id,
  path: z.string(),
  content: z.string(),
  encoding: z.enum(["utf8", "base64"]).optional(),
});

export const FileRenameRequestSchema = z.object({
  root: FileRootSchema.shape.id,
  path: z.string(),
  newName: z.string(),
});

export const FileDeleteRequestSchema = z.object({
  root: FileRootSchema.shape.id,
  path: z.string(),
});

export const FileMkdirRequestSchema = z.object({
  root: FileRootSchema.shape.id,
  path: z.string(),
});
