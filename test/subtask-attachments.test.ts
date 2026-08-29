/**
 * What a step should read, as the manager writes it.
 *
 * The pairing is the whole risk here. A note that ends up on the wrong file is
 * worse than no note at all — it reads as fact — so the note travels inside the
 * same operand as the thing it describes, and these pin that it survives every
 * shape a real path or sentence can take.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_REFS,
  labelFor,
  parseRef,
  parseRefs,
} from "../src/subtask-attachments.js";

describe("parseRef", () => {
  it("reads a bare path as a file, and names it by its basename", () => {
    expect(parseRef("/p/docs/design/04-capture-sheet.png")).toEqual({
      type: "file",
      value: "/p/docs/design/04-capture-sheet.png",
      label: "04-capture-sheet.png",
    });
  });

  it("reads http(s) as a url, and names it by its host", () => {
    expect(parseRef("https://www.example.com/spec/v2")).toEqual({
      type: "url",
      value: "https://www.example.com/spec/v2",
      label: "example.com",
    });
  });

  it("keeps the note with the thing it describes", () => {
    // The entire reason this is one flag and not three.
    expect(parseRef("/p/a.png::the blue one the owner approved")).toEqual({
      type: "file",
      value: "/p/a.png",
      label: "a.png",
      note: "the blue one the owner approved",
    });
  });

  it("splits on the FIRST separator, so a sentence may contain another", () => {
    const ref = parseRef("/p/a.png::use this::not the old one");
    expect(ref?.value).toBe("/p/a.png");
    expect(ref?.note).toBe("use this::not the old one");
  });

  it("does not mistake a Windows drive letter for a separator", () => {
    // `C:\...` is why the separator is `::` and not `:`.
    const ref = parseRef("C:\\Users\\ann\\design\\home.png::the home screen");
    expect(ref?.value).toBe("C:\\Users\\ann\\design\\home.png");
    expect(ref?.label).toBe("home.png");
    expect(ref?.note).toBe("the home screen");
  });

  it("caps a note rather than letting it restructure the next brief", () => {
    const ref = parseRef(`/p/a.png::${"x".repeat(900)}`);
    expect(ref?.note?.length).toBe(500);
  });

  it("treats a pointer with no value as a mistake, not as an empty chip", () => {
    expect(parseRef("")).toBeNull();
    expect(parseRef("   ")).toBeNull();
    expect(parseRef("::just a note")).toBeNull();
  });

  it("omits `note` entirely when none was given", () => {
    // Not `note: ""` — an empty string would draw an empty second line.
    expect(parseRef("/p/a.png")).not.toHaveProperty("note");
    expect(parseRef("/p/a.png::   ")).not.toHaveProperty("note");
  });
});

describe("parseRefs", () => {
  it("drops a malformed pointer instead of refusing the whole step", () => {
    // The step is the work; the refs are the brief. Losing one pointer must
    // not lose the step.
    const out = parseRefs(["", "/p/a.png", "   "]);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe("/p/a.png");
  });

  it("files the same thing once, however many times it is named", () => {
    const out = parseRefs(["/p/a.png::first", "/p/a.png::second"]);
    expect(out).toHaveLength(1);
    expect(out[0].note).toBe("first");
  });

  it("keeps the manager's own order and caps the list", () => {
    const many = Array.from({ length: MAX_REFS + 5 }, (_, i) => `/p/${i}.png`);
    const out = parseRefs(many);
    expect(out).toHaveLength(MAX_REFS);
    expect(out[0].value).toBe("/p/0.png");
  });

  it("is empty for a flag that was never given", () => {
    expect(parseRefs(undefined)).toEqual([]);
    expect(parseRefs([])).toEqual([]);
  });
});

describe("labelFor", () => {
  it("never returns the whole value for something long", () => {
    const long = `/p/${"deep/".repeat(20)}file.png`;
    expect(labelFor("file", long)).toBe("file.png");
  });

  it("falls back to the value when a url will not parse", () => {
    expect(labelFor("url", "not a url")).toBe("not a url");
  });
});
