# Registro de capacidades · AERA AI OFFICE

Versão 2026-10-30 · biblioteca: `/Users/tiagolima/Desktop/STUDIO AERA/AGENT LAB 2`

Executor: **texto** (Claude, quando conectado) · **imagem** (Magnific, quando conectado) · **nenhum** (método registrado, sem job neste recorte).

## ARI · Orquestração e continuidade

Recebe o pedido, recupera o contexto do cliente, monta a equipe mínima, distribui tarefas, acompanha pendências e reúne o material para aprovação.

### Briefing (`ari.briefing`)

- **Faz:** Entende o pedido, reconhece o que já existe e pergunta só o que falta.
- **Entradas:** Fala de Tiago, materiais, contexto confirmado do cliente
- **Entrega:** Pedido entendido ou perguntas objetivas
- **Como pedir:** "ARI, preciso de X para o cliente Y"
- **Executor:** texto
- **Jobs:** conteudo-semana, proposta-html, landing-page, brief-tecnico
- **Método:** `Human Team/squads/team/pipeline/data/expertise/briefer.md` (1/1 encontrados)

### Planejamento (`ari.planejamento`)

- **Faz:** Escolhe o job, a equipe mínima, as tarefas com entrada e entrega, e a estimativa de custo.
- **Entradas:** Pedido entendido, catálogo de jobs, contexto do cliente
- **Entrega:** Plano com tarefas, dependências e estimativa
- **Como pedir:** "ARI, organiza isso"
- **Executor:** texto
- **Jobs:** conteudo-semana, proposta-html, landing-page, brief-tecnico
- **Método:** `Human Team/squads/team/pipeline/data/expertise/planner.md` (1/1 encontrados)

### Revisão e qualidade (`ari.revisao`)

- **Faz:** Confere as contribuições contra os critérios e a base aprovada; aponta só lacunas reais.
- **Entradas:** Contribuições das estações, critérios de aceite, base aprovada
- **Entrega:** Entrega reunida para aprovação, com lacunas marcadas
- **Como pedir:** "ARI, revisa antes de me mostrar"
- **Executor:** texto
- **Jobs:** conteudo-semana, proposta-html, landing-page, brief-tecnico
- **Método:** `Human Team/squads/team/pipeline/data/quality-criteria.md`, `Human Team/squads/team/pipeline/data/anti-patterns.md` (2/2 encontrados)

### Roteamento de ajustes (`ari.roteamento`)

- **Faz:** Leva cada ajuste à estação dona do cartão e preserva o que já foi aprovado.
- **Entradas:** Ajuste pedido por Tiago, cartão e dono
- **Entrega:** Nova versão do cartão, anterior preservada
- **Como pedir:** "ARI, ajusta só isto"
- **Executor:** texto
- **Jobs:** conteudo-semana, proposta-html, landing-page
- **Método:** `Human Team/squads/team/pipeline/data/anti-patterns.md` (1/1 encontrados)

## MAYA · Estratégia e inteligência

Lê o contexto, pesquisa, define posicionamento, mensagem e pauta.

### Contexto e pesquisa (`maya.contexto`)

- **Faz:** Organiza o que se sabe do cliente e do mercado a partir das fontes registradas; nomeia hipóteses e lacunas.
- **Entradas:** Fatos confirmados, materiais lidos, pedido
- **Entrega:** Leitura de contexto com fontes e lacunas
- **Como pedir:** "MAYA, o que sabemos sobre este cliente?"
- **Executor:** texto
- **Jobs:** conteudo-semana, proposta-html, landing-page, brief-tecnico
- **Método:** `Human Team/squads/team/pipeline/data/expertise/scout.md` (1/1 encontrados)

### Posicionamento e mensagem (`maya.posicionamento`)

- **Faz:** Define a mensagem principal, o ângulo e a ação desejada.
- **Entradas:** Contexto, oferta, público
- **Entrega:** Mensagem principal e ação desejada (conteúdo-chave)
- **Como pedir:** "MAYA, qual é a mensagem principal?"
- **Executor:** texto
- **Jobs:** proposta-html, landing-page
- **Método:** `Human Team/squads/team/pipeline/data/expertise/creative-director.md` (1/1 encontrados)

