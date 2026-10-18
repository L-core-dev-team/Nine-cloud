import zipfile, pathlib, hashlib, json, sys
root = pathlib.Path(sys.argv[1]).resolve()
assert 'INTEGRATION-HANDOVER-01' == root.name
archive_path = root / 'postgresql-18.6-windows-x64-binaries.zip'
assert archive_path.stat().st_size == 384620317, archive_path.stat().st_size
with zipfile.ZipFile(archive_path) as archive:
    bad = archive.testzip()
    assert bad is None, bad
    selected = [n for n in archive.namelist() if n.startswith(('pgsql/bin/', 'pgsql/lib/', 'pgsql/share/'))]
    for name in selected:
        assert '..' not in pathlib.PurePosixPath(name).parts
        archive.extract(name, root / 'pg18')
manifest = {
    'provider': 'PostgreSQL official Windows page -> EDB',
    'page': 'https://www.enterprisedb.com/download-postgresql-binaries',
    'redirect': 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260609',
    'url': 'https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64-binaries.zip',
    'bytes': archive_path.stat().st_size,
    'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
    'zipCrcAllVerified': True,
    'extractedEntries': len(selected),
    'upstreamShaPublishedVerified': False,
}
(root / 'postgresql-tools-provenance.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps(manifest))
