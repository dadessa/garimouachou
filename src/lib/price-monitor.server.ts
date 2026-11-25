import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { matchAffiliateDomain } from "@/lib/marketplaces/types";
import { supportsPriceHistory } from "./price-history";
import { catalogPricePatch, exactObservation, MONITOR_BATCH, monitorOffset } from "./price-monitor";
import type { PriceObservation } from "./price-monitor";
import { afToRow } from "./discovery/mcp-afiliado";
import { shopeeToRow } from "./radar/collect";

type Sb = SupabaseClient<Database>;
const SOURCE_TIMEOUT = 5000;

/** Executado dentro da trava já existente do Radar, tanto no cron quanto no painel. */
export async function monitorPublishedPrices(sb: Sb) {
  let requests = 0;
  let checked = 0;
  let updated = 0;
  let errors = 0;
  let pending = 0;
  const af = await import("./discovery/mcp-afiliado.server");
  const shopee = await import("./marketplaces/shopee.server");
  let sites: { site: string; monetized: boolean }[] = [];
  if (af.afConfigured()) {
    requests++;
    try {
      sites = af.searchableSites(await af.botInfo(SOURCE_TIMEOUT)).filter((s) => s.monetized);
    } catch {
      errors++;
    }
  }
  const { data: stores, error: storeError } = await sb
    .from("marketplaces")
    .select("id,slug,allowed_domains,price_max_age_hours")
    .eq("is_active", true);
  if (storeError) throw new Error("Não foi possível consultar os marketplaces.");
  const eligible = (stores ?? []).filter(
    (m) =>
      supportsPriceHistory(m.slug, "mcp_afiliado") &&
      (sites.some((s) => s.site === m.slug) ||
        (m.slug === "shopee" && shopee.shopeeConfigured())),
  );
  if (!eligible.length) {
    return { requests, checked, updated, errors, status: "Sem fontes de preço conectadas" };
  }

  const ids = eligible.map((m) => m.id);
  const [{ count, error: countError }, { count: runCount, error: runError }] = await Promise.all([
    sb
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("price_source", "api")
      .in("marketplace_id", ids)
      .not("external_id", "is", null),
    sb.from("radar_runs").select("id", { count: "exact", head: true }),
  ]);
  if (countError || runError || count == null || runCount == null) {
    throw new Error("Não foi possível dimensionar o monitoramento.");
  }
  const offset = monitorOffset(count, runCount);
  const { data: products, error: productError } = await sb
    .from("products")
    .select("id,name,marketplace_id,external_id,affiliate_url,price_checked_at,updated_at")
    .eq("status", "published")
    .eq("price_source", "api")
    .in("marketplace_id", ids)
    .not("external_id", "is", null)
    .order("id")
    .range(offset, offset + MONITOR_BATCH - 1);
  if (productError) throw new Error("Não foi possível consultar os produtos publicados.");

  for (const p of products ?? []) {
    const mk = eligible.find((m) => m.id === p.marketplace_id);
    if (!mk || !p.external_id || !p.name.trim()) {
      pending++;
      continue;
    }
    try {
      let rows: PriceObservation[] = [];
      if (
        mk.slug === "shopee" &&
        /^\d+:\d+$/.test(p.external_id) &&
        shopee.shopeeConfigured()
      ) {
        requests++;
        checked++;
        const response = await shopee.shopeeRadarPage({
          keyword: p.name.slice(0, 120),
          page: 1,
          sortType: shopee.SHOPEE_SORT.relevancia,
          limit: 20,
          timeoutMs: SOURCE_TIMEOUT,
        });
        const now = new Date();
        rows = response.nodes.map((item) => ({
          ...shopeeToRow(item, now),
          // Não tratar o mínimo de uma faixa de variações como preço único.
          price_cents:
            item.priceMin != null &&
            item.priceMax != null &&
            Number(item.priceMin) !== Number(item.priceMax)
              ? null
              : shopeeToRow(item, now).price_cents,
          source: "shopee_api" as const,
        }));
      } else if (
        sites.some((s) => s.site === mk.slug) &&
        matchAffiliateDomain(p.external_id, mk.allowed_domains)
      ) {
        requests++;
        checked++;
        const items = await af.searchProducts(
          { query: p.name.slice(0, 120), site: mk.slug, sort: "relevance", limit: 20 },
          SOURCE_TIMEOUT,
        );
        const now = new Date();
        rows = items.flatMap((item) => {
          const row = afToRow({ ...item, site: item.site ?? mk.slug }, true, now);
          return row ? [{ ...row, source: "mcp_afiliado" as const }] : [];
        });
      } else {
        pending++;
        continue;
      }
      const observation = exactObservation(rows, mk.slug, p.external_id);
      const patch = observation
        ? catalogPricePatch(observation, mk.price_max_age_hours, p.price_checked_at)
        : null;
      if (!observation || !patch) {
        pending++;
        continue;
      }

      // Preservar metadados e fonte de registros já existentes; não substituir por outra origem.
      const radar = await sb
        .from("radar_opportunities")
        .select("id,source,fetched_at")
        .eq("marketplace_slug", mk.slug)
        .eq("external_id", p.external_id)
        .maybeSingle();
      if (radar.error) throw new Error("Falha de consulta ao Radar.");
      if (radar.data) {
        if (
          radar.data.source !== observation.source ||
          Date.parse(radar.data.fetched_at) >= Date.parse(observation.fetched_at)
        ) {
          pending++;
          continue;
        }
        const saved = await sb
          .from("radar_opportunities")
          .update({
            price_cents: observation.price_cents,
            fetched_at: observation.fetched_at,
            valid_until: observation.valid_until,
            original_price_cents: null,
            discount_pct: null,
          })
          .eq("id", radar.data.id)
          .eq("fetched_at", radar.data.fetched_at)
          .eq("source", observation.source)
          .select("id")
          .maybeSingle();
        if (saved.error || !saved.data) throw new Error("Falha ao gravar amostra.");
      } else {
        const saved = await sb.from("radar_opportunities").insert({
          ...observation,
          name: p.name.slice(0, 200),
          affiliate_url: p.affiliate_url,
        });
        if (saved.error) throw new Error("Falha ao cadastrar amostra.");
      }
      // CAS: não sobrescrever edição administrativa ou alteração concorrente.
      const saved = await sb
        .from("products")
        .update(patch)
        .eq("id", p.id)
        .eq("status", "published")
        .eq("price_source", "api")
        .eq("updated_at", p.updated_at)
        .eq("external_id", p.external_id)
        .select("id")
        .maybeSingle();
      if (saved.error) throw new Error("Falha ao atualizar o preço cadastrado.");
      if (saved.data) updated++;
      else pending++;
    } catch {
      errors++;
    }
  }
  return {
    requests,
    checked,
    updated,
    errors,
    status: `${checked} consultado(s); ${updated} atualizado(s); ${pending} pendente(s); ${errors} falha(s); ${count} elegível(is)`,
  };
}
