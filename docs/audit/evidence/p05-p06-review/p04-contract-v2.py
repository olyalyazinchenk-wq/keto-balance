import os, sys, tempfile, json
from pathlib import Path
root=Path('C:/Users/HP/Keto-balance'); scratch=Path('C:/Users/HP/AppData/Local/hermes/cache/scratch')
sys.path.insert(0,str(root));os.environ['KETO_LOAD_DOTENV']='0'
from fastapi.testclient import TestClient
from bot.server import create_app
out={'scope':'In-process HTTP probes using create_app and synthetic files only','cases':[]}
with tempfile.TemporaryDirectory(dir=scratch) as directory:
    base=Path(directory);dist=base/'dist';dist.mkdir()
    (dist/'index.html').write_text('SYNTHETIC_INDEX',encoding='utf-8')
    client=TestClient(create_app(dist))
    for url,expected in [('/api/unknown',404),('/api',404),('/assets/missing',404),('/missing.js',404),('/some/client/route',200)]:
        response=client.get(url)
        out['cases'].append({'url':url,'expected':expected,'actual':response.status_code,'returns_index':'SYNTHETIC_INDEX' in response.text})
    absent=TestClient(create_app(base/'absent'))
    out['absent_dist']={'health':absent.get('/api/health').status_code,'ui':absent.get('/').status_code}
(scratch/'p04-contract-v2-results.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print(json.dumps(out,indent=2))
