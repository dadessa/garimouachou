/** Camada de serviços compartilhada: Garimou IA (painel), ferramentas MCP de admin e plano diário. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SITE_URL } from "@/lib/site";
import { DEFAULT_WEIGHTS, justify, type Weights } from "@/lib/radar/score";
import { applyView, buildRadar, classifyCategory, financialPotential, norm, type Opp, type RadarRow, type View } from "@/lib/radar/engine";
import { emptyDraft } from "@/lib/import/rules";
import { importOneWith } from "@/lib/import/importer-core";
import { APPROVAL_TTL_MIN, MAX_IMPORT_BATCH, MIN_COVERAGE, approvalProblem, envelope, newToken, sanitizeExternal, sha256, utmUrl } from "./rules";

export type Sb = SupabaseClient<Database>;
export type Channel = "painel" | "mcp" | "agendado";

export async function isAdmin(sb: Sb, userId: string) {
  const { data } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}
export async function audit(sb: Sb, userId: string | null, channel: Channel, action: string, detail: Record<string, unknown> = {}) {
  const { error } = await sb.from("agent_audit").insert({ user_id: userId, channel, action, detail: JSON.parse(JSON.stringify(detail)) });
  if (error) console.error("auditoria", error.message);
}

export async function integrationStatus(sb: Sb) {
  const { shopeeConfigured } = await import("@/lib/marketplaces/shopee.server");
  const { mercadolivreConfigured } = await import("@/lib/marketplaces/mercadolivre.server");
  const { data: rows } = await sb.from("marketplace_integrations").select("*");
  const conf: Record<string, boolean> = { shopee: shopeeConfigured(), mercadolivre: mercadolivreConfigured(), amazon: false, magalu: false };
  const list = Object.entries(conf).map(([slug, has]) => {
    const r = (rows ?? []).find((x) => x.marketplace_slug === slug);
    return {
      loja: slug,
      credenciais_salvas: has,
      conexao_validada: has && r?.status === "connected",
      situacao: !has ? "não configurada" : r?.status === "connected" ? "conectada (validada)" : r?.status === "error" ? "erro no último teste" : "aguardando teste real",
      ultimo_teste: r?.last_checked_at ?? null,
    };
  });
  return envelope(list, {
    fonte: ["configuração do servidor", "último teste real"],
    indisponiveis: list.filter((l) => !l.conexao_validada).map((l) => l.loja),
  });
}

interface RadarCtx { rows: RadarRow[]; searches: { termo: string; buscas: number }[]; catalog: { id: string; name: string; slug: string; status: string; clicks: number; views: number; updated: string }[] }
export async function loadRadar(sb: Sb): Promise<RadarCtx> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [ops, st, ev, prods, snaps, se] = await Promise.all([
    sb.from("radar_opportunities").select("*").order("fetched_at", { ascending: false }).limit(1000),
    sb.from("radar_settings").select("weights").eq("id", 1).maybeSingle(),
    sb.from("analytics_events").select("event_type,product_id").gte("created_at", since).in("event_type", ["offer_click", "product_view"]).limit(20000),
    sb.from("products").select("id,name,slug,status,external_id,affiliate_url,updated_at"),
    sb.from("radar_snapshots").select("opportunity_id,day,sales,search_volume").gte("day", since.slice(0, 10)),
    sb.from("site_searches").select("term,count").gte("day", since.slice(0, 10)).limit(5000),
  ]);
  if (ops.error) throw new Error("Não foi possível ler o Radar.");
  const weights = { ...DEFAULT_WEIGHTS, ...((st.data?.weights as Partial<Weights>) ?? {}) };
  const clicks = new Map<string, number>();
  const views = new Map<string, number>();
  for (const e of ev.data ?? []) {
    if (!e.product_id) continue;
    const m = e.event_type === "offer_click" ? clicks : views;
    m.set(e.product_id, (m.get(e.product_id) ?? 0) + 1);
  }
  const term = new Map<string, number>();
  for (const x of se.data ?? []) term.set(x.term, (term.get(x.term) ?? 0) + x.count);
  return {
    rows: buildRadar((ops.data ?? []) as Opp[], weights, { catalog: prods.data ?? [], clicks, snaps: snaps.data ?? [] }),
    searches: [...term.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([termo, buscas]) => ({ termo, buscas })),
    catalog: (prods.data ?? []).map((p) => ({ id: p.id, name: p.name, slug: p.slug, status: p.status, clicks: clicks.get(p.id) ?? 0, views: views.get(p.id) ?? 0, updated: p.updated_at })),
  };
}

/** Card padronizado: mesmo cálculo da tela do Radar. */
export function card(r: RadarRow) {
  return {
    id: r.o.id,
    nome: sanitizeExternal(r.o.name),
    loja: r.o.marketplace_slug,
    categoria: r.o.category,
    foto: r.o.image_url,
    preco_cents: r.expired ? null : r.o.price_cents,
    desconto_pct: r.o.discount_pct,
    comissao_pct: r.o.commission_rate,
    comissao_extra_pct: r.o.extra_commission_rate,
    comissao_estimada_cents: r.expired ? null : r.s.commissionCents,
    vendas_na_loja: r.o.sales,
    procura: r.o.search_volume,
    crescimento_pct: r.growth,
    potencial_financeiro_cents: financialPotential(r),
    score: r.s.score,
    confianca: r.s.confidence,
    justificativa: justify(r.s),
    sem_dados: r.s.missing,
    fonte: r.o.source,
    consultado_em: r.o.fetched_at,
    valido_ate: r.o.valid_until,
    vencido: r.expired,
    no_catalogo: !!r.catalogId,
    tem_link_afiliada: !!r.o.affiliate_url,
  };
}
export type Card = ReturnType<typeof card>;

