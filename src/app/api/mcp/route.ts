import { handleMcpDelete, handleMcpGet, handleMcpOptions, handleMcpPost } from "@/lib/mcp/http";

// /api/mcp: avanti's remote MCP server (Streamable HTTP, stateless, JSON
// answers; CONTRACTS §15). Any MCP client (Claude, ChatGPT, Cursor, MCP
// Inspector) can search the public shops, read live menus, ask a shop, and
// start an order. Ordering itself only happens inside avanti, after the
// person's own tap (signed order → Visa hold, charged at pickup).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function POST(req: Request) {
  return handleMcpPost(req);
}

export function GET(req: Request) {
  return handleMcpGet(req);
}

export function DELETE() {
  return handleMcpDelete();
}

export function OPTIONS(req: Request) {
  return handleMcpOptions(req);
}
