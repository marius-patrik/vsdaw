import { describe, expect, it } from "bun:test";
import {
  AssetKindSchema,
  AssetRefSchema,
  AutomationClipSchema,
  AutomationPointSchema,
  AutomationTargetSchema,
  AutomationTargetTypeSchema,
  BarBeatTickSchema,
  ChannelRackSchema,
  ChannelSchema,
  ChannelSettingsSchema,
  ChannelTypeSchema,
  ClipSchema,
  EngineMessageSchema,
  EntityIdSchema,
  ErrorCodeSchema,
  ErrorEnvelopeSchema,
  EventSchema,
  FadeSchema,
  FadeTypeSchema,
  HealthResponseSchema,
  HexColorSchema,
  InsertKindSchema,
  MessageSchema,
  MidiMessageSchema,
  MixerInsertRefSchema,
  MixerInsertSchema,
  MixerSchema,
  NoteEventSchema,
  PatternChannelDataSchema,
  PatternSchema,
  PlaylistSchema,
  PlaylistTrackSchema,
  PluginFormatSchema,
  PluginInstanceSchema,
  ProjectSchema,
  ProjectSettingsSchema,
  ReplySchema,
  RoutingGraphEdgeSchema,
  RoutingGraphNodeSchema,
  RoutingGraphPortKindSchema,
  RoutingGraphPortSchema,
  RoutingGraphSchema,
  SampleSchema,
  SecondSchema,
  TickSchema,
  TimeSignatureSchema,
  TransportModeSchema,
  TransportStateSchema,
} from "../index.js";

function expectValid<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  value: unknown,
) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(true);
  return result.data as T;
}

function expectInvalid(
  schema: { safeParse: (v: unknown) => { success: boolean } },
  value: unknown,
) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
}

const validTimeSignature = { numerator: 4, denominator: 4 };

const validPluginInstance = {
  id: "plugin-1",
  descriptorId: "desc-1",
  name: "Test Plugin",
  vendor: "Vendor",
  version: "1.0.0",
  format: "vst3",
  parameters: {},
  delaySamples: 0,
};

const validChannel = {
  id: "channel-1",
  index: 0,
  name: "Kick",
  type: "sampler",
  settings: {
    type: "sampler",
    sampleAssetId: "asset-1",
    rootNote: 60,
    loopMode: "none",
  },
};

const validNoteEvent = {
  id: "note-1",
  key: 60,
  velocity: 100,
  pan: 0,
  startTick: 0,
  durationTicks: 960,
};

const validPattern = {
  id: "pattern-1",
  index: 0,
  name: "Pattern 1",
  lengthTicks: 3840,
  channelData: {},
};

const validPlaylistTrack = {
  id: "track-1",
  index: 0,
  name: "Track 1",
  clips: [],
};

const validMixerInsert = {
  id: "master",
  index: 0,
  name: "Master",
  kind: "master",
  pluginSlots: [],
  sends: [],
};

const validAssetRef = {
  id: "asset-1",
  kind: "audio",
  name: "kick.wav",
  bundlePath: "assets/kick.wav",
  sizeBytes: 1024,
};

const validProject = {
  version: "1.0.0",
  id: "project-1",
  name: "Test Project",
  createdAt: "2024-01-01T00:00:00Z",
  modifiedAt: "2024-01-01T00:00:00Z",
  bpm: 120,
  timeSignature: validTimeSignature,
  sampleRate: 48000,
  channelRack: { channels: [validChannel] },
  patterns: [validPattern],
  playlist: { tracks: [validPlaylistTrack] },
  mixer: { inserts: [validMixerInsert] },
  routing: { nodes: [], edges: [] },
  automationClips: [],
  assets: [validAssetRef],
  settings: { audioBufferSize: 512 },
};

describe("base schemas", () => {
  it("EntityIdSchema accepts URL-safe ids", () => {
    expectValid(EntityIdSchema, "abc-123");
    expectValid(EntityIdSchema, "a");
  });
  it("EntityIdSchema rejects invalid ids", () => {
    expectInvalid(EntityIdSchema, "");
    expectInvalid(EntityIdSchema, "has spaces");
    expectInvalid(EntityIdSchema, "a@b");
    expectInvalid(EntityIdSchema, "a".repeat(65));
  });
  it("HexColorSchema accepts hex colors", () => {
    expectValid(HexColorSchema, "#ff0000");
    expectValid(HexColorSchema, "#ff0000aa");
  });
  it("HexColorSchema rejects invalid colors", () => {
    expectInvalid(HexColorSchema, "red");
    expectInvalid(HexColorSchema, "#ff00");
  });
});

