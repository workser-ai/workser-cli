/**
 * Generate `src/help-content.ts` from `skills/workser/reference/*.md`.
 *
 * WHY INLINE RATHER THAN READ FROM DISK. The CLI is distributed as a SINGLE
 * self-contained `dist/index.js` — the Orbit desktop copies exactly that one file
 * to `~/.workser/bin/workser` and puts it on the agent's PATH. There is no
 * `skills/` directory beside it, and `process.resourcesPath` layouts flatten to
 * `{index.js, SKILL.md, AGENTS.md}`. Anything resolved relative to the script
 * would work in the npm install and fail for every desktop user, which is the
 * majority of agents running these commands.
 *
 * So the guides are bundled into the binary. `workser help <topic>` then works
 * from a directory with no node_modules, offline, on every install path.
 *
 * Usage: node scripts/build-help.mjs [--check]
 *   --check  exit non-zero if the generated file is stale, write nothing
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE_DIR = path.join(ROOT, "skills", "workser", "reference");
const OUT = path.join(ROOT, "src", "help-content.ts");

/**
 * Parse the leading `--- … ---` block.
 *
 * A three-field subset of YAML, not YAML — pulling in a parser to read four keys
 * would be the wrong dependency for a package that deliberately ships with two.
 */
function parseFrontmatter(text, file) {
  if (!text.startsWith("---\n")) {
    throw new Error(`${file}: missing frontmatter`);
  }
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) throw new Error(`${file}: unterminated frontmatter`);

  const meta = {};
  for (const raw of text.slice(4, end).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) throw new Error(`${file}: unparseable frontmatter line "${line}"`);
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    meta[key] =
      value.startsWith("[") && value.endsWith("]")
        ? value
            .slice(1, -1)
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : value;
  }

  for (const required of ["topic", "title", "summary", "commands"]) {
    if (!meta[required]) throw new Error(`${file}: frontmatter is missing "${required}"`);
  }
  if (!Array.isArray(meta.commands)) {
    throw new Error(`${file}: "commands" must be a list, e.g. [db, auth]`);
  }

  // The body only — the frontmatter is metadata for the router, not something an
  // agent should have to read past to reach the content.
  return { meta, body: text.slice(end + 5).trim() + "\n" };
}

function escapeTemplate(text) {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/**
 * Topics that exist but are NOT shipped in `workser help`.
 *
 * AGENT CLOUD IS OFF FOR LAUNCH. `agent-cloud.md` is withheld rather than
 * deleted, because the guide is fine — what is withdrawn is the offer. The
 * command is unregistered in `src/index.ts`, the desktop app's Agents tab is
 * hidden and the daemon's `/v1/agent-cloud` route is unmounted, so a topic left
 * in `workser help` would be teaching a command that no longer answers.
 *
 * Emptying this set and re-registering the command is the whole way back.
 */
const WITHHELD = new Set(["agent-cloud.md"]);

function generate() {
  const files = fs
    .readdirSync(REFERENCE_DIR)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !WITHHELD.has(f))
    .sort();

  const topics = files.map((file) => {
    const { meta, body } = parseFrontmatter(
      fs.readFileSync(path.join(REFERENCE_DIR, file), "utf8"),
      file,
    );
    return { ...meta, file, body };
  });

  const seen = new Set();
  for (const t of topics) {
    if (seen.has(t.topic)) throw new Error(`duplicate topic "${t.topic}"`);
    seen.add(t.topic);
  }

  const entries = topics
    .map(
      (t) => `  {
    topic: ${JSON.stringify(t.topic)},
    title: ${JSON.stringify(t.title)},
    summary: ${JSON.stringify(t.summary)},
    commands: ${JSON.stringify(t.commands)},
    source: ${JSON.stringify(`skills/workser/reference/${t.file}`)},
    body: \`${escapeTemplate(t.body)}\`,
  },`,
    )
    .join("\n");

  return `/**
 * GENERATED — do not edit.
 *
 * Run \`npm run build:help\` after changing a file in \`skills/workser/reference/\`.
 * \`test/help.test.ts\` fails when this file has drifted from them, or when a
 * registered command is covered by no topic at all.
 */

export interface HelpTopic {
  topic: string;
  title: string;
  summary: string;
  /** Top-level commands this topic documents. Checked against the real ones. */
  commands: readonly string[];
  /** Canonical markdown this was generated from. */
  source: string;
  body: string;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
${entries}
];
`;
}

const next = generate();
const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;

if (current === next) {
  console.log("build-help: up to date.");
  process.exit(0);
}

if (process.argv.includes("--check")) {
  console.error("build-help: src/help-content.ts is stale. Run `npm run build:help`.");
  process.exit(1);
}

fs.writeFileSync(OUT, next, "utf8");
console.log(
  `build-help: wrote ${(next.match(/^    topic: /gm) || []).length} topics to src/help-content.ts`,
);
