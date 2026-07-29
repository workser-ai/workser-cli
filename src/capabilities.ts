import { WorkserError } from "./errors.js";

/**
 * Capability policy for the agent-facing CLI.
 *
 * This CLI is what a LOCAL AI agent (Claude Code / Codex / Gemini / Cursor) runs.
 * The agent follows model output and can be prompt-injected by repo content, so
 * its blast radius is deliberately small. Two rules define the surface:
 *
 *   1. SINGLE PROJECT — every command targets the one project linked to the cwd
 *      (or `--project`); the token Orbit hands the agent is bound to that project.
 *      The agent may `list`/`show` projects (read-only) but cannot create one or
 *      switch which project is pinned.
 *
 *   2. OPERATE WITHIN THE PINNED PROJECT, DON'T ADMINISTER THE PROJECT SET — the
 *      agent can provision and use the pinned project's OWN infra (create its
 *      database / bucket / auth, browse Neon, deploy, read/set env, manage
 *      objects, read logs); the daemon gates the sensitive actions with an
 *      approval prompt (HTTP 423). What it cannot do is administer the project
 *      set or destroy configuration: create/switch projects, delete env vars, or
 *      attach custom domains. Those are reserved for the OWNER in Workser Orbit.
 *
 * `owner_only` is the FIRST of two gates. The Workser daemon + core-api enforce
 * the boundary server-side too. The CLI gate exists so the agent gets a precise,
 * machine-readable refusal (and a clear next step) instead of a bare 403 — and so
 * the boundary is visible in `--help`.
 */

/** Exit code for an action the agent's scope categorically forbids. */
export const OWNER_ONLY_EXIT = 6;

export interface OwnerOnlyOpts {
  /** The thing the agent tried, e.g. `db create`. */
  action: string;
  /** Why it's off-limits, e.g. "provisioning new infrastructure". */
  reason: string;
  /** What the owner should do instead, in the Orbit app. */
  owner: string;
}

/**
 * Refuse an owner-only action. Throws synchronously and makes NO network call,
 * so a blocked command never reaches the daemon or mutates anything.
 */
export function ownerOnly(opts: OwnerOnlyOpts): never {
  throw new WorkserError(
    `\`workser ${opts.action}\` is an owner action — the AI agent can't do ${opts.reason}. ` +
      `Ask the project owner to ${opts.owner} in the Workser Orbit app, then continue.`,
    { code: "owner_only", details: { action: opts.action, reason: opts.reason } },
  );
}
