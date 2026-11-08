"""NAYRA voice access (C79): the ElevenLabs key stays on the server and each conversation gets a one-time credential."""
import io
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
from office.provider import OperationError
from office.voice import VoiceAccess
from fixtures import ContentFixture
import serve_demo

KEY='sk_'+'a'*40
AGENT='agent_teste123'


class FakeStore:
    def __init__(self,key=''):self.key,self.saved,self.deleted=key,[],0
    def load(self):return self.key
    def save(self,key):self.key=key;self.saved.append(key)
    def delete(self):self.key='';self.deleted+=1


class FakeElevenLabs:
    """Answers like the ElevenLabs conversation endpoints and records what was asked."""
    def __init__(self,status=200,body=b'{}'):self.status,self.body,self.calls=status,body,[]
    def __call__(self,request,timeout=None):
        self.calls.append({'url':request.full_url,'key':request.get_header('Xi-api-key'),'body':json.loads(request.data) if request.data else None})
        if self.status!=200:raise urllib.error.HTTPError(request.full_url,self.status,'erro',{},io.BytesIO(self.body))
        if '/text-to-speech/' in request.full_url:return io.BytesIO(b'ID3-audio-de-teste')
        if '/get-signed-url' in request.full_url:body={'signed_url':'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=x&conversation_signature=s'}
        else:body={'token':'tok-unico','conversation_id':'conv_x'}
        return io.BytesIO(json.dumps(body).encode())


class VoiceAccessTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.runtime=pathlib.Path(self.temp.name)
        (self.runtime/'nayra-agent.json').write_text(json.dumps({'agent_id':AGENT,'voice_id':'voz_teste'}))
    def tearDown(self):self.temp.cleanup()
    def voice(self,key='',status=200):
        self.api=FakeElevenLabs(status);self.store=FakeStore(key)
        return VoiceAccess(ROOT,self.runtime,store=self.store,opener=self.api)

    def test_without_key_falls_back_to_public_agent(self):
        v=self.voice()
        self.assertEqual(v.status(),{'ready':False,'persistence':True})
        self.assertEqual(v.session(),{'agent_id':AGENT,'protected':False,'profile':'apresentacao'})
        self.assertEqual(self.api.calls,[])

    def test_connect_checks_the_key_against_the_agent_and_saves_it(self):
        v=self.voice()
        result=v.connect('  '+KEY+' ')
        self.assertTrue(result['ready']);self.assertEqual(self.store.saved,[KEY])
        self.assertIn('/conversation/token?agent_id='+AGENT,self.api.calls[0]['url']);self.assertEqual(self.api.calls[0]['key'],KEY)

    def test_sessions_carry_one_time_credentials_never_the_key(self):
        v=self.voice(KEY)
        rtc=v.session('webrtc');ws=v.session('websocket')
        self.assertEqual(rtc,{'token':'tok-unico','protected':True,'profile':'apresentacao'})
        self.assertTrue(ws['signed_url'].startswith('wss://'));self.assertTrue(ws['protected'])
        self.assertNotIn(KEY,json.dumps([rtc,ws]))
        self.assertIn('/get-signed-url?agent_id='+AGENT,self.api.calls[1]['url'])

    def test_bad_or_refused_keys_are_not_saved(self):
        v=self.voice()
        with self.assertRaises(OperationError):v.connect('curta')
        with self.assertRaises(OperationError):v.connect('sk_ com espaço '+'a'*30)
        v=self.voice(status=401)
        with self.assertRaises(OperationError) as e:v.connect(KEY)
        self.assertEqual(e.exception.code,'auth_failed');self.assertEqual(self.store.saved,[]);self.assertFalse(v.status()['ready'])
        v=self.voice(status=403)
        with self.assertRaises(OperationError) as e:v.connect(KEY)
        self.assertIn('ElevenLabs Agents',e.exception.message)
        # What ElevenLabs really answers for a malformed key: 400 with an authentication error.
        self.store=FakeStore();self.api=FakeElevenLabs(400,b'{"detail":{"type":"authentication_error","code":"invalid_api_key"}}')
        v=VoiceAccess(ROOT,self.runtime,store=self.store,opener=self.api)
        with self.assertRaises(OperationError) as e:v.connect(KEY)
        self.assertEqual(e.exception.code,'auth_failed');self.assertEqual(self.store.saved,[])
        # A valid key lacking a permission answers 401 too; the message names the permission.
        self.api=FakeElevenLabs(401,b'{"detail":{"type":"authentication_error","status":"missing_permissions","message":"The API key you used is missing the permission convai_read to execute this operation."}}')
        v=VoiceAccess(ROOT,self.runtime,store=self.store,opener=self.api)
        with self.assertRaises(OperationError) as e:v.connect(KEY)
        self.assertIn('ElevenLabs Agents (Read)',e.exception.message);self.assertIn('falta a permissão',e.exception.message)

    def test_disconnect_removes_the_key(self):
        v=self.voice(KEY);v.disconnect()
        self.assertEqual(self.store.deleted,1);self.assertEqual(v.session(),{'agent_id':AGENT,'protected':False,'profile':'apresentacao'})

    def test_briefing_sentence_is_spoken_once_then_cached(self):
        v=self.voice(KEY)
        first=v.speak('  Boa noite,   Tiago. ');second=v.speak('Boa noite, Tiago.')
        self.assertEqual(first,b'ID3-audio-de-teste');self.assertEqual(second,first)
        self.assertEqual(len(self.api.calls),1)  # the repeat came from the cache, no second paid call
        call=self.api.calls[0]
        self.assertIn('/text-to-speech/voz_teste',call['url']);self.assertEqual(call['key'],KEY)
        self.assertEqual(call['body']['text'],'Boa noite, Tiago.');self.assertEqual(call['body']['voice_settings']['stability'],0.75)
        v.speak('Outra frase.');self.assertEqual(len(self.api.calls),2)

    def test_briefing_voice_needs_key_voice_and_sane_text(self):
        with self.assertRaises(OperationError) as e:self.voice().speak('Oi.')
        self.assertEqual(e.exception.code,'not_connected')
        v=self.voice(KEY)
        with self.assertRaises(OperationError):v.speak('')
        with self.assertRaises(OperationError):v.speak('a'*601)
        (self.runtime/'nayra-agent.json').write_text(json.dumps({'agent_id':AGENT}))
        with self.assertRaises(OperationError) as e:v.speak('Oi.')
        self.assertEqual(e.exception.code,'not_found');self.assertEqual(self.api.calls,[])

    def test_agent_follows_the_mode(self):
        # C84: Tiago gets his own agent; presentation keeps the client agent; without a Tiago agent, one serves both.
        v=self.voice()
        self.assertEqual(v.session(tiago=True)['agent_id'],AGENT)
        (self.runtime/'nayra-agent.json').write_text(json.dumps({'agent_id':AGENT,'agent_id_tiago':'agent_tiago','voice_id':'voz_teste'}))
        self.assertEqual(v.session(tiago=True),{'agent_id':'agent_tiago','protected':False,'profile':'tiago'})
        self.assertEqual(v.session(tiago=False),{'agent_id':AGENT,'protected':False,'profile':'apresentacao'})
        v=self.voice(KEY);v.session(tiago=True)
        self.assertIn('agent_id=agent_tiago',self.api.calls[-1]['url'])

    def test_missing_agent_is_reported(self):
        (self.runtime/'nayra-agent.json').unlink();v=self.voice(KEY)
        with self.assertRaises(OperationError) as e:v.session()
        self.assertEqual(e.exception.code,'not_found')


class VoiceHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();runtime=pathlib.Path(self.temp.name)
        (runtime/'nayra-agent.json').write_text(json.dumps({'agent_id':AGENT,'voice_id':'voz_teste'}))
        self.api=FakeElevenLabs();self.store=FakeStore()
        voice=VoiceAccess(ROOT,runtime,store=self.store,opener=self.api)
        self.server=serve_demo.create_server(0,self.temp.name,ContentFixture(),start_worker=False,voice=voice)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base=f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self):self.server.shutdown();self.server.server_close();self.server.store.close();self.temp.cleanup()
    def post(self,path,body,headers=None):
        h={'Content-Type':'application/json','X-Aera-Client':'1'} if headers is None else headers
        with urllib.request.urlopen(urllib.request.Request(self.base+path,data=json.dumps(body).encode(),headers=h,method='POST'),timeout=5) as r:return json.loads(r.read())
    def get(self,path):
        with urllib.request.urlopen(self.base+path,timeout=5) as r:return json.loads(r.read())

    def test_key_flow_over_http(self):
        self.assertEqual(self.post('/api/nayra/voice-session',{'connection':'webrtc'}),{'agent_id':AGENT,'protected':False,'profile':'apresentacao'})
        saved=self.post('/api/nayra/voice-key',{'key':KEY})
        self.assertTrue(saved['ready']);self.assertNotIn(KEY,json.dumps(saved))
        self.assertEqual(self.get('/api/nayra/voice-status'),{'ready':True,'persistence':True})
        self.assertEqual(self.post('/api/nayra/voice-session',{'connection':'webrtc'}),{'token':'tok-unico','protected':True,'profile':'apresentacao'})
        self.assertIn('signed_url',self.post('/api/nayra/voice-session',{'connection':'websocket'}))
        req=urllib.request.Request(self.base+'/api/nayra/speak',data=json.dumps({'text':'Boa noite, Tiago.'}).encode(),headers={'Content-Type':'application/json','X-Aera-Client':'1'},method='POST')
        with urllib.request.urlopen(req,timeout=5) as r:self.assertEqual((r.headers.get_content_type(),r.read()),('audio/mpeg',b'ID3-audio-de-teste'))
        self.assertFalse(self.post('/api/nayra/voice-key-remove',{})['ready'])

    def test_session_needs_the_office_client_header(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.post('/api/nayra/voice-session',{},headers={'Content-Type':'application/json'})
        self.assertEqual(e.exception.code,403)
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.post('/api/nayra/voice-session',{},headers={'Content-Type':'application/json','X-Aera-Client':'1','Origin':'https://exemplo.com'})
        self.assertEqual(e.exception.code,403)


if __name__=='__main__':
    unittest.main()
