"""Real files for approved cards. A card shown as approved has files on disk; a pending image has none."""
import pathlib
import re
import datetime

CHANNEL_LABELS={'instagram-feed':'Instagram feed · 1080×1440 (4:5)','instagram-stories':'Instagram stories · 1080×1920 (9:16)','linkedin-feed':'LinkedIn feed · 1920×1080 (16:9)'}


def slug(value, fallback='geral'):
    text=re.sub(r'[^a-z0-9]+','-',(value or '').lower()).strip('-')
    return text[:60] or fallback


def project_dir(runtime, job, client_name='', project_name=''):
    return pathlib.Path(runtime)/'projects'/slug(client_name or job.get('client_id') or 'sem-cliente','sem-cliente')/slug(project_name or job.get('project_id') or 'geral')/f'job-{job["id"][:8]}'


def write_card_files(runtime, job, card, client_name='', project_name=''):
    """Writes one Markdown per piece under final/<channel>/. Returns the paths written."""
    base=project_dir(runtime,job,client_name,project_name)/'final'
    stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
    paths=[]
    for piece in card['pieces']:
        folder=base/piece['channel'];folder.mkdir(parents=True,exist_ok=True,mode=0o700)
        path=folder/f'post-{card["ordinal"]:02d}-v{card["version"]}.md'
        image='Imagem: pendente (executor de imagem não conectado).' if piece['image_state']!='gerada' else f'Imagem: {piece["artifact_id"]}'
        text=(f'# Post {card["ordinal"]} · {card["title"]}\n\n{CHANNEL_LABELS.get(piece["channel"],piece["channel"])} · versão {card["version"]} · aprovado em {stamp}\n\n'
              f'## Headline\n{piece["headline"]}\n\n## Texto\n{piece["text"]}\n\n## Legenda ou roteiro\n{piece["caption"]}\n\n'
              f'## Direção visual\n{piece["visual_direction"]}\n\n## Prompt de imagem\n{piece["image_prompt"]}\n\n{image}\n\n---\nAERA AI OFFICE · aprovado no escritório. Nenhuma publicação executada.\n')
        path.write_text(text,encoding='utf-8');path.chmod(0o600);paths.append(str(path))
    return paths
