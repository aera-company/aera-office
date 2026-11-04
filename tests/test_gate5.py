"""Recorte 1, gate 5: activity and summary derived from events, never from timers."""
import datetime
import json
import pathlib
import sys
import tempfile
import threading
import unittest
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
sys.path.insert(0,str(ROOT/'tests'))
from office.store import Store
from office.engine import Engine
from fixtures import ContentFixture
import serve_demo


class ActivityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(pathlib.Path(self.temp.name)/'office.sqlite3');self.provider=ContentFixture();self.engine=Engine(self.store,self.provider)
        self.client=self.store.create_client('AERA','');self.store.add_note(self.client['id'],level=1,kind='fato',text='AERA faz estratégia.',source='Tiago')
    def tearDown(self):self.engine.stop();self.store.close();self.temp.cleanup()
    def test_summary_and_activity_follow_real_events(self):
        start=self.store.summary();self.assertEqual((start['produced'],start['awaiting_approval'],start['missed']),(0,[],[]))
        job=self.store.create('Semana','','gate5-week-key',client_id=self.client['id'],job_type='conteudo-semana');self.store.claim();self.engine.process(job['id'])
        s=self.store.summary();self.assertEqual(s['awaiting_you'][0]['status'],'awaiting_estimate')
        self.store.confirm_estimate(job['id']);self.store.claim();self.engine.process(job['id'])
        s=self.store.summary();self.assertEqual(s['produced'],3);self.assertEqual(len(s['awaiting_approval']),1);self.assertEqual(s['pending_images'],3)
        events=self.store.recent_events();agents=[e['agent'] for e in events if e['agent']]
        self.assertIn('MAYA',agents);self.assertIn('NOA',agents);self.assertTrue(all(e['client']=='AERA' for e in events))
        self.assertTrue(any(e['kind']=='card_ready' and e['done'] for e in events))
        later=self.store.summary(since=datetime.datetime.now(datetime.timezone.utc).isoformat());self.assertEqual(later['produced'],0);self.assertEqual(len(later['awaiting_approval']),1)
    def test_missed_schedule_is_reported_not_run(self):
        past='2020-01-01T00:00:00+00:00'
        later=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1)).isoformat()
        job=self.store.create('Agendado','','gate5-missed-key',later)
        with self.store.db:self.store.db.execute('UPDATE jobs SET execute_at=? WHERE id=?',(past,job['id']))
        s=self.store.summary();self.assertEqual(s['missed'][0]['id'],job['id']);self.assertIn('não rodou',s['note'])


class ActivityHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.provider=ContentFixture();self.server=serve_demo.create_server(0,self.temp.name,self.provider,start_worker=False)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):self.server.shutdown();self.server.server_close();self.server.store.close();self.temp.cleanup()
    def get(self,path):
        with urllib.request.urlopen(urllib.request.Request(self.base+path,headers={'X-Aera-Client':'1'}),timeout=5) as r:return json.loads(r.read())
    def test_routes_answer(self):
        self.assertEqual(self.get('/api/activity')['events'],[]);s=self.get('/api/summary?since=2020-01-01T00:00:00');self.assertIn('note',s);self.assertEqual(s['since'],'2020-01-01T00:00:00')


if __name__=='__main__':unittest.main(verbosity=2)


class TeamCardTests(unittest.TestCase):
    """Cards de atividade (mapa 13.6): client, counts and register per character, from rows and events only."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(pathlib.Path(self.temp.name)/'office.sqlite3');self.provider=ContentFixture();self.engine=Engine(self.store,self.provider)
        self.client=self.store.create_client('AERA','');self.store.add_note(self.client['id'],level=1,kind='fato',text='AERA faz estratégia.',source='Tiago')
    def tearDown(self):self.engine.stop();self.store.close();self.temp.cleanup()
    def test_team_cards_follow_real_rows(self):
        empty=self.store.team_activity()
        self.assertEqual(sorted(empty),sorted(Store.TEAM))
        self.assertEqual(empty['NOA']['client_mode'],'nenhum');self.assertEqual(empty['NOA']['log'],[]);self.assertEqual(empty['ARI']['numbers'][0]['value'],0)
        job=self.store.create('Semana','','team-week-key',client_id=self.client['id'],job_type='conteudo-semana');self.store.claim();self.engine.process(job['id'])
        self.store.confirm_estimate(job['id']);self.store.claim();self.engine.process(job['id'])
        team=self.store.team_activity(image_ready=False)
        noa={n['label']:n['value'] for n in team['NOA']['numbers']}
        self.assertEqual(noa['posts prontos'],3);self.assertEqual(noa['aprovados'],0)
        john={n['label']:n['value'] for n in team['JOHN']['numbers']};self.assertEqual(john['imagens pendentes'],9);self.assertEqual(john['imagens geradas'],0)
        self.assertEqual(team['JOHN']['pending'],['pendente de executor de imagem']);self.assertEqual(team['NOA']['pending'],[]);self.assertEqual(team['NOA']['client'],'AERA');self.assertEqual(team['NOA']['client_mode'],'ultimo')
        self.assertTrue(team['NOA']['log'] and all(e['client']=='AERA' for e in team['NOA']['log']));self.assertTrue(any(e['kind']=='card_ready' and e['done'] for e in team['NOA']['log']))
        maya={n['label']:n['value'] for n in team['MAYA']['numbers']};self.assertEqual(maya['pautas montadas'],1)
        ari={n['label']:n['value'] for n in team['ARI']['numbers']};self.assertEqual(ari['trabalhos coordenados'],1);self.assertEqual(ari['aguardam você'],1);self.assertEqual(team['ARI']['pending'],['1 aguarda você'])
        self.assertEqual(team['LEO']['numbers'],[]);self.assertEqual(team['LEO']['client_mode'],'nenhum')
        with_executor=self.store.team_activity(image_ready=True);self.assertEqual(with_executor['JOHN']['pending'],[])
