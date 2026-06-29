import { describe, expect, it } from "bun:test";
import { Button, IconButton, ToggleButton } from "../button.js";
import { Select } from "../select.js";
import { Slider } from "../slider.js";
import { TextInput } from "../text-input.js";

describe("primitive components", () => {
  it("exports Button, IconButton, and ToggleButton", () => {
    expect(typeof Button).toBe("object");
    expect(typeof IconButton).toBe("object");
    expect(typeof ToggleButton).toBe("object");
  });

  it("exports TextInput", () => {
    expect(typeof TextInput).toBe("object");
  });

  it("exports Select", () => {
    expect(typeof Select).toBe("object");
  });

  it("exports Slider", () => {
    expect(typeof Slider).toBe("object");
  });
});