export interface RankFilter { view?: View; marketplace?: string; category?: string; keyword?: string; maxPriceCents?: number; minCommissionPct?: number; onlyNew?: boolean; limit?: number }
export function rank(ctx: RadarCtx, f: RankFilter) {
  let r = applyView(ctx.rows, f.view ?? "melhores").filter((x) => x.s.coverage >= MIN_COVERAGE || f.view === "procurados");
  if (f.marketplace) r = r.filter((x) => x.o.marketplace_slug === f.marketplace);
  if (f.category) r = r.filter((x) => norm(x.o.category ?? "").includes(norm(f.category!)));
  if (f.keyword) r = r.filter((x) => norm(x.o.name).includes(norm(f.keyword!)));
  if (f.maxPriceCents != null) r = r.filter((x) => x.o.price_cents != null && x.o.price_cents <= f.maxPriceCents!);
  if (f.minCommissionPct != null) r = r.filter((x) => (x.o.commission_rate ?? 0) + (x.o.extra_commission_rate ?? 0) >= f.minCommissionPct!);
  if (f.onlyNew) r = r.filter((x) => !x.catalogId);
  const cards = r.slice(0, Math.min(30, f.limit ?? 10)).map(card);
  const sources = [...new Set(cards.map((c) => c.fonte))];
  const lim: string[] = ["Vendas na loja não são buscas; cliques no site não são vendas; comissão é estimativa."];
  const hidden = ctx.rows.filter((x) => x.expired).length;
  if (hidden) lim.push(`${hidden} oferta(s) vencida(s) foram ocultadas.`);
  if (!ctx.rows.length) lim.push("O Radar está vazio: nenhuma loja conectada e nenhum dado manual.");
  return envelope(cards, {
    fonte: sources.length ? sources : ["Radar (sem dados)"],
    validade: cards.map((c) => c.valido_ate).filter(Boolean).sort()[0] ?? null,
    indisponiveis: [...new Set(cards.flatMap((c) => c.sem_dados))],
    limitacoes: lim,
  });
}

export function compare(ctx: RadarCtx) {
  const by = new Map<string, RadarRow[]>();
  for (const r of ctx.rows.filter((x) => !x.expired)) by.set(r.o.marketplace_slug, [...(by.get(r.o.marketplace_slug) ?? []), r]);
  const avg = (xs: (number | null)[]) => { const n = xs.filter((x): x is number => x != null); return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null; };
  return envelope([...by.entries()].map(([loja, rs]) => ({
    loja, oportunidades: rs.length, score_medio: avg(rs.map((r) => r.s.score)),
    comissao_media_cents: avg(rs.map((r) => r.s.commissionCents)), com_comissao_extra: rs.filter((r) => (r.o.extra_commission_rate ?? 0) > 0).length,
    melhor: rs.sort((a, b) => b.s.score - a.s.score)[0] ? card(rs[0]!) : null,
  })), { fonte: ["Radar"], limitacoes: ["Comparação só entre lojas com dados no Radar; scores são normalizados por loja e categoria."] });
}

