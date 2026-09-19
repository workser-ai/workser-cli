/**
 * WCOMP-051 — golden JSON contract fixtures for `workser code`.
 *
 * The stub serves the capability routes the desktop registered at
 * `/v1/computer/code/*` (WCOMP-045 shapes, `sendData`-wrapped). Each test
 * asserts the full `--json` envelope, and the request shapes show an agent
 * submits requirements + project scope and never a credential.
 */
import { createServer, type Server } from "node:http";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./run-cli.js";

interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

class CapabilityStub {
  private server!: Server;
  readonly requests: RecordedRequest[] = [];
  routes = new Map<string, { status?: number; body?: unknown }>();
  port = 0;

  get lastRequest(): RecordedRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  reset(): void {
    this.requests.length = 0;
    this.routes.clear();
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => {
      this.server.listen(0, "127.0.0.1", () => resolve());
    });
    this.port = (this.server.address() as any).port;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private async handle(req: any, res: any): Promise<void> {
    const url = new URL(req.url ?? "/", this.endpoint);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => (query[k] = v));
    this.requests.push({
      method: req.method,
      path: url.pathname,
      query,
      body: raw ? JSON.parse(raw) : undefined,
    });

    const hit = this.routes.get(`${req.method} ${url.pathname}`);
    if (!hit) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: { code: "not_found", message: url.pathname } }));
      return;
    }
    res.writeHead(hit.status ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: hit.body }));
  }

  get endpoint(): string {
    return `http://127.0.0.1:${this.port}`;
  }
}

const stub = new CapabilityStub();
let home: string;
let work: string;
const TOKEN = "tok_code123";

const ASSIGNMENT = {
  taskId: "task_1",
  runId: "task_1",
  status: "starting",
  projectId: "p_1",
  appId: "app_1",
};

const RUNNING = {
  ...ASSIGNMENT,
  status: "running",
  active: true,
  task: { id: "task_1", status: "in_progress" },
};

const DONE = {
  ...ASSIGNMENT,
  status: "completed",
  active: false,
};

const RESULTS = {
  ...DONE,
  artifacts: [{ id: "art_1", kind: "code", title: "checkout.ts" }],
  preview: { kind: "url", url: "https://preview.shop.workser.app" },
  revision: { head: "5eaf00d", branch: "workser/task_1", dirty: false, state: "synced" },
};


function cli(args: string[]) {
  // The capability is project-scoped: tests pin the project the way an agent
  // standing inside a project folder would be pinned by its marker.
  return runCli(["--json", "--project", "p_1", ...args], {
    endpoint: stub.endpoint,
    token: TOKEN,
    home,
    cwd: work,
  });
}

beforeAll(async () => {
  await stub.start();
  home = mkdtempSync(join(tmpdir(), "workser-home-"));
  work = realpathSync(mkdtempSync(join(tmpdir(), "workser-work-")));
});

afterAll(async () => {
  await stub.stop();
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

afterEach(() => stub.reset());

describe("workser code — golden envelopes", () => {
  it("run → POST /v1/computer/code/runs with the pinned project + this cwd", async () => {
    stub.routes.set("POST /v1/computer/code/runs", { status: 202, body: ASSIGNMENT });
    const r = await cli(["code", "run", "add the checkout page", "--app", "app_1"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({
      method: "POST",
      path: "/v1/computer/code/runs",
    });
    expect(stub.lastRequest?.body).toMatchObject({
      projectId: "p_1",
      appId: "app_1",
      requirements: "add the checkout page",
      autonomy: "plan",
    });
    expect((stub.lastRequest!.body as any).cwd).toBe(work);
    expect(r.json).toEqual({
      ok: true,
      data: {
        taskId: "task_1",
        runId: "task_1",
        status: "starting",
        projectId: "p_1",
        appId: "app_1",
      },
    });
  });

  it("status → GET /v1/computer/code/runs/:runId?projectId (fixture: status)", async () => {
    stub.routes.set("GET /v1/computer/code/runs/task_1", { body: RUNNING });
    const r = await cli(["code", "status", "task_1"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({
      method: "GET",
      path: "/v1/computer/code/runs/task_1",
      query: { projectId: "p_1" },
    });
    expect(r.json.data).toMatchObject({
      runId: "task_1",
      status: "running",
      active: true,
    });
  });

  it("cancel → POST .../runs/:runId/cancel {projectId}", async () => {
    stub.routes.set("POST /v1/computer/code/runs/task_1/cancel", {
      status: 202,
      body: { ...RUNNING, status: "cancelling" },
    });
    const r = await cli(["code", "cancel", "task_1"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({
      method: "POST",
      path: "/v1/computer/code/runs/task_1/cancel",
    });
    expect(stub.lastRequest?.body).toEqual({ projectId: "p_1" });
    expect(r.json.data.status).toBe("cancelling");
  });

  it("artifacts → GET .../runs/:runId/results (fixture: artifact + preview + revision)", async () => {
    stub.routes.set("GET /v1/computer/code/runs/task_1/results", { body: RESULTS });
    const r = await cli(["code", "artifacts", "task_1"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({
      method: "GET",
      path: "/v1/computer/code/runs/task_1/results",
      query: { projectId: "p_1" },
    });
    expect(r.json.data).toMatchObject({
      runId: "task_1",
      status: "completed",
      preview: { url: "https://preview.shop.workser.app" },
      revision: { head: "5eaf00d" },
    });
    expect(r.json.data.artifacts[0]).toMatchObject({ id: "art_1", kind: "code" });
  });

  it("--wait follows the run to completion and returns results, exit 0", async () => {
    let polls = 0;
    stub.routes.set("POST /v1/computer/code/runs", { status: 202, body: ASSIGNMENT });
    stub.routes.set("GET /v1/computer/code/runs/task_1", {
      get body(): unknown {
        polls += 1;
        return polls < 2 ? RUNNING : DONE;
      },
    });
    stub.routes.set("GET /v1/computer/code/runs/task_1/results", { body: RESULTS });
    const r = await cli(["code", "run", "add the checkout page", "--wait", "--timeout", "10"]);
    expect(r.code).toBe(0);
    expect(stub.requests.filter((q) => q.path === "/v1/computer/code/runs/task_1")).toHaveLength(2);
    expect(r.json.data).toMatchObject({
      runId: "task_1",
      status: "completed",
      preview: { url: "https://preview.shop.workser.app" },
    });
  });

  it("--wait exits 1 when the run ends failed", async () => {
    stub.routes.set("POST /v1/computer/code/runs", { status: 202, body: ASSIGNMENT });
    stub.routes.set("GET /v1/computer/code/runs/task_1", {
      body: { ...DONE, status: "failed", active: false },
    });
    stub.routes.set("GET /v1/computer/code/runs/task_1/results", { body: { ...RESULTS, status: "failed" } });
    const r = await cli(["code", "run", "add the checkout page", "--wait", "--timeout", "10"]);
    expect(r.code).toBe(1);
    expect(r.json.data).toMatchObject({ runId: "task_1", status: "failed" });
  });

  it("an unknown --autonomy is refused before any network call", async () => {
    const r = await cli(["code", "run", "x", "--autonomy", "yolo"]);
    expect(r.code).not.toBe(0);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.message).toContain("--autonomy");
    expect(stub.requests).toHaveLength(0);
  });
});
