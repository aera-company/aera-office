# AERA / THE LIVING OFFICE
## Brief de arranque para Claude Code — Gate 00 + Gate 01
**Data:** 25/10/2026  
**Status:** proposta de arquitetura e protótipo, não sistema aprovado  
**Direção:** AERA, *We make things move.*

### 1. Intenção
Construir um **escritório digital 3D navegável, autoral e operacional**, representando como a AERA reúne estratégia, criação, tecnologia e inteligência artificial. O escritório é uma interface para tarefas reais, não uma simulação que finge ter dezenas de funcionários trabalhando.

O visitante deve poder: contemplar o edifício inteiro, orbitar e aproximar a câmera, selecionar departamentos e agentes, entender suas especialidades e solicitar uma tarefa demonstrativa que retorna um resultado verificável.

### 2. Referência visual aprovada para estudo
Partir da referência do usuário: **edifício contemporâneo com dois pavimentos, fachada quase inteiramente de vidro, estrutura metálica escura, transparência entre salas, vegetação moderada e iluminação quente contrastando com exterior mais frio**. Esta imagem é **referência**, não textura panorâmica fixa nem autorização para reproduzi-la pixel a pixel.

A direção deve parecer arquitetura corporativa de alto padrão, não metaverso infantil, videogame ou cyberpunk. Preservar identidade AERA, tipografia Instrument Sans quando disponível/licenciada, linguagem editorial contida e microinterações sofisticadas.

### 3. Integração HUMAN: como usar
**Auditar primeiro** a pasta HUMAN no Studio AERA e qualquer documento HUMAN Motion disponível, inclusive o guia AERA_HUMAN_MOTION_INTEGRACAO.md. Mapear exatamente o que existe e o que pode ser reaproveitado. Não supor acesso a pastas ausentes.

Incorporar como método de direção:
- Aprovar *styleframes* antes de polir animações.
- Definir cena, movimento, luz, materiais e estados de câmera com travas de continuidade.
- Separar ativos e geometria animáveis de imagens planas de referência.
- Trabalhar em gates, com aprovação de previews e estado de desenvolvimento transparente.

**Não transplantar sem avaliação** uma stack de vídeo Remotion/Seedance para um produto 3D interativo em tempo real. Remotion pode servir a teasers e demonstrações gravadas; não deve ser motor da navegação 3D.

### 4. Arquitetura de experiência (hipótese inicial)
- **Recepção / AERA OS:** visão geral e entrada para tarefas.
- **THINK:** pesquisa, estratégia, diagnóstico.
- **CREATE:** direção criativa, identidade, conteúdo.
- **BUILD:** interfaces, software, automação e agentes.
- **GROW:** prospecção e inteligência comercial.
- **CONTROL:** orquestração de fluxo, pendências e entregas.

Os ambientes podem ser repartidos entre dois andares, sem obrigar um cômodo separado para cada função. Primeiro validar legibilidade e proporção do edifício.

### 5. Personagens — nomes de trabalho, não definição final
Agentes apresentados como **agentes de IA**, com nome curto, responsabilidade clara e comportamento consistente:
- **MAYA** — Strategy / THINK
- **NOA** — Creative / CREATE
- **LEO** — Systems / BUILD
- **NINA** — Growth / GROW
- **ARI** — Orchestration / CONTROL

Não apresentar esses personagens fictícios como empregados humanos reais. Todo agente deve ter: nome, função, capacidade, limites, tom de interação, ferramenta autorizada, exemplos de entrada e saída. Para o protótipo, implementar no máximo três agentes visualmente; os demais permanecem definidos no plano.

### 6. Interação e voz
**V0/V1:** painel de comando textual com botão de enviar, histórico simples e *demo mode* claramente identificado. O usuário pode ditar no painel com o aplicativo desktop **Wispr Flow**, que insere texto em campos editáveis; não pressupor que Wispr oferece SDK oficial embutível no site nem que aciona automaticamente a execução.

**Depois:** botão de microfone nativo ao produto, com transcrição por serviço adequado e consentimento claro. Separar transcrição de **entendimento, autorização e execução** da tarefa. Ações em sistemas de clientes exigem credenciais seguras, permissão e confirmação humana quando apropriado.

