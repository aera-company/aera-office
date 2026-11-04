"""Persistent operation tests. Model transport is explicitly a test fixture, never production."""
import datetime
import importlib.util
import json
import pathlib
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from office.store import Store
from office.engine import Engine,validate_plan
from office.provider import OperationError,ClaudeProvider
import serve_demo


def plan():
    return {'decision':'execute','title':'Campanha solicitada','summary':'Estratégia orienta a criação.','questions':[],
            'acceptance_criteria':['Entregar três posts específicos ao público.'],
            'tasks':[{'id':'direction','agent':'MAYA','instruction':'Defina a direção para este pedido.','depends_on':[]},
                     {'id':'copy','agent':'NOA','instruction':'Escreva os três posts usando a direção.','depends_on':['direction']}]}


class FixtureProvider:
    fixture=True
    def __init__(self, *, clarify=False,fail_at=None):
        self.calls=[];self.clarify=clarify;self.fail_at=fail_at;self.gate=None;self.entered=threading.Event();self.key='fixture-secret-not-real'
    def status(self):
        return {'ready':True,'verified':True,'provider':'TRANSPORTE DE TESTE','model':'fixture-no-real-ai','source':'fixture','persistence':False,'fixture':True}
    def generate(self,system,prompt,*,schema=None,max_tokens=0):
        self.calls.append({'system':system,'prompt':prompt,'schema':schema})
        self.entered.set()
        if self.gate:self.gate.wait(2)
        if len(self.calls)==self.fail_at:raise OperationError('Limite de teste.','rate_limit',429)
        data=json.JSONDecoder().raw_decode(prompt)[0]
        if schema:
            result=plan()
            if self.clarify and not data['esclarecimentos']:
                result.update(decision='clarify',tasks=[],questions=['Qual é a oferta?'])
            text=json.dumps(result)
        else:text='CONTEÚDO DE TESTE / '+data['pedido']+(' / AJUSTADO' if 'Ajuste solicitado pelo usuário:' in prompt else '')
        return {'text':text,'model':'fixture-no-real-ai','usage':{'input_tokens':23,'output_tokens':17},'request_id':'fixture-'+str(len(self.calls))}
    def connect(self,*args,**kwargs):return self.status()
    def disconnect(self):return {**self.status(),'ready':False}


class OperationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(pathlib.Path(self.temp.name)/'office.sqlite3');self.provider=FixtureProvider();self.engine=Engine(self.store,self.provider)
    def tearDown(self):
        self.engine.stop();self.store.close();self.temp.cleanup()
    def new(self,brief='Crie três posts para diretores de marketing.'):
        return self.store.create(brief,'Fatos aprovados: escritório 3D.','test-'+str(time.time_ns()))
    def run_job(self,job):
        self.store.claim();self.engine.process(job['id']);return self.store.get(job['id'])
    def test_real_handoff_contract_and_non_template_delivery(self):
        job=self.run_job(self.new('Três posts para a marca ALFA.'))
        self.assertEqual(job['status'],'awaiting_approval');self.assertEqual(len(self.provider.calls),4)
        self.assertIn('CONTEÚDO DE TESTE / Três posts para a marca ALFA.',self.provider.calls[2]['prompt'])
        self.assertTrue(all(t['status']=='done' for t in job['tasks']))
        self.assertIn('ALFA',job['deliveries'][0]['text'])
        other=self.run_job(self.new('Roteiro para a marca BETA.'))
        self.assertIn('BETA',other['deliveries'][0]['text']);self.assertNotEqual(job['deliveries'][0]['text'],other['deliveries'][0]['text'])
    def test_questions_block_specialists_until_answer(self):
        self.provider.clarify=True;job=self.run_job(self.new())
        self.assertEqual(job['status'],'needs_input');self.assertEqual(len(self.provider.calls),1);self.assertFalse(job['tasks'])
        self.store.answer(job['id'],'Oferta: demonstração gratuita de 20 minutos.');self.store.claim();self.engine.process(job['id'])
        result=self.store.get(job['id']);self.assertEqual(result['status'],'awaiting_approval')
        self.assertIn('demonstração gratuita',self.provider.calls[1]['prompt'])
    def test_failure_preserves_work_and_resume_skips_completed_calls(self):
        self.provider.fail_at=3;job=self.run_job(self.new())
        self.assertEqual(job['status'],'failed');self.assertEqual(job['tasks'][0]['status'],'done');self.assertEqual(job['tasks'][1]['status'],'failed');self.assertFalse(job['deliveries'])
        self.provider.fail_at=None;self.store.resume(job['id']);self.store.claim();self.engine.process(job['id']);job=self.store.get(job['id'])
        self.assertEqual(job['status'],'awaiting_approval');self.assertEqual(len(self.provider.calls),5)
    def test_approval_and_revision_keep_previous_delivery(self):
        job=self.new()
        with self.assertRaises(OperationError):self.store.approve(job['id'])
        job=self.run_job(job);self.store.approve(job['id']);self.store.revise(job['id'],'Deixe a abertura mais direta.')
        self.store.claim();self.engine.process(job['id']);job=self.store.get(job['id'])
        self.assertEqual(len(self.provider.calls),5);self.assertEqual(len(job['deliveries']),2)
        self.assertEqual(job['deliveries'][0]['status'],'approved');self.assertEqual(job['deliveries'][1]['status'],'pending');self.assertIn('AJUSTADO',job['deliveries'][1]['text'])
    def test_idempotent_submission_never_duplicates_job(self):
        a=self.store.create('Pedido A','','same-idempotency-key');b=self.store.create('Pedido A','','same-idempotency-key')
        self.assertEqual(a['id'],b['id']);self.assertEqual(len(self.store.list()),1)
    def test_scheduled_job_waits_until_due(self):
        later=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1)).isoformat()
        job=self.store.create('Pedido agendado','','schedule-idempotency',later)
        self.assertEqual(job['status'],'scheduled');self.assertIsNone(self.store.claim());self.assertFalse(self.provider.calls)
        with self.store.db:self.store.db.execute('UPDATE jobs SET execute_at=? WHERE id=?',('2020-01-01T00:00:00+00:00',job['id']))
        self.assertEqual(self.store.claim()['id'],job['id'])
    def test_restart_recovers_interrupted_job_without_paid_retry(self):
        job=self.new();self.store.claim();self.store.recover();job=self.store.get(job['id'])
        self.assertEqual(job['status'],'interrupted');self.assertIsNone(self.store.claim());self.assertFalse(self.provider.calls)
    def test_background_operation_does_not_need_browser_polling(self):
        self.engine.start();job=self.new();self.engine.wake.set();deadline=time.time()+3
        while time.time()<deadline and self.store.get(job['id'])['status']!='awaiting_approval':time.sleep(.01)
        self.assertEqual(self.store.get(job['id'])['status'],'awaiting_approval')
    def test_cancel_during_provider_call_stops_following_calls(self):
        self.provider.gate=threading.Event();job=self.new();self.engine.start()
        self.assertTrue(self.provider.entered.wait(1));self.store.cancel(job['id']);self.provider.gate.set();deadline=time.time()+2
        while time.time()<deadline and self.store.get(job['id'])['status']!='canceled':time.sleep(.01)
        self.assertEqual(self.store.get(job['id'])['status'],'canceled');self.assertEqual(len(self.provider.calls),1);self.assertFalse(self.store.get(job['id'])['deliveries'])
    def test_invalid_dependency_graph_never_reaches_execution(self):
        bad=plan();bad['tasks'][0]['depends_on']=['copy']
        with self.assertRaises(OperationError):validate_plan(bad)
        bad=plan();bad['tasks'][0]['agent']='POST_TO_INSTAGRAM'
        with self.assertRaises(OperationError):validate_plan(bad)


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.provider=FixtureProvider();self.server=serve_demo.create_server(0,self.temp.name,self.provider,start_worker=False)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.server.store.close();self.temp.cleanup()
    def call(self,path,body=None,headers=None):
        h={'Content-Type':'application/json','X-Aera-Client':'1',**(headers or {})};req=urllib.request.Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers=h)
        try:
            with urllib.request.urlopen(req,timeout=3) as r:return r.status,r.read()
        except urllib.error.HTTPError as e:return e.code,e.read()
    def test_full_http_job_approval_revision_export_and_private_storage(self):
        code,raw=self.call('/api/jobs',{'brief':'Conteúdo HTML <script>alert(1)</script> como texto.','context':'','idempotency_key':'http-test-idempotency'})
        self.assertEqual(code,201);job=json.loads(raw);job_id=job['id'];self.server.store.claim();self.server.engine.process(job_id)
        code,raw=self.call('/api/jobs/'+job_id);self.assertEqual(json.loads(raw)['status'],'awaiting_approval')
        self.assertNotIn(self.provider.key,raw.decode());self.assertEqual(self.call('/api/jobs/'+job_id+'/approve',{})[0],200)
        code,raw=self.call('/api/jobs/'+job_id+'/export');self.assertEqual(code,200);self.assertIn('Aprovada',raw.decode());self.assertIn('<script>',raw.decode())
        self.assertNotEqual(self.call('/runtime/office.sqlite3')[0],200)
        self.assertEqual(self.call('/api/jobs/'+job_id+'/revise',{'text':'Uma abertura menor.'})[0],200)
    def test_same_origin_and_mutation_headers_are_required(self):
        self.assertEqual(self.call('/api/jobs',{}, {'Origin':'https://example.com'})[0],403)
        self.assertEqual(self.call('/api/jobs',{}, {'X-Aera-Client':''})[0],403)
        self.assertEqual(self.call('/api/status',headers={'Host':'attacker.example'})[0],403)
    def test_missing_connection_never_creates_fake_work(self):
        self.server.provider.status=lambda:{'ready':False}
        code,raw=self.call('/api/jobs',{'brief':'Teste','idempotency_key':'missing-connection'})
        self.assertEqual(code,503);self.assertEqual(json.loads(raw)['code'],'not_connected');self.assertFalse(self.server.store.list())


