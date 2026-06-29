import { z } from "zod";
import { EntityIdSchema } from "./base.js";

export const RoutingGraphPortKindSchema = z.enum([
  "audioIn",
  "audioOut",
  "sidechainIn",
  "sidechainOut",
  "sendOut",
]);

export const RoutingGraphPortSchema = z.object({
  id: EntityIdSchema,
  kind: RoutingGraphPortKindSchema,
  label: z.string().max(64).optional(),
});

export const RoutingGraphNodeTypeSchema = z.enum([
  "insert",
  "plugin",
  "hardwareInput",
  "masterOutput",
]);

export const RoutingGraphNodeSchema = z.object({
  id: EntityIdSchema,
  type: RoutingGraphNodeTypeSchema,
  entityId: EntityIdSchema,
  x: z.number(),
  y: z.number(),
  ports: z.array(RoutingGraphPortSchema).default([]),
});

export const RoutingGraphEdgeKindSchema = z.enum(["output", "send", "sidechain"]);

export const RoutingGraphEdgeSchema = z.object({
  id: EntityIdSchema,
  sourceNodeId: EntityIdSchema,
  sourcePortId: EntityIdSchema,
  targetNodeId: EntityIdSchema,
  targetPortId: EntityIdSchema,
  kind: RoutingGraphEdgeKindSchema,
});

export const RoutingGraphSchema = z.object({
  nodes: z.array(RoutingGraphNodeSchema),
  edges: z.array(RoutingGraphEdgeSchema),
});
