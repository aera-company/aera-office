"""NAYRA voice access (C79): the ElevenLabs key stays on this Mac and each conversation gets a short-lived credential.

With authentication on in the ElevenLabs agent, a conversation opens only with a token (WebRTC) or a signed URL
(WebSocket) made here, so the agent ID alone, even if public, is not enough to talk to her or spend credits.
The key is typed by Tiago in the office dialog, kept in the macOS Keychain and never returned to the browser.
"""
import hashlib
import json
import pathlib
import re
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
from .keychain import MacKeychain, CredentialStoreError
from .provider import OperationError

API = 'https://api.elevenlabs.io/v1/convai/conversation/'
TTS = 'https://api.elevenlabs.io/v1/text-to-speech/'
TTS_MODEL = 'eleven_multilingual_v2'
TTS_SETTINGS = {'stability': 0.75, 'similarity_boost': 0.85, 'speed': 1.0}
TTS_MAX_CHARS = 600
# How the ElevenLabs panel names the permissions its errors mention.
PERMISSIONS = {'text_to_speech': 'Text to Speech', 'convai_read': 'ElevenLabs Agents (Read)', 'convai_write': 'ElevenLabs Agents (Write)'}


class VoiceAccess:
    fixture = False

    def __init__(self, root, runtime, store=None, opener=None):
        self.root, self.runtime = pathlib.Path(root), pathlib.Path(runtime)
        self.lock = threading.RLock()
        self.opener = opener or urllib.request.urlopen
        self.store = store
        if store is None:
            try:
                self.store = MacKeychain(self.root, kind='elevenlabs', account='elevenlabs-api-key',
                                         label='AERA AI OFFICE · voz da NAYRA (ElevenLabs)')
            except CredentialStoreError:
                self.store = None
        self.key = ''
        try:
            if self.store:
                self.key = self.store.load()
        except CredentialStoreError:
            pass

    def status(self):
        return {'ready': bool(self.key), 'persistence': self.store is not None}

    def agent_id(self, tiago=False):
        """C84: two agents. Outside presentation it is Tiago talking, with the whole office; in presentation, the
        client agent that knows only the presented client. Without a Tiago agent configured, the client one serves both."""
        file = self.runtime / 'nayra-agent.json'
        if not file.is_file():
            raise OperationError('O agente de voz da NAYRA ainda não foi criado.', 'not_found', 404)
        config = json.loads(file.read_text())
        return (tiago and config.get('agent_id_tiago')) or config['agent_id']

    def _get(self, path, agent_id, key):
        url = API + path + '?' + urllib.parse.urlencode({'agent_id': agent_id})
        return self._send(urllib.request.Request(url, headers={'xi-api-key': key}, method='GET'))

    def _send(self, request, raw=False):
        try:
            with self.opener(request, timeout=30 if raw else 15) as response:
                if raw:
                    return response.read(5_000_000)
                data = json.loads(response.read(200_000))
        except urllib.error.HTTPError as exc:
            try:
                detail = json.loads(exc.read(20_000) or b'{}').get('detail') or {}
            except (ValueError, OSError, AttributeError):
                detail = {}
            if not isinstance(detail, dict):
                detail = {}
            # A valid key without the right permission also answers 401; say which permission, from ElevenLabs itself.
            if detail.get('status') == 'missing_permissions':
                found = re.search(r'permission (\w+)', str(detail.get('message', '')))
                name = PERMISSIONS.get(found.group(1), found.group(1)) if found else 'necessária'
                raise OperationError(f'A chave do ElevenLabs é válida, mas falta a permissão {name}.', 'auth_failed', 403) from None
            # An invalid key comes back as 400 with an authentication error, not only as 401.
            if exc.code == 401 or detail.get('type') == 'authentication_error':
                raise OperationError('O ElevenLabs recusou a chave. Confira se ela foi copiada inteira.', 'auth_failed', 401) from None
            if exc.code == 403:
                raise OperationError('A chave não tem permissão para os agentes. No ElevenLabs, libere "ElevenLabs Agents" nessa chave.', 'auth_failed', 403) from None
            if exc.code in (404, 422):
                raise OperationError('O ElevenLabs não encontrou o agente da NAYRA com essa chave.', 'not_found', 404) from None
            raise OperationError('O ElevenLabs está indisponível agora. Tente de novo em instantes.', 'provider_error', 502) from None
        except (TimeoutError, socket.timeout, OSError, ValueError, urllib.error.URLError):
            raise OperationError('Não foi possível alcançar o ElevenLabs.', 'network_error', 502) from None
        if not isinstance(data, dict):
            raise OperationError('O ElevenLabs retornou uma resposta inválida.', 'invalid_response', 502)
        return data

    def connect(self, key):
        with self.lock:
            candidate = key.strip() if isinstance(key, str) else ''
            if not 20 <= len(candidate) <= 512 or any(c.isspace() for c in candidate) or not candidate.isascii():
                raise OperationError('Insira a chave do ElevenLabs no campo protegido deste painel.', 'missing_key')
            # Asking for a token proves the key reaches this agent; no conversation starts and no credit is spent.
            if not self._get('token', self.agent_id(), candidate).get('token'):
                raise OperationError('O ElevenLabs não confirmou o acesso ao agente.', 'invalid_response', 502)
            warning = ''
            if self.store:
                try:
                    self.store.save(candidate)
                except CredentialStoreError:
                    warning = 'Voz conectada só nesta sessão: a chave não pôde ser salva no Chaves.'
            else:
                warning = 'Voz conectada só nesta sessão: o Chaves do macOS não está disponível.'
            self.key = candidate
            return {**self.status(), 'warning': warning}

    def disconnect(self):
        with self.lock:
            if self.store:
                try:
                    self.store.delete()
                except CredentialStoreError:
                    raise OperationError('A chave de voz não pôde ser removida do Chaves.', 'keychain_unavailable', 503) from None
            self.key = ''
            return self.status()

    def speak(self, text):
        """C80: the daily briefing in the NAYRA voice. One mp3 per sentence, cached so "Ouvir de novo" costs nothing."""
        text = ' '.join(str(text or '').split())
        if not 1 <= len(text) <= TTS_MAX_CHARS:
            raise OperationError('Texto de fala inválido.', 'invalid_request', 400)
        with self.lock:
            key = self.key
        if not key:
            raise OperationError('Sem chave de voz salva no escritório.', 'not_connected', 409)
        config = json.loads((self.runtime / 'nayra-agent.json').read_text()) if (self.runtime / 'nayra-agent.json').is_file() else {}
        voice_id = config.get('voice_id', '')
        if not voice_id:
            raise OperationError('A voz da NAYRA não está configurada no escritório.', 'not_found', 404)
        cache = self.runtime / 'nayra-voz-cache'
        name = hashlib.sha256('|'.join((voice_id, TTS_MODEL, json.dumps(TTS_SETTINGS, sort_keys=True), text)).encode()).hexdigest()[:32] + '.mp3'
        file = cache / name
        if file.is_file():
            file.touch()
            return file.read_bytes()
        body = json.dumps({'text': text, 'model_id': TTS_MODEL, 'language_code': 'pt', 'voice_settings': TTS_SETTINGS}).encode()
        request = urllib.request.Request(TTS + urllib.parse.quote(voice_id, safe='') + '?output_format=mp3_44100_128', data=body,
                                         headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'}, method='POST')
        audio = self._send(request, raw=True)
        if not audio:
            raise OperationError('O ElevenLabs não devolveu o áudio.', 'invalid_response', 502)
        cache.mkdir(parents=True, exist_ok=True, mode=0o700)
        file.write_bytes(audio)
        # Keep the cache small: the newest 300 sentences stay.
        for old in sorted(cache.glob('*.mp3'), key=lambda f: f.stat().st_mtime)[:-300]:
            old.unlink(missing_ok=True)
        return audio

    def session(self, connection='webrtc', tiago=False):
        """What the browser needs to open one conversation. Without a saved key it falls back to the public agent ID."""
        agent_id = self.agent_id(tiago)
        with self.lock:
            key = self.key
        if not key:
            return {'agent_id': agent_id, 'protected': False, 'profile': self.profile(agent_id)}
        if connection == 'websocket':
            url = self._get('get-signed-url', agent_id, key).get('signed_url', '')
            if not url.startswith('wss://'):
                raise OperationError('O ElevenLabs não devolveu o endereço da conversa.', 'invalid_response', 502)
            return {'signed_url': url, 'protected': True, 'profile': self.profile(agent_id)}
        token = self._get('token', agent_id, key).get('token', '')
        if not token:
            raise OperationError('O ElevenLabs não devolveu a senha da conversa.', 'invalid_response', 502)
        return {'token': token, 'protected': True, 'profile': self.profile(agent_id)}

    def profile(self, agent_id):
        return 'tiago' if agent_id == self.agent_id(True) and agent_id != self.agent_id(False) else 'apresentacao'
