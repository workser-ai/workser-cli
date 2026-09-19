/**
 * WCOMP-050 — `workser computer` as a machine-readable client of the Workser
 * Computer run protocol.
 *
 * A thin client over the daemon's `/v1/computer/*` routes (migration doc 07 —
 * request/response shapes belong to the host; this module invents none): local
 * status, run control, artifacts, routines and watches. Transport selection is
 * the CLI's existing one — the local Orbit daemon socket when present, else the
 * authenticated Core endpoint for cloud runs — and the CLI never guesses an
 * owner: whatever the start response names is what later calls address.
 *
 * Every subcommand answers the global `--json` with a stable `{ok, data}`
 * envelope, and status survives a CLI restart because a run's state lives in
 * the host, not in this process (`computer status`, `computer show` re-read
 * it). `computer run` returns a run id unless `--wait`, which streams the
 * host's ServerEvent feed until the run is done, failed, stopped — or blocked
 * on the user (needs_user), which the caller answers with `computer confirm`.
 */
import type { Command } from "commander";
import * as http from "node:http";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { ok, line } from "../output.js";
import { WorkserError } from "../errors.js";
import type { Context } from "../context.js";

const MODES = ["auto", "interactive", "background", "cloud"] as const;
const TERMINAL = new Set(["done", "failed", "stopped"]);

interface StartResult {
  conversationId?: string;
  messageId?: string;
  runId?: string;
}

interface WaitResult {
  runId?: string;
  conversationId?: string;
  status: "started" | "running" | "needs_user" | "done" | "failed" | "stopped";
  summary?: string;
  confirm?: PendingConfirmShape;
}

interface PendingConfirmShape {
  id: string;
  runId?: string;
  question?: string;
  kind?: string;
  choices?: string[];
}

// ── start ───────────────────────────────────────────────────────────────────

async function startRun(
  ctx: Context,
  text: string,
  mode: string,
  conversationId: string | undefined,
): Promise<StartResult> {
  if (mode === "background" || mode === "cloud") {
    const message = (await api(ctx, "/v1/computer/background", {
      body: { text, ...(conversationId && { conversationId }) },
    })) as { conversationId?: string; runId?: string; id?: string };
    return {
      conversationId: message?.conversationId,
      messageId: message?.id,
      runId: message?.runId,
    };
  }
  const conversation =
    conversationId ??
    ((await api(ctx, "/v1/computer/conversations", {
      body: { title: text.replace(/\s+/g, " ").slice(0, 60) },
    })) as { id?: string })?.id;
  if (!conversation) {
    throw new WorkserError("The host did not return a conversation id.", {
      code: "bad_response",
    });
  }
  // `interactive` and `auto` both ride the foreground conversation. Which
  // brain carries the message out is the host's decision (AgentMode), not the
  // CLI's — the request only asks.
  const message = (await api(
    ctx,
    `/v1/computer/conversations/${encodeURIComponent(conversation)}/messages`,
    { body: { text, mode: "auto" } },
  )) as { conversationId?: string; id?: string; runId?: string };
  return {
    conversationId: message?.conversationId ?? conversation,
    messageId: message?.id,
    runId: message?.runId,
  };
}

// ── the host's live event feed, CLI half ────────────────────────────────────

/**
 * Which events belong to the run we started: the host identifies a run by
 * message and id, and either is enough to follow it. A confirm event matches
 * the moment it names our runId — that is the run asking the user.
 */
function isOurRun(event: any, start: StartResult): boolean {
  if (event?.type === "run" && event.run) {
    if (start.messageId && event.run.messageId === start.messageId) return true;
    if (start.runId && event.run.id === start.runId) return true;
    if (!start.messageId && !start.runId && event.run.conversationId === start.conversationId) return true;
  }
  return false;
}

/**
 * One pass over `GET /v1/computer/events` (SSE), until `done` resolves or the
 * timeout fires. Nothing is stored: the host owns run state, so anything a
 * caller needs after the fact it re-reads (`show`, `status`).
 */
