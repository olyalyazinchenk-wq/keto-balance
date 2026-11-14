import ast
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT=Path('C:/Users/HP/Keto-balance')
SCRATCH=Path('C:/Users/HP/AppData/Local/hermes/cache/scratch')
RUN=Path(tempfile.mkdtemp(prefix='deepcoder-review-',dir=SCRATCH))
keys={'SYSTEMROOT','WINDIR','PATH','PATHEXT','COMSPEC','USERPROFILE','APPDATA'}
env={k:v for k,v in os.environ.items() if k.upper() in keys}
env.update({'CI':'1','KETO_LOAD_DOTENV':'0','PAYMENT_MODE':'disabled','PAYMENTS_ENABLED':'0','APP_STAGE':'test','PYTHONDONTWRITEBYTECODE':'1','PYTHONIOENCODING':'utf-8','LOCALAPPDATA':str(RUN/'localappdata'),'TMPDIR':str(RUN),'TMP':str(RUN),'TEMP':str(RUN)})
python=str(ROOT/'.venv-p0/Scripts/python.exe')
results={}
def run(name,cmd,timeout=180):
    p=subprocess.run(cmd,cwd=ROOT,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=timeout)
    text=p.stdout+'\n'+p.stderr
    (RUN/(name+'.log')).write_text(text,encoding='utf-8')
    results[name]={'exit_code':p.returncode,'log':str(RUN/(name+'.log'))}
    return p,text

# Use the previously inspected reviewer-only full discovery harness. The only
# adaptation is a new owned run root; product tests and runner are unmodified.
full_source=(SCRATCH/'pilot-f1-f4-full-backend.py').read_text(encoding='utf-8')
old="RUN=Path('C:/Users/HP/AppData/Local/hermes/cache/scratch/pilot-f1-f4-review-gy8wanyk')"
assert old in full_source
full_source=full_source.replace(old,'RUN=Path('+repr(str(RUN))+')',1)
p,text=run('full-backend-wrapper',[os.sys.executable,'-B','-c',full_source])
full_file=RUN/'backend-full-result.json'
if full_file.exists():results['backend-full']=json.loads(full_file.read_text(encoding='utf-8'))

files=sorted(str(p.relative_to(ROOT)).replace('\\','/') for p in (ROOT/'tests/frontend').glob('*.test.cjs'))
p,text=run('frontend',['node','--test','--test-reporter=tap',*files])
for k in ('tests','pass','fail','skipped','cancelled','todo'):
    m=re.search(r'^# '+k+r' (\d+)\s*$',text,re.M)
    results['frontend'][k]=int(m.group(1)) if m else None
results['frontend']['file_count']=len(files)
p,text=run('typecheck',['node','node_modules/typescript/bin/tsc','--noEmit','--incremental','false','--pretty','false'])
p,text=run('isolated-build',['node','scripts/build-isolated.mjs','--json'],timeout=240)
if p.returncode==0:
    paths=json.loads(p.stdout)
    built=json.loads(Path(paths['receipt_path']).read_text(encoding='utf-8'))
    results['isolated-build'].update({'paths':paths,'build_id':built['build_id'],'backend_fingerprint':built['backend_fingerprint'],'catalog_hash':built['catalog_hash']})
    snap=Path(paths['dist_dir']).parent
    results['isolated-build']['forbidden_bot_snapshot_files']=[str(f.relative_to(snap)) for f in (snap/'bot').rglob('*') if f.is_file() and (f.name.lower().startswith('.env') or f.suffix.lower() in {'.db','.sqlite','.sqlite3','.log'} or '__pycache__' in f.parts)]
    manifest=json.loads(Path(paths['source_manifest_path']).read_text(encoding='utf-8'))
    import hashlib
    mismatches=[name for name,digest in manifest.items() if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()[:16]!=digest]
    results['source-consistency']={'file_count':len(manifest),'mismatches':mismatches}

