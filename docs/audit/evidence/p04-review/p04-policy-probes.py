import os, sys, json, tempfile, ast
from pathlib import Path
from unittest.mock import patch
root=Path('C:/Users/HP/Keto-balance')
scratch=Path('C:/Users/HP/AppData/Local/hermes/cache/scratch')
sys.path.insert(0,str(root));os.chdir(root)
os.environ['KETO_LOAD_DOTENV']='0'
from fastapi.testclient import TestClient
import bot.server as server
out={'scope':'Independent in-process requests against synthetic temporary files only','has_create_app':hasattr(server,'create_app'),'cases':[]}
with tempfile.TemporaryDirectory(dir=scratch) as folder:
    base=Path(folder); dist=base/'dist';dist.mkdir()
    (dist/'index.html').write_text('SYNTHETIC_INDEX',encoding='utf-8')
    private=base/'private.txt';private.write_text('SYNTHETIC_PRIVATE_SENTINEL',encoding='utf-8')
    with patch.object(server,'DIST_DIR',dist.resolve()):
        client=TestClient(server.app)
        for url,expected in [('/api/unknown',404),('/assets/missing',404),('/missing.js',404),('/some/client/route',200),('/%2e%2e%2fprivate.txt',403)]:
            response=client.get(url)
            out['cases'].append({'url':url,'expected':expected,'actual':response.status_code,'index_returned':'SYNTHETIC_INDEX' in response.text,'private_returned':'SYNTHETIC_PRIVATE_SENTINEL' in response.text})
        index=dist/'index.html'
        try:
            index.unlink(); index.symlink_to(private)
        except OSError as exc:
            out['symlink_probe']={'executed':False,'reason':type(exc).__name__,'winerror':getattr(exc,'winerror',None)}
        else:
            fallback=client.get('/other/client/route'); direct=client.get('/index.html')
            out['symlink_probe']={'executed':True,'fallback_status':fallback.status_code,'direct_status':direct.status_code,'private_returned_by_fallback':'SYNTHETIC_PRIVATE_SENTINEL' in fallback.text}
    with patch.object(server,'DIST_DIR',(base/'absent').resolve()):
        client=TestClient(server.app)
        out['absent_dist']={'health':client.get('/api/health').status_code,'ui':client.get('/').status_code,'expected_ui':503}
    tree=ast.parse((root/'bot/server.py').read_text(encoding='utf-8'))
    out['configured_hosts']=[ast.literal_eval(k.value) for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='run' for k in n.keywords if k.arg=='host' and isinstance(k.value,ast.Constant)]
(scratch/'p04-policy-probes.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print(json.dumps(out,indent=2))
