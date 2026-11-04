"""NAYRA, first cut (C37 to C45): the spoken briefing and the bridge from Claude Code sessions.

Everything here reads or writes rows of the office store. Nothing is guessed, nothing calls a model.
Domain: office only (C44). No personal data enters these rows.
"""
import datetime
import json
import uuid
from .provider import OperationError
from .store import now

TEAM = ('ARI', 'MAYA', 'NOA', 'JOHN', 'LEO', 'NINA')
ZONE = {'ARI': 'control', 'MAYA': 'think', 'NOA': 'create', 'JOHN': 'create', 'LEO': 'build', 'NINA': 'grow'}
ROLE = {'ARI': 'coordenação', 'MAYA': 'estratégia', 'NOA': 'texto e conceito', 'JOHN': 'design e arte', 'LEO': 'tecnologia', 'NINA': 'negócios'}
SESSION_TYPE = 'sessao'
SESSION_MODEL = 'Claude Code · assinatura'
OPEN_STATES = ('em_sessao', 'needs_input', 'awaiting_approval')
MAX_ITEMS = 5

# Kinds that mean a character finished something. Used for "o que o time fez".
DONE_KINDS = ('task_completed', 'card_ready', 'pauta_ready', 'image_generated', 'session_step', 'images_ready')


def _short(text, limit=60):
    text = ' '.join(str(text or '').split())
    return text if len(text) <= limit else text[:limit - 1].rstrip() + '…'


def _plural(n, one, many):
    return f'{n} {one if n == 1 else many}'


def _greeting(local_hour):
    return 'Bom dia' if 5 <= local_hour < 12 else 'Boa tarde' if 12 <= local_hour < 18 else 'Boa noite'


# ---------------------------------------------------------------- briefing (C38)

