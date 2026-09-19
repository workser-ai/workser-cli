/**
 * WCOMP-050 — golden JSON contract fixtures for `workser computer`.
 *
 * The stub below serves the daemon's `/v1/computer/*` routes (migration doc
 * 07 shapes) and, for `--wait`, a scripted ServerEvent SSE stream — the same
 * objects the desktop emits on `computer:event`. Every test asserts the full
 * `--json` envelope, because the contract a caller codes against is the
 * envelope, not a rendering of it.
 */
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./run-cli.js";

interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

/** JSON routes per doc 07, plus an SSE `/v1/computer/events` we script. */
class ComputerStub {
  private server!: Server;
  readonly requests: RecordedRequest[] = [];
  /** Emitted, in order, to the next /events subscriber; then the stream ends. */
  events: any[] = [];
  /** Responses keyed by "METHOD /path". Unlisted paths answer 404. */
  routes = new Map<string, { status?: number; body?: unknown; bytes?: Buffer; contentType?: string }>();

  port = 0;

  /** The last request the stub recorded. */
  get lastRequest(): RecordedRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  get endpoint(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  reset(): void {
    this.requests.length = 0;
    this.events = [];
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
    this.requests.push({
      method: req.method,
      path: url.pathname,
      body: raw ? JSON.parse(raw) : undefined,
    });

    if (req.method === "GET" && url.pathname === "/v1/computer/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      for (const event of this.events) {
        await sleep(20);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.end();
      return;
    }

    const hit = this.routes.get(`${req.method} ${url.pathname}`);
    if (!hit) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: { code: "not_found", message: url.pathname } }));
      return;
    }
    if (hit.bytes) {
      res.writeHead(hit.status ?? 200, { "content-type": hit.contentType ?? "application/octet-stream" });
      res.end(hit.bytes);
      return;
    }
    res.writeHead(hit.status ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify(hit.body));
  }

  private server!: Server;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const stub = new ComputerStub();
let home: string;
let work: string;

const TOKEN = "tok_computer123";

