import json
import urllib.request
import urllib.error
import urllib.parse

proxy_url = 'http://127.0.0.1:10809'
opener = urllib.request.build_opener(urllib.request.ProxyHandler({'https': proxy_url, 'http': proxy_url}))

wb_token = None
with open(r'C:/Users/HP/Desktop/Новая папка/WellnessBot/.env', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('BOT_TOKEN='):
            wb_token = line.split('=', 1)[1].strip().strip('"').strip("'")

print('Testing WellnessBot sendChatAction...')
data = urllib.parse.urlencode({'chat_id': '@olga_nutri_med', 'action': 'upload_video'}).encode()
req = urllib.request.Request(f'https://api.telegram.org/bot{wb_token}/sendChatAction', data=data)
try:
    res = opener.open(req, timeout=15)
    print('Success:', res.read().decode())
except urllib.error.HTTPError as e:
    print('HTTPError:', e.code, e.read().decode())
except Exception as e:
    print('Error:', e)
