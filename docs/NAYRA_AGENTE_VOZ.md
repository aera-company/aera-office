# NAYRA · agente de voz para demo (C49 a C60)

Configuração do agente de conversa no ElevenLabs. Criar o agente não gasta crédito; cada minuto de conversa gasta.

## Como criar

**Caminho A (recomendado): liberar a chave e a NAYRA cria sozinha.**
No ElevenLabs, em Developers > API Keys, edite a chave usada pelo Claude Code e ligue:
- ElevenLabs Agents: **Write** (necessário para criar o agente);
- User: **Read** (opcional, deixa conferir créditos pelo Claude Code).
Depois, diga "chave liberada" no Claude Code.

**Caminho B: criar à mão no painel.** Agents > New agent > Blank, e preencha com os campos abaixo. Ao final, copie o Agent ID e mande no chat (o ID não é segredo; não mande a chave).

Em qualquer caminho, vale ligar em Security a lista de endereços permitidos (allowlist) com `127.0.0.1` e `localhost`, para o agente só aceitar conversa vinda do office.

## Campos

| Campo | Valor |
|---|---|
| Nome | NAYRA · AERA AI Office (voz leve) |
| Voz | AERA Narradora F1 (C77); antes a voz leve (C64) e a voz C |
| Língua | Português (pt) |
| Modelo de voz | Flash v2.5 (`eleven_flash_v2_5`), modo Custom; Stability 0,75, Similarity 0,85 |
| Cérebro (LLM) | Claude Opus 5.5 (escolha do Tiago em 04/11); antes Claude Sonnet 4.5 |
| Temperatura | 0,4 |
| Duração máxima | 600 s (10 min, C60) |
| Gravar voz | desligado |
| Retenção | 30 dias |

O office encerra a conversa sozinho com ~20 s de silêncio ou com "obrigado, NAYRA" (C58).

### Primeira mensagem

Oi! Eu sou a NAYRA, coordeno o escritório da AERA. Quer que eu mostre o que a equipe fez esta semana?

### Prompt do sistema

```
Você é a NAYRA, assistente da AERA, coordenando o AERA AI Office numa demonstração ao vivo para um cliente, no computador do Tiago Lima, fundador da AERA.

Você fala por voz. Responda sempre em português do Brasil, mesmo que falem em outra língua. Frases curtas e naturais, no máximo três frases por resposta, sem listas, sem markdown, sem emojis. Tom calmo, preciso, caloroso e seguro, com pouca autocelebração. Evite "soluções inovadoras", "transformador", "disruptivo" e "360".

Tudo o que você sabe está no estado abaixo, lido do escritório no começo desta conversa. Fale apenas da AERA e do que está registrado ali. Se perguntarem algo que não está no estado, diga com naturalidade que isso não está registrado no escritório e ofereça o que você pode mostrar. Nunca invente trabalho, número, cliente, prazo ou resultado. Não fale de outros clientes, de dados pessoais do Tiago nem de preços.

A equipe são agentes de IA, não pessoas: ARI coordena, MAYA cuida da estratégia, NOA do texto, JOHN do design e da arte, LEO da tecnologia e NINA dos negócios. Quando falar de alguém da equipe, diga o nome (ARI, MAYA, NOA, JOHN, LEO ou NINA): o escritório leva a câmera até a sala dele. Quando falar de um trabalho, diga o título exatamente como está no estado: o card dele aparece na tela.

Você mostra e conduz, mas não aprova, não altera, não publica e não envia nada. Se pedirem para aprovar ou publicar, explique que essa decisão é sempre do Tiago.

Para ler um post, leia a headline e o texto do LinkedIn, sem ler hashtags nem marcações. Se for longo, leia o começo e pergunte se querem o resto.

Quando se despedirem ou disserem "obrigado, NAYRA", despeça-se em uma frase curta.

ESTADO DO ESCRITÓRIO:
{{estado_escritorio}}
```

`{{estado_escritorio}}` é preenchido pelo office a cada conversa (rota `/api/nayra/demo-context`, só AERA).

## Depois de criado

O office lê o ID de `runtime/nayra-agent.json`:

```json
{"agent_id": "agent_..."}
```

## Como funciona no office

- "NAYRA, modo apresentação" (ou o botão Apresentar): o office passa a mostrar só a AERA e troca a voz.
- "Oi, NAYRA" ou qualquer frase com o nome dela ("NAYRA, o que o ARI faz?") abre a conversa com este agente, em qualquer modo (C62, C63). O briefing do dia, com a Luciana, fica no clique do botão NAYRA fora da apresentação.
- Enquanto ela fala, a câmera vai até a sala de quem ela cita e o card do trabalho citado aparece. Nada é alterado.
- O indicador "ouvindo" no topo mostra quando o navegador está ouvindo; um clique silencia.

## Agente em uso

Único agente no ElevenLabs desde 04/11: "NAYRA · AERA AI Office (F1)" (C77). O ID fica só em `runtime/nayra-agent.json`, fora do repositório. Os agentes anteriores foram apagados.

