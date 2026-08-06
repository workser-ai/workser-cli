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

/** Top-level command names, read from the CLI's own `--help`. */
function registeredCommands(): string[] {
  const help = execFileSync(process.execPath, [join(ROOT, "dist", "index.js"), "--help"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, NO_COLOR: "1" },
  });
  const commands = help.slice(help.indexOf("\nCommands:"));
  return [...commands.matchAll(/^ {2}(\S+)/gm)].map((m) => m[1]);
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
      expect(topic.body.length, `${topic.source} is too long — split it`).toBeLessThan(6144);
      expect(topic.body.trim().length, `${topic.source} is empty`).toBeGreaterThan(200);
    }
  });
});