function streamEvents(
  ctx: Context,
  onEvent: (event: any) => void,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let settled = false;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };

    // One SSE block per event. Chunks can split a block, so callers hand in
    // only complete ones and keep the tail.
    const parseBlock = (block: string) => {
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data) return;
      try {
        onEvent(JSON.parse(data));
      } catch {
        /* a malformed line is not a reason to kill the stream */
      }
    };

    if (ctx.socketPath) {
      const req = http.request(
        {
          socketPath: ctx.socketPath,
          path: "/v1/computer/events",
          method: "GET",
          headers: { accept: "text/event-stream", "user-agent": "workser-cli" },
        },
        (res) => {
          if ((res.statusCode ?? 500) >= 300) {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (c) => (body += c));
            res.on("end", () =>
              finish(
                new WorkserError(errorText(body, res.statusMessage ?? ""), {
                  code: "http_error",
                  status: res.statusCode,
                }),
              ),
            );
            return;
          }
          res.setEncoding("utf8");
          let buffered = "";
          res.on("data", (chunk: string) => {
            buffered += chunk;
            const blocks = buffered.split("\n\n");
            buffered = blocks.pop() ?? "";
            for (const block of blocks) parseBlock(block);
          });
          res.on("end", () => finish());
          res.on("error", finish);
        },
      );
      req.on("error", finish);
      req.end();
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`${ctx.endpoint}/v1/computer/events`, {
          method: "GET",
          headers: { accept: "text/event-stream", "user-agent": "workser-cli" },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          finish(
            new WorkserError(errorText(text, res.statusText), {
              code: "http_error",
              status: res.status,
            }),
          );
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffered += decoder.decode(value, { stream: true });
          const blocks = buffered.split("\n\n");
          buffered = blocks.pop() ?? "";
          for (const block of blocks) parseBlock(block);
        }
        finish();
      } catch (e) {
        finish(e);
      }
    })();
  });
}

function errorText(body: string, statusText: string): string {
  if (!body) return statusText || "The Workser Computer host refused the request.";
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message ?? parsed?.message ?? parsed?.error ?? body;
  } catch {
    return body;
  }
}

async function waitForRun(
  ctx: Context,
  start: StartResult,
  timeoutMs: number,
): Promise<WaitResult> {
  let runId = start.runId;
  let conversationId = start.conversationId;
  let summary: string | undefined;
  let confirm: PendingConfirmShape | undefined;
  let status: WaitResult["status"] = "started";

  await streamEvents(
    ctx,
    (event) => {
      if (event?.type === "run" && isOurRun(event, start)) {
        runId = event.run.id ?? runId;
        conversationId = event.run.conversationId ?? conversationId;
        summary = event.run.summary ?? summary;
        const next = String(event.run.status ?? "running");
        if (TERMINAL.has(next)) {
          status = next as WaitResult["status"];
          start.runId = runId; // confirms that follow must still match
        }
      }
      if (event?.type === "confirm" && event.confirm && runId && event.confirm.runId === runId) {
        confirm = event.confirm;
        status = "needs_user";
      }
    },
    timeoutMs,
  ).catch(() => {
    /* a dropped stream ends the wait; the envelope still says what is known */
  });

  return { runId, conversationId, status, summary, confirm };
}

// ── human output ────────────────────────────────────────────────────────────

function printStatus(status: any): void {
  if (!status) return;
  const active = status.activeRun;
  if (active) {
    line(`  run      ${pc.bold(active.id)}${active.paused ? pc.yellow(" (paused)") : ""}`);
    line(`  task     ${active.task}`);
    line(pc.dim(`  chat     ${active.conversationId}`));
  } else {
    line(pc.dim("No run is active."));
  }
  for (const bg of status.background ?? []) {
    line(pc.dim(`  background  ${bg.id}  ${bg.task}`));
  }
  const confirm = status.pendingConfirm;
  if (confirm) {
    line(pc.yellow(`  needs user  ${confirm.id}`));
    if (confirm.question) line(pc.dim(`  ${confirm.question}`));
    if (confirm.choices?.length) {
      line(pc.dim(`  choices: ${confirm.choices.join(" | ")}`));
    }
  }
}

function printConversations(rows: any[]): void {
  if (!rows?.length) {
    line(pc.dim("No conversations yet."));
    return;
  }
  for (const c of rows) {
    line(`${pc.bold(c.id)}  ${c.title ?? ""}${pc.dim(`  ${c.messageCount ?? 0} msgs`)}`);
  }
}

function printArtifacts(rows: any[]): void {
  if (!rows?.length) {
    line(pc.dim("No artifacts."));
    return;
  }
  for (const a of rows) {
    line(`${pc.bold(a.id)}  ${pc.dim(`[${a.kind}]`)} ${a.title ?? ""}${pc.dim(`  ${a.mime ?? ""}`)}`);
  }
}

function printRoutines(rows: any[]): void {
  if (!rows?.length) {
    line(pc.dim("No routines."));
    return;
  }
  for (const r of rows) {
    line(`${pc.bold(r.id)}  ${r.name ?? ""}${pc.dim(`  ${r.purpose ?? ""}`)}`);
  }
}

// ── the command group ───────────────────────────────────────────────────────

