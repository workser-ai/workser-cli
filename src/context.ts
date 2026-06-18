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
  const projectId = opts.project || link?.projectId || session.defaultProjectId;

  return { endpoint, token, mode, cwd, projectId };
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
