/**
 * Which project — and which app — is this shell standing in?
 *
 * The failure being guarded against is not "no project found". It is finding
 * the WRONG one: when a lookup at the exact cwd comes back empty, every
 * project-scoped command falls through to whatever project was last used
 * globally, and then writes to it. A decision recorded against another
 * customer's project is not an error anybody sees.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFolderIdentity, readProjectLink } from "../src/config.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "workser-folder-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The layout Workser Desktop creates: ~/workser/<org>/<project>/<app>. */
function tree() {
  const project = join(root, "workser", "org-1", "proj-1");
  const app = join(project, "app-1");
  const deep = join(app, "src", "components");
  mkdirSync(deep, { recursive: true });
  writeFileSync(
    join(project, ".workser-project"),
    JSON.stringify({ orgId: "org-1", projectId: "proj-1", projectName: "Smart ERP" }),
  );
  writeFileSync(
    join(app, ".workser-app"),
    JSON.stringify({
      orgId: "org-1",
      projectId: "proj-1",
      projectName: "Smart ERP",
      appId: "app-1",
      appName: "Storefront",
    }),
  );
  return { project, app, deep };
}

describe("readFolderIdentity", () => {
  it("finds the project from deep inside an app, not just at its root", () => {
    // `…/app/src/components` is where a person or an agent actually stands.
    const { project, app, deep } = tree();
    const found = readFolderIdentity(deep);
    expect(found?.projectId).toBe("proj-1");
    expect(found?.projectRoot).toBe(project);
    expect(found?.appId).toBe("app-1");
    expect(found?.appRoot).toBe(app);
  });

  it("names no app when you are standing in the project folder", () => {
    // A folder holding a storefront, an api and a worker does not pick one for
    // you. Guessing here is what deploys the wrong app.
    const { project } = tree();
    const found = readFolderIdentity(project);
    expect(found?.projectId).toBe("proj-1");
    expect(found?.appId).toBeUndefined();
  });

  it("carries the names, which the path no longer does", () => {
    const { deep } = tree();
    const found = readFolderIdentity(deep);
    expect(found?.projectName).toBe("Smart ERP");
    expect(found?.appName).toBe("Storefront");
    expect(found?.orgId).toBe("org-1");
  });

  it("prefers a hand-written link over the marker beside it", () => {
    // `workser project use` is an explicit instruction; the marker is a default.
    const { project, deep } = tree();
    mkdirSync(join(project, ".workser"), { recursive: true });
    writeFileSync(
      join(project, ".workser", "project.json"),
      JSON.stringify({ projectId: "chosen", name: "Chosen" }),
    );
    expect(readFolderIdentity(deep)?.projectId).toBe("chosen");
  });

  it("takes the NEAREST project when trees are nested", () => {
    const { project } = tree();
    const inner = join(project, "vendor", "other-project");
    mkdirSync(inner, { recursive: true });
    writeFileSync(
      join(inner, ".workser-project"),
      JSON.stringify({ projectId: "proj-2" }),
    );
    expect(readFolderIdentity(inner)?.projectId).toBe("proj-2");
  });

  it("still answers for an app folder moved out of its project tree", () => {
    const loose = join(root, "elsewhere", "app-9");
    mkdirSync(loose, { recursive: true });
    writeFileSync(
      join(loose, ".workser-app"),
      JSON.stringify({ projectId: "proj-9", appId: "app-9", appName: "Jobs" }),
    );
    const found = readFolderIdentity(loose);
    expect(found?.projectId).toBe("proj-9");
    expect(found?.appId).toBe("app-9");
  });

  it("returns nothing for an unrelated folder", () => {
    const plain = join(root, "my-notes");
    mkdirSync(plain, { recursive: true });
    expect(readFolderIdentity(plain)).toBeNull();
    expect(readProjectLink(plain)).toBeNull();
  });

  it("survives a corrupt marker instead of crashing the command", () => {
    const { project, deep } = tree();
    writeFileSync(join(project, ".workser-project"), "{not json");
    // Falls through to nothing found rather than throwing — a broken file in
    // one folder must not take out `workser status` everywhere above it.
    expect(() => readFolderIdentity(deep)).not.toThrow();
  });
});
