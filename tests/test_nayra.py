"""NAYRA, first cut (C37 to C45): briefing from rows in urgency order, and the Claude Code bridge."""
import datetime
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
sys.path.insert(0,str(ROOT/'tests'))
from office.store import Store
from office.engine import Engine
from office.provider import OperationError
from office import nayra
from fixtures import ContentFixture
import serve_demo


class BriefingTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(pathlib.Path(self.temp.name)/'office.sqlite3');self.engine=Engine(self.store,ContentFixture())
        self.client=self.store.create_client('AERA','');self.store.add_note(self.client['id'],level=1,kind='fato',text='AERA faz estratégia.',source='Tiago')
    def tearDown(self):self.engine.stop();self.store.close();self.temp.cleanup()

    def test_empty_office_says_nothing_waits(self):
        b=nayra.briefing(self.store,local_hour=9)
        self.assertEqual(b['items'],[]);self.assertEqual(b['count'],0);self.assertEqual(b['opening'],'Bom dia, Chefe. Tudo em dia. Nada espera por você.')

    def test_urgency_order_you_ready_stuck(self):
        # A failed session job, then real engine work awaiting approval, then a session step that finished.
        stuck=nayra.open_session(self.store,'Site de exemplo','LEO');nayra.fail(self.store,stuck['id'][:8],'sem acesso ao repositório','LEO')
        job=self.store.create('Semana','','nayra-week-key',client_id=self.client['id'],job_type='conteudo-semana');self.store.claim();self.engine.process(job['id'])
        self.store.confirm_estimate(job['id']);self.store.claim();self.engine.process(job['id'])
        other=nayra.open_session(self.store,'Pesquisa de concorrentes','MAYA',client='aera');nayra.step(self.store,other['id'],'MAYA mapeou 6 concorrentes','MAYA')
        b=nayra.briefing(self.store,image_ready=False,local_hour=15)
        groups=[i['group'] for i in b['items']]
        self.assertEqual(groups[0],'voce');self.assertRegex(b['items'][0]['text'],r'^3 posts de .+ para AERA esperam a sua aprovação\.$')
        self.assertLess(groups.index('pronto'),groups.index('travado'))
        ready=[i for i in b['items'] if i['group']=='pronto'];self.assertEqual(ready[0]['agent'],'MAYA');self.assertIn('MAYA mapeou 6 concorrentes',ready[0]['text'])
        stuck_items=[i for i in b['items'] if i['group']=='travado']
        self.assertTrue(any('sem acesso ao repositório' in i['text'] for i in stuck_items))
        self.assertTrue(any('imagens esperam o executor' in i['text'] for i in stuck_items))
        # Work on the job already reported above is not repeated as "ready".
        self.assertFalse(any(i['group']=='pronto' and i['job_id']==job['id'] for i in b['items']))
        self.assertTrue(b['opening'].startswith('Boa tarde, Chefe. 1 coisa depende de você.'))
        self.assertTrue(all(i['zone'] for i in b['items']))
        later=nayra.briefing(self.store,since=datetime.datetime.now(datetime.timezone.utc).isoformat())
        self.assertFalse(any(i['group']=='pronto' for i in later['items']),'ready resets after Tiago hears it; pending items stay')
        self.assertEqual(later['items'][0]['group'],'voce')

    def test_decided_jobs_are_not_news(self):
        job=nayra.open_session(self.store,'Post aprovado','NOA');nayra.step(self.store,job['id'],'NOA escreveu o post','NOA');nayra.deliver(self.store,job['id'],'texto','ARI')
        self.store.approve(job['id'])
        self.assertEqual(nayra.briefing(self.store)['items'],[])

    def test_caps_at_five_items(self):
        for n in range(7):
            j=nayra.open_session(self.store,f'Entrega {n}','NOA');nayra.deliver(self.store,j['id'],f'texto {n}','NOA')
        b=nayra.briefing(self.store)
        self.assertEqual(len(b['items']),5);self.assertEqual(b['count'],7);self.assertEqual(b['items'][-1]['group'],'resto');self.assertIn('mais 3 itens',b['items'][-1]['text'])
        self.assertEqual(b['items'][0]['actions'],['approve','open'])


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(pathlib.Path(self.temp.name)/'office.sqlite3')
        self.client=self.store.create_client('AERA','')
    def tearDown(self):self.store.close();self.temp.cleanup()

    def test_session_lifecycle_lights_the_right_room(self):
        job=nayra.open_session(self.store,'Proposta de exemplo','NINA',client='AERA')
        self.assertEqual((job['status'],job['job_type'],job['client_name']),('em_sessao','sessao','AERA'))
        self.assertEqual(self.store.running_by_character()['NINA'][0]['job_id'],job['id'])
        nayra.step(self.store,job['id'][:8],'NOA escreveu a abertura','NOA')
        running=self.store.running_by_character();self.assertIn('NOA',running);self.assertNotIn('NINA',running)
        self.assertIsNone(self.store.claim(),'the engine never claims a session job')
        self.store.recover();self.assertEqual(self.store.get(job['id'])['status'],'em_sessao','a restart does not interrupt a session')
        asked=nayra.ask(self.store,job['id'],'Qual o prazo?');self.assertEqual((asked['status'],asked['questions']),('needs_input',['Qual o prazo?']))
        self.assertEqual(self.store.running_by_character(),{})
        nayra.step(self.store,job['id'],'Prazo recebido: sexta','ARI')
        d1=nayra.deliver(self.store,job['id'],'# Proposta v1','ARI');self.assertEqual((d1['status'],d1['revision'],d1['deliveries'][0]['model']),('awaiting_approval',1,nayra.SESSION_MODEL))
        d2=nayra.deliver(self.store,job['id'],'# Proposta v2','ARI');self.assertEqual((d2['revision'],len(d2['deliveries'])),(2,2))
        approved=self.store.approve(job['id']);self.assertEqual(approved['status'],'approved')
        with self.assertRaises(OperationError):nayra.step(self.store,job['id'],'depois de aprovado')
        kinds=[e['kind'] for e in approved['events']]
        self.assertEqual(kinds[:3],['session_started','session_step','questions']);self.assertIn('approved',kinds)
        team=self.store.team_activity();self.assertTrue(any(e['message']=='NOA escreveu a abertura' for e in team['NOA']['log']))

    def test_proposed_notes_wait_for_tiago(self):
        result=nayra.propose_notes(self.store,'aera',[{'tipo':'fato','texto':'A AERA une estratégia, criação, tecnologia e IA.','fonte':'aera.company'},{'tipo':'preferencia','texto':'Voz curta, segura e humana.'}],summary='Estúdio de estratégia e tecnologia.')
        self.assertEqual([n['state'] for n in result['notes']],['proposto','proposto'])
        self.assertTrue(result['notes'][0]['source'].startswith('NAYRA pelo Claude Code, a partir de aera.company'))
        self.assertEqual(self.store.client_context(self.client['id'])['fatos_confirmados'],[],'nothing is memory before Tiago confirms')
        self.store.set_note_state(self.client['id'],result['notes'][0]['id'],'confirmado')
        context=self.store.client_context(self.client['id']);self.assertEqual(len(context['fatos_confirmados']),1);self.assertEqual(context['resumo'],'Estúdio de estratégia e tecnologia.')
        with self.assertRaises(OperationError):nayra.propose_notes(self.store,'AERA',[{'tipo':'chute','texto':'x'}])
        with self.assertRaises(OperationError):nayra.propose_notes(self.store,'AERA',[])

    def test_validation(self):
        with self.assertRaises(OperationError):nayra.open_session(self.store,'X','ZECA')
        with self.assertRaises(OperationError) as e:nayra.open_session(self.store,'X','ARI',client='Cliente fantasma')
        self.assertIn('AERA',e.exception.message)
        with self.assertRaises(OperationError):nayra.step(self.store,'abc','curto demais')
        engine_job=self.store.create('Pedido do motor','','nayra-engine-key')
        with self.assertRaises(OperationError) as e:nayra.step(self.store,engine_job['id'],'invadir')
        self.assertEqual(e.exception.code,'invalid_state')


class NayraHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.server=serve_demo.create_server(0,self.temp.name,ContentFixture(),start_worker=False)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.port=self.server.server_port;self.base=f'http://127.0.0.1:{self.port}'
    def tearDown(self):self.server.shutdown();self.server.server_close();self.server.store.close();self.temp.cleanup()
    def post(self,path,body,headers=None):
        h={'Content-Type':'application/json','X-Aera-Client':'1'} if headers is None else headers
        with urllib.request.urlopen(urllib.request.Request(self.base+path,data=json.dumps(body).encode(),headers=h,method='POST'),timeout=5) as r:return json.loads(r.read())
    def get(self,path):
        with urllib.request.urlopen(self.base+path,timeout=5) as r:return json.loads(r.read())
    def cli(self,*args):
        return subprocess.run([sys.executable,str(ROOT/'scripts/nayra.py'),'--porta',str(self.port),*args],capture_output=True,text=True,timeout=20,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})

    def test_cli_round_trip_and_office_guards(self):
        opened=self.cli('abrir','Post de lançamento','--agente','noa');self.assertEqual(opened.returncode,0,opened.stderr)
        short=opened.stdout.split('id ')[1][:8]
        self.assertEqual(self.cli('passo',short,'NOA fechou o texto','--agente','NOA').returncode,0)
        team=self.get('/api/team')['characters'];noa=next(c for c in team if c['name']=='NOA');self.assertEqual(noa['state'],'em_tarefa')
        delivery=pathlib.Path(self.temp.name)/'entrega.md';delivery.write_text('# Post\nTexto final.',encoding='utf-8')
        done=self.cli('entregar',short,'--arquivo',str(delivery));self.assertEqual(done.returncode,0,done.stderr);self.assertIn('versão 1',done.stdout)
        b=self.get('/api/nayra/briefing');self.assertEqual(b['items'][0]['group'],'voce');self.assertIn('Post de lançamento',b['items'][0]['text'])
        state=self.cli('estado');self.assertIn('Post de lançamento',state.stdout)
        job_id=b['items'][0]['job_id']
        with self.assertRaises(urllib.error.HTTPError) as e:self.post(f'/api/jobs/{job_id}/revise',{'text':'mais curto'})
        self.assertEqual(json.loads(e.exception.read())['code'],'session_job')
        self.assertEqual(self.post(f'/api/jobs/{job_id}/approve',{})['status'],'approved')
        self.assertIn('aprovado',self.cli('trabalhos').stdout)
        bad=self.cli('passo',short,'depois de aprovado');self.assertNotEqual(bad.returncode,0);self.assertIn('encerrado',bad.stderr)
        made=self.cli('cadastrar','Cliente Teste');self.assertEqual(made.returncode,0,made.stderr);self.assertIn('Cliente cadastrado',made.stdout)
        self.assertIn('Já existe',self.cli('cadastrar','cliente teste').stderr)
        facts=pathlib.Path(self.temp.name)/'fatos.json';facts.write_text(json.dumps({'resumo':'Teste.','fatos':[{'tipo':'fato','texto':'Fato de teste.','fonte':'teste'}]}),encoding='utf-8')
        proposed=self.cli('propor','--cliente','Cliente Teste','--arquivo',str(facts));self.assertEqual(proposed.returncode,0,proposed.stderr);self.assertIn('1 fatos propostos',proposed.stdout)
        context=json.loads(self.cli('contexto','--cliente','Cliente Teste').stdout);self.assertEqual((context['resumo'],context['fatos_confirmados']),('Teste.',[]))

    def test_bridge_requires_local_client_header(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.post('/api/bridge/open',{'title':'X'},headers={'Content-Type':'application/json'})
        self.assertEqual(e.exception.code,403)

    def test_cli_reports_office_off(self):
        r=subprocess.run([sys.executable,str(ROOT/'scripts/nayra.py'),'--porta','1','estado'],capture_output=True,text=True,timeout=20)
        self.assertNotEqual(r.returncode,0);self.assertIn('não respondeu',r.stderr)




class JohnBatchTests(unittest.TestCase):
    """C66 to C71: JOHN proposes image batches; nothing is generated before Tiago releases it."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.server=serve_demo.create_server(0,self.temp.name,ContentFixture(),start_worker=False)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.port=self.server.server_port;self.base=f'http://127.0.0.1:{self.port}'
        self.store=self.server.store;self.store.create_client('AERA','')
    def tearDown(self):self.server.shutdown();self.server.server_close();self.server.store.close();self.temp.cleanup()
    def post(self,path,body):
        req=urllib.request.Request(self.base+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Aera-Client':'1'},method='POST')
        with urllib.request.urlopen(req,timeout=5) as r:return json.loads(r.read())
    def get(self,path):
        with urllib.request.urlopen(self.base+path,timeout=5) as r:return json.loads(r.read())
    def cli(self,*args):
        return subprocess.run([sys.executable,str(ROOT/'scripts/nayra.py'),'--porta',str(self.port),*args],capture_output=True,text=True,timeout=20,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})

    def test_batch_needs_release_and_is_in_the_briefing(self):
        job=nayra.open_session(self.store,'Conteúdo da semana de 02/11','NOA',client='AERA')
        self.assertIn('JOHN',self.store.TEAM)
        made=self.cli('lote',job['id'][:8],'--imagens','2','--descricao','espaço de concreto em luz quente para o post 1','--creditos','3')
        self.assertEqual(made.returncode,0,made.stderr);self.assertIn('aguarda o ok do Tiago',made.stdout)
        self.assertIn('JOHN',self.store.running_by_character())
        b=nayra.briefing(self.store);item=next(i for i in b['items'] if i.get('batch_id'))
        self.assertEqual((item['agent'],item['zone'],item['actions']),('JOHN','create',['release','open']));self.assertIn('2 imagens',item['text']);self.assertIn('3 créditos',item['hint'])
        batch_id=item['batch_id']
        with self.assertRaises(OperationError):nayra.batch_done(self.store,batch_id,2)
        job_view=self.get(f'/api/jobs/{job["id"]}');self.assertEqual(job_view['batches'][0]['state'],'proposto')
        self.assertEqual(self.post(f'/api/jobs/{job["id"]}/batches/{batch_id}/release',{})['state'],'liberado')
        with self.assertRaises(urllib.error.HTTPError) as e:self.post(f'/api/jobs/{job["id"]}/batches/{batch_id}/decline',{})
        self.assertEqual(e.exception.code,409)
        self.assertFalse(any(i.get('batch_id') for i in nayra.briefing(self.store)['items']))
        self.assertIn('liberado',self.cli('lote-status',job['id'][:8]).stdout)
        done=self.cli('lote-gerado',batch_id,'--imagens','2','--arquivos','a.png','b.png');self.assertEqual(done.returncode,0,done.stderr)
        kinds=[e['kind'] for e in self.store.get(job['id'])['events']]
        self.assertEqual([k for k in kinds if k.startswith('batch') or k=='images_ready'],['batch_proposed','batch_released','images_ready'])
        team={c['name']:c for c in self.get('/api/team')['characters']};self.assertTrue(any('gerou 2 imagens' in e['message'] for e in team['JOHN']['log']))

    def test_batch_validation(self):
        job=nayra.open_session(self.store,'Teste','JOHN')
        with self.assertRaises(OperationError):nayra.propose_batch(self.store,job['id'],0,'nada')
        with self.assertRaises(OperationError):nayra.propose_batch(self.store,job['id'],30,'demais')
        b=nayra.propose_batch(self.store,job['id'],1,'uma')
        self.assertEqual(nayra.decide_batch(self.store,job['id'],b['id'],False)['state'],'recusado')
        with self.assertRaises(OperationError):nayra.batch_done(self.store,b['id'],1)


class PresentationTests(unittest.TestCase):
    """C51 and C59: in presentation mode every read shows AERA only; the demo context never carries another client."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.server=serve_demo.create_server(0,self.temp.name,ContentFixture(),start_worker=False)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base=f'http://127.0.0.1:{self.server.server_port}'
        store=self.server.store
        self.aera=store.create_client('AERA','');self.other=store.create_client('Cliente Sigiloso','')
        store.add_note(self.aera['id'],level=1,kind='fato',text='A AERA pensa e constrói.',source='Tiago')
        store.add_note(self.other['id'],level=1,kind='fato',text='Segredo do outro cliente.',source='Tiago')
        a=nayra.open_session(store,'Posts da AERA','NOA',client='AERA');nayra.step(store,a['id'],'NOA escreveu os posts','NOA');nayra.deliver(store,a['id'],'# Post da AERA','ARI')
        o=nayra.open_session(store,'Plano secreto','MAYA',client='Cliente Sigiloso');nayra.step(store,o['id'],'MAYA leu o plano secreto','MAYA')
        self.a_id,self.o_id=a['id'],o['id']
    def tearDown(self):self.server.shutdown();self.server.server_close();self.server.store.close();self.temp.cleanup()
    def get(self,path):
        with urllib.request.urlopen(self.base+path,timeout=5) as r:return json.loads(r.read())
    def post(self,path,body):
        req=urllib.request.Request(self.base+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Aera-Client':'1'},method='POST')
        with urllib.request.urlopen(req,timeout=5) as r:return json.loads(r.read())

    def test_presentation_shows_only_aera(self):
        self.assertEqual(len(self.get('/api/jobs')['jobs']),2)
        self.assertTrue(self.post('/api/presentation',{'on':True})['on'])
        self.assertEqual(self.get('/api/presentation')['client'],'AERA')
        self.assertEqual([j['id'] for j in self.get('/api/jobs')['jobs']],[self.a_id])
        self.assertEqual([c['name'] for c in self.get('/api/clients')['clients']],['AERA'])
        for path in (f'/api/jobs/{self.o_id}',f'/api/clients/{self.other["id"]}',f'/api/clients/{self.other["id"]}/context'):
            with self.assertRaises(urllib.error.HTTPError) as e:self.get(path)
            self.assertEqual(e.exception.code,404,path)
        with self.assertRaises(urllib.error.HTTPError) as e:self.post(f'/api/jobs/{self.o_id}/cancel',{})
        self.assertEqual(e.exception.code,404)
        everything=json.dumps([self.get(p) for p in ('/api/team','/api/activity','/api/summary','/api/nayra/briefing','/api/nayra/sessions','/api/capabilities','/api/nayra/demo-context')],ensure_ascii=False)
        for secret in ('Plano secreto','secreto','Cliente Sigiloso','Segredo do outro'):
            self.assertNotIn(secret,everything)
        self.assertIn('Posts da AERA',everything)
        team={c['name']:c for c in self.get('/api/team')['characters']};self.assertEqual(team['MAYA']['state'],'disponivel')
        self.assertFalse(self.post('/api/presentation',{'on':False})['on'])
        self.assertEqual(len(self.get('/api/jobs')['jobs']),2)
        self.assertEqual({c['name']:c for c in self.get('/api/team')['characters']}['MAYA']['state'],'em_tarefa')

    def test_demo_context_is_aera_even_outside_presentation(self):
        c=self.get('/api/nayra/demo-context')
        self.assertEqual((c['client'],c['facts'],[j['title'] for j in c['jobs']]),('AERA',1,['Posts da AERA']))
        self.assertIn('# Post da AERA',c['text']);self.assertIn('NOA escreveu os posts',c['text']);self.assertNotIn('secreto',c['text'])

    def test_office_context_is_whole_office_only_for_tiago(self):
        # C84: outside presentation the Tiago agent hears every client; in presentation the route falls back to AERA.
        c=self.get('/api/nayra/office-context')
        self.assertEqual(sorted(j['title'] for j in c['jobs']),['Plano secreto','Posts da AERA'])
        for text in ('Cliente Sigiloso','Segredo do outro cliente.','MAYA leu o plano secreto','JOHN'):self.assertIn(text,c['text'])
        self.post('/api/presentation',{'on':True})
        c=self.get('/api/nayra/office-context')
        self.assertEqual(c['client'],'AERA')
        for secret in ('Plano secreto','Cliente Sigiloso','Segredo do outro'):self.assertNotIn(secret,json.dumps(c,ensure_ascii=False))

    def test_agent_id_route(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.get('/api/nayra/agent')
        self.assertEqual(e.exception.code,404)
        (pathlib.Path(self.temp.name)/'nayra-agent.json').write_text(json.dumps({'agent_id':'agent_test123'}))
        self.assertEqual(self.get('/api/nayra/agent')['agent_id'],'agent_test123')


if __name__=='__main__':unittest.main(verbosity=2)
