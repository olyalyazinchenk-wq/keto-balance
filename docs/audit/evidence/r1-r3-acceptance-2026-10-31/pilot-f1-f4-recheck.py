import ast
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path('C:/Users/HP/Keto-balance')
SCRATCH = Path('C:/Users/HP/AppData/Local/hermes/cache/scratch')
RUN = Path(tempfile.mkdtemp(prefix='pilot-f1-f4-review-', dir=SCRATCH))
ENV_KEYS = {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'COMSPEC', 'USERPROFILE', 'APPDATA'}
env = {k: v for k, v in os.environ.items() if k.upper() in ENV_KEYS}
env.update({'CI': '1', 'KETO_LOAD_DOTENV': '0', 'PAYMENT_MODE': 'disabled', 'PAYMENTS_ENABLED': '0', 'APP_STAGE': 'test', 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONIOENCODING': 'utf-8', 'LOCALAPPDATA': str(RUN / 'localappdata'), 'TMPDIR': str(RUN), 'TMP': str(RUN), 'TEMP': str(RUN)})
python = str(ROOT / '.venv-p0/Scripts/python.exe')
results = {}

def run(name, command, timeout=150):
    p = subprocess.run(command, cwd=ROOT, env=env, text=True, encoding='utf-8', errors='replace', capture_output=True, timeout=timeout)
    text = p.stdout + '\n' + p.stderr
    log = RUN / (name + '.log')
    log.write_text(text, encoding='utf-8')
    results[name] = {'exit_code': p.returncode, 'log': str(log)}
    return p, text

files = sorted(str(p.relative_to(ROOT)).replace('\\', '/') for p in (ROOT / 'tests/frontend').glob('*.test.cjs'))
p, text = run('frontend', ['node', '--test', '--test-reporter=tap', *files])
for key in ('tests', 'pass', 'fail', 'skipped', 'cancelled', 'todo'):
    m = re.search(r'^# ' + key + r' (\d+)\s*$', text, re.M)
    results['frontend'][key] = int(m.group(1)) if m else None
results['frontend']['file_count'] = len(files)

bootstrap = r'''
import os,sys,runpy,socket
from pathlib import Path
selfpipe_code = getattr(socket, '_fallback_socketpair').__code__
owned = Path(os.environ['LOCALAPPDATA']).parent.resolve()
def audit(event,args):
    if event=='open':
        file=args[0]
        if isinstance(file,(str,bytes,os.PathLike)):
            p=Path(os.fsdecode(file)); normalized=p.resolve()
            forbidden=p.name.lower().startswith('.env') or p.name.lower() in {'bot_data.json','current_tunnel_url.txt','.tunnel_cache.json','bot.stdout.log','bot.stderr.log'} or p.suffix.lower() in {'.db','.sqlite','.sqlite3'}
            if forbidden and not normalized.is_relative_to(owned):
                raise PermissionError('Reviewer outer IO guard blocked runtime file')
    if event=='sqlite3.connect':
        value=str(args[0])
        if value!=':memory:' and not Path(value).resolve().is_relative_to(owned):
            raise PermissionError('Reviewer outer IO guard blocked non-owned database')
    if event=='socket.connect':
        address=args[1]
        frame=sys._getframe(1)
        is_selfpipe=False
        while frame is not None:
            if frame.f_code is selfpipe_code:
                is_selfpipe=True
                break
            frame=frame.f_back
        if not (is_selfpipe and isinstance(address,tuple) and address[0] in {'127.0.0.1','::1'} and address[1]>=49152):
            raise PermissionError('Reviewer outer IO guard forbids network except stdlib self-pipe')
    if event=='subprocess.Popen':
        raise PermissionError('Reviewer outer IO guard forbids child processes')
sys.addaudithook(audit)
'''

suites = ['tests.backend.test_pilot_auth_regressions','tests.backend.test_pilot_roundtrip','tests.backend.test_pilot_harness','tests.backend.test_release_version','tests.backend.test_staging_and_demo']
p, text = run('backend-targeted', [python, '-B', '-c', bootstrap + '\nsys.argv=' + repr(['scripts/run_backend_tests.py', '--suite', *suites]) + "\nrunpy.run_path('scripts/run_backend_tests.py',run_name='__main__')"])
m = re.search(r'BACKEND_RESULT tests=(\d+) failures=(\d+) errors=(\d+) skipped=(\d+)', text)
if m:
    results['backend-targeted'].update(dict(zip(('tests','failures','errors','skipped'), map(int,m.groups()))))
results['backend-targeted']['suites'] = suites

# Execute each exact launcher main up to its own validation, without starting a
# server or initializing a DB. This isolates assembly/configuration from network.
program = bootstrap + r'''
import json, io
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch
import bot.app_db
import uvicorn
root=Path.cwd()
probe_dist=owned/'launcher-empty-dist'
probe_dist.mkdir(parents=True,exist_ok=True)
(probe_dist/'index.html').write_text('<html>review fixture</html>',encoding='utf-8')
observed=[]
for script in ('run_local_preview.py','run_staging.py'):
    ns=runpy.run_path(str(root/'scripts'/script),run_name='review_launcher')
    calls={'db_initialization':0,'server_construction':0,'server_run':0}
    def record_init(*a,**kw): calls['db_initialization']+=1
    class NoServer:
        def __init__(self,*a,**kw): calls['server_construction']+=1
        def run(self): calls['server_run']+=1; raise RuntimeError('Reviewer prohibited launching a server')
    argv=[script,'--dist',str(probe_dist),'--db',str(owned/(script+'.db'))]
    if script=='run_staging.py': argv+=['--token','review-only-synthetic-noncredential']
    out=io.StringIO()
    with patch.object(sys,'argv',argv),patch.object(bot.app_db,'init_db',side_effect=record_init),patch.object(uvicorn,'Server',NoServer),redirect_stdout(out),redirect_stderr(out):
        try:
            ns['main']()
            status={'exception':None,'message':None}
        except Exception as exc:
            status={'exception':type(exc).__name__,'message':str(exc)}
    observed.append({'launcher':script,**status,'calls':calls})
print('LAUNCHER_PROBE '+json.dumps(observed))
'''
p,text=run('launcher-assembly-probe',[python,'-B','-c',program])
for line in text.splitlines():
    if line.startswith('LAUNCHER_PROBE '): results['launcher-assembly-probe']['observed']=json.loads(line[len('LAUNCHER_PROBE '):])

p,text=run('typecheck',['node','node_modules/typescript/bin/tsc','--noEmit','--incremental','false','--pretty','false'])
p,text=run('isolated-build',['node','scripts/build-isolated.mjs','--json'],timeout=210)
if p.returncode==0:
    paths=json.loads(p.stdout)
    receipt=json.loads(Path(paths['receipt_path']).read_text(encoding='utf-8'))
    results['isolated-build'].update({'paths':paths,'build_id':receipt['build_id'],'backend_fingerprint':receipt['backend_fingerprint'],'catalog_hash':receipt['catalog_hash']})
    snap=Path(paths['dist_dir']).parent
    forbidden=[str(f.relative_to(snap)) for f in (snap/'bot').rglob('*') if f.is_file() and (f.suffix.lower() in {'.db','.sqlite','.sqlite3','.log'} or f.name.startswith('.env') or '__pycache__' in f.parts)]
    results['isolated-build']['forbidden_backend_files']=forbidden
    catalog=json.loads((Path(paths['dist_dir'])/'released-catalog.json').read_text(encoding='utf-8'))
    sidecar=json.loads(Path(paths['test_catalog_path']).read_text(encoding='utf-8'))
    results['isolated-build']['dist_catalog']={'test_only':catalog.get('test_only'),'recipe_count':len(catalog.get('recipes',[])),'released_ids_count':len(catalog.get('released_ids',[]))}
    results['isolated-build']['sidecar_catalog']={'test_only':sidecar.get('test_only'),'recipe_count':len(sidecar.get('recipes',[])),'released_ids_count':len(sidecar.get('released_ids',[]))}
    version_program=bootstrap+"\nDIST="+repr(paths['dist_dir'])+r'''
import json
from fastapi.testclient import TestClient
from bot.app_settings import AppSettings
from bot.server import create_app
from bot.app_db import init_db
folder=Path(DIST)
db=owned/'version-and-catalog.db'
init_db(db)
release=json.loads((folder/'release.json').read_text(encoding='utf-8'))
observed=[]
for stage in ('test','staging'):
    settings=AppSettings(app_stage=stage,telegram_bot_token='review-only-synthetic-noncredential',db_path=db,dist_dir=folder)
    app=create_app(dist_dir=folder,db_path=db,settings=settings)
    with TestClient(app) as client:
        response=client.get('/api/version')
        catalog=client.get('/api/catalog')
        data=catalog.json()
        observed.append({'stage':stage,'version_status':response.status_code,'expected_fingerprint':release.get('backendFingerprint'),'actual_fingerprint':response.json().get('backendFingerprint'),'match':release.get('backendFingerprint')==response.json().get('backendFingerprint'),'catalog_status':catalog.status_code,'catalog_recipes':len(data.get('recipes',[])),'test_only':data.get('test_only')})
print('VERSION_CATALOG '+json.dumps(observed))
'''
    p,text=run('version-and-default-catalog',[python,'-B','-c',version_program])
    for line in text.splitlines():
        if line.startswith('VERSION_CATALOG '): results['version-and-default-catalog']['observed']=json.loads(line[len('VERSION_CATALOG '):])

claim=json.loads((ROOT/'docs/release/evidence/k2-pilot-receipt.json').read_text(encoding='utf-8'))
named=claim['test_results']['backend_stage_suites']
source_tests={}
for f in sorted((ROOT/'tests/backend').glob('test_*.py')):
    tree=ast.parse(f.read_text(encoding='utf-8-sig'))
    source_tests[f.stem]=sum(isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name.startswith('test_') for n in ast.walk(tree))
results['receipt-accounting']={'claimed_backend_total':claim['test_results']['backend_total_passed'],'sum_named_suite_counts':sum(x['count'] for x in named.values()),'named_suite_count':len(named),'ast_test_method_count_not_execution':sum(source_tests.values()),'file_count':len(source_tests)}
receipt=RUN/'receipt.json'
receipt.write_text(json.dumps({'scope':'Independent native frontend, selected backend under outer IO guard, launcher main with only DB and Server boundaries stubbed; fresh isolated build; TestClient synthetic DB; no live server, bot, tunnel, secrets, real database, or messages','results':results},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'receipt':str(receipt),'results':results},ensure_ascii=False,indent=2))
