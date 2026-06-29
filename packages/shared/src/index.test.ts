import { describe, expect, it } from "bun:test";
import { PPQN, PROTOCOL_VERSION, WS_SUBPROTOCOL } from "./constants.js";

describe("shared constants", () => {
  it("exports the protocol version", () => {
    expect(PROTOCOL_VERSION).toBe("1.0.0");
  });
  it("exports PPQN", () => {
    expect(PPQN).toBe(960);
  });
  it("exports WS_SUBPROTOCOL", () => {
    expect(WS_SUBPROTOCOL).toBe("singularity.v1");
  });
});
