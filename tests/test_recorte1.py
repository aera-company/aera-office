"""Recorte 1, gate 1: clients, projects, materials, memory, link reader and client isolation. Fixture transport only."""
import http.server
import json
import pathlib
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
sys.path.insert(0,str(ROOT/'tests'))
from office.store import Store
from office.engine import Engine
from office.fetch import read_link,extract_text
from office.provider import OperationError
from test_operation import FixtureProvider,plan
import serve_demo


class ClientFixture(FixtureProvider):
    """Answers the client extractor with facts taken only from the material it received."""
    def generate(self,system,prompt,*,schema=None,max_tokens=0):
        if schema and 'fatos' in schema.get('properties',{}):
            self.calls.append({'system':system,'prompt':prompt,'schema':schema})
            data=json.loads(prompt)
            source=(data['materiais'][0]['texto'] if data['materiais'] else data['informado_pelo_usuario'])
            lines=[l.strip() for l in source.splitlines() if len(l.strip())>=20][:5] or [source[:60]]
            facts=[{'tipo':'fato','texto':('Fonte lida: '+l)[:220]} for l in lines]+[{'tipo':'preferencia','texto':'Tom direto, sem hype.'}]
            text=json.dumps({'resumo':f'Resumo de teste para {data["cliente"]}.','fatos':facts},ensure_ascii=False)
            return {'text':text,'model':'fixture-no-real-ai','usage':{'input_tokens':11,'output_tokens':9},'request_id':'fixture-client'}
        return super().generate(system,prompt,schema=schema,max_tokens=max_tokens)


class PageServer:
    """Local pages for the link reader. Never reached by the normal launcher."""
    pages={'/aera':('text/html; charset=utf-8',b'<html><head><title>AERA</title><script>var x="SEGREDO_JS";</script></head><body><h1>We make things move.</h1><p>Strategy, creative, technology and AI.</p><nav>Work</nav></body></html>'),
           '/login':('text/html',b'',401),'/pdf':('application/pdf',b'%PDF-1.4'),'/empty':('text/html',b'<html><body><script>app()</script></body></html>')}
    def __enter__(self):
        pages=self.pages
        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self,*a):pass
            def do_GET(self):
                entry=pages.get(self.path)
                if not entry:self.send_response(404);self.end_headers();return
                ctype,body=entry[0],entry[1];status=entry[2] if len(entry)>2 else 200
                self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        self.server=http.server.HTTPServer(('127.0.0.1',0),H);threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.base='http://127.0.0.1:%d'%self.server.server_port;return self
    def __exit__(self,*a):self.server.shutdown();self.server.server_close()


class LinkReaderTests(unittest.TestCase):
    def test_reads_public_page_text_without_scripts(self):
        with PageServer() as pages:
            page=read_link(pages.base+'/aera',allow_local=True)
        self.assertEqual(page['state'],'lido');self.assertEqual(page['title'],'AERA')
        self.assertIn('We make things move.',page['text']);self.assertNotIn('SEGREDO_JS',page['text'])
    def test_unreadable_pages_are_recorded_with_reason_never_guessed(self):
        with PageServer() as pages:
            for path,fragment in (('/login','login'),('/pdf','não textual'),('/empty','JavaScript'),('/missing','não existe')):
                page=read_link(pages.base+path,allow_local=True)
                self.assertEqual(page['state'],'nao_lido',path);self.assertIn(fragment,page['reason']);self.assertEqual(page['text'],'')
    def test_only_https_is_read_outside_tests(self):
        for url in ('http://example.com','ftp://x','file:///etc/hosts','https://user:pw@example.com','',None):
            self.assertEqual(read_link(url)['state'],'nao_lido')
        self.assertEqual(read_link('http://127.0.0.1:1/x')['state'],'nao_lido')
    def test_extract_text_keeps_block_structure(self):
        title,text=extract_text('<title>T</title><style>p{}</style><p>Um</p><p>Dois</p>')
        self.assertEqual((title,text),('T','Um\n\nDois'))


class ClientIsolationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(pathlib.Path(self.temp.name)/'office.sqlite3');self.provider=ClientFixture();self.engine=Engine(self.store,self.provider)
    def tearDown(self):
        self.engine.stop();self.store.close();self.temp.cleanup()
    def client(self,name,fact,material):
        c=self.store.create_client(name,'https://'+name.lower()+'.example')
        self.store.add_note(c['id'],level=1,kind='fato',text=fact,source='Tiago, teste')
        self.store.add_note(c['id'],level=2,kind='nota',text='Nota de passagem de '+name,source='Tiago, teste')
        self.store.add_material(c['id'],kind='texto',name='Brief',origin='teste',content=material,state='lido')
        return c
    def test_each_job_only_sees_its_own_client(self):
        aera=self.client('AERA','AERA faz estratégia, criação e tecnologia.','MATERIAL_AERA sobre conteúdo da semana.')
        other=self.client('OneTap','One Tap vende cartões NFC.','MATERIAL_ONETAP sobre perfis digitais.')
        for c,text in ((aera,'Conteúdo da semana'),(other,'Campanha NFC')):
            job=self.store.create(text,'','iso-'+c['id'],client_id=c['id']);self.store.claim();self.engine.process(job['id'])
            self.assertEqual(self.store.get(job['id'])['status'],'awaiting_approval')
        prompts=[c['prompt'] for c in self.provider.calls]
        aera_prompts=[p for p in prompts if 'MATERIAL_AERA' in p];other_prompts=[p for p in prompts if 'MATERIAL_ONETAP' in p]
        self.assertEqual(len(aera_prompts),4);self.assertEqual(len(other_prompts),4)
        for p in aera_prompts:
            self.assertIn('AERA faz estratégia',p);self.assertNotIn('One Tap',p);self.assertNotIn('MATERIAL_ONETAP',p);self.assertNotIn('Nota de passagem',p)
        for p in other_prompts:
            self.assertNotIn('AERA faz',p);self.assertNotIn('MATERIAL_AERA',p)
    def test_job_without_client_keeps_old_contract(self):
        job=self.store.create('Pedido solto','','noclient-key');self.store.claim();self.engine.process(job['id'])
        self.assertNotIn('"cliente"',self.provider.calls[0]['prompt']);self.assertEqual(self.store.get(job['id'])['client_id'],'')
        with self.assertRaises(OperationError):self.store.create('Pedido','','bad-project-key',project_id='x'*32)
    def test_memory_states_supersede_and_context_filters(self):
        c=self.store.create_client('Cliente','')
        n=self.store.add_note(c['id'],level=1,kind='preferencia',text='Usa caixa alta.',source='Tiago');self.assertEqual(n['state'],'confirmado')
        proposed=self.store.add_note(c['id'],level=1,kind='fato',text='Proposta não confirmada.',source='ARI',state='proposto')
        ctx=self.store.client_context(c['id']);texts=[f['texto'] for f in ctx['fatos_confirmados']]
        self.assertIn('Usa caixa alta.',texts);self.assertNotIn('Proposta não confirmada.',texts)
        new=self.store.supersede_note(c['id'],n['id'],'Sentence case, caixa alta só em marcas.','Tiago, correção')
        notes={x['id']:x for x in self.store.get_client(c['id'])['notes']}
        self.assertEqual(notes[n['id']]['state'],'superado');self.assertEqual(new['supersedes'],n['id']);self.assertEqual(new['state'],'confirmado')
        self.assertEqual([f['texto'] for f in self.store.client_context(c['id'])['fatos_confirmados']],['Sentence case, caixa alta só em marcas.'])
        with self.assertRaises(OperationError):self.store.set_note_state(c['id'],n['id'],'confirmado')
        self.store.set_note_state(c['id'],proposed['id'],'descartado')
        other=self.store.create_client('Outro','')
        with self.assertRaises(OperationError):self.store.set_note_state(other['id'],proposed['id'],'confirmado')
    def test_project_scoping_and_material_budget(self):
        c=self.store.create_client('Cliente','');p=self.store.create_project(c['id'],'Conteúdo da semana')
        self.store.add_material(c['id'],kind='texto',name='Geral',origin='t',content='G'*5000,state='lido')
        self.store.add_material(c['id'],kind='texto',name='Do projeto',origin='t',content='P'*5000,state='lido',project_id=p['id'])
        other_project=self.store.create_project(c['id'],'Outro')
        self.store.add_material(c['id'],kind='texto',name='Outro projeto',origin='t',content='O'*100,state='lido',project_id=other_project['id'])
        ctx=self.store.client_context(c['id'],p['id'])
        self.assertEqual([m['nome'] for m in ctx['materiais']],['Geral','Do projeto']);self.assertTrue(all(len(m['trecho'])<=4000 for m in ctx['materiais']))
        self.assertEqual(ctx['projeto']['name'],'Conteúdo da semana')
        with self.assertRaises(OperationError):self.store.create_project('f'*32,'X')
        with self.assertRaises(OperationError):self.store.add_material(c['id'],kind='texto',name='x',origin='t',content='x',state='lido',project_id='f'*32)
    def test_propose_client_only_proposes_never_confirms(self):
        c=self.store.create_client('AERA','https://aera.company')
        with self.assertRaises(OperationError):self.engine.propose_client(c['id'])
        self.store.add_material(c['id'],kind='link',name='Site',origin='https://aera.company',extracted='We make things move. Strategy, creative, technology and AI.',state='lido')
        result=self.engine.propose_client(c['id'])
        self.assertGreaterEqual(len(result['notes']),2);self.assertTrue(all(n['state']=='proposto' for n in result['notes']))
        self.assertIn('We make things move',result['notes'][0]['text']);self.assertFalse(self.store.client_context(c['id'])['fatos_confirmados'])
        self.assertEqual(self.store.get_client(c['id'])['summary'],'Resumo de teste para AERA.')
        self.assertNotIn('SEGREDO',self.provider.calls[0]['prompt'])


class ClientHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.provider=ClientFixture();self.server=serve_demo.create_server(0,self.temp.name,self.provider,start_worker=False)
        self.server.allow_local_links=True
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.server.store.close();self.temp.cleanup()
    def call(self,path,body=None,method=None):
        h={'Content-Type':'application/json','X-Aera-Client':'1'};req=urllib.request.Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers=h,method=method)
        try:
            with urllib.request.urlopen(req,timeout=5) as r:return r.status,json.loads(r.read())
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
    def test_register_client_from_site_propose_confirm_and_use_in_job(self):
        with PageServer() as pages:
            code,client=self.call('/api/clients',{'name':'AERA','site_url':pages.base+'/aera'})
        self.assertEqual(code,201);self.assertEqual(client['materials'][0]['state'],'lido');self.assertNotIn('extracted',client['materials'][0]);self.assertIn('We make things move',client['materials'][0]['preview'])
        cid=client['id']
        code,result=self.call(f'/api/clients/{cid}/propose',{'hint':'Marca própria da AERA.'});self.assertEqual(code,200)
        notes=result['client']['notes'];self.assertTrue(notes and all(n['state']=='proposto' for n in notes))
        code,ctx=self.call(f'/api/clients/{cid}/context');self.assertEqual(ctx['fatos_confirmados'],[])
        self.assertEqual(self.call(f'/api/clients/{cid}/notes/{notes[0]["id"]}/confirm',{})[0],200)
        self.assertEqual(self.call(f'/api/clients/{cid}/notes/{notes[1]["id"]}/reject',{})[0],200)
        code,project=self.call(f'/api/clients/{cid}/projects',{'name':'Conteúdo da semana'});self.assertEqual(code,201)
        code,material=self.call(f'/api/clients/{cid}/materials',{'kind':'texto','name':'Pauta','content':'Três posts por semana.','project_id':project['id']});self.assertEqual(code,201)
        self.assertEqual(self.call(f'/api/clients/{cid}/materials',{'kind':'pdf','name':'x'})[1]['code'],'unsupported_material')
        code,ctx=self.call(f'/api/clients/{cid}/context?project='+project['id']);self.assertEqual(len(ctx['fatos_confirmados']),1);self.assertEqual(len(ctx['materiais']),2)
        code,job=self.call('/api/jobs',{'brief':'Conteúdo da semana','idempotency_key':'client-job-key','client_id':cid,'project_id':project['id']});self.assertEqual(code,201)
        self.server.store.claim();self.server.engine.process(job['id']);prompt=self.provider.calls[-1]['prompt']
        self.assertIn('Fonte lida',prompt);self.assertIn('Três posts por semana.',prompt);self.assertNotIn('Tom direto',prompt)
        code,listing=self.call('/api/jobs');self.assertEqual(listing['jobs'][0]['client_id'],cid)
    def test_unreadable_link_is_registered_not_invented(self):
        with PageServer() as pages:
            code,client=self.call('/api/clients',{'name':'Fechado','site_url':pages.base+'/login'})
            self.assertEqual(client['materials'][0]['state'],'nao_lido');self.assertIn('login',client['materials'][0]['reason'])
            code,material=self.call(f'/api/clients/{client["id"]}/materials',{'kind':'link','url':pages.base+'/pdf'})
        self.assertEqual(material['state'],'nao_lido')
        self.assertEqual(self.call(f'/api/clients/{client["id"]}/propose',{})[1]['code'],'no_material')
    def test_wrong_client_cannot_touch_another_clients_notes(self):
        a=self.call('/api/clients',{'name':'A'})[1];b=self.call('/api/clients',{'name':'B'})[1]
        note=self.call(f'/api/clients/{a["id"]}/notes',{'text':'Fato de A'})[1]
        self.assertEqual(self.call(f'/api/clients/{b["id"]}/notes/{note["id"]}/reject',{})[0],404)
        self.assertEqual(self.call(f'/api/jobs',{'brief':'x','idempotency_key':'cross-project-key','client_id':a['id'],'project_id':'c'*32})[0],400)
    def test_runtime_database_is_still_private(self):
        self.assertNotEqual(urllib.request.urlopen(self.base+'/').status,404)
        with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(self.base+'/runtime/office.sqlite3')


if __name__=='__main__':unittest.main(verbosity=2)
