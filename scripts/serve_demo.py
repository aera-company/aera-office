#!/usr/bin/env python3
"""Local AERA office: static 3D frontend + persistent AI operation, loopback only."""
import argparse
import functools
import http.server
import json
import pathlib
import re
import threading
import urllib.parse
import webbrowser
from office.provider import ClaudeProvider, OperationError
from office.store import Store
from office.engine import Engine
from office.fetch import read_link
from office import capabilities, jobs, artifacts, nayra
from office.image_provider import MagnificProvider, NoImageProvider

ROOT=pathlib.Path(__file__).resolve().parents[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        super().end_headers()

    def local(self, mutation=False):
        port=self.server.server_address[1]
        host=self.headers.get('Host','')
        if host not in (f'127.0.0.1:{port}',f'localhost:{port}'):
            raise OperationError('Acesso somente pelo escritório local.', 'forbidden', 403)
        if self.headers.get('Origin') not in (None,'http://'+host) or self.headers.get('Sec-Fetch-Site')=='cross-site':
            raise OperationError('Origem não autorizada.', 'forbidden', 403)
        if mutation and (self.headers.get('X-Aera-Client')!='1' or self.headers.get_content_type()!='application/json'):
            raise OperationError('Pedido não autorizado.', 'forbidden', 403)

    def scope(self):
        # Presentation mode (C51, C59): every read is limited to the presented client. None = whole office.
        return getattr(self.server,'presentation_client',None)

    def in_scope(self, job_id):
        scope=self.scope()
        if scope and self.server.store.get(job_id)['client_id']!=scope:
            raise OperationError('Trabalho não encontrado.', 'not_found', 404)

    def respond(self, status, data):
        raw=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers()
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):pass

    def attach_link(self, store, client_id, url, *, name='', project_id='', return_material=False):
        # The server reads the page itself; a page that cannot be read is recorded as such, with the reason.
        page=read_link(url,allow_local=getattr(self.server,'allow_local_links',False))
        material=store.add_material(client_id,kind='link',name=name or page['title'] or page['url'][:200],origin=page['url'],
            extracted=page['text'],state=page['state'],reason=page['reason'],project_id=project_id)
        return material if return_material else store.get_client(client_id)

    def body(self):
        try:
            length=int(self.headers.get('Content-Length','0'))
        except ValueError:
            raise OperationError('Pedido inválido.') from None
        if not 2<=length<=120000:
            raise OperationError('Pedido vazio ou muito extenso.', 'invalid_request', 413)
        try:
            data=json.loads(self.rfile.read(length))
        except (ValueError,UnicodeError):
            raise OperationError('JSON inválido.') from None
        if not isinstance(data,dict):raise OperationError('Pedido inválido.')
        return data

    def do_GET(self):
        try:
            self.local()
            path=urllib.parse.urlsplit(self.path).path
            store,provider=self.server.store,self.server.provider
            if path=='/api/status':
                return self.respond(200,{**provider.status(),'operation':True,'storage':'sqlite','jobs':len(store.list()),'persistent':True,'image':self.server.engine.image_provider.status()})
            if path=='/api/image/callback':
                # OAuth return from the browser. The code is exchanged server-side; nothing is shown but a confirmation.
                query=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                try:
                    self.server.engine.image_provider.finish_login((query.get('code') or [''])[0],(query.get('state') or [''])[0])
                    html='<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#10191d;color:#eee9df;padding:40px"><h2>Magnific conectado ao escritório.</h2><p>Pode fechar esta aba e voltar ao AERA AI OFFICE.</p>'
                except OperationError as e:
                    html=f'<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#10191d;color:#eee9df;padding:40px"><h2>A conexão não foi concluída.</h2><p>{e.message}</p>'
                raw=html.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw);return
            match=re.fullmatch(r'/api/artifacts/([a-f0-9]{32})/file',path)
            if match:
                artifact=store.get_artifact(match[1]);file=pathlib.Path(artifact['path'])
                runtime_root=pathlib.Path(self.server.runtime_dir).resolve()
                if not file.is_file() or runtime_root not in file.resolve().parents:
                    raise OperationError('O arquivo desta peça não existe no disco.', 'not_found', 404)
                raw=file.read_bytes();ctype={'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','md':'text/markdown; charset=utf-8','json':'application/json'}.get(file.suffix.lstrip('.').lower(),'application/octet-stream')
                self.send_response(200);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw);return
            if path=='/api/jobs':return self.respond(200,{'jobs':store.list(self.scope())})
            if path=='/api/clients':return self.respond(200,{'clients':[c for c in store.list_clients() if not self.scope() or c['id']==self.scope()]})
            if path=='/api/presentation':
                scope=self.scope()
                return self.respond(200,{'on':bool(scope),'client_id':scope or '','client':store.get_client(scope)['name'] if scope else ''})
            if path=='/api/nayra/agent':
                file=pathlib.Path(self.server.runtime_dir)/'nayra-agent.json'
                if not file.is_file():raise OperationError('O agente de voz da NAYRA ainda não foi criado.', 'not_found', 404)
                return self.respond(200,{'agent_id':json.loads(file.read_text())['agent_id']})
            if path=='/api/nayra/demo-context':
                # Context for the voice agent: always one client only, never the whole office.
                client_id=self.scope() or nayra.resolve_client(store,'AERA')
                return self.respond(200,nayra.demo_context(store,client_id))
            if path=='/api/capabilities':
                ready=provider.status()['ready']
                return self.respond(200,capabilities.with_state(self.server.engine.registry,provider_ready=ready,image_ready=self.server.engine.image_ready(),running=store.running_by_character(self.scope())))
            if path=='/api/team':
                # Activity cards: the same character state the building reads, plus counts and the last events per character.
                image_ready=self.server.engine.image_ready()
                characters=capabilities.with_state(self.server.engine.registry,provider_ready=provider.status()['ready'],image_ready=image_ready,running=store.running_by_character(self.scope()))['characters']
                activity=store.team_activity(image_ready=image_ready,client_id=self.scope())
                return self.respond(200,{'characters':[{**characters.get(name,{'name':name,'role':''}),**activity[name]} for name in store.TEAM]})
            if path=='/api/activity':
                query=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                return self.respond(200,{'events':store.recent_events(80,(query.get('since') or [''])[0][:40],client_id=self.scope())})
            if path=='/api/summary':
                query=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                result=store.summary((query.get('since') or [''])[0][:40],client_id=self.scope())
                # Image batches waiting for Tiago's ok (C71) also wait on him, whatever the "since".
                result['batches_awaiting']=len(nayra.batches(store,client_id=self.scope(),state='proposto'))
                return self.respond(200,result)
            if path=='/api/nayra/briefing':
                # NAYRA's spoken briefing (C38): built from rows only, office domain only (C44).
                query=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                return self.respond(200,nayra.briefing(store,(query.get('since') or [''])[0][:40],image_ready=self.server.engine.image_ready(),client_id=self.scope()))
            if path=='/api/nayra/batches':
                query=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                job=(query.get('job') or [''])[0]
                if job:job=nayra.resolve_session(store,job);self.in_scope(job)
                return self.respond(200,{'batches':nayra.batches(store,job_id=job or None,client_id=self.scope())})
            if path=='/api/nayra/sessions':
                return self.respond(200,{'sessions':nayra.sessions(store,self.scope())})
            if path=='/api/jobs/catalog':
                return self.respond(200,{'jobs':jobs.describe(provider_ready=provider.status()["ready"],image_ready=self.server.engine.image_ready())})
            if path=='/api/jobs/estimate':
                query=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                job_type=(query.get('type') or ['pedido'])[0]
                if not jobs.is_known(job_type):raise OperationError('Job desconhecido.', 'not_found', 404)
                return self.respond(200,jobs.estimate(job_type))
            match=re.fullmatch(r'/api/clients/([a-f0-9]{32})(/context)?',path)
            if match:
                if self.scope() and match[1]!=self.scope():raise OperationError('Cliente não encontrado.', 'not_found', 404)
                if match[2]:
                    query=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                    return self.respond(200,store.client_context(match[1],(query.get('project') or [''])[0]))
                return self.respond(200,store.get_client(match[1]))
            match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})(/export)?',path)
            if match:
                self.in_scope(match[1])
                job=store.get(match[1])
                if not match[2]:return self.respond(200,{**job,'batches':nayra.batches(store,job_id=match[1])})
                if job['cards']:
                    # Card jobs export every card with its state; text pieces only, images are listed as pending.
                    parts=[f"# {job['title']}\n\nAERA AI OFFICE · conteúdo da semana · {len(job['cards'])} cartões\n\n## Pedido\n{job['brief']}\n"]
                    for c in job['cards']:
                        parts.append(f"\n## Post {c['ordinal']} · {c['title']} · {c['state']} · v{c['version']}\n")
                        for p in c['pieces']:parts.append(f"\n### {artifacts.CHANNEL_LABELS.get(p['channel'],p['channel'])}\n**{p['headline']}**\n\n{p['text']}\n\n_Legenda / roteiro:_ {p['caption']}\n\n_Direção visual:_ {p['visual_direction']}\n\n_Imagem:_ {'pendente' if p['image_state']!='gerada' else p['artifact_id']}\n")
                        if c['review']:parts.append(f"\n_Revisão de ARI:_ {c['review']}\n")
                    text=''.join(parts)+'\n---\nGerado neste escritório. Nenhuma publicação executada.\n'
                    raw=text.encode();self.send_response(200);self.send_header('Content-Type','text/markdown; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Content-Disposition',f'attachment; filename="AERA-{job["id"][:8]}-semana.md"');self.end_headers();self.wfile.write(raw);return
                if not job['deliveries']:raise OperationError('Ainda não há entrega para exportar.', 'not_ready', 409)
                d=job['deliveries'][-1]
                text=f"# {job['title']}\n\nAERA AI OFFICE — IA / {d['model']}\nVersão {d['revision']} · {'Aprovada' if d['status']=='approved' else 'Aguardando aprovação'}\n\n## Pedido\n{job['brief']}\n\n## Entrega\n{d['text']}\n\n---\nGerado a partir deste pedido. Nenhuma publicação ou alteração em sistemas externos foi executada.\n"
                raw=text.encode();self.send_response(200);self.send_header('Content-Type','text/markdown; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Content-Disposition',f'attachment; filename="AERA-{job["id"][:8]}-v{d["revision"]}.md"');self.end_headers();self.wfile.write(raw);return
            if path.startswith('/api/'):
                raise OperationError('Recurso não encontrado.', 'not_found', 404)
            return super().do_GET()
        except OperationError as e:
            self.respond(e.status,{'error':e.message,'code':e.code})
        except (BrokenPipeError,ConnectionResetError):pass

    def do_POST(self):
        try:
            self.local(True)
            path=urllib.parse.urlsplit(self.path).path;data=self.body()
            provider,store=self.server.provider,self.server.store
            if path in ('/api/image/connect','/api/image/disconnect'):
                image=self.server.engine.image_provider
                if path=='/api/image/disconnect':return self.respond(200,image.disconnect())
                if not hasattr(image,'begin_login'):raise OperationError('Este executor de imagem não usa login.', 'invalid_request', 400)
                host=self.headers.get('Host','127.0.0.1:8080')
                url=image.begin_login(f'http://{host}/api/image/callback')
                return self.respond(200,{'login_url':url,'note':'Abra este endereço no navegador para autorizar. O token volta ao servidor local, nunca ao painel.'})
            if path=='/api/nayra/client-log':
                # Voice diagnostics from the browser (connection state and errors only), written to the server log.
                event=str(data.get('event',''))[:60];detail=str(data.get('detail',''))[:600];agent=str(data.get('agent',''))[:160]
                print(f'[NAYRA voz] {event}: {detail} · {agent}',flush=True)
                return self.respond(200,{'ok':True})
            if path=='/api/presentation':
                # Presentation is always for AERA in this version (C51); turning it off restores the whole office.
                self.server.presentation_client=nayra.resolve_client(store,'AERA') if data.get('on') else None
                scope=self.server.presentation_client
                return self.respond(200,{'on':bool(scope),'client_id':scope or '','client':'AERA' if scope else ''})
            for pattern in (r'/api/jobs/([a-f0-9]{32})/.*',):
                m=re.fullmatch(pattern,path)
                if m:self.in_scope(m[1])
            m=re.fullmatch(r'/api/clients/([a-f0-9]{32})(/.*)?',path)
            if m and self.scope() and m[1]!=self.scope():raise OperationError('Cliente não encontrado.', 'not_found', 404)
            if path=='/api/bridge/batch':
                count=data.get('count')
                return self.respond(201,nayra.propose_batch(store,data.get('job',''),count if isinstance(count,int) else -1,data.get('description'),data.get('prompts') or [],data.get('model','') or '',data.get('credits',0) or 0,data.get('agent','') or 'JOHN'))
            if path=='/api/bridge/batch-done':
                gen=data.get('generated')
                return self.respond(200,nayra.batch_done(store,str(data.get('batch',''))[:40],gen if isinstance(gen,int) else -1,data.get('files') or [],data.get('agent','') or 'JOHN'))
            match=re.fullmatch(r'/api/bridge/(open|step|ask|deliver|fail|propose)',path)
            if match:
                # Bridge from Claude Code sessions (C43). Called by scripts/nayra.py on this machine only.
                action=match[1];agent=data.get('agent','') or ('ARI' if action!='open' else '')
                if action=='propose':
                    return self.respond(201,nayra.propose_notes(store,data.get('client','') or '',data.get('notes'),data.get('summary','') or ''))
                if action=='open':
                    return self.respond(201,nayra.open_session(store,data.get('title'),agent or 'ARI',data.get('client','') or '',data.get('brief','') or ''))
                ref=data.get('job','')
                if action=='step':result=nayra.step(store,ref,data.get('message'),agent)
                elif action=='ask':result=nayra.ask(store,ref,data.get('question'),agent)
                elif action=='deliver':result=nayra.deliver(store,ref,data.get('text'),agent)
                else:result=nayra.fail(store,ref,data.get('reason'),agent)
                return self.respond(200,result)
            match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/images',path)
            if match:
                result=self.server.engine.generate_images(match[1])
                return self.respond(200,{**result,'job':store.get(match[1])})
            if path in ('/api/connect','/api/disconnect'):
                active=any(j['status'] in ('planning','running','reviewing','canceling') for j in store.list())
                if active:raise OperationError('Aguarde a etapa em execução antes de mudar a conexão.', 'busy', 409)
                result=provider.connect(data.get('source','aera'),data.get('key','')) if path=='/api/connect' else provider.disconnect()
                self.server.engine.wake.set();return self.respond(200,result)
            if path=='/api/jobs':
                if not provider.status()['ready']:raise OperationError('Conecte o Claude para enviar um trabalho real.', 'not_connected', 503)
                job_type=data.get('job_type','pedido') or 'pedido'
                catalog=jobs.get(job_type)
                if not catalog:raise OperationError('Job desconhecido. Use um job do catálogo ou um pedido livre.', 'invalid_request', 400)
                if not catalog['executable']:raise OperationError(f'O job "{catalog["name"]}" está declarado, mas não tem executor neste recorte.', 'job_not_executable', 409)
                job=store.create(data.get('brief'),data.get('context',''),data.get('idempotency_key'),data.get('execute_at'),data.get('client_id','') or '',data.get('project_id','') or '',job_type)
                self.server.engine.wake.set();return self.respond(201,job)
            if path=='/api/clients':
                client=store.create_client(data.get('name'),data.get('site_url','') or '')
                if client['site_url']:
                    client=self.attach_link(store,client['id'],client['site_url'],name='Site do cliente')
                return self.respond(201,client)
            match=re.fullmatch(r'/api/clients/([a-f0-9]{32})/(propose|projects|materials|notes)',path)
            if match:
                client_id,action=match.groups()
                if action=='propose':
                    if not provider.status()['ready']:raise OperationError('Conecte o Claude para ARI propor o cadastro.', 'not_connected', 503)
                    result=self.server.engine.propose_client(client_id,data.get('hint','') or '')
                    return self.respond(200,{**result,'client':store.get_client(client_id)})
                if action=='projects':
                    return self.respond(201,store.create_project(client_id,data.get('name'),data.get('description','') or ''))
                if action=='materials':
                    kind=data.get('kind');project_id=data.get('project_id','') or ''
                    if kind=='link':
                        return self.respond(201,self.attach_link(store,client_id,data.get('url',''),name=data.get('name','') or '',project_id=project_id,return_material=True))
                    if kind=='texto':
                        content=data.get('content','')
                        if not isinstance(content,str) or not content.strip():raise OperationError('Cole o texto do material.')
                        return self.respond(201,store.add_material(client_id,kind='texto',name=data.get('name','') or 'Texto informado',origin='Tiago, colado no painel',content=content.strip(),state='lido',project_id=project_id))
                    raise OperationError('Neste recorte entram texto colado e links. PDF e imagens vêm depois.', 'unsupported_material', 400)
                if action=='notes':
                    level=data.get('level',1);kind=data.get('kind','fato')
                    return self.respond(201,store.add_note(client_id,level=level if level in (1,2) else 1,kind=kind,text=data.get('text',''),source=data.get('source','') or 'Tiago, no painel',state='confirmado',project_id=data.get('project_id','') or ''))
            match=re.fullmatch(r'/api/clients/([a-f0-9]{32})/notes/([a-f0-9]{32})/(confirm|reject|supersede)',path)
            if match:
                client_id,note_id,action=match.groups()
                if action=='supersede':
                    return self.respond(200,store.supersede_note(client_id,note_id,data.get('text',''),data.get('source','') or 'Tiago, correção no painel'))
                return self.respond(200,store.set_note_state(client_id,note_id,'confirmado' if action=='confirm' else 'descartado'))
            match=re.fullmatch(r'/api/clients/([a-f0-9]{32})',path)
            if match:
                allowed={k:v for k,v in data.items() if k in ('name','site_url','summary','status') and isinstance(v,str)}
                if not allowed:raise OperationError('Nada para atualizar.')
                return self.respond(200,store.update_client(match[1],**allowed))
            match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/batches/([a-f0-9]{32})/(release|decline)',path)
            if match:
                # Tiago's ok per image batch (C71). Releasing never generates anything here: the Claude Code session does.
                return self.respond(200,nayra.decide_batch(store,match[1],match[2],match[3]=='release'))
            match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/cards/([a-f0-9]{32})/(approve|revise|discard)',path)
            if match:
                job_id,card_id,action=match.groups()
                if action=='approve':
                    result=store.card_approve(job_id,card_id,writer=self.server.card_writer)
                elif action=='discard':
                    result=store.card_discard(job_id,card_id,data.get('reason','') or '')
                else:
                    if not provider.status()['ready']:raise OperationError('Conecte o Claude antes de pedir um ajuste.', 'not_connected', 503)
                    result=store.card_revise(job_id,card_id,data.get('text'))
                self.server.engine.wake.set();return self.respond(200,result)
            match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/(answer|approve|revise|cancel|resume|confirm-estimate)',path)
            if match:
                job_id,action=match.groups()
                if action in ('answer','revise','resume','confirm-estimate') and store.get(job_id)['job_type']==nayra.SESSION_TYPE:
                    # Session jobs are worked in Claude Code; the office engine never runs them.
                    raise OperationError('Este trabalho é de uma sessão do Claude Code. Responda ou peça o ajuste à NAYRA no Claude Code.', 'session_job', 409)
                if action in ('answer','revise','resume','confirm-estimate') and not provider.status()['ready']:
                    raise OperationError('Conecte o Claude antes de continuar.', 'not_connected', 503)
                if action=='confirm-estimate':
                    result=store.confirm_estimate(job_id);self.server.engine.wake.set();return self.respond(200,result)
                if action=='answer':result=store.answer(job_id,data.get('text'))
                elif action=='approve':result=store.approve(job_id)
                elif action=='revise':result=store.revise(job_id,data.get('text'))
                elif action=='cancel':result=store.cancel(job_id)
                else:result=store.resume(job_id)
                self.server.engine.wake.set();return self.respond(200,result)
            raise OperationError('Recurso não encontrado.', 'not_found', 404)
        except OperationError as e:
            self.respond(e.status,{'error':e.message,'code':e.code})
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception:
            self.respond(500,{'error':'Não foi possível concluir o pedido. Nenhuma credencial foi exposta.','code':'internal_error'})


