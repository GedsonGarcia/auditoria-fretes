# Auditoria Inteligente de Fretes

- [x] Diagnosticar o projeto disponível e analisar o escopo e os logotipos enviados.
- [x] Confirmar onde está a base original de CT-es — usuário informou que está em uma base externa existente.
- [ ] Conectar a base externa original — depende da conexão pelo usuário em Configurações → Geral → External Supabase; não criar base paralela.
- [x] Obter a referência HTML aprovada citada no escopo.
- [x] Reproduzir somente o layout aprovado, suas seis áreas e quatro abas, sem novas páginas ou recursos; manter dados vazios enquanto a base externa não estiver conectada.
- [x] Validar navegação, abertura das abas, inclusão visual de faixas e apresentação em computador, tablet e celular; teste de rotas aprovado.
- [x] Confirmar dados de perfil necessários antes de implementar autenticação — nome e equipe.

## Escopo integrado anterior — fora da solicitação atual de layout

Todos os itens abaixo dependem da conexão e inspeção da base externa original e de uma solicitação para retomar a integração.

- Estruturar dados e permissões preservando a base existente.
- Persistir Tabelas de Frete e suas versões.
- Implementar motor determinístico com memória de cálculo e testes.
- Implementar importação, validação e associação de faturas.
- Implementar auditorias de faturas e CT-es, detalhamento e exportações.
- Implementar alertas, tratativas e interpretação baseada em evidências.
- Integrar Visão Executiva com filtros, indicadores e gráficos reais.
- Validar fluxos completos, segurança e critérios de aceitação.