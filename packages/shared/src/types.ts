import type { z } from "zod";
import type {
  AgentSessionSchema,
  AgentToolCallSchema,
  AgentToolResultSchema,
} from "./schemas/agent.js";
import type { EntityIdSchema } from "./schemas/base.js";
import type { BrowserActionSchema, BrowserSessionSchema } from "./schemas/browser.js";
import type {
  EngineEventSchema,
  EngineMessageSchema,
  EngineReplySchema,
} from "./schemas/engine.js";
import type {
  ErrorCodeSchema,
  ErrorEnvelopeSchema,
  EventSchema,
  MessageSchema,
  ReplySchema,
} from "./schemas/envelope.js";
import type { FileEntrySchema, FileRootSchema } from "./schemas/files.js";
import type { PluginFormatSchema, PluginInfoSchema } from "./schemas/plugins.js";
import type {
  ChannelRackSchema,
  CreateProjectRequestSchema,
  MixerSchema,
  PlaylistSchema,
  ProjectMetadataPatchSchema,
  ProjectSchema,
  ProjectSettingsSchema,
  RoutingGraphSchema,
  TimeSignatureSchema,
} from "./schemas/project.js";

export type EntityId = z.infer<typeof EntityIdSchema>;

export type Message = z.infer<typeof MessageSchema>;
export type Reply = z.infer<typeof ReplySchema>;
export type Event = z.infer<typeof EventSchema>;
export type EngineMessage = z.infer<typeof EngineMessageSchema>;
export type EngineReply<T = unknown> = Omit<z.infer<typeof EngineReplySchema>, "payload"> & {
  payload?: T;
};
export type EngineEvent = z.infer<typeof EngineEventSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export type TimeSignature = z.infer<typeof TimeSignatureSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type ChannelRack = z.infer<typeof ChannelRackSchema>;
export type Playlist = z.infer<typeof PlaylistSchema>;
export type Mixer = z.infer<typeof MixerSchema>;
export type RoutingGraph = z.infer<typeof RoutingGraphSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type ProjectMetadataPatch = z.infer<typeof ProjectMetadataPatchSchema>;

export type PluginFormat = z.infer<typeof PluginFormatSchema>;
export type PluginInfo = z.infer<typeof PluginInfoSchema>;

export type FileRoot = z.infer<typeof FileRootSchema>;
export type FileEntry = z.infer<typeof FileEntrySchema>;

export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;
export type AgentToolResult = z.infer<typeof AgentToolResultSchema>;
export type AgentSession = z.infer<typeof AgentSessionSchema>;

export type BrowserAction = z.infer<typeof BrowserActionSchema>;
export type BrowserSession = z.infer<typeof BrowserSessionSchema>;