export function catalogReport(ctx: RadarCtx) {
  const pub = ctx.catalog.filter((p) => p.status === "published");
  return envelope({
    publicados: pub.length,
    rascunhos: ctx.catalog.filter((p) => p.status === "draft").length,
    mais_clicados: [...pub].sort((a, b) => b.clicks - a.clicks).slice(0, 10).map((p) => ({ id: p.id, nome: p.name, cliques_30d: p.clicks, visualizacoes_30d: p.views })),
    sem_cliques: pub.filter((p) => p.clicks === 0).slice(0, 20).map((p) => ({ id: p.id, nome: p.name, visualizacoes_30d: p.views })),
  }, { fonte: ["catálogo", "eventos do site (30 dias)"], limitacoes: ["Cliques em 'Ver oferta' não são vendas confirmadas."] });
}

export async function analytics(sb: Sb, days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const { data, error } = await sb.rpc("admin_performance_report", { _from: from.toISOString(), _to: to.toISOString() });
  if (error) throw new Error("Não foi possível ler o desempenho.");
  return envelope(data, { fonte: ["eventos do site"], limitacoes: ["Sem vendas confirmadas: as lojas ainda não enviam relatórios de conversão."], indisponiveis: ["conversões confirmadas"] });
}

export function expiredReport(ctx: RadarCtx) {
  const exp = ctx.rows.filter((r) => r.expired);
  return envelope(exp.slice(0, 50).map((r) => ({ id: r.o.id, nome: sanitizeExternal(r.o.name), loja: r.o.marketplace_slug, venceu_em: r.o.valid_until, no_catalogo: !!r.catalogId })), {
    fonte: ["Radar"], limitacoes: exp.length > 50 ? [`Mostrando 50 de ${exp.length}.`] : [],
  });
}

export async function searchOffers(sb: Sb, keyword: string, limit = 10) {
  const s = await import("@/lib/marketplaces/shopee.server");
  const ctx = await loadRadar(sb);
  const stored = rank(ctx, { view: "melhores", keyword, limit });
  if (!s.shopeeConfigured()) {
    stored.limitacoes.push("Shopee não configurada: busca feita só nos dados já salvos no Radar.");
    stored.indisponiveis.push("busca ao vivo na Shopee");
    return stored;
  }
  try {
    const { shopeeToRow } = await import("@/lib/radar/collect");
    const r = await s.shopeeRadarPage({ keyword: keyword.slice(0, 60), page: 1, sortType: s.SHOPEE_SORT.relevancia, limit: Math.min(20, limit) });
    const rows = r.nodes.map((n) => shopeeToRow(n, new Date()));
    if (rows.length) {
      const { error } = await sb.from("radar_opportunities").upsert(rows, { onConflict: "marketplace_slug,external_id" });
      if (error) stored.limitacoes.push("Ofertas encontradas, mas não foi possível salvá-las no Radar.");
    }
    return rank(await loadRadar(sb), { view: "melhores", keyword, limit });
  } catch (e) {
    stored.limitacoes.push(`Shopee falhou: ${(e as Error).message.slice(0, 120)}`);
    return stored;
  }
}

/** Etapa 1: prévia + aprovação vinculada aos produtos, válida por 15 min. Nada é cadastrado. */
export async function prepareImport(sb: Sb, userId: string, ids: string[], publish: boolean) {
  const uniq = [...new Set(ids)].slice(0, MAX_IMPORT_BATCH);
  const ctx = await loadRadar(sb);
  const preview = uniq.map((id) => {
    const r = ctx.rows.find((x) => x.o.id === id);
    if (!r) return { id, nome: null as string | null, acao: "ignorar", pendencias: ["Oportunidade não encontrada."] };
    const pend: string[] = [];
    if (!r.o.affiliate_url) pend.push("sem link de afiliada");
    if (!r.o.image_url) pend.push("sem foto");
    if (r.expired) pend.push("dados vencidos — entrará como rascunho sem preço");
    if (r.catalogId) return { id, nome: sanitizeExternal(r.o.name), acao: "duplicado", pendencias: ["já está no catálogo"] };
    if (!r.o.affiliate_url) return { id, nome: sanitizeExternal(r.o.name), acao: "ignorar", pendencias: pend };
    return { id, nome: sanitizeExternal(r.o.name), acao: publish && !pend.length ? "publicar se completo" : "rascunho", pendencias: pend };
  });
  const token = newToken();
  const expires = new Date(Date.now() + APPROVAL_TTL_MIN * 60_000).toISOString();
  const { data, error } = await sb.from("import_approvals").insert({
    token_hash: await sha256(token), user_id: userId, opportunity_ids: uniq, publish, preview, expires_at: expires,
  }).select("id").single();
  if (error) throw new Error("Não foi possível preparar a aprovação.");
  return envelope({ aprovacao_id: data.id, token, expira_em: expires, itens: preview }, {
    fonte: ["Radar", "catálogo"], validade: expires,
    limitacoes: ["Nada foi cadastrado ainda. A confirmação precisa ser feita pela administradora com este token."],
  });
}

