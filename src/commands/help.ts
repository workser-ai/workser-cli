/**
 * `workser help [topic]` — the guides, served by the CLI that implements them.
 *
 * These used to be markdown copied into every app folder at creation time. Two
 * things were wrong with that. They froze: the writer never overwrites, so an app
 * made today keeps today's docs through every later CLI release. And they drifted
 * from the implementation — `business`, `image` and `doctor` shipped documented
 * nowhere, in a file whose whole job was listing the commands.
 *
 * Serving them from here fixes both: one copy, versioned with the binary that
 * ships it, and `test/help.test.ts` fails if a registered command is covered by
 * no topic. The content is inlined at build time (see `scripts/build-help.mjs`)
 * because the desktop installs this CLI as a single file with no `skills/` beside
 * it.
 *
 * What stays a file in the app folder is `SKILL.md` — the index. An agent can't
 * run `workser help` to discover a CLI it has never heard of; that is exactly the
 * bug where it reached for `curl` instead.
 */
import type { Command } from "commander";
import pc from "picocolors";
import { HELP_TOPICS, type HelpTopic } from "../help-content.js";
import { ok, line, isJson } from "../output.js";
import { WorkserError } from "../errors.js";

function findTopic(name: string): HelpTopic | undefined {
  const wanted = name.trim().toLowerCase();
  return (
    HELP_TOPICS.find((t) => t.topic === wanted) ??
    // A command name is what an agent reaches for first — `workser help db`
    // should not be a dead end just because the topic is called "database".
    HELP_TOPICS.find((t) => t.commands.includes(wanted))
  );
}

function listTopics(): void {
  ok(
    HELP_TOPICS.map((t) => ({
      topic: t.topic,
      title: t.title,
      summary: t.summary,
      commands: t.commands,
    })),
    () => {
      line(pc.bold("Guides") + pc.dim("  —  workser help <topic>"));
      line();
      const width = Math.max(...HELP_TOPICS.map((t) => t.topic.length));
      for (const t of HELP_TOPICS) {
        line(`  ${pc.cyan(t.topic.padEnd(width))}  ${t.summary}`);
      }
      line();
      line(pc.dim("  workser <command> --help   exact flags, generated from the code"));
    },
  );
}

export function registerHelp(program: Command): void {
  // Commander adds an implicit `help [command]` that would shadow this one. Its
  // job — per-command flags — is still reachable as `workser <command> --help`,
  // and `help <command>` falls through to it below.
  const withHelpCommand = program as Command & {
    helpCommand?: (enable: boolean) => Command;
  };
  withHelpCommand.helpCommand?.(false);

  program
    .command("help [topic]")
    .description("guides for using this CLI (`workser help` lists them)")
    .action((topic?: string) => {
      if (!topic) {
        listTopics();
        return;
      }

      const found = findTopic(topic);
      if (found) {
        // In JSON mode the body is the payload, not decoration — an agent parsing
        // the envelope should get the markdown whole, not reflowed for a terminal.
        ok({ topic: found.topic, title: found.title, content: found.body }, () => {
          process.stdout.write(found.body.endsWith("\n") ? found.body : found.body + "\n");
        });
        return;
      }

      // `help <command>` for a real command with no guide is a reasonable thing to
      // type, and printing Commander's help beats an error about topics.
      const command = program.commands.find(
        (c) => c.name() === topic || c.aliases().includes(topic),
      );
      if (command && !isJson()) {
        command.outputHelp();
        return;
      }

      throw new WorkserError(
        `No guide for "${topic}". Run \`workser help\` to list them` +
          (command ? `, or \`workser ${topic} --help\` for its flags` : "") +
          ".",
        { code: "not_found" },
      );
    });
}
