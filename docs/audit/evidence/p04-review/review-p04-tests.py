import os, sys, json, unittest, tempfile
from pathlib import Path
root=Path('C:/Users/HP/Keto-balance')
scratch=Path('C:/Users/HP/AppData/Local/hermes/cache/scratch')
os.chdir(root)
sys.path.insert(0,str(root))
os.environ['KETO_LOAD_DOTENV']='0'
os.environ.pop('PYTHONPATH',None)
os.environ['PYTHONDONTWRITEBYTECODE']='1'
for key in ['TMP','TEMP','TMPDIR']:
    os.environ[key]=str(scratch)
tempfile.tempdir=str(scratch)
attempts=[]
def guard(event,args):
    forbidden=False
    if event=='open' and args and isinstance(args[0],(str,bytes,os.PathLike)):
        name=Path(os.fsdecode(args[0])).name
        forbidden=name=='.env' or (name.startswith('.env.') and name!='.env.example')
    if event=='sqlite3.connect' and args:
        value=str(args[0])
        forbidden=value!=':memory:' and not Path(value).resolve().is_relative_to(scratch.resolve())
    if event in {'socket.connect','socket.getaddrinfo'}:
        # Windows asyncio uses a loopback socketpair for its event loop.
        # Allow only the stdlib socketpair call stack, never app requests.
        frame=sys._getframe()
        internal=False
        while frame is not None:
            if frame.f_code.co_name=='_fallback_socketpair' and frame.f_globals.get('__name__')=='socket':
                internal=True
                break
            frame=frame.f_back
        address=args[1] if event=='socket.connect' and len(args)>1 else None
        is_loopback=isinstance(address,tuple) and address[0] in {'127.0.0.1','::1'}
        forbidden=not (event=='socket.connect' and internal and is_loopback)
    if forbidden:
        attempts.append(event)
        raise RuntimeError('Review guard blocked forbidden side effect')
sys.addaudithook(guard)
suite=unittest.defaultTestLoader.discover(str(root/'tests/backend'),pattern='test_*.py')
result=unittest.TextTestRunner(verbosity=2).run(suite)
out={'run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'passed':result.testsRun-len(result.failures)-len(result.errors)-len(result.skipped),'forbidden_attempts':attempts,'successful':result.wasSuccessful() and not attempts}
(scratch/'p04-review-test-results.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print('STRUCTURED_RESULTS',json.dumps(out))
sys.exit(0 if out['successful'] else 1)
