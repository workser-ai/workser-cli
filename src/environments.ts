/**
 * "Which environment?" — one vocabulary, four commands.
 *
 * THE GAP THIS CLOSES. `deploy` took `--prod`, `env` took no environment at
 * all, and `logs` had none either. So an agent could truthfully say "the
 * variable is set" while production had never seen it, and "the deploy went
 * out" while only preview moved. Those are the two sentences that turn into an
 * owner staring at a broken site being told everything is fine.
 *
 * THE ONE ASYMMETRY, AND IT IS REAL. There are THREE environments for an
 * environment variable (Vercel's own targets: production, preview, development)
 * and only TWO for a deployment — nothing is ever built or deployed to
 * `development`; it is the local `vercel dev` target. So:
 *
 *   `env --env development`     works
 *   `deploy --env development`  is refused, with the reason
 *   `logs --env development`    is refused, with the reason
 *
 * Silently mapping `development` to `preview` was the alternative and it is the
 * worse one: someone asking about development would be shown preview and told
 * nothing, which is exactly the class of quiet substitution this whole file
 * exists to stop.
 */

export const ENVIRONMENTS = ["development", "preview", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** The two an app is ever BUILT into. */
export const DEPLOY_ENVIRONMENTS = ["preview", "production"] as const;
export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];

/**
 * The spellings people and agents actually type.
 *
 * `dev`/`prod` because everyone types them; `main`/`live` because that is what
 * the product's own screens call production, and a CLI that refuses its own
 * vocabulary is a CLI people stop trusting.
 */
const ALIASES: Record<string, Environment> = {
  dev: "development",
  development: "development",
  local: "development",
  preview: "preview",
  staging: "preview",
  stage: "preview",
  test: "preview",
  prod: "production",
  production: "production",
  live: "production",
  main: "production",
};

export interface EnvironmentParse {
  ok: boolean;
  value?: Environment;
  /** Why not, in a sentence naming what to type instead. */
  error?: string;
}

export function parseEnvironment(raw: unknown): EnvironmentParse {
  if (raw === undefined || raw === null || raw === "") return { ok: true };
  const text = String(raw).trim().toLowerCase();
  const value = ALIASES[text];
  if (!value) {
    return {
      ok: false,
      error: `--env takes ${ENVIRONMENTS.join(", ")} (or dev/prod). "${raw}" is not one of them.`,
    };
  }
  return { ok: true, value };
}

/**
 * The same, for a command that can only address something deployed.
 *
 * The refusal names the reason rather than the rule: "development is not a
 * place anything is deployed" is a fact someone can act on; "invalid value" is
 * a puzzle.
 */
export function parseDeployEnvironment(
  raw: unknown,
  verb: string,
): EnvironmentParse {
  const parsed = parseEnvironment(raw);
  if (!parsed.ok || !parsed.value) return parsed;
  if (parsed.value === "development") {
    return {
      ok: false,
      error:
        `Nothing is ever deployed to development — it is the environment your app uses ` +
        `when it runs on this computer. \`${verb}\` can address preview or production.`,
    };
  }
  return parsed;
}

/**
 * Which Vercel targets a value should be written to.
 *
 * No `--env` means all three, which is what `env set` has always done, and
 * changing that default would silently un-set production for every existing
 * script the day this shipped.
 *
 * `preview` includes `development` on purpose: they are the two non-production
 * targets, they are configured together in every workflow this product has,
 * and a preview value that does not apply when the developer runs the app
 * locally is a difference nobody wants and everybody debugs.
 */
export function envTargets(environment?: Environment): Environment[] {
  if (!environment) return [...ENVIRONMENTS];
  if (environment === "preview") return ["preview", "development"];
  return [environment];
}

/** What the write actually did, said back. */
export function targetSummary(environment?: Environment): string {
  if (!environment) return "in every environment";
  if (environment === "preview") return "in preview and development";
  return `in ${environment}`;
}

/* ─────────────────────────────── urls ─────────────────────────────── */

export interface AppUrls {
  id?: string;
  name?: string;
  type?: string;
  previewUrl?: string;
  productionUrl?: string;
  /** Per-deployment host. Present in the API; never the answer to "the URL". */
  previewDeploymentUrl?: string;
  productionDeploymentUrl?: string;
}

export interface UrlRow {
  appId: string;
  appName: string;
  environment: DeployEnvironment;
  url: string | null;
  /** Why there is no URL. Null when there is one. */
  note: string | null;
}

/**
 * Every environment's address for every app, from the STABLE hosts only.
 *
 * This is the whole reason `workser urls` exists rather than people reading a
 * deploy response: the per-deployment `*.vercel.app` host in that response is
 * retired by the next deploy, and handing it to someone as "your preview URL"
 * is what produced "the preview URL changes every time". The ephemeral fields
 * are deliberately not read here — not even as a fallback, because a fallback
 * is how the wrong one gets used on exactly the days it matters.
 */
export function urlRows(apps: AppUrls[]): UrlRow[] {
  const rows: UrlRow[] = [];
  for (const app of apps) {
    const appId = typeof app?.id === "string" ? app.id : "";
    if (!appId) continue;
    const appName = (app.name ?? "").trim() || "Untitled app";
    for (const environment of DEPLOY_ENVIRONMENTS) {
      const url =
        environment === "production" ? app.productionUrl : app.previewUrl;
      rows.push({
        appId,
        appName,
        environment,
        url: url && url.trim() ? url.trim() : null,
        note: url && url.trim() ? null : noteFor(environment),
      });
    }
  }
  return rows;
}

function noteFor(environment: DeployEnvironment): string {
  return environment === "production"
    ? "not live yet — `workser deploy --env production` publishes it"
    : "no preview yet — `workser deploy` builds one";
}

export function urlsSummary(rows: UrlRow[]): string {
  if (!rows.length) return "This project has no apps yet.";
  const live = rows.filter((r) => r.environment === "production" && r.url).length;
  const apps = new Set(rows.map((r) => r.appId)).size;
  if (!live) {
    return `${apps} ${apps === 1 ? "app" : "apps"}, none live yet.`;
  }
  return `${apps} ${apps === 1 ? "app" : "apps"} — ${live} live.`;
}
