# avanti

avanti is Italian for "come in!", what you call out when someone knocks. It also means "forward".

**The OPEN sign for AI shoppers.** Small shops go live for AI in 40 seconds (snap a photo, say your prices), and AI shoppers can find them, order, and pay with Visa. Agent orders are signed and verified, so bots get turned away before they reach a card network.

Built at DubHacks '26 (Visa: Reimagine Shopping track). **Live:** https://open-sign-three.vercel.app

> 🚧 Hackathon build in progress. Full write-up, architecture and "what's real vs. demo" coming before submission.

## Stack
Next.js 16 · Tailwind 4 · shadcn/ui · Motion · Supabase · Gemini · Visa Acceptance (Cybersource) sandbox · Ed25519 + RFC 9421 HTTP Message Signatures

## Run locally
```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm db:migrate              # needs SUPABASE_DB_URL
pnpm keys:agent              # creates the shopper agent's signing key
pnpm dev
```
