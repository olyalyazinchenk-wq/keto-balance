# Timeweb Cloud — setup state (2026-11-04)

**Status: OWNER REGISTERED, SUPPORT REQUEST SENT, SERVER NOT CREATED.**
Owner registered a Timeweb Cloud account. This assistant does not have direct account or billing access and has not inspected the balance, available promotional credits or bank card settings.

## Bonus request

Email sent on 2026-11-04 from connected Gmail to official info@timeweb.cloud. Request: 30 days of testing credits, otherwise 14 days, plus confirmation whether credits cover a public IPv4 and disk backups and what happens on expiry. A separate Gmail automation monitors replies. No registration number, token, password or customer data were sent.

Provider references:
- https://timeweb.cloud/docs/account-management/contact-support
- https://timeweb.cloud/docs/cloud-servers/manage-servers/create-server
- https://timeweb.cloud/docs/public-ip
- https://timeweb.cloud/docs/cloud-servers/manage-servers/backup
- https://timeweb.cloud/docs/cloud-servers/data-storage-after-block

## Intended single test server, only after verified credit and owner expense approval

- Region: Russia, prefer Saint Petersburg if available; verify status of exact zone.
- OS: clean Ubuntu 24.04 LTS, no marketplace software or paid control panel.
- Plan: fixed Cloud-40, 2 vCPU, 2 GiB RAM, 40 GiB NVMe, publicly listed at 900 RUB/month before extras.
- Quantity: one server, one public IPv4. IPv4 bills separately even when unattached; confirm quote and credit coverage before order.
- No extra IPv4, no paid DDoS (550 RUB/month), no marketplace panel.
- No provider emergency backup (200 RUB/month) by default. Normal backups cost 6 RUB per GB of disk per retained backup. Agree costs and external backup policy before storing real data; do not mistake backups for free.
- Auth: add SSH public key only. Never disclose private SSH keys or login passwords in chat or GitHub.
- Runtime: Docker Compose, one bot poller, FastAPI serving compiled React app, Caddy HTTPS, SQLite persistent volume.
- Payments disabled. Test with synthetic data only.
- First synchronize the latest uncommitted local Terra changes (including daily tip); GitHub master is older.

## Next execution stages

1. Receive support's written response about grant duration, promo balance and billing.
2. Check actual Timeweb account credits and exact combined 30-day cost (Cloud-40 + one IPv4 + approved backups).
3. Owner authorizes the exact amount and production cutover separately.
4. Create one server, install Docker, stage a reconciled current build.
5. Set stable public HTTPS hostname (owner has **not** bought a domain); do not rely on an ephemeral localhost.run tunnel.
6. Verify /api/health, /api/version, release ID, HTML, JS/CSS and Telegram API outbound.
7. Switch bottom-left global Telegram chat menu and new inline buttons to identical HTTPS origin. Previously issued inline keyboards require their exact message IDs to edit; do not assume they change automatically.
8. Verify both entry buttons inside real Android Telegram, daily tip and navigation. Check backup restore and reboot.

## Critical cost/retention traps

IPv4 is billed hourly even while unassigned. Disk backups are billed for each retained copy. Per provider documentation a balance-exhausted account can be blocked, and all resources including images may be deleted seven days after blockage. Export protected backups before any credit expires. Do not authorize automatic recurring charges while testing.

Status: preparation only; no VPS, IP, DNS, or bot menu changed.
