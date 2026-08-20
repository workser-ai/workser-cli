import { resolve } from "node:path";
import { readSession, readProjectLink } from "./config.js";
import { cloudBaseUrl } from "./env.js";
import { WorkserError } from "./errors.js";

export interface GlobalOpts {
  json?: boolean;
  quiet?: boolean;
  project?: string;
  cwd?: string;
  endpoint?: string;
  token?: string;
}

export interface Context {
  /** Base URL the CLI talks to: the local Orbit daemon, or Workser cloud. */
  endpoint: string;
  /**
   * When set, requests go over this Unix socket / named pipe instead of TCP,
   * and no token is sent — reaching the socket is the authorization. This is
   * how Orbit connects the CLI now; `token` stays for cloud and for the
   * fallback where the daemon could not bind a socket.
   */
  socketPath?: string;
  token?: string;
  /** "daemon" = local Orbit app (approval gates + UI); "cloud" = direct API. */
  mode: "daemon" | "cloud";
  cwd: string;
  projectId?: string;
  /**
   * The agent run this CLI invocation is executing inside, if any.
   *
   * Orbit sets `WORKSER_RUN_ID` on the agent process it spawns, so anything
   * the agent shells out to inherits it. That is what lets `workser artifact
   * add` attach a deliverable to the right task without the agent having to
   * know a task id, and what makes `workser ask` able to put a question on the
   * conversation the user is actually looking at.
   *
   * Absent when the CLI is run by hand, or from CI — commands that need a run
   * say so rather than guessing.
   */
  runId?: string;
  /**
   * The conversation the current run reports into, if any.
   *
   * Orbit sets `WORKSER_CONVERSATION_ID` on the agent process alongside
   * `WORKSER_RUN_ID` (see that field's doc comment) — same absence rule: not
   * set when the CLI runs by hand or from CI.
   */
  conversationId?: string;
  /**
   * The AI Tech Team PROJECT task this run belongs to, when it is one.
   *
   * Orbit sets `WORKSER_PROJECT_TASK_ID` on the agent process for a task
   * thread. Deliberately separate from `runId`: that one is Computer-mode's
   * `ai_agent_tasks`, a different table, and both are uuids — an agent that
   * read one and got the other would silently address the wrong object.
   *
   * Absent when the CLI is run by hand, which is why every command that needs
   * it takes `--task` as well.
   */
  projectTaskId?: string;
}

/**
 * Resolve where + how to talk to Workser, in precedence order:
 *   endpoint:  --endpoint  >  $WORKSER_DAEMON_URL  >  session.endpoint  >  cloud default
 *   token:     --token     >  $WORKSER_TOKEN       >  session.token
 *   project:   --project   >  <cwd>/.workser link  >  session.defaultProjectId
 *
 * The cloud default is itself environment-aware — `$WORKSER_API_URL`, else the
 * URL for `$WORKSER_ENV` (local | dev | prod), else production. See env.ts.
 *
 * Inside Workser Orbit, the app writes the session pointing at the local daemon,
 * so the agent's `workser …` calls flow through the cockpit (auth + approvals + live UI).
 * Standalone (CI / no app), it falls back to the cloud API with a login token.
 */
