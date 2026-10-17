#!/usr/bin/env bash
# Copy .env.local values to the linked Vercel project (production + preview).
# Run it yourself:  ! bash scripts/push-env-to-vercel.sh
# Prints variable NAMES only, never values. Skips blanks and local-only vars.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .vercel/project.json ] || { echo "Not linked yet: run 'npx vercel@64.4.0 link' first."; exit 1; }

SKIP=" SUPABASE_DB_URL NEXT_PUBLIC_APP_URL "   # DB URL is local-only; app URL is set to the prod domain separately
while IFS= read -r line || [ -n "$line" ]; do
  [[ -z "${line// }" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"; val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  [[ -z "$val" || "$SKIP" == *" $key "* || "$key" == VERCEL_* ]] && continue   # VERCEL_* (e.g. the OIDC token) are managed by Vercel
  for target in production preview; do
    printf '%s' "$val" | npx --yes vercel@64.4.0 env add "$key" "$target" --force >/dev/null 2>&1 \
      || { echo "✗ $key ($target) failed"; continue; }
  done
  echo "✓ $key"
done < .env.local
echo "Done. Redeploy so the new values take effect."