# Recover only a literal audit-hook string, not the executable former harness.
tree=ast.parse((SCRATCH/'pilot-f1-f4-recheck.py').read_text(encoding='utf-8'))
bootstrap=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='bootstrap' for t in n.targets))
(RUN/'outer-guard.txt').write_text(bootstrap,encoding='utf-8')

# Actual launcher configuration, timer and PID cleanup with a synthetic Server
# object, not an OS listener. All real app construction and DB calls retained.
if results.get('isolated-build',{}).get('exit_code')==0:
    program=bootstrap+'\nDIST='+repr(paths['dist_dir'])+'\nCAT='+repr(paths['test_catalog_path'])+r'''
import io,json,threading,time
from contextlib import redirect_stdout,redirect_stderr
from unittest.mock import patch
import uvicorn
from fastapi.testclient import TestClient
from bot.auth import generate_telegram_init_data
observed=[]
owner=1084557944
for name in ('run_local_preview.py','run_staging.py'):
    ns=runpy.run_path(str(Path.cwd()/'scripts'/name),run_name='review_launcher')
    captured={}
    class TimedSyntheticServer:
        def __init__(self,config):
            self.config=config;self.event=threading.Event();self._should_exit=False;captured['server']=self
        @property
        def should_exit(self):return self._should_exit
        @should_exit.setter
        def should_exit(self,value):
            self._should_exit=value
            if value:self.event.set()
        def run(self):
            captured['timer_callback_fired']=self.event.wait(timeout=4)
            if not captured['timer_callback_fired']:raise RuntimeError('Expected launcher timer did not fire')
    argv=[name,'--dist',DIST,'--catalog',CAT,'--lifetime','1']
    synthetic_key='synthetic-owned-review-key-not-a-real-token'
    if name=='run_staging.py':
        tf=owned/'synthetic-token-fixture.txt';tf.write_text(synthetic_key,encoding='utf-8')
        argv+=['--token-file',str(tf)]
    output=io.StringIO()
    before=time.monotonic()
    with patch.object(sys,'argv',argv),patch.object(uvicorn,'Server',TimedSyntheticServer),redirect_stdout(output),redirect_stderr(output):
        ns['main']()
    app=captured['server'].config.app
    with TestClient(app) as client:
        catalog=client.get('/api/catalog')
        version=client.get('/api/version')
        if name=='run_staging.py':
            signed=generate_telegram_init_data({'id':owner,'first_name':'SyntheticOwner'},synthetic_key)
            auth=client.post('/api/session',json={'init_data':signed})
        else:auth=client.get('/api/demo-session?demo_user='+str(owner))
        assert auth.status_code==200
        headers={'Authorization':'Bearer '+auth.json()['session_token']}
        session=client.get('/api/session',headers=headers)
        observed.append({'launcher':name,'assembled':True,'timer_callback_fired':captured['timer_callback_fired'],'synthetic_server_wait_s':round(time.monotonic()-before,2),'catalog_status':catalog.status_code,'recipes':len(catalog.json().get('recipes',[])),'version_status':version.status_code,'version_fingerprint':version.json().get('backendFingerprint'),'auth_status':auth.status_code,'pid_files_remaining_in_owned_run':len(list((owned/'localappdata').rglob('*.pid'))),'scope':'Real main, configuration, app, synthetic DB, timer callback and PID cleanup; OS serving boundary substituted, no listener started'})
print('LAUNCHERS '+json.dumps(observed))
'''
    p,text=run('launchers-synthetic-lifecycle',[python,'-B','-c',program])
    for line in text.splitlines():
        if line.startswith('LAUNCHERS '):results['launchers-synthetic-lifecycle']['observed']=json.loads(line[len('LAUNCHERS '):])

receipt=RUN/'receipt.json'
receipt.write_text(json.dumps({'scope':'DeepCoder independent recheck. Native full suites + typecheck + isolated build. Actual launcher assembly/timer and in-process app with synthetic data only; no live preview/listener/bot/tunnel/real secrets or database. No product edits.','run_root':str(RUN),'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'receipt':str(receipt),'results':results},ensure_ascii=False,indent=2))
