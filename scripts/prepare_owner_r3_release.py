import hashlib
import json
import os
from pathlib import Path
import tarfile

def main():
    root = Path(__file__).resolve().parent.parent
    scratch_receipt_path = Path(r"C:\Users\HP\AppData\Local\hermes\cache\scratch\build-run-1794696792667-w7riml\build-receipt.json")
    if not scratch_receipt_path.is_file():
        raise FileNotFoundError(f"Receipt not found: {scratch_receipt_path}")

    receipt = json.loads(scratch_receipt_path.read_text(encoding="utf-8"))
    dist_dir = Path(receipt["dist_dir"])
    if not dist_dir.is_dir():
        raise FileNotFoundError(f"Dist dir not found: {dist_dir}")

    release_info = json.loads((dist_dir / "release.json").read_text(encoding="utf-8"))
    build_id = release_info["buildId"]
    assert release_info["dirty"] is False, "Release must not be dirty"
    assert release_info["gitSha"].startswith("7e576df"), f"Unexpected gitSha: {release_info['gitSha']}"

    out_dir = root / ".cache" / f"owner-release-{build_id}"
    out_dir.mkdir(parents=True, exist_ok=True)
    image_dir = out_dir / "image"
    image_dir.mkdir(parents=True, exist_ok=True)

    # 1. expected.json
    (out_dir / "expected.json").write_text(json.dumps(release_info, indent=2), encoding="utf-8")

    # 2. dist manifest & dist.tar.gz
    dist_manifest = {
        f.relative_to(dist_dir).as_posix(): hashlib.sha256(f.read_bytes()).hexdigest()
        for f in dist_dir.rglob("*")
        if f.is_file()
    }
    (out_dir / "dist-manifest.json").write_text(json.dumps(dist_manifest, indent=2), encoding="utf-8")

    tar_path = out_dir / "dist.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(dist_dir, arcname="dist")

    # 3. Backend files
    (out_dir / "app_models.py").write_bytes((root / "bot" / "app_models.py").read_bytes())
    (out_dir / "server.py").write_bytes((root / "bot" / "server.py").read_bytes())

    # 4. rollout script
    rollout_code = f'''"""Owner repair and release rollout for {build_id} (payments_enabled: false)."""
import argparse
from contextlib import closing
import datetime
import hashlib
import http.client
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import time
import urllib.request

BASE = Path(__file__).resolve().parent
APP = 'ketobalance-owner-app'
BOT = 'ketobalance-cloud-bot'
EXPECTED = json.loads((BASE / 'expected.json').read_text())
TAG = 'ketobalance-owner-private:release-' + EXPECTED['buildId']
OLD_APP = APP + '-before-release-' + EXPECTED['buildId']
FAILED_APP = APP + '-failed-release-' + EXPECTED['buildId']
OLD_BOT = BOT + '-before-release-' + EXPECTED['buildId']
FAILED_BOT = BOT + '-failed-release-' + EXPECTED['buildId']

def run(*args): return subprocess.check_output(args, text=True, stderr=subprocess.PIPE).strip()
def inspect(name): return json.loads(run('docker', 'inspect', name))[0]
def save(name, data):
    with os.fdopen(os.open(BASE / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as out:
        json.dump(data, out, indent=2)
def version(): return json.load(urllib.request.urlopen('http://127.0.0.1:18183/api/version', timeout=5))

class Docker(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(30)
        self.sock.connect('/var/run/docker.sock')

def api(method, path, payload=None):
    conn = Docker('localhost')
    conn.request(method, path, json.dumps(payload), {{'Content-Type': 'application/json'}})
    r = conn.getresponse()
    body = r.read()
    conn.close()
    if r.status >= 300:
        raise RuntimeError('Docker API rejected: ' + str(r.status))
    return json.loads(body) if body else None

def backend_digest(image):
    code = "import hashlib,json;from pathlib import Path;p=Path('/app/bot');print(json.dumps({{str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in p.glob('*.py')}}))"
    return json.loads(run('docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'python', image, '-c', code))

def db_proof(cfg):
    root = Path(next(m['Source'] for m in cfg['Mounts'] if m['Destination'] == '/app/data'))
    with closing(sqlite3.connect((root / 'staging_pilot.db').as_uri() + '?mode=ro', uri=True)) as c:
        c.execute('BEGIN')
        schema = list(c.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name"))
        assert c.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not c.execute('PRAGMA foreign_key_check').fetchall()
        tables = {{}}
        for name in ('user_states', 'shopping_states', 'user_profiles'):
            rows = sorted(json.dumps(list(row), ensure_ascii=False, separators=(',', ':')).encode() for row in c.execute('SELECT * FROM ' + name))
            h = hashlib.sha256()
            for row in rows:
                h.update(len(row).to_bytes(8, 'big'))
                h.update(row)
            tables[name] = {{'rows': len(rows), 'sha256': h.hexdigest()}}
    return {{'schema_sha256': hashlib.sha256(json.dumps(schema, separators=(',', ':')).encode()).hexdigest(), 'tables': tables, 'integrity': 'ok', 'foreign_key_violations': 0}}

def prepare():
    app, bot = inspect(APP), inspect(BOT)
    assert app['State']['Running'] and bot['State']['Running'], "Both app and bot must be running"
    current = version()
    assert current['buildId'] == 'df66a0fd7da3097a' and current['backendFingerprint'] == '1f27789829a220e8'
    assert EXPECTED['dirty'] is False
    assert EXPECTED['catalogHash'] == current['catalogHash'] == '666c79712f63128f'
    assert app['HostConfig']['NetworkMode'] == 'bridge' and list(app['NetworkSettings']['Networks']) == ['bridge']

    # Extract dist
    image_dir = BASE / 'image'
    subprocess.run(['tar', '-xzf', str(BASE / 'dist.tar.gz'), '-C', str(image_dir)], check=True)
    manifest = json.loads((BASE / 'dist-manifest.json').read_text())
    for name, digest in manifest.items():
        assert hashlib.sha256((image_dir / 'dist' / name).read_bytes()).hexdigest() == digest

    # Verify existing env
    for cfg in (app, bot):
        env = dict(e.split('=', 1) for e in cfg['Config']['Env'] if '=' in e)
        assert env.get('PAYMENTS_ENABLED') == '0' and env.get('PAYMENT_MODE') == 'disabled'

    save('app-before.json', app)
    save('bot-before-metadata.json', {{'id': bot['Id'], 'image': bot['Image'], 'started_at': bot['State']['StartedAt'], 'restart_count': bot['RestartCount']}})
    save('version-before.json', current)

    # Copy updated backend files
    (image_dir / 'app_models.py').write_bytes((BASE / 'app_models.py').read_bytes())
    (image_dir / 'server.py').write_bytes((BASE / 'server.py').read_bytes())

    # Build image
    dockerfile = 'FROM ' + app['Image'] + '\\nRUN rm -rf /app/dist\\nCOPY dist/ /app/dist/\\nCOPY app_models.py /app/bot/app_models.py\\nCOPY server.py /app/bot/server.py\\n'
    (image_dir / 'Dockerfile').write_text(dockerfile)
    subprocess.run(['docker', 'build', '--network', 'none', '-t', TAG, str(image_dir)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    # Verify build artifacts inside image
    code = f"import json,hashlib;from pathlib import Path;p=Path('/app/dist');x=json.loads((p/'release.json').read_text());assert x['buildId']=={{repr(EXPECTED['buildId'])}};assert x['dirty'] is False;assert x['backendFingerprint']=={{repr(EXPECTED['backendFingerprint'])}};assert hashlib.sha256((p/'released-catalog-v1.json').read_bytes()).hexdigest()=='0c02e2b78954cc4c8f7bf4feb65991eab04a61b4de8b2c6feff56141fa179725';assert all((p/'assets'/n).is_file() for n in x['assets']);print('artifact pass')"
    run('docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'python', TAG, '-c', code)

    # Verify backend changes
    old_backend = backend_digest(app['Image'])
    new_backend = backend_digest(TAG)
    assert set(old_backend) == set(new_backend)
    assert all(old_backend[k] == new_backend[k] for k in old_backend if k not in ('app_models.py', 'server.py'))
    assert new_backend['app_models.py'] == hashlib.sha256((BASE / 'app_models.py').read_bytes()).hexdigest()
    assert new_backend['server.py'] == hashlib.sha256((BASE / 'server.py').read_bytes()).hexdigest()

    save('prepared.json', {{
        'passed': True,
        'build_id': EXPECTED['buildId'],
        'new_image': inspect(TAG)['Id'],
        'backend_changed_files': ['app_models.py', 'server.py'],
        'network': 'none',
        'bot_unchanged_during_prep': True,
        'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    }})
    print(json.dumps(json.loads((BASE / 'prepared.json').read_text())))

def restore():
    prior = json.loads((BASE / 'app-before.json').read_text())
    try: old = inspect(OLD_APP)
    except subprocess.CalledProcessError: old = None
    if old:
        try: current = inspect(APP)
        except subprocess.CalledProcessError: current = None
        if current:
            assert current['Image'] == inspect(TAG)['Id']
            run('docker', 'stop', '-t', '15', APP)
            run('docker', 'update', '--restart', 'no', APP)
            run('docker', 'rename', APP, FAILED_APP)
        run('docker', 'rename', OLD_APP, APP)
    policy = prior['HostConfig']['RestartPolicy']
    restart = policy['Name']
    if restart == 'on-failure' and policy.get('MaximumRetryCount'): restart += ':' + str(policy['MaximumRetryCount'])
    run('docker', 'update', '--restart', restart, APP)
    run('docker', 'start', APP)

def switch():
    prepared = json.loads((BASE / 'prepared.json').read_text())
    assert prepared['passed'] and prepared['script_sha256'] == hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    assert inspect(TAG)['Id'] == prepared['new_image']
    before = json.loads((BASE / 'app-before.json').read_text())
    app, bot = inspect(APP), inspect(BOT)
    bm = json.loads((BASE / 'bot-before-metadata.json').read_text())
    assert app['Id'] == before['Id'] and bot['Id'] == bm['id']
    assert version()['buildId'] == json.loads((BASE / 'version-before.json').read_text())['buildId']
    before_db = db_proof(app)
    save('database-before.json', before_db)
    try:
        run('docker', 'stop', '-t', '15', APP)
        run('docker', 'update', '--restart', 'no', APP)
        run('docker', 'rename', APP, OLD_APP)
        payload = dict(before['Config'])
        payload['Image'] = TAG
        payload['HostConfig'] = dict(before['HostConfig'])
        api('POST', '/containers/create?name=' + APP, payload)
        run('docker', 'start', APP)
        for _ in range(30):
            try:
                val = version()
                if val['buildId'] == EXPECTED['buildId']: break
            except Exception: pass
            time.sleep(1)
        else: raise RuntimeError('New frontend application did not start')
        current, bnow = inspect(APP), inspect(BOT)
        assert current['State']['Running'] and current['RestartCount'] == 0
        assert bnow['Id'] == bm['id'] and bnow['Image'] == bm['image'] and bnow['State']['StartedAt'] == bm['started_at'] and bnow['RestartCount'] == bm['restart_count'] and bnow['State']['Running']
        after_db = db_proof(current)
        assert after_db['schema_sha256'] == before_db['schema_sha256']
        assert val['backendFingerprint'] == EXPECTED['backendFingerprint'] and val['catalogHash'] == '666c79712f63128f'
        old = inspect(OLD_APP)
        assert not old['State']['Running'] and old['HostConfig']['RestartPolicy']['Name'] == 'no'
        save('switched.json', {{
            'passed': True,
            'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'version': val,
            'app_image': current['Image'],
            'bot_unchanged': True,
            'no_explicit_migration': True,
            'schema_unchanged': True,
            'menu_shopping_profiles_unchanged': before_db['tables'] == after_db['tables'],
            'database_after': after_db,
            'old_app_retained': OLD_APP,
            'payments_enabled': False
        }})
        print(json.dumps(json.loads((BASE / 'switched.json').read_text())))
    except Exception:
        restore()
        raise RuntimeError('Frontend patch failed; previous app restored; bot and database not rolled back') from None

def restore_bot():
    prior_path = BASE / 'bot-before.json'
    if not prior_path.is_file(): return
    prior = json.loads(prior_path.read_text())
    try: inspect(OLD_BOT)
    except subprocess.CalledProcessError:
        current = inspect(BOT)
        assert current['Id'] == prior['Id']
        policy = prior['HostConfig']['RestartPolicy']
        restart = policy['Name']
        if restart == 'on-failure' and policy.get('MaximumRetryCount'): restart += ':' + str(policy['MaximumRetryCount'])
        run('docker', 'update', '--restart', restart, BOT)
        run('docker', 'start', BOT)
        return
    try: current = inspect(BOT)
    except subprocess.CalledProcessError: current = None
    if current:
        assert current['Image'] == inspect(TAG)['Id']
        run('docker', 'stop', '-t', '20', BOT)
        run('docker', 'update', '--restart', 'no', BOT)
        run('docker', 'rename', BOT, FAILED_BOT)
    run('docker', 'rename', OLD_BOT, BOT)
    policy = prior['HostConfig']['RestartPolicy']
    restart = policy['Name']
    if restart == 'on-failure' and policy.get('MaximumRetryCount'): restart += ':' + str(policy['MaximumRetryCount'])
    run('docker', 'update', '--restart', restart, BOT)
    run('docker', 'start', BOT)

def switch_bot():
    before = inspect(BOT)
    bm = json.loads((BASE / 'bot-before-metadata.json').read_text())
    assert before['Id'] == bm['id'] and before['State']['Running']
    assert version()['buildId'] == EXPECTED['buildId']
    save('bot-before.json', before)
    before_db = db_proof(inspect(APP))
    try:
        run('docker', 'stop', '-t', '20', BOT)
        run('docker', 'update', '--restart', 'no', BOT)
        run('docker', 'rename', BOT, OLD_BOT)
        payload = dict(before['Config'])
        payload['Image'] = TAG
        payload['HostConfig'] = dict(before['HostConfig'])
        api('POST', '/containers/create?name=' + BOT, payload)
        run('docker', 'start', BOT)
        for _ in range(45):
            state = inspect(BOT)['State']
            if state['Running'] and state.get('Health', {{}}).get('Status') == 'healthy': break
            if not state['Running']: raise RuntimeError('Bot exited')
            time.sleep(1)
        else: raise RuntimeError('Bot health timeout')
        assert inspect(BOT)['RestartCount'] == 0
        after_db = db_proof(inspect(APP))
        assert after_db == before_db
        save('bot-switched.json', {{
            'passed': True,
            'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'build_id': EXPECTED['buildId'],
            'old_bot_retained': OLD_BOT,
            'healthy': True,
            'database_unchanged': True,
            'single_active_bot': not inspect(OLD_BOT)['State']['Running'],
            'payments_enabled': False
        }})
        print(json.dumps(json.loads((BASE / 'bot-switched.json').read_text())))
    except Exception:
        restore_bot()
        restore()
        raise RuntimeError('Keto update failed; previous app and bot restored') from None

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'switch', 'switch-bot', 'rollback'])
    args = parser.parse_args()
    os.umask(0o077)
    if args.mode == 'prepare': prepare()
    elif args.mode == 'switch': switch()
    elif args.mode == 'switch-bot': switch_bot()
    else:
        restore_bot()
        restore()
        print(json.dumps({{'app_rolled_back': True, 'bot_rolled_back': True}}))
'''
    (out_dir / "owner_rollout.py").write_text(rollout_code, encoding="utf-8")
    print(f"Package prepared at {out_dir}")

if __name__ == "__main__":
    main()