class Server(http.server.ThreadingHTTPServer):
    daemon_threads=True
    def server_close(self):
        if getattr(self,'engine',None):self.engine.stop()
        super().server_close()


def create_server(port=8080, runtime=None, provider=None, start_worker=True, image_provider=None):
    if not (ROOT/'dist/index.html').is_file():raise RuntimeError('Build ausente. Execute npm ci && npm run build.')
    runtime=pathlib.Path(runtime or ROOT/'runtime')
    runtime.mkdir(parents=True,exist_ok=True,mode=0o700)
    server=Server(('127.0.0.1',port),functools.partial(Handler,directory=str(ROOT/'dist')))
    server.runtime_dir=str(runtime)
    server.store=Store(runtime/'office.sqlite3')
    server.provider=provider or ClaudeProvider(ROOT,runtime)
    registry=capabilities.load()
    problems=capabilities.validate(registry)
    if problems:
        # Missing method files are reported, not hidden: the index must tell the truth.
        print('Registro de capacidades com pendências:',*problems,sep='\n - ',flush=True)
    if image_provider is None:
        try:image_provider=MagnificProvider(ROOT,runtime)
        except Exception:image_provider=NoImageProvider()
    server.presentation_client=None
    server.engine=Engine(server.store,server.provider,registry,image_provider,runtime)
    def names(job):
        if not job.get('client_id'):return '',''
        client=server.store.get_client(job['client_id'])
        return client['name'],next((p['name'] for p in client['projects'] if p['id']==job.get('project_id')),'')
    server.engine.names=names
    def card_writer(job,card):
        client,project=names(job)
        return artifacts.write_card_files(runtime,job,card,client,project)
    server.card_writer=card_writer
    if start_worker:server.engine.start()
    return server


def main():
    parser=argparse.ArgumentParser(description='AERA AI OFFICE — operação local')
    parser.add_argument('--port',type=int,default=8080);parser.add_argument('--no-open',action='store_true')
    args=parser.parse_args()
    try:server=create_server(args.port)
    except (OSError,RuntimeError) as e:raise SystemExit(f'Não foi possível iniciar: {e}. Use --port 8081 se necessário.') from None
    url=f'http://127.0.0.1:{args.port}/'
    print(f'\nAERA AI OFFICE / Operação local\n{url}\nPedidos e entregas: runtime/office.sqlite3\nAbra Operação para conectar a IA.\nCtrl+C para encerrar.\n',flush=True)
    if not args.no_open:threading.Timer(.6,lambda:webbrowser.open(url)).start()
    try:server.serve_forever()
    except KeyboardInterrupt:print('\nOperação encerrada. Os trabalhos concluídos foram preservados.')
    finally:server.server_close()


if __name__=='__main__':main()
