import type { ApiError, BlockReason } from "@/lib/types";

// JSON error responses in the CONTRACTS §4 shape.
export function jsonError(
  status: number,
  code: string,
  message: string,
  reason?: BlockReason,
): Response {
  const body: ApiError = { error: { code, message, ...(reason ? { reason } : {}) } };
  return Response.json(body, { status });
}

export function badRequest(message: string): Response {
  return jsonError(400, "bad_request", message);
}

export function notFound(what = "Not found"): Response {
  return jsonError(404, "not_found", what);
}

export function serverError(err: unknown, code = "server_error"): Response {
  const message = err instanceof Error ? err.message : "Something went wrong";
  console.error(`[${code}]`, err);
  return jsonError(500, code, message);
}
