import { resolve } from "node:path";
import { readSession, readProjectLink } from "./config.js";
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
}

const CLOUD_DEFAULT = process.env.WORKSER_API_URL || "https://api.workser.ai";

/**
 * Resolve where + how to talk to Workser, in precedence order:
 *   endpoint:  --endpoint  >  $WORKSER_DAEMON_URL  >  session.endpoint  >  cloud default
 *   token:     --token     >  $WORKSER_TOKEN       >  session.token
 *   project:   --project   >  <cwd>/.workser link  >  session.defaultProjectId
 *
 * Inside Workser Orbit, the app writes the session pointing at the local daemon,
 * so the agent's `workser …` calls flow through the cockpit (auth + approvals + live UI).
 * Standalone (CI / no app), it falls back to the cloud API with a login token.
 */
export function buildContext(opts: GlobalOpts): Context {
  const session = readSession();
  const cwd = opts.cwd ? resolve(opts.cwd) : process.cwd();

  const endpointRaw =
    opts.endpoint || process.env.WORKSER_DAEMON_URL || session.endpoint || CLOUD_DEFAULT;
  const endpoint = endpointRaw.replace(/\/+$/, "");
  const token = opts.token || process.env.WORKSER_TOKEN || session.token;

  const mode: Context["mode"] = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(
    endpoint,
  )
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

  return { endpoint, token, mode, cwd, projectId, runId };
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

export function requireProject(ctx: Context): string {
  if (!ctx.projectId) {
    throw new WorkserError(
      "No project selected. Run `workser project use <id>` or pass --project <id>.",
      { code: "no_project" },
    );
  }
  return ctx.projectId;
}
