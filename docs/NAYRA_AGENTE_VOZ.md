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
| Voz | AERA Narradora F1 (id `SjR6urfwxmM7UisfZHpj`), C77; antes NAYRA · AERA (leve) `jecYKZzksA2OLm78zH4x` (C64) e a voz C `QRh4605AzOw98TD9KSPM` |
| Língua | Português (pt) |
| Modelo de voz | Flash v2.5 (`eleven_flash_v2_5`) |
| Cérebro (LLM) | um Claude Sonnet da lista do ElevenLabs |
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

`agent_0101m6m8atnyf348cx0hp6ajmr1z` ("NAYRA · AERA AI Office (F1)", criado em 04/11, C77): voz AERA Narradora F1 (id `SjR6urfwxmM7UisfZHpj`, escolhida pelo Tiago no lugar da voz leve), prompt C65 com a equipe atualizada (C76): NOA no texto e conceito, JOHN no design e arte, os dois na sala Create, e a regra de que o JOHN só gera lote de imagem depois do ok do Tiago (a NAYRA conta, não libera).

Sem uso, podem ser apagados no painel: `agent_5901m6m7wcadex58q2a09dt41cb8` (C76, voz leve com JOHN), `agent_5501m6kdm81resntd9hpg8qdt6fp` (C65, equipe sem JOHN), `agent_1001m6hftjzje3c95dm8zq5xmsxt` (voz C) e `agent_9201m6kcycdtektb0bfp8zx8fgnn` (voz leve, prompt antigo).

Allowlist ainda não ligada (04/11); quando ligar, é no `agent_0101…`: no ElevenLabs, trocar de ElevenCreative para Agents (botão Switch no canto inferior esquerdo), abrir o agente, aba Security, e adicionar `127.0.0.1` e `localhost`.

O prompt em uso é o do agente `agent_0101…` no ElevenLabs; o bloco "Prompt do sistema" acima é a versão anterior (só escritório). O ID anterior ao JOHN está em `backups/before-john/nayra-agent.json`.

Diagnóstico: cada tentativa de conversa grava o estado da conexão e o erro (sem áudio nem texto falado) em `runtime/office-8080.log`, nas linhas `[NAYRA voz]`.
