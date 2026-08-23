import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
  /** Present when the link came from a Workser-created folder's marker. */
  orgId?: string;
  /** Where the link was found — the project folder, not necessarily the cwd. */
  root?: string;
}

/**
 * What Workser Desktop writes at the top of a project folder, and inside each
 * app folder under it. See `app-workspace.ts` in the desktop repo.
 *
 * These are the CLI's second source of truth for "which project am I in?", and
 * on any machine running the desktop app they are the ONLY one: nothing in
 * Orbit writes `.workser/project.json`, that file only appears when somebody
 * runs `workser project use` by hand.
 */
export const PROJECT_MARKER = ".workser-project";
export const APP_MARKER = ".workser-app";

export interface FolderIdentity {
  /** The project folder — the parent every app of the project sits in. */
  projectRoot: string;
  projectId: string;
  projectName?: string;
  orgId?: string;
  /** Set when the cwd is inside one app's folder rather than beside them. */
  appId?: string;
  appName?: string;
  appRoot?: string;
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

/**
 * The project this directory belongs to — searching UPWARDS.
 *
 * WHY IT WALKS UP. Workser's layout is `~/workser/<org>/<project>/<app>`, and
 * work happens down inside an app: `…/<app>/src/components` is where a person
 * or an agent is actually standing when they type a command. An exact-cwd
 * lookup answers "no project" from there, and every project-scoped command then
 * falls back to whatever project was last used globally — which is the wrong
 * project, confidently, and it writes. Walking up is what makes `user ->
 * project -> apps` true for the CLI and not just for the UI.
 *
 * Both sources count, nearest first: a hand-written `.workser/project.json`
 * from `workser project use`, and the `.workser-project` marker the desktop app
 * drops in every project folder it creates. The second one matters more in
 * practice — Orbit never writes the first.
 *
 * The walk stops at the filesystem root, and at `$HOME`: a marker above your
 * home directory would be claiming every folder on the machine.
 */
export function readProjectLink(cwd: string): ProjectLink | null {
  const found = readFolderIdentity(cwd);
  if (!found) return null;
  return {
    projectId: found.projectId,
    name: found.projectName,
    orgId: found.orgId,
    root: found.projectRoot,
  };
}

/**
 * Everything the folder itself can tell us: which project, and which app.
 *
 * The app half is what lets an app-scoped command default correctly instead of
 * asking. Standing in the project folder gives a project and NO app, which is
 * the honest answer — a folder holding three apps does not pick one for you.
 */
export function readFolderIdentity(cwd: string): FolderIdentity | null {
  let app: { marker: any; root: string } | null = null;

  for (const dir of ancestors(cwd)) {
    // Nearest app marker wins. An app folder is always BELOW its project, so
    // the search for one ends as soon as the project is found (the loop breaks
    // there) — a sibling app's marker can never be picked up.
    if (!app) {
      const marker = readJson(join(dir, APP_MARKER));
      if (marker && typeof marker.appId === "string") {
        app = { marker, root: dir };
      }
    }

    const link = readJson(projectLinkPath(dir));
    if (link && typeof link.projectId === "string") {
      return {
        projectRoot: dir,
        projectId: link.projectId,
        projectName: link.name,
        orgId: link.orgId,
        ...appFields(app),
      };
    }

    const marker = readJson(join(dir, PROJECT_MARKER));
    if (marker && typeof marker.projectId === "string") {
      return {
        projectRoot: dir,
        projectId: marker.projectId,
        projectName: marker.projectName ?? undefined,
        orgId: marker.orgId ?? undefined,
        ...appFields(app),
      };
    }
  }

  // An app folder with no project above it still names its project — somebody
  // moved it out of the tree, and that is better answered than refused.
  if (app && typeof app.marker.projectId === "string") {
    return {
      projectRoot: app.root,
      projectId: app.marker.projectId,
      projectName: app.marker.projectName ?? undefined,
      orgId: app.marker.orgId ?? undefined,
      ...appFields(app),
    };
  }
  return null;
}

function appFields(app: { marker: any; root: string } | null) {
  if (!app) return {};
  return {
    appId: app.marker.appId as string,
    appName: (app.marker.appName ?? undefined) as string | undefined,
    appRoot: app.root,
  };
}

/** `cwd`, then each parent, stopping at `$HOME` (inclusive) or the root. */
function ancestors(cwd: string): string[] {
  const out: string[] = [];
  const home = homedir();
  let dir = resolve(cwd);
  for (let i = 0; i < 64; i++) {
    out.push(dir);
    if (dir === home) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

function readJson(file: string): any | null {
  try {
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeProjectLink(cwd: string, link: ProjectLink): void {
  mkdirSync(join(cwd, ".workser"), { recursive: true });
  writeFileSync(projectLinkPath(cwd), JSON.stringify(link, null, 2));
}
