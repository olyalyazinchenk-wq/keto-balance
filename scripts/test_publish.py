import os
import json
import urllib.request
import urllib.error

proxy_url = 'http://127.0.0.1:10809'
opener = urllib.request.build_opener(urllib.request.ProxyHandler({'https': proxy_url, 'http': proxy_url}))

def check_bot(name, token):
    print(f'=== Checking {name} ===')
    if not token:
        print('No token provided')
        return
    bot_id = token.split(':')[0]
    print(f'Token ID: {bot_id}')
    try:
        req = urllib.request.Request(f'https://api.telegram.org/bot{token}/getMe')
        res = json.load(opener.open(req, timeout=15))
        print('getMe:', res.get('result', {}).get('username'))
    except Exception as e:
        print('getMe error:', e)
        return

    for chat_target in ['@olga_nutri_med', -1003180479768]:
        try:
            req = urllib.request.Request(f'https://api.telegram.org/bot{token}/getChatMember?chat_id={chat_target}&user_id={bot_id}')
            res = json.load(opener.open(req, timeout=15))
            print(f'getChatMember for {chat_target}:', res.get('result', {}).get('status'))
        except urllib.error.HTTPError as e:
            print(f'getChatMember HTTPError for {chat_target}:', e.code, e.read().decode('utf-8', errors='ignore'))
        except Exception as e:
            print(f'getChatMember error for {chat_target}:', e)

# 1. Keto-balance
keto_token = None
try:
    with open(r'C:/Users/HP/Keto-balance/.env', 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('BOT_TOKEN='):
                keto_token = line.split('=', 1)[1].strip().strip('"').strip("'")
except Exception as e:
    print('Error reading keto .env:', e)

check_bot('Keto-balance', keto_token)

# 2. WellnessBot
wb_token = None
try:
    with open(r'C:/Users/HP/Desktop/Новая папка/WellnessBot/.env', 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('BOT_TOKEN='):
                wb_token = line.split('=', 1)[1].strip().strip('"').strip("'")
except Exception as e:
    print('Error reading WellnessBot .env:', e)

check_bot('WellnessBot', wb_token)
