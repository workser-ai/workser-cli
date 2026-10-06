/**
 * `workser runner` and `workser run` — run a Workser job on this machine
 * (plan Phase 4, runner protocol v1).
 *
 *   workser run <runId> --start [--workdir .] [--place desktop]
 *       Hand the run to a runner here: core-api mints the run's token
 *       (POST /v1/runs/:id/runner), `workser-runner` starts with it in its
 *       environment, and this command follows the run's live stream.
 *
 *   workser run <runId> --token-file ./run.token
 *       Hand the run to a runner elsewhere (a sandbox, a cloud computer):
 *       the token is written to a file only you can read, for that machine's
 *       `WORKSER_RUNNER_TOKEN`.
 *
 *   workser runner --run <runId> [--workdir …]
 *       Start `workser-runner` directly (the token is already in
 *       WORKSER_RUNNER_TOKEN).
 *
 * THE TOKEN IS NEVER PRINTED — not in text output, not in `--json`. It goes
 * into a child's environment or a 0600 file, and nowhere else. It talks to
 * core-api directly, so it needs cloud mode (an API key), not the daemon.
 */
import type { Command } from "commander";
import { spawn } from "node:child_process";
import { writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { action } from "../run.js";
import { api, sleep } from "../client.js";
import { ok, line, info, isJson } from "../output.js";
import type { Context } from "../context.js";
import { WorkserError } from "../errors.js";

const PLACES = new Set(["desktop", "sandbox", "cloud_computer"]);
const LANES = new Set(["workbench", "computer", "service"]);
const TERMINAL = new Set(["run.completed", "run.failed", "run.cancelled"]);

interface AttachResult {
  run_id: string;
  token: string;
  expires_at: string;
  protocol: number;
}

/** The runner program: `WORKSER_RUNNER_BIN`, else `workser-runner` on PATH. */
export function runnerBin(env: NodeJS.ProcessEnv = process.env): string {
  return env.WORKSER_RUNNER_BIN || "workser-runner";
}

/** One line for a run event, the way a person reads it. */
export function describeEvent(frame: { type?: string; data?: Record<string, any> }): string | null {
  const d = frame.data ?? {};
  switch (frame.type) {
    case "run.started":
      return `${pc.cyan("started")} ${d.engine ?? ""}${d.place ? ` on ${d.place}` : ""}`.trim();
    case "step.started":
      return `${pc.dim("→")} ${d.title ?? d.tool ?? "step"}`;
    case "step.completed":
      return d.status === "ok" ? null : `${pc.red("✗")} ${d.error ?? "step failed"}`;
    case "message":
      return d.role === "assistant" ? String(d.text ?? "") : null;
    case "check.result":
      return `${d.status === "pass" ? pc.green("✓") : d.status === "fail" ? pc.red("✗") : pc.dim("–")} ${d.name}`;
    case "diff.ready":
      return pc.dim(`${d.files} file(s) changed, +${d.additions ?? 0} −${d.deletions ?? 0}`);
    case "preview.ready":
      return `preview ${d.url}`;
    case "ask.raised":
      return pc.yellow(`needs you: ${d.title ?? "a question"} — answer it in Workser`);
    case "run.completed":
      return `${pc.green("done")}${d.summary ? `\n${d.summary}` : ""}`;
    case "run.failed":
      return `${pc.red("failed")} ${d.message ?? d.error_kind ?? ""}`.trim();
    case "run.cancelled":
      return `${pc.yellow("stopped")} ${d.reason ?? ""}`.trim();
    default:
      return null;
  }
}

function requireCloud(ctx: Context): void {
  if (ctx.mode !== "cloud" || !ctx.token) {
    throw new WorkserError(
      "`workser run` talks to Workser directly. Use an API key: --endpoint https://api.workser.ai --token <key>, or `workser login` for cloud.",
      { code: "cloud_required" },
    );
  }
}

/** Follow `GET /v1/runs/:id/events` until the run ends, resuming by position. */
async function follow(ctx: Context, runId: string, json: boolean): Promise<string | null> {
  let after = 0;
  let ended: string | null = null;
  for (let attempt = 0; attempt < 20 && !ended; attempt += 1) {
    try {
      const res = await fetch(`${ctx.endpoint}/v1/runs/${encodeURIComponent(runId)}/events?after=${after}`, {
        headers: { accept: "text/event-stream", authorization: `Bearer ${ctx.token}`, "user-agent": "workser-cli" },
      });
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new WorkserError(`Can't follow run ${runId} (${res.status}).`, { code: "http_error", status: res.status });
      }
      if (!res.ok || !res.body) throw new Error(`stream answered ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const blocks = buffered.split("\n\n");
        buffered = blocks.pop() ?? "";
        for (const block of blocks) {
          const data = block
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("");
          if (!data) continue;
          let frame: { type?: string; pos?: number; data?: Record<string, any> };
          try {
            frame = JSON.parse(data);
          } catch {
            continue;
          }
          if (typeof frame.pos === "number") {
            if (frame.pos <= after) continue;
            after = frame.pos;
          }
          if (!frame.type) continue;
          if (json) process.stdout.write(`${JSON.stringify(frame)}\n`);
          else {
            const text = describeEvent(frame);
            if (text) line(text);
          }
          if (TERMINAL.has(frame.type)) ended = frame.type;
        }
        if (ended) break;
      }
    } catch (e) {
      if (e instanceof WorkserError) throw e;
      await sleep(Math.min(1000 * (attempt + 1), 10_000));
    }
  }
  return ended;
}

export function registerRunner(program: Command): void {
  program
    .command("run [runId]")
    .description(
      "Hand a Workser run to a runner (here with --start, or elsewhere with --token-file) and follow it live. " +
        "With --agent and --prompt instead of a run id, create the run for the runner first.",
    )
    .option("--agent <agentId>", "create a new run of this agent for the runner (instead of naming a run)")
    .option("--prompt <text>", "what the new run should do (with --agent)")
    .option("--start", "start `workser-runner` here with the run's token")
    .option("--token-file <path>", "write the run's token to this file (mode 0600) for a runner elsewhere")
    .option("--workdir <dir>", "the folder the job works in (with --start)", ".")
    .option("--place <place>", "desktop | sandbox | cloud_computer", "desktop")
    .option("--lane <lane>", "workbench | computer | service", "workbench")
    .option("--no-follow", "don't follow the run's live stream")
    .action(
      action(async ({ ctx, opts, args }) => {
        requireCloud(ctx);
        if (!args[0] && !(opts.agent && opts.prompt)) {
          throw new WorkserError("Name a run, or pass --agent <id> --prompt <text> to create one.", { code: "usage" });
        }
        if (!opts.start && !opts.tokenFile) {
          throw new WorkserError("Pass --start (run it here) or --token-file <path> (run it elsewhere). The token is never printed.", {
            code: "usage",
          });
        }
        if (!PLACES.has(opts.place)) throw new WorkserError(`--place must be one of ${[...PLACES].join(", ")}.`, { code: "usage" });
        if (!LANES.has(opts.lane)) throw new WorkserError(`--lane must be one of ${[...LANES].join(", ")}.`, { code: "usage" });

        // A new run is created for the runner in one call (not queued on
        // Workser's workers); an existing one is attached. Either way the token
        // arrives once, here, and is never printed.
        let runId: string;
        let attached: AttachResult;
        if (args[0]) {
          runId = String(args[0]);
          attached = await api<AttachResult>(ctx, `/v1/runs/${encodeURIComponent(runId)}/runner`, {
            method: "POST",
            body: { place: opts.place, lane: opts.lane },
          });
        } else {
          const created = await api<{ id: string; runner?: AttachResult }>(
            ctx,
            `/v1/agents/${encodeURIComponent(String(opts.agent))}/runs`,
            {
              method: "POST",
              body: { input: { prompt: String(opts.prompt) }, runner: { place: opts.place, lane: opts.lane } },
            },
          );
          if (!created.runner?.token) {
            throw new WorkserError("Workser created the run but sent no runner token. Is core-api up to date?", {
              code: "server",
            });
          }
          runId = created.id;
          attached = created.runner;
        }
        const token = attached.token;
        const expires = attached.expires_at;

        if (opts.tokenFile) {
          const file = resolve(String(opts.tokenFile));
          writeFileSync(file, `WORKSER_RUNNER_TOKEN=${token}\nWORKSER_RUNNER_TOKEN_EXPIRES_AT=${expires}\n`, { mode: 0o600 });
          chmodSync(file, 0o600);
          if (!opts.start) {
            ok({ run_id: runId, token_file: file, expires_at: expires }, () =>
              info(`Token for run ${runId} written to ${file} (only you can read it). It expires ${expires}.`),
            );
          }
        }

        let child: ReturnType<typeof spawn> | null = null;
        if (opts.start) {
          child = spawn(runnerBin(), ["--run", runId, "--api", ctx.endpoint, "--workdir", resolve(String(opts.workdir))], {
            env: { ...process.env, WORKSER_RUNNER_TOKEN: token, WORKSER_RUNNER_TOKEN_EXPIRES_AT: expires },
            stdio: ["ignore", "inherit", "inherit"],
          });
          child.on("error", (error) => {
            process.stderr.write(
              `Could not start ${runnerBin()}: ${error.message}. Install @workser/runner or set WORKSER_RUNNER_BIN.\n`,
            );
          });
          process.on("SIGINT", () => child?.kill("SIGTERM"));
          process.on("SIGTERM", () => child?.kill("SIGTERM"));
        }

        if (opts.follow !== false) {
          const ended = await follow(ctx, runId, isJson());
          if (ended === "run.failed") process.exitCode = 1;
        }
        if (child) {
          const code = await new Promise<number | null>((done) => {
            if (child!.exitCode !== null) done(child!.exitCode);
            else child!.once("exit", done);
          });
          if (code && !process.exitCode) process.exitCode = code;
        }
      }),
    );

  program
    .command("runner")
    .description("Start workser-runner here (the run token must already be in WORKSER_RUNNER_TOKEN)")
    .allowUnknownOption(true)
    .helpOption(false)
    .argument("[args...]", "passed to workser-runner, e.g. --run <id> --workdir .")
    .action(async (passthrough: string[] = []) => {
      if (passthrough.includes("--token")) {
        process.stderr.write("Pass the run token as WORKSER_RUNNER_TOKEN, never on the command line.\n");
        process.exitCode = 2;
        return;
      }
      const child = spawn(runnerBin(), passthrough, { stdio: "inherit", env: process.env });
      child.on("error", (error) => {
        process.stderr.write(`Could not start ${runnerBin()}: ${error.message}. Install @workser/runner or set WORKSER_RUNNER_BIN.\n`);
        process.exitCode = 127;
      });
      const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
      process.on("SIGINT", forward("SIGTERM"));
      process.on("SIGTERM", forward("SIGTERM"));
      const code = await new Promise<number | null>((done) => child.once("exit", done));
      process.exitCode = code ?? 1;
    });
}