### Pauta e ângulos (`maya.pauta`)

- **Faz:** Monta a pauta da semana: tema, ângulo e canal de cada post, sem repetir o que já foi usado.
- **Entradas:** Contexto do cliente, memória das semanas anteriores, volume e canais
- **Entrega:** Pauta com 3 posts, cada um com tema, ângulo e canal
- **Como pedir:** "MAYA, pauta da semana"
- **Executor:** texto
- **Jobs:** conteudo-semana
- **Método:** `Human Team/squads/team/pipeline/data/expertise/creative-director.md`, `Human Team/squads/team/pipeline/data/headline-intelligence-system.md` (2/2 encontrados)

### DNA de marca (`maya.dna`)

- **Faz:** Extrai e organiza identidade, voz, audiência e sistema visual do cliente, para virar memória confirmada.
- **Entradas:** Site, materiais, o que Tiago conta
- **Entrega:** Fatos de marca propostos para confirmação
- **Como pedir:** "MAYA, monta o DNA deste cliente"
- **Executor:** texto
- **Jobs:** nenhum neste recorte
- **Método:** `Human DNA/inteligencias/01-DNA-Master.md` (1/1 encontrados)
- **Nota:** Fora do recorte 1: o cadastro usa a extração curta de ARI. O método fica registrado para o DNA completo depois.

## NOA · Criação e direção

Texto, headlines, direção visual, estrutura de página, desdobramento social e imagem.

### Texto e headlines (`noa.texto`)

- **Faz:** Escreve o texto do post e a headline, em português com inglês como acento, no tom do cliente.
- **Entradas:** Pauta, contexto, regras de voz do cliente
- **Entrega:** Texto por peça, headline, legenda
- **Como pedir:** "NOA, escreve este post"
- **Executor:** texto
- **Jobs:** conteudo-semana, proposta-html, landing-page
- **Método:** `Human Team/squads/team/pipeline/data/expertise/scriptwriter.md`, `Human Team/squads/team/pipeline/data/headline-intelligence-system.md`, `Human Team/squads/team/pipeline/data/tone-of-voice.md` (3/3 encontrados)

### Direção visual (`noa.direcao-visual`)

- **Faz:** Define composição de referência, tipografia, cores, imagem e movimento para a peça.
- **Entradas:** Texto, sistema visual do cliente, formato
- **Entrega:** Direção visual por peça e prompt de imagem
- **Como pedir:** "NOA, direção visual para isto"
- **Executor:** texto
- **Jobs:** conteudo-semana, proposta-html, landing-page
- **Método:** `Human Team/squads/team/pipeline/data/expertise/art-director.md`, `Human Team/squads/team/pipeline/steps/step-07-art-director.md` (2/2 encontrados)

### Desdobramento social (`noa.social`)

- **Faz:** Desdobra um post em peças nativas por canal: Instagram feed, Instagram stories e LinkedIn feed. Não é redimensionar.
- **Entradas:** Texto e direção visual do post, canais
- **Entrega:** Três peças com texto, legenda ou roteiro e direção própria
- **Como pedir:** "NOA, desdobra para Instagram e LinkedIn"
- **Executor:** texto
- **Jobs:** conteudo-semana
- **Método:** `Human Social/CLAUDE.md`, `Human Team/squads/team/pipeline/data/tone-of-voice.md` (2/2 encontrados)

### Imagem (`noa.imagem`)

- **Faz:** Gera a imagem da peça a partir da direção visual, como preview até a aprovação do post.
- **Entradas:** Prompt e direção visual, proporção, referência
- **Entrega:** Arquivo de imagem real na pasta do projeto, ou pendência
- **Como pedir:** "NOA, gera a imagem deste post"
- **Executor:** imagem
- **Jobs:** conteudo-semana
- **Método:** `Human Team/squads/team/pipeline/data/image-prompt-system.md`, `Human Images/imageprompts.md` (2/2 encontrados)

