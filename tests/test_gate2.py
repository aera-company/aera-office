"""Recorte 1, gate 2: capabilities registry, job catalogue, method loading and team limits. Fixture transport only."""
import json
import pathlib
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
sys.path.insert(0,str(ROOT/'tests'))
from office import capabilities,jobs
from office.store import Store
from office.engine import Engine,validate_plan
from office.provider import OperationError
from test_operation import FixtureProvider,plan
import serve_demo


class RegistryTests(unittest.TestCase):
    def setUp(self):self.data=capabilities.load()
    def test_registry_is_consistent_and_every_method_file_exists(self):
        self.assertEqual(capabilities.validate(self.data),[])
        self.assertEqual(set(self.data['characters']),{'ARI','MAYA','NOA','JOHN','LEO','NINA'})
        for s in self.data['stations']:
            self.assertTrue(s['how_to_ask'].strip(),s['id']);self.assertEqual(s['methods_found'],s['method_paths'],s['id'])
    def test_every_catalog_station_exists_and_declared_jobs_match(self):
        ids={s['id'] for s in self.data['stations']}
        for key,job in jobs.CATALOG.items():
            for sid in job.get('stations',[]):self.assertIn(sid,ids,key)
        for s in self.data['stations']:
            for j in s['jobs']:self.assertIn(j,jobs.CATALOG,s['id']);self.assertIn(s['id'],jobs.CATALOG[j]['stations'],s['id'])
    def test_states_follow_executor_connection_and_running_tasks(self):
        off=capabilities.with_state(self.data,provider_ready=False,image_ready=False,running={})
        by={s['id']:s for s in off['stations']}
        self.assertEqual(by['noa.texto']['state'],'ia_desconectada');self.assertEqual(by['john.imagem']['state'],'sem_executor');self.assertEqual(by['leo.construcao-html']['state'],'sem_job');self.assertEqual(by['maya.dna']['state'],'sem_job')
        on=capabilities.with_state(self.data,provider_ready=True,image_ready=False,running={'NOA':[{'job_id':'j','task_id':'copy','job_type':'conteudo-semana'}]})
        by={s['id']:s for s in on['stations']}
        self.assertEqual(by['noa.texto']['state'],'em_tarefa');self.assertEqual(by['noa.estrutura']['state'],'disponivel');self.assertEqual(by['maya.pauta']['state'],'disponivel')
        self.assertEqual(on['characters']['NOA']['state'],'em_tarefa');self.assertEqual(on['characters']['NOA']['current_station'],'noa.texto');self.assertEqual(on['characters']['MAYA']['state'],'disponivel')
    def test_method_excerpts_are_bounded_and_recorded(self):
        text,used=capabilities.method_excerpts(self.data,'NOA','conteudo-semana')
        self.assertTrue(text);self.assertLessEqual(len(text),capabilities.MAX_METHOD_CHARS+600)
        self.assertTrue(all(u['state']=='carregado' for u in used));self.assertIn('scriptwriter.md',json.dumps(used))
        self.assertFalse(any('imageprompts' in u['path'] and False for u in used))
        none,used_none=capabilities.method_excerpts(self.data,'NINA','conteudo-semana')
        self.assertEqual((none,used_none),('',[]))
    def test_markdown_lists_every_station(self):
        md=capabilities.markdown(self.data)
        for s in self.data['stations']:self.assertIn(s['id'],md)
        self.assertIn('Como pedir',md)


class CatalogTests(unittest.TestCase):
    def test_only_content_job_and_free_request_are_executable(self):
        executable={k for k,j in jobs.CATALOG.items() if j['executable']}
        self.assertEqual(executable,{'pedido','conteudo-semana'})
        described={j['id']:j for j in jobs.describe(provider_ready=False,image_ready=False)}
        self.assertIn('declarado',described['proposta-html']['status']);self.assertIn('desconectada',described['conteudo-semana']['status'])
        self.assertNotIn('planner_hint',described['conteudo-semana'])
    def test_estimate_scales_with_posts_and_pieces(self):
        e=jobs.estimate('conteudo-semana');self.assertEqual((e['calls'],e['images']),(6,9));self.assertGreaterEqual(e['ceiling_calls'],e['calls'])
        self.assertEqual(jobs.estimate('conteudo-semana',posts=5)['images'],15);self.assertIsNone(jobs.estimate('nope'))
    def test_station_without_executor_never_receives_a_task(self):
        bad=plan();bad['tasks'][1]['agent']='LEO'
        with self.assertRaises(OperationError) as raised:validate_plan(bad,'conteudo-semana')
        self.assertIn('LEO',raised.exception.message);validate_plan(bad,'pedido');validate_plan(plan(),'conteudo-semana')


class EngineMethodTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(pathlib.Path(self.temp.name)/'office.sqlite3');self.provider=FixtureProvider();self.engine=Engine(self.store,self.provider)
    def tearDown(self):self.engine.stop();self.store.close();self.temp.cleanup()
    def test_tasks_carry_the_right_methods_and_record_them(self):
        job=self.store.create('Três posts para a AERA','','gate2-methods-key');self.store.claim();self.engine.process(job['id'])
        job=self.store.get(job['id']);self.assertEqual(job['status'],'awaiting_approval')
        systems=[c['system'] for c in self.provider.calls]
        self.assertNotIn('Job: Conteúdo da semana',systems[0]);self.assertIn('briefer.md',systems[0]);self.assertIn('planner.md',systems[0])
        self.assertIn('scout.md',systems[1]);self.assertIn('scriptwriter.md',systems[2]);self.assertIn('art-director.md',systems[2]);self.assertIn('quality-criteria.md',systems[3])
        self.assertNotIn('imageprompts.md',systems[2]);self.assertNotIn('Human Social',systems[2])
        started=[e for e in job['events'] if e['kind']=='task_started']
        self.assertEqual(len(started),2);self.assertTrue(all(m['state']=='carregado' for e in started for m in e['data']['methods']))
        self.assertIn('scout.md',json.dumps(started[0]['data']['methods']))
        self.assertTrue(all(len(s)<capabilities.MAX_METHOD_CHARS+4000 for s in systems))
    def test_free_request_loads_default_stations_only(self):
        job=self.store.create('Pedido livre','','gate2-free-request-key');self.store.claim();self.engine.process(job['id'])
        self.assertIn('scriptwriter.md',self.provider.calls[2]['system']);self.assertNotIn('Human Social',self.provider.calls[2]['system'])
    def test_running_task_shows_in_capabilities_state(self):
        self.provider.gate=threading.Event();job=self.store.create('Conteúdo','','gate2-running-key',job_type='conteudo-semana');self.engine.start()
        self.assertTrue(self.provider.entered.wait(2))
        running=self.store.running_by_character();self.assertIn('ARI',running);self.assertEqual(running['ARI'][0]['job_type'],'conteudo-semana')
        state=capabilities.with_state(self.engine.registry,provider_ready=True,image_ready=False,running=running)
        self.assertEqual(state['characters']['ARI']['state'],'em_tarefa');self.provider.gate.set()


class CatalogHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.provider=FixtureProvider();self.server=serve_demo.create_server(0,self.temp.name,self.provider,start_worker=False)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):self.server.shutdown();self.server.server_close();self.server.store.close();self.temp.cleanup()
    def call(self,path,body=None):
        req=urllib.request.Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Aera-Client':'1'})
        try:
            with urllib.request.urlopen(req,timeout=5) as r:return r.status,json.loads(r.read())
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
    def test_capabilities_catalog_and_estimate_routes(self):
        code,caps=self.call('/api/capabilities');self.assertEqual(code,200);self.assertEqual(len(caps['stations']),18);self.assertNotIn('method_paths',caps['stations'][0])
        self.assertTrue(all('state_label' in s for s in caps['stations']))
        code,catalog=self.call('/api/jobs/catalog');self.assertEqual({j['id'] for j in catalog['jobs']},set(jobs.CATALOG))
        code,est=self.call('/api/jobs/estimate?type=conteudo-semana');self.assertEqual(est['images'],9)
        self.assertEqual(self.call('/api/jobs/estimate?type=x')[0],404)
    def test_declared_job_cannot_be_submitted(self):
        code,result=self.call('/api/jobs',{'brief':'Proposta','idempotency_key':'declared-job-key','job_type':'proposta-html'})
        self.assertEqual((code,result['code']),(409,'job_not_executable'));self.assertFalse(self.server.store.list())
        self.assertEqual(self.call('/api/jobs',{'brief':'x','idempotency_key':'unknown-job-key','job_type':'nope'})[0],400)
        code,job=self.call('/api/jobs',{'brief':'Semana','idempotency_key':'content-job-key','job_type':'conteudo-semana'});self.assertEqual(code,201);self.assertEqual(job['job_type'],'conteudo-semana')


if __name__=='__main__':unittest.main(verbosity=2)
