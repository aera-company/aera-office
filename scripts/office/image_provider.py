"""Image executor behind one interface. Fixture writes a marked PNG locally; Magnific speaks MCP over HTTP with OAuth.
A piece only counts as 'gerada' when a file exists on disk. Secrets never reach the browser, the bundle or the logs."""
import base64
import hashlib
import json
import os
import pathlib
import secrets
import struct
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from .provider import OperationError
from .keychain import MacKeychain, CredentialStoreError

MCP_URL = 'https://mcp.magnific.com/mcp'
AUTH_SERVER = 'https://auth.magnific.com/realms/mcp'
SCOPES = 'openid profile email mcp:custom-audience offline_access'
DEFAULT_MODEL = 'magnific-one'
# Channel → how the executor is asked. 4:5 is not native on magnific-one, so the feed uses exact pixels.
SIZES = {'instagram-feed': {'width': 1080, 'height': 1440}, 'instagram-stories': {'aspectRatio': '9:16', 'resolution': '2k'}, 'linkedin-feed': {'aspectRatio': '16:9', 'resolution': '2k'}}


def minimal_png(width, height, rgb=(16, 25, 29)):
    """A valid PNG without any image library. Used by the fixture so tests have real files."""
    raw = b''.join(b'\x00' + bytes(rgb) * width for _ in range(height))
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


class ImageProvider:
    """Interface. status() → {'ready','provider','model','fixture','reason'}; generate(...) → {'bytes','model','meta'}."""
    fixture = False
    def status(self):
        raise NotImplementedError
    def generate(self, prompt, channel, *, reference_path=None):
        raise NotImplementedError


class NoImageProvider(ImageProvider):
    def status(self):
        return {'ready': False, 'provider': 'Magnific', 'model': DEFAULT_MODEL, 'fixture': False, 'reason': 'Executor de imagem não conectado.'}
    def generate(self, *a, **k):
        raise OperationError('Executor de imagem não conectado.', 'image_not_connected', 503)


