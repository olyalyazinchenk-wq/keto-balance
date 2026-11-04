"""Reviewer-only R1-R3 probes; no product writes or listening server."""
import copy
import json
import os
from pathlib import Path
import subprocess

ROOT = Path('C:/Users/HP/Keto-balance')
SCRATCH = Path('C:/Users/HP/AppData/Local/hermes/cache/scratch')
RUN = Path('C:\\Users\\HP\\AppData\\Local\\hermes\\cache\\scratch\\deepcoder-review-51tfowfr')
OLD = 'C:/Users/HP/AppData/Local/hermes/cache/scratch/deepcoder-review-_yyezbxb'
keys = {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'COMSPEC', 'USERPROFILE', 'APPDATA'}
env = {k: v for k, v in os.environ.items() if k.upper() in keys}
env.update({'CI': '1', 'KETO_LOAD_DOTENV': '0', 'APP_STAGE': 'test', 'PAYMENTS_ENABLED': '0', 'PAYMENT_MODE': 'disabled', 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONIOENCODING': 'utf-8', 'LOCALAPPDATA': str(RUN / 'probe-localappdata'), 'TMPDIR': str(RUN), 'TMP': str(RUN), 'TEMP': str(RUN)})
# Browser binaries are already installed here; keep profile and temp data owned.
env['PLAYWRIGHT_BROWSERS_PATH'] = 'C:/Users/HP/AppData/Local/ms-playwright'
results = {}

def execute(label, args, timeout=100):
    completed = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)
    output = completed.stdout + '\n' + completed.stderr
    log = RUN / (label + '.log')
    log.write_text(output, encoding='utf-8')
    results[label] = {'exit_code': completed.returncode, 'log': str(log)}
    if completed.returncode:
        print(label + ' ERROR ' + output[-6000:])
    return completed

helper = (SCRATCH / 'deepcoder-helper-probes.cjs').read_text(encoding='utf-8').replace(OLD, RUN.as_posix())
helper += r'''
const oneState=structuredClone(baseState);
oneState.menu.days=oneState.menu.days.slice(0,1);oneState.menu.numDays=1;
const oneProfile=structuredClone(pack.profile);oneProfile.settings.planDays=1;
const oneItems=rebuildShoppingFromMenu(oneState.menu,map,[],1);
const unitCatalog=structuredClone(catalog);
unitCatalog.recipes=[structuredClone(catalog.recipes[0])];
unitCatalog.released_ids=[unitCatalog.recipes[0].id];
unitCatalog.recipes[0].ing=[['Synthetic unit fixture','1000 г']];
const unitState=structuredClone(oneState);
unitState.menu.meals=1;unitState.menu.days[0].slots={breakfast:unitCatalog.recipes[0].id};
const unitMap=Object.fromEntries(unitCatalog.recipes.map(r=>[r.id,toRecipeViewModel(r)]));
const unitItems=rebuildShoppingFromMenu(unitState.menu,unitMap,[],1);
const wrongUnit=structuredClone(unitItems);wrongUnit[0].amountLabel='1000 кг';
const twiceState=structuredClone(baseState);twiceState.shopping_batches=2;
const cases=[
 {name:'three_day_correct_x1',expected_consistent:true,catalog,profile:pack.profile,state:baseState,items:pack.shop1},
 {name:'three_day_correct_x2',expected_consistent:true,catalog,profile:pack.profile,state:twiceState,items:pack.shop2},
 {name:'one_day_correct',expected_consistent:true,catalog,profile:oneProfile,state:oneState,items:oneItems},
 {name:'three_day_menu_one_day_quantities',expected_consistent:false,catalog,profile:pack.profile,state:baseState,items:oneItems},
 {name:'one_day_missing_ingredient',expected_consistent:false,catalog,profile:oneProfile,state:oneState,items:oneItems.slice(1)},
 {name:'normalized_unit_correct',expected_consistent:true,catalog:unitCatalog,profile:oneProfile,state:unitState,items:unitItems},
 {name:'wrong_unit_same_raw_number',expected_consistent:false,catalog:unitCatalog,profile:oneProfile,state:unitState,items:wrongUnit}
];
fs.writeFileSync(run+'/consistency-inputs.json',JSON.stringify(cases,null,2));
console.log(JSON.stringify({generated_cases:cases.length,source:'Actual current menu controller, recipesAdapter, rebuildShoppingFromMenu; synthetic recipe for isolated unit normalization only'}));
'''
execute('current-helper', ['node', '-e', helper])

bootstrap = (RUN / 'outer-guard.txt').read_text(encoding='utf-8')
backend = bootstrap + '\nRUN=' + repr(str(RUN)) + r'''
import copy,json,uuid
from fastapi.testclient import TestClient
from bot.server import create_app
from bot.app_settings import AppSettings
from bot.app_db import init_db,get_pilot_user
from bot.catalog import CatalogService,is_shopping_consistent_with_menu
run=Path(RUN)
cases=json.loads((run/'consistency-inputs.json').read_text(encoding='utf-8'))
observations=[]
for case in cases:
    db=owned/('r1-'+uuid.uuid4().hex+'.db')
    init_db(db)
    settings=AppSettings(app_stage='test',allow_demo_auth=True,telegram_bot_token='synthetic-review-fixture-not-real-key',db_path=db,dist_dir=owned)
    service=CatalogService(owned,provider=lambda c=case:c['catalog'],app_stage='test')
    predicate=is_shopping_consistent_with_menu(case['state']['menu'],case['state']['shopping_batches'],case['items'],service)
    app=create_app(settings=settings,db_path=db,dist_dir=owned,catalog_provider=lambda c=case:c['catalog'])
    with TestClient(app) as client:
        auth=client.get('/api/demo-session?demo_user=9001');assert auth.status_code==200
        headers={'Authorization':'Bearer '+auth.json()['session_token']}
        user_payload={'schema_version':1,'expected_revision':0,'profile':case['profile'],'state':case['state']}
        first=client.put('/api/user',headers=headers,json=user_payload);assert first.status_code==200,first.text
        shopping=client.put('/api/shopping',headers=headers,json={'schema_version':1,'expected_revision':0,'items':case['items']});assert shopping.status_code==200,shopping.text
        user_payload['expected_revision']=first.json()['revision']
        paired=client.put('/api/user',headers=headers,json=user_payload);assert paired.status_code==200,paired.text
        reloaded=client.get('/api/user',headers=headers);assert reloaded.status_code==200
        other_auth=client.get('/api/demo-session?demo_user=9001');assert other_auth.status_code==200
        other=client.get('/api/user',headers={'Authorization':'Bearer '+other_auth.json()['session_token']});assert other.status_code==200
        raw=get_pilot_user(9001,db_path=db)
        saved_shopping=client.get('/api/shopping',headers=headers).json()
        observations.append({'name':case['name'],'expected_consistent':case['expected_consistent'],'predicate_consistent':predicate,'http_put_statuses':[first.status_code,shopping.status_code,paired.status_code],'get_shopping_stale':reloaded.json()['state']['shopping_stale'],'new_session_shopping_stale':other.json()['state']['shopping_stale'],'persisted_shopping_stale':raw['state']['shopping_stale'],'shopping_roundtrip_exact':saved_shopping['items']==case['items'],'expectation_pass':predicate==case['expected_consistent'] and other.json()['state']['shopping_stale']==(not case['expected_consistent']),'first_item':case['items'][0]})
report={'scope':'Actual current helpers generated payloads -> unmodified in-process FastAPI -> fresh owned SQLite -> reload and new synthetic session. No listening server or real data. Unit fixtures are not nutrition claims.','cases':observations,'passed':sum(o['expectation_pass'] for o in observations),'total':len(observations)}
(run/'r1-backend-consistency.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('CURRENT_R1 '+json.dumps(report,ensure_ascii=False))
'''
execute('current-r1-backend', [str(ROOT / '.venv-p0/Scripts/python.exe'), '-B', '-c', backend])

ui = (SCRATCH / 'deepcoder-ui-interleave.cjs').read_text(encoding='utf-8').replace(OLD, RUN.as_posix())
# Retain original custom-item + bootstrap probes; add deterministic delayed
# checkbox saves with the same real built UI and the same synthetic CAS route.
ui = ui.replace('holdShopping=false}={})', 'holdShopping=false,holdAllShopping=false,shopping=null}={})')
ui = ui.replace("shop:{schema_version:1,user_id:uid,revision:2,items:structuredClone(pack.shop1)}", "shop:shopping?structuredClone(shopping):{schema_version:1,user_id:uid,revision:2,items:structuredClone(pack.shop1)}")
ui = ui.replace('const controls={releaseShopping:null,held:false};', 'const controls={releaseShopping:null,held:false,pending:[]};')
marker = "if(holdShopping&&!controls.held){controls.held=true;await new Promise(resolve=>controls.releaseShopping=resolve);}"
assert marker in ui
ui = ui.replace(marker, "if(holdAllShopping){await new Promise(resolve=>controls.pending.push(resolve));}\n     " + marker)
insert = r'''
 // R2: A checked, B checked while A is pending, then A unchecked while B is pending.
 // A prior completion must not make the subsequent edit erase B's newer check.
 const marks=await setup({holdAllShopping:true});
 await marks.page.locator('[data-testid="food-today"]').waitFor();
 await marks.page.locator('[data-testid="bottom-nav-shopping"]').click();
 const aid=pack.shop1[0].id,bid=pack.shop1[1].id;
 const a=marks.page.getByTestId('toggle-in-store-'+aid);
 const b=marks.page.getByTestId('toggle-in-store-'+bid);
 const waitHeld=async()=>{
  for(let i=0;i<200;i++){if(marks.controls.pending.length)return;await new Promise(r=>setTimeout(r,10));}
  throw new Error('Expected held checkbox request did not arrive');
 };
 const release=async()=>{await waitHeld();marks.controls.pending.shift()();};
 const read=async()=>({a:await a.getAttribute('aria-pressed'),b:await b.getAttribute('aria-pressed')});
 await a.click();await waitHeld();
 await b.click();
 const afterUserChecksAB=await read();
 await release();await waitHeld();
 await marks.page.waitForFunction(()=>!document.querySelector('[data-testid="pilot-sync-banner"]')?.textContent.includes('Конфликт'));
 const afterOlderACompletes=await read();
 await a.click();
 const afterUserUnchecksA=await read();
 await release();await waitHeld();
 const finalResponse=marks.page.waitForResponse(r=>r.url().endsWith('/api/shopping')&&r.request().method()==='PUT');
 await release();await finalResponse;
 await marks.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const finalVisible=await read();
 const finalRemote={a:marks.store.shop.items.find(i=>i.id===aid).checkedInStore,b:marks.store.shop.items.find(i=>i.id===bid).checkedInStore};
 const putCalls=marks.calls.filter(c=>c.path==='/api/shopping'&&c.method==='PUT').map(c=>({status:c.status,expected_revision:c.payload.expected_revision,a:c.payload.items.find(i=>i.id===aid).checkedInStore,b:c.payload.items.find(i=>i.id===bid).checkedInStore}));
 const restored=await setup({user:marks.store.user,shopping:marks.store.shop});
 await restored.page.locator('[data-testid="food-today"]').waitFor();
 await restored.page.locator('[data-testid="bottom-nav-shopping"]').click();
 const restoredVisible={a:await restored.page.getByTestId('toggle-in-store-'+aid).getAttribute('aria-pressed'),b:await restored.page.getByTestId('toggle-in-store-'+bid).getAttribute('aria-pressed')};
 fs.writeFileSync(run+'/queued-checkbox-payloads.json',JSON.stringify({a_id:aid,b_id:bid,payloads:marks.calls.filter(c=>c.path==='/api/shopping'&&c.method==='PUT').map(c=>c.payload)},null,2));
 await marks.context.close();await restored.context.close();
 result.queued_checkbox_interleaving={after_user_checks_AB:afterUserChecksAB,after_older_A_completes:afterOlderACompletes,after_user_unchecks_A:afterUserUnchecksA,expected_final:{a:false,b:true},final_visible:finalVisible,final_mock_backend:finalRemote,reloaded_visible:restoredVisible,put_calls:putCalls,expectation_pass:finalRemote.a===false&&finalRemote.b===true&&finalVisible.a==='false'&&finalVisible.b==='true'};
'''
end_marker = '}catch(e){result.harness_error=String(e);process.exitCode=1;}finally{await browser.close();}'
assert end_marker in ui
ui = ui.replace(end_marker, insert + '\n' + end_marker)
execute('current-ui', ['node', '-e', ui], timeout=160)

checkbox_replay = bootstrap + '\nRUN=' + repr(str(RUN)) + r'''
import json,uuid
from fastapi.testclient import TestClient
from bot.server import create_app
from bot.app_settings import AppSettings
from bot.app_db import init_db
run=Path(RUN)
pack=json.loads((run/'payloads.json').read_text(encoding='utf-8'))
trace=json.loads((run/'queued-checkbox-payloads.json').read_text(encoding='utf-8'))
catalog=json.loads((Path.cwd()/'tests/fixtures/pilot/catalog.json').read_text(encoding='utf-8'))
db=owned/('r2-'+uuid.uuid4().hex+'.db');init_db(db)
settings=AppSettings(app_stage='test',allow_demo_auth=True,telegram_bot_token='synthetic-review-fixture-not-real-key',db_path=db,dist_dir=owned)
with TestClient(create_app(settings=settings,db_path=db,dist_dir=owned,catalog_provider=lambda:catalog)) as client:
    auth=client.get('/api/demo-session?demo_user=9001');assert auth.status_code==200
    headers={'Authorization':'Bearer '+auth.json()['session_token']}
    user=client.put('/api/user',headers=headers,json={'schema_version':1,'expected_revision':0,'profile':pack['profile'],'state':pack['state']});assert user.status_code==200
    for rev in (0,1):
        response=client.put('/api/shopping',headers=headers,json={'schema_version':1,'expected_revision':rev,'items':pack['shop1']});assert response.status_code==200
    statuses=[]
    for payload in trace['payloads']:
        response=client.put('/api/shopping',headers=headers,json=payload)
        statuses.append(response.status_code);assert response.status_code==200,response.text
    auth2=client.get('/api/demo-session?demo_user=9001');assert auth2.status_code==200
    restored=client.get('/api/shopping',headers={'Authorization':'Bearer '+auth2.json()['session_token']});assert restored.status_code==200
    items=restored.json()['items']
    actual={'a':next(i['checkedInStore'] for i in items if i['id']==trace['a_id']),'b':next(i['checkedInStore'] for i in items if i['id']==trace['b_id'])}
    result={'scope':'Exact shopping PUT payloads captured from fresh built browser UI replayed through real unmodified in-process FastAPI and owned synthetic SQLite; new authenticated session GET afterwards','statuses':statuses,'actual_final':actual,'expected_final':{'a':False,'b':True},'expectation_pass':actual=={'a':False,'b':True}}
    (run/'r2-real-backend-replay.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print('R2_REPLAY '+json.dumps(result))
'''
if results['current-ui']['exit_code'] == 0:
    execute('current-r2-real-backend', [str(ROOT / '.venv-p0/Scripts/python.exe'), '-B', '-c', checkbox_replay])

(RUN / 'targeted-runner.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'run_root': str(RUN), 'commands': results}, ensure_ascii=False, indent=2))
for name in ('r1-backend-consistency.json', 'ui-probes-full.json'):
    file = RUN / name
    if file.exists():
        print(name + '\n' + file.read_text(encoding='utf-8'))