/** Etapa 2: consome a aprovação uma vez, revalida e importa pela regra única importOneWith. */
export async function confirmImport(sb: Sb, userId: string, token: string, channel: Channel) {
  const hash = await sha256(token);
  const { data: a } = await sb.from("import_approvals").select("*").eq("token_hash", hash).maybeSingle();
  const problem = approvalProblem(a, userId);
  if (problem) throw new Error(problem);
  // Consumo atômico: só um pedido consegue marcar used_at.
  const { data: claimed } = await sb.from("import_approvals").update({ used_at: new Date().toISOString() })
    .eq("id", a!.id).is("used_at", null).gt("expires_at", new Date().toISOString()).select("id");
  if (!claimed?.length) throw new Error("Esta aprovação já foi usada.");
  const [ctx, mks, cats] = await Promise.all([
    loadRadar(sb),
    sb.from("marketplaces").select("*"),
    sb.from("categories").select("*"),
  ]);
  const { generateProductCopy } = await import("@/lib/admin/ai.server");
  const genCopy = async ({ data }: { data: { name: string; category: string; affiliateUrl: string; details: string } }) => {
    try { return { error: null, ...(await generateProductCopy(data)) }; } catch { return { error: "IA indisponível.", description: "", tags: [] as string[] }; }
  };
  const results: { id: string; nome: string; status: string; mensagem: string; produto_id?: string }[] = [];
  for (const id of a!.opportunity_ids) {
    const r = ctx.rows.find((x) => x.o.id === id);
    if (!r) { results.push({ id, nome: "", status: "error", mensagem: "Oportunidade não encontrada." }); continue; }
    if (!r.o.affiliate_url) { results.push({ id, nome: r.o.name, status: "error", mensagem: "Sem link de afiliada." }); continue; }
    const d = emptyDraft(r.o.affiliate_url);
    d.name = r.o.name.slice(0, 200);
    d.imageUrl = r.o.image_url;
    d.externalId = r.o.external_id;
    d.fromApi = r.o.source.endsWith("_api");
    d.priceCents = r.expired ? null : r.o.price_cents;
    d.categoryId = classifyCategory(r.o.name, r.o.category, cats.data ?? [])?.id ?? null;
    const out = await importOneWith(sb, d, { publish: a!.publish && !r.expired, defaultCategoryId: null, useAi: true }, { mks: mks.data ?? [], cats: cats.data ?? [], genCopy });
    results.push({ id, nome: r.o.name, status: out.status, mensagem: out.message + (r.expired ? " Dados vencidos: salvo sem preço." : ""), ...(out.productId ? { produto_id: out.productId } : {}) });
  }
  await sb.from("import_approvals").update({ result: results }).eq("id", a!.id);
  await audit(sb, userId, channel, "confirm_import", { aprovacao: a!.id, resultados: results.map((x) => ({ id: x.id, status: x.status })) });
  return envelope(results, { fonte: ["Radar", "catálogo"], limitacoes: ["Preço salvo com a data real da consulta; ofertas vencidas entram sem preço."] });
}

