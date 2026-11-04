"""Explicit browser-test fixture. Never included in the normal launcher."""
import pathlib
import sys
import time
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from test_operation import serve_demo
from fixtures import ContentFixture

class VisibleFixture(ContentFixture):
    def generate(self,*args,**kwargs):
        time.sleep(.9)
        return super().generate(*args,**kwargs)

if __name__=='__main__':
    from office.image_provider import FixtureImageProvider
    provider=VisibleFixture(clarify=True)
    server=serve_demo.create_server(8092,'/private/tmp/aera-operation-fixture',provider,image_provider=FixtureImageProvider(delay=.6))
    print('TESTE SEM IA REAL: http://127.0.0.1:8092/',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
