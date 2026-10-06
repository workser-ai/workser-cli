import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { ok, line } from "../output.js";
import { readFileSync } from "node:fs";
import { WorkserError } from "../errors.js";

/**
 * Inside a Workser runner (plan Phase 7), `workser tool` calls the RUN's
 * tools — Workser's own and the project's connected apps — through core-api.
 * Outside one it keeps its old meaning (the computer-use capability router on
 * this machine).
 *
 * Three ways in, first match wins:
 *  1. the runner's loopback broker (`WORKSER_RUNNER_BROKER_URL` + `…_KEY`):
 *     what a job's own commands get. They never see the run token — the
 *     broker adds it;
 *  2. a run token (`WORKSER_RUNNER_TOKEN`, or `WORKSER_RUNNER_TOKEN_FILE`)
 *     with `WORKSER_RUN_ID` + `WORKSER_RUNNER_API`: a person driving a run by
 *     hand, or an older runner;
 *  3. none: today's machine-local tools.
 */
interface RunnerToolContext {
  /** Everything before `/tools`: the broker, or the run's core-api path. */
  base: string;
  /** The Authorization header value. */
  auth: string;
  via: "broker" | "token";
}

export function runnerToolContext(env: NodeJS.ProcessEnv = process.env): RunnerToolContext | null {
  const broker = env.WORKSER_RUNNER_BROKER_URL?.trim().replace(/\/+$/, "");
  const brokerKey = env.WORKSER_RUNNER_BROKER_KEY?.trim();
  if (broker && brokerKey && /^http:\/\/127\.0\.0\.1:\d+$/.test(broker)) {
    return { base: broker, auth: `Bearer ${brokerKey}`, via: "broker" };
  }
  const runId = env.WORKSER_RUN_ID?.trim();
  const api = (env.WORKSER_RUNNER_API ?? env.WORKSER_API_URL ?? "").trim().replace(/\/$/, "");
  let token = env.WORKSER_RUNNER_TOKEN?.trim() ?? "";
  if (!token && env.WORKSER_RUNNER_TOKEN_FILE) {
    try {
      const raw = readFileSync(env.WORKSER_RUNNER_TOKEN_FILE, "utf8");
      token = /WORKSER_RUNNER_TOKEN=(\S+)/.exec(raw)?.[1] ?? raw.trim();
    } catch {
      token = "";
    }
  }
  if (!runId || !api || !token.startsWith("wsrn_")) return null;
  return { base: `${api}/v1/runner/runs/${encodeURIComponent(runId)}`, auth: `Bearer ${token}`, via: "token" };
}

async function runnerCall<T>(ctx: RunnerToolContext, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${ctx.base}${path}`, {
    method,
    headers: {
      authorization: ctx.auth,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const message = data?.message ?? data?.error?.message ?? `The run's tool call failed (${res.status}).`;
    throw new WorkserError(Array.isArray(message) ? message.join("; ") : String(message), { code: "server" });
  }
  return data as T;
}

/**
 * `workser tool` — call the same computer-use capability engine the cloud
 * Bridge agent drives when it controls a user's machine remotely: filesystem,
 * shell, screenshots, mouse/keyboard, clipboard, notifications, and a basic
 * browser. Reused, not reimplemented — the daemon routes this through the
 * SAME capability router + security policy (rate limits, blocked paths/
 * commands), and gates sensitive actions behind an approval prompt in
 * Workser Orbit exactly like other gated actions (env get, deploy --prod).
 *
 *   GET  /v1/tool/list   -> [{ name, description, category, parameters }]
 *   POST /v1/tool/:name  { ...params } -> the tool's result
 *
 * This is a curated subset, not the full capability surface (deeper browser
 * automation, process/window management aren't exposed here yet) — run
 * `workser tool list` to see what's actually available right now.
 */
export function registerTool(program: Command): void {
  const tool = program
    .command("tool")
    .description(
      "Computer-use tools: filesystem, shell, screenshot, input control, clipboard, notifications, basic browser",
    );

  tool
    .command("list")
    .description("List the tools available to you right now")
    .action(
      action(async ({ ctx }) => {
        const run = runnerToolContext();
        if (run) {
          const listed = await runnerCall<{ tools: any[]; ask_before_paying_usd: number }>(run, "GET", "/tools");
          ok(listed, () => {
            for (const t of listed.tools) {
              const flags = [t.side_effect ? "asks first" : null, t.spends ? "spends" : null].filter(Boolean).join(", ");
              line(`  ${t.name}  ${pc.dim(t.description ?? "")}${flags ? pc.yellow(`  (${flags})`) : ""}`);
            }
            line(pc.dim(`Spending over $${listed.ask_before_paying_usd} needs the owner's yes.`));
          });
          return;
        }
        const tools = await api(ctx, "/v1/tool/list");
        ok(tools, () => {
          if (!tools?.length) return line(pc.dim("No tools available."));
          const byCategory = new Map<string, any[]>();
          for (const t of tools) {
            const list = byCategory.get(t.category) ?? [];
            list.push(t);
            byCategory.set(t.category, list);
          }
          for (const [category, items] of byCategory) {
            line(pc.bold(category) + ":");
            for (const t of items) {
              line(`  ${t.name}  ${pc.dim(t.description ?? "")}`);
            }
          }
        });
      }),
    );

  tool
    .command("run <name>")
    .description('Execute one tool, e.g. workser tool run readFile --body \'{"path":"..."}\'')
    .option("--body <args>", "the tool's parameters as a JSON string", "{}")
    .action(
      action(async ({ ctx, args, opts }) => {
        const run = runnerToolContext();
        if (run) {
          const res = await runnerCall(run, "POST", `/tools/${encodeURIComponent(String(args[0]))}`, {
            arguments: JSON.parse(opts.body),
          });
          ok(res, () => line(JSON.stringify(res, null, 2)));
          return;
        }
        const res = await api(ctx, `/v1/tool/${args[0]}`, {
          method: "POST",
          body: JSON.parse(opts.body),
        });
        ok(res, () => line(JSON.stringify(res, null, 2)));
      }),
    );

  tool
    .command("call <name>")
    .description(
      "Inside a Workser runner: call one of the run's tools. A side effect or a big spend answers approval_required; " +
        "call again with --approval / --spend-approval once the owner says yes.",
    )
    .option("--args <json>", "the tool's arguments as JSON", "{}")
    .option("--approval <id>", "the approved permission ask for exactly this call")
    .option("--amount <usd>", "for a spending tool: how much, in dollars")
    .option("--spend-approval <id>", "the approved spend ask, when the amount is over the owner's limit")
    .action(
      action(async ({ args, opts }) => {
        const run = runnerToolContext();
        if (!run) {
          throw new WorkserError(
            "`workser tool call` works inside a Workser runner (WORKSER_RUN_ID, WORKSER_RUNNER_API and the run token). Use `workser tool run` here.",
            { code: "usage" },
          );
        }
        const body: Record<string, unknown> = { arguments: JSON.parse(opts.args) };
        if (opts.approval) body.approval_id = String(opts.approval);
        if (opts.amount !== undefined) body.amount_usd = Number(opts.amount);
        if (opts.spendApproval) body.spend_approval_id = String(opts.spendApproval);
        const res = await runnerCall<any>(run, "POST", `/tools/${encodeURIComponent(String(args[0]))}`, body);
        ok(res, () => {
          if (res?.status === "approval_required") {
            line(pc.yellow(`Waiting for the owner: ${res.message ?? res.kind}`));
            line(pc.dim(`approval id: ${res.approval_id}`));
          } else line(JSON.stringify(res?.result ?? res, null, 2));
        });
      }),
    );
}
