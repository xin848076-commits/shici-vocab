"""Vendor pinned npm spellchecker assets without running package install scripts."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / 'vocab-spell'
ROOT.mkdir(exist_ok=True)
for name, version in [('typo-js', '1.4.0'), ('dictionary-en', '4.0.0'), ('dictionary-en-gb', '3.0.0')]:
    url = f'https://registry.npmjs.org/{name}/-/{name}-{version}.tgz'
    raw = urllib.request.urlopen(url, timeout=30).read()
    archive = tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz')
    dest = ROOT / name
    dest.mkdir(exist_ok=True)
    for member in archive.getmembers():
        leaf = Path(member.name).name
        wanted = (leaf == 'typo.js' or leaf.lower().startswith('license')) if name == 'typo-js' else (leaf.endswith(('.aff', '.dic')) or leaf.lower() in ('license', 'license.txt'))
        if member.isfile() and wanted:
            (dest / leaf).write_bytes(archive.extractfile(member).read())
    (dest / 'provenance.json').write_text(json.dumps({'package': name, 'version': version, 'url': url, 'sha256': hashlib.sha256(raw).hexdigest()}, indent=2), encoding='utf-8')
    if name == 'typo-js':
        metadata = json.loads(urllib.request.urlopen(f'https://registry.npmjs.org/{name}/{version}', timeout=30).read())
        commit = metadata['gitHead']
        license_url = f'https://raw.githubusercontent.com/cfinke/Typo.js/{commit}/license.txt'
        (dest / 'license.txt').write_bytes(urllib.request.urlopen(license_url, timeout=30).read())
        (dest / 'license-source.json').write_text(json.dumps({'commit': commit, 'url': license_url}, indent=2), encoding='utf-8')
    print(name, version, [p.name for p in dest.iterdir()])

# A plain script also works under file://, where fetching .aff/.dic would fail.
data = {}
for name, code in [('dictionary-en', 'en_US'), ('dictionary-en-gb', 'en_GB')]:
    data[code] = {ext: (ROOT / name / f'index.{ext}').read_text(encoding='utf-8') for ext in ('aff', 'dic')}
(ROOT / 'dictionaries.js').write_text('/* Generated from pinned npm dictionaries; see provenance and licenses. */\nwindow.SHICI_DICTIONARIES = ' + json.dumps(data, ensure_ascii=True) + ';\n', encoding='utf-8')
