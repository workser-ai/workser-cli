/**
 * Does this service describe the routes it actually has?
 *
 * WHY A GATE. An API that a person can call and an API that a person can
 * INTEGRATE with are different products, and the difference is the spec. The
 * agent will happily add a fifth route and never mention it, because nothing
 * ever asked; then the customer's other app, or their integrator, or the next
 * agent, finds it by reading the source. `workser api spec --check` is the
 * question being asked, once, before the task is called done.
 *
 * WHAT IT IS NOT. Not an OpenAPI validator. It answers exactly one question —
 * is every route the repo serves also written down — and it deliberately does
 * not check parameters, schemas or responses. A gate that is right about one
 * thing gets run; a gate that reports forty schema warnings gets disabled.
 *
 * Pure over strings; the file walking lives in `commands/api.ts`.
 */

/** Where the spec is expected. First one found wins. */
export const SPEC_FILES = [
  "api/openapi.json",
  "openapi.json",
  "api/openapi.yaml",
  "openapi.yaml",
  "api/openapi.yml",
  "openapi.yml",
] as const;

export interface DiscoveredRoute {
  /** The URL path this file serves. */
  path: string;
  /** The file that serves it, so a gap names something findable. */
  file: string;
}

/**
 * Next.js App Router: `app/api/orders/route.ts` serves `/api/orders`.
 *
 * Dynamic segments are normalised to OpenAPI's own syntax — `[id]` becomes
 * `{id}` — because that is what a spec file will have written, and comparing
 * the two spellings directly would report every parameterised route as missing.
 * A catch-all (`[...slug]`) becomes `{slug}` for the same reason: it is one
 * documented path, however many segments it swallows.
 */
function fromNextRoute(file: string): string | null {
  const match = /^app\/(.*\/)?route\.(t|j)sx?$/.exec(file);
  if (!match) return null;
  const segments = (match[1] ?? "")
    .split("/")
    .filter(Boolean)
    // Route GROUPS — `(marketing)` — organise files and do not appear in a URL.
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
    .map((s) => {
      const dynamic = /^\[\.{0,3}(.+?)\]$/.exec(s);
      return dynamic ? `{${dynamic[1]}}` : s;
    });
  return `/${segments.join("/")}`.replace(/\/+$/, "") || "/";
}

/**
 * Vercel's Python runtime: `api/orders.py` serves `/api/orders`, and
 * `api/index.py` serves `/api`.
 */
function fromPythonFile(file: string): string | null {
  const match = /^api\/(.+)\.py$/.exec(file);
  if (!match) return null;
  const stem = match[1];
  if (stem === "index") return "/api";
  if (stem.endsWith("/index")) return `/api/${stem.slice(0, -"/index".length)}`;
  return `/api/${stem}`;
}

/**
 * Every route this repo serves, from its file names.
 *
 * File names only — no parsing of what is inside. Both supported runtimes route
 * by convention, so the file layout IS the routing table; reading the source
 * would add a TypeScript parser to a check whose whole value is that it is
 * cheap enough to run every time.
 */
export function discoverRoutes(files: string[]): DiscoveredRoute[] {
  const seen = new Map<string, DiscoveredRoute>();
  for (const raw of files) {
    const file = raw.replace(/^\.\//, "");
    const path = fromNextRoute(file) ?? fromPythonFile(file);
    if (!path) continue;
    if (!seen.has(path)) seen.set(path, { path, file });
  }
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The paths an OpenAPI document declares.
 *
 * JSON is parsed properly. YAML is NOT — it is read with a narrow reader that
 * pulls the keys directly under `paths:` and nothing else, because pulling a
 * YAML parser into a package that ships with two dependencies to read one
 * mapping's keys is the wrong trade. The reader's failure mode is reporting
 * fewer paths than exist, which produces a false gap the author can see and
 * fix — not a false pass, which they could not.
 */
export function specPaths(text: string | null | undefined): string[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { paths?: Record<string, unknown> };
      const paths = parsed?.paths;
      if (!paths || typeof paths !== "object") return [];
      return Object.keys(paths).filter((k) => k.startsWith("/")).sort();
    } catch {
      return [];
    }
  }

  const out: string[] = [];
  let inPaths = false;
  let indent = 0;
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const leading = line.length - line.trimStart().length;

    if (!inPaths) {
      if (/^paths\s*:/.test(line.trim()) && leading === 0) {
        inPaths = true;
        indent = -1;
      }
      continue;
    }

    // The first child sets the block's indentation; anything shallower ends it.
    if (indent === -1) {
      if (leading === 0) break;
      indent = leading;
    }
    if (leading < indent) break;
    if (leading > indent) continue;

    const key = /^\s*["']?(\/[^"':]*)["']?\s*:/.exec(line);
    if (key) out.push(key[1].trim());
  }
  return [...new Set(out)].sort();
}

export interface SpecReport {
  routes: DiscoveredRoute[];
  documented: string[];
  /** Routes the repo serves that the spec does not mention. */
  missing: DiscoveredRoute[];
  /** Paths the spec mentions that the repo does not serve. */
  stale: string[];
  ok: boolean;
}

/**
 * Paths we do not require a spec entry for.
 *
 * A health probe is infrastructure rather than a product surface, and requiring
 * every service to document it produces one identical entry in every spec that
 * nobody reads. Anything else the repo serves is public API until documented
 * otherwise.
 */
const EXEMPT = new Set(["/api/health", "/health", "/api", "/"]);

export function specReport(
  routes: DiscoveredRoute[],
  documented: string[],
): SpecReport {
  const declared = new Set(documented);
  const served = new Set(routes.map((r) => r.path));

  const missing = routes.filter(
    (r) => !declared.has(r.path) && !EXEMPT.has(r.path),
  );
  // Stale entries are REPORTED but do not fail the gate: a spec may describe a
  // route that is deployed elsewhere, or one being written next. Failing on it
  // would make the check something to be worked around.
  const stale = documented.filter((p) => !served.has(p)).sort();

  return {
    routes,
    documented: [...declared].sort(),
    missing,
    stale,
    ok: missing.length === 0,
  };
}

/** One sentence a person — or an agent reading stderr — can act on. */
export function specSummary(report: SpecReport, specFile: string | null): string {
  if (!specFile) {
    return `This service has no API description. Write one at ${SPEC_FILES[0]} listing the routes it serves.`;
  }
  if (report.ok) {
    const n = report.routes.length;
    return n === 1
      ? `The one route this service has is described in ${specFile}.`
      : `All ${n} routes are described in ${specFile}.`;
  }
  const names = report.missing.map((m) => m.path).join(", ");
  return `${report.missing.length} route${report.missing.length === 1 ? " is" : "s are"} not described in ${specFile}: ${names}`;
}