Exemplo de demo: “Maya, organize um diagnóstico rápido para uma empresa B2B do setor offshore.” O sistema exibe etapas **Recebido → Analisando → Entrega pronta**, com texto gerado e possibilidade de exportação. Em modo de demonstração, rotular dados fictícios e evitar sugerir conexões inexistentes.

### 7. Stack inicial candidata (validar versões)
- **Next.js + React + TypeScript** para app, navegação e painéis.
- **Three.js + React Three Fiber + Drei** para edifício, câmera e interações 3D.
- **Blender** para modelagem dos ativos e exportação GLB/GLTF, caso necessário.
- **Zustand** ou equivalente enxuto para estado de navegação e seleção.
- **Supabase** ou backend equivalente apenas quando fluxo de agentes, autenticação e persistência entrarem no escopo real.
- **API server-side** para agentes, com segredos fora do navegador, logs sanitizados, limites de custo e controle de acesso.

Priorizar renderização confortável em desktop e Mac Apple Silicon. Geometria modular, texturas otimizadas, iluminação pré-calculada onde fizer sentido, limite de efeitos custosos e versão de qualidade reduzida.

### 8. Gates e critério de aprovação
**GATE 00 — Descoberta e inventário, sem codificar experiência final**
1. Encontrar e ler os materiais HUMAN do Studio AERA (ou registrar exatamente o que não está disponível).
2. Auditar a identidade real da AERA, assets, tipografia, referências e repositório existente. Não alterar `aera.company`.
3. Entregar um documento curto de arquitetura técnica, riscos de performance e matriz `existente / reutilizável / criar / bloqueado`.
4. Definir cena-piloto e requisitos realistas do computador alvo.

**GATE 01 — Protótipo de cena, ainda sem agentes reais**
1. Criar apenas um *blockout* 3D navegável de dois pavimentos, com volumes, vidros, iluminação e três hotspots.
2. Implementar câmera orbit, zoom suave, foco em departamento e retorno à visão geral.
3. Entregar **três stills**: visão geral, foco no piso inferior e foco no piso superior.
4. Renderizar protótipo web rodando localmente com comandos de execução documentados.
5. Incluir painel placeholder para um agente e entrada textual, **sem simular chamadas de IA reais**.
6. Reportar FPS medidos, peso de assets e limitações; não inventar métricas.
7. Parar para aprovação de composição, perspectiva, iluminação e interação antes de avançar.

**GATE 02 — Primeiro agente funcional (futuro):** ligar um agente a um provedor de IA, criar fluxo demonstrativo auditável com resposta real, testar custo e segurança.

**GATE 03 — Voz e apresentação comercial (futuro):** Wispr Flow como digitação por voz para uso interno, opção de microfone nativo para a experiência web, narrativa de demonstração comercial, mobile e publicação controlada.

### 9. Entrega esperada agora
Um protótipo do **edifício 3D** com navegação agradável e estética que mereça uma apresentação AERA. Não implementar marketplace de agentes, 18 funcionários, pipeline multiagente ou integrações de terceiros nesta etapa. Concentre o esforço em **arquitetura, performance e direção de arte**.

### 10. Prompt inicial para Claude Code
> Você é arquiteto de experiências 3D para web, diretor de arte digital e engenheiro sênior React/Three.js. Seu objetivo é iniciar **AERA / THE LIVING OFFICE**, um escritório digital navegável e interativo com dois pavimentos de vidro, linguagem arquitetônica premium e marca AERA. Leia integralmente este brief. Primeiro execute somente **GATE 00**: localize e inventarie a pasta HUMAN do Studio AERA e os ativos originais da AERA, avalie regras de direção e proponha a estrutura técnica, sem instalar dependências ou começar a cena final. Liste o que encontrou, o que não encontrou, conflitos entre métodos de motion/vídeo e navegação 3D, plano de reaproveitamento e riscos. Em seguida proponha o escopo detalhado do **GATE 01**, cujo único objetivo será um edifício 3D navegável com três hotspots e protótipos de câmera. Aguarde minha aprovação antes de implementar. Não afirme funcionalidades ou acessos que não foram verificados e não modifique projetos existentes da AERA.
