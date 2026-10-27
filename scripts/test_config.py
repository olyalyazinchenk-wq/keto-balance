import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot.config import SUPPORT_CHAT, CHANNEL_URL, ADMIN_ID, NUTRITIONIST_USERNAME
print("SUPPORT_CHAT:", SUPPORT_CHAT)
print("CHANNEL_URL:", CHANNEL_URL)
print("ADMIN_ID:", ADMIN_ID)
print("NUTRITIONIST_USERNAME:", NUTRITIONIST_USERNAME)
