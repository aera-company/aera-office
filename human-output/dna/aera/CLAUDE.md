# CLAUDE.md · AERA

Este arquivo orienta o Claude Code, a NAYRA e o JOHN a trabalhar com a marca **AERA**.

Antes de criar, editar ou auditar qualquer peça da AERA, leia o arquivo inteiro:

```text
resultado/DNA.md
```

O `DNA.md` é a fonte da verdade. O `resultado/DNA.pdf` é a versão editorial apresentável, gerada a partir de `resultado/DNA-apresentacao.html`. Este `CLAUDE.md` é só a camada operacional.

---

## Resumo da marca

```text
Marca: AERA
O que faz: estúdio estratégico e criativo; transforma uma oportunidade numa primeira versão real (marca, produto, sistema, campanha).
Promessa: da primeira ideia à primeira versão rodando.
Ideia-guia: o espaço antes da coisa.
Estética: prancha técnica na estrutura (grid de fios, numeração, tipografia grande) + still de cinema na imagem (espaço vazio, luz de lâmpada).
Voz: curta, segura, humana; como quem já fez. Português com inglês só de acento.
Workflow: MAYA pauta, NOA escreve, JOHN faz a arte, ARI revisa, Tiago libera imagens e aprova. Publicar é sempre com o Tiago.
```

## Como agir

1. Leia o `DNA.md` inteiro antes de responder.
2. Identifique qual seção controla o pedido: visual (3), imagem (3.8), voz (4), audiência e filtro (5.5), comportamento (5.6) ou aplicação (5.7).
3. Se o pedido contradiz o DNA, sinalize a tensão e proponha um caminho coerente.
4. Se o Tiago aprovar uma mudança de estilo, voz ou workflow, atualize o `DNA.md` e o `DNA-apresentacao.html`, e regenere o PDF.
5. Imagem só com o ok do Tiago a cada lote, pelo Higgsfield.

## Regras rápidas da marca

### Visual

```text
Paleta: só preto #0A0A0A e marfim #F1EFE8. Nenhuma cor em elementos gráficos. A cor vem da luz da foto.
Tipografia: Instrument Sans 650 em sentence case nos títulos; Archivo em caixa alta só em rótulos; Geist Mono em números.
Marca: logotipo pequeno em canto fixo; monograma A; estrela discreta por padrão, grande só em peça tipográfica (1 a cada 4), sempre cortada pela borda.
Grid: margem 64 px em 1080, fios de 1 px a 15%, unidade 8, cantos retos.
Referências: Pentagram, Collins, Teenage Engineering (estrutura); A24, Nothing, Apple em fundo preto (imagem).
Anti-referências: banco de imagem corporativo, cara de IA, 3D brilhante, aparelho flutuando, peça cheia.
Imagem: espaço e arquitetura vazios, sem pessoas, luz quente de lâmpada (2700 a 3200 K), uma fonte, sombra profunda, 35 a 50 mm, uma linha forte que continua o grid, grão fino.
```

### Voz

```text
Soa como: quem já fez. Curta, segura, humana, precisa.
Usa: primeira versão, construir, rodar, existir, método, direção, oportunidade, negócio inteiro.
Evita: soluções inovadoras, transformador, disruptivo, 360, apaixonados por, inglês sem função.
Nunca: travessão, título em caixa alta, frase motivacional, número sem fonte, IA como sujeito da frase.
```

### Workflow

```text
Peça: pauta pelo filtro editorial → texto da NOA → direção visual e contagem de imagens do JOHN → ok do Tiago ao lote → geração e montagem → revisão do ARI contra o DNA → aprovação do Tiago.
Ferramentas: AERA AI Office; Higgsfield (skills human-image, human-social, human-carrossel).
Revisão humana: lote de imagens, aprovação final, citação de cliente, publicação.
```

## Como regenerar o PDF

O gerador genérico da skill não absorve esta marca e exige Python 3.10. O PDF da AERA é impresso a partir do HTML próprio:

```bash
cd resultado && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=15000 --allow-file-access-from-files --print-to-pdf="$PWD/DNA.pdf" "file://$PWD/DNA-apresentacao.html"
```

## Regra de teste

DNA recém-criado: o teste obrigatório é uma peça real do JOHN (post 4:5 "A primeira versão precisa existir", título sobre preto com uma imagem de espaço em luz quente), com ok do Tiago para gerar as imagens. Feedback aprovado vira ajuste no `DNA.md`.

## Regra de refino

Feedback não fica solto na conversa: vira regra no `DNA.md` e uma segunda versão curta prova a melhoria.

## Conclusão do fluxo

- [x] `resultado/DNA.md`
- [x] `resultado/DNA.pdf`
- [x] este `CLAUDE.md` personalizado
- [x] peça de teste gerada (04/11: `teste/post-01.png`, imagem Nano Banana 2.1 no Higgsfield, 1,5 crédito) · aprovado pelo Tiago em 04/11
- [x] feedback aplicado (âncora `referencias/aprovado-espaco-01.png`, regra de alinhamento da aresta com o grid)