/** Plano diário determinístico: só dados reais, sem IA (custo zero). */
export async function buildDailyPlan(sb: Sb) {
  const [ctx, prefsQ] = await Promise.all([loadRadar(sb), sb.from("commercial_preferences").select("*").eq("id", 1).maybeSingle()]);
  const p = prefsQ.data;
  const f: RankFilter = {
    onlyNew: true, limit: p?.daily_count ?? 10,
    ...(p?.max_price_cents != null ? { maxPriceCents: p.max_price_cents } : {}),
    ...(p?.min_commission_pct != null ? { minCommissionPct: Number(p.min_commission_pct) } : {}),
  };
  let novos = rank(ctx, f).resultado;
  if (p?.preferred_marketplaces?.length) novos = novos.filter((c) => p.preferred_marketplaces.includes(c.loja));
  if (p?.priority_categories?.length) novos.sort((a, b) => Number(p.priority_categories.some((c) => norm(b.categoria ?? "").includes(norm(c)))) - Number(p.priority_categories.some((c) => norm(a.categoria ?? "").includes(norm(c)))));
  const pub = ctx.catalog.filter((x) => x.status === "published");
  const insta = [...pub].sort((a, b) => b.views - a.views).slice(0, 5);
  const whats = [...pub].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
  const comissao = rank(ctx, { view: "comissao", limit: 5 }).resultado;
  const revisar = [
    ...ctx.rows.filter((r) => r.expired && r.catalogId).slice(0, 10).map((r) => ({ nome: r.o.name, motivo: "oferta vencida no Radar" })),
    ...ctx.catalog.filter((c) => c.status === "draft").slice(0, 10).map((c) => ({ nome: c.name, motivo: "rascunho pendente" })),
  ];
  const texto = (n: string, ch: string) => ch === "instagram" ? `Achadinho garimpado: ${n}. Link na bio do @garimouachouoficial ✨` : `Olha esse achadinho que garimpei: ${n} 👉`;
  return {
    gerado_em: new Date().toISOString(),
    preferencias_usadas: p ?? null,
    oportunidades_nao_cadastradas: novos.slice(0, p?.daily_count ?? 10),
    divulgar_instagram: insta.map((x) => ({ nome: x.name, link: utmUrl(SITE_URL, x.slug, "instagram", "plano-diario"), texto: texto(x.name, "instagram"), visualizacoes_30d: x.views })),
    divulgar_whatsapp: whats.map((x) => ({ nome: x.name, link: utmUrl(SITE_URL, x.slug, "whatsapp", "plano-diario"), texto: texto(x.name, "whatsapp"), cliques_30d: x.clicks })),
    comissao_atrativa: comissao,
    precisam_revisao: revisar,
    limitacoes: ["Textos sem preço: confira o valor na loja antes de divulgar.", "Cliques não são vendas."],
  };
}

export async function runDailyPlan(sb: Sb, trigger: "manual" | "agendada", userId: string | null) {
  try {
    const plan = await buildDailyPlan(sb);
    const { error } = await sb.from("daily_plans").insert({ trigger, status: "ok", plan: JSON.parse(JSON.stringify(plan)) });
    if (error) throw new Error("Plano gerado, mas não foi possível salvar.");
    await audit(sb, userId, trigger === "agendada" ? "agendado" : "painel", "daily_plan", { itens: plan.oportunidades_nao_cadastradas.length });
    return { ok: true as const, plan };
  } catch (e) {
    await sb.from("daily_plans").insert({ trigger, status: "failed", error: (e as Error).message.slice(0, 300) });
    return { ok: false as const, error: (e as Error).message };
  }
}

/** Campanha com IA para produtos do catálogo (nada é publicado nas redes). */
export async function generateCampaign(sb: Sb, productIds: string[], theme: string) {
  const { data: prods, error } = await sb.from("products").select("id,name,slug,short_description,tags").in("id", productIds.slice(0, 8));
  if (error || !prods?.length) throw new Error("Escolha produtos do catálogo.");
  const items = prods.map((p) => ({ id: p.id, nome: sanitizeExternal(p.name), descricao: sanitizeExternal(p.short_description, 300), etiquetas: p.tags, link_instagram: utmUrl(SITE_URL, p.slug, "instagram", theme || "semana"), link_whatsapp: utmUrl(SITE_URL, p.slug, "whatsapp", theme || "semana") }));
  const { campaignAi } = await import("./agent.server");
  const out = await campaignAi(items, theme);
  return envelope({ ...out, links: items.map((i) => ({ id: i.id, nome: i.nome, instagram: i.link_instagram, whatsapp: i.link_whatsapp })) }, {
    fonte: ["catálogo", "IA (textos)"], limitacoes: ["Nada foi publicado. Textos sem preço: confira na loja antes de divulgar."],
  });
}
