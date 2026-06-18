/** A normalized CLI error. Carries a machine code + optional HTTP status so
 *  output can render it for humans and for agents (`--json`) consistently. */
export class WorkserError extends Error {
  code: string;
  status?: number;
  details?: unknown;

  constructor(
    message: string,
    opts: { code?: string; status?: number; details?: unknown } = {},
  ) {
    super(message);
    this.name = "WorkserError";
    this.code = opts.code ?? "workser_error";
    this.status = opts.status;
    this.details = opts.details;
  }
}
