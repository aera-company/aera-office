"""Recorte 1, gate 4: image executor behind one interface. Fixture writes real files; nothing is ever marked 'gerada' without a file."""
import http.server
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
from office.store import Store
from office.engine import Engine
from office.provider import OperationError
from office.image_provider import FixtureImageProvider,NoImageProvider,MagnificProvider,minimal_png
from office import capabilities
from fixtures import ContentFixture
import serve_demo


class ImageJobTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.runtime=pathlib.Path(self.temp.name);self.store=Store(self.runtime/'office.sqlite3');self.provider=ContentFixture()
        self.images=FixtureImageProvider();self.engine=Engine(self.store,self.provider,None,self.images,self.runtime)
        self.client=self.store.create_client('AERA','');self.store.add_note(self.client['id'],level=1,kind='fato',text='AERA faz estratégia.',source='Tiago')
    def tearDown(self):self.engine.stop();self.store.close();self.temp.cleanup()
    def week(self,key='gate4-week-key-01'):
        job=self.store.create('Semana','',key,client_id=self.client['id'],job_type='conteudo-semana');self.store.claim();self.engine.process(job['id']);self.store.confirm_estimate(job['id']);self.store.claim();self.engine.process(job['id']);return self.store.get(job['id'])
    def test_images_are_generated_per_piece_with_real_files_and_feed_as_reference(self):
        job=self.week()
        self.assertEqual(job['status'],'awaiting_approval');self.assertEqual(len(self.images.calls),9)
        images=[a for a in job['artifacts'] if a['kind']=='imagem'];self.assertEqual(len(images),9);self.assertTrue(all(a['state']=='preview' for a in images))
        for a in images:
            path=pathlib.Path(a['path']);self.assertTrue(path.is_file());self.assertTrue(path.read_bytes().startswith(b'\x89PNG'));self.assertTrue(path.with_suffix('.json').is_file())
        for card in job['cards']:
            self.assertEqual(card['state'],'aguardando');self.assertEqual(card['pending'],'');self.assertTrue(all(p['image_state']=='gerada' and p['artifact_id'] for p in card['pieces']))
        refs=[c['reference'] for c in self.images.calls];self.assertEqual(refs.count(None),3);self.assertTrue(all(r for r in refs if r is not None))
        state=capabilities.with_state(self.engine.registry,provider_ready=True,image_ready=self.engine.image_ready(),running={})
        self.assertEqual({s['id']:s['state'] for s in state['stations']}['john.imagem'],'disponivel')
        job=self.store.card_approve(job['id'],job['cards'][0]['id'])
        self.assertTrue(all(a['state']=='final' for a in job['artifacts'] if a['kind']=='imagem' and a['card_id']==job['cards'][0]['id']))
    def test_without_executor_pieces_stay_pending_and_reconnect_generates_only_pending(self):
        self.engine.image_provider=NoImageProvider();job=self.week('gate4-week-key-02')
        self.assertTrue(all(c['state']=='parcial' and c['pending']=='imagem' for c in job['cards']));self.assertFalse([a for a in job['artifacts'] if a['kind']=='imagem'])
        with self.assertRaises(OperationError):self.engine.generate_images(job['id'])
        self.store.card_discard(job['id'],job['cards'][2]['id'],'fora')
        self.engine.image_provider=FixtureImageProvider();result=self.engine.generate_images(job['id'])
        self.assertEqual((result['generated'],result['failed'],result['pending']),(6,0,0))
        job=self.store.get(job['id']);self.assertEqual([c['state'] for c in job['cards']],['aguardando','aguardando','descartado'])
        self.assertEqual(self.engine.generate_images(job['id'])['generated'],0)
    def test_failure_keeps_piece_pending_with_reason_and_job_continues(self):
        self.images.fail_on='instagram-stories';job=self.week('gate4-week-key-03')
        self.assertEqual(job['status'],'awaiting_approval')
        for card in job['cards']:
            self.assertEqual(card['state'],'parcial');self.assertEqual(card['pending'],'imagem')
            states={p['channel']:p['image_state'] for p in card['pieces']};self.assertEqual(states['instagram-stories'],'pendente');self.assertEqual(states['instagram-feed'],'gerada')
        self.assertTrue(any(e['kind']=='image_pending' and 'Falha de teste' in e['data']['message'] for e in job['events']))
        self.images.fail_on=None;result=self.engine.generate_images(job['id']);self.assertEqual(result['generated'],3)
    def test_image_ceiling_stops_paid_actions(self):
        job=self.store.create('Semana','','gate4-week-key-04',client_id=self.client['id'],job_type='conteudo-semana');self.store.claim();self.engine.process(job['id']);self.store.confirm_estimate(job['id'])
        self.store.update(job['id'],estimate={**self.store.get(job['id'])['estimate'],'images':3});self.store.claim();self.engine.process(job['id'])
        job=self.store.get(job['id']);self.assertEqual(len(self.images.calls),4);self.assertEqual(self.store.image_count(job['id']),4)
        self.assertTrue(any('teto de imagens' in e['data'].get('message','') for e in job['events']))
    def test_minimal_png_is_valid(self):
        data=minimal_png(4,3);self.assertTrue(data.startswith(b'\x89PNG'));self.assertIn(b'IEND',data)