export function registerComputer(program: Command): void {
  const computer = program
    .command("computer")
    .description(
      "Workser Computer: start and steer runs, list/stop them, read artifacts",
    );

  computer
    .command("run <task>")
    .description("Start a run; prints its run id. Add --wait to stream until it ends")
    .option(
      "-m, --mode <mode>",
      `where it runs: ${MODES.join(" | ")} (default: auto)`,
      "auto",
    )
    .option("-c, --conversation <id>", "continue this conversation instead of a new one")
    .option("--wait", "stream events until the run is done, failed, stopped or needs_user")
    .option(
      "--timeout <seconds>",
      "how long --wait watches before giving up (default 300)",
      "300",
    )
    .action(
      action(async ({ ctx, opts, args }) => {
        const mode = String(opts.mode ?? "auto").toLowerCase();
        if (!MODES.includes(mode as (typeof MODES)[number])) {
          throw new WorkserError(
            `Unknown --mode "${mode}". Use one of: ${MODES.join(", ")}.`,
            { code: "bad_request" },
          );
        }
        const start = await startRun(ctx, String(args[0]), mode, opts.conversation);
        if (!opts.wait) {
          // Give the host a moment to name the run — the id arrives as a live
          // event, not in the send reply. Missing it is not a failure: the
          // envelope still carries the conversation, and `computer show`
          // resolves the run from there.
          const result = await waitForRun(ctx, start, 8_000);
          ok(
            {
              conversationId: result.conversationId,
              runId: result.runId,
              status: result.status === "started" ? "started" : result.status,
              mode,
            },
            () => {
              line(`  run      ${pc.bold(result.runId ?? "(pending)")}  ${result.status}`);
              line(pc.dim(`  chat     ${result.conversationId ?? ""}`));
            },
          );
          return;
        }
        const result = await waitForRun(
          ctx,
          start,
          (Number(opts.timeout) || 300) * 1000,
        );
        ok(
          {
            runId: result.runId,
            conversationId: result.conversationId,
            status: result.status,
            ...(result.summary && { summary: result.summary }),
            ...(result.confirm && { confirm: result.confirm }),
          },
          () => {
            line(`  run      ${pc.bold(result.runId ?? "(pending)")}  ${result.status}`);
            if (result.summary) line(pc.dim(`  ${result.summary}`));
            if (result.confirm) {
              line(pc.yellow(`  needs user  ${result.confirm.id}`));
              if (result.confirm.question) line(pc.dim(`  ${result.confirm.question}`));
              if (result.confirm.choices?.length) {
                line(pc.dim(`  choices: ${result.confirm.choices.join(" | ")}`));
              }
            }
          },
        );
        if (result.status === "failed") process.exitCode = 1;
        if (result.status === "needs_user") process.exitCode = 5;
      }),
    );

  computer
    .command("status")
    .description("Is a run active, what runs in the background, what needs you")
    .action(
      action(async ({ ctx }) => {
        const status = await api(ctx, "/v1/computer/status");
        ok(status, () => printStatus(status));
      }),
    );

  computer
    .command("list [what]")
    .description("conversations (default) | runs | routines")
    .option("--query <q>", "search conversations by text")
    .option("--limit <n>", "how many conversations to return (default 30)", "30")
    .action(
      action(async ({ ctx, opts, args }) => {
        const what = String(args[0] ?? "conversations").toLowerCase();
        if (what === "conversations" || what === "chats") {
          const rows = opts.query
            ? await api(ctx, "/v1/computer/conversation-search", {
                query: { q: String(opts.query), limit: Number(opts.limit) || 30 },
              })
            : await api(ctx, "/v1/computer/conversations");
          const items = Array.isArray(rows) ? rows : (rows?.items ?? []);
          ok(items, () => printConversations(items));
          return;
        }
        if (what === "runs") {
          const status = await api(ctx, "/v1/computer/status");
          ok(
            {
              activeRun: status?.activeRun ?? null,
              background: status?.background ?? [],
              pendingConfirm: status?.pendingConfirm ?? null,
            },
            () => printStatus(status),
          );
          return;
        }
        if (what === "routines") {
          const rows = await api(ctx, "/v1/computer/routines");
          ok(rows, () => printRoutines(rows));
          return;
        }
        throw new WorkserError(
          `Unknown list target "${what}". Use conversations, runs or routines.`,
          { code: "bad_request" },
        );
      }),
    );

  computer
    .command("show <conversationId>")
    .description("One conversation's messages, runs and artifacts (works after a CLI restart)")
    .action(
      action(async ({ ctx, args }) => {
        const id = String(args[0]);
        const detail = await api(
          ctx,
          `/v1/computer/conversations/${encodeURIComponent(id)}`,
        );
        ok(detail, () => {
          line(pc.bold(detail?.title ?? id));
          for (const run of detail?.runs ?? []) {
            line(
              `  run      ${pc.bold(run.id)}  ${run.status}` +
                (run.summary ? pc.dim(`  ${run.summary}`) : ""),
            );
          }
          if (detail?.artifacts?.length) printArtifacts(detail.artifacts);
          for (const message of (detail?.messages ?? []).slice(-10)) {
            line(pc.dim(`  ${String(message.content ?? "").slice(0, 120)}`));
          }
        });
      }),
    );

  computer
    .command("stop <runId>")
    .description("Stop a run by id, or the active one with `active` (already-stopped stays ok)")
    .action(
      action(async ({ ctx, args }) => {
        const requested = String(args[0]);
        let runId = requested;
        if (runId === "active") {
          const status = await api(ctx, "/v1/computer/status");
          runId = status?.activeRun?.id ?? "";
          if (!runId) {
            ok({ id: requested, stopped: false }, () => {
              line(pc.dim("No run is active; nothing to stop."));
            });
            return;
          }
        }
        let stopped = false;
        try {
          const res = await api(
            ctx,
            `/v1/computer/runs/${encodeURIComponent(runId)}/stop`,
            { method: "POST", body: {} },
          );
          stopped = (res as any)?.stopped !== false;
        } catch (e) {
          // Idempotent by contract: a run that is already gone reads the same
          // as one we just stopped. Only a real transport failure is an error.
          if ((e as WorkserError).status !== 404) throw e;
        }
        ok({ id: runId, stopped }, () => {
          if (stopped) line(pc.green(`✓ stopped ${runId}`));
          else line(pc.dim(`${runId} is not running; nothing to stop.`));
        });
      }),
    );

  computer
    .command("confirm <confirmId>")
    .description("Answer a confirmation or question a run raised (needs_user)")
    .option("--allow", "allow the step / answer yes")
    .option("--deny", "deny the step")
    .option("--answer <text>", "a free-text answer, for question confirms")
    .action(
      action(async ({ ctx, opts, args }) => {
        const allowed =
          opts.allow === true ? true : opts.deny === true ? false : undefined;
        if (allowed === undefined && !opts.answer) {
          throw new WorkserError("Pass --allow, --deny, or --answer <text>.", {
            code: "bad_request",
          });
        }
        const res = await api(
          ctx,
          `/v1/computer/confirm/${encodeURIComponent(String(args[0]))}`,
          {
            body: {
              ...(allowed !== undefined && { allowed }),
              ...(opts.answer && { answer: String(opts.answer) }),
            },
          },
        );
        ok(res, () => line(pc.green(`✓ answered ${String(args[0])}`)));
      }),
    );

  const artifacts = computer
    .command("artifacts")
    .description("List what runs produced, or download one");

  artifacts
    .command("list", { isDefault: true })
    .description("List artifacts across conversations")
    .action(
      action(async ({ ctx }) => {
        const rows = await api(ctx, "/v1/computer/artifacts");
        ok(rows, () => printArtifacts(rows));
      }),
    );

  artifacts
    .command("get <id>")
    .description("Download one artifact's file")
    .requiredOption("-o, --out <file>", "where to write it")
    .action(
      action(async ({ ctx, opts, args }) => {
        const id = String(args[0]);
        const out = String(opts.out);
        await downloadArtifact(ctx, id, out);
        ok({ id, path: out }, () => line(pc.green(`✓ saved ${out}`)));
      }),
    );

  computer
    .command("routines")
    .description("List the schedules and watches Workser keeps running")
    .action(
      action(async ({ ctx }) => {
        const rows = await api(ctx, "/v1/computer/routines");
        ok(rows, () => printRoutines(rows));
      }),
    );
}

/** Binary GET of `artifacts/:id/raw` to a file — socket or endpoint. */
async function downloadArtifact(
  ctx: Context,
  id: string,
  out: string,
): Promise<void> {
  const path = `/v1/computer/artifacts/${encodeURIComponent(id)}/raw`;
  if (ctx.socketPath) {
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          socketPath: ctx.socketPath,
          path,
          method: "GET",
          headers: { accept: "*/*", "user-agent": "workser-cli" },
        },
        (res) => {
          if ((res.statusCode ?? 500) >= 300) {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (c) => (body += c));
            res.on("end", () =>
              reject(
                new WorkserError(errorText(body, res.statusMessage ?? ""), {
                  code: "http_error",
                  status: res.statusCode,
                }),
              ),
            );
            return;
          }
          const file = createWriteStream(out);
          res.pipe(file);
          file.on("finish", () => resolve());
          file.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    });
    return;
  }
  const res = await fetch(`${ctx.endpoint}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new WorkserError(errorText(text, res.statusText), {
      code: "http_error",
      status: res.status,
    });
  }
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
}
