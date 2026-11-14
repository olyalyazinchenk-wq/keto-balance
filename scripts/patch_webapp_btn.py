# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r'C:\Users\HP\Keto-balance\bot\bot.py')
text = p.read_text(encoding='utf-8')

old = """def webapp_button(text: str, url: str = WEBAPP_URL) -> InlineKeyboardButton:
    clean_url = (url or "").strip()
    if clean_url.startswith("https://"):
        return InlineKeyboardButton(text, web_app=WebAppInfo(url=clean_url))
    # Telegram запрещает localhost и non-https в InlineKeyboardButton URL
    return InlineKeyboardButton(text, callback_data="open_app_local")"""

new = """def get_current_webapp_url() -> str:
    \"\"\"Получение актуального HTTPS адреса Mini App из файла туннеля или .env.\"\"\"
    fpath = Path(__file__).resolve().parent.parent / "current_tunnel_url.txt"
    if fpath.exists():
        try:
            val = fpath.read_text(encoding="utf-8").strip()
            if val.startswith("https://"):
                return val
        except Exception:
            pass
    return WEBAPP_URL

def webapp_button(text: str, url: Optional[str] = None) -> InlineKeyboardButton:
    clean_url = (url or get_current_webapp_url()).strip()
    if clean_url.startswith("https://"):
        return InlineKeyboardButton(text, web_app=WebAppInfo(url=clean_url))
    # Telegram запрещает localhost и non-https в InlineKeyboardButton URL
    return InlineKeyboardButton(text, callback_data="open_app_local")"""

if old in text:
    text = text.replace(old, new, 1)
elif old.replace('\n', '\r\n') in text:
    text = text.replace(old.replace('\n', '\r\n'), new.replace('\n', '\r\n'), 1)
else:
    raise RuntimeError("Target string not found!")

p.write_text(text, encoding='utf-8')
print("webapp_button successfully updated!")