class FakeMcp:
    """Local stand-in for the Magnific MCP server: records calls, answers JSON-RPC. Not the real service."""
    def __enter__(self):
        calls=self.calls=[];png=minimal_png(2,2)
        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self,*a):pass
            def _send(self,status,body,ctype='application/json'):
                self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(body)));self.send_header('Mcp-Session-Id','sess-1');self.end_headers();self.wfile.write(body)
            def do_GET(self):
                if self.path=='/.well-known/oauth-authorization-server':return self._send(200,json.dumps({'authorization_endpoint':'http://x/auth','token_endpoint':'http://127.0.0.1:%d/token'%self.server.server_port,'registration_endpoint':'http://127.0.0.1:%d/register'%self.server.server_port}).encode())
                if self.path=='/file.png':return self._send(200,png,'image/png')
                self._send(404,b'{}')
            def do_POST(self):
                length=int(self.headers.get('Content-Length','0'));raw=self.rfile.read(length)
                if self.path=='/register':return self._send(201,json.dumps({'client_id':'client-test'}).encode())
                if self.path=='/token':return self._send(200,json.dumps({'access_token':'tok','expires_in':300,'refresh_token':'ref'}).encode())
                if self.headers.get('Authorization')!='Bearer tok':return self._send(401,b'{}')
                msg=json.loads(raw);calls.append(msg)
                if msg.get('method')=='initialize':return self._send(200,json.dumps({'jsonrpc':'2.0','id':msg['id'],'result':{'protocolVersion':'2025-06-18'}}).encode())
                if 'id' not in msg:return self._send(202,b'')
                name=msg['params']['name']
                if name=='images_generate':result={'creations':[{'identifier':'cre-1','status':'queued'}]}
                elif name=='creations_wait':result={'results':[{'identifier':'cre-1','status':'completed','url':'http://127.0.0.1:%d/file.png'%self.server.server_port,'seed':7}]}
                else:result={}
                # Answer as SSE to exercise the parser.
                body=('event: message\ndata: '+json.dumps({'jsonrpc':'2.0','id':msg['id'],'result':{'content':[{'type':'text','text':json.dumps(result)}]}})+'\n\n').encode()
                self._send(200,body,'text/event-stream')
        self.server=http.server.HTTPServer(('127.0.0.1',0),H);threading.Thread(target=self.server.serve_forever,daemon=True).start();self.base='http://127.0.0.1:%d'%self.server.server_port;return self
    def __exit__(self,*a):self.server.shutdown();self.server.server_close()


