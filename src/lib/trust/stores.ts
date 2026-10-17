import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentDirectory, DirectoryAgent, Ed25519PublicJwk, NonceStore } from "./types";

// Agent directory + nonce store. Supabase versions back the real order route
// (tables `agents` and `agent_nonces`, server-side client only); memory
// versions are for tests, scripts and the bot simulator.

/** Postgres unique_violation: the nonce is already in agent_nonces. */
const UNIQUE_VIOLATION = "23505";

interface AgentRow {
  id: string;
  name: string;
  key_id: string;
  public_jwk: Ed25519PublicJwk;
  verified: boolean;
}

/** `agents` table; only rows with verified = true count. */
export function supabaseDirectory(db: SupabaseClient): AgentDirectory {
  return {
    async lookup(keyId) {
      const { data, error } = await db
        .from("agents")
        .select("id, name, key_id, public_jwk, verified")
        .eq("key_id", keyId)
        .eq("verified", true)
        .maybeSingle();
      if (error) throw new Error(`Agent directory lookup failed: ${error.message}`);
      if (!data) return null;
      const row = data as AgentRow;
      return { id: row.id, name: row.name, keyId: row.key_id, publicJwk: row.public_jwk, verified: row.verified === true };
    },
  };
}

/** Inserts into `agent_nonces` (nonce is the primary key): a unique violation means it was used before. */
export function supabaseNonceStore(db: SupabaseClient): NonceStore {
  return {
    async consume(nonce, keyId, expiresAt) {
      const { error } = await db
        .from("agent_nonces")
        .insert({ nonce, key_id: keyId, expires_at: expiresAt.toISOString() });
      if (!error) return true;
      if (error.code === UNIQUE_VIOLATION) return false;
      throw new Error(`Nonce store insert failed: ${error.message}`);
    },
  };
}

/** In-memory directory; like the real one, only verified agents are returned. */
export function memoryDirectory(agents: DirectoryAgent[]): AgentDirectory {
  const byKeyId = new Map(agents.map((agent) => [agent.keyId, agent]));
  return {
    async lookup(keyId) {
      const agent = byKeyId.get(keyId);
      return agent?.verified ? agent : null;
    },
  };
}

/** In-memory nonce store (one process, unbounded): fine for tests and demos, not for serverless. */
export function memoryNonceStore(): NonceStore {
  const used = new Map<string, { keyId: string; expiresAt: Date }>();
  return {
    async consume(nonce, keyId, expiresAt) {
      if (used.has(nonce)) return false;
      used.set(nonce, { keyId, expiresAt });
      return true;
    },
  };
}
