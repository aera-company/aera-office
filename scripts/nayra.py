#!/usr/bin/env python3
"""NAYRA · ponte do Claude Code com o AERA AI OFFICE (C43).

Registra no escritório o que uma sessão do Claude Code faz, para o prédio reagir e a NAYRA ter o que contar.
Fala só com o servidor local do office (127.0.0.1). Não chama IA, não lê chaves, não publica nada.

Uso:
  python3 scripts/nayra.py abrir "Título do trabalho" --agente NOA [--cliente AERA] [--pedido "..."]
  python3 scripts/nayra.py passo <id> "O que foi feito" --agente NOA
  python3 scripts/nayra.py perguntar <id> "Pergunta para o Tiago"
  python3 scripts/nayra.py entregar <id> --arquivo entrega.md     (ou --texto "...")
  python3 scripts/nayra.py travou <id> "Motivo"
  python3 scripts/nayra.py estado        (o que a NAYRA contaria agora)
  python3 scripts/nayra.py cadastrar "AERA" --site https://aera.company   (o servidor lê o site)
  python3 scripts/nayra.py propor --cliente AERA --arquivo fatos.json    (fatos para o Tiago confirmar)
  python3 scripts/nayra.py contexto --cliente AERA                       (só o que o Tiago confirmou)
  python3 scripts/nayra.py lote <id> --imagens 2 --descricao "..." [--prompts p.json] [--modelo nano_banana_2_1] [--creditos 3]
  python3 scripts/nayra.py lote-status <id>                              (proposto, liberado, recusado ou gerado)
  python3 scripts/nayra.py lote-gerado <lote> --imagens 2 [--arquivos a.png b.png]
  python3 scripts/nayra.py trabalhos     (trabalhos de sessão recentes)

O <id> pode ser o prefixo de 8 caracteres mostrado ao abrir.
Porta: --porta 8080 ou variável AERA_OFFICE_PORT.
"""
import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

AGENTS = ('ARI', 'MAYA', 'NOA', 'JOHN', 'LEO', 'NINA')
LABELS = {'em_sessao': 'em sessão', 'needs_input': 'aguarda resposta', 'awaiting_approval': 'aguarda aprovação',
          'approved': 'aprovado', 'failed': 'travou', 'canceled': 'cancelado'}


def call(port, path, body=None):
    url = f'http://127.0.0.1:{port}/api/{path}'
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    headers = {'Content-Type': 'application/json', 'X-Aera-Client': '1'} if body is not None else {}
    request = urllib.request.Request(url, data=data, headers=headers, method='POST' if body is not None else 'GET')
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        try:
            message = json.loads(e.read()).get('error', str(e))
        except ValueError:
            message = str(e)
        sys.exit(f'Escritório recusou: {message}')
    except (urllib.error.URLError, OSError):
        sys.exit(f'O escritório não respondeu em 127.0.0.1:{port}. Inicie com "npm start" na pasta do office '
                 '(ou INICIAR_DEMO.command) e tente de novo.')


def show_job(job, verb):
    print(f'{verb}: {job["title"]}')
    print(f'  id {job["id"][:8]} · {LABELS.get(job["status"], job["status"])}' + (f' · {job["client_name"]}' if job.get('client_name') else ''))


