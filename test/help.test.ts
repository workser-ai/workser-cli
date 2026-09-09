/**
 * `workser help` — and the check that keeps it honest.
 *
 * The guides live here because copies in an app folder froze at creation time and
 * drifted from the implementation: `business`, `image` and `doctor` were all
 * registered commands documented nowhere, in a file whose job was listing the
 * commands. "Every command is covered by a topic or by the index" is the test that
 * would have caught that, so it is the one that matters most in this file.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HELP_TOPICS } from "../src/help-content.js";
import { runCli } from "./run-cli.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * How long a guide may be before it stops being one sitting's reading.
 *
 * Not a style rule. A topic is loaded whole into an agent's context the moment
 * it asks for it, so a guide that sprawls is paid for on every call — and a
 * reader that skims a wall of text is the reason a documented flag still gets
 * guessed at.
 */
const GUIDE_LIMIT = 6144;

/**
 * The guides allowed past it, and why — never a blanket raise.
 *
 * Lifting `GUIDE_LIMIT` for everybody is the tempting fix and the wrong one:
 * it buys one guide its exception by giving twenty-six others room to sprawl
 * unnoticed, which is the drift this file exists to catch. An entry here is a
 * deliberate, argued exception; the ceiling for everything else does not move.
 *
 * `agent-cloud` is one topic because it is one decision. Splitting it is not a
 * formatting change — it means an agent that reads "how to create an agent"
 * without reading "publish or nothing takes effect", "this needs a paid plan",
 * or "propose Agent Cloud before the four fallbacks". Those are the parts that
 * are load-bearing, and they are the parts a second file gets read without.
 * The media half was already split out (`agent-cloud-media.md`), which is the
 * one cut that could be made without breaking the decision in half.
 */
const LONG_GUIDES: Record<string, number> = {
  "skills/workser/reference/agent-cloud.md": 9216,
};

/** Top-level command names, read from the CLI's own `--help`. */
function registeredCommands(): string[] {
  const help = execFileSync(process.execPath, [join(ROOT, "dist", "index.js"), "--help"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, NO_COLOR: "1" },
  });
  const commands = help.slice(help.indexOf("\nCommands:"));
  // Commander prints an aliased command as `agent|team`. Both words are things a
  // caller can actually type, so both count as registered — otherwise adding an
  // alias would report the real command as unregistered and its alias as
  // undocumented, in the same run.
  return [...commands.matchAll(/^ {2}(\S+)/gm)].flatMap((m) => m[1].split("|"));
}

describe("workser help", () => {
  it("lists every topic, and works from a directory with no node_modules", async () => {
    // The desktop copies dist/index.js alone to ~/.workser/bin/workser. If the
    // guides were read from `skills/` rather than bundled, this is where it breaks.
    const r = await runCli(["--json", "help"], { cwd: "/tmp" });
    expect(r.code).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(r.json.data.map((t: { topic: string }) => t.topic).sort()).toEqual(
      HELP_TOPICS.map((t) => t.topic).slice().sort(),
    );
  });

  it("prints a topic as markdown, and as content in JSON mode", async () => {
    const text = await runCli(["help", "database"], { cwd: "/tmp" });
    expect(text.code).toBe(0);
    expect(text.stdout).toContain("# Database & end users");
    expect(text.stdout).toContain("workser db create");
    // The frontmatter is routing metadata; an agent should not have to read past it.
    expect(text.stdout).not.toContain("topic: database");

    const json = await runCli(["--json", "help", "database"], { cwd: "/tmp" });
    expect(json.json.ok).toBe(true);
    expect(json.json.data.topic).toBe("database");
    expect(json.json.data.content).toContain("workser db create");
  });

  it("accepts a command name, not just a topic name", async () => {
    // `workser help db` is what an agent types first. A dead end there sends it
    // back to guessing, which is the behaviour this whole thing exists to stop.
    const r = await runCli(["--json", "help", "db"], { cwd: "/tmp" });
    expect(r.code).toBe(0);
    expect(r.json.data.topic).toBe("database");
  });

  it("falls back to command help for a command with no guide", async () => {
    const r = await runCli(["help", "login"], { cwd: "/tmp" });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Usage: workser login");
  });

  it("fails clearly on an unknown topic", async () => {
    const r = await runCli(["--json", "help", "nonsense"], { cwd: "/tmp" });
    expect(r.code).not.toBe(0);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.message).toContain("workser help");
  });

  it("every registered command is covered by a topic or by the index", () => {
    const documented = new Set(HELP_TOPICS.flatMap((t) => t.commands));
    const skill = readFileSync(join(ROOT, "skills", "workser", "SKILL.md"), "utf8");

    const uncovered = registeredCommands().filter(
      (name) => !documented.has(name) && !skill.includes(`workser ${name}`),
    );

    expect(
      uncovered,
      `these commands are documented nowhere — add a topic in skills/workser/reference/, ` +
        `or a line to SKILL.md if it is orientation-level`,
    ).toEqual([]);
  });

  it("every documented command actually exists", () => {
    // The other direction: a topic promising `workser frobnicate` sends the agent
    // to a command that isn't there.
    const registered = new Set(registeredCommands());
    for (const topic of HELP_TOPICS) {
      for (const command of topic.commands) {
        expect(registered, `${topic.source} documents "${command}"`).toContain(command);
      }
    }
  });

  it("the generated content is not stale", () => {
    // Guides are edited as markdown; the bundle reads the generated TS. Forgetting
    // the regen ships a build whose docs silently predate the edit.
    expect(() =>
      execFileSync(process.execPath, [join(ROOT, "scripts", "build-help.mjs"), "--check"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("each guide stays readable in one go", () => {
    for (const topic of HELP_TOPICS) {
      const limit = LONG_GUIDES[topic.source] ?? GUIDE_LIMIT;
      expect(topic.body.length, `${topic.source} is too long — split it`).toBeLessThan(limit);
      expect(topic.body.trim().length, `${topic.source} is empty`).toBeGreaterThan(200);
    }
  });
});