class ProviderContractTests(unittest.TestCase):
    def provider(self):
        provider=ClaudeProvider.__new__(ClaudeProvider)
        provider.key='test-key-not-a-real-api-credential';provider.model='claude-sonnet-5-5';provider.verified=False;provider.lock=threading.RLock()
        return provider
    class Response:
        def __init__(self,data):self.data=data
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,*args):return json.dumps(self.data).encode()
    def test_messages_contract_uses_schema_and_server_side_auth(self):
        provider=self.provider();captured=[]
        def transport(request,**kwargs):
            captured.append(request)
            return self.Response({'id':'msg_fixture','model':provider.model,'stop_reason':'end_turn','content':[{'type':'text','text':'{"ok":true}'}],'usage':{'input_tokens':29,'output_tokens':7}})
        with patch('urllib.request.urlopen',side_effect=transport):
            result=provider.generate('Regras','Referência',schema={'type':'object','additionalProperties':False,'properties':{},'required':[]})
        payload=json.loads(captured[0].data)
        self.assertEqual(captured[0].full_url,'https://api.anthropic.com/v1/messages')
        self.assertEqual(payload['output_config']['format']['type'],'json_schema')
        self.assertEqual(payload['thinking'],{'type':'between_tools'})
        self.assertEqual(result['usage']['output_tokens'],7)
        self.assertNotIn(provider.key,json.dumps(result));self.assertTrue(provider.verified)
    def test_refusal_and_partial_output_never_become_a_delivery(self):
        provider=self.provider()
        for reason,code in [('refusal','refused'),('max_tokens','incomplete_response')]:
            with patch('urllib.request.urlopen',return_value=self.Response({'stop_reason':reason,'content':[{'type':'text','text':'Parcial'}]})):
                with self.assertRaises(OperationError) as raised:provider.generate('Regras','Pedido')
            self.assertEqual(raised.exception.code,code)
    def test_upstream_error_does_not_echo_private_provider_body(self):
        provider=self.provider()
        with patch('urllib.request.urlopen',side_effect=urllib.error.HTTPError('',429,'sensitive-key-and-prompt',None,None)):
            with self.assertRaises(OperationError) as raised:provider.generate('Regras','Pedido')
        self.assertEqual(raised.exception.code,'rate_limit');self.assertNotIn('sensitive',raised.exception.message)


if __name__=='__main__':unittest.main(verbosity=2)
