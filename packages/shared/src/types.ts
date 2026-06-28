import type { z } from "zod";
import type { EntityIdSchema } from "./schemas/base.js";
import type {
  EngineMessageSchema,
  ErrorCodeSchema,
  ErrorEnvelopeSchema,
  EventSchema,
  MessageSchema,
  ReplySchema,
} from "./schemas/envelope.js";
import type {
  ChannelRackSchema,
  MixerSchema,
  PlaylistSchema,
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
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export type TimeSignature = z.infer<typeof TimeSignatureSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type ChannelRack = z.infer<typeof ChannelRackSchema>;
export type Playlist = z.infer<typeof PlaylistSchema>;
export type Mixer = z.infer<typeof MixerSchema>;
export type RoutingGraph = z.infer<typeof RoutingGraphSchema>;
export type Project = z.infer<typeof ProjectSchema>;