describe("time schemas", () => {
  it("TickSchema accepts safe integers", () => {
    expectValid(TickSchema, 0);
    expectValid(TickSchema, 960);
  });
  it("TickSchema rejects invalid ticks", () => {
    expectInvalid(TickSchema, 1.5);
    expectInvalid(TickSchema, Number.NaN);
  });
  it("SampleSchema accepts safe integers", () => {
    expectValid(SampleSchema, 0);
    expectValid(SampleSchema, 44100);
  });
  it("SampleSchema rejects invalid samples", () => {
    expectInvalid(SampleSchema, 1.5);
  });
  it("SecondSchema accepts finite numbers", () => {
    expectValid(SecondSchema, 0.5);
  });
  it("SecondSchema rejects invalid seconds", () => {
    expectInvalid(SecondSchema, Number.POSITIVE_INFINITY);
  });
  it("TimeSignatureSchema accepts valid signatures", () => {
    expectValid(TimeSignatureSchema, validTimeSignature);
    expectValid(TimeSignatureSchema, { numerator: 3, denominator: 8 });
  });
  it("TimeSignatureSchema rejects invalid signatures", () => {
    expectInvalid(TimeSignatureSchema, { numerator: 4, denominator: 3 });
    expectInvalid(TimeSignatureSchema, { numerator: 0, denominator: 4 });
  });
  it("BarBeatTickSchema accepts valid BBT", () => {
    expectValid(BarBeatTickSchema, { bar: 1, beat: 2, tick: 3 });
  });
  it("BarBeatTickSchema rejects invalid BBT", () => {
    expectInvalid(BarBeatTickSchema, { bar: -1, beat: 0, tick: 0 });
  });
});

describe("plugin schemas", () => {
  it("PluginFormatSchema accepts valid formats", () => {
    expectValid(PluginFormatSchema, "vst3");
  });
  it("PluginFormatSchema rejects invalid formats", () => {
    expectInvalid(PluginFormatSchema, "vst2");
  });
  it("PluginInstanceSchema accepts valid plugin", () => {
    expectValid(PluginInstanceSchema, validPluginInstance);
  });
  it("PluginInstanceSchema rejects invalid plugin", () => {
    expectInvalid(PluginInstanceSchema, { ...validPluginInstance, format: "invalid" });
  });
});

describe("channel schemas", () => {
  it("ChannelTypeSchema accepts valid types", () => {
    expectValid(ChannelTypeSchema, "sampler");
  });
  it("ChannelTypeSchema rejects invalid types", () => {
    expectInvalid(ChannelTypeSchema, "drum");
  });
  it("MixerInsertRefSchema accepts valid ref", () => {
    expectValid(MixerInsertRefSchema, { insertId: "master" });
  });
  it("ChannelSettingsSchema accepts sampler settings", () => {
    expectValid(ChannelSettingsSchema, {
      type: "sampler",
      sampleAssetId: "asset-1",
    });
  });
  it("ChannelSettingsSchema rejects missing type", () => {
    expectInvalid(ChannelSettingsSchema, { sampleAssetId: "asset-1" });
  });
  it("ChannelSchema accepts valid channel", () => {
    expectValid(ChannelSchema, validChannel);
  });
  it("ChannelSchema rejects invalid channel", () => {
    expectInvalid(ChannelSchema, { ...validChannel, index: 256 });
  });
  it("ChannelRackSchema accepts valid rack", () => {
    expectValid(ChannelRackSchema, { channels: [validChannel] });
  });
  it("ChannelRackSchema rejects too many channels", () => {
    expectInvalid(ChannelRackSchema, { channels: Array(257).fill(validChannel) });
  });
});

