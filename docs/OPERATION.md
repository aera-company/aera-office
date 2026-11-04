# Operação AERA — Recorte 1 / 30.10.2026

## Arquitetura

Vite + Three.js no navegador; servidor Python local (`scripts/serve_demo.py`) com API no mesmo domínio; SQLite em `runtime/office.sqlite3`. O servidor é dono do trabalho: fechar o painel ou navegar no 3D não cancela nada.

Módulos em `scripts/office/`:

| Módulo | Papel |
|---|---|
| `store.py` | SQLite: `jobs`, `tasks`, `events`, `deliveries`, `clients`, `projects`, `materials`, `memory_notes`, `cards`, `card_items`, `artifacts`. Migrações aditivas. |
| `engine.py` | Orquestração: pedido livre (plano → tarefas → revisão) e job em cartões (`process_content`: plano → estimativa → pauta → posts → imagens → revisão). Métodos por estação em cada chamada. Teto de chamadas e de imagens. |
| `capabilities.json` / `capabilities.py` | Registro único de 18 estações em 5 personagens: método (arquivos da biblioteca, só leitura), entradas, entrega, "como pedir", executor, jobs, estado. |
| `jobs.py` | Catálogo: `pedido` e `conteudo-semana` executáveis; `proposta-html`, `landing-page`, `brief-tecnico` declarados. Estimativa por job. |
| `fetch.py` | Leitor de links: só `https` público, sem JavaScript nem login; texto com data; falha vira "não lido" com motivo. |
| `artifacts.py` | Arquivos reais por peça aprovada em `runtime/projects/<cliente>/<projeto>/job-<id>/final/<canal>/`. |
| `image_provider.py` | Executor de imagem atrás de uma interface: fixture (PNG marcado) e Magnific (MCP HTTP + OAuth). |
| `provider.py` / `keychain.py` | Transporte Claude server-side; segredos no Chaves do macOS. |

## Modelo de dados

`Cliente → Projeto → Demanda (job) → Plano → Cartões → Peças → Artefatos/Versões → Aprovações/Eventos`, mais `Materiais` e `Memória` por cliente.

- **Memória** em níveis: 1 (fato, decisão, preferência; entra em toda chamada do cliente), 2 (nota de passagem; registrada, não carregada neste recorte). Estados: proposto, confirmado, superado, descartado. Corrigir preserva a anterior como superada.
- **Isolamento**: todo contexto é filtrado por `client_id`; teste explícito garante que o material de um cliente não entra na chamada de outro.
- **Cartão**: dono (estação), versão, estado (aguardando, parcial pendente de X, aprovado, ajuste, descartado), peças por canal, revisão de ARI, feedback.
- **Artefato**: arquivo real no disco, versão, estado (preview, final), `show_to_client`.
- **Evento**: job, personagem, zona, hora, mensagem, métodos usados. O 3D, o painel, a Equipe, o resumo e a reprodução leem os eventos.

## Ciclo do job "conteúdo da semana"

1. ARI lê pedido + contexto do cliente (fatos nível 1, materiais) com os métodos de briefing e planejamento. Falta essencial → `needs_input`.
2. Plano aceito → `awaiting_estimate`: chamadas, tokens de saída máximos, imagens, teto. Nenhuma chamada antes da confirmação.
3. MAYA → pauta com 3 posts (informação). Cartões criados.
4. NOA → um post por chamada, três peças. Com executor de imagem, cada peça ganha imagem em `preview/`; sem executor, `parcial: pendente de imagem`.
5. ARI → revisão por cartão (lacunas reais, sem reescrever).
6. `awaiting_approval`: aprovar grava finais; descartar registra motivo; ajustar reproduz só o cartão com a versão anterior e o feedback. Memória de nível 2 do cliente recebe uma nota por decisão.
7. Teto atingido → `interrupted` com motivo; retomar libera 3 chamadas a mais, nunca remove o limite. Cancelar entre chamadas interrompe as seguintes.

Limites por chamada: 1.800 tokens de saída no plano, 2.000 por pauta, 2.600 por post, 1.600 na revisão. Sem retry pago automático. Modelo `claude-sonnet-5-5`, configurável.

## API local (loopback, mesma origem)

`/api/status` · `/api/clients[/{id}[/context]]` · `/api/clients/{id}/{propose|projects|materials|notes}` · `/api/clients/{id}/notes/{nid}/{confirm|reject|supersede}` · `/api/capabilities` · `/api/jobs/catalog` · `/api/jobs/estimate?type=` · `/api/jobs` · `/api/jobs/{id}/{answer|approve|revise|cancel|resume|confirm-estimate|images|export}` · `/api/jobs/{id}/cards/{cid}/{approve|revise|discard}` · `/api/artifacts/{id}/file` · `/api/activity` · `/api/summary` · `/api/connect` · `/api/disconnect` · `/api/image/{connect|disconnect|callback}`.

## O que executa e o que não executa

**Executa (com conexão):** cadastro de cliente a partir do site, leitura de links, planejamento, pauta, posts em três peças, revisão, ajuste por cartão, aprovação com arquivos, memória por cliente, estimativa e teto, imagens via executor conectado, exportação Markdown, resumo e reprodução.

**Não executa:** publicação em redes, WhatsApp, Meta Ads, CRM, Notion, Drive, PDF e imagem como material de entrada, construção de HTML (recorte 2), brief técnico (recorte posterior). Agendamento exige servidor ligado e Mac acordado; um agendamento vencido aparece como "não rodou".

## Validação executada (30/10/2026)

| Camada | Como | Resultado |
|---|---|---|
| Domínio e HTTP do pedido livre | `tests/test_operation.py`, transporte de teste | 16 testes |
| Clientes, links, memória, isolamento | `tests/test_recorte1.py` | 13 testes |
| Registro de capacidades e catálogo | `tests/test_gate2.py` | 13 testes |
| Job em cartões | `tests/test_gate3.py` | 9 testes |
| Executor de imagem (fixture e MCP contra servidor falso local) | `tests/test_gate4.py` | 8 testes |
| Atividade e resumo | `tests/test_gate5.py` | 3 testes |
| Navegação e estações (Node) | `npm test` | 8 testes |
| Interface | `tests/serve_operation_fixture.py` em 8092, TESTE SEM IA | cadastro da AERA com leitura real de `https://aera.company`, semana completa, aprovação, ajuste, imagens de fixture, Equipe, Capacidades, organograma, estações, reprodução |
| Leitura de link real | servidor leu `https://aera.company` (6.146 caracteres de texto) | lido |
| **Geração real com Claude** | pendente de conexão | **não executada** |
| **Geração real com Magnific** | pendente de login OAuth e créditos (22 de 45.000 em 30/10) | **não executada** |
| Desempenho da cena | registro anterior 59,8 fps no M1; geometria inalterada (42 draw calls) | fps pós-gate 6 a medir no Safari/Chrome |

Credenciais: nenhuma chave aparece em `dist/`, nos logs, nos arquivos de entrega ou no contexto enviado ao provedor (testes HTTP verificam a chave de teste; `docs/OPERATION_STATUS.json` registra a varredura do bundle).

## Referências

- Claude API: https://platform.claude.com/docs/en/api/overview
- Magnific MCP: `docs/IMAGE_EXECUTOR.md`
- Decisões e plano: `handoff-fable-5.1/04_MAPA_DO_SISTEMA.md`, `05_PLANO_IMPLEMENTACAO_RECORTE_1.md`