def briefing(store, since='', image_ready=False, local_hour=None, client_id=None):
    """Spoken script in urgency order: depends on Tiago, then ready, then stuck. Up to five items.

    `since` is the last time Tiago heard a briefing (ISO). Without it, "ready" looks at the last 24 hours.
    """
    current = now()
    if not since:
        since = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)).isoformat()
    # Presentation mode (C51): only one client's rows are read at all.
    w, a = store._scope(client_id)
    with store.lock:
        clients = {r['id']: r['name'] for r in store.db.execute('SELECT id,name FROM clients')}
        jobs = [dict(r) for r in store.db.execute(
            'SELECT id,title,status,job_type,client_id,error,execute_at,questions,updated FROM jobs j WHERE 1=1' + w + ' ORDER BY updated DESC', a)]
        cards = {}
        for r in store.db.execute("SELECT c.job_id,c.state FROM cards c JOIN jobs j ON j.id=c.job_id WHERE c.state IN ('aguardando','parcial')" + w, a):
            cards[r['job_id']] = cards.get(r['job_id'], 0) + 1
        events = [dict(r) for r in store.db.execute(
            'SELECT e.job_id,e.kind,e.data,e.created FROM events e JOIN jobs j ON j.id=e.job_id WHERE e.created>?' + w + ' ORDER BY e.id', (since, *a))]
        # Who spoke last on each job, over its whole history: the question or delivery is attributed to that character.
        last_agent = {}
        for r in store.db.execute('SELECT e.job_id,e.data FROM events e JOIN jobs j ON j.id=e.job_id WHERE 1=1' + w + ' ORDER BY e.id', a):
            agent = json.loads(r['data']).get('agent', '')
            if agent in TEAM:
                last_agent[r['job_id']] = agent
        images_pending = store.db.execute(
            "SELECT count(*) FROM card_items ci JOIN cards c ON c.id=ci.card_id JOIN jobs j ON j.id=c.job_id WHERE ci.version=c.version "
            "AND ci.image_state<>'gerada' AND c.state IN ('aguardando','parcial','aprovado')" + w, a).fetchone()[0]

    def who(job):
        name = clients.get(job['client_id'], '')
        return f' para {name}' if name else ''

    you, ready, stuck = [], [], []

    # 1. Depends on Tiago.
    for j in jobs:
        title = _short(j['title'])
        session = j['job_type'] == SESSION_TYPE
        if j['status'] == 'needs_input':
            questions = json.loads(j['questions'] or '[]')
            ask = _short(questions[0], 140) if questions else ''
            asker = last_agent.get(j['id'], 'ARI')
            text = f'{asker} precisa de uma resposta sua em {title}{who(j)}.' + (f' A pergunta é: {ask}' if ask else '')
            you.append({'group': 'voce', 'agent': asker, 'job_id': j['id'], 'title': j['title'], 'text': text,
                        'detail': ask, 'actions': ['open'],
                        'hint': 'Responda no Claude Code.' if session else 'Responda no painel de operação.'})
        elif j['status'] == 'awaiting_estimate':
            you.append({'group': 'voce', 'agent': 'ARI', 'job_id': j['id'], 'title': j['title'],
                        'text': f'A estimativa de {title}{who(j)} espera a sua confirmação antes de qualquer chamada.',
                        'detail': '', 'actions': ['open'], 'hint': ''})
        elif j['status'] == 'awaiting_approval':
            n = cards.get(j['id'], 0)
            if n:
                text = f'{_plural(n, "post", "posts")} de {title}{who(j)} {"espera" if n == 1 else "esperam"} a sua aprovação.'
                actions = ['open']
            else:
                text = f'A entrega de {title}{who(j)} está pronta para a sua aprovação.'
                actions = ['approve', 'open']
            agent = last_agent.get(j['id']) or ('NOA' if n else 'ARI')
            you.append({'group': 'voce', 'agent': agent, 'job_id': j['id'], 'title': j['title'], 'text': text,
                        'detail': '', 'actions': actions, 'hint': ''})

    # 1b. Image batches JOHN prepared and that wait for Tiago's ok (C71).
    for b in batches(store, client_id=client_id, state='proposto'):
        you.append({'group': 'voce', 'agent': b['agent'], 'job_id': b['job_id'], 'batch_id': b['id'], 'title': b['job_title'],
                    'text': f'{b["agent"]} preparou um lote de {_plural(b["count"], "imagem", "imagens")} para {_short(b["job_title"])}. Ele só gera depois do seu ok.',
                    'detail': b['description'], 'actions': ['release', 'open'],
                    'hint': f'Estimativa: {format(b["credits"], "g").replace(".", ",")} créditos no Higgsfield.' if b['credits'] else ''})

    # 2. Ready: what each character finished since the last briefing, outside the jobs already above.
    # Jobs Tiago already decided (approved or canceled) are not news anymore.
    reported = {i['job_id'] for i in you} | {j['id'] for j in jobs if j['status'] in ('approved', 'canceled')}
    per = {}
    for e in events:
        if e['kind'] not in DONE_KINDS or e['job_id'] in reported:
            continue
        agent = json.loads(e['data']).get('agent', '')
        if agent in TEAM:
            per.setdefault(agent, []).append(e)
    for agent, done in sorted(per.items(), key=lambda kv: -len(kv[1])):
        last = _short(json.loads(done[-1]['data']).get('message', ''), 110).rstrip('.')
        # Messages often start with the character's name ("MAYA mapeou..."): say the name once.
        body = last[len(agent) + 1:] if last.lower().startswith(agent.lower() + ' ') else ''
        jobs_touched = len({e['job_id'] for e in done})
        if len(done) == 1 and last:
            text = f'{agent} {body}.' if body else f'{agent} concluiu uma etapa: {last}.'
        else:
            text = (f'{agent} concluiu {_plural(len(done), "etapa", "etapas")}'
                    f'{" em " + _plural(jobs_touched, "trabalho", "trabalhos") if jobs_touched > 1 else ""}.')
            if last:
                text += f' A última: {body or last}.'
        ready.append({'group': 'pronto', 'agent': agent, 'job_id': done[-1]['job_id'], 'title': '', 'text': text,
                      'detail': '', 'actions': ['open'], 'hint': ''})

    # 3. Stuck: failed or interrupted, schedules that did not run, images without an executor.
    for j in jobs:
        if j['status'] in ('failed', 'interrupted'):
            reason = _short(j['error'], 120) if j['error'] else ('o serviço foi reiniciado no meio' if j['status'] == 'interrupted' else '')
            stuck.append({'group': 'travado', 'agent': 'ARI', 'job_id': j['id'], 'title': j['title'],
                          'text': f'{_short(j["title"])}{who(j)} travou' + (f': {reason}.' if reason else '.'),
                          'detail': reason, 'actions': ['open'], 'hint': ''})
        elif j['status'] == 'scheduled' and j['execute_at'] and j['execute_at'] < current:
            stuck.append({'group': 'travado', 'agent': 'ARI', 'job_id': j['id'], 'title': j['title'],
                          'text': f'{_short(j["title"])} estava agendado e não rodou.', 'detail': '',
                          'actions': ['open'], 'hint': 'O servidor precisa estar ligado no horário.'})
    if images_pending and not image_ready:
        stuck.append({'group': 'travado', 'agent': 'NOA', 'job_id': '', 'title': '',
                      'text': f'{_plural(images_pending, "imagem espera", "imagens esperam")} o executor de imagem, que não está conectado.',
                      'detail': '', 'actions': [], 'hint': 'Conecte o Magnific na operação.'})

    items = you + ready + stuck
    total = len(items)
    if total > MAX_ITEMS:
        rest = total - (MAX_ITEMS - 1)
        items = items[:MAX_ITEMS - 1] + [{'group': 'resto', 'agent': 'ARI', 'job_id': '', 'title': '',
                                          'text': f'E há mais {_plural(rest, "item", "itens")} no painel de operação.',
                                          'detail': '', 'actions': ['panel'], 'hint': ''}]
    for item in items:
        item['zone'] = ZONE.get(item['agent'], 'control')
        item['role'] = ROLE.get(item['agent'], '')

    hour = datetime.datetime.now().hour if local_hour is None else local_hour
    hello = f'{_greeting(hour)}, Tiago.'
    if not items:
        opening, closing = f'{hello} Tudo em dia. Nada espera por você.', ''
    elif len(you) and len(items) == 1:
        opening, closing = f'{hello} Tenho uma coisa para você.', 'É isso.'
    else:
        opening = f'{hello} ' + (f'{_plural(len(you), "coisa depende", "coisas dependem")} de você.' if you else 'Nada depende de você agora.')
        closing = 'É isso por agora.'
    return {'now': current, 'since': since, 'count': total, 'attention': len(you) + len(stuck),
            'opening': opening, 'items': items, 'closing': closing}