describe("pattern schemas", () => {
  it("NoteEventSchema accepts valid note", () => {
    expectValid(NoteEventSchema, validNoteEvent);
  });
  it("NoteEventSchema rejects invalid key", () => {
    expectInvalid(NoteEventSchema, { ...validNoteEvent, key: 128 });
  });
  it("PatternChannelDataSchema accepts valid data", () => {
    expectValid(PatternChannelDataSchema, { notes: [validNoteEvent] });
  });
  it("PatternSchema accepts valid pattern", () => {
    expectValid(PatternSchema, validPattern);
  });
  it("PatternSchema rejects invalid pattern", () => {
    expectInvalid(PatternSchema, { ...validPattern, index: -1 });
  });
});

describe("playlist schemas", () => {
  it("FadeTypeSchema accepts valid types", () => {
    expectValid(FadeTypeSchema, "linear");
  });
  it("FadeSchema accepts valid fade", () => {
    expectValid(FadeSchema, { type: "linear", durationTicks: 100 });
  });
  it("ClipSchema accepts pattern clip", () => {
    expectValid(ClipSchema, {
      type: "pattern",
      id: "clip-1",
      patternId: "pattern-1",
      startTick: 0,
      durationTicks: 3840,
    });
  });
  it("ClipSchema rejects unknown clip type", () => {
    expectInvalid(ClipSchema, { type: "video", id: "clip-1" });
  });
  it("PlaylistTrackSchema accepts valid track", () => {
    expectValid(PlaylistTrackSchema, validPlaylistTrack);
  });
  it("PlaylistSchema accepts valid playlist", () => {
    expectValid(PlaylistSchema, { tracks: [validPlaylistTrack] });
  });
  it("PlaylistSchema rejects empty tracks", () => {
    expectInvalid(PlaylistSchema, { tracks: [] });
  });
});

describe("mixer schemas", () => {
  it("InsertKindSchema accepts valid kinds", () => {
    expectValid(InsertKindSchema, "master");
  });
  it("MixerInsertSchema accepts valid insert", () => {
    expectValid(MixerInsertSchema, validMixerInsert);
  });
  it("MixerInsertSchema rejects invalid volume", () => {
    expectInvalid(MixerInsertSchema, { ...validMixerInsert, volumeDb: 20 });
  });
  it("MixerSchema accepts valid mixer", () => {
    expectValid(MixerSchema, { inserts: [validMixerInsert] });
  });
  it("MixerSchema rejects empty inserts", () => {
    expectInvalid(MixerSchema, { inserts: [] });
  });
});

describe("routing schemas", () => {
  const validPort = { id: "port-1", kind: "audioIn" };
  const validNode = { id: "node-1", type: "insert", entityId: "insert-1", x: 0, y: 0 };
  const validEdge = {
    id: "edge-1",
    sourceNodeId: "node-1",
    sourcePortId: "port-1",
    targetNodeId: "node-2",
    targetPortId: "port-2",
    kind: "output",
  };
  it("RoutingGraphPortKindSchema accepts valid kinds", () => {
    expectValid(RoutingGraphPortKindSchema, "sendOut");
  });
  it("RoutingGraphPortSchema accepts valid port", () => {
    expectValid(RoutingGraphPortSchema, validPort);
  });
  it("RoutingGraphNodeSchema accepts valid node", () => {
    expectValid(RoutingGraphNodeSchema, validNode);
  });
  it("RoutingGraphEdgeSchema accepts valid edge", () => {
    expectValid(RoutingGraphEdgeSchema, validEdge);
  });
  it("RoutingGraphSchema accepts valid graph", () => {
    expectValid(RoutingGraphSchema, { nodes: [validNode], edges: [validEdge] });
  });
});

describe("automation schemas", () => {
  it("AutomationTargetTypeSchema accepts valid types", () => {
    expectValid(AutomationTargetTypeSchema, "pluginParam");
  });
  it("AutomationTargetSchema accepts valid target", () => {
    expectValid(AutomationTargetSchema, {
      type: "channelParam",
      entityId: "channel-1",
      parameterId: "volume",
    });
  });
  it("AutomationPointSchema accepts valid point", () => {
    expectValid(AutomationPointSchema, { tick: 0, value: 0.5 });
  });
  it("AutomationClipSchema accepts valid clip", () => {
    expectValid(AutomationClipSchema, {
      id: "automation-1",
      name: "Volume",
      target: { type: "channelParam", entityId: "channel-1", parameterId: "volume" },
      points: [{ tick: 0, value: 0.5 }],
    });
  });
});

