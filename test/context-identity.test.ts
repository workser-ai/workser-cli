/**
 * WHERE YOU ARE STANDING vs WHAT YOU WERE TOLD AT SPAWN.
 *
 * `WORKSER_PROJECT_ID` is set once, on the process Orbit spawns. The cwd is
 * where the command actually is. One user has many orgs, one org many
 * projects, one project many apps — so the two can and do disagree, and when
 * they did the env used to win.
 *
 * The consequence was not "the wrong project name in a log". The CLI settled on
 * the env's project, then found the folder's project did not match it and
 * dropped the app as well — so a command run inside project B's app folder
 * filed against project A, with no app. Nobody sees that error; they see work
 * appear in the wrong customer's project.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContext } from "../src/context.js";

let root: string;
const saved = { ...process.env };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "workser-ctx-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  process.env = { ...saved };
});

/** One project folder with one app inside it, both marked. */
function tree(orgId: string, projectId: string, appId: string) {
  const project = join(root, orgId, projectId);
  const app = join(project, appId);
  mkdirSync(app, { recursive: true });
  writeFileSync(
    join(project, ".workser-project"),
    JSON.stringify({ orgId, projectId, projectName: "P" }),
  );
  writeFileSync(
    join(app, ".workser-app"),
    JSON.stringify({ orgId, projectId, appId, appName: "A" }),
  );
  return { project, app };
}

describe("the folder decides, not the environment", () => {
  it("uses the project the cwd is in, even when the env names another", () => {
    const { app } = tree("org-b", "proj-b", "app-b");
    process.env.WORKSER_PROJECT_ID = "proj-a";
    const ctx = buildContext({ cwd: app });
    expect(ctx.projectId).toBe("proj-b");
    // …and the app survives, which is the half that used to be lost: with the
    // env winning, `folder.projectId !== projectId` dropped it.
    expect(ctx.appId).toBe("app-b");
  });

  it("reports the org from the folder too", () => {
    const { app } = tree("org-b", "proj-b", "app-b");
    process.env.WORKSER_ORGANIZATION_ID = "org-a";
    expect(buildContext({ cwd: app }).orgId).toBe("org-b");
  });

  it("still resolves from a deep subfolder — the case env-first was for", () => {
    // `readFolderIdentity` walks up, so an agent in `src/components` already
    // finds both markers. This is why preferring the env bought nothing.
    const { app } = tree("org-b", "proj-b", "app-b");
    const deep = join(app, "src", "components");
    mkdirSync(deep, { recursive: true });
    const ctx = buildContext({ cwd: deep });
    expect(ctx.projectId).toBe("proj-b");
    expect(ctx.appId).toBe("app-b");
  });

  it("falls back to the env outside any Workser folder", () => {
    // The one case the env genuinely serves: a scratch directory with no
    // marker anywhere above it.
    const scratch = join(root, "elsewhere");
    mkdirSync(scratch, { recursive: true });
    process.env.WORKSER_PROJECT_ID = "proj-a";
    expect(buildContext({ cwd: scratch }).projectId).toBe("proj-a");
  });

  it("an explicit --project still wins over both", () => {
    // A person said it out loud; nothing derived may override that.
    const { app } = tree("org-b", "proj-b", "app-b");
    process.env.WORKSER_PROJECT_ID = "proj-a";
    const ctx = buildContext({ cwd: app, project: "proj-c" });
    expect(ctx.projectId).toBe("proj-c");
    // The app is dropped on purpose: it belongs to proj-b, not proj-c, and
    // carrying it across would let the daemon act on it in the wrong project.
    expect(ctx.appId).toBeUndefined();
  });
});