# ---------------------------------------------------------------- bridge (C43)
# A Claude Code session records its work here through scripts/nayra.py. The office never runs these jobs:
# they live in the state 'em_sessao', which the engine does not claim and recover() does not interrupt.

def _agent(value, default='ARI'):
    value = (value or default).strip().upper()
    if value not in TEAM:
        raise OperationError(f'Personagem desconhecido: {value}. Use um de {", ".join(TEAM)}.')
    return value


def _text(value, limit, label):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise OperationError(f'{label} deve ter entre 1 e {limit} caracteres.')
    return value.strip()


def resolve_client(store, value):
    if not value:
        return ''
    value = value.strip()
    with store.lock:
        rows = [dict(r) for r in store.db.execute('SELECT id,name FROM clients')]
    for r in rows:
        if r['id'] == value or r['name'].lower() == value.lower():
            return r['id']
    known = ', '.join(r['name'] for r in rows) or 'nenhum cadastrado'
    raise OperationError(f'Cliente não encontrado: {value}. Cadastrados: {known}.', 'not_found', 404)


def resolve_session(store, ref):
    """Accepts the full id or a unique prefix of at least 6 characters."""
    if not isinstance(ref, str) or not 6 <= len(ref.strip()) <= 32:
        raise OperationError('Informe o identificador do trabalho (pelo menos 6 caracteres).')
    ref = ref.strip().lower()
    with store.lock:
        rows = store.db.execute('SELECT id,job_type FROM jobs WHERE id LIKE ?', (ref + '%',)).fetchall()
    if not rows:
        raise OperationError(f'Trabalho não encontrado: {ref}.', 'not_found', 404)
    if len(rows) > 1:
        raise OperationError(f'Mais de um trabalho começa com {ref}. Use mais caracteres.')
    if rows[0]['job_type'] != SESSION_TYPE:
        raise OperationError('Este trabalho é do motor do escritório, não de uma sessão do Claude Code.', 'invalid_state', 409)
    return rows[0]['id']


def _phase(agent):
    return f'agent:{agent}'