def main():
    parser = argparse.ArgumentParser(prog='nayra', description='Ponte do Claude Code com o AERA AI OFFICE.')
    parser.add_argument('--porta', type=int, default=int(os.environ.get('AERA_OFFICE_PORT', '8080')))
    sub = parser.add_subparsers(dest='cmd', required=True)
    agent = dict(choices=AGENTS, type=str.upper)

    p = sub.add_parser('abrir', help='abre um trabalho de sessão');p.add_argument('titulo')
    p.add_argument('--agente', default='ARI', **agent);p.add_argument('--cliente', default='');p.add_argument('--pedido', default='')
    p = sub.add_parser('passo', help='registra uma etapa concluída');p.add_argument('id');p.add_argument('mensagem')
    p.add_argument('--agente', default='ARI', **agent)
    p = sub.add_parser('perguntar', help='deixa uma pergunta para o Tiago');p.add_argument('id');p.add_argument('pergunta')
    p.add_argument('--agente', default='ARI', **agent)
    p = sub.add_parser('entregar', help='entrega texto para aprovação no office');p.add_argument('id')
    g = p.add_mutually_exclusive_group(required=True);g.add_argument('--texto');g.add_argument('--arquivo')
    p.add_argument('--agente', default='ARI', **agent)
    p = sub.add_parser('travou', help='registra que o trabalho travou');p.add_argument('id');p.add_argument('motivo')
    p.add_argument('--agente', default='ARI', **agent)
    sub.add_parser('estado', help='o que a NAYRA contaria agora')
    p = sub.add_parser('cadastrar', help='cadastra um cliente; com --site o servidor lê a página');p.add_argument('nome');p.add_argument('--site', default='')
    p = sub.add_parser('propor', help='propõe fatos de um cliente para o Tiago confirmar');p.add_argument('--cliente', required=True)
    p.add_argument('--arquivo', required=True, help='JSON: {"resumo": "...", "fatos": [{"tipo": "fato|preferencia|decisao", "texto": "...", "fonte": "..."}]}')
    p = sub.add_parser('contexto', help='contexto confirmado de um cliente');p.add_argument('--cliente', required=True)
    p = sub.add_parser('lote', help='JOHN propõe um lote de imagens; só gera depois do ok do Tiago');p.add_argument('id')
    p.add_argument('--imagens', type=int, required=True);p.add_argument('--descricao', required=True)
    p.add_argument('--prompts', default='', help='JSON com uma lista de prompts');p.add_argument('--modelo', default='');p.add_argument('--creditos', type=float, default=0)
    p.add_argument('--agente', default='JOHN', **agent)
    p = sub.add_parser('lote-status', help='estado dos lotes de um trabalho');p.add_argument('id')
    p = sub.add_parser('lote-gerado', help='registra que um lote liberado foi gerado');p.add_argument('lote')
    p.add_argument('--imagens', type=int, required=True);p.add_argument('--arquivos', nargs='*', default=[])
    p.add_argument('--agente', default='JOHN', **agent)
    sub.add_parser('trabalhos', help='trabalhos de sessão recentes')
    args = parser.parse_args()
    port = args.porta

    if args.cmd == 'abrir':
        show_job(call(port, 'bridge/open', {'title': args.titulo, 'agent': args.agente, 'client': args.cliente, 'brief': args.pedido}), 'Aberto')
    elif args.cmd == 'passo':
        show_job(call(port, 'bridge/step', {'job': args.id, 'message': args.mensagem, 'agent': args.agente}), f'Etapa de {args.agente} registrada')
    elif args.cmd == 'perguntar':
        show_job(call(port, 'bridge/ask', {'job': args.id, 'question': args.pergunta, 'agent': args.agente}), 'Pergunta deixada para o Tiago')
    elif args.cmd == 'entregar':
        if args.arquivo:
            path = pathlib.Path(args.arquivo).expanduser()
            if not path.is_file():
                sys.exit(f'Arquivo não encontrado: {path}')
            text = path.read_text(encoding='utf-8')
        else:
            text = args.texto
        job = call(port, 'bridge/deliver', {'job': args.id, 'text': text, 'agent': args.agente})
        show_job(job, f'Entrega enviada para aprovação (versão {job["revision"]})')
    elif args.cmd == 'travou':
        show_job(call(port, 'bridge/fail', {'job': args.id, 'reason': args.motivo, 'agent': args.agente}), 'Registrado como travado')
    elif args.cmd == 'cadastrar':
        existing = [c for c in call(port, 'clients')['clients'] if c['name'].lower() == args.nome.strip().lower()]
        if existing:
            sys.exit(f'Já existe um cliente "{existing[0]["name"]}" no escritório.')
        client = call(port, 'clients', {'name': args.nome, 'site_url': args.site})
        print(f'Cliente cadastrado: {client["name"]}')
        for m in client.get('materials', []):
            print(f'  material · {m["name"]} · {m["state"]}' + (f' ({m["reason"]})' if m.get('reason') else ''))
    elif args.cmd == 'propor':
        path = pathlib.Path(args.arquivo).expanduser()
        if not path.is_file():
            sys.exit(f'Arquivo não encontrado: {path}')
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except ValueError:
            sys.exit('O arquivo não é um JSON válido.')
        result = call(port, 'bridge/propose', {'client': args.cliente, 'notes': data.get('fatos', []), 'summary': data.get('resumo', '')})
        print(f'{len(result["notes"])} fatos propostos. Tiago confirma em Operação > cliente > Abrir cadastro.')
    elif args.cmd == 'contexto':
        client = next((c for c in call(port, 'clients')['clients'] if c['name'].lower() == args.cliente.strip().lower() or c['id'] == args.cliente), None)
        if not client:
            sys.exit(f'Cliente não encontrado: {args.cliente}.')
        print(json.dumps(call(port, f'clients/{client["id"]}/context'), ensure_ascii=False, indent=2))
    elif args.cmd == 'lote':
        prompts = []
        if args.prompts:
            path = pathlib.Path(args.prompts).expanduser()
            if not path.is_file():
                sys.exit(f'Arquivo não encontrado: {path}')
            try:
                prompts = json.loads(path.read_text(encoding='utf-8'))
            except ValueError:
                sys.exit('O arquivo de prompts não é um JSON válido.')
        b = call(port, 'bridge/batch', {'job': args.id, 'count': args.imagens, 'description': args.descricao, 'prompts': prompts,
                                        'model': args.modelo, 'credits': args.creditos, 'agent': args.agente})
        print(f'Lote proposto: {b["count"]} {"imagem" if b["count"]==1 else "imagens"} · lote {b["id"][:8]} · aguarda o ok do Tiago no office. Não gere antes.')
    elif args.cmd == 'lote-status':
        rows = call(port, f'nayra/batches?job={args.id}')['batches']
        if not rows:
            print('Nenhum lote neste trabalho.')
        for b in rows:
            print(f'  lote {b["id"]} · {b["state"]} · {b["count"]} imagens · {b["description"]}')
    elif args.cmd == 'lote-gerado':
        b = call(port, 'bridge/batch-done', {'batch': args.lote, 'generated': args.imagens, 'files': args.arquivos, 'agent': args.agente})
        print(f'Lote {b["id"][:8]} registrado como gerado ({args.imagens} imagens).')
    elif args.cmd == 'estado':
        b = call(port, 'nayra/briefing')
        print(b['opening'])
        for item in b['items']:
            print(f'  · [{item["agent"]}] {item["text"]}' + (f'  (id {item["job_id"][:8]})' if item['job_id'] else ''))
        if b['closing']:
            print(b['closing'])
    else:
        rows = call(port, 'nayra/sessions')['sessions']
        if not rows:
            print('Nenhum trabalho de sessão registrado.')
        for r in rows:
            who = r['phase'].split(':', 1)[1] if r['phase'].startswith('agent:') else ''
            print(f'  {r["id"][:8]} · {LABELS.get(r["status"], r["status"])}{" · " + who if who else ""} · {r["title"]}')


if __name__ == '__main__':
    main()
