"""Encrypted online SQLite copy + daily copy. Never deletes source or old backups."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

def backup_cycle(source: Path, destination: Path, key_file: Path, *, minimum_free_mib: int = 256) -> dict:
    source = source.resolve(strict=True)
    key_file = key_file.resolve(strict=True)
    destination = destination.resolve()
    if source == key_file or source.parent == destination or destination == source:
        raise ValueError('Use a separate backup directory and key file')
    if minimum_free_mib < 0:
        raise ValueError('minimum_free_mib must be non-negative')
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    if shutil.disk_usage(destination).free < minimum_free_mib * 1024 * 1024:
        raise RuntimeError('Insufficient free disk space; existing copies were retained')
    if os.name != 'nt' and key_file.stat().st_mode & 0o077:
        raise PermissionError('Encryption key file must be private (0600)')
    now = datetime.now(timezone.utc)
    target = destination / f'owner-{now:%Y%m%dT%H%M%S%fZ}.db.enc'
    command = [sys.executable, str(Path(__file__).with_name('backup_db.py')), '--source', str(source), '--dest', str(target), '--encrypt', '--key-file', str(key_file)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=60, env={**os.environ, 'KETO_LOAD_DOTENV': '0'})
    if result.returncode:
        raise RuntimeError('Encrypted SQLite backup failed; inspect the backup service exit status')
    target.chmod(0o600)
    daily_dir = destination / 'daily'
    daily_dir.mkdir(mode=0o700, exist_ok=True)
    daily = daily_dir / f'owner-{now:%Y%m%d}.db.enc'
    if not daily.exists():
        shutil.copy2(target, daily)
        daily.chmod(0o600)
        meta = target.with_name(target.name.removesuffix('.db.enc') + '.json')
        if meta.exists():
            daily_meta = daily.with_name(daily.name.removesuffix('.db.enc') + '.json')
            metadata = json.loads(meta.read_text(encoding='utf-8'))
            metadata['backup_file'] = daily.name
            daily_meta.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
            daily_meta.chmod(0o600)
    receipt = {'created_at': now.isoformat(), 'file': target.name, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'encrypted': True, 'daily_copy': daily.name, 'free_bytes': shutil.disk_usage(destination).free, 'offsite_confirmed': False}
    temporary = destination / 'latest.json.tmp'
    temporary.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    temporary.chmod(0o600)
    temporary.replace(destination / 'latest.json')
    return receipt

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--dest', type=Path, required=True)
    parser.add_argument('--key-file', type=Path, required=True)
    parser.add_argument('--minimum-free-mib', type=int, default=256)
    args = parser.parse_args()
    try:
        print(json.dumps(backup_cycle(args.source, args.dest, args.key_file, minimum_free_mib=args.minimum_free_mib)))
        return 0
    except Exception as exc:
        print(f'Backup cycle failed: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
