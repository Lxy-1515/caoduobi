"""Build a local H5 test bundle; never uploads or publishes anything."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from datetime import datetime, timezone, timedelta

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--version', default='1.0.0')
args = parser.parse_args()
if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', args.version):
    parser.error('version must be x.y.z')
subprocess.run(['node', str(root / 'build.cjs')], cwd=root, check=True)
out = root / 'dist' / 'taptap-h5'
out.mkdir(parents=True, exist_ok=True)
(out / 'licenses').mkdir(exist_ok=True)
entries = {
    'index.html': (root / 'play.html').read_bytes(),
    'licenses/title-font-license.txt': (root / 'docs' / 'title-font-license.txt').read_bytes(),
}
for name, data in entries.items():
    (out / name).write_bytes(data)
archive = root / 'dist' / ('caoduobi-h5-' + args.version + '.zip')
# Match TapTap's official H5 archiver: ZIP has one enclosing game folder.
# Root-level index.html + licenses/ is rejected by the web uploader.
archive_root = out.name
archive_entries = {archive_root + '/' + name: data for name, data in entries.items()}
directories = {archive_root + '/', archive_root + '/licenses/'}
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for name in sorted(directories):
        bundle.writestr(name, b'')
    for name, data in archive_entries.items():
        bundle.writestr(name, data)
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    assert set(bundle.namelist()) == set(archive_entries) | directories
    assert {PurePosixPath(name).parts[0] for name in bundle.namelist()} == {archive_root}
    assert bundle.getinfo(archive_root + '/').is_dir()
    assert archive_root + '/index.html' in bundle.namelist()
    for name, data in archive_entries.items():
        assert bundle.read(name) == data
metadata = {
    'builtAt': datetime.now(timezone(timedelta(hours=8))).isoformat(),
    'version': args.version, 'archive': str(archive), 'entry': str(out / 'index.html'),
    'archiveRoot': archive_root, 'archiveEntry': archive_root + '/index.html',
    'archiveRootCount': 1,
    'bytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'files': {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in archive_entries.items()},
    'validation': 'Single enclosing root directory, ZIP CRC and entry hashes verified; platform acceptance/auth/network not implied.',
}
(root / 'qa').mkdir(exist_ok=True)
(root / 'qa' / 'taptap-h5-package.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(metadata, ensure_ascii=True))
