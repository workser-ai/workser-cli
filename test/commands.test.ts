import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DaemonStub } from "./daemon-stub.js";
import { runCli } from "./run-cli.js";

const stub = new DaemonStub();
let home: string;
let work: string;

const TOKEN = "tok_abcdef123456";

/** Run a CLI command against the stub with --json, hermetic HOME + cwd. */
function cli(
  args: string[],
  extra: { cwd?: string; env?: Record<string, string> } = {},
) {
  return runCli(["--json", ...args], {
    endpoint: stub.endpoint,
    token: TOKEN,
    home,
    cwd: extra.cwd ?? work,
    env: extra.env,
  });
}

beforeAll(async () => {
  await stub.start();
  home = mkdtempSync(join(tmpdir(), "workser-home-"));
  work = mkdtempSync(join(tmpdir(), "workser-work-"));
});

afterAll(async () => {
  await stub.stop();
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

afterEach(() => stub.reset());

describe("request shapes + --json envelope", () => {
  it("status → GET /v1/status?project=:id", async () => {
    const r = await cli(["status", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/status");
    expect(req.query.project).toBe("p_1");
    expect(req.authorization).toBe(`Bearer ${TOKEN}`);
    expect(r.json.ok).toBe(true);
    expect(r.json.data.project.id).toBe("p_1");
  });

  it("an Orbit agent run identifies itself to the local daemon", async () => {
    const r = await cli(["status", "--project", "p_1"], {
      env: { WORKSER_RUN_ID: "conversation-123" },
    });

    expect(r.code).toBe(0);
    expect(stub.lastRequest?.runId).toBe("conversation-123");
  });

  it("project show → GET /v1/projects/:id (the pinned project)", async () => {
    const r = await cli(["project", "show", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1");
    expect(r.json.data.id).toBe("p_1");
  });

  it("env set → POST /v1/projects/:id/env {vars:[{key,value}]}", async () => {
    const r = await cli([
      "env",
      "set",
      "API_KEY=sk-123",
      "NODE_ENV=prod",
      "--project",
      "p_1",
    ]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1/projects/p_1/env");
    expect(req.body).toEqual({
      vars: [
        { key: "API_KEY", value: "sk-123" },
        { key: "NODE_ENV", value: "prod" },
      ],
    });
    expect(r.json.data.count).toBe(2);
  });

  it("env list → GET /v1/projects/:id/env (masked)", async () => {
    const r = await cli(["env", "list", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/env");
    expect(r.json.data[0]).toHaveProperty("masked");
  });

  it("env get → GET /v1/projects/:id/env/:key (reveals value)", async () => {
    const r = await cli(["env", "get", "API_KEY", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/env/API_KEY");
    expect(r.json.data).toMatchObject({
      key: "API_KEY",
      value: "secret-value",
    });
  });

  // Env is app-scoped (1 app = 1 repo = 1 Vercel project). `--app` targets one;
  // omitting it keeps the server's primary-app default, so the three tests
  // above must continue to send NO webAppId — that's the back-compat contract.
  it("env set --app → POST /v1/projects/:id/env with webAppId", async () => {
    const r = await cli([
      "env",
      "set",
      "API_KEY=sk-123",
      "--project",
      "p_1",
      "--app",
      "wa_2",
    ]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1/projects/p_1/env");
    expect(req.query).toMatchObject({ webAppId: "wa_2" });
    expect(req.body).toEqual({ vars: [{ key: "API_KEY", value: "sk-123" }] });
  });

  it("env list --app → GET /v1/projects/:id/env with webAppId", async () => {
    const r = await cli(["env", "list", "--project", "p_1", "--app", "wa_2"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest!.query).toMatchObject({ webAppId: "wa_2" });
  });

  it("env get --app → GET /v1/projects/:id/env/:key with webAppId", async () => {
    const r = await cli([
      "env",
      "get",
      "API_KEY",
      "--project",
      "p_1",
      "--app",
      "wa_2",
    ]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.path).toBe("/v1/projects/p_1/env/API_KEY");
    expect(req.query).toMatchObject({ webAppId: "wa_2" });
  });

  it("env set without --app sends NO webAppId (back-compat default)", async () => {
    const r = await cli(["env", "set", "API_KEY=sk-123", "--project", "p_1"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest!.query).not.toHaveProperty("webAppId");
  });

  it("deploy --json → POST /v1/projects/:id/deploy {prod, cwd}", async () => {
    const r = await cli(["deploy", "--prod", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1/projects/p_1/deploy");
    expect(req.body).toMatchObject({ prod: true });
    expect((req.body as any).cwd).toBeTypeOf("string");
    expect(r.json).toEqual({
      ok: true,
      data: { id: "d_new", status: "building" },
    });
  });

  it("whoami → GET /v1/whoami", async () => {
    const r = await cli(["whoami"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/whoami");
    expect(req.query).toEqual({});
    expect(r.json.data.email).toBe("khemmapich@gmail.com");
    expect(r.json.data.workspace).toMatchObject({
      id: "w_1",
      name: "Acme",
      defaultProjectId: "p_1",
    });
  });

  it("logs → GET /v1/projects/:id/logs?lines (entries + cursor shape)", async () => {
    const r = await cli(["logs", "--lines", "50", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/logs");
    expect(req.query.lines).toBe("50");
    expect(Array.isArray(r.json.data.entries)).toBe(true);
    expect(r.json.data.entries[0]).toMatchObject({
      ts: "t0",
      level: "info",
      message: "hello",
    });
    expect(r.json.data.cursor).toBe("c1");
  });

  it("domain list → GET /v1/projects/:id/domains", async () => {
    const r = await cli(["domain", "list", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/domains");
    expect(Array.isArray(r.json.data)).toBe(true);
    expect(r.json.data[0]).toMatchObject({
      domain: "example.com",
      status: "active",
    });
  });

  it("storage list → GET /v1/projects/:id/storage", async () => {
    const r = await cli(["storage", "list", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/storage");
    expect(Array.isArray(r.json.data)).toBe(true);
    expect(r.json.data[0]).toMatchObject({ bucket: "demo-bucket" });
  });

  it("auth status → GET /v1/projects/:id/auth (with Neon auth mode)", async () => {
    const r = await cli(["auth", "status", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/auth");
    expect(r.json.data).toMatchObject({
      enabled: true,
      providers: ["email"],
      authMode: "self_hosted",
    });
  });

  it("db url → GET /v1/projects/:id/databases/connection-string ({connection_string})", async () => {
    const r = await cli(["db", "url", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/databases/connection-string");
    expect(r.json.data).toMatchObject({
      connection_string: "postgres://u:p@host/db",
      role: "workser_app_x",
      scoped: true,
    });
    // The human line prints the connection string; the value is present.
    expect(r.stdout).toContain("postgres://u:p@host/db");
  });

  it("db list → GET /v1/projects/:id/databases", async () => {
    const r = await cli(["db", "list", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/databases");
    expect(Array.isArray(r.json.data)).toBe(true);
    expect(r.json.data[0]).toMatchObject({
      name: "demo-db",
      region: "us-east-1",
      status: "ready",
    });
  });

  it("deploy status → GET /v1/projects/:id/deployments/latest", async () => {
    const r = await cli(["deploy", "status", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/deployments/latest");
    expect(r.json.data).toMatchObject({
      id: "d_1",
      status: "ready",
      url: "https://demo.workser.app",
    });
  });

  it("deploy status <id> → GET /v1/deployments/:id", async () => {
    const r = await cli(["deploy", "status", "d_42", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/deployments/d_42");
    expect(r.json.data).toMatchObject({ id: "d_42", status: "ready" });
  });

  it("versions → GET /v1/projects/:id/versions (array of versions)", async () => {
    const r = await cli(["versions", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/versions");
    expect(Array.isArray(r.json.data)).toBe(true);
    expect(r.json.data).toHaveLength(2);
    expect(r.json.data[0]).toMatchObject({
      ref: "a1b2c3d4e5f6",
      branch: "main",
      message: "ship landing page",
      createdAt: "2026-06-17T10:00:00.000Z",
      deployed: true,
      url: "https://demo.workser.app",
    });
    expect(r.json.data[1].deployed).toBe(false);
  });

  it("agent list → GET /v1/agents (main agent + roles)", async () => {
    const r = await cli(["agent", "list"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/agents");
    expect(r.json.data.mainAgent).toBe("claude_code");
    expect(Array.isArray(r.json.data.roles)).toBe(true);
    expect(r.json.data.roles).toHaveLength(2);
    expect(r.json.data.roles[0]).toMatchObject({ role: "qa", agent: "codex" });
    expect(r.json.data.roles[1]).toMatchObject({
      role: "designer",
      agent: "claude_code",
    });
  });

  it("agent main → GET /v1/agents (main + backup agent)", async () => {
    const r = await cli(["agent", "main"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/agents");
    expect(r.json.data).toEqual({
      mainAgent: "claude_code",
      backupAgent: "codex",
    });
  });

  it("agent run → POST /v1/agents/run {role, task} (joins task args, prints output)", async () => {
    const r = await cli(["agent", "run", "qa", "review", "the", "diff"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1/agents/run");
    expect(req.body).toEqual({ role: "qa", task: "review the diff" });
    expect(r.json.data).toMatchObject({
      role: "qa",
      agent: "codex",
      output: "ran qa on the task",
      exitCode: 0,
    });
  });

  it("agent run → non-zero subagent exitCode reflected in CLI exit code", async () => {
    stub.overrides.set("POST /v1/agents/run", {
      body: { role: "qa", agent: "codex", output: "found issues", exitCode: 2 },
    });
    const r = await cli(["agent", "run", "qa", "review"]);
    expect(r.code).toBe(2);
    expect(r.json.ok).toBe(true);
    expect(r.json.data.exitCode).toBe(2);
  });
});

describe("storage objects (operate inside the bucket)", () => {
  it("storage ls → GET /v1/projects/:id/storage/files?prefix (flat array w/ url)", async () => {
    const r = await cli(["storage", "ls", "data", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/storage/files");
    expect(req.query.prefix).toBe("data");
    expect(Array.isArray(r.json.data)).toBe(true);
    expect(r.json.data[0]).toMatchObject({ key: "data.json", size: 512 });
    expect(r.json.data[0].url).toContain("/_obj/");
  });

  it("storage put → POST /v1/projects/:id/storage/upload-base64 {filename, folder, dataBase64}", async () => {
    const file = join(work, "hello.txt");
    rmSync(file, { force: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, "hello world");
    const r = await cli([
      "storage",
      "put",
      file,
      "uploads/hello.txt",
      "--project",
      "p_1",
    ]);
    expect(r.code).toBe(0);
    const up = stub.find("POST", "/v1/projects/p_1/storage/upload-base64")!;
    expect(up.body).toMatchObject({
      filename: "hello.txt",
      folder: "uploads",
      dataBase64: Buffer.from("hello world").toString("base64"),
    });
    expect(r.json.data).toMatchObject({ key: "uploads/hello.txt" });
  });

  it("storage put (no folder) → folder omitted", async () => {
    const file = join(work, "root.txt");
    rmSync(file, { force: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, "x");
    const r = await cli([
      "storage",
      "put",
      file,
      "root.txt",
      "--project",
      "p_1",
    ]);
    expect(r.code).toBe(0);
    const up = stub.find("POST", "/v1/projects/p_1/storage/upload-base64")!;
    expect(up.body).toMatchObject({ filename: "root.txt" });
    expect((up.body as any).folder).toBeUndefined();
  });

  it("storage get (no dest) → looks up the object and prints its URL", async () => {
    const r = await cli(["storage", "get", "logo.png", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.find("GET", "/v1/projects/p_1/storage/files")!;
    expect(req.query.prefix).toBe("logo.png");
    expect(r.json.data.url).toContain("/_obj/");
  });

  it("storage get <dest> → downloads bytes to the dest file", async () => {
    const dest = join(work, "out.bin");
    rmSync(dest, { force: true });
    const r = await cli([
      "storage",
      "get",
      "logo.png",
      dest,
      "--project",
      "p_1",
    ]);
    expect(r.code).toBe(0);
    expect(readFileSync(dest, "utf8")).toBe("object-bytes");
    expect(r.json.data).toMatchObject({ key: "logo.png", dest });
  });

  it("storage get (missing key) → not_found exit 1", async () => {
    const r = await cli(["storage", "get", "nope.bin", "--project", "p_1"]);
    expect(r.code).toBe(1);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("not_found");
  });
});

describe("provisioning (operate within the pinned project)", () => {
  it("db create → POST /v1/projects/:id/provision/database", async () => {
    const r = await cli(["db", "create", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1/projects/p_1/provision/database");
    expect(r.json.data).toMatchObject({ created: true, name: "demo-db" });
  });

  it("db create (already provisioned) → created:false", async () => {
    stub.overrides.set("POST /v1/projects/p_1/provision/database", {
      body: { created: false, name: "demo-db", status: "active" },
    });
    const r = await cli(["db", "create", "--project", "p_1"]);
    expect(r.code).toBe(0);
    expect(r.json.data.created).toBe(false);
  });

  it("auth enable → POST /v1/projects/:id/provision/auth", async () => {
    const r = await cli(["auth", "enable", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1/projects/p_1/provision/auth");
    expect(r.json.data).toMatchObject({ created: true, enabled: true });
  });

  it("storage create → POST /v1/projects/:id/provision/storage {name}", async () => {
    const r = await cli(["storage", "create", "assets", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1/projects/p_1/provision/storage");
    expect(req.body).toMatchObject({ name: "assets" });
    expect(r.json.data).toMatchObject({ created: true, bucket: "assets" });
  });
});

describe("neon postgres browser", () => {
  it("db tables → GET /v1/projects/:id/db/tables", async () => {
    const r = await cli(["db", "tables", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/db/tables");
    expect(r.json.data[0]).toMatchObject({
      table_name: "users",
      column_count: 4,
    });
  });

  it("db schema <table> → GET /v1/projects/:id/db/tables/:t/schema", async () => {
    const r = await cli(["db", "schema", "users", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/db/tables/users/schema");
    expect(r.json.data[0]).toMatchObject({
      column_name: "id",
      data_type: "uuid",
    });
  });

  it("db data <table> → GET /v1/projects/:id/db/tables/:t/data?limit&offset", async () => {
    const r = await cli([
      "db",
      "data",
      "users",
      "--limit",
      "10",
      "--offset",
      "5",
      "--project",
      "p_1",
    ]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects/p_1/db/tables/users/data");
    expect(req.query.limit).toBe("10");
    expect(req.query.offset).toBe("5");
    expect(r.json.data).toMatchObject({ total: 3, limit: 10, offset: 5 });
    expect(r.json.data.rows).toHaveLength(2);
  });

  it("db query <sql> → POST /v1/projects/:id/db/query {query}", async () => {
    const r = await cli(["db", "query", "select 1 as n", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1/projects/p_1/db/query");
    expect(req.body).toEqual({ query: "select 1 as n" });
    expect(r.json.data).toEqual([{ n: 1 }]);
  });
});

describe("project list (read-only workspace browse)", () => {
  it("project list → GET /v1/projects (marks the pinned one)", async () => {
    const r = await cli(["project", "list", "--project", "p_1"]);
    expect(r.code).toBe(0);
    const req = stub.lastRequest!;
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/projects");
    expect(Array.isArray(r.json.data)).toBe(true);
    expect(r.json.data.map((p: any) => p.id)).toContain("p_1");
  });
});

describe("owner-only boundary (agent cannot administer the project set / destroy config)", () => {
  // Each must refuse with exit 6 + code "owner_only" and make NO network call.
  const cases: Array<{ name: string; argv: string[] }> = [
    { name: "project create", argv: ["project", "create", "blog"] },
    { name: "project use", argv: ["project", "use", "p_2"] },
    { name: "env rm", argv: ["env", "rm", "API_KEY", "--project", "p_1"] },
    {
      name: "domain set",
      argv: ["domain", "set", "example.com", "--project", "p_1"],
    },
  ];

  for (const c of cases) {
    it(`${c.name} → owner_only (exit 6), no network call`, async () => {
      const before = stub.requests.length;
      const r = await cli(c.argv);
      expect(r.code).toBe(6);
      expect(r.json.ok).toBe(false);
      expect(r.json.error.code).toBe("owner_only");
      // The blocked command must never reach the daemon.
      expect(stub.requests.length).toBe(before);
    });
  }
});

describe("deploy --watch polling", () => {
  it("polls GET /v1/deployments/:id until terminal, then stops", async () => {
    // building (poll 0), building (poll 1), ready (poll 2) → 3 GETs total.
    stub.buildingPolls = 2;
    const r = await cli(["deploy", "--watch", "--project", "p_1"]);
    expect(r.code).toBe(0);

    // First request is the deploy POST returning {id:"d_new", status:"building"}.
    const post = stub.find("POST", "/v1/projects/p_1/deploy")!;
    expect(post.method).toBe("POST");

    // Then it polls the new deploy id until "ready".
    const polls = stub.requests.filter(
      (q) => q.method === "GET" && q.path === "/v1/deployments/d_new",
    );
    expect(polls.length).toBe(3);

    // Stops on the terminal status and returns it.
    expect(r.json).toEqual({
      ok: true,
      data: { id: "d_new", status: "ready", url: "https://demo.workser.app" },
    });
  });
});

describe("exit codes", () => {
  it("ok → exit 0", async () => {
    const r = await cli(["status", "--project", "p_1"]);
    expect(r.code).toBe(0);
  });

  it("unauthorized (401) → exit 3", async () => {
    stub.fault = "unauthorized";
    const r = await cli(["status", "--project", "p_1"]);
    expect(r.code).toBe(3);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("unauthorized");
  });

  it("not_connected (dropped connection) → exit 4", async () => {
    stub.fault = "connection";
    const r = await cli(["status", "--project", "p_1"]);
    expect(r.code).toBe(4);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("not_connected");
  });

  it("awaiting_approval (423) → exit 5", async () => {
    stub.fault = "awaiting_approval";
    const r = await cli(["deploy", "--prod", "--project", "p_1"]);
    expect(r.code).toBe(5);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("awaiting_approval");
  });

  it("nested daemon error { error:{code,message} } is surfaced cleanly (not [object Object])", async () => {
    stub.overrides.set("GET /v1/projects/p_1/databases/connection-string", {
      status: 404,
      body: {
        ok: false,
        error: {
          code: "not_provisioned",
          message: "connection not provisioned yet",
        },
      },
    });
    const r = await cli(["db", "url", "--project", "p_1"]);
    expect(r.code).toBe(1);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("not_provisioned");
    expect(r.json.error.message).toBe("connection not provisioned yet");
  });

  it("no_project (missing project) → exit 1", async () => {
    const empty = mkdtempSync(join(tmpdir(), "workser-noproj-"));
    const r = await cli(["env", "list"], { cwd: empty });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("no_project");
    rmSync(empty, { recursive: true, force: true });
  });
});

describe("doctor", () => {
  it("reports endpoint, mode, masked token, and project without a network call", async () => {
    const before = stub.requests.length;
    const r = await cli(["doctor", "--project", "p_1"]);
    expect(r.code).toBe(0);
    // doctor must not hit the daemon.
    expect(stub.requests.length).toBe(before);
    expect(r.json.data.endpoint).toBe(stub.endpoint);
    expect(r.json.data.mode).toBe("daemon");
    expect(r.json.data.token.present).toBe(true);
    expect(r.json.data.token.masked).not.toContain(TOKEN);
    expect(r.json.data.token.masked).toContain("tok");
    expect(r.json.data.project.id).toBe("p_1");
  });
});

/**
 * The SDLC surfaces — Board, Docs, project Memory, brand.
 *
 * These shipped create-only, and the cost was a cockpit that lied: a Board
 * still reading 0/0/0/0 after the feature was built and published, and
 * decisions written to a log nothing ever read back. The reads and the status
 * transitions are what make those panels reflect reality, so they are what
 * these tests pin down.
 */
describe("SDLC surfaces", () => {
  it("board list → GET the work items, filterable by status", async () => {
    const all = await cli(["board", "list", "--project", "p_1"]);
    expect(all.code).toBe(0);
    expect(stub.lastRequest!.method).toBe("GET");
    expect(stub.lastRequest!.path).toBe("/v1/projects/p_1/work-items");
    expect(all.json.data).toHaveLength(2);

    // The daemon's list route takes no filter params, so --status narrows
    // client-side. Assert the narrowing, not just that the call happened.
    const done = await cli(["board", "list", "--status", "done", "--project", "p_1"]);
    expect(done.json.data).toHaveLength(1);
    expect(done.json.data[0].id).toBe("wi_2");

    const labelled = await cli(["board", "list", "--label", "bug", "--project", "p_1"]);
    expect(labelled.json.data.map((r: { id: string }) => r.id)).toEqual(["wi_1"]);
  });

  it("board move / close → PATCH the card's status", async () => {
    const moved = await cli(["board", "move", "wi_1", "in-progress", "--project", "p_1"]);
    expect(moved.code).toBe(0);
    expect(stub.lastRequest!.method).toBe("PATCH");
    expect(stub.lastRequest!.path).toBe("/v1/projects/p_1/work-items/wi_1");
    expect(stub.lastRequest!.body).toEqual({ status: "in-progress" });

    const closed = await cli(["board", "close", "wi_1", "--project", "p_1"]);
    expect(closed.code).toBe(0);
    expect(stub.lastRequest!.body).toEqual({ status: "done" });
    expect(closed.json.data.status).toBe("done");
  });

  it("board rejects an unknown status before calling the daemon", async () => {
    const r = await cli(["board", "move", "wi_1", "shipped", "--project", "p_1"]);
    expect(r.code).not.toBe(0);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.message).toContain("backlog");
    // A bad status must not reach the network at all.
    expect(stub.requests.filter((q) => q.method === "PATCH")).toHaveLength(0);
  });

  it("board update sends only the fields it was given", async () => {
    const r = await cli([
      "board", "update", "wi_1", "--priority", "urgent", "--label", "auth", "--project", "p_1",
    ]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest!.body).toEqual({ priority: "urgent", labels: ["auth"] });
  });

  it("board update with no fields fails instead of sending an empty PATCH", async () => {
    const r = await cli(["board", "update", "wi_1", "--project", "p_1"]);
    expect(r.code).not.toBe(0);
    expect(r.json.error.message).toContain("Nothing to update");
    expect(stub.requests.filter((q) => q.method === "PATCH")).toHaveLength(0);
  });

  it("decision list / show → the read side of project memory", async () => {
    const list = await cli(["decision", "list", "--project", "p_1"]);
    expect(list.code).toBe(0);
    expect(stub.lastRequest!.path).toBe("/v1/projects/p_1/architecture-decisions");
    expect(list.json.data[0].title).toBe("Use Postgres");

    const show = await cli(["decision", "show", "dec_1", "--project", "p_1"]);
    expect(show.code).toBe(0);
    expect(show.json.data.consequences).toContain("provision");
  });

  it("requirement update → PATCH, the one memory entity that legitimately moves", async () => {
    const r = await cli(["requirement", "update", "req_1", "--status", "done", "--project", "p_1"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest!.method).toBe("PATCH");
    expect(stub.lastRequest!.path).toBe("/v1/projects/p_1/requirements/req_1");
    expect(stub.lastRequest!.body).toEqual({ status: "done" });
  });

  it("doc list / update → revise the page that exists", async () => {
    const list = await cli(["doc", "list", "--project", "p_1"]);
    expect(list.code).toBe(0);
    expect(list.json.data[0].filePath).toBe(".workser/docs/doc_1.md");

    const linked = await cli(["doc", "list", "--work-item", "wi_1", "--project", "p_1"]);
    expect(stub.lastRequest!.query.workItemId).toBe("wi_1");
    expect(linked.json.data).toHaveLength(1);

    const updated = await cli([
      "doc", "update", "doc_1", "--markdown", "# New body", "--project", "p_1",
    ]);
    expect(updated.code).toBe(0);
    expect(stub.lastRequest!.method).toBe("PATCH");
    expect(stub.lastRequest!.body).toEqual({ markdown: "# New body" });
  });

  it("doc show --markdown reports the mirror path to read", async () => {
    const r = await cli(["doc", "show", "doc_1", "--markdown", "--project", "p_1"]);
    expect(r.code).toBe(0);
    expect(r.json.data.filePath).toBe(".workser/docs/doc_1.md");
  });

  it("design show → flattens the brand tokens for the agent", async () => {
    const r = await cli(["design", "show", "--project", "p_1"]);
    expect(r.code).toBe(0);
    expect(stub.lastRequest!.method).toBe("GET");
    expect(stub.lastRequest!.path).toBe("/v1/projects/p_1/design/files");
    // The DTCG `$value` wrapper is unwrapped here, not by every caller.
    expect(r.json.data).toMatchObject({
      hasBrand: true,
      colors: { primary: "#1f7a4d" },
      fonts: { heading: "Inter" },
      brand: { name: "Green Grocer" },
    });
  });

  it("design show reports no brand rather than failing", async () => {
    // Most projects have no brand; the agent's instruction for that case is
    // "choose sensible styling", which depends on this being a success.
    stub.overrides.set("GET /v1/projects/p_1/design/files", { body: { files: [] } });
    const r = await cli(["design", "show", "--project", "p_1"]);
    expect(r.code).toBe(0);
    expect(r.json.data.hasBrand).toBe(false);
  });
});
