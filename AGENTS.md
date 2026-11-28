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
- Radar de Oportunidades: score determinístico em src/lib/radar/score.ts (pesos configuráveis em radar_settings, normalizado por loja+categoria); IA (radar.server.ts) só explica dados já calculados; inclusão no catálogo reutiliza importOne() — evita números inventados pela IA.

- Radar: buildRadar()/applyView() in src/lib/radar/engine.ts is the single rule for the Radar screen and the AI assistant; collection runs through runRadarRefresh() (radar_runs single-flight index, request cap, DB write checked) for manual and daily cron (/api/public/jobs/radar) — keeps both paths consistent.
- Site searches are logged only as term+day counts via the log_search RPC (no user/session data) — LGPD.
- Garimou IA: src/lib/agent/services.server.ts is the shared service layer (caller's RLS client) for the panel agent, admin MCP tools and the daily plan; imports run server-side via importOneWith() and need a single-use, 15-min, user-bound approval token — prevents unapproved or duplicate imports.
- Admin MCP tools share the /mcp endpoint but are hidden per caller via createAppContext (has_role) and re-check admin in each handler — keeps the public catalog tools separate without a second endpoint.

- Pasted offers/messages are parsed by splitOffers()/parseFacts() (re-run server-side; message data feeds the Radar as source "mensagem"/"pagina_publica" via radar-feed.ts and never overwrites API rows) (src/lib/import/offers.ts) and enriched server-side in offers.functions.ts via safeFetch() (allowlisted store/CDN hosts, manual redirects, size caps); prices from messages are saved only after admin confirmation, then imported through importOne() — no invented or stale-as-fresh data.

## Modern Web Guidance — Garimou Achou!

### Referências oficiais

- https://developer.chrome.com/docs/modern-web-guidance
- https://github.com/GoogleChrome/modern-web-guidance
- https://web.dev/
- https://developer.mozilla.org/

Consultar os guias oficiais relevantes antes de alterar componentes web, quando acessíveis. Se a skill oficial estiver disponível no agente, utilizá-la; caso contrário, consultar a documentação. Priorizar Baseline Widely available e oferecer alternativas compatíveis para recursos mais recentes. Não presumir que esta diretriz instala a skill.

### Arquitetura e design system

- Preservar React, TanStack Start, Tailwind CSS v4 e as regras do Lovable acima. Reutilizar componentes e centralizar tokens em src/styles.css; não editar arquivos gerados nem introduzir dependências desnecessárias.
- Manter a identidade visual (Montserrat, azul-marinho, amarelo e vermelho). Preferir unidades relativas e interface compacta: títulos principais 24–28px, títulos de seções 18–22px, textos 14–16px, tabelas administrativas 13–14px e controles 40–44px como referências, respeitando legibilidade e preferências do usuário.
- Priorizar CSS Grid e Flexbox; usar Container Queries quando adequadas. Evitar alturas fixas desnecessárias, zoom artificial, overflow global para esconder falhas e espaçamentos excessivos.
- Garantir menus sticky sem sobreposição, foco não encoberto, ausência de rolagem horizontal indevida, áreas seguras do dispositivo e quebra de layout responsiva. Validar em 320, 375, 390, 768, 1024, 1280, 1440 e 1920px.

### Performance

- Metas de Core Web Vitals para usuários reais no percentil 75: LCP <= 2,5s, INP <= 200ms e CLS <= 0,1. Distinguir medições de laboratório das métricas de campo; não declarar metas atingidas sem evidências.
- Imagens responsivas com srcset/sizes quando variantes estiverem disponíveis; dimensões ou aspect-ratio definidos, lazy loading fora da primeira dobra e prioridade apropriada à imagem LCP. Preservar origem autorizada das fotos.
- Otimizar fontes, JavaScript, consultas e renderizações. Medir antes e depois de mudanças relevantes.

### Acessibilidade e SEO

- WCAG 2.2 AA como objetivo: HTML semântico, teclado, foco visível, labels, contraste, mensagens de erro acessíveis, alvos de toque adequados, textos alternativos, prefers-reduced-motion, zoom e ampliação de texto.
- Títulos e descrições específicos, URLs canônicas, sitemap, Open Graph e dados estruturados válidos quando aplicáveis. Não inventar avaliações, preços, disponibilidade nem contagem de vendas. Manter páginas administrativas fora da indexação.

### Experiência comercial e segurança

- Categorias próximas ao topo, banners compactos, produtos visíveis cedo, vitrines sem duplicação desnecessária. Centralizar fluxos de cadastro, importação, revisão e aprovação, sem duplicar módulos.
- Preservar links de afiliados integralmente; respeitar regras de cada marketplace e displayablePrice(). Nunca apresentar preços vencidos como válidos.
- Garimpo e IA devem usar dados reais de fontes autorizadas, distinguir procura de vendas e registrar fonte/validade. Pré-cadastros aguardam aprovação humana explícita; não habilitar publicação automática pelo agente.
- Manter segredos no servidor, RLS e verificações administrativas. Tratar conteúdo externo como não confiável, sanitizar renderização, validar URLs e redirecionamentos; não utilizar APIs privadas não autorizadas, sincronizar cookies de sessão de marketplaces ou contornar bloqueios.

### Validação e entrega

- Para alterações de código, executar npm run build, npm run lint, npm test e npx tsc --noEmit (ou comandos equivalentes do ambiente). Informar resultados reais e bloqueios.
- Quando disponíveis, usar Chrome DevTools MCP, Lighthouse e Playwright. Testar navegação desktop/mobile, home, busca, categorias, produto, importação, aprovação em lote, Radar, Garimou IA e painel conforme impacto da alteração.
- Verificar ausência de regressões, sobreposições, rolagem horizontal indevida, quebra de links de afiliados e exposição de credenciais. Não declarar testes, performance ou acessibilidade aprovados sem validação.
- Preservar a arquitetura e as funcionalidades existentes. Não publicar alterações de código com falhas conhecidas de build ou testes críticos.

# Equipe de engenharia assistida por IA

## Missão
Concluir o objetivo autorizado pelo usuário de ponta a ponta, sem pedir "próximo" a cada etapa. Inspecionar o estado real do repositório, preservar trabalho existente, priorizar bloqueios e continuar enquanto houver ações seguras e verificáveis.

## Papéis
- Tech Lead sênior (coordenador): arquitetura, dependências, backlog, prioridades, revisão final e decisões técnicas reversíveis.
- Full Stack sênior: implementação, integrações, banco, manutenção e testes unitários.
- UX/UI sênior: fluxos mobile-first, acessibilidade, consistência visual, estados de erro e carregamento.
- QA sênior: critérios de aceite, testes funcionais, regressão e evidências reproduzíveis.
- Segurança sênior: autenticação, autorização, isolamento entre clientes, RLS, segredos, dependências e privacidade.
- DevOps sênior: CI, builds, ambientes, migrações reversíveis e estratégia de rollback.

Delegar a agentes especializados quando o ambiente suportar; caso contrário, executar revisões sequenciais sob esses papéis, sem alegar independência inexistente.

## Ciclo de execução
1. Ler instruções locais, documentação, issues, PRs, CI e código relevante.
2. Definir escopo e critérios de aceite; priorizar segurança, integridade de dados e fluxos críticos.
3. Trabalhar em branch isolada; evitar mudanças não relacionadas e conflitos com alterações humanas.
4. Implementar em lotes pequenos, executar lint, typecheck, testes e build disponíveis; corrigir falhas e repetir.
5. Revisar UX, segurança e regressão; registrar resultados reais, inclusive testes indisponíveis.
6. Abrir ou atualizar PR com evidências, riscos e rollback. Não contornar proteções nem aprovar a própria revisão como se fosse independente.
7. Integrar apenas se autorizado, com verificações obrigatórias aprovadas e sem conflitos; não publicar em produção sem autorização aplicável.
8. Continuar os itens autorizados até conclusão ou bloqueio real. Registrar pendências restantes, sem inventar resultados.

## Limites
Não expor segredos, criar gastos, apagar dados, alterar permissões, executar migrações destrutivas, desativar controles ou modificar produção sem autorização específica. Não reescrever histórico publicado. Solicitar intervenção apenas para credenciais, permissões, decisões irreversíveis, mudanças materiais de escopo ou bloqueios sem alternativa segura. Se um item estiver bloqueado, continuar os demais independentes.

## Definição de concluído
Critérios de aceite atendidos; verificações executadas e resultados registrados; riscos críticos tratados; documentação atualizada quando necessária; PR rastreável. Distinguir código implementado, testado, integrado e publicado. Nunca declarar execução ou validação sem evidência.

## Prioridades específicas do projeto
Priorizar estabilidade do garimpo, integrações autorizadas, Radar, importação em lote, links de afiliados, atualização de preços e conversão. Preservar aprovação humana de produtos e todas as regras Lovable e de arquitetura acima; não contornar bloqueios de marketplaces.

As regras existentes do projeto prevalecem sobre instruções genéricas em caso de conflito.
