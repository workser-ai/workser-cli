import type { Context } from "./context.js";
import { WorkserError } from "./errors.js";

export interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

/**
 * The single HTTP entrypoint. Every command goes through here so auth,
 * error normalization, and the `{ data }` envelope are handled in one place.
 *
 * The endpoint contract (same shape whether served by the local daemon or cloud):
 *   GET    /v1/whoami
 *   GET    /v1/status?project=:id
 *   GET    /v1/projects                         POST /v1/projects {name}
 *   POST   /v1/projects/:id/provision/database  | /auth | /storage
 *   GET    /v1/projects/:id/env                 POST /v1/projects/:id/env {key,value}
 *   POST   /v1/projects/:id/deploy {prod}       GET  /v1/deployments/:id
 *   GET    /v1/projects/:id/logs                POST /v1/projects/:id/domains {domain}
 *
 * Destructive/financial actions may return HTTP 423 { code: "awaiting_approval" }
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
  if (ctx.token) headers.authorization = `Bearer ${ctx.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new WorkserError(
      ctx.mode === "daemon"
        ? "Can't reach Workser Orbit (local daemon). Is the app running?"
        : `Can't reach Workser at ${ctx.endpoint}.`,
      { code: "not_connected", details: e instanceof Error ? e.message : String(e) },
    );
  }

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    if (res.status === 423 || data?.code === "awaiting_approval") {
      throw new WorkserError(
        data?.message ?? "Action is awaiting your approval in Workser Orbit.",
        { code: "awaiting_approval", status: res.status, details: data },
      );
    }
    const message = data?.message || data?.error || `${res.status} ${res.statusText}`;
    throw new WorkserError(String(message), {
      code: data?.code ?? (res.status === 401 ? "unauthorized" : "http_error"),
      status: res.status,
      details: data,
    });
  }

  // Unwrap a { data } envelope if the server uses one.
  return (data && typeof data === "object" && "data" in data ? data.data : data) as T;
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
