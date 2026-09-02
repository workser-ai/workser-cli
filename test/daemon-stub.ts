import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { AddressInfo } from "node:net";

/** A request the stub observed, captured for assertions in tests. */
export interface RecordedRequest {
  method: string;
  /** Path without query string, e.g. "/v1/projects". */
  path: string;
  /** Parsed query params. */
  query: Record<string, string>;
  /** Parsed JSON body, or undefined if there was none. */
  body: unknown;
  authorization?: string;
  runId?: string;
}

export type RouteHandler = (
  req: RecordedRequest,
) => { status?: number; body?: unknown } | undefined;

export interface StubOptions {
  /** Force this behavior on the NEXT matching request, then clear it. */
  fail?: "unauthorized" | "awaiting_approval" | "connection";
}

/**
 * A tiny in-process daemon implementing the Contract A routes the CLI calls.
 * Returns canned JSON, records every request, and can be told to return
 * 401 (unauthorized), 423 (awaiting_approval), or to drop the connection.
 *
 * No real network: it binds to 127.0.0.1 on an ephemeral port.
 */
export class DaemonStub {
  private server!: Server;
  readonly requests: RecordedRequest[] = [];
  /** When set, every request gets this fault until cleared. */
  fault: StubOptions["fail"] | undefined;
  /** Optional per-test overrides keyed by "METHOD /path". */
  overrides = new Map<string, { status?: number; body?: unknown }>();

  port = 0;

  /**
   * When set, `GET /v1/deployments/:id` returns "building" for the first
   * `buildingPolls` calls, then "ready" — so tests can assert --watch polling
   * stops on a terminal status. Cleared by reset().
   */
  buildingPolls = 0;
  private deploymentPolls = 0;

  get endpoint(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** The last request the stub recorded. */
  get lastRequest(): RecordedRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  /** Find a recorded request by method + path. */
  find(method: string, path: string): RecordedRequest | undefined {
    return this.requests.find((r) => r.method === method && r.path === path);
  }

  reset(): void {
    this.requests.length = 0;
    this.fault = undefined;
    this.overrides.clear();
    this.buildingPolls = 0;
    this.deploymentPolls = 0;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) => {
      this.server.listen(0, "127.0.0.1", () => resolve());
    });
    this.port = (this.server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");

    const url = new URL(req.url ?? "/", this.endpoint);
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => (query[k] = v));

    const recorded: RecordedRequest = {
      method: req.method ?? "GET",
      path: url.pathname,
      query,
      body: raw ? safeParse(raw) : undefined,
      authorization: req.headers.authorization,
      runId:
        typeof req.headers["x-workser-run-id"] === "string"
          ? req.headers["x-workser-run-id"]
          : undefined,
    };
    this.requests.push(recorded);

    // Connection fault: destroy the socket so fetch() rejects.
    if (this.fault === "connection") {
      this.fault = undefined;
      req.socket.destroy();
      return;
    }
    if (this.fault === "unauthorized") {
      this.fault = undefined;
      return json(res, 401, {
        ok: false,
        error: { code: "unauthorized", message: "Bad token" },
      });
    }
    if (this.fault === "awaiting_approval") {
      this.fault = undefined;
      return json(res, 423, {
        code: "awaiting_approval",
        message: "Approve in Orbit.",
      });
    }

    const overrideKey = `${recorded.method} ${recorded.path}`;
    const override = this.overrides.get(overrideKey);
    if (override) {
      return json(res, override.status ?? 200, override.body ?? {});
    }

    // Object-store target: `storage get` downloads object bytes from the `url`
    // the /storage/files listing handed back (pointing at this /_obj space).
    if (recorded.path.startsWith("/_obj/") && recorded.method === "GET") {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end(Buffer.from("object-bytes"));
    }

    // Stateful deploy polling: GET /v1/deployments/:id returns "building"
    // for the first `buildingPolls` calls, then a terminal "ready".
    const depGet = recorded.path.match(/^\/v1\/deployments\/([^/]+)$/);
    if (recorded.method === "GET" && depGet && this.buildingPolls > 0) {
      const n = this.deploymentPolls++;
      const status = n < this.buildingPolls ? "building" : "ready";
      return json(res, 200, {
        id: depGet[1],
        status,
        url: status === "ready" ? "https://demo.workser.app" : undefined,
      });
    }

