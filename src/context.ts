import { resolve } from "node:path";
import { readSession, readFolderIdentity } from "./config.js";
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
   * Which organization the cwd belongs to, from the folder marker.
   *
   * Resolved from where the command IS, never from the spawning run's env —
   * one user has many orgs and the two can disagree. Absent when the cwd is
   * outside any Workser folder.
   */
  orgId?: string;
  /**
   * The PROJECT folder this cwd sits under, when the folder identifies one.
   *
   * The project directory is the parent of every app in the project, and it is
   * what a project-level command should be acting on — the folder the user
   * thinks of as "my project" rather than whichever subdirectory their shell
   * happened to be in.
   */
  projectRoot?: string;
  /**
   * Which app the cwd is INSIDE, when it is inside one.
   *
   * Read from the `.workser-app` marker Workser writes into every app folder.
   * Standing in the project folder leaves this unset, deliberately: a folder
   * holding a storefront, an api and a worker does not pick one for you, and a
   * command that needs an app should say so rather than guess.
   *
   * Only ever a DEFAULT. `--app` always wins, and the daemon does its own
   * folder-to-app resolution against the paths it has recorded, which stays
   * authoritative — this is what makes an app resolvable in cloud mode and
   * without a round trip.
   */
  appId?: string;
  appName?: string;
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
  /**
   * The PLAN a dispatched step belongs to — a different row from the step.
   *
   * `projectTaskId` is the step's own id, because that is what `task done` has
   * to settle. It is NOT the plan, and reading it as one is what made
   * `workser task show` print the caller's own single row with "No steps yet"
   * underneath, for an agent whose prompt had just told it to run that command
   * to see the whole plan and where its step sat in it.
   *
   * Absent for a run that is not a step of a plan, and absent on an older
   * desktop that does not set `WORKSER_PARENT_TASK_ID`.
   */
  parentTaskId?: string;
  /** Project channel that started this run, when it came from channel chat. */
  projectChannelId?: string;
  /** User message that started the channel run. */
  projectChannelMessageId?: string;
  /** Agent identity Orbit assigned to this run, for agent-authored records. */
  agentRole?: string;
  agentType?: string;
  agentModel?: string;
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

  const folder = readFolderIdentity(cwd);
  /**
   * WHERE YOU ARE STANDING BEATS WHAT YOU WERE TOLD AT SPAWN.
   *
   * ─── THE BUG THIS FIXES ─────────────────────────────────────────────────
   *
   * The order used to be `--project` → `WORKSER_PROJECT_ID` → folder, with the
   * reasoning: "a run always knows its own project; prefer it over the cwd
   * link so an agent working in a subfolder still records against the right
   * project."
   *
   * The concern was real and the fix was in the wrong place. `readFolderIdentity`
   * WALKS UP its ancestors, so an agent in `<project>/<app>/src/components`
   * already resolves the project and the app from the markers above it. Env-first
   * bought nothing for that case.
   *
   * What it did cost: an agent that moves between folders. One user has many
   * orgs, one org many projects, one project many apps — `WORKSER_PROJECT_ID`
   * is a snapshot of the DISPATCH, taken once at spawn, while the cwd is where
   * the command actually is. When they disagreed the env won, and worse, the
   * next line then found `folder.projectId !== projectId` and dropped the app
   * as well: the CLI ended up filing against project A with no app while
   * standing inside project B's app folder.
   *
   * So: the folder is the live answer, the env is the fallback for a cwd that
   * is outside any Workser tree (a scratch directory, `/tmp`), and `--project`
   * still wins over both because a person said it out loud.
   */
  const projectId =
    opts.project ||
    folder?.projectId ||
    process.env.WORKSER_PROJECT_ID ||
    session.defaultProjectId;

  /**
   * `--project` MOVES YOU WITHIN YOUR ORGANIZATION, AND NO FURTHER.
   *
   * ─── WHY THE FLAG IS ALLOWED TO OVERRULE THE FOLDER ─────────────────────
   *
   * It is briefly worth saying what this is NOT. `--project` used to be
   * unbounded: an agent could read another organization's project id out of
   * `workser project list` — which returned the whole account — pass it here,
   * and every command that writes would land in a different customer's work.
   *
   * The fix is not to pin the flag to the folder. An agent's job routinely
   * spans an organization's projects: a fix in the API lands beside one in the
   * web app, a plan touches three repositories, and an agent that has to ask
   * permission to move is an agent that stops. So the boundary is the
   * ORGANIZATION, and it is enforced by the daemon, which is the only side that
   * can resolve a project to its org.
   *
   * Nothing is checked here. A client-side rule is a suggestion, and a
   * suggestion that needs a network call to evaluate is worse than none —
   * `error.code = "out_of_scope"` (exit 7) comes back from the daemon with the
   * organization named in it.
   */

  // Only trust the folder's app when the folder's PROJECT is the one we settled
  // on. Otherwise `--project other-id` run from inside an app would carry that
  // app's id into a project it does not belong to, and the daemon would happily
  // act on it. (With the folder now preferred above, this can only disagree
  // when `--project` was passed explicitly — which is exactly the case it was
  // written for.)
  const inThisProject = folder?.projectId === projectId;

  const runId = process.env.WORKSER_RUN_ID || undefined;
  const conversationId = process.env.WORKSER_CONVERSATION_ID || undefined;
  const projectTaskId = process.env.WORKSER_PROJECT_TASK_ID || undefined;
  const parentTaskId = process.env.WORKSER_PARENT_TASK_ID || undefined;
  const projectChannelId =
    process.env.WORKSER_PROJECT_CHANNEL_ID || undefined;
  const projectChannelMessageId =
    process.env.WORKSER_PROJECT_CHANNEL_MESSAGE_ID || undefined;
  const agentRole = process.env.WORKSER_AGENT_ROLE || undefined;
  const agentType = process.env.WORKSER_AGENT_TYPE || undefined;
  const agentModel = process.env.WORKSER_AGENT_MODEL || undefined;

  return {
    endpoint,
    socketPath,
    token,
    mode,
    cwd,
    projectId,
    /**
     * The ORG the cwd belongs to, from the same marker.
     *
     * Read here rather than from `WORKSER_ORGANIZATION_ID` for the same reason
     * as the project above: a user belongs to several, and the env is a
     * snapshot of the run that spawned this process, not of the folder the
     * command is standing in.
     */
    orgId: inThisProject ? folder?.orgId : undefined,
    projectRoot: inThisProject ? folder?.projectRoot : undefined,
    appId: inThisProject ? folder?.appId : undefined,
    appName: inThisProject ? folder?.appName : undefined,
    runId,
    conversationId,
    projectTaskId,
    parentTaskId,
    projectChannelId,
    projectChannelMessageId,
    agentRole,
    agentType,
    agentModel,
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
      "No project selected.\n" +
        "\nWorkser keeps each project in its own folder — `~/workser/<org>/<project>/`,\n" +
        "with that project's apps inside it. Running from anywhere in that tree is\n" +
        "enough; this shell is not in one.\n" +
        "\n  • cd into the project's folder (Workser Orbit's Files tab shows where it is), or\n" +
        "  • pass --project <id> for a one-off.",
      { code: "no_project" },
    );
  }
  return ctx.projectId;
}

/**
 * The app to act on: what the caller said, else the app whose folder we are
 * standing in.
 *
 * Returns `undefined` rather than guessing when neither is available — the
 * daemon's own resolver takes over there, and it is the one with the recorded
 * folder paths. See `resolve-app.ts` in the desktop repo: where a wrong answer
 * WRITES or SHIPS, refusing beats picking.
 */
export function appTarget(ctx: Context, explicit?: string): string | undefined {
  const said = typeof explicit === "string" ? explicit.trim() : "";
  return said || ctx.appId || undefined;
}
