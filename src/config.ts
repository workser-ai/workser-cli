import { homedir } from "node:os";
import { join } from "node:path";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

/**
 * Two on-disk artifacts:
 *  1. Global session  ~/.workser/session.json  — written by Workser Orbit at
 *     "connect" time (or by `workser login` for standalone use). Holds the
 *     endpoint (local daemon URL or cloud) + token + default workspace/project.
 *  2. Project link     <cwd>/.workser/project.json — written by `workser project use`
 *     / `project create`, so commands run in a repo target the right project.
 */
export interface Session {
  endpoint?: string;
  /**
   * Unix domain socket / Windows named pipe for the local Orbit daemon.
   *
   * Preferred over `endpoint`+`token` when present: reaching the socket is
   * itself the authorization (it is 0600 in a 0700 directory), so no credential
   * is written to disk for an agent to read and replay.
   */
  socketPath?: string;
  /** Bearer token. Cloud/standalone use, or the daemon socket fallback. */
  token?: string;
  workspaceId?: string;
  workspaceName?: string;
  defaultProjectId?: string;
}

export interface ProjectLink {
  projectId: string;
  name?: string;
}

const GLOBAL_DIR = join(homedir(), ".workser");
const SESSION_FILE = join(GLOBAL_DIR, "session.json");

export function readSession(): Session {
  try {
    if (!existsSync(SESSION_FILE)) return {};
    return JSON.parse(readFileSync(SESSION_FILE, "utf8")) as Session;
  } catch {
    return {};
  }
}

export function writeSession(patch: Partial<Session>): Session {
  const next = { ...readSession(), ...patch };
  mkdirSync(GLOBAL_DIR, { recursive: true, mode: 0o700 });
  // Mode 0600 is REQUIRED, not tidiness: this file holds the session token, and
  // the default (0644, umask-dependent) leaves it world-readable. Orbit's own
  // writer (orbit/cli/connector.ts) already writes 0600 — because this one is
  // read-modify-write, omitting the mode here also silently DOWNGRADED a file
  // Orbit had created correctly.
  writeFileSync(SESSION_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  // writeFileSync only applies `mode` when it CREATES the file, so an existing
  // file keeps whatever permissions it already had. Re-assert explicitly.
  try {
    chmodSync(SESSION_FILE, 0o600);
  } catch {
    /* best-effort: platforms without POSIX permissions */
  }
  return next;
}

export function clearSession(): void {
  try {
    // Same 0600 requirement as writeSession — a cleared file is re-populated by
    // the next login, and it would keep whatever mode it was created with.
    writeFileSync(SESSION_FILE, "{}", { mode: 0o600 });
  } catch {
    /* ignore */
  }
}

export function projectLinkPath(cwd: string): string {
  return join(cwd, ".workser", "project.json");
}

export function readProjectLink(cwd: string): ProjectLink | null {
  try {
    const p = projectLinkPath(cwd);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as ProjectLink;
  } catch {
    return null;
  }
}

export function writeProjectLink(cwd: string, link: ProjectLink): void {
  mkdirSync(join(cwd, ".workser"), { recursive: true });
  writeFileSync(projectLinkPath(cwd), JSON.stringify(link, null, 2));
}