    const result = route(recorded, this.endpoint);
    if (!result)
      return json(res, 404, {
        ok: false,
        error: { code: "not_found", message: recorded.path },
      });
    return json(res, result.status ?? 200, result.body);
  }
}

/** Canned Contract A responses for every route the tested commands hit. */
function route(
  req: RecordedRequest,
  endpoint: string,
): { status?: number; body?: unknown } | undefined {
  const { method, path } = req;

  // Memory search returns TWO row shapes from one query, interleaved. This is
  // not a fixture convenience — it is what the real backend sends, and the CLI
  // rendered every `chunk` row as a bare id until 2026-09-02. Both shapes stay
  // here so a reader of the fixture cannot mistake one for the whole contract.
  if (path.endsWith("/memory/search") && method === "GET") {
    return {
      body: {
        results: [
          {
            id: "chunkrow",
            chunk: "Design on the canvas before rebuilding the phone app.",
            similarity: 0.74,
            documents: [{ id: "doc1", title: "Design on canvas…" }],
          },
          {
            id: "wholerow",
            memory: "The homepage uses the Lattice Drive editorial layout.",
            rootMemoryId: "wholerow",
            similarity: 0.62,
          },
          // No text anywhere, but a parent document that names it.
          {
            id: "titleonly",
            documents: [{ id: "doc2", title: "A decision with no chunk text" }],
            similarity: 0.61,
          },
          // Nothing readable at all.
          { id: "emptyrow", similarity: 0.6 },
        ],
        total: 4,
      },
    };
  }

  if (path === "/v1/checkpoints") {
    if (method === "POST") {
      return {
        body: {
          point: {
            ref: "c0ffee1234567890",
            at: "2026-08-11T02:00:00.000Z",
            label: (req.body as any)?.label ?? "a manual checkpoint",
          },
        },
      };
    }
    return {
      body: {
        points: [
          {
            ref: "c0ffee1234567890",
            at: "2026-08-11T02:00:00.000Z",
            label: "before the refactor",
          },
          {
            ref: "dec0de0987654321",
            at: "2026-08-10T09:30:00.000Z",
            label: "a manual checkpoint",
          },
        ],
      },
    };
  }

  if (method === "POST" && path === "/v1/undo") {
    return { body: { ok: true, restoredTo: "beef1234", filesChanged: 3 } };
  }

  if (method === "POST" && /^\/v1\/projects\/[^/]+\/git\/sync$/.test(path)) {
    return { body: { ok: true, state: "synced", ref: "5ynced00" } };
  }

  if (method === "GET" && /^\/v1\/projects\/[^/]+\/deployments$/.test(path)) {
    return {
      body: {
        deployments: [
          {
            id: "d_2",
            version: 2,
            environment: "production",
            status: "ready",
            url: "https://shop.example",
            created_at: "2026-08-19T10:00:00.000Z",
            webAppName: "Shop",
          },
          {
            id: "d_1",
            version: 1,
            environment: "preview",
            status: "ready",
            url: "https://preview.shop.example",
            created_at: "2026-08-18T10:00:00.000Z",
            webAppName: "Shop",
          },
        ],
        total: 2,
      },
    };
  }

  if (
    method === "POST" &&
    /^\/v1\/projects\/[^/]+\/deployments\/promote$/.test(path)
  ) {
    return {
      body: {
        id: "d_3",
        version: (req.body as any)?.version ?? 3,
        environment: "production",
        status: "building",
        url: "https://shop.example",
      },
    };
  }

  if (
    method === "GET" &&
    /^\/v1\/projects\/[^/]+\/deployments\/[^/]+\/logs$/.test(path)
  ) {
    return { body: { events: [{ type: "stdout", text: "Build succeeded" }] } };
  }

  if (method === "GET" && /^\/v1\/projects\/[^/]+\/neon-branches$/.test(path)) {
    return {
      body: [
        { id: "br_live", name: "main", parent_id: null, isProjectBranch: true },
        {
          id: "br_qa",
          name: "qa-run",
          parent_id: "br_live",
          isProjectBranch: false,
        },
      ],
    };
  }
  if (
    method === "POST" &&
    /^\/v1\/projects\/[^/]+\/neon-branches$/.test(path)
  ) {
    return {
      body: { branch: { id: "br_new", name: (req.body as any)?.name } },
    };
  }
  if (
    method === "POST" &&
    /^\/v1\/projects\/[^/]+\/neon-branches\/[^/]+\/reset$/.test(path)
  ) {
    return { body: { ok: true } };
  }
  if (
    method === "DELETE" &&
    /^\/v1\/projects\/[^/]+\/neon-branches\/[^/]+$/.test(path)
  ) {
    return { body: { ok: true } };
  }
  if (
    method === "GET" &&
    /^\/v1\/projects\/[^/]+\/neon-databases$/.test(path)
  ) {
    return {
      body: [
        { name: "app", owner_name: "app_owner", isProjectDatabase: true },
        { name: "scratch", owner_name: "app_owner", isProjectDatabase: false },
      ],
    };
  }
  if (
    method === "GET" &&
    /^\/v1\/projects\/[^/]+\/neon-endpoints$/.test(path)
  ) {
    return {
      body: [
        {
          id: "ep_1",
          type: "read_write",
          current_state: "idle",
          branch_id: "br_live",
          host: "ep-1.neon.tech",
        },
      ],
    };
  }

  if (method === "GET" && /^\/v1\/projects\/[^/]+\/usage$/.test(path)) {
    return {
      body: {
        projectId: "p_1",
        organizationId: "o_1",
        tier: "starter",
        complete: false,
        dimensions: [
          {
            id: "db_storage_gb",
            label: "Database",
            used: 2.5,
            unit: "GB",
            limit: 10,
            kind: "soft",
          },
          {
            id: "file_storage_gb",
            label: "Files",
            used: null,
            unit: "GB",
            limit: 10,
            kind: "soft",
            note: "The file store could not be read just now.",
          },
          {
            id: "projects",
            label: "Projects",
            used: 2,
            unit: "count",
            limit: 2,
            kind: "hard",
          },
        ],
      },
    };
  }

  if (method === "GET" && path === "/v1/health") {
    return {
      body: {
        projectId: "p_1",
        checks: [
          {
            appId: "a_1",
            appName: "Ordering page",
            environment: "production",
            url: "https://shop.example",
            ok: true,
            status: 200,
            ms: 84,
            error: null,
            failures: 0,
            incidentOpened: false,
          },
          {
            appId: "a_1",
            appName: "Ordering page",
            environment: "preview",
            url: "https://preview.shop.example",
            ok: false,
            status: 503,
            ms: 120,
            error: "answered 503",
            failures: 2,
            incidentOpened: false,
          },
        ],
        failuresBeforeIncident: 3,
        note: null,
      },
    };
  }

  if (method === "GET" && /^\/v1\/apps\/[^/]+\/health$/.test(path)) {
    return {
      body: {
        projectId: "p_1",
        checks: [],
        failuresBeforeIncident: 3,
        note: "This app has no web address yet, so there is nothing to check.",
      },
    };
  }

  if (method === "GET" && path === "/v1/apps") {
    return {
      body: [
        {
          id: "a_1",
          name: "Shop",
          type: "web",
          status: "live",
          previewUrl: "https://preview.shop.workser.app",
          productionUrl: "https://shop.example",
          // Ephemeral. Present in the real response; `urls` must never print it.
          previewDeploymentUrl: "https://abc123.vercel.app",
          productionDeploymentUrl: "https://def456.vercel.app",
        },
        {
          id: "a_2",
          name: "Ordering bot",
          type: "ai-agent",
          status: "not_deployed",
        },
      ],
    };
  }

  if (method === "GET" && path === "/v1/whoami") {
    return {
      body: {
        id: "u_1",
        email: "khemmapich@gmail.com",
        workspace: { id: "w_1", name: "Acme", defaultProjectId: "p_1" },
      },
    };
  }

  if (method === "GET" && path === "/v1/status") {
    return {
      body: {
        user: { id: "u_1", email: "khemmapich@gmail.com" },
        workspace: { id: "w_1", name: "Acme" },
        project: {
          id: req.query.project ?? "p_1",
          name: "demo",
          url: "https://demo.workser.app",
        },
        latestDeploy: {
          id: "d_1",
          status: "ready",
          url: "https://demo.workser.app",
        },
      },
    };
  }

  if (method === "GET" && path === "/v1/projects") {
    return {
      body: [
        { id: "p_1", name: "demo", url: "https://demo.workser.app" },
        { id: "p_2", name: "blog" },
      ],
    };
  }
  if (method === "POST" && path === "/v1/projects") {
    const name = (req.body as any)?.name ?? "unnamed";
    return { body: { id: "p_new", name } };
  }
  const projGet = path.match(/^\/v1\/projects\/([^/]+)$/);
  if (method === "GET" && projGet) {
    return {
      body: { id: projGet[1], name: "demo", url: "https://demo.workser.app" },
    };
  }

  if (
    method === "POST" &&
    /^\/v1\/projects\/[^/]+\/provision\/database$/.test(path)
  ) {
    return {
      body: {
        created: true,
        name: "demo-db",
        region: "us-east-1",
        status: "ready",
      },
    };
  }
  if (
    method === "POST" &&
    /^\/v1\/projects\/[^/]+\/provision\/auth$/.test(path)
  ) {
    return { body: { created: true, enabled: true, providers: ["email"] } };
  }
  if (
    method === "POST" &&
    /^\/v1\/projects\/[^/]+\/provision\/storage$/.test(path)
  ) {
    const name = (req.body as any)?.name ?? "demo-bucket";
    return { body: { created: true, bucket: name } };
  }

  if (method === "GET" && /^\/v1\/projects\/[^/]+\/databases$/.test(path)) {
    return {
      body: [{ name: "demo-db", region: "us-east-1", status: "ready" }],
    };
  }
  if (
    method === "GET" &&
    /^\/v1\/projects\/[^/]+\/databases\/connection-string$/.test(path)
  ) {
    return {
      body: {
        connection_string: "postgres://u:p@host/db",
        role: "workser_app_x",
        scoped: true,
      },
    };
  }
  if (method === "GET" && /^\/v1\/projects\/[^/]+\/auth$/.test(path)) {
    return {
      body: {
        enabled: true,
        providers: ["email"],
        authMode: "self_hosted",
        neonAuthOwnedBy: null,
        neonAuthTransferStatus: null,
      },
    };
  }
  if (method === "GET" && /^\/v1\/projects\/[^/]+\/storage$/.test(path)) {
    return { body: [{ bucket: "demo-bucket" }] };
  }
  if (
    method === "GET" &&
    /^\/v1\/projects\/[^/]+\/storage\/files$/.test(path)
  ) {
    const prefix = req.query.prefix ?? "";
    const obj = (key: string, size: number, when: string) => ({
      key,
      size,
      lastModified: when,
      // URL points back at the stub's /_obj space so `storage get` can download.
      url: `${endpoint}/_obj/${encodeURIComponent(key)}`,
    });
    const all = [
      obj("logo.png", 2048, "2026-06-17T10:00:00.000Z"),
      obj("data.json", 512, "2026-06-17T11:00:00.000Z"),
    ];
    return { body: prefix ? all.filter((o) => o.key.startsWith(prefix)) : all };
  }
  if (
    method === "POST" &&
    /^\/v1\/projects\/[^/]+\/storage\/upload-base64$/.test(path)
  ) {
    const b = req.body as any;
    const key = b?.folder
      ? `${b.folder}/${b.filename}`
      : (b?.filename ?? "file");
    return {
      body: { url: `${endpoint}/_obj/${encodeURIComponent(key)}`, key },
    };
  }

  // Neon Postgres browser (Orbit cloud controller).
  if (method === "GET" && /^\/v1\/projects\/[^/]+\/db\/tables$/.test(path)) {
    return {
      body: [
        {
          table_name: "users",
          table_schema: "public",
          table_size: 8192,
          column_count: 4,
          row_count: 3,
        },
        {
          table_name: "posts",
          table_schema: "public",
          table_size: 4096,
          column_count: 3,
          row_count: 7,
        },
      ],
    };
  }
  const dbSchema = path.match(
    /^\/v1\/projects\/[^/]+\/db\/tables\/([^/]+)\/schema$/,
  );
  if (method === "GET" && dbSchema) {
    return {
      body: [
        {
          column_name: "id",
          data_type: "uuid",
          is_nullable: "NO",
          column_default: "gen_random_uuid()",
        },
        {
          column_name: "email",
          data_type: "text",
          is_nullable: "NO",
          column_default: null,
        },
      ],
    };
  }
  const dbData = path.match(
    /^\/v1\/projects\/[^/]+\/db\/tables\/([^/]+)\/data$/,
  );
  if (method === "GET" && dbData) {
    const limit = Number(req.query.limit ?? 100);
    const offset = Number(req.query.offset ?? 0);
    return {
      body: {
        rows: [
          { id: "u1", email: "a@x.com" },
          { id: "u2", email: "b@x.com" },
        ],
        total: 3,
        limit,
        offset,
      },
    };
  }
  if (method === "POST" && /^\/v1\/projects\/[^/]+\/db\/query$/.test(path)) {
    return { body: [{ n: 1 }] };
  }

  if (method === "GET" && /^\/v1\/projects\/[^/]+\/env$/.test(path)) {
    // Per-environment values (migration 125). With an environment named, one
    // row per key with the value that applies THERE; without, the shared value
    // plus where it differs.
    if (req.query.environment === "production") {
      return {
        body: [{ key: "API_KEY", masked: "pr•", environment: "production" }],
      };
    }
    return {
      body: [
        { key: "API_KEY", masked: "sk-•••", overriddenIn: ["production"] },
        { key: "NODE_ENV", masked: "pr•", overriddenIn: [] },
      ],
    };
  }
  if (method === "POST" && /^\/v1\/projects\/[^/]+\/env$/.test(path)) {
    const vars = (req.body as any)?.vars ?? [];
    return { body: { count: vars.length } };
  }
  const envKey = path.match(/^\/v1\/projects\/[^/]+\/env\/([^/]+)$/);
  if (method === "GET" && envKey) {
    return {
      body: { key: decodeURIComponent(envKey[1]), value: "secret-value" },
    };
  }
  if (method === "DELETE" && envKey) {
    return { body: { removed: true } };
  }

  if (method === "GET" && /^\/v1\/apps\/[^/]+\/keys$/.test(path)) {
    return {
      body: [
        {
          environment: "production",
          prefix: "wsgw_live_ab12cd",
          created_at: "2026-08-01T00:00:00.000Z",
          last_used_at: "2026-08-27T00:00:00.000Z",
        },
        {
          environment: "preview",
          prefix: "wsgw_test_ef34gh",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    };
  }
  const rotateKey = path.match(/^\/v1\/apps\/[^/]+\/keys\/([^/]+)\/rotate$/);
  if (method === "POST" && rotateKey) {
    const keyName = decodeURIComponent(rotateKey[1]);
    const environment = (req.body as any)?.environment;
    if (keyName === "AI_GATEWAY_API_KEY") {
      return {
        body: {
          key: `wsgw_${environment === "production" ? "live" : "test"}_newsecret123`,
          prefix: "wsgw_live_newsec",
          environment,
        },
      };
    }
    if (keyName === "BETTER_AUTH_SECRET") {
      return { body: { rotated: true } };
    }
    return {
      status: 400,
      body: {
        ok: false,
        error: { code: "bad_request", message: `"${keyName}" has no rotation handler.` },
      },
    };
  }

  if (method === "POST" && /^\/v1\/projects\/[^/]+\/deploy$/.test(path)) {
    return { body: { id: "d_new", status: "building", url: undefined } };
  }
  if (
    method === "GET" &&
    /^\/v1\/projects\/[^/]+\/deployments\/latest$/.test(path)
  ) {
    return {
      body: { id: "d_1", status: "ready", url: "https://demo.workser.app" },
    };
  }
  const depGet = path.match(/^\/v1\/deployments\/([^/]+)$/);
  if (method === "GET" && depGet) {
    return {
      body: { id: depGet[1], status: "ready", url: "https://demo.workser.app" },
    };
  }

  if (method === "GET" && /^\/v1\/projects\/[^/]+\/versions$/.test(path)) {
    return {
      body: [
        {
          ref: "a1b2c3d4e5f6",
          branch: "main",
          message: "ship landing page",
          createdAt: "2026-06-17T10:00:00.000Z",
          deployed: true,
          url: "https://demo.workser.app",
        },
        {
          ref: "0f9e8d7c6b5a",
          branch: "main",
          message: "wip styles",
          createdAt: "2026-06-17T09:00:00.000Z",
          deployed: false,
        },
      ],
    };
  }

  if (method === "GET" && /^\/v1\/projects\/[^/]+\/logs$/.test(path)) {
    // Environment-aware since Phase 6a: an environment nothing has been
    // deployed to answers with a NOTE, not an empty list. The empty list was
    // indistinguishable from a healthy silent build.
    if (req.query.environment === "preview") {
      return {
        body: {
          entries: [],
          environment: "preview",
          note: "Nothing has been deployed in preview yet, so there are no build logs to show.",
        },
      };
    }
    return {
      body: {
        entries: [{ ts: "t0", level: "info", message: "hello" }],
        cursor: "c1",
        deploymentId: "d_2",
        environment: req.query.environment,
      },
    };
  }

  if (method === "POST" && /^\/v1\/projects\/[^/]+\/domains$/.test(path)) {
    const domain = (req.body as any)?.domain ?? "example.com";
    return {
      body: {
        domain,
        dns: [{ type: "CNAME", name: domain, value: "cname.workser.app" }],
      },
    };
  }
  if (method === "GET" && /^\/v1\/projects\/[^/]+\/domains$/.test(path)) {
    return { body: [{ domain: "example.com", status: "active" }] };
  }

  if (method === "GET" && path === "/v1/agents") {
    return {
      body: {
        mainAgent: "claude_code",
        backupAgent: "codex",
        effectiveMainAgent: "claude_code",
        roles: [
          {
            id: "r_qa",
            role: "qa",
            agent: "codex",
            enabled: true,
            installed: true,
            authed: true,
            mcp: [{ id: "m1", name: "fs", transport: "stdio" }],
          },
          {
            id: "r_designer",
            role: "designer",
            agent: "claude_code",
            enabled: true,
            installed: true,
            authed: true,
            apps: ["figma"],
          },
        ],
      },
    };
  }
  if (method === "POST" && path === "/v1/agents/run") {
    const role = (req.body as any)?.role ?? "qa";
    const agent = role === "designer" ? "claude_code" : "codex";
    return {
      body: {
        role,
        agent,
        output: `ran ${role} on the task`,
        exitCode: 0,
        durationMs: 42,
      },
    };
  }

  if (method === "POST" && path === "/v1/project-tasks") {
    const sent = (req.body ?? {}) as Record<string, unknown>;
    return {
      status: 201,
      body: {
        id: "11111111-1111-4111-8111-111111111111",
        key: "WORKS-42",
        parent_task_id: null,
        status: "todo",
        approval_state: "awaiting",
        ...sent,
      },
    };
  }
  const projectTask = /^\/v1\/project-tasks\/([^/]+)$/.exec(path);
  if (method === "PATCH" && projectTask) {
    const sent = (req.body ?? {}) as Record<string, unknown>;
    return {
      body: {
        id: projectTask[1],
        parent_task_id: "11111111-1111-4111-8111-111111111111",
        title: "Updated subtask",
        status: "todo",
        approval_state: "approved",
        ...sent,
      },
    };
  }
  if (
    method === "POST" &&
    /^\/v1\/project-channels\/[^/]+\/messages$/.test(path)
  ) {
    return {
      status: 201,
      body: {
        id: "agent-message-1",
        authorKind: "agent",
        agentRole: (req.body as any)?.agentRole,
        attachments: (req.body as any)?.attachments ?? [],
      },
    };
  }

  // --- SDLC surfaces: Board, Docs, project Memory, brand ----------------
  //
  // The daemon scopes all of these to the pinned project, so the stub keys off
  // the resource segment rather than the project id.
  const sdlc =
    /^\/v1\/projects\/[^/]+\/(work-items|documents|architecture-decisions|requirements)(?:\/([^/]+))?$/.exec(
      path,
    );
  if (sdlc) {
    const [, resource, id] = sdlc;
    if (method === "GET" && !id) {
      if (resource === "work-items") {
        return {
          body: [
            { ...WORK_ITEM, id: "wi_1", status: "backlog", labels: ["bug"] },
            {
              ...WORK_ITEM,
              id: "wi_2",
              title: "Ship the board",
              status: "done",
              labels: [],
            },
          ],
        };
      }
      if (resource === "documents") {
        // `?workItemId=` narrows to the single linked document, matching
        // `routes/documents.ts` (which returns a 0- or 1-element array).
        return req.query.workItemId
          ? {
              body: [
                { ...DOCUMENT, id: "doc_2", workItemId: req.query.workItemId },
              ],
            }
          : { body: [DOCUMENT] };
      }
      if (resource === "architecture-decisions") return { body: [DECISION] };
      return {
        body: [REQUIREMENT, { ...REQUIREMENT, id: "req_2", status: "done" }],
      };
    }
    if (method === "GET" && id) {
      if (resource === "work-items") return { body: { ...WORK_ITEM, id } };
      if (resource === "documents") return { body: { ...DOCUMENT, id } };
      if (resource === "architecture-decisions")
        return { body: { ...DECISION, id } };
      return { body: { ...REQUIREMENT, id } };
    }
    if (method === "POST" && !id) {
      const sent = (req.body ?? {}) as Record<string, unknown>;
      return { status: 201, body: { id: `${resource}_new`, ...sent } };
    }
    if (method === "PATCH" && id) {
      const base =
        resource === "work-items"
          ? WORK_ITEM
          : resource === "documents"
            ? DOCUMENT
            : resource === "architecture-decisions"
              ? DECISION
              : REQUIREMENT;
      return { body: { ...base, id, ...((req.body ?? {}) as object) } };
    }
  }

  if (method === "GET" && /^\/v1\/projects\/[^/]+\/design\/files$/.test(path)) {
    return {
      body: {
        files: [
          {
            path: "design/tokens.json",
            contents: JSON.stringify({
              color: { primary: { $value: "#1f7a4d", $type: "color" } },
              font: { heading: { $value: "Inter", $type: "fontFamily" } },
              brand: { name: "Green Grocer" },
            }),
          },
          {
            path: "design/tokens.css",
            contents: ":root{--ws-color-primary:#1f7a4d}",
          },
        ],
      },
    };
  }

  return undefined;
}

const WORK_ITEM = {
  id: "wi_1",
  projectId: "p_1",
  title: "Fix the login bug",
  description: null,
  status: "backlog",
  priority: "normal",
  labels: [] as string[],
  ownerHuman: null,
  milestoneId: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const DOCUMENT = {
  id: "doc_1",
  projectId: "p_1",
  workItemId: null,
  title: "Onboarding",
  contentJson: "[]",
  filePath: ".workser/docs/doc_1.md",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const DECISION = {
  id: "dec_1",
  projectId: "p_1",
  title: "Use Postgres",
  context: "We needed relational queries.",
  decision: "Adopt Neon Postgres.",
  consequences: "One more service to provision.",
  status: "accepted",
  filePath: ".workser/memory/decisions/dec_1.md",
  createdAt: "2026-08-01T00:00:00.000Z",
};

const REQUIREMENT = {
  id: "req_1",
  projectId: "p_1",
  title: "Support SSO",
  body: "Enterprise customers need SAML.",
  status: "draft",
  filePath: ".workser/memory/requirements/req_1.md",
  createdAt: "2026-08-01T00:00:00.000Z",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

function safeParse(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}
