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

        const res = await api(ctx, `/v1/runs/${runTarget(ctx)}/artifacts`, {
          body: {
            path: absPath,
            url,
            kind,
            title: opts.title || (absPath ? basename(absPath) : url),
            description: opts.description,
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
