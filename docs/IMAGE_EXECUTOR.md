# Executor de imagem · verificação técnica do Magnific (30/10/2026)

Verificação feita antes de escrever o adaptador, como o plano do recorte 1 pede (gate 4, A4). Só leituras: nenhuma imagem foi gerada, nenhum crédito consumido, nenhuma conta conectada ao escritório.

## O que a biblioteca espera

- `Human Images/.mcp.json` e `Human Team/.mcp.json` declaram o servidor `magnific` como **MCP HTTP** em `https://mcp.magnific.com/mcp`.
- `Human Images/providers.md` §5: autenticação **OAuth no primeiro uso**; nomes de ferramentas descobertos em runtime; contrato comum prompt · proporção · resolução (`1k` ≈ 1024, `2k` ≈ 2048, `4k` ≈ 4096 no lado maior) · referências · uma chamada por imagem; gerar em `2k` e só fazer upscale quando pedido; resultado salvo na pasta do projeto com metadata e log.

## O que o serviço responde (verificado)

**Transporte.** `POST https://mcp.magnific.com/mcp` responde `401` com `WWW-Authenticate: Bearer … resource_metadata="https://mcp.magnific.com/.well-known/oauth-protected-resource"`. É MCP sobre HTTP com token Bearer; o servidor Python local consegue falar JSON-RPC com ele (`initialize`, `tools/call`) usando só a biblioteca padrão.

**OAuth.** `oauth-protected-resource` aponta para o servidor de autorização `https://auth.magnific.com/realms/mcp` (Keycloak), com:
- `authorization_endpoint`, `token_endpoint` e **`registration_endpoint`** (registro dinâmico de cliente);
- PKCE `S256`;
- grants `authorization_code` e `refresh_token`; escopos `openid profile email mcp:custom-audience offline_access`.

Logo, a conexão do escritório é: registrar um cliente, abrir o navegador para o login do Tiago, receber o código num endereço de retorno em `127.0.0.1`, trocar por token e guardar o **refresh token** no Chaves do macOS, como a chave do Claude. Nenhuma senha passa pelo escritório. Esse fluxo está implementado em `scripts/office/image_provider.py`, mas **não foi executado contra o serviço real**: depende de Tiago decidir conectar.

**Ferramentas relevantes** (nomes nesta versão do servidor; podem mudar):
- `images_models_list` → catálogo. Modelo recomendado pelo próprio servidor: **`magnific-one`** (tier sota). Proporções nativas `1:1 2:1 3:1 2:3 3:2 3:4 4:3 16:9 9:16 21:9`; **não há 4:5 nativo**, mas aceita `width`/`height` exatos (até 8:1), então 1080×1440 é possível. Resoluções `1k 2k 4k`; qualidades `medium` (padrão) e `high` (Max, bem mais cara). **Suporta referência** (`image`, `style`, `character`, `product`, `locations`), o que permite gerar o feed primeiro e derivar stories e LinkedIn por referência (seção 12.9 do mapa). Tempo esperado ≈ 83 s por imagem. Exige plano premium. Modo `draft` gera grade de 4/8/16 variações a custo menor.
- Alternativas no catálogo: `gpt-2` e `gpt-2-mini` (família GPT, com fundo transparente, referências, ~31 a 43 s). Nenhum modelo "nano banana" apareceu na busca nesta sessão.
- `images_generate(prompt, mode, aspectRatio | width+height, resolution, quality, references[], count, seed, brandKitId?)` → devolve identificadores de criação **enfileirados**.
- `creations_wait(identifiers, timeoutSeconds≤55)` → espera até terminar; `creations_get` → `url` (resolução cheia), `previewUrl`, `thumbnailUrl`, `seed`.
- `brand_kit_list` / `brandKitId`: o Magnific One pode gerar "on-brand" com paleta, logo e tipografia de um Brand Kit. Para a AERA isso é uma opção futura; a regra do recorte continua **logo fora do prompt e aplicado depois** (C24).
- Guia do próprio servidor para `magnific-one`: o prompt é "as palavras do usuário", assunto e momento; não adicionar luz, lente, estilo ou adjetivos de qualidade, porque o modelo dirige isso sozinho. O `image_prompt` que NOA produz hoje é um prompt descritivo em inglês; para o Magnific One ele precisa ser **curto**, e para `gpt-2` pode ser descritivo. O adaptador faz esse ajuste por modelo.

**Conta do Tiago (lida em 30/10, sem gerar nada).** Plano Premium+, modo ilimitado existe na conta mas **não vale nesta sessão de MCP**: gerações consomem créditos. Créditos disponíveis no momento: **22 de 45.000** (44.978 gastos). Ou seja, uma rodada de 9 imagens hoje provavelmente **não roda** por falta de crédito, mesmo com tudo conectado. O custo em créditos por imagem não é exposto pelo catálogo; a estimativa do escritório conta imagens, não créditos. Antes da primeira rodada real, o escritório deve mostrar o saldo (`account_balance`) e avisar quando ele não cobre as imagens previstas.

## Decisões de desenho confirmadas pela verificação

- Executor único configurado no escritório (C25): `magnific-one` por padrão, modelo configurável.
- Cada peça pede uma geração: feed 1080×1440 (custom), stories `9:16` em `2k`, LinkedIn `16:9` em `2k`. Quando a referência funcionar, stories e LinkedIn recebem a imagem do feed como `references[{type:image}]`.
- Uma imagem = uma ação paga; entra na estimativa (C20); teto de imagens = estimativa × 1,3.
- Resultado baixado pelo servidor e gravado em `runtime/projects/<cliente>/<projeto>/job-<id>/preview/`, marcado `PREVIEW / material de aprovação` até o cartão ser aprovado; aprovado, vira `final`.
- Falha ou saldo insuficiente: peça fica "pendente: imagem" com o motivo; o job segue (C19). Conectar depois gera só as pendências.
- Nenhuma URL do Magnific é a "imagem pronta": só o arquivo no disco conta.

## O que fica pendente até Tiago conectar

- Login OAuth real e registro dinâmico de cliente (fluxo implementado, não verificado).
- Nomes exatos das ferramentas e formato da resposta de `creations_wait` em produção (o adaptador lê `url`/`previewUrl` e tolera variações, mas só a primeira rodada real confirma).
- Custo em créditos por imagem e o efeito do modo `draft`.
- Créditos: 22 disponíveis em 30/10; a primeira rodada real exige renovação ou créditos extras.
