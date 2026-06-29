import { describe, expect, it } from "bun:test";
import {
  barBeatTickToTicks,
  createEvent,
  createMessage,
  createReply,
  isValidProject,
  parseEngineFrames,
  samplesToSeconds,
  secondsToSamples,
  secondsToTicks,
  serializeEngineFrame,
  ticksToBarBeatTick,
  ticksToSeconds,
  validateAssetRef,
  validateClip,
  validateEngineMessage,
  validateEvent,
  validateMessage,
  validateMixerInsert,
  validateNoteEvent,
  validateProject,
  validateReply,
} from "../index.js";

const timeSignature = { numerator: 4, denominator: 4 };

const validProject = {
  version: "1.0.0",
  id: "project-1",
  name: "Test Project",
  createdAt: "2024-01-01T00:00:00Z",
  modifiedAt: "2024-01-01T00:00:00Z",
  bpm: 120,
  timeSignature,
  sampleRate: 48000,
  channelRack: {
    channels: [
      {
        id: "channel-1",
        index: 0,
        name: "Kick",
        type: "sampler",
        settings: {
          type: "sampler",
          sampleAssetId: "asset-1",
        },
      },
    ],
  },
  patterns: [
    {
      id: "pattern-1",
      index: 0,
      name: "Pattern 1",
      lengthTicks: 3840,
      channelData: {},
    },
  ],
  playlist: {
    tracks: [
      {
        id: "track-1",
        index: 0,
        name: "Track 1",
        clips: [],
      },
    ],
  },
  mixer: {
    inserts: [
      {
        id: "master",
        index: 0,
        name: "Master",
        kind: "master",
        pluginSlots: [],
        sends: [],
      },
    ],
  },
  routing: { nodes: [], edges: [] },
  automationClips: [],
  assets: [
    {
      id: "asset-1",
      kind: "audio",
      name: "kick.wav",
      bundlePath: "assets/kick.wav",
      sizeBytes: 1024,
    },
  ],
  settings: { audioBufferSize: 512 },
};

describe("time conversion utilities", () => {
  it("ticksToSeconds(960, 120, 960) returns 0.5", () => {
    expect(ticksToSeconds(960, 120, 960)).toBe(0.5);
  });
  it("secondsToTicks(0.5, 120, 960) returns 960", () => {
    expect(secondsToTicks(0.5, 120, 960)).toBe(960);
  });
  it("samplesToSeconds converts correctly", () => {
    expect(samplesToSeconds(44100, 44100)).toBe(1);
  });
  it("secondsToSamples rounds correctly", () => {
    expect(secondsToSamples(1, 44100)).toBe(44100);
  });
  it("ticksToBarBeatTick and barBeatTickToTicks round-trip", () => {
    const bbt = ticksToBarBeatTick(4000, timeSignature);
    expect(barBeatTickToTicks(bbt, timeSignature)).toBe(4000);
  });
  it("rejects non-finite inputs", () => {
    expect(() => ticksToSeconds(Number.NaN, 120)).toThrow(RangeError);
    expect(() => secondsToTicks(1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("message utilities", () => {
  it("createMessage returns a valid message", () => {
    const msg = createMessage("test", { foo: "bar" });
    expect(validateMessage(msg)).toEqual(msg);
  });
  it("createReply returns a valid reply", () => {
    const reply = createReply("00000000-0000-0000-0000-000000000001", true, { result: "ok" });
    expect(validateReply(reply)).toEqual(reply);
  });
  it("createEvent returns a valid event", () => {
    const event = createEvent("transport.play", {});
    expect(validateEvent(event)).toEqual(event);
  });
  it("validateEvent rejects invalid event", () => {
    expect(() =>
      validateEvent({ id: "not-a-uuid", type: "event", topic: "x", payload: {} }),
    ).toThrow();
  });
});

describe("validation helpers", () => {
  it("validateProject accepts valid project", () => {
    expect(validateProject(validProject)).toBeDefined();
  });
  it("isValidProject returns false for invalid project", () => {
    expect(isValidProject({})).toBe(false);
  });
  it("validateAssetRef accepts valid asset", () => {
    expect(
      validateAssetRef({
        id: "asset-1",
        kind: "audio",
        name: "kick.wav",
        bundlePath: "assets/kick.wav",
        sizeBytes: 1024,
      }),
    ).toBeDefined();
  });
  it("validateNoteEvent accepts valid note", () => {
    expect(
      validateNoteEvent({
        id: "note-1",
        key: 60,
        velocity: 100,
        pan: 0,
        startTick: 0,
        durationTicks: 960,
      }),
    ).toBeDefined();
  });
  it("validateClip accepts pattern clip", () => {
    expect(
      validateClip({
        type: "pattern",
        id: "clip-1",
        patternId: "pattern-1",
        startTick: 0,
        durationTicks: 3840,
      }),
    ).toBeDefined();
  });
  it("validateMixerInsert accepts valid insert", () => {
    expect(
      validateMixerInsert({
        id: "insert-1",
        index: 0,
        name: "Insert",
        pluginSlots: [],
        sends: [],
      }),
    ).toBeDefined();
  });
  it("validateEngineMessage accepts valid engine message", () => {
    expect(
      validateEngineMessage({
        id: "00000000-0000-0000-0000-00000000000a",
        type: "engine/ping",
        payload: {},
      }),
    ).toBeDefined();
  });
});

describe("engine frame utilities", () => {
  const message = {
    id: "00000000-0000-0000-0000-00000000000a",
    type: "engine/ping",
    payload: { hello: "world" },
  };

  it("serializeEngineFrame and parseEngineFrames are inverses", () => {
    const frame = serializeEngineFrame(message);
    const { messages, remainder } = parseEngineFrames(frame);
    expect(remainder.length).toBe(0);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(message);
  });
  it("parseEngineFrames handles partial frames", () => {
    const frame = serializeEngineFrame(message);
    const partial = frame.subarray(0, frame.length - 2);
    const { messages, remainder } = parseEngineFrames(partial);
    expect(messages).toHaveLength(0);
    expect(remainder.length).toBe(partial.length);
  });
  it("parseEngineFrames handles multiple frames", () => {
    const frame1 = serializeEngineFrame(message);
    const frame2 = serializeEngineFrame({
      id: "00000000-0000-0000-0000-00000000000b",
      type: "engine/pong",
      payload: {},
    });
    const combined = new Uint8Array(frame1.length + frame2.length);
    combined.set(frame1, 0);
    combined.set(frame2, frame1.length);
    const { messages, remainder } = parseEngineFrames(combined);
    expect(remainder.length).toBe(0);
    expect(messages).toHaveLength(2);
  });
  it("parseEngineFrames rejects oversized length", () => {
    const buffer = new Uint8Array(4);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, 17 * 1024 * 1024, false);
    expect(() => parseEngineFrames(buffer)).toThrow();
  });
});
