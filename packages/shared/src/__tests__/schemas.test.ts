import { EngineMessageSchema, MessageSchema, ProjectSchema } from "../index.js";

const validProject = {
  version: "1.0.0",
  id: "project-1",
  name: "Test Project",
  createdAt: "2024-01-01T00:00:00Z",
  modifiedAt: "2024-01-01T00:00:00Z",
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  sampleRate: 48000,
  settings: { audioBufferSize: 512 },
  channelRack: { channels: [] },
  patterns: [],
  playlist: { tracks: [] },
  mixer: { inserts: [] },
  routing: { nodes: [], edges: [] },
  automationClips: [],
  assets: [],
};

describe("ProjectSchema", () => {
  it("accepts a minimal valid project", () => {
    const result = ProjectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level keys", () => {
    const result = ProjectSchema.safeParse({ ...validProject, extra: true });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid version", () => {
    const result = ProjectSchema.safeParse({ ...validProject, version: "0.9.0" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid EntityId", () => {
    const result = ProjectSchema.safeParse({ ...validProject, id: "has spaces" });
    expect(result.success).toBe(false);
  });
});

describe("MessageSchema", () => {
  it("accepts a valid message", () => {
    const result = MessageSchema.safeParse({
      id: "msg-1",
      type: "project.create",
      payload: { name: "New Project" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a message missing payload", () => {
    const result = MessageSchema.safeParse({
      id: "msg-1",
      type: "project.create",
    });
    expect(result.success).toBe(false);
  });

  it("allows extra envelope metadata via passthrough", () => {
    const parsed = MessageSchema.parse({
      id: "msg-2",
      type: "project.open",
      payload: {},
      traceId: "abc",
    });
    expect(parsed.traceId).toBe("abc");
  });
});

describe("EngineMessageSchema", () => {
  it("accepts a valid engine message", () => {
    const result = EngineMessageSchema.safeParse({
      id: "engine-cmd-1",
      type: "engine/ping",
      payload: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects extra keys", () => {
    const result = EngineMessageSchema.safeParse({
      id: "engine-cmd-2",
      type: "engine/ping",
      payload: {},
      extra: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid id", () => {
    const result = EngineMessageSchema.safeParse({
      id: "bad id!",
      type: "engine/ping",
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});
