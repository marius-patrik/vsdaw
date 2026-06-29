import { describe, expect, it } from "bun:test";
import { PROTOCOL_VERSION } from "./constants.js";

describe("shared", () => {
  it("exports the protocol version", () => {
    expect(PROTOCOL_VERSION).toBe("1.0.0");
  });
});
