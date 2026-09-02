import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DaemonStub } from "./daemon-stub.js";
import { runCli } from "./run-cli.js";

/**
 * `workser memory search` — what an agent actually reads back.
 *
 * Search returns two row shapes from a single query, interleaved: a whole
 * memory carries its text on `memory`, a chunk of one carries it on `chunk`.
 * The renderer read `r.memory ?? r.content ?? ""`, so every chunk row printed
 * as a bare id followed by nothing.
 *
 * That is the worst shape this failure can take. The hit is not missing — it
 * is ranked FIRST — and an agent reading the output sees an empty line and
 * concludes the project never recorded the thing. On 2026-09-02 a decision
 * written seconds earlier came back top of the list, blank, and was
 * re-litigated as though it had never been stored.
 *
 * These assertions are on the human-readable output, not `--json`, because
 * that is the branch the bug lived in and the one agents read.
 */
const stub = new DaemonStub();
let home: string;
let work: string;

beforeAll(async () => {
  await stub.start();
  home = mkdtempSync(join(tmpdir(), "workser-home-"));
  work = realpathSync(mkdtempSync(join(tmpdir(), "workser-work-")));
});

afterAll(async () => {
  await stub.stop();
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

const search = () =>
  runCli(["memory", "search", "canvas", "--project", "p_1"], {
    endpoint: stub.endpoint,
    token: "tok_abcdef123456",
    home,
    cwd: work,
  });

describe("memory search renders every row shape", () => {
  it("prints the text of a chunk row", async () => {
    const r = await search();
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(
      "Design on the canvas before rebuilding the phone app.",
    );
  });

  it("still prints the text of a whole-memory row", async () => {
    const r = await search();
    expect(r.stdout).toContain(
      "The homepage uses the Lattice Drive editorial layout.",
    );
  });

  it("falls back to the parent document's title", async () => {
    const r = await search();
    expect(r.stdout).toContain("A decision with no chunk text");
  });

  it("says so rather than printing a bare id", async () => {
    const r = await search();
    // A blank line reads as an empty store; an unreadable row is a fact and
    // should look like one.
    const line = r.stdout
      .split("\n")
      .find((l) => l.includes("emptyrow"))!;
    expect(line).toBeDefined();
    expect(line.replace("emptyrow", "").trim().length).toBeGreaterThan(0);
  });

  it("never emits an id with nothing after it", async () => {
    const r = await search();
    for (const id of ["chunkrow", "wholerow", "titleonly", "emptyrow"]) {
      const line = r.stdout.split("\n").find((l) => l.includes(id));
      expect(line, `no line for ${id}`).toBeDefined();
      expect(
        line!.replace(id, "").trim().length,
        `${id} rendered as a bare id`,
      ).toBeGreaterThan(0);
    }
  });
});
