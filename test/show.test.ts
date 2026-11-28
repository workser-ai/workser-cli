import { describe, expect, it } from "vitest";
import { readShowArgs } from "../src/commands/show.js";

/** `workser show app <id> [section]`: what is sent to the run, or the plain error the agent reads. */
describe("workser show: command parsing", () => {
  it("an app on Preview by default", () => {
    expect(readShowArgs("app", "a1b2-c3", undefined)).toEqual({ kind: "app", id: "a1b2-c3", section: "preview" });
  });

  it("each section, and the words an agent may use for one", () => {
    expect(readShowArgs("app", "x", "code").section).toBe("code");
    expect(readShowArgs("app", "x", "Cloud").section).toBe("cloud");
    expect(readShowArgs("app", "x", "files").section).toBe("code");
    expect(readShowArgs("app", "x", "database").section).toBe("cloud");
    expect(readShowArgs("APP", " x ", " preview ").id).toBe("x");
  });

  it("refuses anything but an app", () => {
    expect(() => readShowArgs("file", "x", undefined)).toThrow(/can show an app/);
  });

  it("refuses a missing or odd id", () => {
    expect(() => readShowArgs("app", "", undefined)).toThrow(/Say which app/);
    expect(() => readShowArgs("app", "../etc/passwd", undefined)).toThrow(/isn't an app id/);
  });

  it("refuses an unknown section with the ones there are", () => {
    expect(() => readShowArgs("app", "x", "design")).toThrow(/preview, code, cloud/);
  });
});
