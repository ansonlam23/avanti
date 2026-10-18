import "server-only";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { originFrom } from "@/lib/db/shops";
import { paymentMode } from "@/lib/env";
import { LIMITS, rateLimit } from "@/lib/ratelimit";
import { linkOrigin } from "./links";
import { createAvantiMcpServer, MCP_INSTRUCTIONS, MCP_SERVER_NAME, MCP_TOOL_NAMES } from "./server";

// /api/mcp over HTTP (CONTRACTS §15): MCP Streamable HTTP, stateless.
// Every POST gets a fresh server + transport (the SDK refuses to reuse a
// stateless transport) and a plain JSON answer, so nothing has to stay open
// on a serverless function. GET has no SSE stream to offer (405 for MCP
// clients; a short JSON description for people who open the URL). DELETE has
// no session to end (405). CORS is open so browser clients like MCP Inspector work.

const MAX_BODY_BYTES = 64 * 1024;
const ALLOW_HEADERS = "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": ALLOW_HEADERS,
  "access-control-expose-headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  "access-control-max-age": "86400",
};

/** The same response with CORS + no-store headers added. */
export function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  headers.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function rpcError(status: number, message: string, extra: { headers?: HeadersInit; data?: unknown } = {}): Response {
  const error = { code: -32000, message, ...(extra.data !== undefined ? { data: extra.data } : {}) };
  return withCors(Response.json({ jsonrpc: "2.0", error, id: null }, { status, headers: extra.headers }));
}

/**
 * Origin for order links: NEXT_PUBLIC_APP_URL (a public value, not a secret)
 * when set, else the origin the request came in on. env.appUrl() can't be
 * used: it falls back to localhost:3000, not to the request.
 */
export function mcpLinkOrigin(req: Request): string {
  return linkOrigin(process.env.NEXT_PUBLIC_APP_URL, originFrom(req));
}

export async function handleMcpPost(req: Request): Promise<Response> {
  const limited = await rateLimit(req, "mcp", ...LIMITS.mcp);
  if (limited) {
    const body = (await limited.json().catch(() => null)) as { error?: { message?: string } } | null;
    return rpcError(429, body?.error?.message ?? "Too many requests. Give it a minute and try again.", {
      headers: { "retry-after": "60" },
      data: { code: "rate_limited" },
    });
  }

  const server = createAvantiMcpServer({ origin: mcpLinkOrigin(req), paymentMode: paymentMode() });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
    maxRequestBodySize: MAX_BODY_BYTES,
  });
  try {
    await server.connect(transport);
    // JSON mode: resolves once every response in the request is ready.
    return withCors(await transport.handleRequest(req));
  } catch (err) {
    console.error("[mcp] request failed:", err);
    return rpcError(500, "The avanti MCP server hit an error. Try again in a moment.");
  } finally {
    await server.close().catch(() => {});
  }
}

export function handleMcpGet(req: Request): Response {
  if ((req.headers.get("accept") ?? "").includes("text/event-stream")) {
    return rpcError(405, "Method not allowed: this MCP server is stateless and has no SSE stream. POST JSON-RPC messages instead.", {
      headers: { allow: "POST, OPTIONS" },
    });
  }
  const endpoint = `${originFrom(req)}/api/mcp`; // the URL they just opened
  return withCors(
    Response.json({
      name: MCP_SERVER_NAME,
      about: MCP_INSTRUCTIONS,
      mcp: { transport: "streamable-http", endpoint, auth: "none", tools: MCP_TOOL_NAMES },
      connect: `Add ${endpoint} as a custom connector (Claude: Settings → Connectors → Add custom connector) or as a remote MCP server in your client.`,
    }),
  );
}

export function handleMcpDelete(): Response {
  return rpcError(405, "Method not allowed: this MCP server is stateless, so there is no session to end.", {
    headers: { allow: "GET, POST, OPTIONS" },
  });
}

export function handleMcpOptions(req: Request): Response {
  const asked = req.headers.get("access-control-request-headers");
  const res = withCors(new Response(null, { status: 204 }));
  if (asked) {
    res.headers.set("access-control-allow-headers", asked);
    res.headers.set("vary", "Access-Control-Request-Headers");
  }
  return res;
}
