/* Sense-aligned original examples and optional user examples; no network calls. */
(() => {
  'use strict';
  const original = globalThis.SHICI_EXAMPLE_DATA || {};
  const extensions = globalThis.SHICI_EXAMPLE_EXTENSIONS || {};
  const data = { ...extensions, ...original };
  const drafts = new Map();
  const $ = id => document.getElementById(id);
  function wordKey(word) {
    let key = word.normalize('NFKC').trim().toLowerCase().replace(/[‐‑‒–—−]/g, '-').replace(/[‘’]/g, "'").replace(/[\u200b\uFEFF]/g, '').replace(/\s+/g, ' ').replace(/\s*(?:\.{2,}|…+)\s*$/, '').trim();
    if (/^[（(]观点[）)]\s*\.{3,}\s*for the following reasons$/.test(key)) key = 'for the following reasons';
    return key;
  }
  function senseKey(sense) {
    const match = sense.trim().match(/^([a-z]+\.)\s*/i);
    let pos = match ? match[1].toLowerCase().replace('.', '') : '';
    if (['a', 'adj'].includes(pos)) pos = 'adj';
    if (['vt', 'vi', 'v'].includes(pos)) pos = 'v';
    const body = (match ? sense.trim().slice(match[0].length) : sense).replace(/（(?:如 |英式拼写 )[^）]*）/g, '').replace(/[.。…\s]/g, '').replace(/\(/g, '（').replace(/\)/g, '）');
    return { pos, body };
  }
  function referenceSenses(word) {
    const key = wordKey(word);
    return Object.hasOwn(data, key) ? data[key].map(row => row[0].split('|')[0]) : null;
  }
  // 释义匹配用：去掉括号补充、标点与空白，只留主干文字。
  const looseText = text => text.replace(/[（(][^）)]*[）)]/g, '').replace(/[\s·・,，;；、.。!！?？'"“”‘’…]/g, '');
  function bigramSet(text) {
    const chars = [...text];
    if (chars.length < 2) return new Set(chars);
    const out = new Set();
    for (let i = 0; i < chars.length - 1; i++) out.add(chars[i] + chars[i + 1]);
    return out;
  }
  // 0~1 的相近程度：完全相同 1；一方包含另一方 0.86；否则按二元组重合度。
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
  function get(word, sense) {
    let key = wordKey(word);
    const wanted = senseKey(sense);
    if (!Object.hasOwn(data, key)) key = globalThis.ShiciMeanings?.lookupDetailed(word).key || key;
    if (!Object.hasOwn(data, key)) return null;
    let best = null, bestScore = 0;
    for (const [names, en, zh, note] of data[key]) {
      const aliases = names.split('|'), primary = senseKey(aliases[0]);
      for (const name of aliases) {
        const alias = senseKey(name);
        if (wanted.body === alias.body && (!wanted.pos || wanted.pos === (alias.pos || primary.pos))) return { sense, en, zh, note };
        // 词性明确冲突的义项不参与近似匹配，免得把动词例句配给名词释义。
        const aliasPos = alias.pos || primary.pos;
        if (wanted.pos && aliasPos && wanted.pos !== aliasPos) continue;
        const score = senseScore(looseText(wanted.body), looseText(alias.body));
        if (score > bestScore) { bestScore = score; best = { sense, en, zh, note }; }
      }
    }
    // 释义写得更长或换了个说法（「系统地做事」对「系统地」）时也取最接近的义项，不白丢例句。
    return bestScore >= 0.55 ? best : null;
  }
  const draftKey = (word, sense) => JSON.stringify([wordKey(word), senseKey(sense)]);
  function savedSenses(meaning) {
    const separated = meaning.replace(/(?<=[\u4e00-\u9fff.])\/(?=[\u4e00-\u9fff])/g, '；');
    return (globalThis.ShiciMeanings?.splitSenses(separated) || separated.split(/[；;\n]/).map(s => s.trim()).filter(Boolean)).filter(sense => !/^[.。…\s]+$/.test(sense));
  }
  function resolved(word, sense, custom = []) {
    const wanted = senseKey(sense);
    const saved = custom.find(item => {
      const candidate = senseKey(item.sense);
      return candidate.body === wanted.body && candidate.pos === wanted.pos;
    });
    return saved || get(word, sense);
  }
  function exampleBlock(example) {
    // 没有本地例句就什么都不渲染，不再输出「暂无例句」占位文字。
    if (!example) return null;
    const box = document.createElement('div'); box.className = 'sense-example';
    const en = document.createElement('p'); en.lang = 'en'; en.className = 'example-en'; en.textContent = example.en;
    const zh = document.createElement('p'); zh.className = 'example-zh'; zh.textContent = example.zh;
    box.append(en); if (example.zh) box.append(zh);
    if (example.note) { const note = document.createElement('p'); note.className = 'example-note'; note.textContent = example.note; box.append(note); }
    return box;
  }
  function editor(word, sense, example, onSave) {
    const details = document.createElement('details'); details.className = 'example-editor';
    const summary = document.createElement('summary'); summary.textContent = '自定义例句（可选）';
    const enLabel = document.createElement('label'); enLabel.textContent = '英文例句';
    const en = document.createElement('textarea'); en.lang = 'en'; en.rows = 2; en.maxLength = 1000; en.value = example?.en || ''; en.placeholder = '写一句体现这个意思的英文'; enLabel.append(en);
    const zhLabel = document.createElement('label'); zhLabel.textContent = '中文翻译';
    const zh = document.createElement('textarea'); zh.rows = 2; zh.maxLength = 1000; zh.value = example?.zh || ''; zh.placeholder = '对应的中文翻译'; zhLabel.append(zh);
    const save = document.createElement('button'); save.type = 'button'; save.className = 'example-save'; save.textContent = '保存这条例句';
    const feedback = document.createElement('p'); feedback.className = 'example-feedback'; feedback.setAttribute('role', 'status');
    save.addEventListener('click', () => {
      if (!en.value.trim() || !zh.value.trim()) { feedback.textContent = '请把英文例句和中文翻译都填上。'; return; }
      if (en.value.length > 1000 || zh.value.length > 1000) { feedback.textContent = '英文和中文各限 1000 字，请先整理。'; return; }
      onSave({ sense, en: en.value.trim(), zh: zh.value.trim() });
    });
    details.append(summary, enLabel, zhLabel, save, feedback); return details;
  }
  function renderGroups(word, meaning, custom = [], onSave) {
    const box = document.createElement('div'); box.className = 'sense-groups';
    for (const sense of savedSenses(meaning)) {
      const group = document.createElement('div'); group.className = 'sense-group';
      const label = document.createElement('p'); label.className = 'sense-title'; label.textContent = sense;
      const example = resolved(word, sense, custom);
      group.append(label);
      const block = exampleBlock(example);
      if (block) group.append(block);
      if (onSave) group.append(editor(word, sense, example, item => onSave(item)));
      box.append(group);
    }
    return box;
  }
  function draftExamples(word, meaning) {
    return savedSenses(meaning).map(sense => drafts.get(draftKey(word, sense))).filter(Boolean);
  }
  function renderSaved(entry) {
    // 词库里默认只留一行入口，点开才渲染例句与「写例句」，没有例句也不会多出空行。
    const details = document.createElement('details'); details.className = 'saved-examples';
    const summary = document.createElement('summary');
    // 有例句就显示「例句」，纯无例句的词只给「写例句」，避免让人以为有内容可看。
    const hasAny = savedSenses(entry.meaning).some(sense => resolved(entry.word, sense, entry.examples || []));
    summary.textContent = hasAny ? '例句 / 写例句' : '写例句';
    const body = document.createElement('div'); body.className = 'saved-examples-body';
    let built = false;
    details.addEventListener('toggle', () => {
      if (!details.open || built) return;
      built = true;
      body.append(renderGroups(entry.word, entry.meaning, entry.examples || [], example => {
        document.dispatchEvent(new CustomEvent('shici-save-example', { detail: { id: entry.id, example } }));
      }));
    });
    details.append(summary, body);
    return details;
  }
  function supportsRemoteWord(word) {
    const key = wordKey(word);
    return key.length <= 45 && /^[a-z]+(?:[-'][a-z]+)*$/i.test(key);
  }
  const isExtendedWord = word => !Object.hasOwn(original, wordKey(word)) && Object.hasOwn(extensions, wordKey(word));
  const stats = () => ({ words: Object.keys(data).length, senseGroups: Object.values(data).reduce((count, rows) => count + rows.length, 0) });
  globalThis.ShiciExamples = { wordKey, senseKey, referenceSenses, isExtendedWord, stats, get, resolved, savedSenses, supportsRemoteWord, exampleBlock, renderSaved, draftExamples };
  function renderDraft() {
    const target = $('draft-examples');
    if (!target) return;
    target.replaceChildren();
    const word = $('word').value, meaning = $('meaning').value;
    if (!word.trim() || !meaning.trim()) { target.hidden = true; return; }
    target.hidden = false;
    const title = document.createElement('h3'); title.textContent = '本次释义与例句';
    const note = document.createElement('p'); note.className = 'draft-examples-note'; note.textContent = '例句自动提供；自定义修改是可选的。点击“加入我的词库”保存单词。';
    const groups = renderGroups(word, meaning, draftExamples(word, meaning), item => {
      // The editor may be open when the input changes; bind it to its own word.
      if (word !== $('word').value || meaning !== $('meaning').value) { renderDraft(); return; }
      drafts.set(draftKey(word, item.sense), item); renderDraft();
    });
    target.append(title, note, groups);
  }
  if ($('word')) {
    $('word').addEventListener('input', renderDraft);
    $('meaning').addEventListener('input', renderDraft);
    $('add-form').addEventListener('reset', () => { drafts.clear(); $('draft-examples').replaceChildren(); $('draft-examples').hidden = true; });
    renderDraft();
  }
})();