class FixtureImageProvider(ImageProvider):
    """Explicit test executor: writes a small marked PNG. Never used by the normal launcher."""
    fixture = True
    def __init__(self, *, fail_on=None, delay=0):
        self.calls, self.fail_on, self.delay = [], fail_on, delay
    def status(self):
        return {'ready': True, 'provider': 'TRANSPORTE DE TESTE', 'model': 'fixture-no-real-image', 'fixture': True, 'reason': ''}
    def generate(self, prompt, channel, *, reference_path=None):
        self.calls.append({'prompt': prompt, 'channel': channel, 'reference': reference_path})
        if self.delay: time.sleep(self.delay)
        if self.fail_on and channel == self.fail_on:
            raise OperationError('Falha de teste no executor de imagem.', 'image_failed', 502)
        size = SIZES.get(channel, {})
        w, h = (size.get('width', 64) // 20, size.get('height', 64) // 20) if 'width' in size else ((16, 28) if channel == 'instagram-stories' else (32, 18))
        return {'bytes': minimal_png(w, h), 'model': 'fixture-no-real-image', 'meta': {'fixture': True, 'channel': channel, 'reference': bool(reference_path)}}


class MagnificProvider(ImageProvider):
    """MCP over streamable HTTP with a Bearer token obtained by OAuth (authorization code + PKCE, dynamic client registration).
    Implemented from the service's published metadata; NOT yet exercised against the real service."""
    def __init__(self, root, runtime, *, mcp_url=MCP_URL, auth_server=AUTH_SERVER, model=None, transport=None):
        self.root, self.runtime = pathlib.Path(root), pathlib.Path(runtime)
        self.mcp_url, self.auth_server = mcp_url, auth_server
        self.model = model or os.environ.get('AERA_IMAGE_MODEL', DEFAULT_MODEL)
        self.transport = transport or self._http
        self.lock = threading.RLock()
        self.session_id, self.access_token, self.expires_at, self.refresh_token, self.client_id = '', '', 0, '', ''
        self.pending_login = None
        self.store = None
        try:
            self.store = MacKeychain(self.root, service='com.aera.ai-office.magnific.' + hashlib.sha256(str(self.root.resolve()).encode()).hexdigest()[:16])
        except CredentialStoreError:
            pass
        self._load()

    # ---- credentials ----
    def _load(self):
        saved = ''
        try:
            if self.store: saved = self.store.load() or ''
        except CredentialStoreError:
            saved = ''
        saved = saved or os.environ.get('MAGNIFIC_REFRESH_TOKEN', '')
        if saved:
            try:
                data = json.loads(saved) if saved.startswith('{') else {'refresh_token': saved}
                self.refresh_token, self.client_id = data.get('refresh_token', ''), data.get('client_id', '')
            except ValueError:
                self.refresh_token = ''

    def _save(self):
        if not self.store: return
        try:
            self.store.save(json.dumps({'refresh_token': self.refresh_token, 'client_id': self.client_id}))
        except CredentialStoreError:
            pass

    def status(self):
        return {'ready': bool(self.refresh_token or self.access_token), 'provider': 'Magnific (MCP)', 'model': self.model, 'fixture': False,
                'reason': '' if (self.refresh_token or self.access_token) else 'Conecte o Magnific em Operação → Conectar imagem.', 'login_pending': bool(self.pending_login)}

    # ---- OAuth ----
    def _metadata(self):
        return json.loads(self.transport('GET', self.auth_server + '/.well-known/oauth-authorization-server'))

    def begin_login(self, redirect_uri):
        """Registers a client if needed and returns the URL Tiago opens in his browser. The token never passes through the page."""
        meta = self._metadata()
        if not self.client_id:
            reg = json.loads(self.transport('POST', meta['registration_endpoint'], json.dumps({'client_name': 'AERA AI OFFICE (local)', 'redirect_uris': [redirect_uri], 'grant_types': ['authorization_code', 'refresh_token'], 'response_types': ['code'], 'token_endpoint_auth_method': 'none'}).encode(), {'Content-Type': 'application/json'}))
            self.client_id = reg['client_id']
        verifier = secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
        state = secrets.token_urlsafe(24)
        self.pending_login = {'verifier': verifier, 'state': state, 'redirect_uri': redirect_uri, 'token_endpoint': meta['token_endpoint'], 'started': time.time()}
        query = urllib.parse.urlencode({'response_type': 'code', 'client_id': self.client_id, 'redirect_uri': redirect_uri, 'scope': SCOPES, 'state': state, 'code_challenge': challenge, 'code_challenge_method': 'S256', 'resource': self.mcp_url.rsplit('/mcp', 1)[0]})
        return meta['authorization_endpoint'] + '?' + query

    def finish_login(self, code, state):
        login = self.pending_login
        if not login or state != login['state'] or time.time() - login['started'] > 600:
            raise OperationError('O retorno do login não corresponde a um pedido ativo.', 'invalid_state', 400)
        body = urllib.parse.urlencode({'grant_type': 'authorization_code', 'code': code, 'redirect_uri': login['redirect_uri'], 'client_id': self.client_id, 'code_verifier': login['verifier']}).encode()
        data = json.loads(self.transport('POST', login['token_endpoint'], body, {'Content-Type': 'application/x-www-form-urlencoded'}))
        self.access_token, self.expires_at = data['access_token'], time.time() + int(data.get('expires_in', 300)) - 30
        self.refresh_token = data.get('refresh_token', '') or self.refresh_token
        self.pending_login = None
        self._save()
        return self.status()

    def _refresh(self):
        if self.access_token and time.time() < self.expires_at: return
        if not self.refresh_token:
            raise OperationError('Executor de imagem não conectado.', 'image_not_connected', 503)
        meta = self._metadata()
        body = urllib.parse.urlencode({'grant_type': 'refresh_token', 'refresh_token': self.refresh_token, 'client_id': self.client_id}).encode()
        data = json.loads(self.transport('POST', meta['token_endpoint'], body, {'Content-Type': 'application/x-www-form-urlencoded'}))
        self.access_token, self.expires_at = data['access_token'], time.time() + int(data.get('expires_in', 300)) - 30
        if data.get('refresh_token'): self.refresh_token = data['refresh_token']; self._save()

    def disconnect(self):
        self.access_token, self.refresh_token, self.session_id, self.pending_login = '', '', '', None
        if self.store:
            try: self.store.delete()
            except CredentialStoreError: pass
        return self.status()

    # ---- MCP ----
    def _http(self, method, url, payload=None, headers=None, timeout=90):
        req = urllib.request.Request(url, data=payload, method=method, headers={'User-Agent': 'AERA-AI-OFFICE/2', **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                self._last_headers = dict(response.headers)
                return response.read(20_000_000)
        except urllib.error.HTTPError as exc:
            code = {401: 'image_auth', 402: 'image_credits', 403: 'image_auth', 429: 'image_rate_limit'}.get(exc.code, 'image_provider_error')
            raise OperationError({'image_auth': 'O Magnific recusou a conexão. Conecte de novo.', 'image_credits': 'O Magnific informou saldo insuficiente.', 'image_rate_limit': 'Limite de uso do Magnific atingido.'}.get(code, f'O Magnific respondeu com erro {exc.code}.'), code, 502) from None
        except (urllib.error.URLError, OSError, ValueError):
            raise OperationError('Não foi possível alcançar o Magnific.', 'image_network', 502) from None

    def _rpc(self, method, params=None, _retry=True):
        self._refresh()
        headers = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Authorization': 'Bearer ' + self.access_token, 'MCP-Protocol-Version': '2025-06-18'}
        if self.session_id: headers['Mcp-Session-Id'] = self.session_id
        raw = self.transport('POST', self.mcp_url, json.dumps({'jsonrpc': '2.0', 'id': secrets.token_hex(4), 'method': method, 'params': params or {}}).encode(), headers)
        sid = getattr(self, '_last_headers', {}).get('Mcp-Session-Id') or getattr(self, '_last_headers', {}).get('mcp-session-id')
        if sid: self.session_id = sid
        text = raw.decode('utf-8', errors='replace').strip()
        if text.startswith('event:') or '\ndata:' in text or text.startswith('data:'):
            # Streamable HTTP may answer as SSE; the last data line carries the response.
            lines = [l[5:].strip() for l in text.splitlines() if l.startswith('data:')]
            text = lines[-1] if lines else '{}'
        data = json.loads(text or '{}')
        if 'error' in data:
            message = str(data['error'].get('message', ''))
            if 'session' in message.lower() and _retry:
                self.session_id = ''; self._initialize(); return self._rpc(method, params, _retry=False)
            raise OperationError('O Magnific recusou a chamada: ' + message[:200], 'image_provider_error', 502)
        return data.get('result', {})

    def _initialize(self):
        self._rpc('initialize', {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'aera-ai-office', 'version': '2'}})
        try: self.transport('POST', self.mcp_url, json.dumps({'jsonrpc': '2.0', 'method': 'notifications/initialized'}).encode(), {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Authorization': 'Bearer ' + self.access_token, 'Mcp-Session-Id': self.session_id, 'MCP-Protocol-Version': '2025-06-18'})
        except OperationError: pass

    def _tool(self, name, arguments):
        if not self.session_id: self._initialize()
        result = self._rpc('tools/call', {'name': name, 'arguments': arguments})
        if result.get('isError'):
            raise OperationError('O Magnific devolveu erro na ferramenta ' + name + '.', 'image_provider_error', 502)
        payload = result.get('structuredContent')
        if payload is None:
            for item in result.get('content', []):
                if item.get('type') == 'text':
                    try: payload = json.loads(item['text']); break
                    except ValueError: payload = {'text': item['text']}
        return payload or {}

    def _prompt_for_model(self, prompt):
        # magnific-one wants the subject in plain words; descriptive direction is dropped by the model anyway.
        return prompt.strip()[:300] if self.model == 'magnific-one' else prompt.strip()[:2000]

    def generate(self, prompt, channel, *, reference_path=None):
        with self.lock:
            args = {'prompt': self._prompt_for_model(prompt), 'mode': self.model, 'count': 1, **SIZES.get(channel, {'aspectRatio': '1:1'})}
            if reference_path:
                # Reference upload is a two-step flow in this server (request_upload + finalize); recorded as a limit until exercised live.
                args['_reference_note'] = 'referência local ainda não enviada'
                args.pop('_reference_note')
            queued = self._tool('images_generate', args)
            ids = [c.get('identifier') or c.get('id') for c in (queued.get('creations') or queued.get('results') or [])] or ([queued.get('identifier')] if queued.get('identifier') else [])
            ids = [i for i in ids if i]
            if not ids:
                raise OperationError('O Magnific não devolveu um identificador de criação.', 'image_provider_error', 502)
            deadline = time.time() + 240; finished = None
            while time.time() < deadline:
                waited = self._tool('creations_wait', {'identifiers': ids, 'timeoutSeconds': 55})
                results = waited.get('results') or waited.get('creations') or []
                done = [r for r in results if (r.get('status') or '').lower() in ('completed', 'done', 'success', 'ready') or r.get('url')]
                if done: finished = done[0]; break
                failed = [r for r in results if (r.get('status') or '').lower() in ('failed', 'error', 'rejected')]
                if failed:
                    raise OperationError('O Magnific não concluiu a imagem: ' + str(failed[0].get('error') or failed[0].get('status'))[:120], 'image_failed', 502)
                time.sleep(min(10, max(2, int(results[0].get('poll_after_seconds', 5)) if results else 5)))
            if not finished:
                raise OperationError('A imagem não ficou pronta a tempo. A peça continua pendente.', 'image_timeout', 504)
            url = finished.get('url') or finished.get('previewUrl')
            if not url:
                detail = self._tool('creations_get', {'creationIdentifier': ids[0]})
                url = detail.get('url') or detail.get('previewUrl')
            if not url:
                raise OperationError('O Magnific não devolveu o arquivo da imagem.', 'image_provider_error', 502)
            data = self.transport('GET', url, None, {}, 120)
            return {'bytes': data, 'model': self.model, 'meta': {'creation': ids[0], 'seed': finished.get('seed'), 'url': url, 'args': {k: v for k, v in args.items() if k != 'prompt'}}}
