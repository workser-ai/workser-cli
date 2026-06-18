import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

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
  mkdirSync(GLOBAL_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(next, null, 2));
  return next;
}

export function clearSession(): void {
  try {
    writeFileSync(SESSION_FILE, "{}");
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
