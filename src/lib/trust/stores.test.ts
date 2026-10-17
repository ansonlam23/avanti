import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "./keys";
import { memoryDirectory, memoryNonceStore, supabaseDirectory, supabaseNonceStore } from "./stores";
import type { DirectoryAgent } from "./types";

type PgError = { code?: string; message: string } | null;
type Response = { data: unknown; error: PgError };

interface FakeQuery {
  select(...args: unknown[]): FakeQuery;
  eq(...args: unknown[]): FakeQuery;
  maybeSingle(): Promise<Response>;
  insert(row: unknown): Promise<Response>;
}

/** Just enough of the supabase-js query builder for these two stores; records every call. */
function fakeDb(result: { data?: unknown; error?: PgError }) {
  const calls: unknown[][] = [];
  const response: Response = { data: result.data ?? null, error: result.error ?? null };
  const query: FakeQuery = {
    select(...args) {
      calls.push(["select", ...args]);
      return query;
    },
    eq(...args) {
      calls.push(["eq", ...args]);
      return query;
    },
    async maybeSingle() {
      calls.push(["maybeSingle"]);
      return response;
    },
    async insert(row) {
      calls.push(["insert", row]);
      return response;
    },
  };
  const db = {
    from(table: string) {
      calls.push(["from", table]);
      return query;
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

function agent(verified = true): DirectoryAgent {
  const { signer, publicJwk } = generateAgentKeyPair();
  return { id: "agent-1", name: "Open Sign Shopper", keyId: signer.keyId, publicJwk, verified };
}

describe("memoryDirectory", () => {
  it("returns verified agents only", async () => {
    const good = agent();
    const revoked = agent(false);
    const directory = memoryDirectory([good, revoked]);
    expect(await directory.lookup(good.keyId)).toEqual(good);
    expect(await directory.lookup(revoked.keyId)).toBeNull();
    expect(await directory.lookup("unknown")).toBeNull();
  });
});

describe("memoryNonceStore", () => {
  it("accepts each nonce once", async () => {
    const store = memoryNonceStore();
    const expiresAt = new Date();
    expect(await store.consume("a", "k", expiresAt)).toBe(true);
    expect(await store.consume("a", "k", expiresAt)).toBe(false);
    expect(await store.consume("a", "other-key", expiresAt)).toBe(false);
    expect(await store.consume("b", "k", expiresAt)).toBe(true);
  });
});

describe("supabaseDirectory", () => {
  it("looks up a verified agent by key_id and maps the row", async () => {
    const a = agent();
    const { db, calls } = fakeDb({
      data: { id: a.id, name: a.name, key_id: a.keyId, public_jwk: a.publicJwk, verified: true },
    });
    expect(await supabaseDirectory(db).lookup(a.keyId)).toEqual(a);
    expect(calls).toEqual([
      ["from", "agents"],
      ["select", "id, name, key_id, public_jwk, verified"],
      ["eq", "key_id", a.keyId],
      ["eq", "verified", true],
      ["maybeSingle"],
    ]);
  });

  it("returns null when there's no such (verified) agent", async () => {
    const { db } = fakeDb({ data: null });
    expect(await supabaseDirectory(db).lookup("nobody")).toBeNull();
  });

  it("throws on database errors (fail closed)", async () => {
    const { db } = fakeDb({ error: { message: "connection refused" } });
    await expect(supabaseDirectory(db).lookup("k")).rejects.toThrow(/connection refused/);
  });
});

describe("supabaseNonceStore", () => {
  const expiresAt = new Date("2026-10-17T12:00:00.000Z");

  it("inserts the nonce and reports first use", async () => {
    const { db, calls } = fakeDb({});
    expect(await supabaseNonceStore(db).consume("n-1", "key-1", expiresAt)).toBe(true);
    expect(calls).toEqual([
      ["from", "agent_nonces"],
      ["insert", { nonce: "n-1", key_id: "key-1", expires_at: "2026-10-17T12:00:00.000Z" }],
    ]);
  });

  it("treats a unique violation (23505) as a replay", async () => {
    const { db } = fakeDb({ error: { code: "23505", message: "duplicate key value violates unique constraint" } });
    expect(await supabaseNonceStore(db).consume("n-1", "key-1", expiresAt)).toBe(false);
  });

  it("throws on other database errors (fail closed)", async () => {
    const { db } = fakeDb({ error: { code: "42P01", message: 'relation "agent_nonces" does not exist' } });
    await expect(supabaseNonceStore(db).consume("n-1", "key-1", expiresAt)).rejects.toThrow(/does not exist/);
  });
});
