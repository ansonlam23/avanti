// Apply supabase/migrations/*.sql in order, once each.
// Usage: pnpm db:migrate   (reads SUPABASE_DB_URL from .env.local)
// Self-contained on purpose: scripts never import from src/ (server-only).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is missing in .env.local (Supabase → Connect → Session pooler URI).");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
const dir = join(process.cwd(), "supabase", "migrations");

// tsx runs these scripts as CommonJS, so no top-level await.
async function main() {
try {
  await sql`create schema if not exists ops`;
  await sql`create table if not exists ops.migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from ops.migrations`).map((r) => r.name));

  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const body = readFileSync(join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into ops.migrations (name) values (${file})`;
    });
    console.log(`✓ applied ${file}`);
    applied++;
  }
  console.log(applied ? `Done: ${applied} migration(s).` : "Up to date.");
} catch (err) {
  console.error("Migration failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
}

void main();
