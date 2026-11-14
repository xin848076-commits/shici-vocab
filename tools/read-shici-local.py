"""Read only shici.vocabulary.v1 from Edge's local storage; never open DB for writes.

Parses LevelDB table/log formats directly. Other keys/values are neither printed
nor saved. Run only when the user authorizes reading their current word list.
"""
import json
import argparse
from pathlib import Path
import struct

KEY = 'shici.vocabulary.v1'
SOURCE = Path.home() / 'AppData/Local/Microsoft/Edge/User Data/Default/Local Storage/leveldb'
OUTPUT = Path(__file__).resolve().parents[1] / 'reports/vocab-examples-20261108/current-vocabulary.json'
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=OUTPUT)
parser.add_argument('--baseline', type=Path)
args = parser.parse_args()
OUTPUT = args.output.resolve()

def varint(data, pos=0):
    value = shift = 0
    while True:
        byte = data[pos]; pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
        shift += 7
        if shift > 63:
            raise ValueError('Invalid varint')

def uncompress(data):
    size, pos = varint(data)
    if size > 64 * 1024 * 1024:
        raise ValueError('Unexpected block size')
    out = bytearray()
    while pos < len(data):
        tag = data[pos]; pos += 1
        kind = tag & 3
        if not kind:
            length = tag >> 2
            if length >= 60:
                count = length - 59
                length = int.from_bytes(data[pos:pos + count], 'little'); pos += count
            length += 1
            out.extend(data[pos:pos + length]); pos += length
        else:
            if kind == 1:
                length = 4 + ((tag >> 2) & 7)
                offset = ((tag & 224) << 3) | data[pos]; pos += 1
            else:
                length = 1 + (tag >> 2)
                count = 2 if kind == 2 else 4
                offset = int.from_bytes(data[pos:pos + count], 'little'); pos += count
            if not 0 < offset <= len(out):
                raise ValueError('Invalid Snappy offset')
            for _ in range(length):
                out.append(out[-offset])
    if len(out) != size:
        raise ValueError('Snappy size mismatch')
    return bytes(out)

def entries(block):
    restarts = struct.unpack('<I', block[-4:])[0]
    end = len(block) - 4 - restarts * 4
    pos, key = 0, b''
    while pos < end:
        shared, pos = varint(block, pos)
        nonshared, pos = varint(block, pos)
        value_length, pos = varint(block, pos)
        key = key[:shared] + block[pos:pos + nonshared]; pos += nonshared
        value = block[pos:pos + value_length]; pos += value_length
        yield key, value

def handle(data, pos=0):
    offset, pos = varint(data, pos)
    size, pos = varint(data, pos)
    return (offset, size), pos

def read_block(data, pair):
    offset, size = pair
    block = data[offset:offset + size]
    kind = data[offset + size]
    if kind == 1:
        return uncompress(block)
    if kind != 0:
        raise ValueError('Unsupported table compression')
    return block

def table_records(file):
    data = file.read_bytes()
    if len(data) < 48 or data[-8:] != bytes.fromhex('57fb808b247547db'):
        raise ValueError('Invalid LevelDB table footer')
    _, pos = handle(data, len(data) - 48)
    index, _ = handle(data, pos)
    for _, value in entries(read_block(data, index)):
        pair, _ = handle(value)
        for key, value in entries(read_block(data, pair)):
            internal = int.from_bytes(key[-8:], 'little')
            yield internal >> 8, internal & 255, key[:-8], value

def log_records(file):
    raw = file.read_bytes(); partial = bytearray()
    for begin in range(0, len(raw), 32768):
        block = raw[begin:begin + 32768]; pos = 0
        while pos + 7 <= len(block):
            _, length, kind = struct.unpack('<IHB', block[pos:pos + 7]); pos += 7
            if kind == 0 or pos + length > len(block):
                break
            content = block[pos:pos + length]; pos += length
            if kind == 1:
                batch = content
            elif kind == 2:
                partial = bytearray(content); continue
            elif kind == 3:
                partial.extend(content); continue
            elif kind == 4:
                partial.extend(content); batch = bytes(partial); partial.clear()
            else:
                raise ValueError('Invalid log record')
            seq, count = struct.unpack('<QI', batch[:12]); loc = 12
            for i in range(count):
                tag = batch[loc]; loc += 1
                key_size, loc = varint(batch, loc); key = batch[loc:loc + key_size]; loc += key_size
                value = b''
                if tag == 1:
                    value_size, loc = varint(batch, loc); value = batch[loc:loc + value_size]; loc += value_size
                yield seq + i, tag, key, value

latest = {}
for file in list(SOURCE.glob('*.ldb')) + list(SOURCE.glob('*.log')):
    for sequence, kind, key, value in (table_records(file) if file.suffix == '.ldb' else log_records(file)):
        # DOM storage keys end with a string-encoding marker and the exact name.
        if not (key.endswith(b'\x01' + KEY.encode()) or key.endswith(b'\x00' + KEY.encode('utf-16-le'))):
            continue
        if key not in latest or latest[key][0] < sequence:
            latest[key] = (sequence, kind, value)
found = []
for sequence, kind, value in latest.values():
    if kind != 1 or not value:
        continue
    text = value[1:].decode('utf-16-le' if value[0] == 0 else 'latin-1')
    data = json.loads(text)
    if data.get('version') == 1 and isinstance(data.get('words'), list):
        found.append((sequence, data))
if not found:
    raise SystemExit('No current Shici vocabulary found; no browser data changed.')
_, current = max(found, key=lambda item: item[0])
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
old_file = args.baseline or (Path(__file__).resolve().parents[1] / '拾词备份-校正版-2026-11-08.json')
old = json.loads(old_file.read_text(encoding='utf-8'))
old_ids = {entry['id'] for entry in old['words']}
print('Current words:', len(current['words']))
print('New/updated entries relative to earlier backup:')
old_by_id = {entry['id']: entry for entry in old['words']}
for entry in current['words']:
    before = old_by_id.get(entry['id'])
    if before is None or (before['word'], before['meaning']) != (entry['word'], entry['meaning']):
        print(json.dumps({'word': entry['word'], 'meaning': entry['meaning']}, ensure_ascii=False))
print('Filtered snapshot:', OUTPUT)
