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
  function get(word, sense) {
    let key = wordKey(word);
    const wanted = senseKey(sense);
    if (!Object.hasOwn(data, key)) key = globalThis.ShiciMeanings?.lookupDetailed(word).key || key;
    if (!Object.hasOwn(data, key)) return null;
    for (const [names, en, zh, note] of data[key]) {
      const aliases = names.split('|'), primary = senseKey(aliases[0]);
      const found = aliases.some(name => {
        const alias = senseKey(name);
        return wanted.body === alias.body && (!wanted.pos || wanted.pos === (alias.pos || primary.pos));
      });
      if (found) return { sense, en, zh, note };
    }
    return null;
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
  function exampleBlock(example, word = '') {
    const box = document.createElement('div'); box.className = 'sense-example';
    if (example) {
      const en = document.createElement('p'); en.lang = 'en'; en.className = 'example-en'; en.textContent = example.en;
      const zh = document.createElement('p'); zh.className = 'example-zh'; zh.textContent = example.zh;
      box.append(en); if (example.zh) box.append(zh);
      if (example.note) { const note = document.createElement('p'); note.className = 'example-note'; note.textContent = example.note; box.append(note); }
    } else {
      const empty = document.createElement('p'); empty.className = 'example-missing';
      empty.textContent = word && !supportsRemoteWord(word) ? '此短语暂无本地例句；当前网络查询不支持完整短语。' : '此义项暂无本地例句。请在上方学习卡片选中该词，翻面后查看可用例句。';
      box.append(empty);
    }
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
      group.append(label, exampleBlock(example, word));
      if (onSave) group.append(editor(word, sense, example, item => onSave(item)));
      box.append(group);
    }
    return box;
  }
  function draftExamples(word, meaning) {
    return savedSenses(meaning).map(sense => drafts.get(draftKey(word, sense))).filter(Boolean);
  }
  function renderSaved(entry) {
    return renderGroups(entry.word, entry.meaning, entry.examples || [], example => {
      document.dispatchEvent(new CustomEvent('shici-save-example', { detail: { id: entry.id, example } }));
    });
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
