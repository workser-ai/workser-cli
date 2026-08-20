/**
 * Finding diagrams in a document's markdown.
 *
 * A diagram in a Workser document is a ```mermaid fence — see the desktop's
 * `docs/MermaidBlock.tsx` for why text and not a drawing. That decision is what
 * makes this file possible: an agent can check its own work with a regex
 * instead of opening an editor.
 *
 * The desktop has the same three functions (`docs/mermaidDoc.pure.ts`).
 * Duplicated rather than shared for the usual reason in this codebase — the two
 * repos ship separately — and safely, because both are pure over one string and
 * the failure mode of a drift is "the check disagrees about an edge case",
 * not a corrupted document.
 */

/** True when a fence body contains something other than blank lines and `%%`. */
export function hasDiagram(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.split("\n").some((line) => {
    const text = line.trim();
    return !!text && !text.startsWith("%%");
  });
}

/** `flowchart`, `sequenceDiagram`, … — or null rather than a wrong label. */
export function diagramKind(code: string | null | undefined): string | null {
  if (!code) return null;
  for (const line of code.split("\n")) {
    const text = line.trim();
    if (!text || text.startsWith("%%")) continue;
    const match = /^([A-Za-z][A-Za-z-]*)/.exec(text);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * Every mermaid fence in a markdown document.
 *
 * Tolerant of extra info after the language (```mermaid title=System), which is
 * legal markdown, and of an unterminated fence, which is a document someone is
 * still writing rather than an error to shout about.
 */
export function extractDiagrams(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  const out: string[] = [];
  const pattern = /^[ \t]*```[ \t]*mermaid[^\n]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const body = match[1].replace(/\s+$/, "");
    if (hasDiagram(body)) out.push(body);
  }
  return out;
}
