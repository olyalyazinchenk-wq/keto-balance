"""Rehearse the additive support migration on a NEW copy only.

The source is opened with SQLite mode=ro. This command deliberately provides
no apply-to-source option and refuses to overwrite an existing destination.
"""
import argparse
from contextlib import closing
import base64
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _quote(name):
    return '"' + name.replace('"', '""') + '"'


def _json_value(value):
    return {'bytes_base64': base64.b64encode(value).decode('ascii')} if isinstance(value, bytes) else value


def table_fingerprints(conn):
    result = {}
    names = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    for name in names:
        # Sorting serialized rows handles tables without a rowid/primary key too.
        encoded_rows = sorted(json.dumps([_json_value(v) for v in row], ensure_ascii=False,
                                         separators=(',', ':'), allow_nan=False).encode('utf-8')
                              for row in conn.execute('SELECT * FROM ' + _quote(name)))
        digest = hashlib.sha256()
        for row in encoded_rows:
            digest.update(len(row).to_bytes(8, 'big')); digest.update(row)
        result[name] = {'rows': len(encoded_rows), 'sha256': digest.hexdigest()}
    return result


def schema_fingerprint(conn):
    rows = list(conn.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name"))
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()


def rehearse(source, destination):
    source = Path(source).expanduser().resolve(strict=True)
    destination = Path(destination).expanduser().absolute()
    if not source.is_file():
        raise ValueError('Source must be an existing SQLite file')
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.resolve() == source or destination.exists():
        raise ValueError('Destination must be a new file, different from source')
    # Atomic reservation prevents replacing a destination created in parallel.
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    from bot.app_db import _migrate_support_queue
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as src:
        src.execute('PRAGMA query_only=ON')
        with closing(sqlite3.connect(destination)) as conn:
            src.backup(conn)
            conn.execute('PRAGMA foreign_keys=ON')
            before = table_fingerprints(conn)
            old_schema = schema_fingerprint(conn)
            conn.execute('BEGIN IMMEDIATE')
            _migrate_support_queue(conn)
            conn.commit()
            after = table_fingerprints(conn)
            preserved = all(after.get(name) == digest for name, digest in before.items())
            integrity = conn.execute('PRAGMA integrity_check').fetchone()[0]
            foreign_key_violations = len(conn.execute('PRAGMA foreign_key_check').fetchall())
            first_schema = schema_fingerprint(conn)
            conn.execute('BEGIN IMMEDIATE')
            _migrate_support_queue(conn)
            conn.commit()
            idempotent = after == table_fingerprints(conn) and first_schema == schema_fingerprint(conn)
            # Original columns are readable by the previous application's queries.
            old_reader_rows = len(conn.execute('SELECT id,user_id,topic,message,contact,status,created_at FROM support_tickets').fetchall())
            added_schema = [r[0] for r in conn.execute("SELECT sql FROM sqlite_master WHERE name IN ('support_reviews','idx_support_delivery') ORDER BY name")]
    return {'source_open_mode': 'read-only', 'source': str(source), 'copy': str(destination),
            'passed': preserved and integrity == 'ok' and foreign_key_violations == 0 and idempotent,
            'old_tables_unchanged': preserved, 'before_tables': before, 'after_tables': after,
            'integrity_check': integrity, 'foreign_key_violations': foreign_key_violations,
            'idempotent': idempotent, 'old_reader_rows': old_reader_rows,
            'before_schema_sha256': old_schema, 'after_schema_sha256': first_schema,
            'added_schema_sql': added_schema,
            'rollback': 'Run the previous application code; keep the additive table. Do not restore over current user data.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--dest', type=Path, required=True)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    os.environ['KETO_LOAD_DOTENV'] = '0'
    try:
        report = rehearse(args.source, args.dest)
        encoded = json.dumps(report, ensure_ascii=False, indent=2)
        if args.report:
            # A report may not overwrite databases or another earlier receipt.
            args.report.parent.mkdir(parents=True, exist_ok=True)
            with args.report.open('x', encoding='utf-8') as handle:
                handle.write(encoded + '\n')
        print(encoded)
        return 0 if report['passed'] else 1
    except (OSError, ValueError, sqlite3.Error) as exc:
        print(f'Migration rehearsal failed: {type(exc).__name__}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