export function buildContext(opts: GlobalOpts): Context {
  const session = readSession();
  const cwd = opts.cwd ? resolve(opts.cwd) : process.cwd();

  const token = opts.token || process.env.WORKSER_TOKEN || session.token;

  // An explicit --endpoint/--token (or the env equivalents) means the caller is
  // deliberately targeting something else — honour it and ignore the socket,
  // otherwise `--endpoint https://api.workser.ai` would silently keep talking
  // to the local daemon.
  const overridden = Boolean(
    opts.endpoint || opts.token || process.env.WORKSER_DAEMON_URL || process.env.WORKSER_TOKEN,
  );
  const socketPath = overridden ? undefined : session.socketPath;

  // On the socket the handshake carries no `endpoint` — there is no TCP
  // listener to name. Only the path+query is ever sent, so this base exists
  // purely to build a URL, and it keeps error messages saying "local daemon"
  // rather than naming the cloud API the CLI is not talking to.
  const endpointRaw = socketPath
    ? "http://localhost"
    : opts.endpoint ||
      process.env.WORKSER_DAEMON_URL ||
      session.endpoint ||
      cloudBaseUrl();
  const endpoint = endpointRaw.replace(/\/+$/, "");

  const mode: Context["mode"] = socketPath
    ? "daemon"
    : /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(endpoint)
      ? "daemon"
      : "cloud";

  const link = readProjectLink(cwd);
  // A run always knows its own project; prefer it over the cwd link so an
  // agent working in a subfolder still records against the right project.
  const projectId =
    opts.project ||
    process.env.WORKSER_PROJECT_ID ||
    link?.projectId ||
    session.defaultProjectId;

  const runId = process.env.WORKSER_RUN_ID || undefined;
  const conversationId = process.env.WORKSER_CONVERSATION_ID || undefined;
  const projectTaskId = process.env.WORKSER_PROJECT_TASK_ID || undefined;

  return {
    endpoint,
    socketPath,
    token,
    mode,
    cwd,
    projectId,
    runId,
    conversationId,
    projectTaskId,
  };
}

/**
 * The run to address, or `current` — which the daemon resolves to the sole
 * active run. Falling back rather than erroring keeps the CLI usable when an
 * agent shells out through something that drops the environment (a nested
 * shell, a wrapper script).
 */
export function runTarget(ctx: Context): string {
  return ctx.runId || "current";
}

/**
 * Refuse, clearly, a command that can only work through the local app.
 *
 * WHY THIS EXISTS. Some commands are about FILES — publishing this folder,
 * checkpointing it, syncing it. The daemon does that work because it is the
 * only part of Workser standing next to the folder with a git binary. Nothing
 * on the cloud side can: `/v1/*` is the DAEMON's contract, and core-api serves
 * the same shapes at `/orbit/*` behind a bridge JWT that only a registered
 * device holds.
 *
 * So on a computer with the CLI and a login token but no Workser app — a
 * colleague's laptop, a CI box, a server — these commands were reaching a real
 * host, authenticating fine, and coming back `404 Not Found`. That reads as
 * "Workser is broken" or "my project is gone". It is neither: the machine
 * simply isn't set up to hold code.
 *
 * Naming the reason and the fix costs one check and turns a dead end into an
 * instruction. Everything that is pure API — `workser projects`, `db`, `env`,
 * `logs`, `status` — is untouched and still works from anywhere.
 */
export function requireLocalApp(ctx: Context, what: string): void {
  if (ctx.mode === "daemon") return;
  throw new WorkserError(
    `\`workser ${what}\` works with the code in this folder, so it needs the Workser app running on this computer.\n` +
      `\nThis shell is talking to ${ctx.endpoint} instead of a local app.\n` +
      `\n  • On your own computer: open Workser and try again.` +
      `\n  • On a computer without Workser: install it from https://workser.ai/download,` +
      `\n    sign in, and open this project — that is what puts the code here.` +
      `\n\nCommands that only read your account (projects, env, db, logs, status) work as normal.`,
    { code: "needs_local_app" },
  );
}

/**
 * Needs the desktop app, but not the code.
 *
 * `requireLocalApp` says "works with the code in this folder", which is true of
 * deploy and verify and false of a health probe: nothing is read from disk, but
 * the check has to be MADE from a machine that can reach the site. A message
 * that names the wrong reason sends someone to clone a repo they do not need.
 */
export function requireDaemon(ctx: Context, what: string, why: string): void {
  if (ctx.mode === "daemon") return;
  throw new WorkserError(
    `\`workser ${what}\` ${why}, so it needs the Workser app running on this computer.\n` +
      `\nThis shell is talking to ${ctx.endpoint} instead of a local app.\n` +
      `\n  • On your own computer: open Workser and try again.` +
      `\n  • On a computer without Workser: install it from https://workser.ai/download and sign in.`,
    { code: "needs_local_app" },
  );
}

export function requireProject(ctx: Context): string {
  if (!ctx.projectId) {
    throw new WorkserError(
      "No project selected. Run `workser project use <id>` or pass --project <id>.",
      { code: "no_project" },
    );
  }
  return ctx.projectId;
}
