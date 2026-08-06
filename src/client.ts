import * as http from "node:http";
import type { Context } from "./context.js";
import { WorkserError } from "./errors.js";

/** The subset of a response the rest of this module reads. */
interface Reply {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
}

/**
 * One request over a Unix domain socket / Windows named pipe.
 *
 * `fetch` cannot address a socket without a custom undici dispatcher, and
 * `node:http` does it natively with no dependency — which matters because this
 * CLI ships as a single bundled file.
 *
 * The host in the URL is a placeholder: the socket path decides where the
 * request goes, and the daemon does not route on Host.
 */
function requestOverSocket(
  socketPath: string,
  pathWithQuery: string,
  init: { method: string; headers: Record<string, string>; body?: string },
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath, path: pathWithQuery, method: init.method, headers: init.headers },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (text += c));
        res.on("end", () =>
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            text,
          }),
        );
      },
    );
    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

export interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

/**
 * The single HTTP entrypoint. Every command goes through here so auth,
 * error normalization, and the `{ data }` envelope are handled in one place.
 *
 * The CLI talks to the local Orbit daemon over `/v1/*`; the daemon proxies
 * core-api's `/orbit/*` controller (identical shapes) and wraps replies in
 * `{ ok, data }`. Every route targets the ONE project pinned to the cwd.
 *
 * Reads:
 *   GET  /v1/whoami                              GET  /v1/status?project=:id
 *   GET  /v1/projects                            GET  /v1/projects/:id
 *   GET  /v1/projects/:id/databases              GET  /v1/projects/:id/databases/connection-string
 *   GET  /v1/projects/:id/auth                   GET  /v1/projects/:id/storage
 *   GET  /v1/projects/:id/storage/files?prefix   GET  /v1/projects/:id/env
 *   GET  /v1/projects/:id/env/:key               GET  /v1/projects/:id/domains
 *   GET  /v1/projects/:id/versions               GET  /v1/projects/:id/logs
 *   GET  /v1/projects/:id/deployments/latest     GET  /v1/deployments/:id
 * Neon Postgres browser:
 *   GET  /v1/projects/:id/db/tables              GET  /v1/projects/:id/db/tables/:t/schema
 *   GET  /v1/projects/:id/db/tables/:t/data      POST /v1/projects/:id/db/query {query}
 * Operate within the pinned project (daemon gates the sensitive ones):
 *   POST /v1/projects/:id/provision/{database|auth|storage}
 *   POST /v1/projects/:id/env {vars:[{key,value}]}
 *   POST /v1/projects/:id/storage/upload-base64 {filename, folder?, dataBase64}
 *   POST /v1/projects/:id/deploy {prod}
 *
 * Owner-only actions (create/switch projects, delete config, attach domains)
 * are refused client-side before any network call — see capabilities.ts.
 *
 * Allowed-but-gated actions may return HTTP 423 { code: "awaiting_approval" }
 * while the daemon waits for the user to approve in the Orbit UI.
 */
export async function api<T = any>(
  ctx: Context,
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const url = new URL(ctx.endpoint + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "workser-cli",
  };
  // Send the token whenever we HAVE one, socket or not.
  //
  // On POSIX the daemon writes no token at all once its socket is up (the 0600
  // permission is the authorization), so this is simply absent — nothing secret
  // exists on disk or passes through an agent's hands. On Windows the named
  // pipe's default DACL is readable by Everyone, so the daemon keeps requiring
  // the bearer and does write one; suppressing it here purely because a
  // socketPath was set would break every Windows call with a 401.
  if (ctx.token) headers.authorization = `Bearer ${ctx.token}`;
  // Tie daemon calls back to the structured Orbit turn that spawned this CLI.
  // The daemon looks up the active run and its user-selected autonomy; it never
  // trusts a free-form "mode" supplied in a request body. Cloud endpoints do
  // not receive this local execution identifier.
  if (ctx.mode === "daemon" && ctx.runId) {
    headers["x-workser-run-id"] = ctx.runId;
  }
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const bodyText = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;

  let res: Reply;
  try {
    if (ctx.socketPath) {
      if (bodyText !== undefined) {
        headers["content-length"] = String(Buffer.byteLength(bodyText));
      }
      res = await requestOverSocket(ctx.socketPath, url.pathname + url.search, {
        method,
        headers,
        body: bodyText,
      });
    } else {
      const r = await fetch(url, { method, headers, body: bodyText });
      res = {
        ok: r.ok,
        status: r.status,
        statusText: r.statusText,
        text: await r.text(),
      };
    }
  } catch (e) {
    throw new WorkserError(
      ctx.mode === "daemon"
        ? "Can't reach Workser Orbit (local daemon). Is the app running?"
        : `Can't reach Workser at ${ctx.endpoint}.`,
      {
        code: "not_connected",
        details: e instanceof Error ? e.message : String(e),
      },
    );
  }

  const text = res.text;
  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    // The daemon sometimes nests the real error one level down as
    // { error: { code, message } } (in addition to the flat form). Read both.
    const nested =
      data &&
      typeof data === "object" &&
      data.error &&
      typeof data.error === "object"
        ? (data.error as { code?: string; message?: string })
        : undefined;
    const code = data?.code ?? nested?.code;

    if (res.status === 423 || code === "awaiting_approval") {
      throw new WorkserError(
        data?.message ??
          nested?.message ??
          "Action is awaiting your approval in Workser Orbit.",
        { code: "awaiting_approval", status: res.status, details: data },
      );
    }
    const message =
      data?.message ||
      nested?.message ||
      (typeof data?.error === "string" ? data.error : undefined) ||
      `${res.status} ${res.statusText}`;
    throw new WorkserError(String(message), {
      code: code ?? (res.status === 401 ? "unauthorized" : "http_error"),
      status: res.status,
      details: data,
    });
  }

  // Unwrap a { data } envelope if the server uses one.
  return (
    data && typeof data === "object" && "data" in data ? data.data : data
  ) as T;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJson(t: string): any {
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t };
  }
}
