import type { Command } from "commander";
import { existsSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { runTarget, type Context } from "../context.js";
import { ok, line, success } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * `workser artifact` — tell Workser what you produced.
 *
 * Without this, Workser can only GUESS at deliverables: it watches the agent's
 * tool calls and treats any file path it sees as an artifact. That cannot tell
 * a final report from a temp file, and it cannot represent a folder or a
 * deployed app at all, because neither is a file the agent "wrote".
 *
 * Registering explicitly is what makes the task's Deliverables list correct:
 * the right things, with the right kind, opening the right way.
 */
/**
 * What an artifact can be.
 *
 * The first group is a FILE, described by what kind of file it is. The second
 * is a DELIVERABLE, described by what the owner asked for — and those are the
 * ones the task's "Delivered" screen draws as cards, each with its own shape:
 * a report opens a chart, a before/after wipes between two pictures, a
 * document splits what changed from how it works.
 *
 * The second group was missing, which meant three of the card shapes the
 * desktop can draw had no way of ever being produced: this list rejected the
 * kind outright, and there was no way to attach the figures a card reads.
 */
const KINDS = [
  "file",
  "folder",
  "app",
  "url",
  "pdf",
  "sheet",
  "pptx",
  "code",
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "other",
  // Deliverable shapes — see above.
  "report",
  "walkthrough",
  "before_after",
  "checks",
  "web_app",
  "service",
  "design",
] as const;

export function registerArtifact(program: Command): void {
  const artifact = program
    .command("artifact")
    .description("Record the files, folders and apps this task produced");

  artifact
    .command("add [path]")
    .description("Register a deliverable so it shows on the task")
    .option(
      "-k, --kind <kind>",
      `what it is: ${KINDS.join(" | ")} (default: inferred from the path)`,
    )
    .option("-t, --title <title>", "display name (default: the file name)")
    .option("-d, --description <text>", "one line on what it is / what it's for")
    .option("-u, --url <url>", "a hosted deliverable (deployed app, public file)")
    .option(
      "--data <json>",
      "figures the card shows, as JSON — e.g. '{\"passed\":12,\"total\":12}'",
    )
    .option(
      "--promote",
      "hand it straight to the task as one of the things the owner asked for",
    )
    .action(
      action(async ({ ctx, opts, args }) => {
        const rawPath = args[0] as string | undefined;
        const url = opts.url as string | undefined;

        if (!rawPath && !url) {
          throw new WorkserError(
            "Give a path or --url. e.g. `workser artifact add ./report.pdf`",
            { code: "bad_request" },
          );
        }

        let absPath: string | undefined;
        let kind = opts.kind as string | undefined;

        if (rawPath) {
          absPath = resolve(ctx.cwd, rawPath);
          // Registering something that isn't there produces a deliverable the
          // user clicks and nothing happens. Fail here instead, where the
          // agent can still do something about it.
          if (!existsSync(absPath)) {
            throw new WorkserError(
              `Nothing at ${absPath}. Register the file after you've written it.`,
              { code: "not_found" },
            );
          }
          // The one thing we can determine better than the daemon can: whether
          // this path is a directory. An extensionless file and a folder look
          // identical in a string.
          if (!kind) {
            kind = statSync(absPath).isDirectory() ? "folder" : undefined;
          }
        }

        if (kind && !KINDS.includes(kind as (typeof KINDS)[number])) {
          throw new WorkserError(
            `Unknown --kind "${kind}". Use one of: ${KINDS.join(", ")}.`,
            { code: "bad_request" },
          );
        }

        // Parsed here rather than forwarded as a string, so a typo fails at
        // the keyboard with the reason. Sent on as an object, it would reach
        // the card as a quoted blob and render as nothing at all — the failure
        // nobody traces back to a missing brace.
        let data: Record<string, unknown> | undefined;
        if (opts.data) {
          try {
            const parsed = JSON.parse(String(opts.data));
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
              throw new Error("not an object");
            }
            data = parsed as Record<string, unknown>;
          } catch (err) {
            throw new WorkserError(
              `--data must be a JSON object. ${
                err instanceof Error ? err.message : String(err)
              }`,
              { code: "bad_request" },
            );
          }
        }

        const res = await api(ctx, `/v1/runs/${runTarget(ctx)}/artifacts`, {
          body: {
            path: absPath,
            url,
            kind,
            title: opts.title || (absPath ? basename(absPath) : url),
            description: opts.description,
            data,
            promote: opts.promote ? true : undefined,
          },
        });

        ok(res, () =>
          success(
            `Recorded ${pc.bold(res?.title ?? "artifact")}${
              res?.kind ? pc.dim(` (${res.kind})`) : ""
            }`,
          ),
        );
      }),
    );

  artifact
    .command("run")
    .description("Show the task/conversation this agent run is attached to")
    .action(
      action(async ({ ctx }) => {
        const res = await api(ctx, `/v1/runs/${runTarget(ctx)}`);
        ok(res, () => printRun(res));
      }),
    );
}

function printRun(run: any): void {
  if (!run) return;
  line(`  run      ${pc.bold(run.runId)}`);
  if (run.taskId) line(`  task     ${run.taskId}`);
  if (run.conversationId) line(`  chat     ${run.conversationId}`);
  if (run.projectId) line(`  project  ${run.projectId}`);
  if (run.cwd) line(`  folder   ${pc.dim(run.cwd)}`);
}

export type { Context };
