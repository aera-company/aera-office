"""Single registry of capabilities: character → stations → method files (read-only), executor and state.
The 3D, the panel, the list and the engine all read this. A documented method without an executor is
'método disponível', never 'agente trabalhando'."""
import json
import os
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
REGISTRY = HERE / 'capabilities.json'
EXECUTORS = ('texto', 'imagem', 'nenhum')
STATE_LABELS = {
    'em_tarefa': 'Em tarefa',
    'disponivel': 'De prontidão',
    'ia_desconectada': 'Método disponível · IA desconectada',
    'sem_executor': 'Método disponível · executor não conectado',
    'sem_job': 'Método disponível · sem job neste recorte',
}
MAX_EXCERPT_PER_FILE = 2600
MAX_METHOD_CHARS = 12000


def load():
    data = json.loads(REGISTRY.read_text(encoding='utf-8'))
    root = pathlib.Path(os.environ.get('AERA_LIBRARY_ROOT') or data['library_root'])
    data['library_root'] = str(root)
    for station in data['stations']:
        station['method_paths'] = [str(root / m) for m in station['methods']]
        station['methods_found'] = [str(root / m) for m in station['methods'] if (root / m).is_file()]
    return data


def validate(data):
    """Structural checks used by tests and by the server at start-up. Returns a list of problems."""
    problems = []
    ids = set()
    for station in data['stations']:
        sid = station.get('id', '')
        if not sid or sid in ids: problems.append(f'estação sem id único: {sid!r}')
        ids.add(sid)
        if station.get('character') not in data['characters']: problems.append(f'{sid}: personagem desconhecido')
        if station.get('executor') not in EXECUTORS: problems.append(f'{sid}: executor inválido')
        for key in ('name', 'does', 'inputs', 'output', 'how_to_ask'):
            if not isinstance(station.get(key), str) or not station[key].strip(): problems.append(f'{sid}: falta {key}')
        if not isinstance(station.get('jobs'), list): problems.append(f'{sid}: jobs deve ser lista')
        for path in station['method_paths']:
            if path not in station['methods_found']: problems.append(f'{sid}: método não encontrado: {path}')
    return problems


def stations_for(data, character, job_type=None):
    """Stations of a character. With a job type, only the ones that take part in that job."""
    out = [s for s in data['stations'] if s['character'] == character]
    if job_type and job_type != 'pedido':
        out = [s for s in out if job_type in s['jobs']]
    else:
        out = [s for s in out if s.get('default')]
    return out


def _excerpt(path, limit):
    try:
        text = pathlib.Path(path).read_text(encoding='utf-8', errors='replace')
    except OSError:
        return ''
    # Drop YAML front matter; keep the beginning of the file, which holds the method's principles.
    if text.startswith('---'):
        end = text.find('\n---', 3)
        if end != -1: text = text[end + 4:]
    text = text.strip()
    return text[:limit] + ('\n[…trecho truncado…]' if len(text) > limit else '')


def method_excerpts(data, character, job_type=None, max_chars=MAX_METHOD_CHARS):
    """Excerpts of the method files for a character's stations in a job. Records which files were used."""
    used, parts = [], []
    seen = set()
    stations = [s for s in stations_for(data, character, job_type) if s['methods'] and not (s['executor'] == 'nenhum' and job_type not in (None, 'pedido'))]
    if not stations: return '', []
    # The budget is split per station, so every station in the job contributes, not only the first one.
    per_station = max_chars // len(stations)
    for station in stations:
        files = [p for p in station['method_paths'] if p not in seen]
        per_file = min(MAX_EXCERPT_PER_FILE, per_station // max(1, len(files)))
        for path in files:
            seen.add(path)
            if path not in station['methods_found']:
                used.append({'station': station['id'], 'path': path, 'state': 'nao_encontrado'})
                continue
            excerpt = _excerpt(path, per_file)
            if not excerpt: continue
            used.append({'station': station['id'], 'path': path, 'state': 'carregado', 'chars': len(excerpt)})
            parts.append(f'### {station["name"]} · {pathlib.Path(path).name}\n{excerpt}')
    return '\n\n'.join(parts), used


def with_state(data, *, provider_ready, image_ready, running):
    """running: {character: [{'job_id','task_id','job_type'}]} from the store. Pure function, no I/O."""
    stations = []
    for station in data['stations']:
        state = 'sem_job' if not station['jobs'] or station['executor'] == 'nenhum' else \
                ('sem_executor' if station['executor'] == 'imagem' and not image_ready else
                 ('ia_desconectada' if station['executor'] == 'texto' and not provider_ready else 'disponivel'))
        task = None
        for t in running.get(station['character'], []):
            if t.get('job_type') in station['jobs'] or (t.get('job_type') in (None, '', 'pedido', 'sessao') and station.get('default')):
                task = t; state = 'em_tarefa'; break
        stations.append({**{k: v for k, v in station.items() if k != 'method_paths'}, 'state': state, 'state_label': STATE_LABELS[state], 'task': task})
    characters = {}
    for name, info in data['characters'].items():
        own = [s for s in stations if s['character'] == name]
        active = [s for s in own if s['state'] == 'em_tarefa']
        characters[name] = {**info, 'name': name, 'stations': [s['id'] for s in own], 'state': 'em_tarefa' if active else 'disponivel',
                            'current_station': active[0]['id'] if active else None, 'task': active[0]['task'] if active else None}
    return {'version': data['version'], 'library_root': data['library_root'], 'characters': characters, 'stations': stations}


def markdown(data):
    lines = ['# Registro de capacidades · AERA AI OFFICE', '', f'Versão {data["version"]} · biblioteca: `{data["library_root"]}`', '',
             'Executor: **texto** (Claude, quando conectado) · **imagem** (Magnific, quando conectado) · **nenhum** (método registrado, sem job neste recorte).', '']
    for name, info in data['characters'].items():
        lines += [f'## {name} · {info["role"]}', '', info['summary'], '']
        for s in [x for x in data['stations'] if x['character'] == name]:
            found = len(s['methods_found']); total = len(s['methods'])
            lines += [f'### {s["name"]} (`{s["id"]}`)', '', f'- **Faz:** {s["does"]}', f'- **Entradas:** {s["inputs"]}', f'- **Entrega:** {s["output"]}',
                      f'- **Como pedir:** "{s["how_to_ask"]}"', f'- **Executor:** {s["executor"]}', f'- **Jobs:** {", ".join(s["jobs"]) or "nenhum neste recorte"}',
                      f'- **Método:** {", ".join("`" + m + "`" for m in s["methods"]) or "sem método na biblioteca"}' + (f' ({found}/{total} encontrados)' if total else '')]
            if s.get('note'): lines.append(f'- **Nota:** {s["note"]}')
            lines.append('')
    return '\n'.join(lines)


if __name__ == '__main__':
    import sys
    data = load()
    problems = validate(data)
    if '--markdown' in sys.argv:
        print(markdown(data))
    else:
        print(f'{len(data["stations"])} estações, {len(data["characters"])} personagens, {len(problems)} problemas')
        for p in problems: print(' -', p)
    sys.exit(1 if problems else 0)
