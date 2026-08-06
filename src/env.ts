import { WorkserError } from "./errors.js";

/**
 * Which Workser backend a CLI invocation targets.
 *
 *   local — a core-api you are running yourself (http://localhost:8000)
 *   dev   — the shared dev deployment (https://dev-api.workser.ai)
 *   prod  — production (https://api.workser.ai)
 *
 * Selected with `$WORKSER_ENV`; `prod` when unset, so a published CLI with no
 * environment set behaves exactly as it always has.
 */
export type WorkserEnv = "local" | "dev" | "prod";

export const ENV_BASE_URLS: Record<WorkserEnv, string> = {
  local: "http://localhost:8000",
  dev: "https://dev-api.workser.ai",
  prod: "https://api.workser.ai",
};

/** Spellings people actually type, mapped to the canonical name. */
const ALIASES: Record<string, WorkserEnv> = {
  local: "local",
  localhost: "local",
  development: "dev",
  dev: "dev",
  staging: "dev",
  prod: "prod",
  production: "prod",
};

/**
 * Read `$WORKSER_ENV`.
 *
 * An unrecognised value is a hard error rather than a fall-back to prod: a
 * typo'd `WORKSER_ENV=devv` silently deploying to production is the exact
 * failure this switch exists to prevent.
 */
export function resolveEnv(raw = process.env.WORKSER_ENV): WorkserEnv {
  if (!raw || !raw.trim()) return "prod";
  const env = ALIASES[raw.trim().toLowerCase()];
  if (!env) {
    throw new WorkserError(
      `Unknown WORKSER_ENV "${raw}". Expected one of: local, dev, prod.`,
      { code: "bad_env" },
    );
  }
  return env;
}

/**
 * The API base URL to use when not talking to a local Orbit daemon.
 *
 * `$WORKSER_API_URL` still wins — it names an exact URL, which is strictly more
 * specific than naming an environment, and it is what CI and one-off targets
 * (a PR preview, a colleague's tunnel) already use.
 */
export function cloudBaseUrl(): string {
  return process.env.WORKSER_API_URL || ENV_BASE_URLS[resolveEnv()];
}
