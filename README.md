# avanti

avanti is Italian for "come in!", what you call out when someone knocks. It also means "forward".

**The OPEN sign for AI shoppers.** Small shops go live for AI in 40 seconds (snap a photo, say your prices), and AI shoppers can find them, order, and pay with Visa. Agent orders are signed and verified, so bots get turned away before they reach a card network.

Built at DubHacks '26 (Visa: Reimagine Shopping track). **Live:** https://try-avanti.vercel.app

> 🚧 Hackathon build in progress. Full write-up, architecture and "what's real vs. demo" coming before submission.

## Use avanti from any AI

avanti is also a remote MCP server. Any MCP-capable assistant can find the shops near the UW campus, read their live menus, ask a shop about allergens, and start an order:

```
https://try-avanti.vercel.app/api/mcp
```

No sign-in. Tools: `search_shops`, `get_menu`, `ask_shop`, `start_order`. Nothing is paid from the chat: `start_order` returns a link that opens avanti with the order filled in, and you confirm there. A signed order places a Visa hold, charged only at pickup. Demo shops are labeled demo.

- **Claude:** Settings → Connectors → Add custom connector → paste the URL → Add. Custom connectors need a paid Claude plan. Then try "Find me a birthday cake with no nuts near UW and start an order."
- **Claude Desktop:** the same Connectors steps. On any plan you can instead add this to `claude_desktop_config.json` (Settings → Developer → Edit Config) and restart Claude:
  ```json
  { "mcpServers": { "avanti": { "command": "npx", "args": ["-y", "mcp-remote", "https://try-avanti.vercel.app/api/mcp"] } } }
  ```
- **Cursor:** add it to `~/.cursor/mcp.json` (or a project's `.cursor/mcp.json`):
  ```json
  { "mcpServers": { "avanti": { "url": "https://try-avanti.vercel.app/api/mcp" } } }
  ```
- **MCP Inspector:** run `npx @modelcontextprotocol/inspector`, pick Streamable HTTP, paste the URL, Connect. Or from a terminal:
  ```bash
  npx @modelcontextprotocol/inspector --cli https://try-avanti.vercel.app/api/mcp --transport http --method tools/list
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

## Credits
Demo shops are labeled **demo** and their names are fictional. Payments use Visa sandbox test cards, so no real money moves.

| Shop | Photo | Credit |
|---|---|---|
| Mai's Bakery | Bakery display case with handwritten price cards | James Collington, [Pexels 31132630](https://www.pexels.com/photo/31132630/) |
| Ave Bakery | Whole chocolate cake on a glass stand | American Heritage Chocolate, [Unsplash Id8BO472TbY](https://unsplash.com/photos/Id8BO472TbY) |
| Góc Phố Market | Cozy corner of an Asian grocery store | Paolo Sanchez, [Pexels 34357798](https://www.pexels.com/photo/34357798/) |
| Petal Cart | Buckets of flowers outside a shop | Feyza Nur, [Pexels 9153436](https://www.pexels.com/photo/9153436/) |
| Cielito Taco Truck | Tacos on a table | Amar Preciado, [Pexels 18032209](https://www.pexels.com/photo/18032209/) |
| Tall Stack Books | A bookstore stall on a street | Ayman N. Yusuf, [Pexels 5810801](https://www.pexels.com/photo/5810801/) |
| Rabbit & Rook Prints | A wall of colorful art prints | Markus Spiske, [Unsplash dJo4Qhtu2sg](https://unsplash.com/photos/dJo4Qhtu2sg) |
| Sample on /open | "Phil's Fresh Squeezed Lemonade - 2023 Marin County Fair" | Sarah Stierch, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Phil%27s_Fresh_Squeezed_Lemonade_-_2023_Marin_County_Fair_-_Sarah_Stierch.jpg), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Shop photos are used under the [Pexels License](https://www.pexels.com/license/) and the [Unsplash License](https://unsplash.com/license). Landing and brand media credits: `public/landing/CREDITS.md`, `public/brand/CREDITS.md`.

