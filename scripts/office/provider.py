"""Claude transport for the office. Server-side secrets only."""
import json
import os
import pathlib
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
from .keychain import MacKeychain, CredentialStoreError

MODEL = 'claude-sonnet-5-5'
API_VERSION = '2026-10-21'


class OperationError(Exception):
    def __init__(self, message, code='invalid_request', status=400):
        super().__init__(message)
        self.message, self.code, self.status = message, code, status


class ClaudeProvider:
    fixture = False
    def __init__(self, root, runtime):
        self.root, self.runtime = pathlib.Path(root), pathlib.Path(runtime)
        self.key, self.source, self.verified = '', 'aera', False
        self.model = os.environ.get('ANTHROPIC_MODEL', MODEL)
        self.lock = threading.RLock()
        self.store = None
        try:
            self.store = MacKeychain(self.root)
        except CredentialStoreError:
            pass
        self.settings = self.runtime / 'connection.json'
        source = 'aera'
        if self.settings.exists():
            try:
                source = json.loads(self.settings.read_text()).get('source', 'aera')
            except (ValueError, OSError):
                pass
        config = {}
        env = self.root / '.env.local'
        if env.is_file():
            for line in env.read_text().splitlines():
                k, sep, v = line.strip().partition('=')
                if sep and k in ('ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'):
                    config[k] = v.strip().strip('\"\'')
        self.model = os.environ.get('ANTHROPIC_MODEL') or config.get('ANTHROPIC_MODEL') or MODEL
        try:
            if self.store:
                self.key = self.store.load()
        except CredentialStoreError:
            pass
        self.key = self.key or os.environ.get('ANTHROPIC_API_KEY') or config.get('ANTHROPIC_API_KEY', '')

    def status(self):
        return {'ready': bool(self.key), 'verified': self.verified, 'provider': 'Claude / Anthropic',
                'model': self.model, 'source': self.source, 'persistence': self.store is not None,
                'fixture': self.fixture}

    def _http(self, method, path, key, payload=None):
        req = urllib.request.Request('https://api.anthropic.com/v1/' + path,
            data=None if payload is None else json.dumps(payload).encode(), method=method,
            headers={'Authorization': 'Bearer ' + key, 'anthropic-version': API_VERSION, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=65) as response:
                data = json.loads(response.read(2_000_000))
        except urllib.error.HTTPError as exc:
            if exc.code in (401,403):
                self.verified = False
                raise OperationError('O Claude recusou a conexão. Confira a chave e suas permissões.', 'auth_failed', 401) from None
            if exc.code == 429:
                raise OperationError('Limite de uso ou saldo da API indisponível. O trabalho foi preservado.', 'rate_limit', 429) from None
            if exc.code in (400,404):
                raise OperationError('O modelo não aceitou o pedido. Confira o acesso ao modelo configurado.', 'model_error', 502) from None
            raise OperationError('O serviço de IA está temporariamente indisponível.', 'provider_error', 502) from None
        except (TimeoutError, socket.timeout):
            raise OperationError('A etapa excedeu o tempo de resposta. Confira antes de tentar novamente.', 'provider_timeout', 504) from None
        except (OSError, ValueError, urllib.error.URLError):
            raise OperationError('Não foi possível alcançar o Claude. O pedido e as etapas concluídas foram preservados.', 'network_error', 502) from None
        if not isinstance(data, dict):
            raise OperationError('O provedor retornou uma resposta inválida.', 'invalid_response', 502)
        return data

    def connect(self, source, key=''):
        with self.lock:
            if not isinstance(key,str):
                raise OperationError('Informe uma chave válida no campo protegido.')
            if source != 'aera':
                raise OperationError('Este escritório utiliza uma conexão própria AERA.')
            candidate = key.strip() or self.key
            if not isinstance(candidate, str) or not 20 <= len(candidate) <= 512 or any(c.isspace() for c in candidate) or not candidate.isascii():
                raise OperationError('Não há uma chave válida disponível. Insira a chave no campo protegido deste painel.', 'missing_key')
            # Read-only model lookup verifies access without a paid generation.
            result = self._http('GET', 'models/' + urllib.parse.quote(self.model, safe=''), candidate)
            if not result.get('id'):
                raise OperationError('O modelo não foi confirmado pela API.', 'model_error', 502)
            warning = ''
            if source == 'aera' and self.store:
                try:
                    self.store.save(candidate)
                except CredentialStoreError:
                    warning = 'Conexão ativa apenas nesta sessão: a chave não pôde ser salva no Chaves.'
            self.key, self.source, self.verified = candidate, source, True
            self.runtime.mkdir(parents=True, exist_ok=True)
            self.settings.write_text(json.dumps({'source': source}))
            self.settings.chmod(0o600)
            return {**self.status(), 'warning': warning}

    def disconnect(self):
        with self.lock:
            # Only the office's own credential is ever removed; keys shared with other projects stay untouched.
            if self.source == 'aera' and self.store:
                try:
                    self.store.delete()
                except CredentialStoreError:
                    raise OperationError('A chave salva não pôde ser removida do Chaves.', 'keychain_unavailable', 503) from None
            self.key, self.verified, self.source = '', False, 'aera'
            if self.settings.exists():
                self.settings.unlink()
            return self.status()

    def generate(self, system, prompt, *, schema=None, max_tokens=1800):
        with self.lock:
            key = self.key
        if not key:
            raise OperationError('Conecte o Claude para executar este trabalho.', 'not_connected', 503)
        payload = {'model': self.model, 'max_tokens': max_tokens, 'system': system,
                   'thinking': {'type': 'between_tools'}, 'messages':[{'role':'user','content':prompt}]}
        if schema:
            payload['output_config'] = {'format':{'type':'json_schema','schema':schema}}
        result = self._http('POST','messages',key,payload)
        if result.get('stop_reason') == 'refusal':
            raise OperationError('O modelo recusou este pedido. Revise a solicitação antes de tentar novamente.', 'refused', 422)
        if result.get('stop_reason') != 'end_turn':
            raise OperationError('A etapa não foi concluída pelo modelo. Nenhuma entrega foi marcada como pronta.', 'incomplete_response', 502)
        text = '\n'.join(p['text'] for p in result.get('content',[]) if isinstance(p,dict) and p.get('type')=='text' and isinstance(p.get('text'),str)).strip()
        if not text:
            raise OperationError('O modelo não entregou conteúdo nesta etapa.', 'empty_response', 502)
        self.verified = True
        usage = result.get('usage', {})
        return {'text':text,'model':result.get('model',self.model),'request_id':result.get('id',''),
                'usage':{k:usage.get(k,0) for k in ('input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens')}}