def open_session(store, title, agent='ARI', client='', brief=''):
    title = _text(title, 120, 'O título')
    agent = _agent(agent)
    client_id = resolve_client(store, client)
    brief = brief.strip() if isinstance(brief, str) and brief.strip() else title
    if len(brief) > 6000:
        raise OperationError('O pedido deve ter até 6.000 caracteres.')
    job_id = uuid.uuid4().hex
    with store.lock, store.db:
        store.db.execute(
            'INSERT INTO jobs(id,title,brief,context,status,created,updated,idempotency,client_id,job_type,phase) '
            'VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            (job_id, title, brief, '', 'em_sessao', now(), now(), 'sessao-' + job_id, client_id, SESSION_TYPE, _phase(agent)))
        store._event(job_id, 'session_started', {'agent': agent, 'message': f'Trabalho aberto no Claude Code: {title}.'})
    return store.get(job_id)


def _open_job(store, ref):
    job = store.get(resolve_session(store, ref))
    if job['status'] not in OPEN_STATES:
        raise OperationError(f'Este trabalho já está encerrado ({job["status"]}). Abra um novo.', 'invalid_state', 409)
    return job


def step(store, ref, message, agent='ARI'):
    job = _open_job(store, ref)
    message = _text(message, 400, 'A mensagem')
    agent = _agent(agent)
    with store.lock, store.db:
        store.db.execute("UPDATE jobs SET status='em_sessao',phase=?,questions='[]',updated=? WHERE id=?",
                         (_phase(agent), now(), job['id']))
        store._event(job['id'], 'session_step', {'agent': agent, 'message': message})
    return store.get(job['id'])


def ask(store, ref, question, agent='ARI'):
    job = _open_job(store, ref)
    question = _text(question, 600, 'A pergunta')
    agent = _agent(agent)
    with store.lock, store.db:
        store.db.execute("UPDATE jobs SET status='needs_input',phase='',questions=?,updated=? WHERE id=?",
                         (json.dumps([question], ensure_ascii=False), now(), job['id']))
        store._event(job['id'], 'questions', {'agent': agent, 'questions': [question], 'message': f'{agent} precisa saber: {question}'})
    return store.get(job['id'])


def deliver(store, ref, text, agent='ARI'):
    job = _open_job(store, ref)
    text = _text(text, 60000, 'A entrega')
    agent = _agent(agent)
    revision = (max(d['revision'] for d in job['deliveries']) + 1) if job['deliveries'] else job['revision']
    with store.lock, store.db:
        store.db.execute('INSERT INTO deliveries(job_id,revision,text,model,usage,created) VALUES (?,?,?,?,?,?)',
                         (job['id'], revision, text, SESSION_MODEL, '{}', now()))
        store.db.execute("UPDATE jobs SET status='awaiting_approval',revision=?,phase='',questions='[]',error='',updated=? WHERE id=?",
                         (revision, now(), job['id']))
        store._event(job['id'], 'delivery_ready', {'agent': agent, 'message': f'Entrega pronta para sua aprovação (versão {revision}).', 'revision': revision})
    return store.get(job['id'])


def fail(store, ref, reason, agent='ARI'):
    job = _open_job(store, ref)
    reason = _text(reason, 400, 'O motivo')
    agent = _agent(agent)
    with store.lock, store.db:
        store.db.execute("UPDATE jobs SET status='failed',phase='',error=?,updated=? WHERE id=?", (reason, now(), job['id']))
        store._event(job['id'], 'failed', {'agent': agent, 'message': f'Travou: {reason}'})
    return store.get(job['id'])


def sessions(store, client_id=None):
    w, a = store._scope(client_id)
    with store.lock:
        rows = store.db.execute(
            "SELECT id,title,status,phase,updated FROM jobs j WHERE job_type=?" + w + " ORDER BY updated DESC LIMIT 20", (SESSION_TYPE, *a)).fetchall()
    return [dict(r) for r in rows]


def propose_notes(store, client, notes, summary=''):
    """Facts, voice and rules proposed from a session (C48). They stay 'proposto' until Tiago confirms in the client dialog."""
    client_id = resolve_client(store, client)
    if not client_id:
        raise OperationError('Informe o cliente.')
    if not isinstance(notes, list) or not 1 <= len(notes) <= 14:
        raise OperationError('Proponha de 1 a 14 fatos por vez.')
    clean = []
    for n in notes:
        if not isinstance(n, dict) or n.get('tipo') not in ('fato', 'preferencia', 'decisao'):
            raise OperationError('Cada fato precisa de tipo: fato, preferencia ou decisao.')
        text = _text(n.get('texto'), 400, 'O texto do fato')
        origin = n.get('fonte') if isinstance(n.get('fonte'), str) and n.get('fonte').strip() else 'material do cliente'
        clean.append((n['tipo'], text, _short(origin, 120)))
    if summary and (not isinstance(summary, str) or len(summary) > 1200):
        raise OperationError('O resumo deve ter até 1.200 caracteres.')
    created = [store.add_note(client_id, level=1, kind=kind, text=text, source=f'NAYRA pelo Claude Code, a partir de {origin}', state='proposto')
               for kind, text, origin in clean]
    if summary and summary.strip():
        store.update_client(client_id, summary=summary.strip())
    return {'client_id': client_id, 'notes': created}



# ---------------------------------------------------------------- demo voice (C49 to C60)
STATUS_PT = {'em_sessao': 'em andamento', 'needs_input': 'aguardando resposta do Tiago', 'awaiting_approval': 'pronto, aguardando aprovação do Tiago',
             'approved': 'aprovado pelo Tiago', 'failed': 'travou', 'interrupted': 'interrompido', 'canceled': 'cancelado',
             'queued': 'na fila', 'scheduled': 'agendado', 'planning': 'em planejamento', 'running': 'em execução',
             'reviewing': 'em revisão', 'awaiting_estimate': 'aguardando confirmação de estimativa', 'revision_queued': 'ajuste na fila'}


def demo_context(store, client_id, max_chars=14000, max_jobs=6, delivery_chars=3800):
    """What NAYRA may say in a client demo: only this client's confirmed facts, the team and the recorded work."""
    client = store.get_client(client_id)
    facts = [n for n in client['notes'] if n['level'] == 1 and n['state'] == 'confirmado']
    lines = [f'CLIENTE: {client["name"]}', f'Resumo: {client["summary"] or "sem resumo"}', '', 'FATOS CONFIRMADOS PELO TIAGO:']
    lines += [f'- ({n["kind"]}) {n["text"]}' for n in facts] or ['- nenhum']
    lines += ['', 'EQUIPE DO ESCRITÓRIO (agentes de IA, não pessoas):']
    lines += [f'- {name}: {ROLE[name]}, sala {room}' for name, room in
              (('ARI', 'Comando, andar 02'), ('MAYA', 'Think, estratégia'), ('NOA', 'Create, texto e conceito'), ('JOHN', 'Create, design e arte'), ('LEO', 'Build, tecnologia'), ('NINA', 'Grow, negócios'))]
    jobs = [j for j in store.list(client_id)][:max_jobs]
    lines += ['', f'TRABALHOS REGISTRADOS NO ESCRITÓRIO ({len(jobs)} mais recentes):']
    out_jobs = []
    for j in jobs:
        full = store.get(j['id'])
        when = full['created'][:10]
        lines += ['', f'## {full["title"]}', f'Estado: {STATUS_PT.get(full["status"], full["status"])} · aberto em {when}']
        steps = [f'- {e["data"].get("agent", "")}: {e["data"].get("message", "")}' for e in full['events'] if e['data'].get('message') and e['data'].get('agent')]
        if steps:
            lines += ['Etapas registradas:'] + steps[:12]
        if full['deliveries']:
            d = full['deliveries'][-1]
            text = d['text'] if len(d['text']) <= delivery_chars else d['text'][:delivery_chars].rstrip() + '\n[… entrega continua no escritório]'
            lines += [f'Entrega (versão {d["revision"]}):', text]
        out_jobs.append({'id': full['id'], 'title': full['title'], 'status': full['status']})
    text = '\n'.join(lines)
    if len(text) > max_chars:
        text = text[:max_chars].rstrip() + '\n[… contexto cortado no limite]'
    return {'client': client['name'], 'client_id': client_id, 'facts': len(facts), 'jobs': out_jobs, 'text': text}


# ---------------------------------------------------------------- image batches (C66 to C71)
# JOHN never spends image credits on his own: he proposes a batch, Tiago releases it in the office, then the
# Claude Code session generates and records the result. The office never calls the image provider for these.
BATCH_STATES = ('proposto', 'liberado', 'recusado', 'gerado')


def _ensure_batches(store):
    with store.lock, store.db:
        store.db.execute(
            'CREATE TABLE IF NOT EXISTS image_batches (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, agent TEXT NOT NULL, '
            'count INTEGER NOT NULL, description TEXT NOT NULL, prompts TEXT NOT NULL DEFAULT \'[]\', model TEXT NOT NULL DEFAULT \'\', '
            'credits REAL NOT NULL DEFAULT 0, state TEXT NOT NULL, files TEXT NOT NULL DEFAULT \'[]\', created TEXT NOT NULL, decided TEXT)')


def _batch_row(store, batch_id):
    _ensure_batches(store)
    with store.lock:
        row = store.db.execute('SELECT * FROM image_batches WHERE id=?', (batch_id,)).fetchone()
    if not row:
        raise OperationError('Lote de imagens não encontrado.', 'not_found', 404)
    return dict(row)


def _batch_out(row, titles=None):
    out = dict(row)
    out['prompts'] = json.loads(out['prompts'])
    out['files'] = json.loads(out['files'])
    if titles is not None:
        out['job_title'] = titles.get(out['job_id'], '')
    return out


def propose_batch(store, ref, count, description, prompts=None, model='', credits=0, agent='JOHN'):
    job = _open_job(store, ref)
    agent = _agent(agent, 'JOHN')
    if not isinstance(count, int) or not 1 <= count <= 24:
        raise OperationError('Um lote tem de 1 a 24 imagens.')
    description = _text(description, 400, 'A descrição do lote')
    prompts = prompts or []
    if not isinstance(prompts, list) or len(prompts) > 24 or any(not isinstance(p, str) or len(p) > 2000 for p in prompts):
        raise OperationError('Os prompts do lote devem ser uma lista de até 24 textos.')
    try:
        credits = float(credits or 0)
    except (TypeError, ValueError):
        raise OperationError('A estimativa de créditos é inválida.') from None
    _ensure_batches(store)
    batch_id = uuid.uuid4().hex
    with store.lock, store.db:
        store.db.execute('INSERT INTO image_batches(id,job_id,agent,count,description,prompts,model,credits,state,created) VALUES (?,?,?,?,?,?,?,?,?,?)',
                         (batch_id, job['id'], agent, count, description, json.dumps(prompts, ensure_ascii=False), str(model or '')[:80], credits, 'proposto', now()))
        store.db.execute("UPDATE jobs SET phase=?,updated=? WHERE id=?", (_phase(agent), now(), job['id']))
        store._event(job['id'], 'batch_proposed', {'agent': agent, 'batch_id': batch_id,
                     'message': f'{agent} preparou um lote de {_plural(count, "imagem", "imagens")}: {description}. Aguarda o ok do Tiago.'})
    return _batch_out(_batch_row(store, batch_id))


def decide_batch(store, job_id, batch_id, release):
    row = _batch_row(store, batch_id)
    if row['job_id'] != job_id:
        raise OperationError('Lote de imagens não encontrado.', 'not_found', 404)
    if row['state'] != 'proposto':
        raise OperationError(f'Este lote já foi decidido ({row["state"]}).', 'invalid_state', 409)
    state = 'liberado' if release else 'recusado'
    with store.lock, store.db:
        store.db.execute('UPDATE image_batches SET state=?,decided=? WHERE id=?', (state, now(), batch_id))
        store._event(job_id, 'batch_released' if release else 'batch_declined',
                     {'batch_id': batch_id, 'message': f'Tiago {"liberou" if release else "recusou"} o lote de {_plural(row["count"], "imagem", "imagens")}.'})
    return _batch_out(_batch_row(store, batch_id))


def batch_done(store, batch_id, generated, files=None, agent='JOHN'):
    row = _batch_row(store, batch_id)
    if row['state'] != 'liberado':
        raise OperationError('Só um lote liberado pelo Tiago pode ser registrado como gerado.', 'invalid_state', 409)
    agent = _agent(agent, 'JOHN')
    if not isinstance(generated, int) or not 0 <= generated <= row['count']:
        raise OperationError('Número de imagens geradas inválido para este lote.')
    files = [str(f)[:300] for f in (files or [])][:24]
    with store.lock, store.db:
        store.db.execute('UPDATE image_batches SET state=?,files=? WHERE id=?', ('gerado', json.dumps(files, ensure_ascii=False), batch_id))
        store._event(row['job_id'], 'images_ready', {'agent': agent, 'batch_id': batch_id,
                     'message': f'{agent} gerou {_plural(generated, "imagem", "imagens")} do lote liberado.'})
    return _batch_out(_batch_row(store, batch_id))


def batches(store, job_id=None, client_id=None, state=None):
    _ensure_batches(store)
    w, a = store._scope(client_id)
    sql = 'SELECT b.*, j.title AS job_title FROM image_batches b JOIN jobs j ON j.id=b.job_id WHERE 1=1' + w
    args = list(a)
    if job_id:
        sql += ' AND b.job_id=?'; args.append(job_id)
    if state:
        sql += ' AND b.state=?'; args.append(state)
    with store.lock:
        rows = [dict(r) for r in store.db.execute(sql + ' ORDER BY b.created DESC LIMIT 50', args)]
    for r in rows:
        r['prompts'] = json.loads(r['prompts']); r['files'] = json.loads(r['files'])
    return rows

