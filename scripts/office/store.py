"""SQLite workspace. Completed work and approvals survive browser/server restarts."""
import datetime
import json
import pathlib
import sqlite3
import threading
import uuid
from .provider import OperationError


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def atomic(method):
    def call(self,*args,**kwargs):
        with self.lock:
            return method(self,*args,**kwargs)
    return call


class Store:
    def __init__(self, path):
        path = pathlib.Path(path)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(path, check_same_thread=False)
        path.chmod(0o600)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, brief TEXT NOT NULL, context TEXT NOT NULL,
          status TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL,
          plan TEXT, questions TEXT NOT NULL DEFAULT '[]', answers TEXT NOT NULL DEFAULT '[]',
          feedback TEXT NOT NULL DEFAULT '[]', error TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL DEFAULT 1, cancel_requested INTEGER NOT NULL DEFAULT 0,
          execute_at TEXT, idempotency TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT NOT NULL, job_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
          agent TEXT NOT NULL, zone TEXT NOT NULL, instruction TEXT NOT NULL,
          dependencies TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
          output TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', usage TEXT NOT NULL DEFAULT '{}',
          started TEXT, finished TEXT, PRIMARY KEY(job_id,id)
        );
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
          kind TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS deliveries (
          job_id TEXT NOT NULL, revision INTEGER NOT NULL, text TEXT NOT NULL,
          model TEXT NOT NULL, usage TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
          created TEXT NOT NULL, approved TEXT, PRIMARY KEY(job_id,revision)
        );
        CREATE TABLE IF NOT EXISTS clients (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, site_url TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'rascunho',
          created TEXT NOT NULL, updated TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL, name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '', created TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS materials (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL, project_id TEXT NOT NULL DEFAULT '',
          kind TEXT NOT NULL, name TEXT NOT NULL, origin TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '', extracted TEXT NOT NULL DEFAULT '',
          state TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cards (
          id TEXT PRIMARY KEY, job_id TEXT NOT NULL, ordinal INTEGER NOT NULL, title TEXT NOT NULL,
          owner_agent TEXT NOT NULL, owner_station TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'aguardando',
          version INTEGER NOT NULL DEFAULT 1, pending TEXT NOT NULL DEFAULT '', review TEXT NOT NULL DEFAULT '',
          feedback TEXT NOT NULL DEFAULT '[]', brief TEXT NOT NULL DEFAULT '{}', created TEXT NOT NULL, updated TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS card_items (
          id TEXT PRIMARY KEY, card_id TEXT NOT NULL, version INTEGER NOT NULL, channel TEXT NOT NULL,
          headline TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '',
          visual_direction TEXT NOT NULL DEFAULT '', image_prompt TEXT NOT NULL DEFAULT '',
          image_state TEXT NOT NULL DEFAULT 'pendente', artifact_id TEXT NOT NULL DEFAULT '', created TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY, job_id TEXT NOT NULL, card_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
          path TEXT NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL, show_to_client INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS memory_notes (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL, project_id TEXT NOT NULL DEFAULT '',
          level INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, source TEXT NOT NULL,
          state TEXT NOT NULL, supersedes TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL
        );
        ''')
        # Additive migrations only: existing jobs keep working without a client.
        columns={row[1] for row in self.db.execute('PRAGMA table_info(jobs)')}
        for name,definition in (('execute_at','TEXT'),('client_id',"TEXT NOT NULL DEFAULT ''"),('project_id',"TEXT NOT NULL DEFAULT ''"),('job_type',"TEXT NOT NULL DEFAULT 'pedido'"),
                                ('pauta',"TEXT NOT NULL DEFAULT '[]'"),('estimate',"TEXT NOT NULL DEFAULT '{}'"),('estimate_confirmed','INTEGER NOT NULL DEFAULT 0'),('ceiling','INTEGER NOT NULL DEFAULT 0'),('phase',"TEXT NOT NULL DEFAULT ''")):
            if name not in columns:
                self.db.execute(f'ALTER TABLE jobs ADD COLUMN {name} {definition}')
        self.db.commit()

    def close(self):
        with self.lock:
            self.db.close()

    def _event(self, job_id, kind, data):
        self.db.execute('INSERT INTO events(job_id,kind,data,created) VALUES (?,?,?,?)', (job_id,kind,json.dumps(data,ensure_ascii=False),now()))

    def event(self, job_id, kind, **data):
        with self.lock, self.db:
            self._event(job_id, kind, data)

    # ---- Clients, projects, materials and memory (recorte 1, gate 1) ----
    # Every read of context is filtered by client_id: one client never sees another.
    NOTE_KINDS=('fato','decisao','preferencia','nota')
    NOTE_STATES=('proposto','confirmado','relato','superado','descartado')
    MATERIAL_KINDS=('texto','link','pdf','imagem')

    @staticmethod
    def _text(value, limit, label):
        if not isinstance(value,str) or not value.strip() or len(value)>limit:
            raise OperationError(f'{label} deve ter entre 1 e {limit} caracteres.')
        return value.strip()

    @atomic
    def create_client(self, name, site_url=''):
        name=self._text(name,120,'O nome do cliente')
        if not isinstance(site_url,str) or len(site_url)>2000:
            raise OperationError('O endereço do site é inválido.')
        client_id=uuid.uuid4().hex
        with self.lock, self.db:
            self.db.execute('INSERT INTO clients(id,name,site_url,created,updated) VALUES (?,?,?,?,?)',(client_id,name,site_url.strip(),now(),now()))
        return self.get_client(client_id)

    def list_clients(self):
        with self.lock:
            return [dict(r) for r in self.db.execute('SELECT id,name,site_url,status,summary,created,updated FROM clients ORDER BY name')]

    def get_client(self, client_id):
        with self.lock:
            row=self.db.execute('SELECT * FROM clients WHERE id=?',(client_id,)).fetchone()
            if not row:
                raise OperationError('Cliente não encontrado.', 'not_found', 404)
            client=dict(row)
            client['projects']=[dict(p) for p in self.db.execute('SELECT * FROM projects WHERE client_id=? ORDER BY created',(client_id,))]
            client['materials']=[self._material(m) for m in self.db.execute('SELECT * FROM materials WHERE client_id=? ORDER BY created',(client_id,))]
            client['notes']=[dict(n) for n in self.db.execute('SELECT * FROM memory_notes WHERE client_id=? ORDER BY level,created',(client_id,))]
            return client

    @staticmethod
    def _material(row):
        m=dict(row)
        # The full extracted text stays in the database; the API shows a preview.
        m['preview']=m['extracted'][:600];m['extracted_chars']=len(m['extracted']);m.pop('extracted',None)
        if m['kind']!='texto':m.pop('content',None)
        return m

    @atomic
    def update_client(self, client_id, **values):
        allowed={'name','site_url','summary','status'}
        if not values or set(values)-allowed:
            raise ValueError('Invalid client fields')
        self.get_client(client_id)
        values['updated']=now()
        with self.lock, self.db:
            self.db.execute('UPDATE clients SET '+','.join(k+'=?' for k in values)+' WHERE id=?',(*values.values(),client_id))
        return self.get_client(client_id)

    @atomic
    def create_project(self, client_id, name, description=''):
        self.get_client(client_id)
        name=self._text(name,120,'O nome do projeto')
        if not isinstance(description,str) or len(description)>2000:
            raise OperationError('A descrição do projeto é inválida.')
        project_id=uuid.uuid4().hex
        with self.lock, self.db:
            self.db.execute('INSERT INTO projects(id,client_id,name,description,created) VALUES (?,?,?,?,?)',(project_id,client_id,name,description.strip(),now()))
            return dict(self.db.execute('SELECT * FROM projects WHERE id=?',(project_id,)).fetchone())

    def _project_belongs(self, client_id, project_id):
        if not project_id:return ''
        row=self.db.execute('SELECT id FROM projects WHERE id=? AND client_id=?',(project_id,client_id)).fetchone()
        if not row:
            raise OperationError('Projeto não pertence a este cliente.', 'invalid_request', 400)
        return project_id

    @atomic
    def add_material(self, client_id, *, kind, name, origin, content='', extracted='', state, reason='', project_id=''):
        self.get_client(client_id)
        if kind not in self.MATERIAL_KINDS or state not in ('lido','nao_lido'):
            raise OperationError('Tipo ou estado de material inválido.')
        name=self._text(name,200,'O nome do material')
        if any(not isinstance(v,str) for v in (origin,content,extracted,reason)) or len(content)>60000 or len(extracted)>60000:
            raise OperationError('Material muito extenso para este recorte.')
        material_id=uuid.uuid4().hex
        with self.lock, self.db:
            project_id=self._project_belongs(client_id,project_id)
            self.db.execute('INSERT INTO materials(id,client_id,project_id,kind,name,origin,content,extracted,state,reason,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                (material_id,client_id,project_id,kind,name,origin[:2000],content,extracted,state,reason[:500],now()))
            return self._material(self.db.execute('SELECT * FROM materials WHERE id=?',(material_id,)).fetchone())

    def material_text(self, material_id):
        with self.lock:
            row=self.db.execute('SELECT kind,content,extracted FROM materials WHERE id=?',(material_id,)).fetchone()
            if not row:
                raise OperationError('Material não encontrado.', 'not_found', 404)
            return row['content'] if row['kind']=='texto' else row['extracted']

    @atomic
    def add_note(self, client_id, *, level, kind, text, source, state='confirmado', project_id='', supersedes=''):
        self.get_client(client_id)
        if level not in (1,2) or kind not in self.NOTE_KINDS or state not in self.NOTE_STATES:
            raise OperationError('Nota de memória inválida.')
        text=self._text(text,1200,'A nota')
        source=self._text(source,200,'A origem da nota')
        note_id=uuid.uuid4().hex
        with self.lock, self.db:
            project_id=self._project_belongs(client_id,project_id)
            self.db.execute('INSERT INTO memory_notes(id,client_id,project_id,level,kind,text,source,state,supersedes,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                (note_id,client_id,project_id,level,kind,text,source,state,supersedes,now(),now()))
            return dict(self.db.execute('SELECT * FROM memory_notes WHERE id=?',(note_id,)).fetchone())

    def _note(self, client_id, note_id):
        row=self.db.execute('SELECT * FROM memory_notes WHERE id=? AND client_id=?',(note_id,client_id)).fetchone()
        if not row:
            raise OperationError('Nota não encontrada para este cliente.', 'not_found', 404)
        return dict(row)

    @atomic
    def set_note_state(self, client_id, note_id, state):
        if state not in ('confirmado','descartado'):
            raise OperationError('Estado de nota inválido.')
        with self.lock, self.db:
            note=self._note(client_id,note_id)
            if note['state'] in ('superado',):
                raise OperationError('Uma nota superada não muda de estado.', 'invalid_state', 409)
            self.db.execute('UPDATE memory_notes SET state=?,updated=? WHERE id=?',(state,now(),note_id))
            return self._note(client_id,note_id)

    @atomic
    def supersede_note(self, client_id, note_id, text, source):
        # The previous decision stays on record as superseded; it is never deleted.
        with self.lock, self.db:
            old=self._note(client_id,note_id)
            self.db.execute("UPDATE memory_notes SET state='superado',updated=? WHERE id=?",(now(),note_id))
        return self.add_note(client_id,level=old['level'],kind=old['kind'],text=text,source=source,state='confirmado',project_id=old['project_id'],supersedes=note_id)

    def client_context(self, client_id, project_id='', *, max_material_chars=4000, max_total_chars=16000):
        """Only confirmed facts and this client's materials. Level-2 notes are not loaded here (recorte 1)."""
        with self.lock:
            client=self.db.execute('SELECT id,name,site_url,summary FROM clients WHERE id=?',(client_id,)).fetchone()
            if not client:
                raise OperationError('Cliente não encontrado.', 'not_found', 404)
            notes=self.db.execute("SELECT kind,text,source FROM memory_notes WHERE client_id=? AND level=1 AND state='confirmado' AND (project_id='' OR project_id=?) ORDER BY created",(client_id,project_id or '')).fetchall()
            materials=self.db.execute("SELECT id,name,origin,kind,content,extracted,state,reason FROM materials WHERE client_id=? AND (project_id='' OR project_id=?) ORDER BY created",(client_id,project_id or '')).fetchall()
            project=self.db.execute('SELECT name,description FROM projects WHERE id=? AND client_id=?',(project_id,client_id)).fetchone() if project_id else None
        context={'cliente':client['name'],'site':client['site_url'],'resumo':client['summary'],
                 'projeto':dict(project) if project else None,
                 'fatos_confirmados':[{'tipo':n['kind'],'texto':n['text'],'origem':n['source']} for n in notes[:60]],
                 'materiais':[]}
        budget=max_total_chars
        for m in materials:
            text=(m['content'] if m['kind']=='texto' else m['extracted']) if m['state']=='lido' else ''
            excerpt=text[:min(max_material_chars,budget)] if text else ''
            budget-=len(excerpt)
            context['materiais'].append({'nome':m['name'],'origem':m['origin'],'tipo':m['kind'],'estado':m['state'],'motivo':m['reason'],'trecho':excerpt})
            if budget<=0:break
        return context

    @atomic
    def create(self, brief, context, idempotency, execute_at=None, client_id='', project_id='', job_type='pedido'):
        if not isinstance(brief,str) or not brief.strip() or len(brief)>6000:
            raise OperationError('Descreva um pedido de até 6.000 caracteres.')
        if not isinstance(context,str) or len(context)>16000:
            raise OperationError('O contexto deve ter até 16.000 caracteres.')
        if not isinstance(idempotency,str) or not 12<=len(idempotency)<=100:
            raise OperationError('O identificador do pedido é inválido.')
        if not isinstance(client_id,str) or not isinstance(project_id,str) or not isinstance(job_type,str) or len(job_type)>40:
            raise OperationError('Cliente, projeto ou tipo de pedido inválido.')
        if client_id:
            self.get_client(client_id)
            with self.lock:project_id=self._project_belongs(client_id,project_id)
        elif project_id:
            raise OperationError('Um projeto precisa de um cliente.')
        status='queued'
        if execute_at:
            try:
                scheduled=datetime.datetime.fromisoformat(execute_at.replace('Z','+00:00'))
                current=datetime.datetime.now(datetime.timezone.utc)
                if scheduled.tzinfo is None or scheduled>current+datetime.timedelta(days=31) or scheduled<current-datetime.timedelta(minutes=1):raise ValueError()
                execute_at=scheduled.astimezone(datetime.timezone.utc).isoformat()
                if scheduled>current:status='scheduled'
            except (ValueError,AttributeError,TypeError):
                raise OperationError('Escolha um horário com fuso válido, até 31 dias à frente.') from None
        with self.lock, self.db:
            row = self.db.execute('SELECT id FROM jobs WHERE idempotency=?',(idempotency,)).fetchone()
            if row:
                existing=self.get(row['id'])
                if existing['brief']!=brief.strip() or existing['context']!=context.strip() or existing.get('execute_at')!=execute_at:
                    raise OperationError('Este identificador já foi usado para outro pedido.', 'idempotency_conflict', 409)
                return existing
            queued = self.db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','scheduled','planning','running','reviewing','revision_queued','canceling')").fetchone()[0]
            if queued>=20:
                raise OperationError('A fila já tem 20 trabalhos. Aguarde ou cancele um deles.', 'queue_full', 409)
            job_id = uuid.uuid4().hex
            self.db.execute('INSERT INTO jobs(id,title,brief,context,status,created,updated,idempotency,execute_at,client_id,project_id,job_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                (job_id,brief.strip()[:65],brief.strip(),context.strip(),status,now(),now(),idempotency,execute_at,client_id,project_id,job_type or 'pedido'))
            self._event(job_id,'received',{'agent':'ARI','message':'Pedido recebido e guardado na fila.'})
            return self.get(job_id)

    def get(self, job_id):
        with self.lock:
            row = self.db.execute('SELECT * FROM jobs WHERE id=?',(job_id,)).fetchone()
            if not row:
                raise OperationError('Trabalho não encontrado.', 'not_found', 404)
            job = dict(row)
            for key in ('plan','questions','answers','feedback','pauta','estimate'):
                job[key] = json.loads(job[key]) if job[key] is not None else None
            job.pop('idempotency',None)
            job['cancel_requested'] = bool(job['cancel_requested']);job['estimate_confirmed']=bool(job['estimate_confirmed'])
            client=self.db.execute('SELECT name FROM clients WHERE id=?',(job['client_id'],)).fetchone() if job['client_id'] else None
            job['client_name']=client['name'] if client else ''
            job['calls_made']=self.db.execute("SELECT count(*) FROM events WHERE job_id=? AND kind='model_response'",(job_id,)).fetchone()[0]
            job['cards']=[self._card(c) for c in self.db.execute('SELECT * FROM cards WHERE job_id=? ORDER BY ordinal',(job_id,))]
            job['artifacts']=[dict(a) for a in self.db.execute('SELECT * FROM artifacts WHERE job_id=? ORDER BY created',(job_id,))]
            job['tasks'] = []
            for task in self.db.execute('SELECT * FROM tasks WHERE job_id=? ORDER BY ordinal',(job_id,)):
                t=dict(task)
                t['dependencies']=json.loads(t['dependencies']);t['usage']=json.loads(t['usage'])
                job['tasks'].append(t)
            job['events']=[{**dict(e),'data':json.loads(e['data'])} for e in self.db.execute('SELECT * FROM events WHERE job_id=? ORDER BY id',(job_id,))]
            job['deliveries']=[{**dict(d),'usage':json.loads(d['usage'])} for d in self.db.execute('SELECT * FROM deliveries WHERE job_id=? ORDER BY revision',(job_id,))]
            return job

    @staticmethod
    def _scope(client_id, alias='j'):
        # Presentation mode (C51): reads limited to one client. No client_id means the whole office, as before.
        return (f' AND {alias}.client_id=?',(client_id,)) if client_id else ('',())

    def running_by_character(self, client_id=None):
        """Tasks in execution right now, grouped by character. The 3D and the list read the same answer."""
        w,a=self._scope(client_id)
        with self.lock:
            rows=self.db.execute("SELECT t.agent,t.id AS task_id,t.job_id,t.instruction,j.job_type,j.client_id,j.title FROM tasks t JOIN jobs j ON j.id=t.job_id WHERE t.status='running'"+w+" ORDER BY t.started",a).fetchall()
            planning=self.db.execute("SELECT id,job_type,client_id,title,status,phase FROM jobs j WHERE status IN ('planning','reviewing','running','em_sessao')"+w,a).fetchall()
        out={}
        for r in rows:
            out.setdefault(r['agent'],[]).append({'job_id':r['job_id'],'task_id':r['task_id'],'job_type':r['job_type'],'client_id':r['client_id'],'title':r['title'],'instruction':r['instruction'][:200]})
        for r in planning:
            # Card jobs have no task rows: the phase says who is working (pauta → MAYA, post → NOA, review → ARI).
            phase=r['phase'] or ''
            if r['status']=='em_sessao':
                # A Claude Code session says who is working through the bridge (scripts/nayra.py): phase 'agent:NOA'.
                agent=phase.split(':',1)[1] if phase.startswith('agent:') else ''
                if agent in self.TEAM:out.setdefault(agent,[]).append({'job_id':r['id'],'task_id':phase,'job_type':r['job_type'],'client_id':r['client_id'],'title':r['title'],'instruction':'Em sessão no Claude Code'})
                continue
            if r['status']=='running' and not phase:continue
            agent,label=('ARI','Planejando') if r['status']=='planning' else ('ARI','Revisando') if r['status']=='reviewing' or phase=='review' else ('MAYA','Montando a pauta') if phase=='pauta' else ('NOA','Produzindo o post '+phase.split(':')[-1]) if phase.startswith('post') else ('JOHN','Gerando imagens do post '+phase.split(':')[-1]) if phase.startswith('image') else ('ARI','')
            if not label:continue
            out.setdefault(agent,[]).append({'job_id':r['id'],'task_id':phase or r['status'],'job_type':r['job_type'],'client_id':r['client_id'],'title':r['title'],'instruction':label})
        return out

    # ---- Activity and summary (recorte 1, gate 5): derived from events only, never from timers. ----
    def recent_events(self, limit=80, since='', client_id=None):
        w,a=self._scope(client_id)
        with self.lock:
            rows=self.db.execute('SELECT e.id,e.job_id,e.kind,e.data,e.created,j.title,j.client_id,j.job_type FROM events e JOIN jobs j ON j.id=e.job_id WHERE e.created>?'+w+' ORDER BY e.id DESC LIMIT ?',(since or '',*a,limit)).fetchall()
            clients={r['id']:r['name'] for r in self.db.execute('SELECT id,name FROM clients')}
        out=[]
        for r in rows:
            data=json.loads(r['data'])
            out.append({'id':r['id'],'job_id':r['job_id'],'job_title':r['title'],'job_type':r['job_type'],'client':clients.get(r['client_id'],''),'kind':r['kind'],'agent':data.get('agent',''),'zone':data.get('zone',''),'message':data.get('message',''),'created':r['created'],
                        'done':r['kind'] in ('task_completed','card_ready','cards_ready','delivery_ready','pauta_ready','card_approved','approved','estimate_ready','input_received','estimate_confirmed')})
        return out

    TEAM=('ARI','MAYA','NOA','JOHN','LEO','NINA')

    def team_activity(self, limit=8, image_ready=False, client_id=None):
        """Per character: active client, counts and the last events. Everything comes from rows and events; nothing is guessed."""
        w,a=self._scope(client_id)
        with self.lock:
            events=[dict(r) for r in self.db.execute('SELECT e.id,e.job_id,e.kind,e.data,e.created,j.title,j.client_id FROM events e JOIN jobs j ON j.id=e.job_id WHERE 1=1'+w+' ORDER BY e.id DESC',a)]
            clients={r['id']:r['name'] for r in self.db.execute('SELECT id,name FROM clients')}
            jobs=[dict(r) for r in self.db.execute('SELECT id,status,client_id FROM jobs j WHERE 1=1'+w,a)]
            tasks_done={r['agent']:r['n'] for r in self.db.execute("SELECT t.agent,count(*) AS n FROM tasks t JOIN jobs j ON j.id=t.job_id WHERE t.status='done'"+w+" GROUP BY t.agent",a)}
            approved=self.db.execute("SELECT count(*) FROM cards c JOIN jobs j ON j.id=c.job_id WHERE c.state='aprovado'"+w,a).fetchone()[0]
            versions=self.db.execute("SELECT coalesce(sum(c.version),0) FROM cards c JOIN jobs j ON j.id=c.job_id WHERE c.state<>'descartado'"+w,a).fetchone()[0]
            images_done=self.db.execute("SELECT count(*) FROM card_items ci JOIN cards c ON c.id=ci.card_id JOIN jobs j ON j.id=c.job_id WHERE ci.version=c.version AND ci.image_state='gerada' AND c.state<>'descartado'"+w,a).fetchone()[0]
            images_pending=self.db.execute("SELECT count(*) FROM card_items ci JOIN cards c ON c.id=ci.card_id JOIN jobs j ON j.id=c.job_id WHERE ci.version=c.version AND ci.image_state<>'gerada' AND c.state<>'descartado'"+w,a).fetchone()[0]
        running=self.running_by_character(client_id)
        done_kinds=('task_completed','card_ready','cards_ready','delivery_ready','pauta_ready','card_approved','approved','estimate_ready','input_received','estimate_confirmed')
        per={name:[] for name in self.TEAM}
        for e in events:
            data=json.loads(e['data']);agent=data.get('agent','')
            if agent in per:per[agent].append({**e,'data':data})
        awaiting_you=sum(1 for j in jobs if j['status'] in ('awaiting_approval','needs_input','awaiting_estimate'))
        failed=sum(1 for j in jobs if j['status'] in ('failed','interrupted'))
        out={}
        for name in self.TEAM:
            mine=per[name];kinds=[e['kind'] for e in mine]
            numbers=[]
            if name=='ARI':
                numbers=[('trabalhos coordenados',len({e['job_id'] for e in mine})),('revisões',kinds.count('reviewing')),('aguardam você',awaiting_you)]
            elif name=='MAYA':
                numbers=[('pautas montadas',sum(1 for e in mine if e['kind']=='task_completed' and e['data'].get('task_id')=='pauta'))]
            elif name=='NOA':
                numbers=[('posts prontos',kinds.count('card_ready')),('aprovados',approved)]
            elif name=='JOHN':
                numbers=[('imagens geradas',images_done),('imagens pendentes',images_pending)]
            if tasks_done.get(name):numbers.append(('tarefas concluídas',tasks_done[name]))
            if name=='NOA' and versions:numbers.append(('versões',versions))
            pending=[]
            if name=='JOHN' and images_pending and not image_ready:pending.append('pendente de executor de imagem')
            if name=='ARI' and awaiting_you:pending.append(f'{awaiting_you} {"aguarda" if awaiting_you==1 else "aguardam"} você')
            if name=='ARI' and failed:pending.append(f'bloqueado: {failed} com falha ou interrompido')
            active=running.get(name,[])
            client=clients.get(active[0]['client_id'],'') if active else ''
            last_client=next((clients.get(e['client_id'],'') for e in mine if e['client_id']),'')
            log=[{'created':e['created'],'kind':e['kind'],'message':e['data'].get('message') or e['kind'],'client':clients.get(e['client_id'],''),'job_id':e['job_id'],'job_title':e['title'],'done':e['kind'] in done_kinds} for e in mine[:limit]]
            out[name]={'client':client or last_client,'client_mode':'ativo' if client else ('ultimo' if last_client else 'nenhum'),
                       'numbers':[{'label':l,'value':v} for l,v in numbers],'pending':pending,'log':log,'events_total':len(mine)}
        return out

    def summary(self, since='', client_id=None):
        """What happened since a moment: produced, awaiting, pending, failed, scheduled that did not run. Counts only."""
        since=since or ''
        w,a=self._scope(client_id)
        with self.lock:
            jobs=[dict(r) for r in self.db.execute('SELECT id,title,status,execute_at,updated,job_type,client_id FROM jobs j WHERE 1=1'+w+' ORDER BY updated DESC',a)]
            events=[dict(r) for r in self.db.execute('SELECT e.kind,e.job_id,e.created FROM events e JOIN jobs j ON j.id=e.job_id WHERE e.created>?'+w,(since,*a))]
            pending=self.db.execute("SELECT count(*) FROM cards c JOIN jobs j ON j.id=c.job_id WHERE c.state='parcial' AND c.pending<>''"+w,a).fetchone()[0]
            clients={r['id']:r['name'] for r in self.db.execute('SELECT id,name FROM clients')}
        kinds=[e['kind'] for e in events]
        current=now()
        missed=[{'id':j['id'],'title':j['title'],'execute_at':j['execute_at']} for j in jobs if j['status']=='scheduled' and j['execute_at'] and j['execute_at']<current]
        return {'since':since,'now':current,
                'produced':kinds.count('card_ready')+kinds.count('delivery_ready'),
                'approved':kinds.count('card_approved')+kinds.count('approved'),
                'awaiting_approval':[{'id':j['id'],'title':j['title'],'client':clients.get(j['client_id'],'')} for j in jobs if j['status']=='awaiting_approval'],
                'awaiting_you':[{'id':j['id'],'title':j['title'],'status':j['status'],'client':clients.get(j['client_id'],'')} for j in jobs if j['status'] in ('needs_input','awaiting_estimate')],
                'pending_images':pending,
                'failed':[{'id':j['id'],'title':j['title'],'status':j['status']} for j in jobs if j['status'] in ('failed','interrupted')],
                'scheduled':[{'id':j['id'],'title':j['title'],'execute_at':j['execute_at']} for j in jobs if j['status']=='scheduled' and j['execute_at']>=current],
                'missed':missed,
                'note':'Jobs agendados só rodam com o servidor ligado e o Mac acordado. Um agendamento vencido sem execução aparece em "não rodou".'}

    # ---- Cards (recorte 1, gate 3): the unit of approval. One card per post; pieces per channel. ----
    CARD_STATES=('aguardando','parcial','aprovado','ajuste','descartado','superado')

    def _card(self, row):
        card=dict(row);card['feedback']=json.loads(card['feedback']);card['brief']=json.loads(card['brief'])
        card['items']=[dict(i) for i in self.db.execute('SELECT * FROM card_items WHERE card_id=? ORDER BY version,created',(card['id'],))]
        card['pieces']=[i for i in card['items'] if i['version']==card['version']]
        return card

    def save_content_plan(self, job_id, plan, estimate):
        """Plan accepted; the job waits for the cost confirmation before any further call (C20)."""
        with self.lock, self.db:
            self.db.execute("UPDATE jobs SET plan=?,questions='[]',title=?,estimate=?,ceiling=?,status='awaiting_estimate',phase='',updated=? WHERE id=?",
                (json.dumps(plan,ensure_ascii=False),plan['title'],json.dumps(estimate,ensure_ascii=False),int(estimate.get('ceiling_calls',0)),now(),job_id))
            self._event(job_id,'estimate_ready',{'agent':'ARI','message':plan['summary'],'estimate':estimate})

    @atomic
    def confirm_estimate(self, job_id):
        job=self.get(job_id)
        if job['status']!='awaiting_estimate':
            raise OperationError('Este trabalho não está aguardando confirmação de custo.', 'invalid_state', 409)
        self.update(job_id,estimate_confirmed=1,status='queued',error='')
        self.event(job_id,'estimate_confirmed',message='Estimativa confirmada pelo usuário. A produção começa.')
        return self.get(job_id)

    def save_pauta(self, job_id, posts, owner_agent='NOA', owner_station='noa.texto'):
        with self.lock, self.db:
            self.db.execute("UPDATE jobs SET pauta=?,phase='',updated=? WHERE id=?",(json.dumps(posts,ensure_ascii=False),now(),job_id))
            self.db.execute('DELETE FROM cards WHERE job_id=?',(job_id,))
            for i,post in enumerate(posts,1):
                self.db.execute('INSERT INTO cards(id,job_id,ordinal,title,owner_agent,owner_station,brief,created,updated) VALUES (?,?,?,?,?,?,?,?,?)',
                    (uuid.uuid4().hex,job_id,i,post['title'][:120],owner_agent,owner_station,json.dumps(post,ensure_ascii=False),now(),now()))
            self._event(job_id,'pauta_ready',{'agent':'MAYA','zone':'think','message':f'Pauta com {len(posts)} posts. Cada post vira um cartão para sua aprovação.','posts':[p['title'] for p in posts]})

    def card_set_pieces(self, job_id, card_id, pieces, *, pending='imagem'):
        with self.lock, self.db:
            card=self.db.execute('SELECT version FROM cards WHERE id=? AND job_id=?',(card_id,job_id)).fetchone()
            if not card:raise OperationError('Cartão não encontrado.', 'not_found', 404)
            for piece in pieces:
                self.db.execute('INSERT INTO card_items(id,card_id,version,channel,headline,text,caption,visual_direction,image_prompt,image_state,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    (uuid.uuid4().hex,card_id,card['version'],piece['channel'],piece.get('headline',''),piece.get('text',''),piece.get('caption',''),piece.get('visual_direction',''),piece.get('image_prompt',''),'pendente',now()))
            self.db.execute("UPDATE cards SET state=?,pending=?,updated=? WHERE id=?",('parcial' if pending else 'aguardando',pending,now(),card_id))

    # ---- Images (gate 4): a piece is 'gerada' only when an artifact file exists ----
    def pending_pieces(self, job_id):
        """Pieces of the current version still without an image, on cards that are not discarded."""
        with self.lock:
            rows=self.db.execute("SELECT i.*,c.ordinal,c.version AS card_version,c.state AS card_state,c.title FROM card_items i JOIN cards c ON c.id=i.card_id WHERE c.job_id=? AND i.version=c.version AND i.image_state<>'gerada' AND c.state IN ('parcial','aguardando','aprovado') ORDER BY c.ordinal,i.created",(job_id,)).fetchall()
            return [dict(r) for r in rows]

    def image_count(self, job_id):
        with self.lock:
            return self.db.execute("SELECT count(*) FROM artifacts WHERE job_id=? AND kind='imagem'",(job_id,)).fetchone()[0]

    def add_image_artifact(self, job_id, card_id, item_id, path, version, *, model='', meta=None):
        with self.lock, self.db:
            artifact_id=uuid.uuid4().hex
            self.db.execute('INSERT INTO artifacts(id,job_id,card_id,kind,path,version,state,created) VALUES (?,?,?,?,?,?,?,?)',(artifact_id,job_id,card_id,'imagem',path,version,'preview',now()))
            self.db.execute("UPDATE card_items SET image_state='gerada',artifact_id=? WHERE id=?",(artifact_id,item_id))
            remaining=self.db.execute("SELECT count(*) FROM card_items i JOIN cards c ON c.id=i.card_id WHERE c.id=? AND i.version=c.version AND i.image_state<>'gerada'",(card_id,)).fetchone()[0]
            if remaining==0:
                self.db.execute("UPDATE cards SET pending='',state=CASE WHEN state='parcial' THEN 'aguardando' ELSE state END,updated=? WHERE id=?",(now(),card_id))
                state=self.db.execute('SELECT state FROM cards WHERE id=?',(card_id,)).fetchone()[0]
                if state=='aprovado':self.db.execute("UPDATE artifacts SET state='final' WHERE card_id=? AND kind='imagem'",(card_id,))
            self._event(job_id,'image_generated',{'agent':'JOHN','zone':'create','card_id':card_id,'artifact_id':artifact_id,'message':f'Imagem gerada ({model or "executor"}) e gravada no disco.','meta':meta or {}})
            return artifact_id

    def image_failed(self, job_id, card_id, item_id, reason):
        with self.lock, self.db:
            self.db.execute("UPDATE card_items SET image_state='pendente' WHERE id=?",(item_id,))
            self.db.execute("UPDATE cards SET pending='imagem',updated=? WHERE id=? AND state IN ('parcial','aguardando')",(now(),card_id))
            self.db.execute("UPDATE cards SET state='parcial' WHERE id=? AND state='aguardando'",(card_id,))
            self._event(job_id,'image_pending',{'agent':'JOHN','zone':'create','card_id':card_id,'message':'Imagem continua pendente: '+reason[:200]})

    def get_artifact(self, artifact_id):
        with self.lock:
            row=self.db.execute('SELECT * FROM artifacts WHERE id=?',(artifact_id,)).fetchone()
            if not row:raise OperationError('Arquivo não encontrado.', 'not_found', 404)
            return dict(row)

    def card_set_review(self, job_id, reviews):
        with self.lock, self.db:
            for review in reviews:
                self.db.execute('UPDATE cards SET review=?,updated=? WHERE job_id=? AND ordinal=?',(review.get('notes','')[:1500],now(),job_id,review['ordinal']))

    def _card_row(self, job_id, card_id):
        row=self.db.execute('SELECT * FROM cards WHERE id=? AND job_id=?',(card_id,job_id)).fetchone()
        if not row:raise OperationError('Cartão não encontrado neste trabalho.', 'not_found', 404)
        return row

    def _settle_job(self, job_id):
        states=[r[0] for r in self.db.execute('SELECT state FROM cards WHERE job_id=?',(job_id,))]
        if states and all(s in ('aprovado','descartado') for s in states):
            self.db.execute("UPDATE jobs SET status='approved',updated=? WHERE id=?",(now(),job_id))
            self._event(job_id,'approved',{'message':'Todos os cartões foram decididos. Nenhuma publicação externa executada.'})

    @atomic
    def card_approve(self, job_id, card_id, writer=None):
        """Approving a card freezes its version and writes the real files. Images stay pending until an executor exists."""
        job=self.get(job_id)
        if job['status'] not in ('awaiting_approval','approved'):
            raise OperationError('Aguarde os cartões ficarem prontos antes de aprovar.', 'invalid_state', 409)
        with self.lock, self.db:
            row=self._card_row(job_id,card_id)
            if row['state'] not in ('parcial','aguardando'):
                raise OperationError('Este cartão não está aguardando decisão.', 'invalid_state', 409)
            card=self._card(row)
            if not card['pieces']:
                raise OperationError('Este cartão ainda não tem peças produzidas.', 'invalid_state', 409)
            paths=writer(job,card) if writer else []
            for path in paths:
                self.db.execute('INSERT INTO artifacts(id,job_id,card_id,kind,path,version,state,created) VALUES (?,?,?,?,?,?,?,?)',(uuid.uuid4().hex,job_id,card_id,'texto',path,card['version'],'final',now()))
            # Preview images of the approved version become final; nothing is regenerated.
            self.db.execute("UPDATE artifacts SET state='final' WHERE card_id=? AND kind='imagem' AND version=?",(card_id,card['version']))
            self.db.execute("UPDATE cards SET state='aprovado',updated=? WHERE id=?",(now(),card_id))
            self._event(job_id,'card_approved',{'card_id':card_id,'ordinal':card['ordinal'],'version':card['version'],'message':f'Post {card["ordinal"]} aprovado na versão {card["version"]}.'+(' Imagem segue pendente.' if card['pending'] else ''),'files':paths})
            self._settle_job(job_id)
        if job['client_id']:
            self.add_note(job['client_id'],level=2,kind='nota',text=f'Semana: post "{card["title"]}" aprovado (v{card["version"]}).',source='Escritório, aprovação de cartão',state='confirmado',project_id=job.get('project_id',''))
        return self.get(job_id)

    @atomic
    def card_discard(self, job_id, card_id, reason=''):
        job=self.get(job_id)
        if job['status'] not in ('awaiting_approval','approved'):
            raise OperationError('Aguarde os cartões ficarem prontos antes de descartar.', 'invalid_state', 409)
        with self.lock, self.db:
            row=self._card_row(job_id,card_id)
            if row['state'] in ('aprovado','descartado'):
                raise OperationError('Este cartão já foi decidido.', 'invalid_state', 409)
            self.db.execute("UPDATE cards SET state='descartado',updated=? WHERE id=?",(now(),card_id))
            self._event(job_id,'card_discarded',{'card_id':card_id,'ordinal':row['ordinal'],'message':f'Post {row["ordinal"]} descartado.'+(' Motivo: '+reason[:300] if reason else '')})
            self._settle_job(job_id)
        if job['client_id']:
            self.add_note(job['client_id'],level=2,kind='nota',text=f'Semana: post "{row["title"]}" descartado.'+(' Motivo: '+reason[:300] if reason else ''),source='Escritório, descarte de cartão',state='confirmado',project_id=job.get('project_id',''))
        return self.get(job_id)

    @atomic
    def card_revise(self, job_id, card_id, text):
        """The adjustment goes back to the card's owner station; other cards do not change."""
        job=self.get(job_id)
        if job['status'] not in ('awaiting_approval','approved'):
            raise OperationError('Aguarde os cartões ficarem prontos antes de pedir um ajuste.', 'invalid_state', 409)
        if not isinstance(text,str) or not text.strip() or len(text)>4000:
            raise OperationError('Descreva o ajuste com até 4.000 caracteres.')
        with self.lock, self.db:
            row=self._card_row(job_id,card_id)
            if row['state'] not in ('parcial','aguardando','aprovado'):
                raise OperationError('Este cartão não pode receber ajuste.', 'invalid_state', 409)
            feedback=json.loads(row['feedback'])+[{'version':row['version']+1,'text':text.strip(),'created':now()}]
            self.db.execute("UPDATE cards SET state='ajuste',version=version+1,feedback=?,updated=? WHERE id=?",(json.dumps(feedback,ensure_ascii=False),now(),card_id))
            self.db.execute("UPDATE jobs SET status='revision_queued',updated=?,error='' WHERE id=?",(now(),job_id))
            self._event(job_id,'card_revision_requested',{'agent':'ARI','zone':'control','card_id':card_id,'ordinal':row['ordinal'],'owner':row['owner_agent'],'message':f'Ajuste do post {row["ordinal"]} encaminhado a {row["owner_agent"]}: {text.strip()[:200]}'})
        return self.get(job_id)

    def cards_awaiting_revision(self, job_id):
        with self.lock:
            return [self._card(r) for r in self.db.execute("SELECT * FROM cards WHERE job_id=? AND state='ajuste' ORDER BY ordinal",(job_id,))]

    def cards_without_pieces(self, job_id):
        with self.lock:
            return [c for c in (self._card(r) for r in self.db.execute("SELECT * FROM cards WHERE job_id=? AND state='aguardando' ORDER BY ordinal",(job_id,))) if not c['pieces']]

    def list(self, client_id=None):
        w,a=self._scope(client_id)
        with self.lock:
            return [dict(r) for r in self.db.execute('SELECT id,title,status,created,updated,revision,error,execute_at,client_id,project_id,job_type FROM jobs j WHERE 1=1'+w+' ORDER BY created DESC LIMIT 100',a)]

    def update(self, job_id, **values):
        allowed={'title','status','plan','questions','answers','feedback','error','revision','cancel_requested','pauta','estimate','estimate_confirmed','ceiling','phase'}
        if not values or set(values)-allowed:
            raise ValueError('Invalid update fields')
        values={k:json.dumps(v,ensure_ascii=False) if k in ('plan','questions','answers','feedback','pauta','estimate') else v for k,v in values.items()}
        values['updated']=now()
        with self.lock, self.db:
            self.db.execute('UPDATE jobs SET '+','.join(k+'=?' for k in values)+' WHERE id=?',(*values.values(),job_id))

    def claim(self):
        with self.lock, self.db:
            self.db.execute("UPDATE jobs SET status='queued' WHERE status='scheduled' AND execute_at<=?",(now(),))
            row=self.db.execute("SELECT id,status FROM jobs WHERE status IN ('queued','revision_queued') ORDER BY created LIMIT 1").fetchone()
            if not row:
                return None
            changed=self.db.execute("UPDATE jobs SET status=?,updated=? WHERE id=? AND status IN ('queued','revision_queued')",('reviewing' if row['status']=='revision_queued' else 'planning',now(),row['id'])).rowcount
            return self.get(row['id']) if changed else None

    def save_plan(self, job_id, plan, roles):
        with self.lock, self.db:
            self.db.execute("UPDATE jobs SET plan=?,questions='[]',title=?,status='running',updated=? WHERE id=?",(json.dumps(plan,ensure_ascii=False),plan['title'],now(),job_id))
            for i,t in enumerate(plan['tasks']):
                self.db.execute('INSERT INTO tasks(id,job_id,ordinal,agent,zone,instruction,dependencies) VALUES (?,?,?,?,?,?,?)',
                    (t['id'],job_id,i,t['agent'],roles[t['agent']]['zone'],t['instruction'],json.dumps(t['depends_on'])))
            self._event(job_id,'plan_ready',{'agent':'ARI','message':plan['summary'],'tasks':len(plan['tasks'])})

    def task_start(self, job_id, task_id):
        with self.lock, self.db:
            self.db.execute("UPDATE tasks SET status='running',started=? WHERE job_id=? AND id=?",(now(),job_id,task_id))

    def task_done(self, job_id, task_id, result):
        with self.lock, self.db:
            self.db.execute("UPDATE tasks SET status='done',output=?,model=?,usage=?,finished=? WHERE job_id=? AND id=?",(result['text'],result['model'],json.dumps(result['usage']),now(),job_id,task_id))

    def deliver(self, job_id, result):
        job=self.get(job_id)
        with self.lock, self.db:
            self.db.execute('INSERT INTO deliveries(job_id,revision,text,model,usage,created) VALUES (?,?,?,?,?,?)',
                (job_id,job['revision'],result['text'],result['model'],json.dumps(result['usage']),now()))
            self.db.execute("UPDATE jobs SET status='awaiting_approval',updated=?,error='' WHERE id=?",(now(),job_id))
            self._event(job_id,'delivery_ready',{'agent':'ARI','message':'Entrega reunida. Aguardando sua revisão.','revision':job['revision']})

    @atomic
    def answer(self, job_id, text):
        job=self.get(job_id)
        if job['status']!='needs_input':
            raise OperationError('Este trabalho não está aguardando respostas.', 'invalid_state', 409)
        if not isinstance(text,str) or not text.strip() or len(text)>6000:
            raise OperationError('Responda com até 6.000 caracteres.')
        answers=job['answers']+[{'questions':job['questions'],'answer':text.strip()}]
        if len(answers)>4:
            raise OperationError('O briefing precisa ser reformulado em um novo pedido.', 'too_many_rounds', 409)
        self.update(job_id,answers=answers,plan=None,questions=[],status='queued',error='')
        self.event(job_id,'input_received',agent='ARI',message='Respostas recebidas. O planejamento será atualizado.')
        return self.get(job_id)

    @atomic
    def approve(self, job_id):
        with self.lock, self.db:
            job=self.get(job_id)
            if job['status']!='awaiting_approval' or not job['deliveries']:
                raise OperationError('Somente uma entrega pronta pode ser aprovada.', 'invalid_state', 409)
            self.db.execute("UPDATE deliveries SET status='approved',approved=? WHERE job_id=? AND revision=?",(now(),job_id,job['revision']))
            self.db.execute("UPDATE jobs SET status='approved',updated=? WHERE id=?",(now(),job_id))
            self._event(job_id,'approved',{'message':'Entrega aprovada pelo usuário. Nenhuma publicação externa executada.','revision':job['revision']})
            return self.get(job_id)

    @atomic
    def revise(self, job_id, text):
        job=self.get(job_id)
        if job['status'] not in ('awaiting_approval','approved'):
            raise OperationError('Aguarde uma entrega antes de pedir um ajuste.', 'invalid_state', 409)
        if not isinstance(text,str) or not text.strip() or len(text)>4000:
            raise OperationError('Descreva o ajuste com até 4.000 caracteres.')
        feedback=job['feedback']+[{'revision':job['revision']+1,'text':text.strip()}]
        self.update(job_id,status='revision_queued',revision=job['revision']+1,feedback=feedback,error='')
        self.event(job_id,'revision_requested',agent='ARI',message=text.strip())
        return self.get(job_id)

    @atomic
    def cancel(self, job_id):
        job=self.get(job_id)
        if job['status'] in ('approved','canceled'):
            raise OperationError('Este trabalho já foi encerrado.', 'invalid_state', 409)
        active=job['status'] in ('planning','running','reviewing','canceling')
        self.update(job_id,status='canceling' if active else 'canceled',cancel_requested=1)
        self.event(job_id,'cancel_requested',message='Cancelamento solicitado. Uma chamada já enviada poderá concluir antes da parada.')
        return self.get(job_id)

    @atomic
    def resume(self, job_id):
        job=self.get(job_id)
        if job['status'] not in ('failed','interrupted'):
            raise OperationError('Este trabalho não precisa de retomada.', 'invalid_state', 409)
        with self.lock, self.db:
            self.db.execute("UPDATE tasks SET status='pending' WHERE job_id=? AND status IN ('running','failed')",(job_id,))
        if job['ceiling'] and job['calls_made']>=job['ceiling']:
            # Resuming after the ceiling releases a small, explicit batch of calls; it never removes the limit.
            self.update(job_id,ceiling=job['ceiling']+3)
            self.event(job_id,'ceiling_raised',message=f'Teto ampliado para {job["ceiling"]+3} chamadas a pedido do usuário.')
        pending_cards=job['job_type']=='conteudo-semana' and any(c['state']=='ajuste' for c in job['cards'])
        self.update(job_id,status='revision_queued' if pending_cards or (job['revision']>1 and job['deliveries']) else 'queued',cancel_requested=0,error='')
        self.event(job_id,'resumed',message='Retomada solicitada. Etapas concluídas serão reutilizadas; etapas interrompidas podem gerar nova chamada.')
        return self.get(job_id)

    def recover(self):
        with self.lock, self.db:
            rows=self.db.execute("SELECT id,cancel_requested FROM jobs WHERE status IN ('planning','running','reviewing','canceling')").fetchall()
            for row in rows:
                status='canceled' if row['cancel_requested'] else 'interrupted'
                self.db.execute('UPDATE jobs SET status=?,updated=? WHERE id=?',(status,now(),row['id']))
                self._event(row['id'],'interrupted',{'message':'O serviço foi reiniciado. Revise a etapa antes de retomar para evitar uma chamada duplicada.'})
