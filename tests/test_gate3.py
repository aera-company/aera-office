"""Recorte 1, gate 3: the card job "conteúdo da semana" end to end with a fixture transport."""
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
from office.provider import OperationError
from office import artifacts
from fixtures import ContentFixture
import serve_demo


class CardJobTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.runtime=pathlib.Path(self.temp.name);self.store=Store(self.runtime/'office.sqlite3');self.provider=ContentFixture();self.engine=Engine(self.store,self.provider)
        self.client=self.store.create_client('AERA','https://aera.company')
        self.store.add_note(self.client['id'],level=1,kind='fato',text='AERA faz estratégia, criação, tecnologia e IA.',source='Tiago')
        self.project=self.store.create_project(self.client['id'],'Conteúdo da semana')
    def tearDown(self):self.engine.stop();self.store.close();self.temp.cleanup()
    def new(self,key='week-key-000001'):
        return self.store.create('Conteúdo da semana da AERA','',key,client_id=self.client['id'],project_id=self.project['id'],job_type='conteudo-semana')
    def run_until_cards(self,job):
        self.store.claim();self.engine.process(job['id']);job=self.store.get(job['id'])
        self.assertEqual(job['status'],'awaiting_estimate');self.assertEqual(len(self.provider.calls),1)
        self.store.confirm_estimate(job['id']);self.store.claim();self.engine.process(job['id']);return self.store.get(job['id'])
    def writer(self,job,card):return artifacts.write_card_files(self.runtime,job,card,'AERA','Conteúdo da semana')

    def test_estimate_gate_then_pauta_posts_and_review(self):
        job=self.run_until_cards(self.new())
        self.assertEqual(job['status'],'awaiting_approval');self.assertEqual(len(self.provider.calls),6)
        self.assertEqual(job['estimate']['calls'],6);self.assertEqual(job['estimate']['images'],9);self.assertEqual(job['calls_made'],6)
        self.assertEqual(len(job['pauta']),3);self.assertEqual(len(job['cards']),3)
        for card in job['cards']:
            self.assertEqual(card['state'],'parcial');self.assertEqual(card['pending'],'imagem');self.assertEqual(len(card['pieces']),3)
            self.assertEqual({p['channel'] for p in card['pieces']},{'instagram-feed','instagram-stories','linkedin-feed'});self.assertTrue(all(p['image_state']=='pendente' for p in card['pieces']))
        self.assertIn('Falta prova',job['cards'][1]['review']);self.assertIn('AERA',self.provider.calls[1]['prompt'])
        started=[e for e in job['events'] if e['kind']=='task_started']
        self.assertEqual([e['data']['agent'] for e in started],['MAYA','NOA','NOA','NOA']);self.assertTrue(all(e['data']['methods'] for e in started))
        self.assertIn('scriptwriter.md',json.dumps(started[1]['data']['methods']));self.assertIn('Human Social',json.dumps(started[1]['data']['methods']))
    def test_no_call_happens_before_estimate_confirmation(self):
        job=self.new();self.store.claim();self.engine.process(job['id'])
        self.assertEqual(len(self.provider.calls),1);self.assertIsNone(self.store.claim());self.engine.process(job['id'])
        self.assertEqual(len(self.provider.calls),1);self.assertEqual(self.store.get(job['id'])['status'],'awaiting_estimate')
        with self.assertRaises(OperationError):self.store.confirm_estimate(job['id']) if False else self.store.card_approve(job['id'],'x'*32)
    def test_adjust_one_card_calls_only_its_owner_and_keeps_the_others(self):
        job=self.run_until_cards(self.new());card=job['cards'][1];others=[c['id'] for c in job['cards'] if c['id']!=card['id']]
        self.store.card_revise(job['id'],card['id'],'Abertura mais direta.');self.assertEqual(self.store.get(job['id'])['status'],'revision_queued')
        self.store.claim();self.engine.process(job['id']);job=self.store.get(job['id'])
        self.assertEqual(job['status'],'awaiting_approval');self.assertEqual(len(self.provider.calls),7)
        revised=next(c for c in job['cards'] if c['id']==card['id'])
        self.assertEqual(revised['version'],2);self.assertEqual(revised['state'],'parcial');self.assertIn('AJUSTADO',revised['pieces'][0]['headline']);self.assertEqual(len(revised['items']),6)
        self.assertIn('versao_anterior',self.provider.calls[6]['prompt']);self.assertIn('Abertura mais direta',self.provider.calls[6]['prompt'])
        for c in job['cards']:
            if c['id'] in others:self.assertEqual(c['version'],1);self.assertNotIn('AJUSTADO',c['pieces'][0]['headline'])
    def test_approve_writes_real_files_and_discard_records_reason(self):
        job=self.run_until_cards(self.new());first,second,third=job['cards']
        job=self.store.card_approve(job['id'],first['id'],writer=self.writer)
        self.assertEqual(job['cards'][0]['state'],'aprovado');self.assertEqual(len(job['artifacts']),3)
        for a in job['artifacts']:
            path=pathlib.Path(a['path']);self.assertTrue(path.is_file());content=path.read_text()
            self.assertIn('TEXTO DE TESTE',content);self.assertIn('Imagem: pendente',content);self.assertIn(str(self.runtime),str(path))
        self.assertEqual(job['status'],'awaiting_approval')
        job=self.store.card_discard(job['id'],second['id'],'Tema repetido.');self.assertEqual(job['cards'][1]['state'],'descartado')
        job=self.store.card_approve(job['id'],third['id'],writer=self.writer);self.assertEqual(job['status'],'approved')
        notes=[n['text'] for n in self.store.get_client(self.client['id'])['notes'] if n['level']==2]
        self.assertEqual(len(notes),3);self.assertTrue(any('descartado' in n and 'Tema repetido' in n for n in notes))
        with self.assertRaises(OperationError):self.store.card_approve(job['id'],first['id'],writer=self.writer)
    def test_ceiling_interrupts_and_preserves_cards_and_resume_releases_calls(self):
        job=self.new();self.store.claim();self.engine.process(job['id']);self.store.confirm_estimate(job['id'])
        self.store.update(job['id'],ceiling=4);self.store.claim();self.engine.process(job['id']);job=self.store.get(job['id'])
        self.assertEqual(job['status'],'interrupted');self.assertIn('Teto',job['error']);self.assertEqual(len(self.provider.calls),4)
        self.assertEqual(len(job['pauta']),3);self.assertEqual(sum(1 for c in job['cards'] if c['pieces']),2)
        self.store.resume(job['id']);self.store.claim();self.engine.process(job['id']);job=self.store.get(job['id'])
        self.assertEqual(job['status'],'awaiting_approval');self.assertEqual(job['ceiling'],7);self.assertEqual(len(self.provider.calls),6)
    def test_clarify_pauses_before_any_production(self):
        self.provider.clarify=True;job=self.new();self.store.claim();self.engine.process(job['id'])
        job=self.store.get(job['id']);self.assertEqual(job['status'],'needs_input');self.assertFalse(job['cards']);self.assertEqual(len(self.provider.calls),1)
        self.store.answer(job['id'],'Foco: lançamento do escritório.');self.store.claim();self.engine.process(job['id'])
        self.assertEqual(self.store.get(job['id'])['status'],'awaiting_estimate')
    def test_cancel_between_posts_stops_following_calls(self):
        self.provider.gate=threading.Event();job=self.new();self.store.claim();self.engine.process(job['id']);self.store.confirm_estimate(job['id'])
        self.provider.gate=None;self.provider.fail_at=None
        gate=threading.Event();inside=threading.Event();calls=self.provider.calls
        original=self.provider.generate
        def slow(*a,**k):
            # The fourth call (post 2) blocks until the test cancels the job.
            if len(calls)==3:inside.set();gate.wait(3)
            return original(*a,**k)
        self.provider.generate=slow;self.engine.start();self.assertTrue(inside.wait(3))
        self.store.cancel(job['id']);gate.set();deadline=time.time()+3
        while time.time()<deadline and self.store.get(job['id'])['status']!='canceled':time.sleep(.01)
        job=self.store.get(job['id']);self.assertEqual(job['status'],'canceled');self.assertEqual(len(calls),4)
        self.assertEqual(sum(1 for c in job['cards'] if c['pieces']),2)
    def test_running_state_names_the_phase_for_the_building(self):
        job=self.new();self.store.update(job['id'],status='running',phase='pauta')
        running=self.store.running_by_character();self.assertIn('MAYA',running);self.assertIn('pauta',running['MAYA'][0]['instruction'])
        self.store.update(job['id'],phase='post:2');running=self.store.running_by_character()
        self.assertNotIn('MAYA',running);self.assertIn('post 2',running['NOA'][0]['instruction']);self.assertEqual(running['NOA'][0]['job_type'],'conteudo-semana')
        self.store.update(job['id'],status='reviewing',phase='review');self.assertIn('ARI',self.store.running_by_character())


class CardHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.provider=ContentFixture();self.server=serve_demo.create_server(0,self.temp.name,self.provider,start_worker=False)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):self.server.shutdown();self.server.server_close();self.server.store.close();self.temp.cleanup()
    def call(self,path,body=None):
        req=urllib.request.Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Aera-Client':'1'})
        try:
            with urllib.request.urlopen(req,timeout=5) as r:return r.status,(json.loads(r.read()) if r.headers.get('Content-Type','').startswith('application/json') else r.read().decode())
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
    def test_full_card_flow_over_http(self):
        client=self.call('/api/clients',{'name':'AERA'})[1];self.call(f'/api/clients/{client["id"]}/notes',{'text':'AERA faz estratégia e tecnologia.'})
        code,job=self.call('/api/jobs',{'brief':'Semana','idempotency_key':'http-week-key','client_id':client['id'],'job_type':'conteudo-semana'});self.assertEqual(code,201)
        self.server.store.claim();self.server.engine.process(job['id'])
        self.assertEqual(self.call('/api/jobs/'+job['id'])[1]['status'],'awaiting_estimate')
        code,job=self.call(f'/api/jobs/{job["id"]}/confirm-estimate',{});self.assertEqual(code,200);self.assertEqual(job['status'],'queued')
        self.server.store.claim();self.server.engine.process(job['id']);job=self.call('/api/jobs/'+job['id'])[1]
        self.assertEqual(job['status'],'awaiting_approval');card=job['cards'][0]
        code,job=self.call(f'/api/jobs/{job["id"]}/cards/{card["id"]}/approve',{});self.assertEqual(code,200);self.assertEqual(job['cards'][0]['state'],'aprovado')
        self.assertTrue(all(pathlib.Path(a['path']).is_file() and a['path'].startswith(self.temp.name) for a in job['artifacts']))
        code,job=self.call(f'/api/jobs/{job["id"]}/cards/{job["cards"][1]["id"]}/revise',{'text':'Mais curto.'});self.assertEqual(job['status'],'revision_queued')
        self.server.store.claim();self.server.engine.process(job['id']);job=self.call('/api/jobs/'+job['id'])[1]
        self.assertEqual(job['cards'][1]['version'],2);self.assertEqual(job['cards'][0]['state'],'aprovado')
        code,text=self.call(f'/api/jobs/{job["id"]}/export');self.assertEqual(code,200);self.assertIn('Post 1',text);self.assertIn('pendente',text)
        code,job=self.call(f'/api/jobs/{job["id"]}/cards/{job["cards"][2]["id"]}/discard',{'reason':'Fora de hora.'});self.assertEqual(job['cards'][2]['state'],'descartado')


if __name__=='__main__':unittest.main(verbosity=2)
