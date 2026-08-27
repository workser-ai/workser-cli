import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { WorkserError } from "./errors.js";

/** The `{ source, query, task? }` body every `understand` route takes. */
export interface UnderstandingSource {
  source:
    | { type: "url"; url: string }
    | { type: "base64"; data: string; mimeType: string };
}

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mp3",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
};

/**
 * Resolve `--url`/`--file` into the body every understanding route wants.
 * Exactly one of the two is required — refused here so the agent gets the
 * reason immediately rather than a 400 relayed from two services away.
 *
 * `--file` is read and base64-encoded HERE, in the CLI, then sent as JSON —
 * bounded by the daemon/core-api's own body-size limits, so it is meant for
 * a small local file (a screenshot, a short voice memo). Anything larger
 * should go through `workser storage upload` first and be passed with
 * `--url` instead, which is fetched server-side with no such ceiling.
 */
export async function resolveMediaSource(opts: {
  url?: string;
  file?: string;
}): Promise<UnderstandingSource["source"]> {
  if (opts.url && opts.file) {
    throw new WorkserError("Pass --url or --file, not both.", {
      code: "bad_request",
    });
  }
  if (opts.url) {
    return { type: "url", url: opts.url };
  }
  if (opts.file) {
    let bytes: Buffer;
    try {
      bytes = await readFile(opts.file);
    } catch (e) {
      throw new WorkserError(
        `Could not read ${opts.file}: ${e instanceof Error ? e.message : String(e)}`,
        { code: "bad_request" },
      );
    }
    const mimeType = EXT_MIME[extname(opts.file).toLowerCase()] ?? "application/octet-stream";
    return { type: "base64", data: bytes.toString("base64"), mimeType };
  }
  throw new WorkserError("Pass --url <url> or --file <path> for the media to look at.", {
    code: "bad_request",
  });
}
