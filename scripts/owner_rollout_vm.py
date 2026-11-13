"""Existing VM private release. prepare is isolated; switch requires a separate owner approval receipt."""
import argparse
from contextlib import closing
import hashlib
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import time
import urllib.request

BASE = Path(__file__).resolve().parent
APP = 'ketobalance-owner-app'
BOT = 'ketobalance-cloud-bot'
TRIAL = 'ketobalance-owner-rehearsal-20261113-r3'
TAG = 'ketobalance-owner-private:owner-ready-20261113'
SUFFIX = '-before-owner-ready-20261113'


def run(*args): return subprocess.check_output(args, text=True, stderr=subprocess.PIPE).strip()
def inspect(name): return json.loads(run('docker','inspect',name))[0]
def save(name,value):
    with os.fdopen(os.open(BASE/name, os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as out:
        json.dump(value,out,indent=2)


def version():
    return json.load(urllib.request.urlopen('http://127.0.0.1:18183/api/version',timeout=5))


def volume(cfg):
    return Path(next(m['Source'] for m in cfg['Mounts'] if m['Destination']=='/app/data'))


def backup(source,destination):
    with closing(sqlite3.connect(Path(source).as_uri()+'?mode=ro',uri=True)) as src:
        with closing(sqlite3.connect(destination)) as dst:
            src.backup(dst)
            assert dst.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    os.chmod(destination,0o600)


def backup_all(app,bot,folder,stopped=False):
    folder.mkdir(mode=0o700)
    backup(volume(app)/'staging_pilot.db', folder/'staging_pilot.db')
    backup(volume(bot)/'keto_balance.db', folder/'keto_balance.db')
    # Actual deployed bot.database uses the existing volume DB. Its old
    # hardcoded source-tree location does not exist on this image.
    paths=json.loads((BASE/'runtime-paths.json').read_text())
    assert paths['legacy_database_path']=='/app/data/keto_balance.db'
    backup(volume(bot)/'keto_balance.db', folder/'legacy_bot.db')
    return {name:hashlib.sha256((folder/name).read_bytes()).hexdigest() for name in ('staging_pilot.db','keto_balance.db','legacy_bot.db')}


class Docker(http.client.HTTPConnection):
    def connect(self):
        self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        self.sock.settimeout(30); self.sock.connect('/var/run/docker.sock')


def api(method,path,payload=None):
    conn=Docker('localhost');conn.request(method,path,json.dumps(payload) if payload is not None else None,{'Content-Type':'application/json'})
    resp=conn.getresponse();body=resp.read();status=resp.status;conn.close()
    if status>=300: raise RuntimeError('Docker operation rejected: '+str(status))
    return json.loads(body) if body else None


def prepare():
    os.umask(0o077)
    expected=json.loads((BASE/'expected.json').read_text())
    app,bot=inspect(APP),inspect(BOT)
    assert app['State']['Running'] and bot['State']['Running']
    for cfg in (app,bot):
        env=dict(e.split('=',1) for e in cfg['Config']['Env'] if '=' in e)
        assert env.get('PAYMENTS_ENABLED')=='0' and env.get('PAYMENT_MODE')=='disabled'
    save('app-before.json',app);save('bot-before.json',bot);save('version-before.json',version())
    deployed_path=run('docker','exec','-e','KETO_LOAD_DOTENV=0',BOT,'python','-c','from bot.database import DB_PATH; print(str(DB_PATH))')
    assert deployed_path=='/app/data/keto_balance.db', 'Review a changed legacy database location before proceeding'
    save('runtime-paths.json',{'legacy_database_path':deployed_path,'legacy_path_in_new_image':'/app/bot/keto_balance.db','distinct_source_databases':2})
    checksums=backup_all(app,bot,BASE/'backups')
    save('backup-sha256.json',checksums)
    for name,digest in json.loads((BASE/'manifest.json').read_text()).items():
        assert hashlib.sha256((BASE/name).read_bytes()).hexdigest()==digest
    # Use installed dependencies, pinned existing image, and no build network.
    (BASE/'image/Dockerfile').write_text('FROM '+app['Image']+'\nRUN rm -rf /app/bot /app/dist /app/docs/content /app/scripts\nCOPY bot/ /app/bot/\nRUN ln -s /app/data/keto_balance.db /app/bot/keto_balance.db\nCOPY dist/ /app/dist/\nCOPY docs/content/ /app/docs/content/\nCOPY scripts/ /app/scripts/\n')
    subprocess.run(['docker','build','--network','none','-t',TAG,str(BASE/'image')],check=True,stdout=subprocess.DEVNULL)
    trial=BASE/'trial-data';trial.mkdir(mode=0o700)
    for name in checksums: shutil.copy2(BASE/'backups'/name,trial/name)
    blank_keys={e.split('=',1)[0] for e in inspect(TAG)['Config'].get('Env',[]) if any(k in e.split('=',1)[0].upper() for k in ('TOKEN','SECRET','PASSWORD','PROXY','API_KEY'))}
    env=['APP_STAGE=test','KETO_ACCESS_MODE=public','KETO_DB_PATH=/app/data/staging_pilot.db','KETO_DIST_DIR=/app/dist','KETO_LOAD_DOTENV=0','PAYMENTS_ENABLED=0','PAYMENT_MODE=disabled','PYTHONDONTWRITEBYTECODE=1','KETO_BOT_TOKEN=','TELEGRAM_BOT_TOKEN=']+[k+'=' for k in blank_keys]
    payload={'Image':TAG,'Cmd':['python','-c','import time;time.sleep(3600)'],'Env':env,
       'HostConfig':{'NetworkMode':'none','ReadonlyRootfs':True,'Memory':402653184,'NanoCpus':500000000,'RestartPolicy':{'Name':'no'},
       'Binds':[str(trial)+':/app/data',str(BASE/'owner_rollout_verify.py')+':/proof/owner_rollout_verify.py:ro',str(BASE/'expected.json')+':/proof/expected.json:ro'],
       'Tmpfs':{'/tmp':'rw,noexec,nosuid,size=64m'}},'Healthcheck':{'Test':['NONE']}}
    api('POST','/containers/create?name='+TRIAL,payload);api('POST','/containers/'+TRIAL+'/start')
    try:
        proof=json.loads(run('docker','exec',TRIAL,'python','/proof/owner_rollout_verify.py'))
        assert proof['passed'] and proof['build_id']==expected['buildId']
        save('rehearsal.json',proof)
    finally: run('docker','stop','-t','5',TRIAL)
    assert inspect(APP)['Id']==app['Id'] and inspect(BOT)['Id']==bot['Id']
    assert version()['buildId']==json.loads((BASE/'version-before.json').read_text())['buildId']
    save('prepared.json',{'passed':True,'build_id':expected['buildId'],'new_image':inspect(TAG)['Id'],
         'old_app_image':app['Image'],'old_bot_image':bot['Image'],'live_containers_unchanged':True,
         'backup_integrity':'3 SQLite role backups verified from 2 distinct existing databases','rehearsal_network':'none','telegram_calls':0,
         'legacy_database_link':{'path':'/app/bot/keto_balance.db','target':'/app/data/keto_balance.db'},
         'dockerfile_sha256':hashlib.sha256((BASE/'image/Dockerfile').read_bytes()).hexdigest(),
         'legacy_wal_hot_backup_and_crash_recovery':proof['legacy_wal_hot_backup_and_crash_recovery']})
    print(json.dumps(json.loads((BASE/'prepared.json').read_text())))


def approved(path):
    expected=json.loads((BASE/'expected.json').read_text())
    approval=json.loads(Path(path).read_text())
    assert approval.get('approved_by')=='Olga' and approval.get('build_id')==expected['buildId']
    assert approval.get('scope')=='private-owner-update-and-support-migration'
    assert approval.get('approved_at')
    assert json.loads((BASE/'prepared.json').read_text())['passed']
    assert inspect(TAG)['Id']==json.loads((BASE/'prepared.json').read_text())['new_image']
    assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==json.loads((BASE/'preflight.json').read_text())['rollout_script_sha256']
    return expected


def preflight():
    app=json.loads((BASE/'app-before.json').read_text())
    bot=json.loads((BASE/'bot-before.json').read_text())
    app_plan=payload(app)
    bot_plan=payload(bot,volume(bot)/'keto_balance.db')
    assert app_plan['HostConfig']==app['HostConfig']
    assert bot_plan['HostConfig']['NetworkMode']==bot['HostConfig']['NetworkMode']=='host'
    assert bot_plan['HostConfig'].get('PortBindings')==bot['HostConfig'].get('PortBindings')
    assert all(b.split(':')[1]!='/app/bot/bot.py' for b in bot_plan['HostConfig']['Binds'])
    assert all(b.split(':')[1]!='/app/bot/keto_balance.db' for b in bot_plan['HostConfig']['Binds'])
    env=dict(e.split('=',1) for e in bot_plan['Env'])
    assert env['KETO_DB_PATH']=='/app/data/staging_pilot.db' and env['PAYMENTS_ENABLED']=='0'
    run('docker','run','--rm','--network','none','--read-only','-e','KETO_LOAD_DOTENV=0','-e','KETO_BOT_TOKEN=','-e','TELEGRAM_BOT_TOKEN=','--entrypoint','python',TAG,'-c',"from bot.app_db import _migrate_support_queue; import bot.bot; import os; assert os.readlink('/app/bot/keto_balance.db')=='/app/data/keto_balance.db'")
    result={'passed':True,'migration_runtime_imports':'ok; frozen image, network none, no database mounted',
        'app_hostconfig_preserved':True,'bot_network_and_ports_preserved':True,
        'legacy_existing_database_reused':True,'support_database_shared_with_app':True,
        'rollout_script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    save('preflight.json',result)
    print(json.dumps(result))


def payload(cfg,legacy=None):
    result=dict(cfg['Config']);result['Image']=TAG;result['HostConfig']=dict(cfg['HostConfig'])
    if legacy is not None:
        binds=[b for b in result['HostConfig'].get('Binds',[]) if b.split(':')[1] not in ('/app/bot/bot.py','/app/bot/keto_balance.db')]
        result['HostConfig']['Binds']=binds
        env={k:v for e in result['Env'] for k,v in [e.split('=',1)]}
        env['KETO_DB_PATH']='/app/data/staging_pilot.db';env['PAYMENTS_ENABLED']='0';env['PAYMENT_MODE']='disabled'
        result['Env']=[k+'='+v for k,v in env.items()]
    return result


def restore_previous(legacy=None):
    # Only this release's containers may be removed; old data is never restored over live data.
    for name in (BOT,APP):
        try:
            old=inspect(name+SUFFIX)
        except subprocess.CalledProcessError: continue
        try:
            current=inspect(name)
        except subprocess.CalledProcessError:
            current=None
        if current:
            assert current['Image']==inspect(TAG)['Id']
            run('docker','stop','-t','20',name)
            run('docker','update','--restart','no',name)
            run('docker','rename',name,name+'-failed-owner-ready-20261113')
        run('docker','rename',name+SUFFIX,name)
    for name, filename in ((APP,'app-before.json'),(BOT,'bot-before.json')):
        policy=json.loads((BASE/filename).read_text())['HostConfig']['RestartPolicy']
        restart=policy['Name']
        if restart=='on-failure' and policy.get('MaximumRetryCount'):
            restart+=':'+str(policy['MaximumRetryCount'])
        run('docker','update','--restart',restart,name)
    run('docker','start',APP);run('docker','start',BOT)


def switch(approval):
    expected=approved(approval)
    app,bot=inspect(APP),inspect(BOT)
    assert app['Id']==json.loads((BASE/'app-before.json').read_text())['Id']
    assert bot['Id']==json.loads((BASE/'bot-before.json').read_text())['Id']
    assert version()['buildId']==json.loads((BASE/'version-before.json').read_text())['buildId']
    legacy=volume(bot)/'keto_balance.db'
    assert legacy.is_file()
    # Check dependencies in the actual image without mounting any database.
    run('docker','run','--rm','--network','none','--read-only','-e','KETO_LOAD_DOTENV=0','-e','KETO_BOT_TOKEN=','-e','TELEGRAM_BOT_TOKEN=','--entrypoint','python',TAG,'-c','from bot.app_db import _migrate_support_queue; import sqlite3')
    try:
        run('docker','stop','-t','20',BOT);run('docker','stop','-t','20',APP)
        run('docker','update','--restart','no',APP)
        run('docker','update','--restart','no',BOT)
        backup_all(app,bot,BASE/'final-backups',stopped=True)
        # This is the only operation that applies the approved additive live migration.
        migration_code="import sqlite3; from bot.app_db import _migrate_support_queue; c=sqlite3.connect('/migration/staging_pilot.db'); c.execute('PRAGMA foreign_keys=ON'); c.execute('BEGIN IMMEDIATE'); _migrate_support_queue(c); c.commit(); assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'; c.close()"
        run('docker','run','--rm','--network','none','--read-only','-e','KETO_LOAD_DOTENV=0','-e','KETO_BOT_TOKEN=','-e','TELEGRAM_BOT_TOKEN=','-v',str(volume(app))+':/migration','--entrypoint','python',TAG,'-c',migration_code)
        for name,cfg,legacy_path in ((APP,app,None),(BOT,bot,legacy)):
            run('docker','rename',name,name+SUFFIX)
            api('POST','/containers/create?name='+name,payload(cfg,legacy_path))
        run('docker','start',APP)
        for attempt in range(30):
            try:
                if version()['buildId']==expected['buildId']: break
            except Exception: pass
            time.sleep(1)
        else: raise RuntimeError('New private application did not start')
        run('docker','start',BOT)
        bot_env=dict(e.split('=',1) for e in bot['Config']['Env'])
        heartbeat=bot_env.get('KETO_BOT_HEARTBEAT_PATH','/tmp/bot_heartbeat.ts')
        heartbeat_code='import os,time; assert time.time()-os.stat('+repr(heartbeat)+').st_mtime<35'
        for attempt in range(45):
            state=inspect(BOT)
            if state['State']['Running'] and state['RestartCount']==0:
                try:
                    run('docker','exec',BOT,'python','-c',heartbeat_code)
                    break
                except subprocess.CalledProcessError: pass
            time.sleep(1)
        else: raise RuntimeError('Bot startup/heartbeat did not become ready')
        # Application.initialize reaches getMe before post_init writes heartbeat;
        # a fresh heartbeat is not evidence of successful polling or customer delivery.
        receipt={'build_id':expected['buildId'],'payments_enabled':False,'rollback_suffix':SUFFIX,
                 'bot_running':True,'bot_restart_count':0,'bot_heartbeat_fresh':True,
                 'telegram_polling':'not verified by this receipt; operator check required',
                 'owner_phone_acceptance':'pending'}
        save('switched.json',receipt)
        print(json.dumps(receipt))
    except Exception:
        restore_previous()
        raise RuntimeError('Release failed; previous containers restored, additive schema retained') from None


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('mode',choices=['prepare','preflight','switch','rollback']);parser.add_argument('--approval-file')
    args=parser.parse_args()
    if args.mode=='prepare': prepare()
    elif args.mode=='preflight': preflight()
    else:
        if not args.approval_file: parser.error('A separately approved receipt is required')
        approved(args.approval_file)
        if args.mode=='switch': switch(args.approval_file)
        else:
            original=json.loads((BASE/'app-before.json').read_text())
            restore_previous()
            print(json.dumps({'rolled_back':True}))
