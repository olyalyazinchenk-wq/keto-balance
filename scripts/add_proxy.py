# -*- coding: utf-8 -*-
from pathlib import Path

bot_path = Path(r"C:\Users\HP\Keto-balance\bot\bot.py")
content = bot_path.read_text(encoding="utf-8")

# Add import HTTPXRequest
old_import = "from telegram.constants import ParseMode"
new_import = "from telegram.constants import ParseMode\nfrom telegram.request import HTTPXRequest"
assert old_import in content
content = content.replace(old_import, new_import, 1)

# Add request to ApplicationBuilder
old_builder = "    app = ApplicationBuilder().token(BOT_TOKEN).post_init(post_init).build()"
new_builder = """    proxy = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY") or "http://127.0.0.1:10809"
    request = HTTPXRequest(proxy=proxy, connect_timeout=15.0, read_timeout=20.0)
    app = ApplicationBuilder().token(BOT_TOKEN).request(request).post_init(post_init).build()"""
assert old_builder in content
content = content.replace(old_builder, new_builder, 1)

bot_path.write_text(content, encoding="utf-8")
print("Added HTTPXRequest proxy support successfully!")
