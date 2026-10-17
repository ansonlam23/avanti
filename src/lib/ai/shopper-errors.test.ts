import { APIError, InternalServerError, RateLimitError } from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { errorStatus, friendlyError, isBusyError } from "./shopper-errors";

const headers = new Headers();
/** What the Gemini SDK throws: ApiError { status }. */
const gemini = (status: number) => Object.assign(new Error("gemini"), { name: "ApiError", status });
/** An Anthropic error event mid-stream: no HTTP status, only the error type. */
const midStream = (type: string) => new APIError(undefined, { type: "error", error: { type } }, undefined, headers, type as never);

describe("AI errors", () => {
  it("reads a status from either SDK, including Anthropic errors that arrive mid-stream", () => {
    expect(errorStatus(gemini(429))).toBe(429);
    expect(errorStatus(new RateLimitError(429, undefined, "slow down", headers))).toBe(429);
    expect(errorStatus(new InternalServerError(529, undefined, "overloaded", headers))).toBe(529);
    expect(errorStatus(midStream("overloaded_error"))).toBe(529);
    expect(errorStatus(midStream("rate_limit_error"))).toBe(429);
    expect(errorStatus(new Error("network"))).toBeNull();
    expect(errorStatus(midStream("toString"))).toBeNull();
    expect(errorStatus("nope")).toBeNull();
  });

  it("treats 429 and 5xx (529 overloaded included) as busy: another model may answer", () => {
    expect([429, 500, 503, 529].map((s) => isBusyError(gemini(s)))).toEqual([true, true, true, true]);
    expect([400, 401, 403, 404].map((s) => isBusyError(gemini(s)))).toEqual([false, false, false, false]);
    expect(isBusyError(midStream("overloaded_error"))).toBe(true);
    expect(isBusyError(new Error("network"))).toBe(false);
  });

  it("tells the shopper what happened, kindly", () => {
    expect(friendlyError(gemini(429)).code).toBe("ai_busy");
    expect(friendlyError(new RateLimitError(429, undefined, "slow down", headers)).code).toBe("ai_busy");
    expect(friendlyError(new InternalServerError(529, undefined, "overloaded", headers)).code).toBe("ai_busy");
    expect(friendlyError(midStream("overloaded_error")).code).toBe("ai_busy");
    expect(friendlyError(gemini(400)).code).toBe("ai_rejected");
    expect(friendlyError(midStream("invalid_request_error")).code).toBe("ai_rejected");
    expect(friendlyError(gemini(503)).code).toBe("ai_unavailable");
    expect(friendlyError(new InternalServerError(500, undefined, "oops", headers)).code).toBe("ai_unavailable");
    expect(friendlyError(new Error("network"))).toEqual({
      code: "ai_failed",
      message: "Something went wrong talking to the AI. Try again.",
    });
  });
});