describe("asset schemas", () => {
  it("AssetKindSchema accepts valid kinds", () => {
    expectValid(AssetKindSchema, "audio");
  });
  it("AssetRefSchema accepts valid asset", () => {
    expectValid(AssetRefSchema, validAssetRef);
  });
  it("AssetRefSchema rejects invalid hash", () => {
    expectInvalid(AssetRefSchema, { ...validAssetRef, hashSha256: "abc" });
  });
});

describe("transport schemas", () => {
  it("TransportStateSchema accepts valid states", () => {
    expectValid(TransportStateSchema, "playing");
  });
  it("TransportModeSchema accepts valid modes", () => {
    expectValid(TransportModeSchema, "song");
  });
  it("MidiMessageSchema accepts valid midi", () => {
    expectValid(MidiMessageSchema, { bytes: [144, 60, 100] });
  });
  it("MidiMessageSchema rejects empty bytes", () => {
    expectInvalid(MidiMessageSchema, { bytes: [] });
  });
});

describe("envelope schemas", () => {
  it("ErrorCodeSchema accepts valid codes", () => {
    expectValid(ErrorCodeSchema, "ERR_INVALID_MESSAGE");
  });
  it("ErrorEnvelopeSchema accepts valid envelope", () => {
    expectValid(ErrorEnvelopeSchema, { code: "ERR_INTERNAL", message: "oops" });
  });
  it("MessageSchema accepts valid message", () => {
    expectValid(MessageSchema, {
      id: "00000000-0000-0000-0000-000000000001",
      type: "test",
      payload: {},
    });
  });
  it("MessageSchema rejects missing payload", () => {
    expectInvalid(MessageSchema, { id: "00000000-0000-0000-0000-000000000001", type: "test" });
  });
  it("MessageSchema rejects extra keys", () => {
    expectInvalid(MessageSchema, {
      id: "00000000-0000-0000-0000-000000000001",
      type: "test",
      payload: {},
      meta: true,
    });
  });
  it("ReplySchema accepts valid reply", () => {
    expectValid(ReplySchema, {
      id: "00000000-0000-0000-0000-000000000001",
      type: "reply",
      inReplyTo: "00000000-0000-0000-0000-000000000002",
      success: true,
    });
  });
  it("EventSchema accepts valid event", () => {
    expectValid(EventSchema, {
      id: "00000000-0000-0000-0000-000000000003",
      type: "event",
      topic: "transport",
      payload: {},
    });
  });
  it("EngineMessageSchema accepts valid engine message", () => {
    expectValid(EngineMessageSchema, {
      id: "00000000-0000-0000-0000-000000000004",
      type: "engine/ping",
      payload: {},
    });
  });
  it("EngineMessageSchema rejects extra keys", () => {
    expectInvalid(EngineMessageSchema, {
      id: "00000000-0000-0000-0000-000000000004",
      type: "engine/ping",
      payload: {},
      extra: true,
    });
  });
  it("HealthResponseSchema accepts valid response", () => {
    expectValid(HealthResponseSchema, { status: "ok", protocolVersion: "1.0.0" });
  });
  it("HealthResponseSchema rejects invalid version", () => {
    expectInvalid(HealthResponseSchema, { status: "ok", protocolVersion: "0.9.0" });
  });
});

describe("project schemas", () => {
  it("ProjectSettingsSchema accepts valid settings", () => {
    expectValid(ProjectSettingsSchema, { audioBufferSize: 512 });
  });
  it("ProjectSettingsSchema rejects invalid buffer size", () => {
    expectInvalid(ProjectSettingsSchema, { audioBufferSize: 5 });
  });
  it("ProjectSchema accepts minimal valid project", () => {
    expectValid(ProjectSchema, validProject);
  });
  it("ProjectSchema rejects unknown keys", () => {
    expectInvalid(ProjectSchema, { ...validProject, extra: true });
  });
  it("ProjectSchema rejects invalid version", () => {
    expectInvalid(ProjectSchema, { ...validProject, version: "0.9.0" });
  });
  it("ProjectSchema rejects invalid bpm", () => {
    expectInvalid(ProjectSchema, { ...validProject, bpm: 0 });
  });
});