function cli(args: string[]) {
  return runCli(["--json", ...args], {
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

const RUN_EVENT_DONE = {
  type: "run",
  run: {
    id: "run_done",
    conversationId: "conv_1",
    messageId: "msg_1",
    task: "clean the downloads folder",
    status: "done",
    summary: "12 files sorted",
  },
};

const RUN_EVENT_FAILED = {
  type: "run",
  run: {
    id: "run_fail",
    conversationId: "conv_4",
    messageId: "msg_4",
    status: "failed",
    summary: "the shell helper is not set up",
  },
};

describe("workser computer — golden envelopes", () => {
  it("start → conversations + messages POSTs, envelope names the run (fixture: start)", async () => {
    stub.routes.set("POST /v1/computer/conversations", {
      body: { id: "conv_1", title: "clean the downloads folder" },
    });
    stub.routes.set("POST /v1/computer/conversations/conv_1/messages", {
      body: { id: "msg_1", conversationId: "conv_1" },
    });
    stub.events = [RUN_EVENT_DONE];
    const r = await cli(["computer", "run", "clean the downloads folder"]);
    expect(r.code).toBe(0);
    const creates = stub.requests.filter((q) => q.method === "POST");
    expect(creates[0]).toMatchObject({
      path: "/v1/computer/conversations",
      body: { title: "clean the downloads folder" },
    });
    expect(creates[1]).toMatchObject({
      path: "/v1/computer/conversations/conv_1/messages",
      body: { text: "clean the downloads folder", mode: "auto" },
    });
    expect(r.json).toEqual({
      ok: true,
      data: {
        conversationId: "conv_1",
        runId: "run_done",
        status: "done",
        mode: "auto",
      },
    });
  });

  it("background start rides POST /v1/computer/background", async () => {
    stub.routes.set("POST /v1/computer/background", {
      body: { id: "msg_bg", conversationId: "conv_bg" },
    });
    stub.events = [
      {
        type: "run",
        run: {
          id: "run_done",
          conversationId: "conv_bg",
          messageId: "msg_bg",
          task: "sort photos",
          status: "done",
          summary: "12 files sorted",
        },
      },
    ];
    const r = await cli(["computer", "run", "sort photos", "-m", "background"]);
    expect(r.code).toBe(0);
    expect(stub.requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/computer/background",
      body: { text: "sort photos" },
    });
    expect(r.json.data).toEqual({
      conversationId: "conv_bg",
      runId: "run_done",
      status: "done",
      mode: "background",
    });
  });

  it("status → GET /v1/computer/status (fixture: status)", async () => {
    stub.routes.set("GET /v1/computer/status", {
      body: {
        busy: true,
        activeRun: {
          id: "run_9",
          conversationId: "conv_9",
          task: "fill in the tax form",
          paused: false,
        },
        background: [{ id: "run_bg1", conversationId: "conv_3", task: "watch prices" }],
        pendingConfirm: {
          id: "cfm_1",
          runId: "run_bg1",
          question: "Allow uploading the receipts?",
          kind: "confirm",
        },
      },
    });
    const r = await cli(["computer", "status"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({ method: "GET", path: "/v1/computer/status" });
    expect(r.json.ok).toBe(true);
    expect(r.json.data.activeRun).toMatchObject({ id: "run_9", task: "fill in the tax form" });
    expect(r.json.data.pendingConfirm).toMatchObject({
      id: "cfm_1",
      question: "Allow uploading the receipts?",
    });
  });

  it("--wait stops at needs_user with the confirm payload, exit 5 (fixture: needs_user)", async () => {
    stub.routes.set("POST /v1/computer/conversations", {
      body: { id: "conv_2" },
    });
    stub.routes.set("POST /v1/computer/conversations/conv_2/messages", {
      body: { id: "msg_2", conversationId: "conv_2" },
    });
    stub.events = [
      {
        type: "run",
        run: { id: "run_ask", conversationId: "conv_2", messageId: "msg_2", status: "running" },
      },
      {
        type: "confirm",
        confirm: {
          id: "cfm_7",
          runId: "run_ask",
          question: "Delete the 1,240 archived rows?",
          kind: "confirm",
          choices: ["Allow once", "Always for this folder"],
        },
      },
    ];
    const r = await cli(["computer", "run", "clean the archive", "--wait"]);
    expect(r.code).toBe(5);
    expect(r.json).toEqual({
      ok: true,
      data: {
        runId: "run_ask",
        conversationId: "conv_2",
        status: "needs_user",
        confirm: {
          id: "cfm_7",
          runId: "run_ask",
          question: "Delete the 1,240 archived rows?",
          kind: "confirm",
          choices: ["Allow once", "Always for this folder"],
        },
      },
    });
  });

  it("--wait resolves completed with a summary, exit 0 (fixture: completed)", async () => {
    stub.routes.set("POST /v1/computer/conversations", { body: { id: "conv_3" } });
    stub.routes.set("POST /v1/computer/conversations/conv_3/messages", {
      body: { id: "msg_3", conversationId: "conv_3" },
    });
    stub.events = [
      {
        type: "run",
        run: {
          id: "run_done",
          conversationId: "conv_3",
          messageId: "msg_3",
          task: "clean the downloads folder",
          status: "done",
          summary: "12 files sorted",
        },
      },
    ];
    const r = await cli(["computer", "run", "clean the downloads folder", "--wait", "--timeout", "10"]);
    expect(r.code).toBe(0);
    expect(r.json.data).toEqual({
      runId: "run_done",
      conversationId: "conv_3",
      status: "done",
      summary: "12 files sorted",
    });
  });

  it("--wait resolves failed with exit 1 (fixture: failed)", async () => {
    stub.routes.set("POST /v1/computer/conversations", { body: { id: "conv_4" } });
    stub.routes.set("POST /v1/computer/conversations/conv_4/messages", {
      body: { id: "msg_4", conversationId: "conv_4" },
    });
    stub.events = [RUN_EVENT_FAILED];
    const r = await cli(["computer", "run", "do the impossible", "--wait"]);
    expect(r.code).toBe(1);
    expect(r.json.ok).toBe(true);
    expect(r.json.data).toEqual({
      runId: "run_fail",
      conversationId: "conv_4",
      status: "failed",
      summary: "the shell helper is not set up",
    });
  });

  it("stop posts runs/:id/stop and is idempotent (fixture: stop)", async () => {
    stub.routes.set("POST /v1/computer/runs/run_5/stop", { body: { stopped: true } });
    const r = await cli(["computer", "stop", "run_5"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({
      method: "POST",
      path: "/v1/computer/runs/run_5/stop",
    });
    expect(r.json).toEqual({ ok: true, data: { id: "run_5", stopped: true } });
  });

  it("stop on an already-ended run still answers ok (fixture: stop, second call)", async () => {
    stub.routes.set("POST /v1/computer/runs/run_5/stop", { status: 404, body: { error: "No such run" } });
    const r = await cli(["computer", "stop", "run_5"]);
    expect(r.code).toBe(0);
    expect(r.json).toEqual({ ok: true, data: { id: "run_5", stopped: false } });
  });

  it("artifacts list (fixture: artifact)", async () => {
    stub.routes.set("GET /v1/computer/artifacts", {
      body: [
        {
          id: "art_1",
          kind: "text",
          title: "sorted-downloads.md",
          mime: "text/markdown",
          size: 812,
          conversationId: "conv_1",
          runId: "run_done",
          createdAt: "2026-09-19T10:00:00.000Z",
          workspacePath: "/Users/demo/Downloads/sorted-downloads.md",
        },
      ],
    });
    const r = await cli(["computer", "artifacts"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({ method: "GET", path: "/v1/computer/artifacts" });
    expect(r.json.data[0]).toMatchObject({ id: "art_1", kind: "text", runId: "run_done" });
  });

  it("artifacts get downloads the raw file", async () => {
    stub.routes.set("GET /v1/computer/artifacts/art_1/raw", {
      bytes: Buffer.from("artifact-bytes"),
      contentType: "text/markdown",
    });
    const out = join(work, "artifact.md");
    const r = await cli(["computer", "artifacts", "get", "art_1", "-o", out]);
    expect(r.code).toBe(0);
    expect(r.json.data).toEqual({ id: "art_1", path: out });
    expect(readFileSync(out, "utf8")).toBe("artifact-bytes");
  });

  it("show re-reads a conversation after the CLI process restart", async () => {
    stub.routes.set("GET /v1/computer/conversations/conv_1", {
      body: {
        id: "conv_1",
        title: "clean the downloads folder",
        messages: [{ id: "m1", role: "user", content: "clean the downloads folder" }],
        runs: [
          {
            id: "run_done",
            conversationId: "conv_1",
            status: "done",
            summary: "12 files sorted",
            steps: [],
          },
        ],
        artifacts: [],
      },
    });
    const r = await cli(["computer", "show", "conv_1"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({
      method: "GET",
      path: "/v1/computer/conversations/conv_1",
    });
    expect(r.json.data).toMatchObject({
      id: "conv_1",
      title: "clean the downloads folder",
    });
    expect(r.json.data.runs[0]).toMatchObject({ id: "run_done", status: "done" });
  });

  it("confirm answers a needs_user question", async () => {
    stub.routes.set("POST /v1/computer/confirm/cfm_7", { body: { ok: true } });
    const r = await cli(["computer", "confirm", "cfm_7", "--allow"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({
      method: "POST",
      path: "/v1/computer/confirm/cfm_7",
      body: { allowed: true },
    });
    expect(r.json.ok).toBe(true);
  });

  it("list conversations and list routines", async () => {
    stub.routes.set("GET /v1/computer/conversations", {
      body: [{ id: "conv_1", title: "clean the downloads folder", messageCount: 4 }],
    });
    stub.routes.set("GET /v1/computer/routines", {
      body: [
        { id: "rt_1", name: "morning brief", purpose: "Summarise my inbox every morning" },
      ],
    });
    const r = await cli(["computer", "list"]);
    expect(r.code).toBe(0);
    expect(r.json.data[0]).toMatchObject({ id: "conv_1", title: "clean the downloads folder" });

    const rr = await cli(["computer", "routines"]);
    expect(rr.code).toBe(0);
    expect(rr.json.data[0]).toMatchObject({ id: "rt_1", name: "morning brief" });
  });

  it("an unknown --mode is refused before any network call", async () => {
    const r = await cli(["computer", "run", "x", "-m", "quantum"]);
    expect(r.code).not.toBe(0);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.message).toContain("--mode");
    expect(stub.requests).toHaveLength(0);
  });
});
