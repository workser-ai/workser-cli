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
    return {
      body: [
        { key: "API_KEY", masked: "sk-•••" },
        { key: "NODE_ENV", masked: "pr•" },
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
    return {
      body: {
        entries: [{ ts: "t0", level: "info", message: "hello" }],
        cursor: "c1",
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

  return undefined;
}

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
