// 分析词库备份里哪些词/义项没有本地例句。
// 用法: node tools/example-coverage.cjs "路径/备份.json" [--list]
// 匹配规则与 vocab-examples.js 的 get() 保持一致（精确 → 近似，跨词性不配）。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function loadGlobal(file) {
  const sandbox = {};
  new Function('window', fs.readFileSync(path.join(root, file), 'utf8'))(sandbox);
  return sandbox;
}
const data = {
  ...(loadGlobal('vocab-examples-extra.js').SHICI_EXAMPLE_EXTENSIONS || {}),
  ...(loadGlobal('vocab-examples-data.js').SHICI_EXAMPLE_DATA || {})
};

// 与页面 vocab-examples.js 的 wordKey 保持一致：特殊短语归一到通用形式。
const wordKey = word => {
  let key = String(word).normalize('NFKC').trim().toLowerCase().replace(/[‐‑‒–—−]/g, '-').replace(/[‘’]/g, "'").replace(/[\u200b\uFEFF]/g, '').replace(/\s+/g, ' ').replace(/\s*(?:\.{2,}|…+)\s*$/, '').trim();
  if (/^[（(]观点[）)]\s*\.{3,}\s*for the following reasons$/.test(key)) key = 'for the following reasons';
  return key;
};
function senseKey(sense) {
  const match = sense.trim().match(/^([a-z]+\.)\s*/i);
  let pos = match ? match[1].toLowerCase().replace('.', '') : '';
  if (['a', 'adj'].includes(pos)) pos = 'adj';
  if (['vt', 'vi', 'v'].includes(pos)) pos = 'v';
  const body = (match ? sense.trim().slice(match[0].length) : sense).replace(/（(?:如 |英式拼写 )[^）]*）/g, '').replace(/[.。…\s]/g, '').replace(/\(/g, '（').replace(/\)/g, '）');
  return { pos, body };
}
const looseText = text => text.replace(/[（(][^）)]*[）)]/g, '').replace(/[\s·・,，;；、.。!！?？'"“”‘’…]/g, '');
function bigramSet(text) {
  const chars = [...text];
  if (chars.length < 2) return new Set(chars);
  const out = new Set();
  for (let i = 0; i < chars.length - 1; i++) out.add(chars[i] + chars[i + 1]);
  return out;
}
function senseScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const short = a.length <= b.length ? a : b, long = a.length <= b.length ? b : a;
  if (long.includes(short)) return 0.86;
  const A = bigramSet(a), B = bigramSet(b);
  let hit = 0;
  for (const piece of A) if (B.has(piece)) hit++;
  return (2 * hit) / ((A.size + B.size) || 1);
}
function lookup(word, sense) {
  const key = wordKey(word);
  if (!Object.hasOwn(data, key)) return null;
  const wanted = senseKey(sense);
  let best = 0;
  for (const [names] of data[key]) {
    const aliases = names.split('|'), primary = senseKey(aliases[0]);
    for (const name of aliases) {
      const alias = senseKey(name);
      if (wanted.body === alias.body && (!wanted.pos || wanted.pos === (alias.pos || primary.pos))) return 1;
      const aliasPos = alias.pos || primary.pos;
      if (wanted.pos && aliasPos && wanted.pos !== aliasPos) continue;
      best = Math.max(best, senseScore(looseText(wanted.body), looseText(alias.body)));
    }
  }
  return best >= 0.55 ? best : null;
}
function splitSenses(meaning) {
  const separated = String(meaning).replace(/(?<=[\u4e00-\u9fff.])\/(?=[\u4e00-\u9fff])/g, '；');
  return separated.split(/[；;\n]/).map(item => item.trim()).filter(item => item && !/^[.。…\s]+$/.test(item));
}

const file = process.argv[2];
if (!file) { console.error('用法: node tools/example-coverage.cjs "备份.json" [--list]'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const words = Array.isArray(raw) ? raw : (raw.words || []);
const showList = process.argv.includes('--list');

let senseTotal = 0, senseHit = 0, senseFuzzy = 0;
const missing = [];
for (const entry of words) {
  const senses = splitSenses(entry.meaning || '');
  const gaps = [];
  for (const sense of senses) {
    senseTotal++;
    const score = lookup(entry.word, sense);
    if (score === null) gaps.push(sense);
    else { senseHit++; if (score < 1) senseFuzzy++; }
  }
  if (gaps.length) missing.push({ word: entry.word, missing: gaps, total: senses.length });
}

console.log(`词数: ${words.length}`);
console.log(`义项: ${senseTotal}，有例句: ${senseHit}（其中近似匹配 ${senseFuzzy}），缺例句: ${senseTotal - senseHit}`);
console.log(`完全没例句的词: ${missing.filter(item => item.missing.length === item.total).length}，部分缺的: ${missing.filter(item => item.missing.length < item.total).length}`);
if (showList) {
  for (const item of missing) console.log(`- ${item.word}  [${item.total - item.missing.length}/${item.total}]  缺: ${item.missing.join(' / ')}`);
}
const out = path.join(root, 'reports', 'example-coverage.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ file, words: words.length, senseTotal, senseHit, missing }, null, 2));
console.log(`明细已写入 ${path.relative(root, out)}`);
