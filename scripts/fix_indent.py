# -*- coding: utf-8 -*-
with open(r'C:\Users\HP\Keto-balance\bot\bot.py', 'r', encoding='utf-8') as f:
    text = f.read()

bad = '        elif data == "ask_menu":\n        await ask_cmd(update, context)'
good = '    elif data == "ask_menu":\n        await ask_cmd(update, context)'
if bad not in text:
    bad = '        elif data == "ask_menu":\r\n        await ask_cmd(update, context)'
    good = '    elif data == "ask_menu":\r\n        await ask_cmd(update, context)'

assert bad in text, "Could not find bad string"
text = text.replace(bad, good)

with open(r'C:\Users\HP\Keto-balance\bot\bot.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("Indentation fixed successfully!")
