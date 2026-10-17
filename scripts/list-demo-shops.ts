// Mark seeded demo shops as LISTED (visible in everyone's AI search, kept by
// the sandbox purge) and labeled demo. Shops created through /open are private
// sandboxes until this runs on them.
// Usage: pnpm seed:list mais-bakery ave-bakery ave-flowers
import { createClient } from "@supabase/supabase-js";

async function main() {
  const slugs = process.argv.slice(2).filter(Boolean);
  if (!slugs.length) {
    console.error("Usage: pnpm seed:list <slug> [slug…]");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    console.error("Supabase isn't configured in .env.local");
    process.exit(1);
  }
  const db = createClient(url, secret, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("shops")
    .update({ listed: true, is_demo: true })
    .in("slug", slugs)
    .select("slug, name");
  if (error) {
    console.error("✗", error.message);
    process.exitCode = 1;
    return;
  }
  for (const s of data ?? []) console.log(`✓ listed ${s.slug} (${s.name})`);
  const missing = slugs.filter((s) => !(data ?? []).some((d) => d.slug === s));
  if (missing.length) console.log(`• not found: ${missing.join(", ")}`);
}

void main();