class MagnificTransportTests(unittest.TestCase):
    def provider(self,fake):
        p=MagnificProvider.__new__(MagnificProvider)
        p.root=p.runtime=pathlib.Path('.');p.mcp_url=fake.base+'/mcp';p.auth_server=fake.base;p.model='magnific-one';p.lock=threading.RLock();p.store=None
        p.session_id,p.access_token,p.expires_at,p.refresh_token,p.client_id,p.pending_login='', '',0,'','',None
        p.transport=p._http;return p
    def test_login_flow_and_generation_against_a_local_fake(self):
        with FakeMcp() as fake:
            p=self.provider(fake);self.assertFalse(p.status()['ready'])
            url=p.begin_login('http://127.0.0.1:8080/api/image/callback');self.assertIn('code_challenge_method=S256',url);self.assertIn('client_id=client-test',url)
            with self.assertRaises(OperationError):p.finish_login('abc','wrong-state')
            status=p.finish_login('abc',p.pending_login['state']);self.assertTrue(status['ready']);self.assertEqual(p.refresh_token,'ref')
            result=p.generate('A short prompt about motion','instagram-feed')
            self.assertTrue(result['bytes'].startswith(b'\x89PNG'));self.assertEqual(result['meta']['creation'],'cre-1');self.assertEqual(result['meta']['seed'],7)
            names=[c.get('method') for c in fake.calls];self.assertEqual(names[0],'initialize');self.assertIn('tools/call',names)
            gen=next(c for c in fake.calls if c.get('method')=='tools/call' and c['params']['name']=='images_generate')['params']['arguments']
            self.assertEqual((gen['width'],gen['height'],gen['mode'],gen['count']),(1080,1440,'magnific-one',1));self.assertLessEqual(len(gen['prompt']),300)
            self.assertNotIn('tok',json.dumps(result['meta']))
    def test_status_never_ready_without_token(self):
        with FakeMcp() as fake:
            p=self.provider(fake);self.assertIn('Conecte',p.status()['reason'])
            with self.assertRaises(OperationError) as raised:p.generate('x','instagram-feed')
            self.assertEqual(raised.exception.code,'image_not_connected')


class ImageHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.provider=ContentFixture();self.images=FixtureImageProvider()
        self.server=serve_demo.create_server(0,self.temp.name,self.provider,start_worker=False,image_provider=self.images)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):self.server.shutdown();self.server.server_close();self.server.store.close();self.temp.cleanup()
    def call(self,path,body=None):
        req=urllib.request.Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Aera-Client':'1'})
        try:
            with urllib.request.urlopen(req,timeout=5) as r:return r.status,r.headers.get('Content-Type',''),r.read()
        except urllib.error.HTTPError as e:return e.code,e.headers.get('Content-Type',''),e.read()
    def test_status_file_route_and_pending_generation(self):
        code,ctype,raw=self.call('/api/status');self.assertTrue(json.loads(raw)['image']['fixture'])
        code,ctype,raw=self.call('/api/capabilities');self.assertEqual({s['id']:s['state'] for s in json.loads(raw)['stations']}['john.imagem'],'disponivel')
        client=json.loads(self.call('/api/clients',{'name':'AERA'})[2]);self.call(f'/api/clients/{client["id"]}/notes',{'text':'AERA faz estratégia.'})
        job=json.loads(self.call('/api/jobs',{'brief':'Semana','idempotency_key':'http-image-key','client_id':client['id'],'job_type':'conteudo-semana'})[2])
        self.server.store.claim();self.server.engine.process(job['id']);self.call(f'/api/jobs/{job["id"]}/confirm-estimate',{});self.server.store.claim();self.server.engine.process(job['id'])
        job=json.loads(self.call('/api/jobs/'+job['id'])[2]);art=next(a for a in job['artifacts'] if a['kind']=='imagem')
        code,ctype,raw=self.call(f'/api/artifacts/{art["id"]}/file');self.assertEqual((code,ctype),(200,'image/png'));self.assertTrue(raw.startswith(b'\x89PNG'))
        self.assertEqual(self.call('/api/artifacts/'+'0'*32+'/file')[0],404)
        code,ctype,raw=self.call(f'/api/jobs/{job["id"]}/images',{});self.assertEqual(json.loads(raw)['generated'],0)
        self.assertNotEqual(self.call('/runtime/office.sqlite3')[0],200)


if __name__=='__main__':unittest.main(verbosity=2)
