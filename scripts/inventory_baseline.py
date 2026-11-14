import subprocess
import hashlib
import os
import json

def get_git_status():
    res = subprocess.run(['git', 'status', '--porcelain'], capture_output=True, text=True)
    lines = res.stdout.splitlines()
    entries = []
    for l in lines:
        if not l.strip():
            continue
        status = l[:2]
        path = l[3:].strip()
        if ' -> ' in path:
            path = path.split(' -> ')[1]
        entries.append((status, path))
    return entries

entries = get_git_status()
manifest = {
    'branch_before': 'design/argon-ui-import',
    'head_before': '5f39a90',
    'files': []
}

for status, path in entries:
    full_path = os.path.join(os.getcwd(), path)
    if os.path.isfile(full_path):
        size = os.path.getsize(full_path)
        with open(full_path, 'rb') as f:
            h = hashlib.sha256(f.read()).hexdigest()
        manifest['files'].append({
            'status': status,
            'path': path,
            'size': size,
            'sha256': h
        })
    elif os.path.isdir(full_path):
        # Walk directory
        for root, _, filenames in os.walk(full_path):
            for fn in filenames:
                rel = os.path.relpath(os.path.join(root, fn), os.getcwd()).replace('\\', '/')
                size = os.path.getsize(os.path.join(root, fn))
                with open(os.path.join(root, fn), 'rb') as f:
                    h = hashlib.sha256(f.read()).hexdigest()
                manifest['files'].append({
                    'status': status,
                    'path': rel,
                    'size': size,
                    'sha256': h
                })

os.makedirs('docs/release', exist_ok=True)
with open('docs/release/baseline-inventory.json', 'w', encoding='utf-8') as out:
    json.dump(manifest, out, indent=2, ensure_ascii=False)

print(f"Recorded {len(manifest['files'])} files in docs/release/baseline-inventory.json")
