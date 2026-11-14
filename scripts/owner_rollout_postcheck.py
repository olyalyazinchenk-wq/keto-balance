"""Sanitized read-only checks after the separately approved private switch."""
import argparse
import base64
import datetime
import hashlib
import http.client
import json
import os
from pathlib import Path
import socket
import sqlite3
import ssl
import subprocess


def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]


def table_digests(path):
    conn = sqlite3.connect(Path(path).as_uri() + '?mode=ro', uri=True)
    conn.execute('BEGIN')
    result = {}
    names = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    for (name,) in names:
        rows = sorted(json.dumps([
            {'bytes': base64.b64encode(v).decode()} if isinstance(v, bytes) else v for v in row
        ], ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
            for row in conn.execute('SELECT * FROM "' + name.replace('"', '""') + '"'))
        digest = hashlib.sha256()
        for row in rows:
            digest.update(len(row).to_bytes(8, 'big'))
            digest.update(row)
        result[name] = {'rows': len(rows), 'sha256': digest.hexdigest()}
    assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert not conn.execute('PRAGMA foreign_key_check').fetchall()
    conn.close()
    return result


def verify(base, outside):
    image = json.loads((base / 'prepared.json').read_text())['new_image']
    app, bot = inspect('ketobalance-owner-app'), inspect('ketobalance-cloud-bot')
    assert app['Image'] == bot['Image'] == image
    for cfg in (app, bot):
        env = dict(e.split('=', 1) for e in cfg['Config']['Env'] if '=' in e)
        assert env['PAYMENTS_ENABLED'] == '0' and env['PAYMENT_MODE'] == 'disabled'
        assert cfg['State']['Running'] and cfg['RestartCount'] == 0
    volume = Path(next(m['Source'] for m in app['Mounts'] if m['Destination'] == '/app/data'))
    before = table_digests(base / 'final-backups/staging_pilot.db')
    after = table_digests(volume / 'staging_pilot.db')
    comparisons = {name: {'unchanged': value == after.get(name), 'before': value,
                          'after': after.get(name)} for name, value in before.items()}
    assert all(comparisons[name]['unchanged'] for name in ('user_states', 'shopping_states', 'user_profiles'))
    legacy_same = table_digests(base / 'final-backups/legacy_bot.db') == table_digests(volume / 'keto_balance.db')
    assert legacy_same
    for name in ('ketobalance-owner-app', 'ketobalance-cloud-bot'):
        old = inspect(name + '-before-owner-ready-20261113')
        assert not old['State']['Running'] and old['HostConfig']['RestartPolicy']['Name'] == 'no'
    probe = '''
import asyncio,os,json,logging
logging.disable(logging.CRITICAL)
from telegram import Bot
from telegram.request import HTTPXRequest
from bot.config import ADMIN_ID
from bot.bot import get_current_webapp_url, get_main_keyboard
async def main():
 proxy=os.getenv('KETO_BOT_PROXY'); assert proxy
 token=os.getenv('KETO_BOT_TOKEN') or os.getenv('TELEGRAM_BOT_TOKEN'); assert token
 async with Bot(token,request=HTTPXRequest(proxy=proxy,connect_timeout=15,read_timeout=20)) as bot:
  user=await bot.get_me(); webhook=await bot.get_webhook_info()
  assert user.username=='keto_balance_userbot' and not webhook.url
  expected=get_current_webapp_url(); assert expected=='https://84.54.56.73.nip.io/'
  global_menu=(await bot.get_chat_menu_button()).to_dict()
  owner_menu=(await bot.get_chat_menu_button(chat_id=ADMIN_ID)).to_dict()
  assert global_menu.get('web_app',{}).get('url')==expected
  assert owner_menu.get('web_app',{}).get('url')==expected
  urls=[button.web_app.url for row in get_main_keyboard().inline_keyboard for button in row if button.web_app]
  assert urls and all(url==expected for url in urls)
  print(json.dumps({'getMe':'ok','bot_username':user.username,'configured_proxy_used':True,
   'webhook_configured':False,'pending_updates':webhook.pending_update_count,'customer_messages_sent':0,
   'global_menu_url':global_menu['web_app']['url'],'owner_menu_url':owner_menu['web_app']['url'],
   'main_keyboard_urls':urls,'main_app_botfather_config':'not exposed by Bot API; not inspected'}))
asyncio.run(main())
'''
    request = subprocess.run(['docker', 'exec', '-e', 'KETO_LOAD_DOTENV=0', 'ketobalance-cloud-bot',
                              'python', '-c', probe], capture_output=True, text=True, timeout=50)
    assert request.returncode == 0, 'Read-only Telegram probe failed; secret-bearing stderr suppressed'
    telegram = json.loads(request.stdout)
    ids = subprocess.check_output(['docker', 'ps', '-q'], text=True).split()
    running = json.loads(subprocess.check_output(['docker', 'inspect'] + ids))
    pollers = [cfg['Name'].lstrip('/') for cfg in running
               if 'bot.bot' in (cfg['Config'].get('Cmd') or [])
               or any(x.endswith('/bot.py') for x in cfg['Config'].get('Cmd') or [])]
    assert pollers == ['ketobalance-cloud-bot']
    logs = subprocess.run(['docker', 'logs', '--since', bot['State']['StartedAt'],
                           'ketobalance-cloud-bot'], capture_output=True, text=True)
    text = logs.stdout + logs.stderr
    errors = {word: text.lower().count(word.lower()) for word in
              ('Conflict', 'Unauthorized', 'Traceback', 'NetworkError', 'TimedOut', 'Support queue unavailable')}
    assert not any(errors.values()) and 'Application started' in text
    sock = socket.create_connection(('127.0.0.1', 443), timeout=10)
    tls = ssl.create_default_context().wrap_socket(sock, server_hostname='84.54.56.73.nip.io')
    tls.sendall(b'GET /api/version HTTP/1.1\r\nHost: 84.54.56.73.nip.io\r\nConnection: close\r\n\r\n')
    response = http.client.HTTPResponse(tls)
    response.begin()
    assert response.status == 200
    version = json.loads(response.read())
    tls.close()
    assert version['buildId'] == outside['buildId'] == '8be43f00ba6d26b3'
    assert version['backendFingerprint'] == outside['backendFingerprint'] == '6ebaacb6f7aff56b'
    return {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'passed': True, 'build_id': version['buildId'], 'https_version': version,
            'outside_https': {'verified': True, 'source': 'Windows curl.exe --noproxy * with normal TLS validation',
                              'version': outside}, 'loopback_tls_verified': True, 'payments_enabled': False,
            'menu_shopping_profiles_unchanged': True, 'old_table_comparisons': comparisons,
            'integrity_check': 'ok', 'foreign_key_violations': 0, 'legacy_tables_unchanged': legacy_same,
            'telegram': telegram, 'running_polling_containers': pollers, 'application_started_log': True,
            'startup_error_counts': errors, 'live_restart_counts': {'app': 0, 'bot': 0},
            'old_containers_stopped_restart_no': True, 'owner_phone_acceptance': 'pending',
            '24h_observation': 'started; not completed'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, required=True)
    parser.add_argument('--outside-version', required=True)
    args = parser.parse_args()
    proof = verify(args.base, json.loads(args.outside_version))
    with os.fdopen(os.open(args.base / 'post-switch-verification.json',
                           os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
        json.dump(proof, handle, indent=2)
    print(json.dumps(proof))
