import type { Command } from "commander";
import pc from "picocolors";
import { readFileSync } from "node:fs";

import { action } from "../run.js";
import { api } from "../client.js";
import { ok, line } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * `workser analysis` — run Python against this project's data, on this machine.
 *
 * WHY NOT JUST RUN `python`. Two reasons, and the second is the important one.
 * It runs inside the same OS sandbox a structured agent run gets, scoped to the
 * app's folder. And it is RECORDED: the code, the output and how long it took
 * land in the task, where the owner can see them. An analysis nobody can see is
 * an assertion, which is the same problem `workser api call` solves for a
 * service with no screen.
 *
 * The long-running work lives here rather than in a deployed function on
 * purpose — see the desktop's `python-sandbox.ts`. `maxDuration` is for a slow
 * request; an analysis is not a request.
 */
interface AnalysisResult {
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  sandboxed: boolean;
  summary?: string;
  error?: string;
}

interface RuntimeReport {
  python: string;
  available: boolean;
  version: string | null;
  libraries: { name: string; present: boolean }[];
  sandboxed: boolean;
  notes: string[];
}

export function registerAnalysis(program: Command): void {
  const cmd = program
    .command("analysis")
    .description("Run Python analysis locally, recorded in the task");

  cmd
    .command("runtime")
    .description("Is Python here, and does it have what an analysis needs?")
    .option("--app <webAppId>", "check the interpreter this app would use")
    .action(
      action(async ({ ctx, opts }) => {
        const path = opts.app
          ? `/v1/apps/${encodeURIComponent(String(opts.app))}/analysis/runtime`
          : "/v1/analysis/runtime";
        const res = await api<RuntimeReport>(ctx, path);
        ok(res, () => {
          line(
            `${res?.available ? pc.green("python") : pc.red("python")}  ${res?.version ?? "not found"}  ${pc.dim(res?.python ?? "")}`,
          );
          for (const lib of res?.libraries ?? []) {
            line(
              `${lib.present ? pc.green(lib.name) : pc.yellow(lib.name)}${pc.dim(lib.present ? "" : "  missing")}`,
            );
          }
          for (const note of res?.notes ?? []) line(pc.dim(note));
        });
        if (!res?.available) process.exitCode = 1;
      }),
    );

  cmd
    .command("run")
    .description(
      "workser analysis run --app <id> --file report.py   (or --code '<python>')",
    )
    .requiredOption("--app <webAppId>", "the app whose folder the script runs in")
    .option("--file <path>", "a Python file to run")
    .option("--code <python>", "the script itself, for something short")
    .option("--timeout <ms>", "how long to allow, capped at 15 minutes")
    .action(
      action(async ({ ctx, opts }) => {
        const code = readCode(opts.file, opts.code);
        const res = await api<AnalysisResult>(
          ctx,
          `/v1/apps/${encodeURIComponent(String(opts.app))}/analysis/run`,
          {
            body: {
              code,
              timeoutMs: opts.timeout ? Number(opts.timeout) : undefined,
            },
          },
        );

        ok(res, () => {
          // The script's own output first — it is what the analysis is FOR, and
          // burying it under a status line is how a useful number gets missed.
          if (res?.stdout) line(res.stdout.replace(/\n$/, ""));
          if (res?.stderr) line(pc.dim(res.stderr.replace(/\n$/, "")));
          if (res?.truncated) line(pc.dim("(output truncated)"));
          const took = `${Math.round((res?.durationMs ?? 0) / 100) / 10}s`;
          line(
            res?.ok
              ? pc.green(`✓ ${res.summary ?? "It finished."}`) + pc.dim(`  ${took}`)
              : pc.yellow(res?.summary ?? "It did not finish.") + pc.dim(`  ${took}`),
          );
          if (res && !res.sandboxed) {
            line(
              pc.dim(
                "This platform has no OS sandbox, so the script ran with your own file access.",
              ),
            );
          }
        });

        if (!res?.ok) process.exitCode = 1;
      }),
    );
}

function readCode(file: unknown, inline: unknown): string {
  if (typeof inline === "string" && inline.trim()) return inline;
  if (typeof file === "string" && file.trim()) {
    try {
      return readFileSync(file, "utf8");
    } catch (err) {
      throw new WorkserError(
        `Could not read ${file}: ${err instanceof Error ? err.message : String(err)}`,
        { code: "bad_request" },
      );
    }
  }
  throw new WorkserError("Pass --file <path> or --code '<python>'.", {
    code: "bad_request",
  });
}
