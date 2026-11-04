# Keto Balance — VPS / Telegram migration (PREPARATION ONLY)

One VPS in Russia hosts React Mini App, Python FastAPI, one polling Telegram bot and SQLite. A stable HTTPS hostname is required, but buying a domain is NOT a prerequisite. Beget advertises a VPS technical domain under beget.app; verify that the actual VPS account provides the hostname and that public DNS and trusted TLS issuance work before accepting it as the permanent entry URL. A separately purchased domain remains an optional later upgrade. The current local Terra/Antigravity edits must be reconciled first: public GitHub master is from 27 October and is NOT the latest live app.

## Provider decision — 2026-11-04 (trial, NOT activated)

- Beget was unavailable and SmartApe registration failed because the owner could not complete its phone callback verification. Neither service is approved as current candidate.
- Next candidate: **1Gb.ru Linux KVM VDS, Russian location, 10-day free test without prepayment**; official sources:
  - https://www.1gb.ru/l_vds5.php
  - https://www.1gb.ru/services_howto.php
  - https://www.1gb.ru/registered_ajax_register_vds.php
- 1Gb.ru registration information says **a valid mobile number receives an SMS activation code to continue the trial beyond two hours**. This still requires phone verification but **not the unavailable outbound voice call used by SmartApe**. No account or VPS has been created and the SMS step has not been tested.
- Select Ubuntu 24.04 LTS (or supported recent LTS), at least 2 GiB RAM, public IPv4. Confirm full monthly price, outbound Telegram API reachability, Docker support, HTTPS and backup cost in the actual order.
- Lower-priority alternatives: HostiMan's 14-day VPS trial requires a sales ticket and **photo of an ID document**; not recommended without explicit informed choice. SpaceWeb VPS trial is 3 days and requires phone verification. RUVDS is 3 days and may require a card.
- No custom domain has been purchased. For the trial use a correctly configured free hostname and public TLS, not a temporary tunnel.
- Never send genuine client data for a trial. Do not change Telegram's live menu button or public deployment until the new server and built assets are verified and the user authorizes cutover.
- On trial expiry, preserve data and verify no automatic charge before continuation. Trial does not establish production readiness.

## Safety prerequisites

- Owner approves VPS rental and the quoted cost before purchasing. Owner confirms NO OWNED DOMAIN; avoid domain purchase, use a verified free provider hostname if available. Owner approves production cutover before changing the active bot.
- Preserve local dirty work and make a verified backup of the current database. Do not upload client data to GitHub or public services.
- Owner explicitly confirmed on 2026-11-04 that no domain has been purchased. First inspect the VPS provider's free technical hostname (beget.app) and whether it resolves to the assigned VPS IPv4. If the provider does not supply a reliable technical hostname, choose another stable free DNS hostname as a temporary option; purchase a custom domain only after separate approval.
- Test whether VPS can reach Telegram Bot API before migration. Run only one polling process for the bot token; stop old one immediately before cutover.
- Do not enable payments. Verify current Telegram user authentication, consent/data deletion and backup recovery before involving real participants.

## Installation on the VPS (after approval)

1. Install Docker Engine / Compose from official packages on Ubuntu 24.04, restrict SSH and expose TCP 80/443.
2. Put the reconciled current source on VPS; do not overwrite uncommitted local changes with old GitHub master.
3. Copy .env.production.example to .env.production in repo root, set the assigned provider hostname (or separately approved custom domain), HTTPS URL and token **only on VPS**, chmod 600. Verify public DNS points to the VPS before expecting automatic Caddy TLS. Do not invent a domain or buy one without approval.
4. Check: docker compose --env-file .env.production -f deploy/compose.yml config --quiet
5. After securing existing database and stopping the old poller, launch:
   docker compose --env-file .env.production -f deploy/compose.yml up -d --build
6. Confirm /api/health and /api/version, HTML, release.json and JS/CSS over HTTPS. The expected buildId is published in dist/release.json.
7. Before changing Telegram, run:
   docker compose --env-file .env.production -f deploy/compose.yml run --rm --no-deps bot python -m scripts.sync_telegram_buttons --url https://app.YOUR-DOMAIN --expected-build YOUR-BUILD-ID
   This is a dry run; requires PUBLIC_BUILD_VERIFIED. Then run the same command with --apply to update the global Telegram chat menu **only with owner's approval**, and verify MENU_BUTTON_VERIFIED.
8. The bot reads the same WEBAPP_URL for new inline buttons. Open the bot and send /start to get a new inline button. Telegram previously sent messages keep their original URL: editing one requires the real chat/message IDs; do not guess them or mass-message users. Channel buttons may need separate channel-admin changes.
9. Test both buttons in real Telegram, navigation and daily tips. Reboot VPS, confirm services start, test backup restore.

## Rollback / protection

Use sqlite3.Connection.backup for consistent DB backup while live, not naive file copy. Encrypt off-server copies and test restore. Keep old configuration and known-working build until new HTTPS and Telegram acceptance. Never delete Docker volumes to fix a launch failure.

## Acceptance criteria

- Public probe confirms expected release build ID and HTML/JS/CSS.
- One bot poller, bot username verified, bot menu URL reads back as the tested address.
- New /start inline button points to the same verified HTTPS URL.
- Android Telegram opens full app from both entry points.
- Daily tip functions in deployed version; existing features remain intact.
- Backup and restart recover successfully.

Status: PREPARED only. No VPS purchased, DNS changed, bot restarted or Telegram buttons modified.
