"""Server-side link reader. Public pages only; what could not be read is recorded, never guessed."""
import datetime
import html
import html.parser
import re
import socket
import urllib.error
import urllib.parse
import urllib.request

MAX_BYTES = 1_500_000
MAX_TEXT = 24_000
SKIP = {'script', 'style', 'noscript', 'svg', 'template', 'head'}
BLOCK = {'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'li', 'ul', 'ol', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'td', 'th', 'blockquote', 'pre', 'figure', 'figcaption', 'dt', 'dd'}


class _Text(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.title, self.skip, self.in_title = [], '', 0, False

    def handle_starttag(self, tag, attrs):
        if tag in SKIP: self.skip += 1
        if tag == 'title': self.in_title = True
        # Every tag boundary separates words; block tags also break lines. Keeps "Marca" and "Estúdio" apart.
        self.parts.append('\n' if tag in BLOCK else ' ')

    def handle_endtag(self, tag):
        if tag in SKIP and self.skip: self.skip -= 1
        if tag == 'title': self.in_title = False
        self.parts.append('\n' if tag in BLOCK else ' ')

    def handle_data(self, data):
        if self.in_title: self.title += data
        elif not self.skip: self.parts.append(data)


def _result(url, state, *, title='', text='', reason='', size=0):
    return {'url': url, 'title': title.strip()[:200], 'text': text, 'state': state, 'reason': reason, 'bytes': size,
            'fetched': datetime.datetime.now(datetime.timezone.utc).isoformat()}


def extract_text(raw):
    parser = _Text()
    parser.feed(raw)
    text = html.unescape(''.join(parser.parts))
    text = re.sub(r'[ \t\r\f\v]+', ' ', text)
    text = '\n'.join(line.strip() for line in text.split('\n'))
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    return parser.title, text


def read_link(url, allow_local=False):
    """Returns a dict with state 'lido' or 'nao_lido'. Never raises; never follows credentials."""
    if not isinstance(url, str) or len(url) > 2000:
        return _result(str(url)[:2000], 'nao_lido', reason='Endereço inválido.')
    url = url.strip()
    parts = urllib.parse.urlsplit(url)
    host = (parts.hostname or '').lower()
    local = host in ('127.0.0.1', 'localhost', '::1')
    if parts.scheme == 'https' and host and not local:
        pass
    elif parts.scheme == 'http' and local and allow_local:
        pass
    else:
        return _result(url, 'nao_lido', reason='Somente endereços https públicos são lidos pelo escritório.')
    if parts.username or parts.password:
        return _result(url, 'nao_lido', reason='Endereços com credenciais não são lidos.')
    request = urllib.request.Request(url, headers={'User-Agent': 'AERA-AI-OFFICE/2 (leitor local de links)', 'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            content_type = response.headers.get('Content-Type', '')
            if not any(t in content_type for t in ('text/html', 'application/xhtml', 'text/plain')):
                return _result(url, 'nao_lido', reason=f'Conteúdo não textual ({content_type.split(";")[0] or "desconhecido"}). PDF e imagens entram em uma etapa posterior.')
            raw = response.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as exc:
        reason = {401: 'A página exige login.', 403: 'A página bloqueou a leitura automática.', 404: 'A página não existe.'}.get(exc.code, f'O servidor respondeu com erro {exc.code}.')
        return _result(url, 'nao_lido', reason=reason)
    except (TimeoutError, socket.timeout):
        return _result(url, 'nao_lido', reason='A página não respondeu a tempo.')
    except (urllib.error.URLError, OSError, ValueError):
        return _result(url, 'nao_lido', reason='Não foi possível alcançar a página.')
    if len(raw) > MAX_BYTES:
        return _result(url, 'nao_lido', reason='A página é maior do que o limite de leitura.', size=len(raw))
    charset = 'utf-8'
    match = re.search(r'charset=([\w-]+)', content_type or '')
    if match: charset = match.group(1)
    try:
        decoded = raw.decode(charset, errors='replace')
    except LookupError:
        decoded = raw.decode('utf-8', errors='replace')
    title, text = extract_text(decoded) if 'html' in content_type else ('', decoded.strip())
    if not text:
        return _result(url, 'nao_lido', title=title, reason='A página não tem texto legível sem JavaScript.', size=len(raw))
    truncated = len(text) > MAX_TEXT
    return _result(url, 'lido', title=title, text=text[:MAX_TEXT], size=len(raw),
                   reason='Texto truncado no limite de leitura.' if truncated else '')
