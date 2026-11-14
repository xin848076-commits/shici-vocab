"""Prepare a local English-Chinese dictionary from ECDICT (MIT)."""
import csv
import hashlib
import io
import json
import re
import unicodedata
from pathlib import Path
import urllib.request

root = Path(__file__).resolve().parents[1] / 'vocab-meanings'
root.mkdir(exist_ok=True)
headers = {'User-Agent': 'Shici-local-dictionary-builder'}
def download(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60).read()

provenance_file = root / 'provenance.json'
commit = json.loads(provenance_file.read_text(encoding='utf-8'))['commit'] if provenance_file.exists() else json.loads(download('https://api.github.com/repos/skywind3000/ECDICT/commits/master'))['sha']
url = f'https://raw.githubusercontent.com/skywind3000/ECDICT/{commit}/ecdict.csv'
raw = download(url)
(root / 'LICENSE').write_bytes(download(f'https://raw.githubusercontent.com/skywind3000/ECDICT/{commit}/LICENSE'))
data, phrases = {}, {}
for row in csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))):
    word, translation = row['word'].strip().lower(), row['translation'].strip()
    common = bool(row.get('tag')) or any(0 < int(row.get(field) or 0) <= 40000 for field in ('bnc', 'frq'))
    if word and translation and common:
        data[word] = translation
    if word and translation and ' ' in word and len(word) <= 100 and any('a' <= char <= 'z' for char in word):
        phrase = unicodedata.normalize('NFKC', word).replace('’', "'").replace('‘', "'")
        phrase = re.sub('[‐‑‒–—−]', '-', phrase)
        phrases[re.sub(r'\s+', ' ', phrase).strip().lower()] = translation
(root / 'dictionary.js').write_text('/* ECDICT frequency/exam subset (MIT). See LICENSE and provenance.json. */\nwindow.SHICI_MEANINGS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
(root / 'phrases.js').write_text('/* ECDICT phrase entries (MIT). See LICENSE and phrases-provenance.json. */\nwindow.SHICI_PHRASES = ' + json.dumps(phrases, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
(root / 'phrases-provenance.json').write_text(json.dumps({'project':'skywind3000/ECDICT','commit':commit,'source':url,'sha256':hashlib.sha256(raw).hexdigest(),'entries':len(phrases),'transformation':'Retain nonempty translations for multiword entries <=100 characters, independent of frequency or exam tags; lowercase keys.'},indent=2),encoding='utf-8')
(root / 'provenance.json').write_text(json.dumps({'project': 'skywind3000/ECDICT', 'commit': commit, 'source': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'entries': len(data), 'transformation': 'Exam-tagged entries or BNC/contemporary frequency rank <=40000; lowercase keys and retain Chinese translation. No executable source imported.'}, indent=2), encoding='utf-8')
print('Dictionary entries:', len(data), 'Source bytes:', len(raw))
print('Phrase entries:', len(phrases))
for key in ['apple', 'bank', 'individual', 'systematically', 'inpatient', 'outpatient', 'endeavor', 'be obsessed with', 'in essence', 'usage']:
    print(key, repr(data.get(key)))
