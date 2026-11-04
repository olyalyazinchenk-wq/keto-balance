# Keto Balance — VPS / Telegram migration (PREPARATION ONLY)

One VPS in Russia hosts React Mini App, Python FastAPI, one polling Telegram bot and SQLite. A stable publicly verified HTTPS hostname is required. For long-lived Telegram buttons an independently owned domain is recommended; a provider or free hostname must not be assumed permanent. The current local Terra/Antigravity edits must be reconciled first: public GitHub master is from 27 October and is NOT the latest live app.

## Updated recommendation — 2026-11-04 (PAID VPS, NOT ORDERED)

Owner declined further free trials. Official incident notice: Beget suffered a serious attack 2026-11-02 and was still restoring systems on 2026-11-04; exclude Beget. SmartApe sign-up phone verification failed.

**Best current starting option, conditional on checkout verification:** AdminVPS Russia / 3.6 GHz / Promo: 1 vCPU, 2 GB RAM, 30 GB NVMe. The vendor's indexed price page shows 429 RUB (older cached rate); a November 1 independent price check shows **499 RUB/month**. Budget using the fresher 499 number, not 429. Published terms indicate weekly server snapshots, 3 TB traffic, basic protection and Russian datacentre. Verify the exact amount, public IPv4 inclusion, no recurring panel upsell and availability in the actual order; otherwise decline checkout. Free-trial Telegram-bot prohibition in AdminVPS's terms applies to the **trial**, not a paid VPS, but outbound Telegram Bot API still must be independently verified from the deployed host.

**Backup choice:** FirstVDS Russia "Старт SSD": 1 vCPU, 2 GB RAM, 40 GB SSD, one included IPv4, 519 RUB/month from effective 2026-08 official price list. Backups are **6 RUB/month per billed GB** as a separate paid feature; do not assume full disk necessarily billed.

**Premium alternative:** Timeweb Cloud Russia Cloud-40: 2 vCPU, 2 GB RAM, 40 GB NVMe, listed 900 RUB/month; clarify IPv4 and backup in checkout. More CPU but larger monthly cost, not justified for initial Keto Balance usage without measured load.

Cost & evidence:
- https://adminvps.ru/vps/vps_russia.php (older cached 429 figure)
- https://servercalc.ru/indeks-cen-vps/ (2026-11-01 newer 499 figure)
- https://firstvds.ru/docs/tariffs.html (official 519, backup 6 RUB/GB)
- https://timeweb.cloud/services/cloud-servers
- https://beget.com/ru (incident notice 2026-11-04)

**Risk controls:** initially pay for **one month only**, not an annual discount. Do not add ispmanager, premium admin, extra IPv4 or extra backup services silently. Confirm actual IP/network, ports 80/443, outbound api.telegram.org, TLS and static asset release ID within initial paid period. Only then transfer the production polling bot and cut over Telegram buttons. Preserve clean old server backup and rollback information. Never claim a published service until an Android Telegram acceptance test passes.

**Domain:** owner confirmed there is **no purchased domain**. A stable owned domain is recommended for long-term Telegram buttons and avoids provider-specific and ephemeral tunnel URLs, but requires a separate owner purchase decision. For .RU, registration/renewal require ESIA identity verification since 2026-09-01; R01's published 2026 prices were 635 RUB first year and 1049 RUB renewal, not a guarantee of today's checkout price. Do not purchase a domain without the owner's approval, and do not treat a disposable tunnel/free subdomain as permanent.

## Safety prerequisites

- Owner approves VPS rental and exact quote before purchasing. Owner confirms NO OWNED DOMAIN; domain purchase needs separate approval. Owner approves production cutover before changing the active bot.
- Preserve local dirty work and make a verified backup of the current database. Do not upload client data to GitHub or public services.
- Owner explicitly confirmed on 2026-11-04 that no domain has been purchased. Do not assume an AdminVPS free hostname. Use a temporary verified HTTPS DNS only for technical validation; choose an independently owned domain for persistent Telegram entry when separately approved.
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
