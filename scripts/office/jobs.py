"""Catalogue of named jobs. One job is executable in recorte 1; the others are declared so the index tells the truth."""
import copy

# Output-token ceilings mirror engine.py; images are counted as paid actions of the image executor.
CATALOG = {
    'pedido': {
        'name': 'Pedido livre', 'how_to_ask': 'ARI, preciso de…', 'executable': True,
        'summary': 'Pedido sem job nomeado: ARI monta de 1 a 4 tarefas e reúne uma entrega em texto.',
        'agents': ['MAYA', 'NOA', 'LEO', 'NINA'], 'approval': 'entrega única', 'cards': 1,
        'estimate': {'calls': 6, 'images': 0},
    },
    'conteudo-semana': {
        'name': 'Conteúdo da semana', 'how_to_ask': 'ARI, conteúdo da semana', 'executable': True,
        'summary': 'Pauta de 3 posts para Instagram (feed e stories) e LinkedIn, um cartão por post com três peças; aprovação post a post; imagem via executor quando conectado.',
        'agents': ['MAYA', 'NOA'], 'approval': 'post a post', 'cards': 3,
        'posts': 3, 'pieces': ['instagram-feed', 'instagram-stories', 'linkedin-feed'],
        'stations': ['ari.briefing', 'ari.planejamento', 'ari.revisao', 'ari.roteamento', 'maya.contexto', 'maya.pauta', 'noa.texto', 'john.direcao-visual', 'noa.social', 'john.imagem'],
        'estimate': {'calls': 6, 'images': 9},
        'planner_hint': 'Job: Conteúdo da semana. Equipe permitida: MAYA (contexto e pauta) e NOA (texto, direção visual e desdobramento por canal). Três posts; cada post sai em Instagram feed, Instagram stories e LinkedIn feed. Não planeje publicação nem imagem final: a imagem é gerada depois pelo executor, se conectado.',
    },
    'proposta-html': {
        'name': 'Proposta em HTML', 'how_to_ask': 'ARI, monta uma proposta em HTML para este cliente', 'executable': False,
        'summary': 'Quatro cartões (estrutura, direção visual, conteúdo-chave, bloco comercial) e construção HTML por LEO. Recorte 2.',
        'agents': ['MAYA', 'NOA', 'NINA', 'LEO'], 'approval': 'quatro cartões, depois construção', 'cards': 4,
        'stations': ['ari.briefing', 'ari.planejamento', 'ari.revisao', 'ari.roteamento', 'maya.contexto', 'maya.posicionamento', 'noa.estrutura', 'noa.texto', 'john.direcao-visual', 'nina.proposta', 'leo.construcao-html'],
        'estimate': {'calls': 8, 'images': 0},
    },
    'landing-page': {
        'name': 'Landing page', 'how_to_ask': 'ARI, vamos criar uma landing page para esta oferta', 'executable': False,
        'summary': 'Três cartões (estrutura, direção visual, conteúdo-chave) e construção HTML por LEO. Recorte 2.',
        'agents': ['MAYA', 'NOA', 'LEO'], 'approval': 'três cartões, depois construção', 'cards': 3,
        'stations': ['ari.briefing', 'ari.planejamento', 'ari.revisao', 'ari.roteamento', 'maya.contexto', 'maya.posicionamento', 'noa.estrutura', 'noa.texto', 'john.direcao-visual', 'leo.construcao-html'],
        'estimate': {'calls': 7, 'images': 0},
    },
    'brief-tecnico': {
        'name': 'Brief técnico', 'how_to_ask': 'ARI, brief técnico para o sistema do cliente', 'executable': False,
        'summary': 'Um cartão: brief de implementação para uma sessão de código fora do escritório. Recorte posterior.',
        'agents': ['MAYA', 'LEO'], 'approval': 'um cartão', 'cards': 1,
        'stations': ['ari.briefing', 'ari.planejamento', 'ari.revisao', 'maya.contexto', 'leo.brief-tecnico'],
        'estimate': {'calls': 4, 'images': 0},
    },
}

OUTPUT_TOKENS = {'planning': 1800, 'task': 2000, 'review': 2600}


def get(job_type):
    return CATALOG.get(job_type or 'pedido')


def is_known(job_type):
    return (job_type or 'pedido') in CATALOG


def describe(*, provider_ready, image_ready):
    out = []
    for key, job in CATALOG.items():
        item = copy.deepcopy(job); item['id'] = key
        if not job['executable']: item['status'] = 'declarado · sem executor neste recorte'
        elif not provider_ready: item['status'] = 'executável · IA desconectada'
        elif job['estimate']['images'] and not image_ready: item['status'] = 'executável · imagens ficam pendentes até conectar o executor'
        else: item['status'] = 'executável'
        item.pop('planner_hint', None)
        out.append(item)
    return out


def estimate(job_type, *, posts=None):
    """Order of magnitude shown before the first call (C20). Not a price; the provider bills real usage."""
    job = get(job_type)
    if not job: return None
    n = posts or job.get('posts', 0)
    if job_type == 'conteudo-semana':
        calls = 3 + n  # planning, pauta, one per post, review
        images = n * len(job['pieces'])
    else:
        calls, images = job['estimate']['calls'], job['estimate']['images']
    tokens = OUTPUT_TOKENS['planning'] + OUTPUT_TOKENS['review'] + max(0, calls - 2) * OUTPUT_TOKENS['task']
    return {'job': job['name'], 'calls': calls, 'max_output_tokens': tokens, 'images': images,
            'ceiling_calls': int(calls * 1.3 + .999), 'note': 'Estimativa de ordem de grandeza. Custo real fica registrado ao lado depois da rodada.'}
