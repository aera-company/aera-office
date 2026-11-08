"""App-scoped macOS Keychain storage; secrets never enter argv or project files."""
import contextlib
import ctypes as c
import hashlib
import sys


class CredentialStoreError(Exception):
    pass


class MacKeychain:
    def __init__(self, project, service=None, kind='claude', account='anthropic-api-key', label='AERA AI OFFICE — Claude API'):
        if sys.platform != 'darwin':
            raise CredentialStoreError('Chaves do macOS indisponível.')
        scope = hashlib.sha256(str(project.resolve()).encode()).hexdigest()[:16]
        self.service = service or f'com.aera.ai-office.{kind}.' + scope
        self.account, self.label = account, label
        try:
            self.cf = c.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
            self.sec = c.CDLL('/System/Library/Frameworks/Security.framework/Security')
            signatures = {
                'CFStringCreateWithCString': ([c.c_void_p, c.c_char_p, c.c_uint32], c.c_void_p),
                'CFDataCreate': ([c.c_void_p, c.c_void_p, c.c_long], c.c_void_p),
                'CFDictionaryCreate': ([c.c_void_p, c.POINTER(c.c_void_p), c.POINTER(c.c_void_p), c.c_long, c.c_void_p, c.c_void_p], c.c_void_p),
                'CFRelease': ([c.c_void_p], None),
                'CFDataGetLength': ([c.c_void_p], c.c_long),
                'CFDataGetBytePtr': ([c.c_void_p], c.c_void_p),
                'CFGetTypeID': ([c.c_void_p], c.c_ulong),
                'CFDataGetTypeID': ([], c.c_ulong),
            }
            for name, (args, result) in signatures.items():
                fn = getattr(self.cf, name)
                fn.argtypes, fn.restype = args, result
            for name, args in {
                'SecItemCopyMatching': [c.c_void_p, c.POINTER(c.c_void_p)],
                'SecItemAdd': [c.c_void_p, c.POINTER(c.c_void_p)],
                'SecItemUpdate': [c.c_void_p, c.c_void_p],
                'SecItemDelete': [c.c_void_p],
            }.items():
                fn = getattr(self.sec, name)
                fn.argtypes, fn.restype = args, c.c_int32
        except (OSError, AttributeError):
            raise CredentialStoreError('Chaves do macOS indisponível.') from None

    def constant(self, name):
        return c.c_void_p.in_dll(self.cf if name.startswith('kCF') else self.sec, name).value

    @contextlib.contextmanager
    def dictionary(self, values):
        owned = []
        dictionary = None
        try:
            keys, refs = [], []
            for name, value in values.items():
                keys.append(self.constant(name))
                if isinstance(value, str):
                    ref = self.cf.CFStringCreateWithCString(None, value.encode(), 0x08000100)
                    owned.append(ref)
                elif isinstance(value, bytes):
                    ref = self.cf.CFDataCreate(None, c.create_string_buffer(value), len(value))
                    owned.append(ref)
                else:
                    ref = value
                if not ref:
                    raise CredentialStoreError('Não foi possível acessar o Chaves do macOS.')
                refs.append(ref)
            n = len(keys)
            dictionary = self.cf.CFDictionaryCreate(None, (c.c_void_p*n)(*keys), (c.c_void_p*n)(*refs), n,
                c.addressof(c.c_void_p.in_dll(self.cf, 'kCFTypeDictionaryKeyCallBacks')),
                c.addressof(c.c_void_p.in_dll(self.cf, 'kCFTypeDictionaryValueCallBacks')))
            if not dictionary:
                raise CredentialStoreError('Não foi possível acessar o Chaves do macOS.')
            yield dictionary
        finally:
            if dictionary:
                self.cf.CFRelease(dictionary)
            for ref in owned:
                if ref:
                    self.cf.CFRelease(ref)

    def query(self):
        return {'kSecClass': self.constant('kSecClassGenericPassword'),
                'kSecAttrService': self.service, 'kSecAttrAccount': self.account}

    @staticmethod
    def check(status):
        if status:
            # Never expose native errors, credential values or query details.
            raise CredentialStoreError('Não foi possível acessar o Chaves do macOS.')

    def load(self):
        query = {**self.query(), 'kSecReturnData': self.constant('kCFBooleanTrue'),
                 'kSecMatchLimit': self.constant('kSecMatchLimitOne')}
        result = c.c_void_p()
        with self.dictionary(query) as attrs:
            status = self.sec.SecItemCopyMatching(attrs, c.byref(result))
        if status == -25300:  # errSecItemNotFound
            return ''
        self.check(status)
        try:
            if not result or self.cf.CFGetTypeID(result) != self.cf.CFDataGetTypeID():
                raise CredentialStoreError('A chave salva não pôde ser lida.')
            raw = c.string_at(self.cf.CFDataGetBytePtr(result), self.cf.CFDataGetLength(result))
            try:
                return raw.decode('utf-8')
            except UnicodeError:
                raise CredentialStoreError('A chave salva não pôde ser lida.') from None
        finally:
            if result:
                self.cf.CFRelease(result)

    def save(self, key):
        value = {'kSecValueData': key.encode('utf-8')}
        with self.dictionary(self.query()) as query, self.dictionary(value) as attrs:
            status = self.sec.SecItemUpdate(query, attrs)
            if status == -25300:
                with self.dictionary({**self.query(), **value, 'kSecAttrLabel': self.label}) as new:
                    status = self.sec.SecItemAdd(new, None)
                if status == -25299:  # A concurrent creator won; update only our item.
                    status = self.sec.SecItemUpdate(query, attrs)
            self.check(status)

    def delete(self):
        with self.dictionary(self.query()) as query:
            status = self.sec.SecItemDelete(query)
        if status != -25300:
            self.check(status)
