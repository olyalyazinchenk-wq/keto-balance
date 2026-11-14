"""Execute only inside the network-none rehearsal container, on copied data."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
sys.path.insert(0, '/app')

assert os.getenv('KETO_LOAD_DOTENV') == '0'
assert not os.getenv('TELEGRAM_BOT_TOKEN') and not os.getenv('KETO_BOT_TOKEN')
DATA = Path('/app/data')
EXPECTED = json.loads(Path('/proof/expected.json').read_text())


def digests(path):
    conn = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    try:
        result = {}
        for (table,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
            quoted = '"' + table.replace('"','""') + '"'
            rows = conn.execute('SELECT * FROM ' + quoted).fetchall()
            result[table] = {'rows':len(rows), 'sha256':hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest()}
        return result
    finally: conn.close()


before = digests(DATA / 'staging_pilot.db')
from scripts.rehearse_support_migration import rehearse
migration = rehearse(DATA / 'staging_pilot.db', DATA / 'migration-proof.db')
assert migration['passed']
from bot.app_db import init_db, create_session, create_support_ticket
from bot import support_queue as queue
init_db(DATA / 'staging_pilot.db')
after = digests(DATA / 'staging_pilot.db')
assert all(after[table] == value for table,value in before.items())
for name in ('staging_pilot.db', 'keto_balance.db', 'legacy_bot.db'):
    conn = sqlite3.connect(DATA / name)
    assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    conn.close()
legacy = Path('/app/bot/keto_balance.db')
assert legacy.is_symlink() and legacy.resolve() == DATA / 'keto_balance.db'
writer_code = "import sqlite3,time; c=sqlite3.connect('/app/bot/keto_balance.db'); c.execute('PRAGMA journal_mode=WAL'); c.execute('PRAGMA wal_autocheckpoint=0'); c.execute('CREATE TABLE __rollout_wal_probe(value INTEGER)'); c.execute('INSERT INTO __rollout_wal_probe VALUES(73)'); c.commit(); print('ready',flush=True); time.sleep(120)"
writer = subprocess.Popen([sys.executable,'-c',writer_code],stdout=subprocess.PIPE,text=True)
try:
    assert writer.stdout.readline().strip() == 'ready'
    assert (DATA / 'keto_balance.db-wal').is_file()
    assert (DATA / 'keto_balance.db-shm').is_file()
    assert not Path('/app/bot/keto_balance.db-wal').exists()
    assert not Path('/app/bot/keto_balance.db-shm').exists()
    canonical = sqlite3.connect((DATA/'keto_balance.db').as_uri()+'?mode=ro',uri=True)
    assert canonical.execute('SELECT value FROM __rollout_wal_probe').fetchone()[0] == 73
    copied = sqlite3.connect(DATA / 'legacy-hot-wal-backup.db')
    canonical.backup(copied)
    assert copied.execute('SELECT value FROM __rollout_wal_probe').fetchone()[0] == 73
    canonical.close(); copied.close()
finally:
    writer.kill(); writer.wait(timeout=5)  # no graceful connection close/checkpoint
recovered = sqlite3.connect(DATA / 'keto_balance.db')
assert recovered.execute('SELECT value FROM __rollout_wal_probe').fetchone()[0] == 73
assert recovered.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
recovered.close()
from bot.app_settings import AppSettings
from bot.server import create_app
from fastapi.testclient import TestClient
owner = 1084557944
probe = 919191919191
db = DATA / 'staging_pilot.db'
create_session(owner, 'rehearsal-owner-token', db_path=db)
settings = AppSettings(app_stage='staging', access_mode='owner',owner_allowlist=frozenset({owner}), db_path=db,dist_dir=Path('/app/dist'))
client = TestClient(create_app(settings=settings,db_path=db,dist_dir=Path('/app/dist')))
headers = {'Authorization':'Bearer rehearsal-owner-token'}
version = client.get('/api/version').json()
assert version['buildId'] == EXPECTED['buildId']
assert version['backendFingerprint'] == EXPECTED['backendFingerprint']
assert client.get('/api/user',headers=headers).status_code == 200
assert client.get('/api/shopping',headers=headers).status_code == 200
assert client.get('/api/user').status_code == 401
assert client.get('/api/catalog',headers=headers).status_code == 200
assert client.get('/api/catalog',headers=headers,params={'catalog_id':'released-catalog-v1'}).status_code == 200
assert client.get('/api/subscription',headers=headers).json()['tier'] == 'owner'
assert client.get('/api/education/guides',headers=headers).json()['count'] == 8
assert client.get('/api/admin/support').status_code == 401
ticket = create_support_ticket(probe,'app','Synthetic deployment rehearsal only',db_path=db)
draft = queue.save_draft(ticket,0,probe,owner,owner,'Synthetic exact reply',db)
queue.approve_reply(ticket,draft['review']['draft_version'],probe,owner,owner,db)
claimed = queue.claim_reply(db)
assert claimed['id'] == ticket and claimed['review']['draft_text'] == 'Synthetic exact reply'
assert queue.claim_reply(db) is None
queue.recover_interrupted_replies(db)
assert queue.get_ticket(ticket,db)['review']['delivery_status'] == 'unknown'
# NO process_support_once, bot main, polling or Telegram transport is invoked.
print(json.dumps({'passed':True,'build_id':version['buildId'],'source_git_sha':EXPECTED['gitSha'],
 'migration':migration,'preexisting_tables_unchanged':True,'before_tables':before,'after_tables':after,
 'api_checks':10,'delivery':'database-only; no Telegram calls','network':'none',
 'legacy_wal_hot_backup_and_crash_recovery':True}))
