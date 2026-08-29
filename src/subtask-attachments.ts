/**
 * `--ref` — what a step should LOOK AT, as the manager writes it.
 *
 * ─── WHY A SUBTASK NEEDS THIS AT ALL ─────────────────────────────────────────
 *
 * A filed step has always said what to do, who does it, where it may write and
 * what it is for. It has never said what to READ. So the manager — the one
 * party that has the brief open, has seen the mockups and made the call — hands
 * over a single sentence, and the engineer that picks the step up goes looking
 * for the same files the manager already had.
 *
 * The owner feels it from the other end: a design appears in the artifacts list
 * with nothing anywhere connecting it to the step it belongs to.
 *
 * ─── THE SYNTAX, AND WHY IT IS ONE FLAG ──────────────────────────────────────
 *
 *   --ref "/abs/path/design.png::the blue one the owner approved"
 *   --ref "https://example.com/spec"
 *   --ref "/abs/path/a.png" --ref "/abs/path/b.png"
 *
 * One flag rather than `--file` + `--url` + `--ref-note`, because the note has
 * to STAY WITH the thing it describes. Parallel flags pair by position, and a
 * pairing an agent has to keep straight across three arrays is a pairing that
 * will silently slip — the note ending up on the wrong file is worse than no
 * note, since it reads as fact.
 *
 * `::` rather than a space or a dash: both appear inside real paths and real
 * sentences, and a separator that can occur in its own operands is not a
 * separator. The first `::` splits; later ones stay in the note, because a
 * sentence is allowed to contain anything.
 *
 * THE NOTE IS THE POINT — the same rule `file-mentions.ts` states on the
 * desktop side. `- /Users/me/a.png` five times over is five paths and no
 * reason; `- /Users/me/a.png — the screen this step rebuilds` is a brief.
 */

export interface SubtaskAttachment {
  type: "file" | "url";
  value: string;
  label?: string;
  note?: string;
}

/** Cap on one note. Matches the DTO, so nothing is silently truncated later. */
export const MAX_REF_NOTE = 500;

/** Cap on the whole list. Matches the DTO's `ArrayMaxSize`. */
export const MAX_REFS = 20;

const URL_SCHEME = /^https?:\/\//i;

/**
 * A readable name for something the agent will see as a path or a URL.
 *
 * The basename for a file and the host for a URL, because those are what a
 * person recognises in a chip two words wide. Never the full value: a chip
 * showing 90 characters of path is a chip nobody can read, and the full value
 * is one hover away.
 */
export function labelFor(type: string, value: string): string {
  if (type === "url") {
    try {
      return new URL(value).hostname.replace(/^www\./, "");
    } catch {
      return value;
    }
  }
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || value;
}

/**
 * Parse one `--ref` operand.
 *
 * Returns null for something with no value at all — an empty `--ref ""` is a
 * mistake, and filing a pointer that points nowhere would put an empty chip in
 * front of the owner rather than surfacing the mistake to the agent that made
 * it.
 */
export function parseRef(raw: string): SubtaskAttachment | null {
  const at = raw.indexOf("::");
  const value = (at === -1 ? raw : raw.slice(0, at)).trim();
  if (!value) return null;

  const note = at === -1 ? "" : raw.slice(at + 2).trim().slice(0, MAX_REF_NOTE);
  const type: SubtaskAttachment["type"] = URL_SCHEME.test(value) ? "url" : "file";

  return {
    type,
    value,
    label: labelFor(type, value),
    ...(note ? { note } : {}),
  };
}

/**
 * Parse every `--ref` the caller gave.
 *
 * A malformed one is DROPPED, not fatal. These are context, and refusing to
 * file an otherwise-good step because one pointer was empty would trade a small
 * loss for a large one — the step is the work, the refs are the brief. The cap
 * is applied last so the order the manager chose is the order that survives.
 */
export function parseRefs(raw: string[] | undefined): SubtaskAttachment[] {
  if (!raw?.length) return [];
  const out: SubtaskAttachment[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = parseRef(item);
    if (!parsed) continue;
    // Same file named twice is one chip. An agent listing the design folder
    // and then the file inside it should not hand the owner a duplicate.
    if (seen.has(parsed.value)) continue;
    seen.add(parsed.value);
    out.push(parsed);
  }
  return out.slice(0, MAX_REFS);
}
