# Roadmap
- [x] Etapa 2 Parte A: banco, RLS, storage, login
- [x] Etapa 2 Parte B: painel /admin e site lendo do banco
- [x] Homologação e estabilização do MVP
- [x] Troca de senha no painel e exigência no próximo acesso
- [x] Validar senhas fortes na troca e recuperação; ativar rejeição de senhas vazadas
- [ ] Configurar tamanho e caracteres obrigatórios no serviço de acesso — depende da usuária em Auth settings → Email
- [x] Limitar tentativas de login — descartado pela usuária: só senha forte por enquanto
- [x] Instagram oficial no rodapé (@garimouachouoficial)
- [x] Chamada para seguir o Instagram na página inicial
- [x] Botão de compartilhar cada produto (WhatsApp / menu nativo)
- [ ] Etapas 3-5

- [x] Etapa 3: inteligência comercial (eventos, Desempenho, links UTM)
- [ ] Sprint de estabilização técnica: analisar o que falta ajustar
- [ ] Integração Mercado Livre — aguardando ID e chave secreta do aplicativo (usuária)
- [ ] Integração Shopee Afiliados — adiada pela usuária; precisa de App ID e App Secret
- [x] Central de Importação (links, CSV, busca Shopee preparada, integrações)
- [x] Radar de Oportunidades (MVP: score, quadros, assistente, dados manuais/relatório)
- [ ] Radar: dados automáticos — dependem das credenciais Shopee/Mercado Livre; rotina diária não agendada (só "Atualizar agora")

## Evolução do Radar
- [x] Regra única de score (comissão extra, desconto, penalidade por poucos dados, vencidas fora)
- [x] Histórico de indicadores, crescimento pelo histórico, buscas do site (LGPD)
- [x] Execuções registradas, trava única, limite de requisições, atualização diária configurável
- [x] Novas visões, assistente com plano/comparação/substituição, categoria automática, vencidos viram rascunho
- [ ] OAuth do Mercado Livre, tendências e mais vendidos — aguardando ID e chave secreta do app
- [ ] Shopee em produção — aguardando App ID e App Secret
- [ ] Tendências de busca externas — sem fonte oficial aberta

## Agente comercial (Garimou IA)
- [x] MCP admin separado do público, ferramentas ligadas ao Radar
- [x] Agente multi-etapas, cards, importação com aprovação, plano diário, campanhas, preferências
- [ ] Homologar Shopee/Mercado Livre — aguardando credenciais

## Sprint crítica de estabilização comercial
- [x] P2: importação mantém a data real da consulta do preço; consulta vencida vira rascunho sem preço
- [ ] P2: revalidar oferta vencida antes de publicar; recuperação de importação parcial
- [ ] P3: aprovação humana em tela autenticada para publicações vindas do MCP; limite de uso de IA em todas as operações
- [ ] P5: Central financeira (importar relatório CSV de vendas/comissões, sem duplicidade)
- [ ] P6: status dos agendamentos (última/próxima execução, erros, itens)
- [ ] P1/P4: Shopee e Mercado Livre — aguardando credenciais
- [ ] Integração contínua — depende de conectar o GitHub

## Importação inteligente por links de divulgação
- [x] Aba "Colar ofertas e links": mensagens/WhatsApp/até 50 links, prévia, edição, seleção, progresso, reprocessar
- [x] Dados públicos da página (servidor, domínios permitidos, anti-SSRF), foto oficial copiada, anexar foto, duplicados
- [ ] Preço/comissão/fotos automáticos do Mercado Livre e Shopee — páginas bloqueiam leitura; dependem das credenciais oficiais
- [x] Aperfeiçoamento: comissão/ganhos extras/cupom/vendas/avaliação/selos separados, cleanUrl corrigido, DNS e conteúdo das fotos validados, fotos adicionais, envio ao Radar, resumo final