- Voz AERA Narradora F1, escolhida pelo Tiago no lugar da voz leve.
- Voice mode **Custom** (LLM + TTS). O modo Realtime (Eleven Realtime v1) foi testado no painel e descartado: imita a voz em vez de usá-la e a voz oscilava.
- LLM **Claude Opus 5.5**, escolhido pelo Tiago em 04/11 (mais caro e um pouco mais lento por resposta que o Sonnet).
- Voz: Stability 0,75, Similarity 0,85, Speed 1,0.
- Prompt C65 com a equipe atualizada (C76): NOA no texto e conceito, JOHN no design e arte, os dois no Create; o JOHN só gera lote de imagem depois do ok do Tiago (a NAYRA conta, não libera).

## Autenticação (C79)

Allowlist não serve: o ElevenLabs não aceita `localhost` nem IP. A proteção é a autenticação do agente.

- O Tiago digita a chave do ElevenLabs no office, em Operação › Conectar Claude › Voz da NAYRA. Ela fica no Chaves do macOS (`scripts/office/voice.py`) e nunca volta ao navegador.
- A cada conversa o navegador pede `POST /api/nayra/voice-session` e recebe uma senha de uso único: `token` para voz (WebRTC) ou `signed_url` para o teste em texto (WebSocket). Sem chave salva, o office usa o ID público do agente.
- Com a chave salva e testada, liga-se "Enable authentication" em Agent settings › Security no ElevenLabs e publica. A partir daí, o ID do agente sozinho não abre conversa.
- A chave precisa de acesso a "ElevenLabs Agents". O log do office marca cada conversa como "protegida" ou "sem chave de voz".

O prompt em uso é o do agente no ElevenLabs; o bloco "Prompt do sistema" acima é a versão anterior (só escritório).

## Briefing na voz F1 (C80)

O briefing do botão NAYRA fala com a voz F1, não mais com a Luciana. O servidor gera cada frase em `POST /api/nayra/speak` (ElevenLabs text-to-speech, Multilingual v2, stability 0,75, similarity 0,85) com a mesma chave de voz e guarda o mp3 em `runtime/nayra-voz-cache` (as 300 frases mais recentes): "Ouvir de novo" e frases repetidas não gastam crédito. O ID da voz fica em `runtime/nayra-agent.json` (`voice_id`), fora do repositório. Se não houver chave, faltar permissão ou o navegador segurar o som, o briefing usa a voz do Mac e avisa na tela. A chave precisa também da permissão "Text to Speech".

## Como ela chama o Tiago (C83)

Quando fala com ele, a NAYRA o chama de "Chefe": o briefing abre com "Boa noite, Chefe." e a conversa fora do modo apresentação manda esse aviso ao agente. Falando dele para outras pessoas, ele continua Tiago. No prompt do agente, a frase "Se o escritório avisar que é o Tiago, trate-o pelo nome." deve virar "Se o escritório avisar que é o Tiago, chame-o de Chefe."

## Dois agentes (C84)

- **NAYRA · Tiago**: usado fora do modo apresentação. Recebe o escritório inteiro (`GET /api/nayra/office-context`: todos os clientes, fatos confirmados e trabalhos recentes) e, depois, os dossiês dos projetos na base de conhecimento. Chama o Tiago de Chefe. Assuntos pessoais ficam de fora.
- **NAYRA · AERA AI Office (F1)**: usado no modo apresentação, com cliente. Recebe só o cliente apresentado (`/api/nayra/demo-context`).
- Os IDs ficam em `runtime/nayra-agent.json` (`agent_id` para apresentação, `agent_id_tiago` para o Tiago, `voice_id`), fora do repositório. Sem `agent_id_tiago`, o agente de apresentação atende os dois casos.
- `POST /api/nayra/voice-session` escolhe o agente pelo modo do servidor; a rota de contexto inteiro devolve só o cliente apresentado se o modo apresentação estiver ligado. O log marca cada conversa com o perfil (`tiago` ou `apresentacao`).
- Os dois usam a voz F1, modo Custom, autenticação ligada e a mesma chave de voz.

Diagnóstico: cada tentativa de conversa grava o estado da conexão e o erro (sem áudio nem texto falado) em `runtime/office-8080.log`, nas linhas `[NAYRA voz]`.

## Site público com login (C89)

Sem login, o site abre o agente de apresentação, que só conhece os fatos públicos da AERA. Com login, o mesmo botão abre o agente completo, cuja base de conhecimento guarda os dossiês dos projetos, sem valores comerciais.

- `api/login.js` confere usuário e senha no servidor e grava um cookie de sessão assinado, `HttpOnly`, `Secure` e `SameSite=Strict`, válido por 12 horas. Seis tentativas erradas por visitante bloqueiam por 15 minutos.
- `api/session.js` diz à página só se há sessão. `api/vitrine-session.js` escolhe o agente pela sessão.
- O conteúdo dos projetos nunca entra neste repositório. Ele fica na base de conhecimento do agente, no ElevenLabs.
- Variáveis no projeto Vercel: `OFFICE_LOGIN_USER` e `OFFICE_LOGIN_PASSWORD` (cadastradas pelo Tiago), `SESSION_SECRET` (aleatória, com 32 caracteres ou mais) e `NAYRA_AGENT_ID_TIAGO`.
- Atenção: com login, a NAYRA fala de todos os projetos. Em demonstração, outro cliente pode ouvir sobre trabalhos que não são dele.
