import ast
import json
import os
from pathlib import Path
import subprocess
import re

ROOT=Path('C:/Users/HP/Keto-balance')
RUN=Path('C:/Users/HP/AppData/Local/hermes/cache/scratch/pilot-f1-f4-review-gy8wanyk')
source=Path('C:/Users/HP/AppData/Local/hermes/cache/scratch/pilot-f1-f4-recheck.py').read_text(encoding='utf-8')
tree=ast.parse(source)
bootstrap=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='bootstrap' for t in n.targets))
# Only reviewed Python -c unit-test children may start, and each gets the same
# audit hook before its original code. No serving process or application network.
child_bootstrap='# REVIEWER_ISOLATED_CHILD\n'+bootstrap
parent_bootstrap=bootstrap.replace("if event=='subprocess.Popen':\n        raise PermissionError('Reviewer outer IO guard forbids child processes')", "if event=='subprocess.Popen' and not globals().get('_review_approved_child_launch', False):\n        raise PermissionError('Reviewer outer IO guard forbids unapproved child processes')")
program=parent_bootstrap+'\nREVIEW_CHILD_BOOTSTRAP='+repr(child_bootstrap)+r'''
import subprocess
OriginalPopen=subprocess.Popen
class GuardedPopen(OriginalPopen):
    def __init__(self, args, *a, **kw):
        if not isinstance(args,(list,tuple)):
            raise PermissionError('Reviewer forbids shell/string child commands')
        argv=list(args)
        if Path(argv[0]).resolve()!=Path(sys.executable).resolve() or '-c' not in argv:
            raise PermissionError('Reviewer permits only isolated Python code children')
        i=argv.index('-c')
        original_code=argv[i+1]
        if not ('bot.config' in original_code or 'STRICT_IMPORT_OK' in original_code or original_code in {'raise SystemExit(77)', 'raise SystemExit(7)'}):
            raise PermissionError('Unreviewed Python child source')
        child_env=kw.get('env') or os.environ
        if child_env.get('KETO_LOAD_DOTENV')!='0':
            raise PermissionError('Python child no-dotenv policy missing')
        argv[i+1]=REVIEW_CHILD_BOOTSTRAP+'\n'+original_code
        globals()['_review_approved_child_launch']=True
        try:
            super().__init__(argv,*a,**kw)
        finally:
            globals()['_review_approved_child_launch']=False
subprocess.Popen=GuardedPopen
sys.argv=['scripts/run_backend_tests.py']
runpy.run_path('scripts/run_backend_tests.py',run_name='__main__')
'''
keys={'SYSTEMROOT','WINDIR','PATH','PATHEXT','COMSPEC','USERPROFILE','APPDATA'}
env={k:v for k,v in os.environ.items() if k.upper() in keys}
env.update({'CI':'1','KETO_LOAD_DOTENV':'0','PAYMENT_MODE':'disabled','PAYMENTS_ENABLED':'0','APP_STAGE':'test','PYTHONDONTWRITEBYTECODE':'1','PYTHONIOENCODING':'utf-8','LOCALAPPDATA':str(RUN/'full-localappdata'),'TMPDIR':str(RUN),'TMP':str(RUN),'TEMP':str(RUN)})
p=subprocess.run([str(ROOT/'.venv-p0/Scripts/python.exe'),'-B','-c',program],cwd=ROOT,env=env,text=True,encoding='utf-8',errors='replace',capture_output=True,timeout=150)
text=p.stdout+'\n'+p.stderr
log=RUN/'backend-full.log'
log.write_text(text,encoding='utf-8')
result={'exit_code':p.returncode,'log':str(log),'scope':'Real full backend unittest discovery; outer Python IO audit guard also injected into reviewed Python -c child probes. No serving process, real DB/env/participant data or application network.'}
m=re.search(r'BACKEND_RESULT tests=(\d+) failures=(\d+) errors=(\d+) skipped=(\d+)',text)
if m:result.update(dict(zip(('tests','failures','errors','skipped'),map(int,m.groups()))))
(RUN/'backend-full-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
if p.returncode:print(text[-18000:])
