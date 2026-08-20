import { describe, expect, it } from "vitest";
import {
  diagramKind,
  extractDiagrams,
  hasDiagram,
} from "../src/mermaid-fences.js";

describe("hasDiagram", () => {
  it("is false for nothing and for comments alone", () => {
    expect(hasDiagram("")).toBe(false);
    expect(hasDiagram(null)).toBe(false);
    expect(hasDiagram("  \n\n ")).toBe(false);
    expect(hasDiagram("%% a note")).toBe(false);
  });

  it("is true as soon as there is a real line", () => {
    expect(hasDiagram("%% note\nflowchart LR")).toBe(true);
  });
});

describe("diagramKind", () => {
  it("reads the kind mermaid declares", () => {
    expect(diagramKind("flowchart LR\n a-->b")).toBe("flowchart");
    expect(diagramKind("%% note\n\nsequenceDiagram")).toBe("sequenceDiagram");
  });

  it("is null rather than a wrong label", () => {
    expect(diagramKind("")).toBe(null);
    expect(diagramKind(" --> b")).toBe(null);
  });
});

describe("extractDiagrams", () => {
  it("finds fences and leaves other languages alone", () => {
    const md = [
      "# Architecture",
      "",
      "```mermaid",
      "flowchart LR",
      "  a --> b",
      "```",
      "",
      "```ts",
      "const a = 1;",
      "```",
    ].join("\n");
    expect(extractDiagrams(md)).toEqual(["flowchart LR\n  a --> b"]);
  });

  it("accepts extra info after the language", () => {
    expect(extractDiagrams("```mermaid title=System\ngraph TD\n a\n```")).toEqual([
      "graph TD\n a",
    ]);
  });

  it("does not count an empty fence as a diagram", () => {
    expect(extractDiagrams("```mermaid\n\n```")).toEqual([]);
    expect(extractDiagrams("```mermaid\n%% todo\n```")).toEqual([]);
  });

  it("survives no input and an unterminated fence", () => {
    expect(extractDiagrams(null)).toEqual([]);
    expect(extractDiagrams("```mermaid\ngraph TD")).toEqual([]);
  });
});
