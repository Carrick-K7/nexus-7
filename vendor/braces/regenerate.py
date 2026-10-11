#!/usr/bin/env python3
"""Rebuild the private archive from the recorded npm source and exact patch."""
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile

root = Path(__file__).resolve().parent
upstream = (root / 'upstream.tgz').read_bytes()
provenance = json.loads((root / 'UPSTREAM.json').read_text())
assert 'sha512-' + base64.b64encode(hashlib.sha512(upstream).digest()).decode() == provenance['dist']['integrity']
with tempfile.TemporaryDirectory(prefix='nexus-braces-regenerate-') as temporary:
    directory = Path(temporary)
    with tarfile.open(fileobj=io.BytesIO(upstream), mode='r:gz') as archive:
        archive.extractall(directory, filter='data')
    source = directory / 'package'
    for item in provenance['files']:
        assert hashlib.sha256((source / item['path']).read_bytes()).hexdigest() == item['sha256']
    subprocess.run(['patch', '--batch', '--fuzz=0', '-p1', '-i', str(root / 'SECURITY.patch')], cwd=source, check=True)
    files = {p.relative_to(source).as_posix(): p.read_bytes() for p in source.rglob('*') if p.is_file()}
    for name in ['LOCAL-SECURITY.md', 'UPSTREAM.json', 'SECURITY.patch']:
        files[name] = (root / name).read_bytes()
    manifest = json.loads((root / 'MANIFEST.json').read_text())
    assert {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())} == manifest['files']
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted(files.items()):
            info = tarfile.TarInfo('package/' + name)
            info.size, info.mode, info.mtime = len(data), 0o644, 0
            archive.addfile(info, io.BytesIO(data))
    result = gzip.compress(buffer.getvalue(), mtime=0)
    assert hashlib.sha256(result).hexdigest() == manifest['archiveSha256']
    # Verify the existing artifact rather than silently replacing unreviewed bytes.
    assert result == (root / 'fork.tgz').read_bytes()
    print('Exact patch replay, per-file hashes and deterministic archive reproduction passed.')
