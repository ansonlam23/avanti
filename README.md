# avanti

avanti is Italian for "come in!", what you call out when someone knocks. It also means "forward".

**The OPEN sign for AI shoppers.** Small shops go live for AI in 40 seconds (snap a photo, say your prices), and AI shoppers can find them, order, and pay with Visa. Agent orders are signed and verified, so bots get turned away before they reach a card network.

Built at DubHacks '26 (Visa: Reimagine Shopping track). **Live:** https://open-sign-three.vercel.app

> 🚧 Hackathon build in progress. Full write-up, architecture and "what's real vs. demo" coming before submission.

## Use avanti from any AI

avanti is also a remote MCP server. Any MCP-capable assistant can find the shops near the UW campus, read their live menus, ask a shop about allergens, and start an order:

```
https://open-sign-three.vercel.app/api/mcp
```

No sign-in. Tools: `search_shops`, `get_menu`, `ask_shop`, `start_order`. Nothing is paid from the chat: `start_order` returns a link that opens avanti with the order filled in, and you confirm there. A signed order places a Visa hold, charged only at pickup. Demo shops are labeled demo.

- **Claude:** Settings → Connectors → Add custom connector → paste the URL → Add. Custom connectors need a paid Claude plan. Then try "Find me a birthday cake with no nuts near UW and start an order."
- **Claude Desktop:** the same Connectors steps. On any plan you can instead add this to `claude_desktop_config.json` (Settings → Developer → Edit Config) and restart Claude:
  ```json
  { "mcpServers": { "avanti": { "command": "npx", "args": ["-y", "mcp-remote", "https://open-sign-three.vercel.app/api/mcp"] } } }
  ```
- **Cursor:** add it to `~/.cursor/mcp.json` (or a project's `.cursor/mcp.json`):
  ```json
  { "mcpServers": { "avanti": { "url": "https://open-sign-three.vercel.app/api/mcp" } } }
  ```
- **MCP Inspector:** run `npx @modelcontextprotocol/inspector`, pick Streamable HTTP, paste the URL, Connect. Or from a terminal:
  ```bash
  npx @modelcontextprotocol/inspector --cli https://open-sign-three.vercel.app/api/mcp --transport http --method tools/list
  ```
- **Any other MCP client:** add the URL as a remote (Streamable HTTP) server with no auth.

## Stack
Next.js 16 · Tailwind 4 · shadcn/ui · Motion · Supabase · Claude + Gemini · Visa Acceptance (Cybersource) sandbox · Ed25519 + RFC 9421 HTTP Message Signatures

## Run locally
```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm db:migrate              # needs SUPABASE_DB_URL
pnpm keys:agent              # creates the shopper agent's signing key
pnpm dev
```
