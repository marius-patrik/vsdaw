import type { z } from "zod";
import type { AssetKindSchema, AssetRefSchema } from "./schemas/asset.js";
import type {
  AutomationClipSchema,
  AutomationPointSchema,
  AutomationTargetSchema,
  AutomationTargetTypeSchema,
} from "./schemas/automation.js";
import type { EntityIdSchema, HexColorSchema } from "./schemas/base.js";
import type {
  ChannelRackSchema,
  ChannelSchema,
  ChannelSettingsSchema,
  ChannelTypeSchema,
  MixerInsertRefSchema,
} from "./schemas/channel.js";
import type {
  EngineMessageSchema,
  ErrorCodeSchema,
  ErrorEnvelopeSchema,
  EventSchema,
  HealthResponseSchema,
  MessageSchema,
  ReplySchema,
} from "./schemas/envelope.js";
import type { MixerInsertSchema, MixerSchema, PluginSlotSchema } from "./schemas/mixer.js";
import type { AudioInputSourceSchema, InsertKindSchema, SendSchema } from "./schemas/mixer.js";
import type {
  NoteEventSchema,
  PatternChannelDataSchema,
  PatternSchema,
} from "./schemas/pattern.js";
import type {
  AudioClipSchema,
  AutomationClipRefSchema,
  ClipSchema,
  FadeSchema,
  FadeTypeSchema,
  PatternClipSchema,
  PlaylistSchema,
  PlaylistTrackSchema,
} from "./schemas/playlist.js";
import type { PluginFormatSchema, PluginInstanceSchema } from "./schemas/plugin.js";
import type { ProjectSchema, ProjectSettingsSchema } from "./schemas/project.js";
import type {
  RoutingGraphEdgeSchema,
  RoutingGraphNodeSchema,
  RoutingGraphPortSchema,
  RoutingGraphSchema,
} from "./schemas/routing.js";
import type {
  BarBeatTickSchema,
  SampleSchema,
  SecondSchema,
  TickSchema,
  TimeSignatureSchema,
} from "./schemas/time.js";
import type {
  MidiMessageSchema,
  TransportModeSchema,
  TransportStateSchema,
} from "./schemas/transport.js";

export type EntityId = z.infer<typeof EntityIdSchema>;
export type HexColor = z.infer<typeof HexColorSchema>;

export type Tick = z.infer<typeof TickSchema>;
export type Sample = z.infer<typeof SampleSchema>;
export type Second = z.infer<typeof SecondSchema>;
export type TimeSignature = z.infer<typeof TimeSignatureSchema>;
export type BarBeatTick = z.infer<typeof BarBeatTickSchema>;

export type ChannelType = z.infer<typeof ChannelTypeSchema>;
export type MixerInsertRef = z.infer<typeof MixerInsertRefSchema>;
export type ChannelSettings = z.infer<typeof ChannelSettingsSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type ChannelRack = z.infer<typeof ChannelRackSchema>;

export type NoteEvent = z.infer<typeof NoteEventSchema>;
export type PatternChannelData = z.infer<typeof PatternChannelDataSchema>;
export type Pattern = z.infer<typeof PatternSchema>;

export type FadeType = z.infer<typeof FadeTypeSchema>;
export type Fade = z.infer<typeof FadeSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;
export type Playlist = z.infer<typeof PlaylistSchema>;

export type PluginFormat = z.infer<typeof PluginFormatSchema>;
export type PluginInstance = z.infer<typeof PluginInstanceSchema>;
export type PluginSlot = z.infer<typeof PluginSlotSchema>;
export type Send = z.infer<typeof SendSchema>;
export type InsertKind = z.infer<typeof InsertKindSchema>;
export type AudioInputSource = z.infer<typeof AudioInputSourceSchema>;
export type MixerInsert = z.infer<typeof MixerInsertSchema>;
export type Mixer = z.infer<typeof MixerSchema>;

export type RoutingGraphPort = z.infer<typeof RoutingGraphPortSchema>;
export type RoutingGraphNode = z.infer<typeof RoutingGraphNodeSchema>;
export type RoutingGraphEdge = z.infer<typeof RoutingGraphEdgeSchema>;
export type RoutingGraph = z.infer<typeof RoutingGraphSchema>;

export type AutomationTargetType = z.infer<typeof AutomationTargetTypeSchema>;
export type AutomationTarget = z.infer<typeof AutomationTargetSchema>;
export type AutomationPoint = z.infer<typeof AutomationPointSchema>;
export type AutomationClip = z.infer<typeof AutomationClipSchema>;

export type AssetKind = z.infer<typeof AssetKindSchema>;
export type AssetRef = z.infer<typeof AssetRefSchema>;

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export type TransportState = z.infer<typeof TransportStateSchema>;
export type TransportMode = z.infer<typeof TransportModeSchema>;
export type MidiMessage = z.infer<typeof MidiMessageSchema>;

export type Message = z.infer<typeof MessageSchema>;
export type Reply = z.infer<typeof ReplySchema>;
export type Event = z.infer<typeof EventSchema>;
export type EngineMessage = z.infer<typeof EngineMessageSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
