# Keto Balance — VPS / Telegram migration (PREPARATION ONLY)

One VPS in Russia hosts React Mini App, Python FastAPI, one polling Telegram bot and SQLite. A stable publicly verified HTTPS hostname is required. For long-lived Telegram buttons an independently owned domain is recommended; a provider or free hostname must not be assumed permanent. The current local Terra/Antigravity edits must be reconciled first: public GitHub master is from 27 October and is NOT the latest live app.

## Hosting comparison — November 4, 2026 (no provider chosen, not purchased)

**Corrected shortlist after the owner's challenge:** do NOT default to AdminVPS and do NOT buy a provider before validating the actual order and required data-protection arrangements.

| Provider/product | Published resources and indicative monthly price | Critical caveats |
| --- | --- | --- |
| Selectel **new VDS 2-2-40** | 2 vCPU, 2 GB, 40 GB NVMe; **400 RUB** | IPv4 included, 3 TB external transfer, no automatic backups; **vendor explicitly says this VDS product does not meet 152-FZ**; use only without actual participant/health data |
| Selectel **new VDS 2-4-50** | 2 vCPU, 4 GB, 50 GB NVMe; **650 RUB** | Best published raw resources per ruble among this shortlist, same compliance and backup caveats |
| Selectel **Cloud 152-FZ** | Cloud Standard Line from **948.50 RUB/month** for minimum offer, exact project-sized configuration requires calculator quote | Provider has documented 152-FZ infrastructure and can provide processing mandate; 2026-11-03 ru-7 networking incident now reported resolved; inspect chosen pool and actual backup/IP cost |
| Timeweb **Cloud-40 / Cloud-50** | 2 vCPU, 2 GB, 40 GB **900 RUB**; 2 vCPU, 4 GB, 50 GB **1080 RUB** | Public IPv4 extra; backups 6 RUB per GB per retained backup; separately verify that the **actual product/account** has required 152-FZ legal documents; 2026-10-23 MSK-1 incident resolved; 2026-11-04 MSK servers on status page operational |
| AdminVPS **Promo** | 1 vCPU, 2 GB, 30 GB NVMe; official page shows **429 RUB**, older/nonidentical indexes may show other rates | Published weekly server backup; verify current checkout price, dedicated IPv4, ability to provide required data protection/legal documents |
| FirstVDS **Старт SSD** | 1 vCPU, 2 GB, 40 GB SSD; **519 RUB** | IPv4 included; backups extra; no clear advantage over Selectel for synthetic-only pilot |
| SpaceWeb **Базовый** | 2 vCPU, 2 GB, 30 GB NVMe; current published calculator circa **930 RUB** | Backups and IPv4 to verify; more costly for similar resources |
| RUVDS **Турбо 1** | 2 vCPU, 4 GB, 40 GB SSD; advertised **1149 RUB/month on a 3-month term** | Compare only like-for-like one-month checkout |

**Operational distinction:** The owner needs both a working Telegram Mini App and, eventually, a service storing users' health-related diaries. For synthetic-only staging, Selectel's modern 650 RUB VDS is a strong value candidate. For live client data, assess Selectel Cloud 152-FZ and Timeweb Cloud compliant offering, legal processing agreement, backup and full checkout; the cheap Selectel VDS is NOT an interchangeable compliance-certified alternative. A Russian IP alone is not sufficient legal compliance.

**Incident sources (time-sensitive):** https://selectel.live/ (Nov 3 ru-7 incident), https://timeweb.cloud/live (Oct 23 MSK-1 incident, current pool statuses). Vendor sources: https://selectel.ru/services/cloud/vps-vds/ ; https://docs.selectel.ru/vds-servers/about/about-vds-server/ ; https://selectel.ru/services/cloud/servers/152fz/ ; https://timeweb.cloud/services/cloud-servers ; https://timeweb.cloud/solutions/152fz ; https://adminvps.ru/vps/vps_russia.php .

No server, IP, domain, DNS or public Telegram button has been purchased/changed. Preserve uncommitted local Terra changes and do not merge this draft branch over them.

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
