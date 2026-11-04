"""Verify a published build before changing Telegram's global menu button.

New /start inline buttons use WEBAPP_URL from the running bot environment.
Previously sent inline keyboards require exact chat/message IDs to edit.
"""
import argparse
import asyncio
import os
from urllib.parse import urlsplit

from scripts.probe_entry import probe, ProbeError


def check_url(url: str, configured_url: str) -> str:
    origin = url.rstrip('/')
    parsed = urlsplit(origin)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username
            or parsed.password or parsed.path or parsed.query or parsed.fragment):
        raise ValueError('Expected a public HTTPS origin without path or credentials')
    if configured_url.rstrip('/') != origin:
        raise ValueError('WEBAPP_URL does not match target; update environment first')
    return origin


async def synchronize(url: str, expected_username: str) -> None:
    from telegram import Bot, MenuButtonWebApp, WebAppInfo

    token = os.environ.get('KETO_BOT_TOKEN') or os.environ.get('TELEGRAM_BOT_TOKEN')
    if not token:
        raise RuntimeError('Bot token missing from the server environment')
    async with Bot(token) as bot:
        who = await bot.get_me()
        if (who.username or '').lower() != expected_username.lstrip('@').lower():
            raise RuntimeError('Bot username mismatch; refusing to change another bot')
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text='🥑 Открыть КетоБаланс', web_app=WebAppInfo(url=url)
            )
        )
        actual = await bot.get_chat_menu_button()
        actual_url = getattr(getattr(actual, 'web_app', None), 'url', None)
        if actual_url != url:
            raise RuntimeError('Telegram menu read-back mismatch')
        print('MENU_BUTTON_VERIFIED')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--expected-build', required=True)
    parser.add_argument('--expect-username', default='keto_balance_userbot')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    url = check_url(args.url, os.getenv('WEBAPP_URL', ''))
    outcome = probe(url, expected=args.expected_build)
    if outcome['status'] != 'ENTRY_PROBE_PASS':
        raise ProbeError('Public verification failed')
    print('PUBLIC_BUILD_VERIFIED', outcome['buildId'])
    if not args.apply:
        print('DRY_RUN: Telegram has not been changed')
        return 0
    asyncio.run(synchronize(url, args.expect_username))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
