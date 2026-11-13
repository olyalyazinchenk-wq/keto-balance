"""Package a frozen isolated build; no secrets, databases or local runtime files."""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    receipt = json.loads(args.receipt.read_text(encoding='utf-8'))
    workspace = Path(receipt['workspace_dir'])
    dist = Path(receipt['dist_dir'])
    original_manifest=json.loads(Path(receipt['source_manifest_path']).read_text(encoding='utf-8'))
    for source_path, expected_hash in original_manifest.items():
        assert hashlib.sha256((workspace/source_path).read_bytes()).hexdigest()==expected_hash, 'Frozen source changed: '+source_path
    release = json.loads((dist / 'release.json').read_text(encoding='utf-8'))
    assert release['buildId'] == receipt['build_id'] and not release['dirty']
    assert hashlib.sha256((dist / 'released-catalog-v1.json').read_bytes()).hexdigest() == '0c02e2b78954cc4c8f7bf4feb65991eab04a61b4de8b2c6feff56141fa179725'
    args.output.mkdir(parents=True, exist_ok=False)
    files = []
    for directory, extensions in [('bot', {'.py'}), ('scripts', {'.py', '.mjs', '.cjs'}), ('docs/content', {'.json', '.md'})]:
        for item in (workspace / directory).rglob('*'):
            if item.is_file() and item.suffix in extensions and '__pycache__' not in item.parts:
                files.append((item, 'image/' + item.relative_to(workspace).as_posix()))
    files.extend((item, 'image/dist/' + item.relative_to(dist).as_posix()) for item in dist.rglob('*') if item.is_file())
    manifest = {}
    with tarfile.open(args.output / 'source.tar.gz', 'w:gz') as archive:
        for item, target in sorted(files, key=lambda x:x[1]):
            assert not item.name.startswith('.env') and item.suffix not in {'.db', '.sqlite', '.sqlite3'}
            manifest[target] = hashlib.sha256(item.read_bytes()).hexdigest()
            archive.add(item, arcname=target, recursive=False)
    (args.output / 'expected.json').write_text(json.dumps(release, indent=2), encoding='utf-8')
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'build_id':release['buildId'], 'files':len(files), 'archive_sha256':hashlib.sha256((args.output / 'source.tar.gz').read_bytes()).hexdigest()}))


if __name__ == '__main__': main()
