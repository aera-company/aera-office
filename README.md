# AERA AI OFFICE — Recorte 1 · Conteúdo da semana

Escritório 3D navegável que funciona como mesa de coordenação da AERA: Tiago escolhe o cliente, fala com ARI, e a equipe (MAYA, NOA, LEO, NINA) produz em cartões para aprovação. Tudo o que o prédio e o painel mostram vem de eventos reais do servidor local; nada é simulado com temporizadores.

**Estado em 30/10/2026:** recorte 1 implementado e validado com transporte de teste. A geração real com Claude e a geração de imagens com Magnific **não foram executadas**: as conexões dependem de Tiago.

## Iniciar

Dê dois cliques em **INICIAR_DEMO.command** ou execute:

```bash
python3 scripts/serve_demo.py
```

Abra **http://127.0.0.1:8080/**. O servidor escuta só neste computador. Ctrl+C encerra. Porta ocupada: `python3 scripts/serve_demo.py --port 8081`.

Para apresentar com a build entregue (`dist/`) não é preciso instalar Node. Python 3.9+ com biblioteca padrão.

## O que o escritório faz

1. **Cliente e projeto.** Em Operação → Novo pedido, escolha o cliente ou cadastre um. O cadastro pode partir do site: o servidor lê a página pública (sem login nem JavaScript), ARI propõe fatos e **nada vira memória sem a sua confirmação**. Materiais (texto colado e links) ficam vinculados ao cliente; o que não pôde ser lido fica registrado como "não lido", com o motivo.
2. **Job.** `Pedido livre` (1 a 4 tarefas e uma entrega em texto) ou `Conteúdo da semana` (3 posts, cada um em Instagram feed 4:5, stories 9:16 e LinkedIn 16:9). Proposta em HTML, landing page e brief técnico estão **declarados sem executor** neste recorte e aparecem assim no índice.
3. **Estimativa antes da primeira chamada.** ARI lê o pedido com o contexto do cliente; se faltar algo essencial, pergunta. Depois mostra chamadas e imagens previstas; nada roda sem o seu clique. O teto é a estimativa com margem; ao bater, o trabalho pausa e preserva o feito.
4. **Produção em cartões.** MAYA monta a pauta (informação); NOA produz cada post nas três peças; ARI revisa cartão a cartão. Cada chamada leva trechos de método da biblioteca AERA (AGENT LAB 2) e o evento registra quais arquivos entraram.
5. **Decisão post a post.** Aprovar grava arquivos reais em `runtime/projects/<cliente>/<projeto>/job-…/final/`; descartar pede motivo; ajustar volta só àquele cartão, à estação dona, com a versão anterior preservada.
6. **Imagens.** Com o executor conectado, cada peça ganha uma imagem como `PREVIEW` até a aprovação; sem executor, a peça fica "pendente: imagem" e o job segue. "Gerar imagens pendentes" gera só o que falta.
7. **Prédio e painel leem o mesmo estado.** Estações nas salas (índice de capacidades), ficha com "como pedir", Comando no átrio, organograma vivo do job, aba Equipe com registro por personagem, Capacidades com busca (⌘K), resumo "enquanto você não estava" e reprodução de um job real pelos eventos.

## Conexões

- **Claude:** Operação → Conectar Claude. Chave da conexão própria AERA no campo protegido; fica no servidor e, se possível, no Chaves do macOS. Alternativa: `.env.local` com `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL` (padrão `claude-sonnet-5-5`, configurável). Nunca envie a chave pelo chat.
- **Magnific (imagens):** no mesmo diálogo, "Conectar Magnific" abre o login no navegador (OAuth). Só o token de renovação fica no Chaves. Cada imagem consome créditos da conta. Verificação técnica e limites em `docs/IMAGE_EXECUTOR.md`.
- WhatsApp, Meta Ads, CRM, publicação em redes, Notion e Drive **não estão conectados**. O escritório nunca publica.

## Navegar

- Arrastar: órbita. Rolar / + / −: zoom. Pavimentos: Edifício, Térreo, Superior, Terraço.
- Selecionar sala → estações aparecem; clicar numa estação abre a ficha. **Entrar no ambiente**: altura humana, W A S D.
- **Agentes animados** liga e desliga toda a movimentação, inclusive a circulação ambiente. Movimento reduzido do sistema é respeitado.
- **1–5** departamentos · **P** percurso guiado · **⌘K** busca de capacidades · **Esc** volta.

## Dados e privacidade

`runtime/` guarda o banco (`office.sqlite3`), os arquivos de projeto e a configuração de conexão. É privado e excluído de Git, build e pacote. A biblioteca `AGENT LAB 2` é lida, nunca alterada. Nenhum repositório de cliente é tocado.

## Desenvolvimento e testes

```bash
npm ci
npm run build
npm test
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_operation.py
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_recorte1.py
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_gate2.py
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_gate3.py
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_gate4.py
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_gate5.py
```

Node 20.19+ ou 22.12+ para reconstruir o frontend. `tests/serve_operation_fixture.py` sobe um ambiente separado em 8092, marcado **TESTE SEM IA**, com transportes de teste para texto e imagem; o iniciador normal nunca o usa.

Documentação: `docs/OPERATION.md` (funcionamento e limites), `docs/CAPACIDADES.md` (registro de estações), `docs/IMAGE_EXECUTOR.md` (Magnific), `docs/OPERATION_STATUS.json` (estado exato), `handoff-fable-5.1/04_MAPA_DO_SISTEMA.md` (decisões) e `05_PLANO_IMPLEMENTACAO_RECORTE_1.md` (gates). Backups em `backups/`.