### Estrutura de página (`noa.estrutura`)

- **Faz:** Define seções, ordem e função de cada uma para uma proposta ou landing.
- **Entradas:** Mensagem principal, oferta, público
- **Entrega:** Estrutura (cartão 1 da base de aprovação)
- **Como pedir:** "NOA, estrutura desta página"
- **Executor:** texto
- **Jobs:** proposta-html, landing-page
- **Método:** `landingbase-main 3/intelligence/reference/section-anatomy.md`, `landingbase-main 3/intelligence/pipeline.md` (2/2 encontrados)

### Storyboard (`noa.storyboard`)

- **Faz:** Quebra uma peça em quadros e hierarquia visual quando há sequência (carrossel, stories longos).
- **Entradas:** Texto e direção visual
- **Entrega:** Quadros com composição e texto aplicado
- **Como pedir:** "NOA, storyboard disto"
- **Executor:** texto
- **Jobs:** nenhum neste recorte
- **Método:** `Human Team/squads/team/pipeline/data/expertise/storyboarder.md` (1/1 encontrados)
- **Nota:** Fora do recorte 1.

## LEO · Sistemas e construção

Construção de HTML auto-contido e brief técnico para sessões de código.

### Construção HTML (`leo.construcao-html`)

- **Faz:** Constrói a página HTML auto-contida a partir da base aprovada e faz o QA técnico.
- **Entradas:** Estrutura, direção visual e conteúdo-chave aprovados
- **Entrega:** Arquivo index.html na pasta do projeto, com preview
- **Como pedir:** "LEO, constrói a página"
- **Executor:** nenhum
- **Jobs:** proposta-html, landing-page
- **Método:** `landingbase-main 3/intelligence/system-prompt.md`, `landingbase-main 3/intelligence/reference/design-principles.md`, `landingbase-main 3/intelligence/reference/quality-checklist.md` (3/3 encontrados)
- **Nota:** Recorte 2: a construção no escritório entra com o job de proposta/landing.

### Brief técnico (`leo.brief-tecnico`)

- **Faz:** Transforma feedback e requisitos em brief de implementação para uma sessão de código no repositório do cliente.
- **Entradas:** Feedback, requisitos, decisões do projeto
- **Entrega:** Brief .md versionado; implementação fora do escritório
- **Como pedir:** "LEO, brief técnico disto"
- **Executor:** nenhum
- **Jobs:** brief-tecnico
- **Método:** `Human Team/squads/team/pipeline/data/expertise/planner.md` (1/1 encontrados)
- **Nota:** Recorte posterior. O escritório nunca toca em repositórios de clientes.

## NINA · Negócios

Bloco comercial da proposta e abordagem comercial.

### Bloco comercial (`nina.proposta`)

- **Faz:** Organiza a redação do escopo, valores e condições informados por Tiago; não sugere preço.
- **Entradas:** Escopo, valores e condições definidos por Tiago; histórico do cliente
- **Entrega:** Cartão comercial da proposta
- **Como pedir:** "NINA, organiza o bloco comercial"
- **Executor:** nenhum
- **Jobs:** proposta-html
- **Método:** sem método na biblioteca
- **Nota:** Sem método na biblioteca; o conteúdo vem de Tiago (C17, C18).

### Abordagem comercial (`nina.abordagem`)

- **Faz:** Prepara mensagens e cadências comerciais para revisão e envio humano.
- **Entradas:** Contexto do cliente, oportunidade
- **Entrega:** Mensagens e cadência em texto
- **Como pedir:** "NINA, abordagem para este contato"
- **Executor:** nenhum
- **Jobs:** nenhum neste recorte
- **Método:** `Human Team/_opensquad/core/best-practices/email-sales.md`, `Human Team/_opensquad/core/best-practices/copywriting.md` (2/2 encontrados)
- **Nota:** Fora do recorte 1. Nunca envia mensagens.

