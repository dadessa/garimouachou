<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.

<!-- LOVABLE:END -->

- Each marketplace lives in src/lib/marketplaces/<slug>.ts behind the shared MarketplaceAdapter interface — future affiliate API integrations plug in per module.
- Price display always goes through displayablePrice() in src/lib/price.ts — single source for freshness/manual-price rules.
- Server-side logic (redirect /go, clicks, sitemap, OG tags) uses TanStack server functions/routes with SSR, not Supabase Edge Functions — SSR already serves meta tags to link-preview bots.
- MCP server lives in src/lib/mcp behind Supabase OAuth (consent at /.lovable/oauth/consent, login at /login); tools return no prices — avoids stale price exposure.
- Public catalog reads go through src/lib/catalog/catalog.functions.ts (server functions, publishable key, RLS) — one place for what visitors see.
- Admin panel lives under src/routes/admin/_painel (client-only gate); writes use the browser client so RLS/has_role is the real protection.
- Catalog images are stored in private buckets and served via /img/<bucket>/<file> — buckets can't be public on this account.
- AI product copy (description + tags) is generated in src/lib/admin/ai.server.ts via Lovable AI Gateway behind an admin-checked server function — keeps the key server-side and forbids invented prices.
- Password requirements live in a read-own table with a self-admin scheduling RPC; has_role blocks the next login session until an auth password-change trigger clears the requirement, so bypassing the UI cannot grant administrative writes.
- New-password forms share strongPasswordValidation; never apply new-password strength checks to login, so existing credentials remain usable. Hosted length/character settings must match the form policy to prevent direct Auth API bypass.
- Commercial analytics: anonymous events go to /api/public/track (zod-validated, dedup_key unique, service-role insert); admins read only via admin_performance_report RPC — no client inserts, no PII.
- Product import (links, CSV, marketplace API results) goes through importOne() in src/lib/import/importer.ts with browser client + admin RLS; dedup by (marketplace_id, external_id) unique index or exact affiliate_url — one path for every import source.
- Marketplace API calls live in src/lib/marketplaces/<slug>.server.ts behind admin-checked server functions in src/lib/integrations/integrations.functions.ts; "connected" is only written after a real API request succeeds.
